import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
ok(source.includes('const APP_VERSION = "V22.8.68-TAP-TARGET-ACCESSIBILITY"'), "runtime reports the challenge and activity UX release");
ok(source.includes('qs.set("prompt", "login")'), "Kakao deletion reauthentication forces an explicit login prompt");
ok(source.includes('purpose: "household-delete"'), "deletion reauthentication token is purpose-bound");
ok(source.includes('household_id: String(householdId'), "deletion reauthentication token is household-bound");
ok(source.includes('if (requestedId && !requested) return { households, memberships, selected: null'), "explicit unknown household ids never fall back to the first readable household");

function formBody(values) {
  return new URLSearchParams(values);
}

function skillPayload({ utterance, userKey = "kakao_login:2265", groupKey = "group-v2289" }) {
  return {
    intent: { id: "qa-transaction", name: "기록" },
    userRequest: {
      timezone: "Asia/Seoul",
      params: {},
      block: { id: "qa-transaction", name: "기록" },
      utterance,
      lang: "ko",
      user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey, botGroupKey: groupKey } },
    },
    bot: { id: "qa-bot", name: "똑똑한가계부" },
    action: { id: "qa-action", name: "기록", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  };
}

async function callSkill(fixture, payload) {
  const response = await app.fetch(new Request("https://ttokttok-accountbook.com/skill", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  }), fixture.env, {});
  return { response, data: JSON.parse(await response.text()) };
}

function kakaoText(data) {
  return (data?.template?.outputs || []).map((output) => output?.simpleText?.text || "").join("\n");
}

function cookiePairs(headers) {
  return headers.getSetCookie().map((value) => value.split(";", 1)[0]).filter((value) => !value.endsWith("="));
}

const fixture = await createV2265QaFixture();
try {
  const pageResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/households?month=2026-07&household_id=house-home&manage=house-home", {
    headers: { cookie: fixture.cookie },
  }), fixture.env, {});
  eq(pageResponse.status, 200, "household management page renders");
  const pageHtml = await pageResponse.text();
  ok(pageHtml.includes("가계부 비밀번호는 없습니다"), "page states the household-password model directly");
  ok(pageHtml.includes("가계부 자체에는 비밀번호가 없고"), "hero separates household data from account login security");
  ok(pageHtml.includes("내 계정·보안"), "account security has one global entry point");
  ok(pageHtml.includes("카카오 계정으로 본인 확인"), "Kakao-only owner receives a method-aware deletion check");
  const createForm = (pageHtml.match(/<form method="post" action="\/my\/create">([\s\S]*?)<\/form>/) || [])[1] || "";
  ok(createForm, "household creation form exists");
  ok(!createForm.includes('name="access_code"'), "household creation never asks for a password");
  ok(!createForm.includes('name="login_name"'), "household creation never creates an account login identity");

  const householdCount = fixture.db.households.length;
  const identityCount = fixture.db.accountbook_user_identities.length;
  const createResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/create", {
    method: "POST",
    headers: { cookie: fixture.cookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({ household_name: "비밀번호 없는 새 가계부", display_name: "Bin" }),
  }), fixture.env, {});
  eq(createResponse.status, 303, "password-free household creation succeeds");
  ok(createResponse.headers.get("location")?.includes("msg=created"), "creation redirects to the invite stage");
  eq(fixture.db.households.length, householdCount + 1, "one household is created");
  eq(fixture.db.accountbook_user_identities.length, identityCount, "creation does not add or replace a login identity");
} finally {
  fixture.restore();
}

const sessionSecurityFixture = await createV2265QaFixture();
try {
  sessionSecurityFixture.db.__fail_user_security_reads = true;
  const blockedSession = await app.fetch(new Request("https://ttokttok-accountbook.com/app?month=2026-07&household_id=house-home", {
    headers: { cookie: sessionSecurityFixture.cookie },
  }), sessionSecurityFixture.env, {});
  eq(blockedSession.status, 303, "session verification fails closed when revocation state cannot be read");
  eq(blockedSession.headers.get("location"), "/my", "unverified session returns to login instead of exposing household data");
} finally {
  sessionSecurityFixture.restore();
}

