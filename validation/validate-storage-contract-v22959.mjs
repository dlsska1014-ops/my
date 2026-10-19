import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Synthetic Worker/HTTP/fixture tests. No SQL engine or business network is used.
const root = process.env.AB_CONTRACT_ROOT || fileURLToPath(new URL("../", import.meta.url));
const worker = await import(pathToFileURL(resolve(root, "src/index.js")));
const { computePaymentAssetTotals } = await import(pathToFileURL(resolve(root, "src/modules/settings/payment-assets.js")));
const { createV2265QaFixture } = await import(pathToFileURL(resolve(root, "validation/qa-fixture.mjs")));
const USER = "11111111-1111-4111-8111-111111111111", MEMBER = "22222222-2222-4222-8222-222222222222", BASE = "https://malhaebook.com", HOUSE = "house-home";
const chosen = process.argv.find(a => a.startsWith("--case="))?.slice(7);
const before = process.argv.includes("--probe-before");
const recoveryPath = process.argv.find(a => a.startsWith("--recovery="))?.slice(11);
const recovery = recoveryPath ? await import(pathToFileURL(resolve(recoveryPath, "src/index.js"))) : null;
const reportPath = process.argv.find(a => a.startsWith("--out="))?.slice(6);
let checks = 0, externalFetchAttempts = 0;
const observations = [];
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = r => JSON.stringify([r.id, r.household_id, r.user_id, r.transaction_date, r.type, Number(r.amount), r.category || "", r.memo || "", r.payment_method || "", r.raw_text || "", r.source || "", r.source_user_key || ""]);
const csv = (memo = "합성 항목", payment = "현금", amount = 54321) => `날짜,구분,금액,내용,결제수단\n2026-07-01,지출,${amount},${memo},${payment}`;
const parse = text => worker.parseFlexibleImportRecords(text, HOUSE, USER, { importYear: 2026 });
const stateRow = (fx, p) => fx.db.accountbook_settings.find(r => r.key === p.payload.source_state_key);
const countCalls = (fx, name) => fx.db.__rpc_calls.filter(c => c.name === name).length;
const writes = fx => countCalls(fx, "accountbook_commit_import_v22960");
const scopeRows = fx => fx.db.accountbook_settings.filter(r => r.key.startsWith("my_import_scope_v22959:"));
const metrics = html => Object.fromEntries([["imported", "저장 완료"], ["duplicate", "중복 제외"], ["failed", "저장 안 됨"], ["unknown", "확인 필요"]].map(([k, label]) => [k, Number(html.match(new RegExp(`<span>${label}</span><b>([0-9,]+)</b>`))?.[1]?.replaceAll(",", ""))]));
const originalFetch = globalThis.fetch, clock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.fetch = async () => { externalFetchAttempts++; throw Error("External fetch blocked in V59 contract validation"); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-17T12:00:00+09:00");

async function fixture(task) {
  const fx = await createV2265QaFixture();
  for (const [key, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[key] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", USER).replaceAll("user-wifi", MEMBER));
  fx.db.__import_rpc_available = true;
  fx.cookie = await fx.cookieFor(USER);
  try { await task(fx); } finally { fx.restore(); }
}
async function post(fx, fields, path = "/my/import", target = worker) {
  const body = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const response = await target.default.fetch(new Request(BASE + path, { method: "POST", headers: { cookie: fx.cookie, origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body }), fx.env, { waitUntil() {} });
  return { status: response.status, html: await response.text(), location: response.headers.get("location") };
}
async function preview(fx, text = csv(), fields = {}) {
  const p = await post(fx, { household_id: HOUSE, month: "2026-07", csv_text: text, skip_duplicates: "1", ...fields });
  eq(p.status, 200, "preview returns a document");
  p.token = p.html.match(/name="import_token" value="([^"]+)"/)?.[1];
  ok(p.token, "preview has its original signed token");
  p.payload = await worker.verifyMyImportPreviewToken(fx.env, p.token);
  ok(p.payload, "token verifies without changing signed values");
  return p;
}
function commit(fx, p, target = worker) {
  const form = new URLSearchParams({ import_action: "commit", import_token: p.token });
  for (const entry of p.payload.ready) form.append("selected_rows", entry.row_number);
  return post(fx, form, "/my/import", target);
}
function pgLeft(value, limit) { return Array.from(String(value || "")).slice(0, limit).join(""); }
function modelImport(fx, { responseStatus = 200, damage = false } = {}) {
  const memoryFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).includes("/rpc/accountbook_commit_import_v22960")) return memoryFetch(input, init);
    calls++;
    const response = await memoryFetch(input, init);
    const rows = JSON.parse(init.body).p_rows;
    for (const expected of rows) {
      const stored = fx.db.transactions.find(r => r.id === expected.id);
      if (stored) { stored.memo = pgLeft(stored.memo, 160) + (damage ? "!" : ""); stored.payment_method = pgLeft(stored.payment_method, 40); }
    }
    return responseStatus === 200 ? response : Response.json({ message: "synthetic response loss" }, { status: responseStatus });
  };
  return () => calls;
}

