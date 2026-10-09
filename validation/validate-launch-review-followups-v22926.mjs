// V22.9.26 code-review followups: settings RMW leases, strict JSON, bounded writes,
// next-week dates, safe query messages, import limits, and manual recurring guard.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, {
  addReservePlan,
  deleteReservePlan,
  fetchCategoryKeywordMap,
  fetchMemberAliasMap,
  fetchReservePlans,
  fetchUserIdentityLinks,
  formatMessage,
  isUncertainStorageWrite,
  ensureUser,
  normalizeImportedRecordDetailed,
  persistIdentityAliases,
  purgeHouseholdData,
  resolveWeekdayPhrase,
  saveMemberAlias,
  setCategoryKeywords,
} from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const rejects = async (promise, predicate, message) => { await assert.rejects(promise, predicate); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const BASE = "https://malhaebook.com";
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const setting = (db, key) => db.accountbook_settings.find((item) => item.key === key);
const rpcCount = (db, name) => db.__rpc_calls.filter((item) => item.name === name).length;

function upsertSetting(db, key, value) {
  const existing = setting(db, key);
  if (existing) existing.value = value;
  else db.accountbook_settings.push({ id: `qa-${key}`, key, value, created_at: new Date().toISOString() });
}

async function call(fixture, method, path, { body, cookie = fixture.cookie, accept = BROWSER_ACCEPT, contentType = "application/x-www-form-urlencoded" } = {}) {
  const headers = { accept };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = contentType;
  if (method !== "GET") {
    headers.origin = BASE;
    headers.referer = `${BASE}/app?month=2026-07&household_id=house-home`;
    headers["sec-fetch-site"] = "same-origin";
  }
  return app.fetch(new Request(BASE + path, { method, headers, body }), fixture.env, { waitUntil() {} });
}

// Static contracts that prevent a superficially passing but incomplete implementation.
ok(source.includes('return await handlePublicContentPage(request, env, url, "home")'), "public home inline branch awaits the handler");
ok(source.includes("if (userId) return await handleHouseholdUserPage"), "/households user inline branch awaits the handler");
ok(source.includes("household-settings-rmw:${hid}") && source.includes('"settings-rmw:user_identity_links"'), "household and global settings use the documented lease keys");
ok(!source.includes("const aliasSnapshots = []"), "identity merge no longer saves pre-merge alias snapshots");
ok(source.includes("for (const hid of aliasHouseholdIds)") && source.includes("fetchMemberAliasMap(env, hid, { strict: true })"), "identity merge rereads aliases under sequential household locks");
ok(!source.includes("[...plan.values()].slice(0, 100)"), "budget plan is not silently truncated");
ok(source.includes('if (rows.length > 100) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_plan_too_many" }))'), "budget plan rejects more than 100 normalized entries before RPC");
ok(!source.includes("unsafeMonthEndRules") && source.includes("V22.9.29 requires the month-end RPC patch"), "manual recurring apply uses the repaired month-end RPC after SQL-first deployment");
ok(source.includes("settings_rmw_lease_expired") && source.includes("locked_until"), "settings writes check the observed lease expiry before mutation");
ok(source.includes("category_created_keywords_pending"), "category creation reports partial success instead of invoking duplicate fallback");

// Strict JSON readers and household settings leases.
{
  const fixture = await createV2265QaFixture();
  try {
    const { db, env } = fixture;
    upsertSetting(db, "category_keywords:house-home", "{broken");
    const beforeMalformed = db.__settings_write_count;
    await rejects(setCategoryKeywords(env, "house-home", "expense", "식비", ["점심"]), (err) => err?.name === "SettingsDataError" && err?.code === "settings_data_invalid", "malformed category JSON is a typed safe failure");
    eq(db.__settings_write_count, beforeMalformed, "malformed category JSON causes zero settings writes");
    eq(setting(db, "category_keywords:house-home").value, "{broken", "malformed category value is preserved");

    upsertSetting(db, "category_keywords:house-home", "[]");
    await rejects(fetchCategoryKeywordMap(env, "house-home", { strict: true }), (err) => err?.name === "SettingsDataError", "category keyword strict reader rejects an array top level");
    upsertSetting(db, "reserve_plans:house-home", "{}");
    await rejects(fetchReservePlans(env, "house-home", { strict: true }), (err) => err?.name === "SettingsDataError", "reserve strict reader rejects a destructive object top level");
    upsertSetting(db, "member_aliases:house-home", "[]");
    await rejects(fetchMemberAliasMap(env, "house-home", { strict: true }), (err) => err?.name === "SettingsDataError", "member alias strict reader rejects an array top level");
    upsertSetting(db, "user_identity_links", "[]");
    await rejects(fetchUserIdentityLinks(env), (err) => err?.name === "SettingsDataError", "global identity strict reader rejects an array top level");

    upsertSetting(db, "reserve_plans:house-home", "{broken");
    const reserveWrites = db.__settings_write_count;
    await rejects(addReservePlan(env, "house-home", { name: "보험", amount: 10000 }), (err) => err?.name === "SettingsDataError", "reserve mutation rejects malformed JSON");
    eq(db.__settings_write_count, reserveWrites, "malformed reserve JSON causes zero writes");
    eq(setting(db, "reserve_plans:house-home").value, "{broken", "malformed reserve value is preserved");

    upsertSetting(db, "member_aliases:house-home", "{broken");
    const aliasWrites = db.__settings_write_count;
    await rejects(saveMemberAlias(env, "house-home", "user-bin", "새이름"), (err) => err?.name === "SettingsDataError", "alias mutation rejects malformed JSON");
    eq(db.__settings_write_count, aliasWrites, "malformed alias JSON causes zero writes");
    eq(setting(db, "member_aliases:house-home").value, "{broken", "malformed alias value is preserved");

    upsertSetting(db, "user_identity_links", "{broken");
    const identityWrites = db.__settings_write_count;
    await rejects(persistIdentityAliases(env, ["skill_identity:new"], "user-bin", "skill"), (err) => err?.name === "IdentityAliasPersistenceError" && /malformed_json/.test(String(err.message || "")), "identity alias persistence propagates a typed malformed-JSON failure");
    eq(db.__settings_write_count, identityWrites, "malformed identity JSON causes zero writes");
    eq(setting(db, "user_identity_links").value, "{broken", "malformed identity value is preserved");

    upsertSetting(db, "category_keywords:house-home", JSON.stringify({ "expense::식비": ["기존"] }));
    db.accountbook_operation_locks = db.accountbook_operation_locks.filter((item) => item.operation_key !== "household-settings-rmw:house-home");
    db.accountbook_operation_locks.push({ operation_key: "household-settings-rmw:house-home", owner: "external", locked_until: new Date(Date.now() + 60000).toISOString(), updated_at: new Date().toISOString() });
    const busyWrites = db.__settings_write_count;
    await rejects(setCategoryKeywords(env, "house-home", "expense", "교통", ["버스"]), /settings_rmw_busy/, "external lease owner makes the mutation fail closed");
    eq(db.__settings_write_count, busyWrites, "busy external owner causes zero settings writes");

    db.accountbook_operation_locks.find((item) => item.operation_key === "household-settings-rmw:house-home").locked_until = new Date(Date.now() - 1000).toISOString();
    await setCategoryKeywords(env, "house-home", "expense", "교통", ["버스"]);
    let keywordMap = JSON.parse(setting(db, "category_keywords:house-home").value);
    eq(keywordMap["expense::식비"][0], "기존", "expired lease retry preserves the previous keyword entry");
    eq(keywordMap["expense::교통"][0], "버스", "expired lease retry saves the new keyword entry");
    await setCategoryKeywords(env, "house-home", "expense", "카페/간식", ["커피"]);
    keywordMap = JSON.parse(setting(db, "category_keywords:house-home").value);
    eq(Object.keys(keywordMap).length, 3, "sequential retry unions all keyword entries without lost update");

    db.__operation_rpc_available = false;
    const unavailableWrites = db.__settings_write_count;
    await rejects(setCategoryKeywords(env, "house-home", "expense", "쇼핑", ["옷"]), /database operation lease is unavailable/, "unavailable lease RPC fails closed");
    eq(db.__settings_write_count, unavailableWrites, "unavailable lease RPC causes zero settings writes");
    db.__operation_rpc_available = true;

    db.__fail_next_operation_release = true;
    const beforeReleaseFailureWrites = db.__settings_write_count;
    const beforeReleaseFailureClaims = db.__operation_claim_count;
    await setCategoryKeywords(env, "house-home", "expense", "의료/병원", ["약국"]);
    eq(db.__settings_write_count, beforeReleaseFailureWrites + 1, "release failure does not replay an uncertain completed settings write");
    eq(db.__operation_claim_count, beforeReleaseFailureClaims + 1, "release failure does not reacquire and repeat the operation");
    db.accountbook_operation_locks.find((item) => item.operation_key === "household-settings-rmw:house-home").locked_until = new Date(Date.now() - 1000).toISOString();
    upsertSetting(db, "reserve_plans:house-home", JSON.stringify([{ id: "reserve-1", name: "보험", amount: 10000 }]));

    const missingDeleteWrites = db.__settings_write_count;
    await rejects(deleteReservePlan(env, "house-home", "missing-plan"), /reserve_plan_not_found/, "missing reserve deletion reports failure");
    eq(db.__settings_write_count, missingDeleteWrites, "missing reserve deletion performs zero writes");
  } finally {
    fixture.restore();
  }
}

// Purge and queued alias mutation share the household lease, so settings cannot resurrect.
{
  const fixture = await createV2265QaFixture();
  try {
    let releasePurge;
    let purgeReached;
    const purgeGate = new Promise((resolve) => { releasePurge = resolve; });
    const purgeStarted = new Promise((resolve) => { purgeReached = resolve; });
    fixture.db.__before_rpc = async (name) => {
      if (name === "accountbook_purge_household_v227") {
        purgeReached();
        await purgeGate;
      }
    };
    const purgePromise = purgeHouseholdData(fixture.env, "house-home");
    await purgeStarted;
    const aliasPromise = saveMemberAlias(fixture.env, "house-home", "user-bin", "삭제뒤별명");
    releasePurge();
    await purgePromise;
    await rejects(aliasPromise, /settings_rmw_household_missing/, "queued alias save rejects a household deleted by purge");
    ok(!fixture.db.households.some((item) => item.id === "house-home"), "purge removes the household row");
    ok(!fixture.db.accountbook_settings.some((item) => item.key === "member_aliases:house-home"), "queued alias save does not resurrect deleted settings");
  } finally {
    fixture.restore();
  }
}

// Identity aliases propagate required failures, repair later requests, and canonicalize late merge writers.
{
  const fixture = await createV2265QaFixture();
  try {
    const { db, env } = fixture;
    upsertSetting(db, "user_identity_links", JSON.stringify({}));
    db.accountbook_operation_locks.push({ operation_key: "settings-rmw:user_identity_links", owner: "external", locked_until: new Date(Date.now() + 60000).toISOString(), updated_at: new Date().toISOString() });
    const busyWrites = db.__settings_write_count;
    const busyClaims = db.__operation_claim_count;
    await rejects(ensureUser(env, "kakao_login:2265", "Bin", ["kakao_login:busy-alt"]), (err) => err?.name === "IdentityAliasPersistenceError" && /settings_rmw_busy/.test(String(err.message || "")), "required existing-user alias persistence propagates external lease busy after bounded retries");
    eq(db.__operation_claim_count, busyClaims + 3, "identity busy handling performs exactly three bounded lease attempts");
    eq(db.__settings_write_count, busyWrites, "identity busy failure performs zero settings writes");

    db.accountbook_operation_locks.find((item) => item.operation_key === "settings-rmw:user_identity_links").locked_until = new Date(Date.now() - 1000).toISOString();
    let user = await ensureUser(env, "kakao_login:2265", "Bin", ["kakao_login:busy-alt"]);
    eq(user.id, "user-bin", "existing raw user retry returns the current effective user");
    let links = JSON.parse(setting(db, "user_identity_links").value);
    eq(links["kakao_login:busy-alt"].user_id, "user-bin", "later existing-user request repairs the missing alternate alias");

    db.__fail_next_settings_write = true;
    const transportWrites = db.__settings_write_count;
    await rejects(ensureUser(env, "kakao_login:2265", "Bin", ["kakao_login:transport-alt"]), (err) => err?.name === "IdentityAliasPersistenceError" && isUncertainStorageWrite(err) && /QA_SETTINGS_WRITE_FAILED/.test(String(err.cause?.cause?.message || "")), "identity transport write failure propagates as typed failure without false success");
    eq(db.__settings_write_count, transportWrites + 1, "transport failure attempts the required settings write only once");
    user = await ensureUser(env, "kakao_login:2265", "Bin", ["kakao_login:transport-alt"]);
    links = JSON.parse(setting(db, "user_identity_links").value);
    eq(user.id, "user-bin", "existing user succeeds after transport recovery");
    eq(links["kakao_login:transport-alt"].user_id, "user-bin", "later request repairs the alias after transport recovery");

    db.__fail_next_settings_write = true;
    await rejects(ensureUser(env, "new-required-user", "New", ["kakao_login:new-required-alt"]), (err) => err?.name === "IdentityAliasPersistenceError" && isUncertainStorageWrite(err) && /QA_SETTINGS_WRITE_FAILED/.test(String(err.cause?.cause?.message || "")), "newly created user also treats identity alias persistence as required");
    const createdAfterFailure = db.users.find((item) => item.kakao_user_key === "new-required-user");
    ok(createdAfterFailure?.id, "new-user alias failure leaves one recoverable raw user rather than reporting false success");
    links = JSON.parse(setting(db, "user_identity_links").value);
    ok(!links["kakao_login:new-required-alt"], "failed new-user persistence does not claim the alternate alias");
    const repairedCreatedUser = await ensureUser(env, "new-required-user", "New", ["kakao_login:new-required-alt"]);
    links = JSON.parse(setting(db, "user_identity_links").value);
    eq(repairedCreatedUser.id, createdAfterFailure.id, "later request reuses the created raw user during reconciliation");
    eq(links["kakao_login:new-required-alt"].user_id, createdAfterFailure.id, "later request repairs the required new-user alternate alias");

    links["kakao_login:conflict-alt"] = { user_id: "user-wifi", provider: "skill" };
    upsertSetting(db, "user_identity_links", JSON.stringify(links));
    await rejects(ensureUser(env, "kakao_login:2265", "Bin", ["kakao_login:conflict-alt"]), (err) => err?.name === "IdentityAliasPersistenceError" && /identity_alias_conflict/.test(String(err.message || "")), "active alias owned by another user is not blindly reassigned");

    db.users.push({ id: "user-late", kakao_user_key: "merged:user-late", nickname: "Late", created_at: new Date().toISOString() });
    upsertSetting(db, "identity_merge_redirect:user-late", JSON.stringify({ secondary_user_id: "user-late", primary_user_id: "user-bin" }));
    links = JSON.parse(setting(db, "user_identity_links").value);
    links["skill_identity:late-writer"] = { user_id: "user-bin", provider: "identity_merge" };
    upsertSetting(db, "user_identity_links", JSON.stringify(links));
    eq(await persistIdentityAliases(env, ["skill_identity:late-writer"], "user-late", "skill"), false, "late secondary identity writer canonicalizes to the merged primary and leaves cleanup intact");
    links = JSON.parse(setting(db, "user_identity_links").value);
    eq(links["skill_identity:late-writer"].user_id, "user-bin", "late identity writer cannot overwrite the primary link with the secondary id");
    user = await ensureUser(env, "merged:user-late", "Late", ["kakao_login:late-alt"]);
    eq(user.id, "user-bin", "raw existing merged user returns a fresh primary user DTO");
    links = JSON.parse(setting(db, "user_identity_links").value);
    eq(links["kakao_login:late-alt"].user_id, "user-bin", "raw existing merged user repairs alternates to the primary id");

    db.household_members.push({ household_id: "house-home", user_id: "user-late", role: "member", created_at: new Date().toISOString() });
    db.household_members = db.household_members.filter((item) => !(item.household_id === "house-home" && item.user_id === "user-late"));
    const aliasWriteCount = db.__settings_write_count;
    await rejects(saveMemberAlias(env, "house-home", "user-late", "고아별명"), /member_alias_target_missing/, "late member alias writer refuses a removed membership");
    eq(db.__settings_write_count, aliasWriteCount, "removed-member alias refusal performs zero settings writes");
    const aliasMap = JSON.parse(setting(db, "member_aliases:house-home").value);
    ok(!Object.prototype.hasOwnProperty.call(aliasMap, "user-late"), "late alias writer does not recreate an orphaned secondary alias");
  } finally {
    fixture.restore();
  }
}

// A distinct eligible Kakao user.id is persisted beside an explicit bot key and can identify the same user later.
{
  const fixture = await createV2265QaFixture();
  try {
    const { db } = fixture;
    upsertSetting(db, "kakao_selected_household_v2251:user-bin", "house-home");
    const skillPayload = (utterance, user) => JSON.stringify({ userRequest: { utterance, user }, bot: { id: "qa" }, intent: { id: "qa" }, action: { params: {} } });
    const beforeUsers = db.users.length;
    let response = await call(fixture, "POST", "/skill", {
      cookie: "",
      accept: "*/*",
      contentType: "application/json",
      body: skillPayload("이번달 요약", { id: "generic-bot-id-77", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } }),
    });
    eq(response.status, 200, "explicit bot key with a distinct eligible botUserKey id is accepted through the real skill path");
    let links = JSON.parse(setting(db, "user_identity_links").value);
    eq(links["skill_identity:generic-bot-id-77"].user_id, "user-bin", "distinct eligible user.id is persisted as a skill identity alias");

    response = await call(fixture, "POST", "/skill", {
      cookie: "",
      accept: "*/*",
      contentType: "application/json",
      body: skillPayload("별칭인계커피 4321", { id: "generic-bot-id-77", properties: {} }),
    });
    eq(response.status, 200, "later payload containing only the eligible generic user.id succeeds");
    eq(db.transactions.at(-1).user_id, "user-bin", "later user.id-only payload writes as the original effective user");
    eq(db.users.length, beforeUsers, "later user.id-only payload does not create a second user");
    ok(!db.users.some((item) => item.kakao_user_key === "generic-bot-id-77"), "eligible alias handoff does not create a raw duplicate user");

    for (const user of [
      { id: "disallowed-identity-id", type: "appUserKey", properties: { botUserKey: "kakao_login:2265" } },
      { id: "unknown-user", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } },
      { id: "   ", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } },
    ]) {
      response = await call(fixture, "POST", "/skill", { cookie: "", accept: "*/*", contentType: "application/json", body: skillPayload("이번달 요약", user) });
      eq(response.status, 200, "explicit verified bot key remains usable when an ineligible user.id is ignored");
    }
    links = JSON.parse(setting(db, "user_identity_links").value);
    ok(!links["skill_identity:disallowed-identity-id"], "disallowed user type is not persisted as an identity alias");
    ok(!links["skill_identity:unknown-user"], "unknown-user is not persisted as an identity alias");
    ok(!links["skill_identity:"], "blank normalized user.id is not persisted as an identity alias");
  } finally {
    fixture.restore();
  }
}

