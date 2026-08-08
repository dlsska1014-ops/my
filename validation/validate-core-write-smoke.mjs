import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.81-BUDGET-BASIS-INCOME-WORDING-IA"'), "runtime reports the challenge and activity UX release");
ok(source.includes('key: `transaction-create:${fingerprint}`'), "web transaction creation uses a cross-instance operation lease");
ok(source.includes('kind: "transaction_edit_history_save_failed"'), "secondary edit-history failures are reported separately");
ok(!source.includes('await optionalSupabase(env, `/rest/v1/accountbook_budgets?household_id=eq.${encodeURIComponent(householdId)}&month=eq.${encodeURIComponent(month)}&category=eq.${encodeURIComponent(category)}`'), "budget deletion no longer swallows table failures");
ok(source.includes("const selected = selectRequestedScopedHousehold(households, requestedHouseholdId);"), "card-benefit payload never falls back from an inaccessible explicit household");
const budgetDeleteSource = source.slice(source.indexOf("async function handleBudgetDelete"), source.indexOf("async function pcScopedContext"));
// V22.8.80: 예산은 accountbook_budgets 한 곳에만 있다(V22.8.79 SQL 03 이 폴백을 이관·삭제).
// 지우기 전에 존재를 먼저 확인하는 성질은 그대로 지킨다.
ok(budgetDeleteSource.includes("tableRows.length > 0"), "budget deletion checks the row exists before mutating");
ok(!budgetDeleteSource.includes("accountbook_settings"), "budget deletion no longer touches the settings store");
ok(!budgetDeleteSource.includes("deleteSettingsBudget"), "the settings-side delete helper is gone");
ok(source.includes('key: `payment-assets-write:${String(householdId || "").trim()}`'), "all payment-asset writes use a household-wide cross-instance lease");
ok(source.includes("payment_asset_saved_snapshot_deferred"), "committed asset writes distinguish a deferred snapshot from a failed asset save");
// V22.8.80: 폴백이 사라져 "저장은 됐지만 정리가 밀렸다" 라는 중간 상태 자체가 없어졌다.
// 대신 저장 실패가 조용히 넘어가지 않는지를 본다(예전에는 settings 로 새 나갔다).
ok(!source.includes("budget_saved_fallback_cleanup_deferred"), "the deferred fallback-cleanup state is gone with the fallback");
ok(source.includes('rememberOpsEvent({ kind: "budget_save_failed"'), "a failed budget save is reported instead of silently falling back");
ok(source.includes('rememberOpsEvent({ kind: "budget_row_upsert_failed"'), "a failed budget upsert is reported instead of silently falling back");
ok(source.includes("async function getSettingValueStrict"), "read-modify-write settings paths can fail closed instead of treating read errors as empty values");
ok(source.includes('reason: "goal_save_failed"'), "goal write failures provide an explicit retryable response");
ok(source.includes("function showError(err)") && source.includes("catch(function (err) { showError(err); })"), "goal create failures are surfaced in the browser instead of being silently ignored");
ok(source.includes('id: String(o.id || `goal_${crypto.randomUUID()}`)'), "new goal identifiers use Web Crypto randomness");
ok(source.includes('const ACCOUNTBOOK_GOALS_JS_ASSET_PATH = "/assets/accountbook-goals-v22843.js"') && source.includes('"accountbook-goals-v22843-js"'), "changed goal runtime uses a new immutable asset URL and ETag");
ok(source.includes('return `goals:v5:${String(householdId || "default")'), "shared goals remain scoped by household");
ok(source.includes('return `favorites:v5:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared")'), "personal favorites remain scoped by household and user");

function form(values) {
  return new URLSearchParams(values);
}

async function request(fixture, path, { cookie = fixture.cookie, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/x-www-form-urlencoded";
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body.toString(),
  }), fixture.env, {});
}

async function requestJson(fixture, path, { cookie = fixture.cookie, method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), fixture.env, {});
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (error) {}
  return { response, data, text };
}