const explicitScopeFixture = await createV2265QaFixture();
try {
  const memberCookie = await explicitScopeFixture.cookieFor("user-wifi");
  const beforeTransactions = explicitScopeFixture.db.transactions.length;
  const foreignWrite = await app.fetch(new Request("https://ttokttok-accountbook.com/my/transactions", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      household_id: "house-trip",
      month: "2026-07",
      type: "expense",
      transaction_date: "2026-07-28",
      amount: "12345",
      memo: "foreign-target-probe",
      category: "기타",
    }),
  }), explicitScopeFixture.env, {});
  eq(foreignWrite.status, 303, "foreign household write is rejected without a server error");
  ok(foreignWrite.headers.get("location")?.includes("err=no_household"), "foreign household write returns an explicit no-household result");
  eq(explicitScopeFixture.db.transactions.length, beforeTransactions, "foreign household write creates no transaction in the user's default household");
  ok(!explicitScopeFixture.db.transactions.some((item) => item.memo === "foreign-target-probe"), "foreign household payload is not persisted anywhere");

  const foreignManagePage = await app.fetch(new Request("https://ttokttok-accountbook.com/my/households?month=2026-07&manage=house-trip", {
    headers: { cookie: memberCookie },
  }), explicitScopeFixture.env, {});
  eq(foreignManagePage.status, 200, "foreign household management link renders the safe household list");
  const foreignManageHtml = await foreignManagePage.text();
  ok(!foreignManageHtml.includes('id="manage"'), "foreign household management link never opens the default household controls");

  const foreignSettlement = await app.fetch(new Request("https://ttokttok-accountbook.com/settlement-summary?month=2026-07&household_id=house-trip", {
    headers: { cookie: memberCookie },
  }), explicitScopeFixture.env, {});
  eq(foreignSettlement.status, 303, "foreign household read is rejected without dereferencing a fallback household");
  ok(foreignSettlement.headers.get("location")?.includes("err=household_required"), "foreign household read returns an explicit selection error");
} finally {
  explicitScopeFixture.restore();
}

const operationsAuthFixture = await createV2265QaFixture();
try {
  Object.assign(operationsAuthFixture.env, {
    CRON_SECRET: "qa-cron-secret",
    ADMIN_API_TOKEN: "qa-admin-token",
  });
  const legacyGetCron = await app.fetch(new Request("https://ttokttok-accountbook.com/cron/recurring/apply?key=qa-cron-secret"), operationsAuthFixture.env, {});
  eq(legacyGetCron.status, 404, "state-changing cron route no longer accepts GET requests");

  const querySecretCron = await app.fetch(new Request("https://ttokttok-accountbook.com/cron/recurring/apply?key=qa-cron-secret", {
    method: "POST",
  }), operationsAuthFixture.env, {});
  eq(querySecretCron.status, 401, "cron secret in the URL query is rejected");

  const headerSecretCron = await app.fetch(new Request("https://ttokttok-accountbook.com/cron/recurring/apply?month=2026-07", {
    method: "POST",
    headers: { "x-cron-secret": "qa-cron-secret" },
  }), operationsAuthFixture.env, {});
  ok(headerSecretCron.status !== 401, "cron secret in the dedicated header authenticates the scheduler request");

  const querySecretOps = await app.fetch(new Request("https://ttokttok-accountbook.com/ops-snapshot.json?key=qa-cron-secret"), operationsAuthFixture.env, {});
  eq(querySecretOps.status, 401, "cron query secret cannot open the administrator operations snapshot");

  const adminTokenOps = await app.fetch(new Request("https://ttokttok-accountbook.com/ops-snapshot.json", {
    headers: { authorization: "Bearer qa-admin-token" },
  }), operationsAuthFixture.env, {});
  eq(adminTokenOps.status, 200, "administrator bearer token still opens the operations snapshot");

  const healthResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/health"), operationsAuthFixture.env, {});
  eq(healthResponse.status, 200, "liveness endpoint stays available while dependency readiness is checked separately");
  const health = await healthResponse.json();
  eq(health.status, "alive", "health endpoint reports process liveness explicitly");
  ok(!Object.hasOwn(health, "ready"), "health endpoint never claims database readiness without dependency checks");

  operationsAuthFixture.env.ADMIN_SESSION_SECRET = "qa-admin-session";
  const readyResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/ready"), operationsAuthFixture.env, {});
  eq(readyResponse.status, 503, "readiness endpoint fails closed when a required RPC is absent");
  const readiness = await readyResponse.json();
  eq(readiness.checked_rpcs, 17, "readiness endpoint checks required authentication, write, and asset mutation RPCs");
  ok(readiness.missing_rpcs.includes("accountbook_set_local_identity_v227"), "readiness response identifies a missing required RPC");

  const missingRpcFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const rpcUrl = new URL(typeof input === "string" ? input : input.url);
    if (rpcUrl.hostname === "mock.supabase.co" && /\/rest\/v1\/rpc\/accountbook_/.test(rpcUrl.pathname)) {
      const probe = init.body ? JSON.parse(String(init.body)) : {};
      if (Object.keys(probe).length > 0) {
        return new Response(JSON.stringify({ code: "22P02", message: "invalid input syntax for type uuid: readiness-invalid-uuid" }), { status: 400, headers: { "content-type": "application/json" } });
      }
    }
    return missingRpcFetch(input, init);
  };
  try {
    const signatureReadyResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/ready"), operationsAuthFixture.env, {});
    eq(signatureReadyResponse.status, 200, "readiness accepts validation errors after PostgREST resolves the real RPC parameter signature");
    const signatureReadiness = await signatureReadyResponse.json();
    eq(signatureReadiness.missing_rpcs.length, 0, "signature-based readiness does not misclassify parameterized RPCs as missing");
  } finally {
    globalThis.fetch = missingRpcFetch;
  }
} finally {
  operationsAuthFixture.restore();
}