// Budget boundary: 100 reaches the existing RPC, 101 is rejected with zero writes.
{
  const fixture = await createV2265QaFixture();
  try {
    // V22.9.34 감사 S3: 일괄 예산 저장은 폼이 그려질 때의 계획 지문을 함께 보낸다.
    const planFingerprint = async () => ((await (await call(fixture, "GET", "/budgets?month=2026-07&household_id=house-home")).text()).match(/name="plan_fingerprint" value="([^"]+)"/) || [])[1] || "";
    const buildBudgetBody = (count, fingerprint) => {
      const form = new URLSearchParams({ household_id: "house-home", month: "2026-07", budget_return: "budgets", plan_fingerprint: fingerprint });
      for (let i = 1; i <= count; i++) {
        form.append("budget_category", `검사항목${String(i).padStart(3, "0")}`);
        form.append("budget_amount", String(1000 + i));
      }
      return form.toString();
    };
    let response = await call(fixture, "POST", "/my/budget-bulk/save", { body: buildBudgetBody(100, await planFingerprint()) });
    eq(response.status, 303, "100 normalized budget entries are accepted");
    eq(rpcCount(fixture.db, "accountbook_replace_budget_plan_v227"), 1, "100-entry budget calls the existing replace RPC once");
    eq(fixture.db.accountbook_budgets.filter((item) => item.household_id === "house-home" && item.month === "2026-07").length, 100, "100-entry budget persists all entries");
    const budgetSnapshot = JSON.stringify(fixture.db.accountbook_budgets);
    response = await call(fixture, "POST", "/my/budget-bulk/save", { body: buildBudgetBody(101, await planFingerprint()) });
    ok(String(response.headers.get("location") || "").includes("err=budget_plan_too_many"), "101 normalized budget entries return a clear mapped error");
    eq(rpcCount(fixture.db, "accountbook_replace_budget_plan_v227"), 1, "101-entry budget performs zero additional RPC writes");
    eq(JSON.stringify(fixture.db.accountbook_budgets), budgetSnapshot, "101-entry rejection preserves the previous budget plan");
    const rejectedLocation = String(response.headers.get("location") || "");
    response = await call(fixture, "GET", rejectedLocation);
    const rejectedHtml = await response.text();
    ok(rejectedHtml.includes("예산 항목은 한 번에 100개까지 저장할 수 있습니다"), "101-entry redirect renders the Korean mapped limit guidance on /budgets");
    eq(JSON.stringify(fixture.db.accountbook_budgets), budgetSnapshot, "following the rejection redirect leaves the existing budget unchanged");
    response = await call(fixture, "GET", "/budgets?month=2026-07&household_id=house-home&err=" + encodeURIComponent("계정이 잠겼습니다"));
    const arbitraryHtml = await response.text();
    ok(arbitraryHtml.includes("요청을 처리하지 못했습니다") && !arbitraryHtml.includes("계정이 잠겼습니다"), "arbitrary no-URL budget errors render the safe generic message, not raw text");
  } finally {
    fixture.restore();
  }
}