const signupFixture = await createV2265QaFixture();
try {
  const beforeUsers = signupFixture.db.users.length;
  const signupBody = form({
    login_name: "New Family",
    display_name: "새 사용자",
    access_code: "safe-password-2026",
    access_code_confirm: "safe-password-2026",
  });
  const signupResponse = await request(signupFixture, "/my/local-signup", { cookie: "", method: "POST", body: signupBody });
  eq(signupResponse.status, 303, "local account creation redirects after the atomic RPC succeeds");
  eq(signupResponse.headers.get("location"), "/my/households?first=1", "new local account continues to household onboarding");
  ok(String(signupResponse.headers.get("set-cookie") || "").includes("ab_user="), "new local account receives a signed browser session");
  eq(signupFixture.db.users.length, beforeUsers + 1, "local account creation persists one user");
  const identity = signupFixture.db.accountbook_user_identities.find((row) => row.provider === "local" && row.provider_subject === "new family");
  ok(identity?.user_id, "local account creation stores a normalized strong identity");
  eq(signupFixture.db.accountbook_user_security.find((row) => row.user_id === identity?.user_id)?.session_version, 1, "local account creation initializes session revocation state");

  const duplicateResponse = await request(signupFixture, "/my/local-signup", { cookie: "", method: "POST", body: signupBody });
  eq(duplicateResponse.status, 409, "duplicate local login name returns a conflict without a Worker exception");
  const duplicateHtml = await duplicateResponse.text();
  ok(duplicateHtml.includes("이미 사용 중인 로그인 이름"), "duplicate local login name has an actionable message");
  eq(signupFixture.db.users.length, beforeUsers + 1, "duplicate signup does not create an orphan user");

  const mismatchResponse = await request(signupFixture, "/my/local-signup", {
    cookie: "",
    method: "POST",
    body: form({ login_name: "mismatch", display_name: "불일치", access_code: "safe-password-2026", access_code_confirm: "different-password" }),
  });
  eq(mismatchResponse.status, 400, "password mismatch is rejected before database mutation");
  eq(signupFixture.db.users.length, beforeUsers + 1, "invalid signup leaves user storage unchanged");

  signupFixture.db.__create_local_user_error = { status: 404, code: "PGRST202", message: "Could not find the function accountbook_create_local_user_v227 in the schema cache" };
  const missingRpcResponse = await request(signupFixture, "/my/local-signup", {
    cookie: "",
    method: "POST",
    body: form({ login_name: "schema-check", display_name: "스키마", access_code: "safe-password-2026", access_code_confirm: "safe-password-2026" }),
  });
  eq(missingRpcResponse.status, 503, "missing signup RPC is reported as service unavailable");
  ok((await missingRpcResponse.text()).includes("PostgREST 스키마 새로고침"), "missing signup RPC explains the exact migration and cache check");
  delete signupFixture.db.__create_local_user_error;
} finally {
  signupFixture.restore();
}

const scopeFixture = await createV2265QaFixture();
try {
  const memberCookie = await scopeFixture.cookieFor("user-wifi");
  for (const path of [
    "/reserve-plans?month=2026-07&household_id=house-trip",
    "/payment-methods?month=2026-07&household_id=house-trip",
  ]) {
    const response = await request(scopeFixture, path, { cookie: memberCookie });
    eq(response.status, 303, `${path} rejects an inaccessible explicit household`);
    ok(String(response.headers.get("location") || "").includes("err=no_household"), `${path} never falls back to the first readable household`);
  }
  scopeFixture.env.INCOMPLETE_FEATURE_QA_ENABLED = "1";
  scopeFixture.env.CARD_PERFORMANCE_ENABLED = "1";
  const cardResponse = await request(scopeFixture, "/card-benefits?month=2026-07&household_id=house-trip", { cookie: memberCookie });
  eq(cardResponse.status, 303, "card-benefits rejects an inaccessible explicit household with QA feature access enabled");
  ok(String(cardResponse.headers.get("location") || "").includes("err=no_household"), "card-benefits reaches the scope guard instead of passing through the hidden-feature 404");
} finally {
  scopeFixture.restore();
}