const memberRoleFixture = await createV2265QaFixture();
try {
  const target = memberRoleFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi");
  target.role = "pending";
  const updateResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/admin/member/update", {
    method: "POST",
    headers: { cookie: memberRoleFixture.cookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      household_id: "house-home",
      user_id: "user-wifi",
      role: "admin",
      return_to: "/my/members?month=2026-07&household_id=house-home",
    }),
  }), memberRoleFixture.env, {});
  eq(updateResponse.status, 303, "pending member can be promoted without a Worker exception");
  ok(updateResponse.headers.get("location")?.includes("msg=member_updated"), "successful member role update returns an explicit completion message");
  eq(memberRoleFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi")?.role, "admin", "pending member is persisted as an administrator");

  memberRoleFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi").role = "pending";
  const invalidRoleResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/admin/member/update", {
    method: "POST",
    headers: { cookie: memberRoleFixture.cookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      household_id: "house-home",
      user_id: "user-wifi",
      role: "superadmin",
      return_to: "/my/members?month=2026-07&household_id=house-home",
    }),
  }), memberRoleFixture.env, {});
  eq(invalidRoleResponse.status, 303, "unknown member role is rejected without a Worker exception");
  ok(invalidRoleResponse.headers.get("location")?.includes("err="), "unknown member role returns an inline error");
  eq(memberRoleFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi")?.role, "pending", "unknown member role never silently demotes or promotes the member");
} finally {
  memberRoleFixture.restore();
}

const memberRoleFailureFixture = await createV2265QaFixture();
try {
  const target = memberRoleFailureFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi");
  target.role = "pending";
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const targetUrl = new URL(typeof input === "string" ? input : input.url);
    if (targetUrl.hostname === "mock.supabase.co" && targetUrl.pathname === "/rest/v1/household_members" && String(init.method || "GET").toUpperCase() === "PATCH") {
      return new Response(JSON.stringify({ code: "23514", message: "new row violates check constraint" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const failureResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/admin/member/update", {
      method: "POST",
      headers: { cookie: memberRoleFailureFixture.cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        household_id: "house-home",
        user_id: "user-wifi",
        role: "admin",
        return_to: "/my/members?month=2026-07&household_id=house-home",
      }),
    }), memberRoleFailureFixture.env, {});
    eq(failureResponse.status, 303, "database role constraint failure is contained without Error 1101");
    ok(failureResponse.headers.get("location")?.includes("err="), "database role constraint failure returns an inline error");
    ok(!failureResponse.headers.get("location")?.includes("msg=member_updated"), "failed role update never reports success");
    eq(memberRoleFailureFixture.db.household_members.find((item) => item.household_id === "house-home" && item.user_id === "user-wifi")?.role, "pending", "failed role update preserves the existing pending state");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  memberRoleFailureFixture.restore();
}