// Next-week weekday resolution, including actual Kakao transaction dates.
eq(resolveWeekdayPhrase("다음주 월요일", new Date(2026, 11, 28)), "2027-01-04", "Monday base resolves next Monday across the year boundary");
eq(resolveWeekdayPhrase("다음 주 일요일", new Date(2026, 0, 25)), "2026-02-01", "Sunday base resolves next Sunday across the month boundary");
eq(resolveWeekdayPhrase("금요일", new Date(2026, 0, 25)), "2026-01-23", "unscoped weekday keeps the nearest past/current behavior");
eq(resolveWeekdayPhrase("이번주 월요일", new Date(2026, 0, 25)), "2026-01-19", "current-week weekday behavior is preserved");
{
  const fixture = await createV2265QaFixture();
  try {
    upsertSetting(fixture.db, "kakao_selected_household_v2251:user-bin", "house-home");
    const skillBody = (utterance) => JSON.stringify({ userRequest: { utterance, user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } } }, bot: { id: "qa" }, intent: { id: "qa" }, action: { params: {} } });
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-12-28T12:00:00+09:00");
    let response = await call(fixture, "POST", "/skill", { cookie: "", accept: "*/*", contentType: "application/json", body: skillBody("다음주 월요일 커피 4500 / 점심 9000") });
    eq(response.status, 200, "next-week slash-pair Kakao input returns a valid skill response");
    const yearEdgeRows = fixture.db.transactions.slice(-2);
    eq(yearEdgeRows.length, 2, "next-week slash pair stores both transactions through the active Kakao path");
    eq(yearEdgeRows[0].transaction_date, "2027-01-04", "first slash-pair transaction keeps the next-week Monday across the year boundary");
    eq(yearEdgeRows[1].transaction_date, "2027-01-04", "propagated second slash-pair transaction keeps the same next-week Monday");
    eq(yearEdgeRows[0].memo, "커피", "first next-week memo removes the date scope words");
    eq(yearEdgeRows[1].memo, "점심", "second propagated memo removes the date scope words");
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-01-25T12:00:00+09:00");
    response = await call(fixture, "POST", "/skill", { cookie: "", accept: "*/*", contentType: "application/json", body: skillBody("내주 일요일 영화 15000 / 간식 5000") });
    eq(response.status, 200, "내주 slash-pair Kakao input returns a valid skill response");
    const monthEdgeRows = fixture.db.transactions.slice(-2);
    eq(monthEdgeRows[0].transaction_date, "2026-02-01", "내주 first transaction resolves across the month boundary");
    eq(monthEdgeRows[1].transaction_date, "2026-02-01", "내주 scope propagates to the second transaction");
    eq(monthEdgeRows[0].memo, "영화", "내주 is removed from the first memo");
    eq(monthEdgeRows[1].memo, "간식", "propagated 내주 is removed from the second memo");
  } finally {
    delete globalThis.__AB_QA_FIXED_NOW_MS;
    fixture.restore();
  }
}