try {
  if (!chosen || chosen === "length") {
    for (const [script, letter] of [["ascii", "a"], ["hangul", "한"], ["supplementary", "😀"]]) {
      for (const [memoLength, paymentLength] of [[159, 39], [160, 40], [161, 40], [160, 41], [241, 81]]) {
        const text = csv(letter.repeat(memoLength), letter.repeat(paymentLength));
        const p = parse(text);
        const rejected = memoLength > 160 ? "memo_too_long" : paymentLength > 40 ? "payment_too_long" : "";
        if (before) {
          observations.push({ group: "length", script, memoLength, paymentLength, accepted: p.rows.length, storedMemoCodePoints: Array.from(p.rows[0]?.memo || "").length, reason: p.rejected[0]?.reason_code || "" });
          continue;
        }
        eq(p.rows.length, rejected ? 0 : 1, "same code-point boundaries across scripts");
        if (rejected) eq(p.rejected[0].reason_code, rejected, "over-limit row has the specific refusal reason");
        else eq([p.rows[0].memo, p.rows[0].payment_method], [letter.repeat(memoLength), letter.repeat(paymentLength)], "accepted text is unchanged");
        eq(p.analysis_complete, true, "storage refusal is distinct from unfinished parsing");
      }
      for (const responseStatus of [200, 503]) await fixture(async fx => {
        const p = await preview(fx, csv(letter.repeat(160), letter.repeat(40)));
        const row = structuredClone(p.payload.ready[0].row), beforeCount = fx.db.transactions.length;
        const calls = modelImport(fx, { responseStatus });
        const first = await commit(fx, p), retry = await commit(fx, p);
        const reanalyzed = await preview(fx, csv(letter.repeat(160), letter.repeat(40)));
        const stored = fx.db.transactions.find(r => r.id === row.id);
        const observation = { group: "reconciliation", script, responseStatus, documentStatus: first.status, first: metrics(first.html), retry: metrics(retry.html), actualNewRows: fx.db.transactions.length - beforeCount, exactStoredValue: canonical(row) === canonical(stored), rpcCalls: calls(), reanalysisReady: reanalyzed.payload.ready.length, reanalysisReason: reanalyzed.payload.outcomes[0]?.reason_code };
        observations.push(observation);
        if (!before) {
          eq(observation.first, { imported: 1, duplicate: 0, failed: 0, unknown: 0 }, "only exact stored values count as complete");
          eq(observation.retry, { imported: 0, duplicate: 1, failed: 0, unknown: 0 }, "same token confirms the original fixed ID");
          eq([observation.actualNewRows, observation.exactStoredValue, observation.rpcCalls, observation.reanalysisReady, observation.reanalysisReason], [1, true, 1, 0, "duplicate"], "actual row, RPC count and reanalysis agree");
          eq(p.payload.ready[0].row, row, "preview/signature input is not mutated");
        }
      });
    }
    if (!before) {
      for (const [memo, payment, reason] of [["한".repeat(161), "현금", "memo_too_long"], ["항목", "😀".repeat(41), "payment_too_long"]]) await fixture(async fx => {
        const text = csv(memo, payment), initial = sha(text), rowsBefore = fx.db.transactions.length;
        const p = await preview(fx, text);
        eq([p.payload.ready.length, p.payload.reason_counts[reason]], [0, 1], "over-limit value is not signed as a candidate");
        ok(p.html.includes(reason === "memo_too_long" ? "160자" : "40자"), "specific storage limit appears in the preview");
        eq([writes(fx), fx.db.transactions.length, sha(text)], [0, rowsBefore, initial], "refusal sends zero RPCs and preserves the source");
      });
      for (const responseStatus of [200, 503]) await fixture(async fx => {
        const p = await preview(fx), row = p.payload.ready[0].row;
        const calls = modelImport(fx, { responseStatus, damage: true });
        const result = await commit(fx, p), retry = await commit(fx, p);
        eq(metrics(result.html), { imported: 0, duplicate: 0, failed: 0, unknown: 1 }, "HTTP success/response loss with changed stored value remains unknown");
        eq(metrics(retry.html).unknown, 1, "same fixed-ID mismatch remains unknown");
        eq([JSON.parse(stateRow(fx, p).value).state, calls(), fx.db.transactions.filter(r => r.id === row.id).length], ["pending", 1, 1], "mismatch keeps its pending fence and original single row");
        const again = await post(fx, { household_id: HOUSE, csv_text: csv(), skip_duplicates: "1" });
        eq(again.status, 409, "new analysis cannot bypass a stored-value mismatch");
      });
      await fixture(async fx => {
        const p = await preview(fx), memoryFetch = globalThis.fetch;
        let dispatched = false;
        globalThis.fetch = async (input, init = {}) => {
          if (String(input).includes("/rpc/accountbook_commit_import_v22960")) { const response = await memoryFetch(input, init); dispatched = true; return response; }
          if (dispatched && init.method === "GET" && String(input).includes("/transactions?")) return Response.json({ message: "synthetic post-write read denial" }, { status: 400 });
          return memoryFetch(input, init);
        };
        const result = await commit(fx, p);
        eq(metrics(result.html), { imported: 0, duplicate: 0, failed: 0, unknown: 1 }, "post-write read 400 cannot clear an already dispatched write fence");
        eq(JSON.parse(stateRow(fx, p).value).state, "pending", "post-write read failure keeps pending even when the read error is definite");
        eq(writes(fx), 1, "post-write read failure dispatches only the original RPC");
      });
      eq(parse(csv("e\u0301".repeat(81))).rejected[0].reason_code, "memo_too_long", "combining marks count as separate PostgreSQL characters");
    }
  }
  if (!before && (!chosen || chosen === "legacy")) {
    for (const pending of [false, true]) for (const field of ["memo", "payment_method"]) await fixture(async fx => {
      const p = await preview(fx);
      const longText = "한".repeat(field === "memo" ? 161 : 41);
      const legacyText = field === "memo" ? csv(longText) : csv("합성 항목", longText);
      p.payload.ready[0].row[field] = longText;
      p.payload.source_hash = sha(legacyText);
      p.payload.source_state_key = `my_import_source_v22955:${sha(`${HOUSE}|${p.payload.source_hash}`)}`;
      p.token = await worker.makeMyImportPreviewToken(fx.env, p.payload);
      const row = structuredClone(p.payload.ready[0].row);
      let stateBefore = "";
      if (pending) {
        stateBefore = JSON.stringify({ revision: "a".repeat(32), v: 1, state: "pending", jti: p.payload.jti, rows: [{ id: row.id, hash: sha(canonical(row)) }] });
        fx.db.accountbook_settings.push({ key: p.payload.source_state_key, value: stateBefore });
      }
      const result = await commit(fx, p);
      eq(metrics(result.html), { imported: 0, duplicate: 0, failed: pending ? 0 : 1, unknown: pending ? 1 : 0 }, "oversized legacy token is refused without pretending an old pending failed");
      eq(writes(fx), 0, "oversized legacy token dispatches no transaction RPC");
      eq(p.payload.ready[0].row, row, "legacy token preserves its original text and ID");
      if (pending) {
        eq(stateRow(fx, p).value, stateBefore, "oversized legacy pending is byte-for-byte unchanged");
        const expired = { ...p, token: await worker.makeMyImportPreviewToken(fx.env, { ...p.payload, exp: 1 }) };
        eq((await commit(fx, expired)).status, 303, "expired token cannot retry or receive a new ID");
        // The original source still points at its unchanged pending, even after expiry/token loss.
        eq((await post(fx, { household_id: HOUSE, csv_text: legacyText, skip_duplicates: "1" })).status, 409, "lost/expired original token leaves original source safely fenced");
        eq(stateRow(fx, p).value, stateBefore, "expiry does not reset legacy protection");
      }
    });
  }
  if (!before && (!chosen || chosen === "delete")) {
    await fixture(async fx => {
      const p = await preview(fx, csv(), { mapping_protocol: "1", input_source: "text", mapping_delta: "[]" });
      eq(scopeRows(fx).length, 1, "new preview state has one verifiable ownership marker");
      const otherHash = sha("other synthetic source"), otherKey = `my_import_source_v22955:${sha(`house-other|${otherHash}`)}`, unknownKey = `my_import_source_v22955:${"c".repeat(64)}`;
      const otherOwner = `my_import_scope_v22959:${sha("house-other")}:${otherHash}`;
      fx.db.accountbook_settings.push({ key: otherKey, value: JSON.stringify({ revision: "b".repeat(32), v: 1, state: "pending", jti: "other", rows: [{ id: "99999999-9999-4999-8999-999999999999", hash: "b".repeat(64) }] }) }, { key: unknownKey, value: "opaque legacy ownership" });
      fx.db.accountbook_settings.push({ key: otherOwner, value: JSON.stringify({ v: 1, household_id: "house-other", source_hash: otherHash, state_key: otherKey }) });
      const preserved = fx.db.accountbook_settings.filter(r => [otherKey, otherOwner, unknownKey].includes(r.key)).map(r => r.value);
      const result = await worker.purgeHouseholdData(fx.env, HOUSE);
      eq([result.deleted, result.importCleanupPending], [true, false], "owned non-pending import metadata is cleaned after confirmed household purge");
      eq(fx.db.accountbook_settings.some(r => r.key === p.payload.source_state_key), false, "owned source is removed");
      eq(scopeRows(fx).map(r => r.key), [otherOwner], "only the selected household marker is removed last");
      eq(fx.db.accountbook_settings.filter(r => [otherKey, otherOwner, unknownKey].includes(r.key)).map(r => r.value), preserved, "unowned legacy and another household pending are not guessed or deleted");
    });
    await fixture(async fx => {
      const p = await preview(fx), memoryFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => String(input).includes("/rpc/accountbook_commit_import_v22960") ? Response.json({ message: "synthetic deferred" }, { status: 503 }) : memoryFetch(input, init);
      await commit(fx, p); const raw = stateRow(fx, p).value;
      await assert.rejects(worker.purgeHouseholdData(fx.env, HOUSE), /household_import_pending/); checks++;
      eq(countCalls(fx, "accountbook_purge_household_v22960"), 0, "unresolved owned pending blocks deletion before relational purge");
      eq(stateRow(fx, p).value, raw, "pending is protected after a failed delete");
      globalThis.fetch = memoryFetch;
      fx.db.transactions.push(structuredClone(p.payload.ready[0].row));
      eq((await worker.purgeHouseholdData(fx.env, HOUSE)).deleted, true, "exact late completion permits cleanup of its now confirmed state");
      eq(fx.db.accountbook_settings.some(r => r.key === p.payload.source_state_key), false, "confirmed old pending is cleaned without issuing another import");
    });
    for (const failure of ["after-metadata", "after-relational"]) await fixture(async fx => {
      const p = await preview(fx, csv(), { mapping_protocol: "1", input_source: "text", mapping_delta: "[]" });
      const marker = scopeRows(fx)[0], beforeState = stateRow(fx, p).value;
      fx.db.__lifecycle_fail_purge = failure;
      await assert.rejects(worker.purgeHouseholdData(fx.env, HOUSE), /qa_injected_failure/); checks++;
      eq(fx.db.households.some(h => h.id === HOUSE), true, "relational purge rolls back with metadata");
      eq([scopeRows(fx)[0].value, stateRow(fx, p).value], [marker.value, beforeState], "both metadata records survive atomic purge failure");
      delete fx.db.__lifecycle_fail_purge;
      eq((await worker.purgeHouseholdData(fx.env, HOUSE)).importCleanupPending, false, "retry atomically purges metadata and household");
    });
    await fixture(async fx => {
      const p = await preview(fx), memoryFetch = globalThis.fetch;
      let reached, release;
      const entered = new Promise(r => { reached = r; }), gate = new Promise(r => { release = r; });
      globalThis.fetch = async (input, init) => { if (String(input).includes("/rpc/accountbook_commit_import_v22960")) { reached(); await gate; } return memoryFetch(input, init); };
      const committing = commit(fx, p); await entered;
      await assert.rejects(worker.purgeHouseholdData(fx.env, HOUSE), /household_import_busy/); checks++;
      eq(countCalls(fx, "accountbook_purge_household_v22960"), 0, "active import lease serializes household deletion");
      release(); const done = await committing;
      eq(metrics(done.html).imported, 1, "original in-flight save finishes with its fixed ID");
      eq((await worker.purgeHouseholdData(fx.env, HOUSE)).deleted, true, "deletion succeeds after save and exact reconciliation");
      const after = await commit(fx, p);
      eq(writes(fx), 1, "already-open tab cannot write after household deletion");
      ok(after.status >= 300, "deleted household has no usable import context");
    });
    await fixture(async fx => {
      const p = await preview(fx), memoryFetch = globalThis.fetch;
      globalThis.fetch = async (input, init = {}) => {
        if (String(input).includes("/rpc/accountbook_import_source_v22960") && JSON.parse(init.body).p_next_value === null) return Response.json({ message: "synthetic owner write failure" }, { status: 400 });
        return memoryFetch(input, init);
      };
      await commit(fx, p);
      eq([writes(fx), !!stateRow(fx, p), scopeRows(fx).length], [0, false, 0], "ownership write failure prevents pending creation and transaction dispatch");
    });
    for (const phase of ["before-primary-write", "after-primary-write"]) await fixture(async fx => {
      const p = await preview(fx), memoryFetch = globalThis.fetch;
      globalThis.fetch = async (input, init = {}) => {
        if (String(input).includes("/rpc/accountbook_import_source_v22960") && JSON.parse(init.body).p_next_value !== null) {
          if (phase === "after-primary-write") await memoryFetch(input, init);
          return Response.json({ message: "synthetic primary state failure" }, { status: phase === "after-primary-write" ? 503 : 400 });
        }
        return memoryFetch(input, init);
      };
      await commit(fx, p);
      eq([writes(fx), scopeRows(fx).length, !!stateRow(fx, p)], [0, 1, phase === "after-primary-write"], "partial primary-state failure preserves verifiable ownership and dispatches no business write");
      globalThis.fetch = memoryFetch;
      if (phase === "after-primary-write") {
        await assert.rejects(worker.purgeHouseholdData(fx.env, HOUSE), /household_import_pending/); checks++;
        eq(JSON.parse(stateRow(fx, p).value).state, "pending", "an uncertain primary state is never reset from absent transactions");
      } else {
        eq((await worker.purgeHouseholdData(fx.env, HOUSE)).importCleanupPending, false, "owner-only partial state can be cleaned for its confirmed deleted household");
        eq(scopeRows(fx).length, 0, "owner-only cleanup is limited to its verified scope");
      }
    });
  }
  if (!before && (!chosen || chosen === "asset")) {
    const review = resolve(root, "docs/db-review/v22959");
    const evidence = JSON.parse(readFileSync(resolve(review, "BALANCE_PATCH_EVIDENCE.json"), "utf8"));
    const applySql = readFileSync(resolve(review, "01_NEGATIVE_ASSETS_REVIEW_ONLY.sql"), "utf8");
    const rollbackSql = readFileSync(resolve(review, "02_ROLLBACK_NEGATIVE_ASSETS_REVIEW_ONLY.sql"), "utf8");
    const definition = sql => sql.match(/(CREATE OR REPLACE FUNCTION public\.accountbook_mutate_payment_assets_v2280[\s\S]*?AS \$function\$[\s\S]*?\$function\$)/)?.[1].trimEnd() + "\n";
    const oldDefinition = definition(rollbackSql), proposedDefinition = definition(applySql);
    eq(createHash("md5").update(oldDefinition).digest("hex"), evidence.originalMd5, "rollback contains the saved original function after newline normalization");
    eq(createHash("md5").update(proposedDefinition).digest("hex"), evidence.proposedR2Md5, "review proposal contains its guarded exact function definition");
    ok(readFileSync(resolve(review, "03_CATALOG_PRE_POST_REVIEW_ONLY.sql"), "utf8").includes(`Expected post MD5: ${evidence.proposedR2Md5}`), "catalog review expects R2 rather than superseded R1");
    eq(proposedDefinition.replace(evidence.balanceGuardAfter, () => evidence.balanceGuardBefore).replace(evidence.loanHistoryAfter, () => evidence.loanHistoryBefore), oldDefinition, "only balance validation and signed loan-history magnitude change; all other definition bytes are preserved");
    eq([evidence.owner, evidence.securityDefiner, evidence.settings, evidence.acl], ["postgres", true, ["search_path=public, pg_temp"], ["postgres=X/postgres", "service_role=X/postgres"]], "recorded owner/security/search_path/ACL contract stays explicit");
    ok(applySql.includes("v22959r2_pre_contract_changed") && applySql.includes("v22959r2_post_contract_changed"), "apply review has preimage and postimage gates");
    ok(rollbackSql.includes("v22959r2_rollback_pre_contract_changed"), "rollback requires the expected proposed definition");
    ok(applySql.includes("abs(coalesce(v_asset->>'balance', '0')::numeric) > 9000000000000") && applySql.includes("not in ('loan', 'credit_card')"), "proposal bounds both signs and preserves ordinary-asset refusal");
    eq(evidence.sqlExecuted, false, "SQL review is not labeled as a PostgreSQL execution");
    // A SQL-expression model is kept separate from the Worker calculator.
    // Real PostgreSQL coverage is recorded in the external approved R2 execution evidence.
    ok(proposedDefinition.includes(evidence.loanHistoryAfter) && !proposedDefinition.includes(evidence.loanHistoryBefore), "R1 unsigned history expression cannot return unnoticed");
    for (const balance of [-120000, 120000, 0, -9000000000000, 9000000000000]) {
      const totals = computePaymentAssetTotals([{kind: "cash", balance: 1000000}, {kind: "loan", balance}, {kind: "credit_card", balance: -50000}, {kind: "check_card", balance: 70000}]);
      const sqlDebt = /^-?[0-9]+([.][0-9]+)?$/.test(String(balance)) ? Math.min(9e12, Math.abs(Math.round(balance))) : 0;
      eq(sqlDebt, Math.abs(balance), "R2 loan-history expression preserves signed debt magnitude at boundaries");
      eq(totals.liabilityTotal, sqlDebt, "Worker liability matches the R2 expression model");
      eq(totals.netWorth, 1000000 - sqlDebt, "net worth subtracts debt magnitude and excludes both card kinds");
    }
    for (const mode of ["missing", "observed", "proposed-model"]) for (const action of ["create", "update"]) for (const kind of ["loan", "credit_card", "cash", "bank_account", "check_card"]) for (const requestedBalance of [-120000, 120000]) await fixture(async fx => {
      const memoryFetch = globalThis.fetch;
      let presentCalls = 0;
      if (mode !== "missing") globalThis.fetch = async (input, init) => {
        if (!String(input).endsWith("/rpc/accountbook_mutate_payment_assets_v2280")) return memoryFetch(input, init);
        presentCalls++;
        const data = JSON.parse(init.body), asset = data.p_asset, balance = String(asset.balance ?? "0");
        const grammar = mode === "observed" ? /^[0-9]+([.][0-9]+)?$/ : /^-?[0-9]+([.][0-9]+)?$/;
        if (!grammar.test(balance) || Math.abs(Number(balance)) > 9e12 || Number(balance) < 0 && !["loan", "credit_card"].includes(asset.kind)) return Response.json({ message: "asset_balance_invalid" }, { status: 400 });
        const key = `payment_assets:${HOUSE}`, setting = fx.db.accountbook_settings.find(r => r.key === key), assets = JSON.parse(setting.value);
        const updated = action === "create" ? assets.concat([asset]) : assets.map(a => a.id === data.p_asset_id ? asset : a);
        setting.value = JSON.stringify(updated);
        const hkey = `asset_history:${HOUSE}`, history = { [data.p_snapshot_month]: { asset_total: 0, liability_total: asset.kind === "loan" ? Math.abs(Number(balance)) : 0, recorded_at: new Date().toISOString() } };
        const old = fx.db.accountbook_settings.find(r => r.key === hkey);
        if (old) old.value = JSON.stringify(history); else fx.db.accountbook_settings.push({ key: hkey, value: JSON.stringify(history) });
        return Response.json({ assets: updated, history, history_recorded: true });
      };
      const key = `payment_assets:${HOUSE}`, setting = fx.db.accountbook_settings.find(r => r.key === key);
      if (action === "update") setting.value = JSON.stringify([{ id: "asset-target", name: "합성 검증", kind, balance: 123 }]);
      const previousValue = setting.value;
      const response = await post(fx, { household_id: HOUSE, month: "2026-07", id: "asset-target", name: "합성 검증", kind, balance: String(requestedBalance), include_in_asset: "on" }, `/admin/payment-asset/${action}`);
      const allowed = requestedBalance >= 0 || ["loan", "credit_card"].includes(kind), succeeds = allowed && (mode !== "observed" || requestedBalance >= 0);
      const savedValue = fx.db.accountbook_settings.find(r => r.key === key).value;
      const saved = JSON.parse(savedValue).find(a => action === "update" ? a.id === "asset-target" : a.name === "합성 검증");
      eq(new URL(response.location, BASE).searchParams.has("msg"), succeeds, "negative balance product policy and observed/proposed RPC behavior are distinguished");
      if (succeeds) eq(saved.balance, requestedBalance, "create/update preserves the signed amount");
      else eq(savedValue, previousValue, "negative ordinary asset/current observed RPC refusal preserves prior storage");
      eq(presentCalls, mode === "missing" || !allowed ? 0 : 1, "RPC presence and Worker pre-validation are exercised separately");
      eq(countCalls(fx, "accountbook_mutate_payment_assets_v2271"), mode === "missing" && allowed ? 1 : 0, "v2271 fallback occurs only for missing v2280");
      if (succeeds && mode === "proposed-model") {
        const history = JSON.parse(fx.db.accountbook_settings.find(r => r.key === `asset_history:${HOUSE}`).value)["2026-10"];
        eq(history.liability_total, kind === "loan" ? Math.abs(requestedBalance) : 0, "signed loan magnitude is recorded; cards and ordinary assets do not become liabilities");
      }
    });
  }
  if (recovery && (!chosen || chosen === "recovery")) {
    await fixture(async fx => {
      const p = await preview(fx), memoryFetch = globalThis.fetch;
      let lateRows, originalCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).includes("/rpc/accountbook_commit_import_v22960")) return memoryFetch(input, init);
        originalCalls++; lateRows = structuredClone(JSON.parse(init.body).p_rows);
        return Response.json({ message: "synthetic original request still executing" }, { status: 503 });
      };
      const original = await commit(fx, p), stateBefore = stateRow(fx, p).value;
      eq(metrics(original.html).unknown, 1, "original ambiguous request retains its pending ID");
      for (const tab of [p, { ...p }, { ...p, token: await worker.makeMyImportPreviewToken(fx.env, { ...p.payload, exp: 1 }) }, { ...p, token: "" }]) {
        const response = await commit(fx, tab, recovery);
        ok([303, 503].includes(response.status), "recovery refuses same-token/open-tab/expired/lost-token writes");
      }
      eq([originalCalls, stateRow(fx, p).value], [1, stateBefore], "recovery dispatches no new RPC and preserves the original pending bytes");
      fx.db.transactions.push(...lateRows);
      await commit(fx, p, recovery);
      eq([originalCalls, fx.db.transactions.filter(r => r.id === p.payload.ready[0].row.id).length], [1, 1], "late original completion creates one original-ID row, recovery creates none");
      globalThis.fetch = memoryFetch;
      eq(metrics((await commit(fx, p)).html).duplicate, 1, "normal candidate can confirm the original ID after recovery");
      eq(writes(fx), 0, "confirmation after recovery performs no extra fixture RPC");
      for (const path of ["/admin/import/json", "/backup/final-check", "/backup/apply"]) {
        const response = await post(fx, {}, path, recovery);
        eq(response.status, 503, "recovery gates every import write entry point");
      }
      eq(fx.db.transactions.filter(r => r.id === p.payload.ready[0].row.id).length, 1, "all recovery import entry points preserve the single late-completed row");
    });
  }
  eq(externalFetchAttempts, 0, "all business fetches remained inside fixture memory");
  const report = { candidate: root, workerSha256: sha(readFileSync(resolve(root, "src/index.js"))), checks, externalFetchAttempts, sqlExecuted: false, scope: "Node Worker HTTP and synthetic fixture memory; SQL text/model checks do not execute PostgreSQL", observations };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`${before ? "PROBE" : "PASS"}: V22.9.59 storage contracts (${checks} checks)`);
} finally { globalThis.fetch = originalFetch; globalThis.__AB_QA_FIXED_NOW_MS = clock; }