const leaveFixture = await createV2265QaFixture();
try {
  const memberCookie = await leaveFixture.cookieFor("user-wifi");
  const leavePage = await app.fetch(new Request("https://ttokttok-accountbook.com/my/households?month=2026-07&household_id=house-home&manage=house-home", {
    headers: { cookie: memberCookie },
  }), leaveFixture.env, {});
  const leaveHtml = await leavePage.text();
  const leaveForm = (leaveHtml.match(/<form method="post" action="\/my\/household\/leave"([\s\S]*?)<\/form>/) || [])[1] || "";
  ok(leaveForm, "member leave form exists");
  ok(!leaveForm.includes('name="access_code"'), "leaving a household does not ask for an unrelated account password");
  const existingRecords = leaveFixture.db.transactions.filter((item) => item.user_id === "user-wifi").length;
  const leaveResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/household/leave", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({ household_id: "house-home", month: "2026-07", understand_history: "1" }),
  }), leaveFixture.env, {});
  eq(leaveResponse.status, 303, "member can leave using the current signed-in session and explicit acknowledgement");
  ok(leaveResponse.headers.get("location")?.includes("msg=household_left"), "leave action returns an explicit completion message");
  ok(!leaveFixture.db.household_members.some((item) => item.household_id === "house-home" && item.user_id === "user-wifi"), "only the member relationship is removed");
  eq(leaveFixture.db.transactions.filter((item) => item.user_id === "user-wifi").length, existingRecords, "historical transactions remain after leaving");
} finally {
  leaveFixture.restore();
}

const groupFixture = await createV2265QaFixture();
try {
  const before = groupFixture.db.transactions.length;
  const first = await callSkill(groupFixture, skillPayload({ utterance: "점심 12000원 국민카드", groupKey: "deleted-link-with-other-households" }));
  eq(first.response.status, 200, "unlinked group transaction request succeeds safely");
  eq(groupFixture.db.transactions.length, before, "unlinked group input creates zero transactions when other households exist");
  ok(kakaoText(first.data).includes("기존 연결 가계부가 삭제됐거나"), "group response explains the deleted-link case");
  ok(kakaoText(first.data).includes("어디에도 저장하지 않았어요"), "group response explicitly confirms zero storage");

  groupFixture.db.household_members = groupFixture.db.household_members.filter((item) => item.user_id !== "user-bin");
  const beforeEmpty = groupFixture.db.transactions.length;
  const empty = await callSkill(groupFixture, skillPayload({ utterance: "저녁 23000원 현금", groupKey: "deleted-link-no-households" }));
  eq(groupFixture.db.transactions.length, beforeEmpty, "unlinked group input creates zero transactions when the user has no households");
  ok(kakaoText(empty.data).includes("어디에도 저장하지 않았어요"), "no-household response no longer falls back to the generic creation greeting");
} finally {
  groupFixture.restore();
}

const staleFixture = await createV2265QaFixture();
try {
  staleFixture.db.accountbook_settings.push({
    id: "stale-group-map",
    key: "kakao_group_links",
    value: JSON.stringify({
      "stale-deleted-group": { group_key: "stale-deleted-group", household_id: "already-deleted-household", household_name: "삭제된 가계부", linked_by: "user-bin" },
    }),
  });
  const before = staleFixture.db.transactions.length;
  const stale = await callSkill(staleFixture, skillPayload({ utterance: "간식 5000원", groupKey: "stale-deleted-group" }));
  eq(staleFixture.db.transactions.length, before, "stale link to a deleted household creates zero transactions");
  ok(kakaoText(stale.data).includes("어디에도 저장하지 않았어요"), "stale-link response confirms that the attempted record was rejected");
  const savedMap = JSON.parse(staleFixture.db.accountbook_settings.find((item) => item.key === "kakao_group_links")?.value || "{}");
  ok(!Object.hasOwn(savedMap, "stale-deleted-group"), "stale group link is cleaned up automatically");
} finally {
  staleFixture.restore();
}

