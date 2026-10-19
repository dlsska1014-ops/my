import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { worker, HOUSE, USER, BASE, fixture, calls, preview, commit, state, rpc, adminLogin, adminJson, adminPlan } from "./lib-lifecycle-v22961.mjs";
import { handleKakaoEditCommandV4 } from "../src/modules/kakao/edit-flow-v4.js";
import { writeKakaoEditUndoItemsV4, readKakaoEditUndoItemsV4 } from "../src/modules/kakao/edit-session-v4.js";

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const rejects = async (task, pattern) => { await assert.rejects(task, pattern); checks++; };
const sha = s => createHash("sha256").update(s).digest("hex");
const SOURCE = "accountbook_import_source_v22960", IMPORT = "accountbook_commit_import_v22960", PURGE = "accountbook_purge_household_v22960";
const sourceArgs = (hash, expected = null, next = null) => ({ p_household_id: HOUSE, p_source_hash: hash, p_expected_value: expected, p_next_value: next });
const serialized = (revision, kind, rows = []) => JSON.stringify({ revision: revision.repeat(32), v: 1, state: kind, jti: "synthetic-token", rows });

// The model must reject full-value CAS conflicts even if the revision agrees.
await fixture(async fx => {
  const hash = sha("atomic source fixture"), original = serialized("a", "preview");
  const wrong = sourceArgs(hash, "wrong", original);
  eq((await rpc(fx, SOURCE, wrong)).status, 400, "failed initial CAS");
  eq(fx.db.accountbook_settings.filter(r => r.key.startsWith("my_import_")).length, 0, "failed source transaction leaves no owner");
  const registered = await rpc(fx, SOURCE, sourceArgs(hash, null, original));
  eq(registered.data.value, original, "state text bytes preserved");
  const modified = original.replace("synthetic-token", "changed-token");
  eq((await rpc(fx, SOURCE, sourceArgs(hash, modified, serialized("b", "preview")))).data.message, "import_source_state_changed", "same revision is insufficient for CAS");
  eq((await rpc(fx, SOURCE, sourceArgs(hash))).data.value, original, "rejected CAS preserves exact bytes");
  const id = "33333333-3333-4333-8333-333333333333", pending = serialized("b", "pending", [{ id, hash: "1".repeat(64) }]);
  await rpc(fx, SOURCE, sourceArgs(hash, original, pending));
  eq((await rpc(fx, SOURCE, sourceArgs(hash, pending, pending.replace(id, "44444444-4444-4444-8444-444444444444")))).data.message, "import_pending_identity_changed", "pending IDs cannot rotate");
  eq((await rpc(fx, SOURCE, sourceArgs(hash, pending, pending.replace('"jti":"synthetic-token"', '"jti":"different"')))).data.message, "import_pending_identity_changed", "pending token cannot rotate");
  eq((await rpc(fx, SOURCE, sourceArgs(hash, pending, serialized("c", "complete")))).data.message, "import_pending_rows_missing", "missing ID cannot complete");
  const before = JSON.stringify(fx.db.accountbook_settings);
  eq((await rpc(fx, PURGE, { p_household_id: HOUSE })).data.message, "household_import_pending", "DB purge independently rejects pending");
  eq(JSON.stringify(fx.db.accountbook_settings), before, "pending purge rollback preserves all metadata");
});