const transactionFixture = await createV2265QaFixture();
try {
  const addBody = form({
    household_id: "house-home",
    month: "2026-07",
    type: "expense",
    transaction_date: "2026-07-28",
    amount: "12,345",
    memo: "write-smoke-create",
    category: "기타",
    payment_method: "현금",
  });
  const beforeCreate = transactionFixture.db.transactions.length;
  const createdResponse = await request(transactionFixture, "/my/transactions", { method: "POST", body: addBody });
  eq(createdResponse.status, 303, "owner transaction creation redirects");
  ok(String(createdResponse.headers.get("location") || "").includes("msg=created"), "owner transaction creation reports success");
  eq(transactionFixture.db.transactions.length, beforeCreate + 1, "transaction creation persists exactly one row");
  const createdRow = transactionFixture.db.transactions.find((row) => row.memo === "write-smoke-create");
  ok(createdRow?.id, "created transaction can be reloaded by id");

  const duplicateResponse = await request(transactionFixture, "/my/transactions", { method: "POST", body: addBody });
  ok(String(duplicateResponse.headers.get("location") || "").includes("duplicate_skipped"), "sequential duplicate transaction is reported without another write");
  eq(transactionFixture.db.transactions.length, beforeCreate + 1, "sequential duplicate creates no second row");

  transactionFixture.db.__fail_next_settings_write = true;
  const updateResponse = await request(transactionFixture, "/my/update", {
    method: "POST",
    body: form({
      id: createdRow.id,
      household_id: "house-home",
      month: "2026-07",
      type: "expense",
      transaction_date: "2026-07-28",
      amount: "23,456",
      memo: "write-smoke-updated",
      category: "생활용품",
      payment_method: "현금",
    }),
  });
  ok(String(updateResponse.headers.get("location") || "").includes("msg=updated"), "secondary display-history failure does not misreport a committed edit as failed");
  eq(Number(transactionFixture.db.transactions.find((row) => row.id === createdRow.id)?.amount), 23456, "transaction edit remains committed when display history fails");

  const deleteResponse = await request(transactionFixture, "/my/delete", {
    method: "POST",
    body: form({ id: createdRow.id, household_id: "house-home", month: "2026-07" }),
  });
  ok(String(deleteResponse.headers.get("location") || "").includes("msg=deleted"), "owner transaction deletion reports success");
  ok(!transactionFixture.db.transactions.some((row) => row.id === createdRow.id), "deleted transaction is no longer present");

  const concurrentBody = form({
    household_id: "house-home",
    month: "2026-07",
    type: "expense",
    transaction_date: "2026-07-28",
    amount: "34,567",
    memo: "write-smoke-concurrent",
    category: "기타",
    payment_method: "현금",
  });
  const beforeConcurrent = transactionFixture.db.transactions.length;
  const concurrent = await Promise.all([
    request(transactionFixture, "/my/transactions", { method: "POST", body: concurrentBody }),
    request(transactionFixture, "/my/transactions", { method: "POST", body: concurrentBody }),
  ]);
  eq(transactionFixture.db.transactions.length, beforeConcurrent + 1, "concurrent identical submissions persist one transaction");
  eq(concurrent.filter((response) => /(?:duplicate_skipped|err=db_delay)/.test(String(response.headers.get("location") || ""))).length, 1, "the secondary concurrent submission is either verified as duplicate or reported retryable busy");

  const failedConcurrentBody = form({
    household_id: "house-home",
    month: "2026-07",
    type: "expense",
    transaction_date: "2026-07-28",
    amount: "45,678",
    memo: "write-smoke-concurrent-leader-failure",
    category: "기타",
    payment_method: "현금",
  });
  const beforeFailedConcurrent = transactionFixture.db.transactions.length;
  transactionFixture.db.__fail_transaction_writes = 1;
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/transactions") && String(init.method || "GET").toUpperCase() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return fixtureFetch(input, init);
  };
  try {
    const failedConcurrent = await Promise.all([
      request(transactionFixture, "/my/transactions", { method: "POST", body: failedConcurrentBody }),
      request(transactionFixture, "/my/transactions", { method: "POST", body: failedConcurrentBody }),
    ]);
    eq(transactionFixture.db.transactions.length, beforeFailedConcurrent, "failed lease holder and contending request persist no transaction");
    eq(failedConcurrent.filter((response) => String(response.headers.get("location") || "").includes("err=db_delay")).length, 2, "leader failure and contention both report retryable failure, never false duplicate success");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  transactionFixture.restore();
}