// Query error messages accept mapped codes only.
eq(formatMessage("amount_too_large"), "금액이 너무 큽니다. 20억 원 이하로 입력해 주세요. 입력 내용은 저장되지 않았습니다.", "known error code keeps its mapped message");
eq(formatMessage("참여자 권한 변경 권한이 없습니다."), "요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.", "arbitrary Korean query text is replaced by the safe generic message");
eq(formatMessage("계정이 잠겼습니다. 여기서 확인하세요"), "요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.", "another short no-URL spoof is also replaced");

// Import amount bounds and negative refund semantics.
{
  const normalize = (amount, type = "") => normalizeImportedRecordDetailed({ 날짜: "2026-07-15", 금액: amount, ...(type ? { 구분: type } : {}) }, "house-home", `2026-07-15 ${type} ${amount}`, [], "user-bin", { rowNumber: 1, source: "my_import" });
  let result = normalize("2000000000");
  eq(result.row.amount, 2000000000, "2-billion import boundary is accepted without clamping");
  result = normalize("2000000001");
  eq(result.rejection.reason_code, "amount_too_large", "over-limit import candidate is rejected for review");
  ok(result.rejection.reason.includes("허용 범위"), "over-limit rejection has a clear review reason");
  result = normalize("-12000");
  eq(result.row.type, "income", "untyped negative amount is treated as refund income");
  eq(result.row.category, "환급", "untyped negative amount receives the refund category");
  eq(result.row._import_needs_confirmation, true, "untyped negative amount carries a confirmation flag");
  result = normalize("-12000", "지출");
  eq(result.row.type, "income", "explicit expense negative remains refund income");
  eq(result.row._import_needs_confirmation, true, "explicit expense negative carries the confirmation flag");
  result = normalize("-12000", "수입");
  eq(result.row.type, "income", "explicit income semantics are preserved");
  eq(result.row._import_needs_confirmation, false, "explicit income does not get a false refund confirmation flag");
  result = normalize("-12000", "계좌이체");
  eq(result.row.type, "expense", "explicit transfer-like text is not reclassified as a generic refund");
  eq(result.row._import_needs_confirmation, false, "explicit transfer-like text keeps its existing confirmation semantics");
}