// Every adapter sends the household, hash and exact pending bytes in the body.
await fixture(async fx => {
  const p = await preview(fx); await commit(fx, p);
  const sent = calls(fx, IMPORT)[0].data;
  eq([sent.p_household_id, sent.p_source_hash], [HOUSE, p.payload.source_hash], "source-bound commit scope");
  eq(JSON.parse(sent.p_expected_value).rows.map(r => r.id), p.payload.ready.map(r => r.row.id), "fixed IDs sent in full pending");
  const complete = calls(fx, SOURCE).find(c => c.data.p_next_value && JSON.parse(c.data.p_next_value).state === "complete");
  eq(complete.data.p_expected_value, sent.p_expected_value, "completion uses original pending bytes");
  eq(JSON.parse(state(fx, p)).state, "complete", "exact saved fields complete");
  eq((await worker.purgeHouseholdData(fx.env, HOUSE)).deleted, true, "new purge adapter succeeds");
  eq(state(fx, p), undefined, "import metadata deleted with relational data");
  eq(calls(fx, "accountbook_purge_household_v227").length + calls(fx, "accountbook_import_transactions_v227").length, 0, "no legacy fallback");
  eq(fx.trace.filter(c => c.path.endsWith("/accountbook_settings") && !["GET", "HEAD"].includes(c.method) && JSON.stringify(c.data).includes("my_import_source_")).length, 0, "no direct import metadata writes");
});

for (const name of [SOURCE, IMPORT, PURGE]) await fixture(async fx => {
  const p = await preview(fx, { mapping_protocol: "1", input_source: "text", mapping_delta: "[]" });
  const raw = state(fx, p); fx.db.__missing_rpcs = [name];
  if (name === PURGE) {
    await rejects(worker.purgeHouseholdData(fx.env, HOUSE), /PGRST202|Could not find/);
    eq(state(fx, p), raw, "missing purge retains metadata");
  } else {
    await commit(fx, p);
    eq(fx.db.transactions.some(r => r.id === p.payload.ready[0].row.id), false, "missing new RPC writes no rows");
    if (name === SOURCE) eq(state(fx, p), raw, "missing CAS preserves prior bytes");
  }
  const ready = await worker.default.fetch(new Request(BASE + "/ready"), fx.env, { waitUntil() {} });
  eq(ready.status, 503, "readiness detects absent new contract");
  ok(JSON.stringify(await ready.json()).includes(name), "readiness names absent RPC");
  eq(calls(fx, "accountbook_import_transactions_v227").length + calls(fx, "accountbook_purge_household_v227").length, 0, "absence does not enable a legacy RPC");
});

// Administrator JSON and candidate-plan apply use the same pending barrier.
for (const path of ["json", "plan"]) await fixture(async fx => {
  const cookie = await adminLogin(fx), p = await preview(fx), memory = globalThis.fetch;
  globalThis.fetch = (input, init) => String(input).endsWith("/" + IMPORT) ? Promise.resolve(Response.json({ message: "synthetic in-flight request" }, { status: 503 })) : memory(input, init);
  await commit(fx, p); globalThis.fetch = memory;
  const raw = state(fx, p), before = fx.db.transactions.length;
  const result = path === "json" ? await adminJson(fx, cookie) : await adminPlan(fx, cookie);
  eq(fx.db.transactions.length, before, `${path} cannot bypass pending`);
  eq(state(fx, p), raw, `${path} preserves original pending`);
  eq(calls(fx, IMPORT).at(-1).data.p_source_hash, null, "admin is explicitly source-less");
  eq(calls(fx, IMPORT).at(-1).data.p_expected_value, null, "admin has no invented expected state");
  ok(path === "json" ? result.data.ok === false : result.html.includes("저장하지 못함"), "admin refuses uncommitted rows");
});
for (const path of ["json", "plan"]) await fixture(async fx => {
  const cookie = await adminLogin(fx), before = fx.db.transactions.length;
  const result = path === "json" ? await adminJson(fx, cookie) : await adminPlan(fx, cookie);
  eq(fx.db.transactions.length - before, 1, `${path} verified insert works`);
  ok(path === "json" ? result.data.ok : result.html.includes("저장됨"), "verified admin result");
  eq(fx.trace.filter(c => c.path.endsWith("/transactions") && c.method === "POST").length, 0, "administrator imports never use direct INSERT");
});

