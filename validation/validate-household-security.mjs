import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
ok(source.includes('const APP_VERSION = "V22.8.16-KAKAO-EDIT-FLOW-V4"'), "runtime reports the V22.8.16 release");
ok(source.includes('qs.set("prompt", "login")'), "Kakao deletion reauthentication forces an explicit login prompt");
ok(source.includes('purpose: "household-delete"'), "deletion reauthentication token is purpose-bound");
ok(source.includes('household_id: String(householdId'), "deletion reauthentication token is household-bound");

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

console.log(`smoke_household_security_separation: ${checks} checks passed`);