const budgetFailureFixture = await createV2265QaFixture();
try {
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_budgets") && String(init.method || "GET").toUpperCase() === "DELETE") {
      return new Response(JSON.stringify({ code: "QA_BUDGET_DELETE_FAILED", message: "simulated budget delete failure" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const failedDelete = await request(budgetFailureFixture, "/admin/budget/delete", {
      method: "POST",
      body: form({ household_id: "house-home", month: "2026-07", category: "식비", return_to: "/budgets?month=2026-07&household_id=house-home" }),
    });
    ok(String(failedDelete.headers.get("location") || "").includes("err="), "budget table delete failure is returned as a failure");
    ok(budgetFailureFixture.db.accountbook_budgets.some((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "식비"), "failed budget deletion leaves the table row intact");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  budgetFailureFixture.restore();
}

// V22.8.80: settings 폴백 정리 실패 경로를 검사하던 블록이 여기 있었다.
// V22.8.79 SQL(03)이 폴백을 표로 이관·삭제했고 코드에서도 걷어냈으므로
// "표에는 저장됐는데 settings 정리가 밀렸다" 라는 상태 자체가 없다.
// 대신 저장·삭제 실패가 조용히 넘어가지 않는지는 위에서 본다.

// V22.8.80: 표에 없는 분류를 지울 때 쓸데없는 DELETE 를 쏘지 않는지는 그대로 지킨다.
// (예전에는 settings 에만 있던 예산을 지우는 상황이었고, 지금은 아무 데도 없는 경우다.)
const missingBudgetFixture = await createV2265QaFixture();
try {
  const missingCategory = "없는분류";
  let tableDeleteAttempts = 0;
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_budgets") && String(init.method || "GET").toUpperCase() === "DELETE") {
      tableDeleteAttempts += 1;
      return new Response(JSON.stringify({ code: "QA_UNNECESSARY_TABLE_DELETE", message: "a missing budget must not touch table delete" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const missingDelete = await request(missingBudgetFixture, "/admin/budget/delete", {
      method: "POST",
      body: form({ household_id: "house-home", month: "2026-07", category: missingCategory, return_to: "/budgets?month=2026-07&household_id=house-home" }),
    });
    ok(String(missingDelete.headers.get("location") || "").includes("msg=budget_deleted"), "deleting a budget that is not there reports success without a table mutation");
    eq(tableDeleteAttempts, 0, "a missing budget never issues an unnecessary table DELETE");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  missingBudgetFixture.restore();
}

const budgetSuccessFixture = await createV2265QaFixture();
try {
  const successfulDelete = await request(budgetSuccessFixture, "/admin/budget/delete", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", category: "교통", return_to: "/budgets?month=2026-07&household_id=house-home" }),
  });
  ok(String(successfulDelete.headers.get("location") || "").includes("msg=budget_deleted"), "successful budget deletion is reported after both stores are cleaned");
  ok(!budgetSuccessFixture.db.accountbook_budgets.some((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "교통"), "successful budget deletion removes the table row");
} finally {
  budgetSuccessFixture.restore();
}

const assetConcurrencyFixture = await createV2265QaFixture();
try {
  const concurrentAssetBody = form({ household_id: "house-home", month: "2026-07", name: "동시테스트자산", kind: "bank_account", balance: "1000", include_in_asset: "on" });
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/rpc/accountbook_mutate_payment_assets_v2271")) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return fixtureFetch(input, init);
  };
  try {
    const responses = await Promise.all([
      request(assetConcurrencyFixture, "/admin/payment-asset/create", { method: "POST", body: concurrentAssetBody }),
      request(assetConcurrencyFixture, "/admin/payment-asset/create", { method: "POST", body: concurrentAssetBody }),
    ]);
    const paymentSetting = assetConcurrencyFixture.db.accountbook_settings.find((row) => row.key === "payment_assets:house-home");
    const assets = JSON.parse(paymentSetting?.value || "[]");
    eq(assets.filter((item) => item.name === "동시테스트자산").length, 1, "concurrent same-name asset creation persists exactly one item with the v2271 RPC");
    eq(responses.filter((response) => String(response.headers.get("location") || "").includes("err=")).length, 1, "the contending asset request reports retry instead of duplicate success");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  assetConcurrencyFixture.restore();
}

const assetSnapshotFixture = await createV2265QaFixture();
try {
  assetSnapshotFixture.db.__fail_next_settings_write = true;
  const snapshotResponse = await request(assetSnapshotFixture, "/admin/payment-asset/create", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", name: "스냅샷실패자산", kind: "bank_account", balance: "2000", include_in_asset: "on" }),
  });
  const assets = JSON.parse(assetSnapshotFixture.db.accountbook_settings.find((row) => row.key === "payment_assets:house-home")?.value || "[]");
  ok(assets.some((item) => item.name === "스냅샷실패자산"), "asset remains committed when the secondary monthly snapshot write fails");
  ok(String(snapshotResponse.headers.get("location") || "").includes("payment_asset_saved_snapshot_deferred"), "asset snapshot failure reports committed save with deferred history instead of plain success or failure");
  ok(!assetSnapshotFixture.db.accountbook_settings.some((row) => row.key === "asset_history:house-home"), "failed secondary snapshot does not create a false history record");
} finally {
  assetSnapshotFixture.restore();
}

// V22.8.80: 저장이 표에 그대로 반영되는지는 그대로 지킨다.
// 예전에는 여기서 "같은 분류의 settings 잔재까지 지웠는지" 를 함께 봤지만,
// V22.8.79 SQL(03)이 그 잔재를 이관·삭제했고 코드에서도 폴백을 걷어냈다.
const budgetTableSaveFixture = await createV2265QaFixture();
try {
  const saveResponse = await request(budgetTableSaveFixture, "/admin/budget/save", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", category: "식비", amount: "640000", return_to: "/budgets?month=2026-07&household_id=house-home" }),
  });
  ok(String(saveResponse.headers.get("location") || "").includes("msg=budget_saved"), "a table budget save reports success");
  eq(Number(budgetTableSaveFixture.db.accountbook_budgets.find((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "식비")?.amount || 0), 640000, "the saved amount lands in the budgets table");
  eq(budgetTableSaveFixture.db.accountbook_settings.some((row) => String(row.key || "").startsWith("budgets:")), false, "a budget save never writes to the settings store");
} finally {
  budgetTableSaveFixture.restore();
}

// V22.8.80: "표에는 저장됐는데 settings 정리가 밀렸다" 라는 부분 성공 상태를 검사하던
// 블록이 여기 있었다. 폴백이 없어져 그 상태 자체가 사라졌다.
// 대신 표 저장이 실패하면 성공이라고 말하지 않는지를 본다(예전에는 settings 로 새 나갔다).
const budgetSaveFailureFixture = await createV2265QaFixture();
try {
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_budgets") && String(init.method || "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ code: "42P10", message: "simulated on-conflict rejection" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const failedSave = await request(budgetSaveFailureFixture, "/admin/budget/save", {
      method: "POST",
      body: form({ household_id: "house-home", month: "2026-07", category: "식비", amount: "700000", return_to: "/budgets?month=2026-07&household_id=house-home" }),
    });
    const location = String(failedSave.headers.get("location") || "");
    ok(location.includes("err="), "a rejected table save is reported as a failure");
    eq(location.includes("msg=budget_saved"), false, "a rejected table save never claims success");
    eq(budgetSaveFailureFixture.db.accountbook_settings.some((row) => String(row.key || "").startsWith("budgets:")), false, "a rejected table save no longer leaks into the settings store");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  budgetSaveFailureFixture.restore();
}

const budgetReplaceFixture = await createV2265QaFixture();
try {
  budgetReplaceFixture.db.accountbook_settings.push({ id: "setting-budget-removed", key: "budgets:house-home:2026-07", value: JSON.stringify([{ household_id: "house-home", month: "2026-07", category: "삭제대상", amount: 333000 }]) });
  const replaceResponse = await request(budgetReplaceFixture, "/my/budget-bulk/save", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", budget_return: "budgets", income_name: "급여", income_amount: "3200000", budget_category: "식비", budget_amount: "700000" }),
  });
  ok(String(replaceResponse.headers.get("location") || "").includes("msg=budget_saved"), "atomic budget-plan replacement reports success");
  ok(!budgetReplaceFixture.db.accountbook_settings.some((row) => row.key === "budgets:house-home:2026-07"), "atomic budget-plan replacement removes the entire legacy settings fallback");
  ok(!budgetReplaceFixture.db.accountbook_budgets.some((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "삭제대상"), "a category removed from the replacement plan cannot reappear from either store");
} finally {
  budgetReplaceFixture.restore();
}

const settlementFailureFixture = await createV2265QaFixture();
try {
  const settlementKey = "settlement_history:house-home";
  const originalHistory = [{ id: "settlement-existing", month: "2026-06", mode: "equal", total_expense: 1000, participant_count: 2, note: "기존 이력", completed_by: "user-bin", completed_at: "2026-06-30T00:00:00.000Z", status: "completed" }];
  settlementFailureFixture.db.accountbook_settings.push({ id: "setting-settlement-existing", key: settlementKey, value: JSON.stringify(originalHistory) });
  const fixtureFetch = globalThis.fetch;
  let failReadOnce = true;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (failReadOnce && target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_settings") && String(init.method || "GET").toUpperCase() === "GET" && target.searchParams.get("key") === `eq.${settlementKey}`) {
      failReadOnce = false;
      return new Response(JSON.stringify({ code: "QA_SETTINGS_READ_FAILED", message: "simulated settings read failure" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const failedRead = await request(settlementFailureFixture, "/my/settlement/save", {
      method: "POST",
      body: form({ household_id: "house-home", month: "2026-07", mode: "equal", confirmed: "yes", note: "읽기 실패 보호" }),
    });
    ok(String(failedRead.headers.get("location") || "").includes("err=settlement_save_failed"), "settlement history read failure is reported without claiming completion");
    eq(JSON.stringify(JSON.parse(settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey)?.value || "[]")), JSON.stringify(originalHistory), "settlement read failure preserves the existing history JSON");
    const retriedRead = await request(settlementFailureFixture, "/my/settlement/save", {
      method: "POST",
      body: form({ household_id: "house-home", month: "2026-07", mode: "equal", confirmed: "yes", note: "읽기 실패 보호" }),
    });
    ok(String(retriedRead.headers.get("location") || "").includes("msg=settlement_completed"), "settlement save succeeds when retried after a transient read failure");
    eq(JSON.parse(settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey)?.value || "[]").length, 2, "settlement retry appends to rather than replaces prior history");
  } finally {
    globalThis.fetch = fixtureFetch;
  }

  const beforeWriteFailure = settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey)?.value;
  settlementFailureFixture.db.__fail_next_settings_write = true;
  const failedWrite = await request(settlementFailureFixture, "/my/settlement/save", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", mode: "ratio", confirmed: "yes", note: "쓰기 실패 보호" }),
  });
  ok(String(failedWrite.headers.get("location") || "").includes("err=settlement_save_failed"), "settlement settings write failure provides an explicit retry result");
  eq(settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey)?.value, beforeWriteFailure, "failed settlement write keeps all prior history unchanged");
  const retriedWrite = await request(settlementFailureFixture, "/my/settlement/save", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", mode: "ratio", confirmed: "yes", note: "쓰기 실패 보호" }),
  });
  ok(String(retriedWrite.headers.get("location") || "").includes("msg=settlement_completed"), "settlement settings write can be retried after the lease is released");
  settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey).value = "{invalid-settlement-json";
  const corruptedHistory = await request(settlementFailureFixture, "/my/settlement/save", {
    method: "POST",
    body: form({ household_id: "house-home", month: "2026-07", mode: "equal", confirmed: "yes", note: "손상 JSON 보호" }),
  });
  ok(String(corruptedHistory.headers.get("location") || "").includes("err=settlement_save_failed"), "invalid settlement history JSON fails closed");
  eq(settlementFailureFixture.db.accountbook_settings.find((row) => row.key === settlementKey)?.value, "{invalid-settlement-json", "invalid settlement history JSON is preserved for recovery instead of overwritten");
} finally {
  settlementFailureFixture.restore();
}

const settlementConcurrencyFixture = await createV2265QaFixture();
try {
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    const bodyText = String(init.body || "");
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_settings") && String(init.method || "GET").toUpperCase() === "POST" && bodyText.includes("settlement_history:house-home")) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return fixtureFetch(input, init);
  };
  try {
    const settlementBody = form({ household_id: "house-home", month: "2026-07", mode: "equal", confirmed: "yes", note: "동시 정산" });
    const responses = await Promise.all([
      request(settlementConcurrencyFixture, "/my/settlement/save", { method: "POST", body: settlementBody }),
      request(settlementConcurrencyFixture, "/my/settlement/save", { method: "POST", body: settlementBody }),
    ]);
    const locations = responses.map((response) => String(response.headers.get("location") || ""));
    eq(locations.filter((location) => location.includes("msg=settlement_completed")).length, 1, "one concurrent settlement completion owns the settings write");
    eq(locations.filter((location) => location.includes("err=settlement_busy")).length, 1, "the contending settlement request receives a retryable busy result");
    eq(JSON.parse(settlementConcurrencyFixture.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home")?.value || "[]").length, 1, "concurrent settlement submissions persist one history entry");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  settlementConcurrencyFixture.restore();
}

const goalFailureFixture = await createV2265QaFixture();
try {
  const goalKey = "goals:v5:house-home";
  const originalGoals = [{ id: "goal_existing", name: "기존 목표", emoji: "🎯", target: 1000000, saved: 100000, monthly: 100000, deadline: "2026-12", created_at: "2026-07-01T00:00:00.000Z" }];
  goalFailureFixture.db.accountbook_settings.push({ id: "setting-goal-existing", key: goalKey, value: JSON.stringify(originalGoals) });
  const fixtureFetch = globalThis.fetch;
  let failReadOnce = true;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (failReadOnce && target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_settings") && String(init.method || "GET").toUpperCase() === "GET" && target.searchParams.get("key") === `eq.${goalKey}`) {
      failReadOnce = false;
      return new Response(JSON.stringify({ code: "QA_SETTINGS_READ_FAILED", message: "simulated settings read failure" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return fixtureFetch(input, init);
  };
  try {
    const failedRead = await requestJson(goalFailureFixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "읽기 실패 목표", target: 200000 } });
    eq(failedRead.response.status, 503, "goal mutation fails closed when its settings read fails");
    eq(failedRead.data?.reason, "goal_save_failed", "goal mutation read failure exposes a retryable reason");
    eq(goalFailureFixture.db.accountbook_settings.find((row) => row.key === goalKey)?.value, JSON.stringify(originalGoals), "goal mutation read failure never replaces existing goals with an empty list");
  } finally {
    globalThis.fetch = fixtureFetch;
  }

  const failedLoadFetch = globalThis.fetch;
  let failLoadOnce = true;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (failLoadOnce && target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_settings") && String(init.method || "GET").toUpperCase() === "GET" && target.searchParams.get("key") === `eq.${goalKey}`) {
      failLoadOnce = false;
      return new Response(JSON.stringify({ code: "QA_SETTINGS_READ_FAILED", message: "simulated settings read failure" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return failedLoadFetch(input, init);
  };
  try {
    const failedLoad = await requestJson(goalFailureFixture, "/u/api/goals?household=house-home");
    eq(failedLoad.response.status, 503, "goal GET reports a temporary settings read failure instead of a false empty list");
    eq(failedLoad.data?.reason, "goal_read_failed", "goal GET read failure has a distinct reason");
  } finally {
    globalThis.fetch = failedLoadFetch;
  }

  goalFailureFixture.db.__fail_next_settings_write = true;
  const failedWrite = await requestJson(goalFailureFixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "쓰기 실패 목표", target: 300000 } });
  eq(failedWrite.response.status, 503, "goal settings write failure is returned to the client");
  eq(failedWrite.data?.reason, "goal_save_failed", "goal settings write failure provides a retry reason");
  eq(JSON.parse(goalFailureFixture.db.accountbook_settings.find((row) => row.key === goalKey)?.value || "[]").length, 1, "failed goal write preserves the prior list");
  const retriedGoal = await requestJson(goalFailureFixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "쓰기 실패 목표", target: 300000 } });
  eq(retriedGoal.response.status, 200, "goal change succeeds when retried after a transient settings failure");
  eq(retriedGoal.data?.goals?.length, 2, "goal retry appends without losing the existing goal");
  goalFailureFixture.db.accountbook_settings.find((row) => row.key === goalKey).value = "{invalid-goal-json";
  const corruptedGoals = await requestJson(goalFailureFixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "손상 JSON 보호", target: 600000 } });
  eq(corruptedGoals.response.status, 503, "invalid goal settings JSON fails closed");
  eq(goalFailureFixture.db.accountbook_settings.find((row) => row.key === goalKey)?.value, "{invalid-goal-json", "invalid goal settings JSON is preserved for recovery instead of overwritten");
} finally {
  goalFailureFixture.restore();
}

const goalConcurrencyFixture = await createV2265QaFixture();
try {
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    const bodyText = String(init.body || "");
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/accountbook_settings") && String(init.method || "GET").toUpperCase() === "POST" && bodyText.includes("goals:v5:house-home")) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return fixtureFetch(input, init);
  };
  try {
    const goalBodies = [
      { household: "house-home", action: "create", name: "동시 목표 A", target: 400000 },
      { household: "house-home", action: "create", name: "동시 목표 B", target: 500000 },
    ];
    const responses = await Promise.all(goalBodies.map((body) => requestJson(goalConcurrencyFixture, "/u/api/goals", { method: "POST", body })));
    eq(responses.filter((item) => item.response.status === 200).length, 1, "one concurrent goal mutation owns the household settings write");
    eq(responses.filter((item) => item.response.status === 409 && item.data?.reason === "goal_write_in_progress").length, 1, "the contending goal mutation receives a retryable busy response");
    eq(JSON.parse(goalConcurrencyFixture.db.accountbook_settings.find((row) => row.key === "goals:v5:house-home")?.value || "[]").length, 1, "concurrent goal creates persist one item before retry");
    const retryBody = goalBodies[responses.findIndex((item) => item.response.status === 409)];
    const retry = await requestJson(goalConcurrencyFixture, "/u/api/goals", { method: "POST", body: retryBody });
    eq(retry.response.status, 200, "the contending goal mutation succeeds after retry");
    eq(retry.data?.goals?.length, 2, "goal retry preserves both independently requested goals");
  } finally {
    globalThis.fetch = fixtureFetch;
  }
} finally {
  goalConcurrencyFixture.restore();
}

const viewerFixture = await createV2265QaFixture();
try {
  const viewerMembership = viewerFixture.db.household_members.find((row) => row.household_id === "house-home" && row.user_id === "user-wifi");
  viewerMembership.role = "viewer";
  const viewerCookie = await viewerFixture.cookieFor("user-wifi");
  const before = JSON.stringify({
    transactions: viewerFixture.db.transactions,
    budgets: viewerFixture.db.accountbook_budgets,
    settings: viewerFixture.db.accountbook_settings,
    members: viewerFixture.db.household_members,
  });
  const blockedRequests = [
    ["/my/budget-bulk/save", form({ household_id: "house-home", month: "2026-07", income_name: "급여", income_amount: "1000000", budget_category: "식비", budget_amount: "500000" })],
    ["/my/settlement/save", form({ household_id: "house-home", month: "2026-07", mode: "equal", confirmed: "yes", note: "viewer-block" })],
    ["/my/receipt/save", form({ household_id: "house-home", month: "2026-07", merchant: "viewer-block", transaction_date: "2026-07-28", amount: "1000", confirmed: "yes" })],
    ["/admin/payment-asset/create", form({ household_id: "house-home", month: "2026-07", name: "viewer-block", kind: "cash", balance: "1000" })],
    ["/admin/member/update", form({ household_id: "house-home", user_id: "user-bin", role: "viewer" })],
  ];
  for (const [path, body] of blockedRequests) {
    const response = await request(viewerFixture, path, { cookie: viewerCookie, method: "POST", body });
    eq(response.status, 303, `${path} redirects a read-only viewer without mutation`);
  }
  eq(JSON.stringify({
    transactions: viewerFixture.db.transactions,
    budgets: viewerFixture.db.accountbook_budgets,
    settings: viewerFixture.db.accountbook_settings,
    members: viewerFixture.db.household_members,
  }), before, "viewer write attempts leave transactions, budgets, settings, and memberships unchanged");
} finally {
  viewerFixture.restore();
}

console.log(`core_write_smoke: ${checks} checks passed`);