// A request already sent before its Worker lease expired can still reach SQL.
await fixture(async fx => {
  const p = await preview(fx), memory = globalThis.fetch;
  let deferred;
  globalThis.fetch = (input, init) => {
    if (String(input).endsWith("/" + IMPORT)) { deferred = () => memory(input, init); return Promise.resolve(Response.json({ message: "deferred" }, { status: 503 })); }
    return memory(input, init);
  };
  await commit(fx, p); globalThis.fetch = memory;
  const raw = state(fx, p);
  for (const lock of fx.db.accountbook_operation_locks) lock.locked_until = new Date(Date.now() - 1000).toISOString();
  await rejects(worker.purgeHouseholdData(fx.env, HOUSE), /household_import_pending/);
  eq(state(fx, p), raw, "lease expiry never cancels the DB pending fence");
  eq((await deferred()).status, 200, "already-dispatched request can finish once");
  eq((await worker.purgeHouseholdData(fx.env, HOUSE)).deleted, true, "late exact rows permit conditional completion then purge");
  eq((await deferred()).status, 400, "same request arriving after purge cannot recreate a row");
  eq(fx.db.transactions.some(r => r.id === p.payload.ready[0].row.id), false, "no post-purge insert");
});

for (const method of ["POST", "PATCH", "DELETE"]) await fixture(async fx => {
  const key = "my_import_source_v22955:" + "a".repeat(64);
  fx.db.accountbook_settings.push({ key, value: "original-legacy-bytes" });
  const response = await globalThis.fetch("https://mock.supabase.co/rest/v1/accountbook_settings?key=eq." + key, { method, body: method === "DELETE" ? undefined : JSON.stringify({ key, value: "changed" }) });
  eq(response.status, 400, "old settings writer is fenced");
  eq(fx.db.accountbook_settings.find(r => r.key === key).value, "original-legacy-bytes", "old direct write preserves original");
});
await fixture(async fx => {
  for (const name of ["accountbook_import_transactions_v227", "accountbook_purge_household_v227"]) eq((await rpc(fx, name, { p_household_id: HOUSE, p_rows: [] })).status, 400, "old RPC entry point fails safely");
  eq((await globalThis.fetch(`https://mock.supabase.co/rest/v1/households?id=eq.${HOUSE}`, { method: "DELETE" })).status, 400, "old direct household delete is fenced");
  for (const source of ["my_import", "backup_import_v19_3"]) eq((await globalThis.fetch("https://mock.supabase.co/rest/v1/transactions", { method: "POST", body: JSON.stringify({ household_id: HOUSE, user_id: USER, source }) })).status, 400, "old user and administrator import INSERTs are both fenced");
});

for (const source of ["my_import", "backup_import_v19_3"]) for (const mode of ["success", "response-loss", "changed-fields", "pending"]) await fixture(async fx => {
  const row = { id: "55555555-5555-4555-8555-555555555555", household_id: HOUSE, user_id: USER, transaction_date: "2026-10-17", type: "expense", amount: 45678, category: "식비", memo: "합성 가져오기 복구", payment_method: "현금", raw_text: "합성", source, source_user_key: "" };
  const key = "kakao_login:2265", payload = {};
  await writeKakaoEditUndoItemsV4(fx.env, key, payload, [{ seq: 1, row, household_name: "합성", expires_at: Date.now() + 60000 }]);
  if (mode === "pending") {
    const p = await preview(fx), memory = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input).endsWith("/" + IMPORT) ? Promise.resolve(Response.json({ message: "deferred" }, { status: 503 })) : memory(input, init);
    await commit(fx, p); globalThis.fetch = memory;
  }
  const memory = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await memory(input, init);
    if (String(input).endsWith("/" + IMPORT)) {
      if (mode === "response-loss") return Response.json({ message: "lost after commit" }, { status: 503 });
      if (mode === "changed-fields") fx.db.transactions.find(r => r.id === row.id).memo += "!";
    }
    return response;
  };
  const result = await handleKakaoEditCommandV4(fx.env, { utterance: "복구 01번", household: { id: HOUSE, name: "합성" }, user: { id: USER }, role: "owner", kakaoUserKey: key, payload, origin: BASE });
  const responseText = await result.text();
  const success = ["success", "response-loss"].includes(mode);
  eq(responseText.includes("기록을 복구했어요"), success, `imported-row undo requires exact saved fields (${mode}: ${responseText})`);
  eq((await readKakaoEditUndoItemsV4(fx.env, key, payload)).length, success ? 0 : 1, "unconfirmed undo preserves its original buffer");
  eq(fx.db.transactions.filter(r => r.id === row.id).length, mode === "pending" ? 0 : 1, "undo retains the original fixed ID");
  eq(fx.db.transactions.find(r => r.id === row.id)?.source, mode === "pending" ? undefined : source, "undo retains both historical import sources");
  eq(fx.trace.filter(c => c.path.endsWith("/transactions") && c.method === "POST").length, 0, "imported-row undo uses the new RPC");
});

