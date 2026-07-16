import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

async function signedSessionCookie(userId, secret) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${expires}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString("base64url")}`)}`;
}

const fixture = await createV2265QaFixture();
fixture.env.CRON_SECRET = "cron-v2268";

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
  return request(path, { ...options, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(options.headers || {}) }, body });
}

const receiptEntries = (householdId = "house-home") => [
  ["household_id", householdId], ["month", "2026-07"], ["transaction_date", "2026-07-20"],
  ["merchant", "동시요청마트"], ["amount", "77700"], ["category", "장보기"],
  ["payment_method", "국민카드"], ["receipt_text", "동시요청마트\n2026-07-20\n합계 77,700원"], ["confirmed", "yes"],
];

try {
  const health = await (await request("/health")).json();
  eq(health.version, "V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX", "health exposes V22.6.8");
  eq(health.mode, "release-candidate-security-spender-privacy-hotfix", "health exposes integrity mode");
  eq(health.integrity, "atomic-dedup-and-cron-lease", "health exposes the integrity profile");

  const receiptBefore = fixture.db.transactions.length;
  const receiptResponses = await Promise.all(Array.from({ length: 24 }, () => post("/my/receipt/save", receiptEntries())));
  ok(receiptResponses.every((response) => response.status === 303), "concurrent receipt requests all finish safely");
  const receiptLocations = receiptResponses.map((response) => String(response.headers.get("location") || ""));
  eq(receiptLocations.filter((location) => location.includes("receipt_saved")).length, 1, "one concurrent receipt request is saved");
  eq(receiptLocations.filter((location) => location.includes("duplicate_receipt")).length, 23, "the remaining concurrent receipt requests are explained as duplicates");
  eq(fixture.db.transactions.length, receiptBefore + 1, "24 concurrent requests create exactly one receipt transaction");

  let response = await post("/my/receipt/save", receiptEntries("house-trip"));
  eq(response.status, 303, "the same receipt can be recorded in a different household");
  eq(fixture.db.transactions.filter((row) => row.source === "receipt_confirmed" && row.amount === 77700).length, 2, "receipt uniqueness is household-scoped");

  const wifiCookie = await signedSessionCookie("user-wifi", fixture.env.USER_SESSION_SECRET);
  const beforeUnauthorized = fixture.db.transactions.length;
  response = await post("/my/receipt/save", receiptEntries("house-trip"), { cookie: wifiCookie });
  eq(fixture.db.transactions.length, beforeUnauthorized, "a non-member cannot write into another household");
  ok(String(response.headers.get("location") || "").includes("no_household"), "the non-member is returned to the safe household flow");

  const settlementEntries = [
    ["household_id", "house-home"], ["month", "2026-07"], ["mode", "equal"],
    ["note", "동시 정산 완료"], ["confirmed", "yes"],
  ];
  const settlementResponses = await Promise.all(Array.from({ length: 16 }, () => post("/my/settlement/save", settlementEntries)));
  ok(settlementResponses.every((item) => item.status === 303), "concurrent settlement completions redirect safely");
  const settlementRow = fixture.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home");
  ok(settlementRow, "settlement history row is created");
  eq(JSON.parse(settlementRow.value).length, 1, "16 concurrent settlement completions persist one history entry");
  const settlementLocations = settlementResponses.map((item) => String(item.headers.get("location") || ""));
  eq(settlementLocations.filter((location) => location.includes("settlement_completed")).length, 1, "one settlement request completes");
  const competingSettlementLocations = settlementLocations.filter((location) => !location.includes("settlement_completed"));
  ok(competingSettlementLocations.every((location) => /settlement_busy|settlement_already_completed/.test(location)), "competing settlement requests receive a non-destructive guide");
  eq(fixture.db.accountbook_settings.filter((row) => row.key === "settlement_history:house-home").length, 1, "the settlement settings key stays unique");

  fixture.db.accountbook_operation_locks.push({
    operation_key: "cron:recurring:2026-08",
    owner: "external-worker",
    locked_until: "2099-01-01T00:00:00.000Z",
    updated_at: new Date().toISOString(),
  });
  const recurringBefore = fixture.db.transactions.length;
  response = await request("/cron/recurring/apply?key=cron-v2268&month=2026-08&today=2026-08-15", { cookie: "" });
  eq(response.status, 200, "a duplicate recurring cron returns a monitoring-safe response");
  let cronResult = await response.json();
  eq(cronResult.skipped_run, true, "a live recurring lease skips the duplicate run");
  eq(cronResult.reason, "already_running", "the recurring skip reason is explicit");
  eq(fixture.db.transactions.length, recurringBefore, "a skipped recurring run performs no writes");

  const recurringLock = fixture.db.accountbook_operation_locks.find((row) => row.operation_key === "cron:recurring:2026-08");
  recurringLock.locked_until = "2020-01-01T00:00:00.000Z";
  response = await request("/cron/recurring/apply?key=cron-v2268&month=2026-08&today=2026-08-15", { cookie: "" });
  cronResult = await response.json();
  eq(cronResult.skipped_run, false, "an expired recurring lease is retryable");
  eq(cronResult.lock_mode, "database", "recurring cron uses the database lease");
  ok(cronResult.applied >= 1 && cronResult.failed === 0, "the retry applies due recurring items");
  const recurringAfter = fixture.db.transactions.length;
  response = await request("/cron/recurring/apply?key=cron-v2268&month=2026-08&today=2026-08-15", { cookie: "" });
  cronResult = await response.json();
  eq(cronResult.failed, 0, "the next recurring retry remains healthy");
  eq(fixture.db.transactions.length, recurringAfter, "the next recurring retry creates no duplicate transaction");

  await post("/my/report-preference/save", [
    ["household_id", "house-home"], ["month", "2026-08"], ["enabled", "1"], ["weekly", "1"], ["monthly", "1"],
  ]);
  fixture.db.accountbook_operation_locks.push({
    operation_key: "cron:reports:2026-08-31",
    owner: "external-report-worker",
    locked_until: "2099-01-01T00:00:00.000Z",
    updated_at: new Date().toISOString(),
  });
  const reportSettingsBefore = fixture.db.accountbook_settings.filter((row) => String(row.key).startsWith("free_report_snapshot:")).length;
  response = await request("/cron/reports/generate?key=cron-v2268&force=1&today=2026-08-31", { cookie: "" });
  let reportResult = await response.json();
  eq(reportResult.skipped_run, true, "a live report lease skips the duplicate run");
  eq(fixture.db.accountbook_settings.filter((row) => String(row.key).startsWith("free_report_snapshot:")).length, reportSettingsBefore, "a skipped report run performs no snapshot writes");
  const reportLock = fixture.db.accountbook_operation_locks.find((row) => row.operation_key === "cron:reports:2026-08-31");
  reportLock.locked_until = "2020-01-01T00:00:00.000Z";
  response = await request("/cron/reports/generate?key=cron-v2268&force=1&today=2026-08-31", { cookie: "" });
  reportResult = await response.json();
  eq(reportResult.skipped_run, false, "an expired report lease is retryable");
  eq(reportResult.lock_mode, "database", "report cron uses the database lease");
  ok(reportResult.generated >= 2 && reportResult.failed === 0, "the report retry generates weekly and monthly snapshots");
  ok(!fixture.db.accountbook_settings.some((row) => String(row.key).startsWith("free_report_snapshot:house-trip:")), "automatic reports remain scoped to the configured household");

  fixture.db.__operation_rpc_available = false;
  response = await request("/cron/recurring/apply?key=cron-v2268&month=2026-09&today=2026-09-15", { cookie: "" });
  cronResult = await response.json();
  eq(response.status, 200, "a pre-migration deployment keeps recurring automation available");
  eq(cronResult.lock_mode, "memory-fallback", "a missing lock RPC is explicit instead of silently pretending to be distributed");
  ok(cronResult.failed === 0 && cronResult.skipped_run === false, "memory fallback completes the local run safely");
  fixture.db.__operation_rpc_available = true;

  const opsSnapshot = await (await request("/ops-snapshot.json?key=cron-v2268", { cookie: "" })).json();
  eq(opsSnapshot.snapshot?.operation_integrity?.profile, "atomic-dedup-and-cron-lease", "operations snapshot exposes the integrity profile");
  eq(opsSnapshot.snapshot?.operation_integrity?.active_memory_fallback_leases, 0, "released memory fallback leases do not remain active");

  for (const path of ["/meme-lab", "/meme-archive", "/card-benefits"]) {
    response = await request(path);
    eq(response.status, 404, `${path} remains hidden during integrity stabilization`);
  }

  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("./schema_v22_6_8_operations_integrity.sql", import.meta.url), "utf8");
  const audit = await readFile(new URL("./OPERATIONS_DATA_INTEGRITY_AUDIT_V22_6_8.sql", import.meta.url), "utf8");
  for (const token of ["claimOperationLease", "releaseOperationLease", "withOperationMutex", "isUniqueConstraintError", "runRecurringAutoApplyUnlocked", "runAutomaticReportsUnlocked"]) ok(source.includes(token), `source contains ${token}`);
  for (const token of ["transactions_receipt_fingerprint_unique_v2268", "transactions_recurring_identity_unique_v2268", "accountbook_settings_key_unique_v2268", "accountbook_claim_operation", "accountbook_release_operation", "security definer", "service_role"]) ok(migration.toLowerCase().includes(token.toLowerCase()), `migration contains ${token}`);
  for (const token of ["owner_count", "고아 참여행", "receipt_fingerprint", "invite_code"]) ok(audit.includes(token), `audit covers ${token}`);
  ok(migration.includes("begin;") && migration.includes("commit;"), "the compatibility migration is transactional");
  ok(migration.includes("raise exception"), "the migration aborts instead of silently accepting legacy duplicates");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2268_OPERATIONS_DATA_INTEGRITY_OK assertions=${assertions}`);