// Manual recurring guard and all application mutations share the same household database lease.
ok((source.match(/withHouseholdDatabaseLease\(env,/g) || []).length >= 6, "manual apply and application recurring mutation paths cooperate on the household database lease");
{
  const fixture = await createV2265QaFixture();
  try {
    fixture.db.accountbook_recurring.push({ id: "recurring-already-applied", household_id: "house-home", type: "expense", amount: 10000, category: "보험", memo: "이미반영말일", payment_method: "계좌", day_of_month: 31, user_id: "user-bin", is_active: null, last_applied_month: "2026-07" });
    let releaseApply;
    let applyReached;
    const applyGate = new Promise((resolve) => { releaseApply = resolve; });
    const applyStarted = new Promise((resolve) => { applyReached = resolve; });
    fixture.db.__before_rpc = async (name) => {
      if (name === "accountbook_apply_recurring_v227") {
        applyReached();
        await applyGate;
      }
    };
    const applyBody = new URLSearchParams({ household_id: "house-home", month: "2026-07" }).toString();
    const applyPromise = call(fixture, "POST", "/admin/recurring/apply", { body: applyBody });
    await applyStarted;
    const createBody = new URLSearchParams({ household_id: "house-home", month: "2026-07", type: "expense", memo: "경합말일", amount: "31000", category: "보험", payment_method: "계좌", day_of_month: "31" }).toString();
    let response = await call(fixture, "POST", "/my/recurring/save", { body: createBody });
    ok(String(response.headers.get("location") || "").includes("err=recurring_table_required"), "concurrent day-31 mutation fails closed while manual apply owns the household lease");
    ok(!fixture.db.accountbook_recurring.some((item) => item.memo === "경합말일"), "busy concurrent day-31 mutation performs zero recurring writes");
    releaseApply();
    response = await applyPromise;
    ok(String(response.headers.get("location") || "").includes("msg="), "already-applied NULL-active month-end rule does not duplicate any manual RPC record");
    eq(rpcCount(fixture.db, "accountbook_apply_recurring_v227"), 1, "manual RPC completes once under the shared lease");
    eq(fixture.db.accountbook_recurring.find((item) => item.id === "recurring-rent").last_applied_month, "2026-07", "normal 1-28 recurring rule remains functional");

    fixture.db.__before_rpc = null;
    response = await call(fixture, "POST", "/my/recurring/save", { body: createBody });
    ok(String(response.headers.get("location") || "").includes("msg=recurring_saved"), "day-31 mutation retry succeeds after the manual lease releases");
    ok(fixture.db.accountbook_recurring.some((item) => item.memo === "경합말일" && Number(item.day_of_month) === 31), "retry stores the requested day-31 rule without rerouting or marking it applied");

    response = await call(fixture, "POST", "/admin/recurring/apply", { body: applyBody });
    ok(String(response.headers.get("location") || "").includes("msg="), "next manual apply safely handles the newly stored day-31 rule");
    eq(rpcCount(fixture.db, "accountbook_apply_recurring_v227"), 2, "follow-up performs exactly one additional repaired manual RPC");
    const createdMonthEnd = fixture.db.accountbook_recurring.find((item) => item.memo === "경합말일");
    eq(createdMonthEnd.last_applied_month, "2026-07", "confirmed day-31 application publishes its applied month");
    const writtenMonthEnd = fixture.db.transactions.find((item) => item.raw_text === `recurring:${createdMonthEnd.id}:2026-07`);
    eq(writtenMonthEnd?.transaction_date, "2026-07-31", "July day-31 manual application preserves the requested date instead of day 28");
  } finally {
    fixture.restore();
  }
}

console.log(`PASS: launch review followups (${checks} checks)`);