const reauthFixture = await createV2265QaFixture();
try {
  Object.assign(reauthFixture.env, {
    KAKAO_LOGIN_ENABLED: "1",
    KAKAO_REST_API_KEY: "qa-rest-api-key",
    KAKAO_REDIRECT_URI: "https://ttokttok-accountbook.com/auth/kakao/callback",
  });
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.href === "https://kauth.kakao.com/oauth/token") {
      return new Response(JSON.stringify({ access_token: "qa-access-token", token_type: "bearer" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.href === "https://kapi.kakao.com/v2/user/me") {
      return new Response(JSON.stringify({ id: 2265, properties: { nickname: "Bin" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };

  const returnTo = "/my/households?month=2026-07&household_id=house-home&manage=house-home#manage";
  const startResponse = await app.fetch(new Request(`https://ttokttok-accountbook.com/auth/kakao/start?reauth=household-delete&household_id=house-home&return_to=${encodeURIComponent(returnTo)}`, {
    headers: { cookie: reauthFixture.cookie },
  }), reauthFixture.env, {});
  eq(startResponse.status, 303, "Kakao deletion reauthentication starts");
  const authorizeUrl = new URL(startResponse.headers.get("location"));
  eq(authorizeUrl.searchParams.get("prompt"), "login", "Kakao authorization request forces reauthentication");
  const state = authorizeUrl.searchParams.get("state");
  ok(state, "OAuth state is generated");
  const oauthCookie = [reauthFixture.cookie, ...cookiePairs(startResponse.headers)].join("; ");
  const callbackResponse = await app.fetch(new Request(`https://ttokttok-accountbook.com/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, {
    headers: { cookie: oauthCookie },
  }), reauthFixture.env, {});
  eq(callbackResponse.status, 303, "matching Kakao account completes deletion reauthentication");
  ok(callbackResponse.headers.get("location")?.includes("msg=kakao_reauth_verified"), "callback returns an explicit verified state");
  const reauthCookie = cookiePairs(callbackResponse.headers).find((item) => item.startsWith("ab_household_delete_reauth="));
  ok(reauthCookie, "short-lived signed deletion token is issued");

  const verifiedCookie = [reauthFixture.cookie, reauthCookie].join("; ");
  const verifiedPage = await app.fetch(new Request(`https://ttokttok-accountbook.com${returnTo}`, { headers: { cookie: verifiedCookie } }), reauthFixture.env, {});
  const verifiedHtml = await verifiedPage.text();
  ok(verifiedHtml.includes("카카오 계정 본인 확인 완료"), "verified page unlocks the destructive form");
  const deleteResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/household/delete", {
    method: "POST",
    headers: { cookie: verifiedCookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody({ household_id: "house-home", month: "2026-07", confirm_name: "우리집 생활비", understand_members: "1" }),
  }), reauthFixture.env, {});
  eq(deleteResponse.status, 303, "verified owner can delete without inventing a household password");
  ok(deleteResponse.headers.get("location")?.includes("msg=household_deleted"), "deletion returns an explicit completion message");
  ok(!reauthFixture.db.households.some((item) => item.id === "house-home"), "household is removed by the atomic purge RPC");
  ok(!reauthFixture.db.transactions.some((item) => item.household_id === "house-home"), "household transactions are removed with the household");
  ok(deleteResponse.headers.getSetCookie().some((value) => value.startsWith("ab_household_delete_reauth=;")), "deletion consumes the reauthentication cookie");
} finally {
  reauthFixture.restore();
}


// V22.8.52: 카카오 스킬 IP 하한 가드, CSV 수식 인젝션, 웹 가계부 이름 검증
const auditFixture = await createV2265QaFixture();
try {
  const skillCall = async (utterance, botUserKey, ip, env) => {
    const response = await app.fetch(new Request("https://ttokttok-accountbook.com/skill", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({
        intent: { id: "i", name: "b" },
        userRequest: { timezone: "Asia/Seoul", block: { id: "b", name: "b" }, utterance, lang: "ko", user: { id: botUserKey, type: "botUserKey", properties: { botUserKey } } },
        bot: { id: "bot", name: "x" },
        action: { id: "a", name: "s", params: {}, detailParams: {}, clientExtra: {} },
        contexts: [],
      }),
    }), env, {});
    const payload = await response.json().catch(() => null);
    return String(payload?.template?.outputs?.[0]?.simpleText?.text || "");
  };
  const rateLimited = (text) => /잠시만요|잠시 후/.test(text);

  // botUserKey는 호출자가 정하므로 사용자별 제한만으로는 회전 공격을 막지 못한다.
  const guardedEnv = { ...auditFixture.env, SKILL_IP_GUARD_LIMIT: "60" };
  let rotationBlocked = 0;
  for (let index = 0; index < 80; index += 1) {
    if (rateLimited(await skillCall("도움말", `rotate-${index}`, "203.0.113.30", guardedEnv))) rotationBlocked += 1;
  }
  ok(rotationBlocked > 0, "skill IP guard limits botUserKey rotation from one address");
  ok(!rateLimited(await skillCall("도움말", "fresh-key", "198.51.100.30", guardedEnv)), "skill IP guard does not penalize a different address");
  let defaultBlocked = 0;
  for (let index = 0; index < 120; index += 1) {
    if (rateLimited(await skillCall("도움말", `default-${index}`, "203.0.113.31", auditFixture.env))) defaultBlocked += 1;
  }
  eq(defaultBlocked, 0, "default skill IP ceiling stays far above normal group-chatbot traffic");

  // CSV는 = + - @ 로 시작하는 셀을 스프레드시트가 수식으로 실행한다.
  const formulaMemos = ["=cmd|'/c calc'!A1", "@SUM(1+1)", "+1+1"];
  for (const [index, memo] of formulaMemos.entries()) {
    await app.fetch(new Request("https://ttokttok-accountbook.com/admin/transactions", {
      method: "POST",
      headers: { cookie: auditFixture.cookie, origin: "https://ttokttok-accountbook.com", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ household_id: "house-home", month: "2026-07", type: "expense", amount: "1000", memo, transaction_date: `2026-07-2${index}` }).toString(),
    }), auditFixture.env, {});
  }
  const csvResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/backup.csv?household_id=house-home&month=2026-07", { headers: { cookie: auditFixture.cookie } }), auditFixture.env, {});
  const csvBody = await csvResponse.text();
  const csvCells = csvBody.split(/\r?\n/).flatMap((line) => line.split(","));
  ok(csvCells.every((cell) => !/^"?[=+@\t\r]/.test(cell)), "CSV export neutralizes formula-leading cells");
  ok(csvBody.includes("'@SUM(1+1)"), "CSV export keeps the original text visible after the guard prefix");
  ok(/,1000,/.test(csvBody), "CSV export leaves numeric amounts untouched");

  // 카카오 대화용 종류 선택지 키워드가 웹 폼 이름 검증을 막지 않아야 한다.
  for (const householdName of ["가족 생활비", "생활비", "모임", "여행"]) {
    const created = await app.fetch(new Request("https://ttokttok-accountbook.com/my/create", {
      method: "POST",
      headers: { cookie: auditFixture.cookie, origin: "https://ttokttok-accountbook.com", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ household_name: householdName, display_name: "Bin" }).toString(),
    }), auditFixture.env, {});
    ok(!decodeURIComponent(created.headers.get("location") || "").includes("household_name_invalid"), `web household creation accepts "${householdName}"`);
  }
  for (const householdName of ["도움말", "1"]) {
    const created = await app.fetch(new Request("https://ttokttok-accountbook.com/my/create", {
      method: "POST",
      headers: { cookie: auditFixture.cookie, origin: "https://ttokttok-accountbook.com", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ household_name: householdName, display_name: "Bin" }).toString(),
    }), auditFixture.env, {});
    ok(decodeURIComponent(created.headers.get("location") || "").includes("household_name_invalid"), `web household creation still rejects "${householdName}"`);
  }
} finally {
  auditFixture.restore();
}

console.log(`smoke_household_security_separation: ${checks} checks passed`);