// The fixture row lock must cover asynchronous arrivals, not just atomic array edits.
await fixture(async fx => {
  const hash = sha("queued fixture"), original = serialized("a", "preview");
  await rpc(fx, SOURCE, sourceArgs(hash, null, original));
  let entered, release;
  const gate = new Promise(r => { release = r; }), reached = new Promise(r => { entered = r; });
  fx.db.__lifecycle_in_lock = async name => { if (name === PURGE) { entered(); await gate; } };
  const purging = rpc(fx, PURGE, { p_household_id: HOUSE }); await reached;
  let settled = false;
  const changing = rpc(fx, SOURCE, sourceArgs(hash, original, serialized("b", "preview"))).then(r => { settled = true; return r; });
  await new Promise(r => setTimeout(r, 10));
  eq(settled, false, "state CAS waits for the same household row lock");
  release(); eq((await purging).status, 200, "purge commits first");
  eq((await changing).data.message, "household_not_found", "late state cannot recreate purged ownership");
  eq(fx.db.accountbook_settings.some(r => r.key.startsWith("my_import_")), false, "no metadata resurrection after serialized purge");
});

const recoveryRoot = process.argv.find(a => a.startsWith("--recovery="))?.slice(11);
if (recoveryRoot) {
  const { pathToFileURL } = await import("node:url"), { resolve } = await import("node:path");
  const recovery = await import(pathToFileURL(resolve(recoveryRoot, "src/index.js")));
  await fixture(async fx => {
    const p = await preview(fx), memory = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input).endsWith("/" + IMPORT) ? Promise.resolve(Response.json({ message: "original still in flight" }, { status: 503 })) : memory(input, init);
    await commit(fx, p); globalThis.fetch = memory;
    const raw = state(fx, p), before = calls(fx, SOURCE).length;
    eq((await commit(fx, p, recovery)).status, 503, "compatible recovery rejects new import");
    eq([state(fx, p), calls(fx, SOURCE).length], [raw, before], "recovery retains exact original pending");
    await rejects(recovery.purgeHouseholdData(fx.env, HOUSE), /household_import_pending/);
  });
}
ok(readFileSync(new URL("../src/modules/my/backup-import.js", import.meta.url), "utf8").includes("p_expected_value: expectedValue"), "full expected text is a body parameter");
const applyDraft = readFileSync(new URL("../docs/db-review/v22961/10_APPLY_LIFECYCLE_REVIEW_ONLY.sql", import.meta.url), "utf8");
ok(applyDraft.includes("RAISE EXCEPTION 'v61_review_only_full_schema_and_cutover_approval_required'"), "review draft refuses execution until full-schema/cutover review");
ok(applyDraft.includes("NEW.source IN ('my_import','backup_import_v19_3')"), "SQL fence covers already-dispatched old administrator REST writes");
ok(applyDraft.includes("case when v_item->>'source' = 'backup_import_v19_3' then 'backup_import_v19_3' else 'my_import' end"), "guarded commit retains legacy import provenance on undo");
console.log(`PASS: V22.9.61 lifecycle Worker and DB model (${checks} checks); PostgreSQL not executed`);
