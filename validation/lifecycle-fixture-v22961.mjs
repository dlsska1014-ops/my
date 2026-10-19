import { createHash } from "node:crypto";

// A model of the V60 SQL protocol, not PostgreSQL evidence. Historical fixtures
// use symbolic household/member IDs; dedicated lifecycle cases use real UUIDs.
const sha = s => createHash("sha256").update(s).digest("hex");
const fail = message => { throw Error(message); };
const parse = raw => { try { return JSON.parse(raw); } catch (_) { return fail("invalid_json"); } };
const ordered = v => Array.isArray(v) ? v.map(ordered) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])])) : v;
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const left = (s, n) => Array.from(String(s ?? "")).slice(0, n).join("");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const owned = key => /^(my_import_source_v22955:|my_import_scope_v22959:)/.test(key || "");

export function createLifecycleContractModel(db, upsert, sequence) {
  const locks = new Map();
  const installed = () => db.__lifecycle_contract_installed !== false;
  const find = key => db.accountbook_settings.find(r => r.key === key);
  const household = hid => db.households.some(r => r.id === hid) || fail("household_not_found");
  function source(hid, hash, expected = null, next = null) {
    household(hid);
    if (!/^[a-f0-9]{64}$/.test(hash || "")) fail("import_source_scope_invalid");
    const key = `my_import_source_v22955:${sha(`${hid}|${hash}`)}`;
    const scope_key = `my_import_scope_v22959:${sha(hid)}:${hash}`;
    const scope_value = JSON.stringify({ v: 1, household_id: hid, source_hash: hash, state_key: key });
    if (find(scope_key) && find(scope_key).value !== scope_value) fail("import_source_scope_changed");
    let value = find(key)?.value ?? null;
    if (next !== null) {
      if (value !== expected) fail("import_source_state_changed");
      const st = parse(next);
      if (!st || Array.isArray(st) || st.v !== 1 || !/^[a-f0-9]{32}$/.test(st.revision || "") || !next.startsWith(`{"revision":"${st.revision}",`) || !["preview", "pending", "complete", "failed"].includes(st.state) || !Array.isArray(st.rows) || typeof st.jti !== "string" || !st.jti) fail("import_source_state_invalid");
      if (st.rows.length > 1000 || (st.state === "pending" ? !st.rows.length : st.rows.length !== 0) || st.rows.some(r => !uuid.test(r.id || "") || !/^[a-f0-9]{64}$/.test(r.hash || "")) || new Set(st.rows.map(r => r.id)).size !== st.rows.length) fail("import_source_state_invalid");
      const old = value === null ? null : parse(value);
      if (old?.state === "pending") {
        if (st.state === "pending" && (st.jti !== old.jti || !same(st.rows, old.rows))) fail("import_pending_identity_changed");
        if (st.state === "preview") fail("import_pending_unresolved");
        if (st.state === "failed" && old.rows.some(s => db.transactions.some(r => r.id === s.id))) fail("import_pending_rows_exist");
        if (st.state === "complete" && old.rows.some(s => !db.transactions.some(r => r.id === s.id && r.household_id === hid))) fail("import_pending_rows_missing");
      }
    }
    if (!find(scope_key)) upsert(db, "accountbook_settings", { key: scope_key, value: scope_value }, ["key"], sequence);
    if (next !== null) { upsert(db, "accountbook_settings", { key, value: next }, ["key"], sequence); value = next; }
    return { key, value, scope_key, scope_value };
  }
  function scopes(hid, forPurge = false) {
    const prefix = `my_import_scope_v22959:${sha(hid)}:`;
    const owners = db.accountbook_settings.filter(r => r.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key));
    if (owners.length > 1000) fail("household_purge_scope_too_large");
    return owners.map(owner => {
      const st = parse(owner.value);
      if (owner.key !== prefix + st.source_hash) fail("import_source_scope_invalid");
      if (forPurge) {
        if (!/^[a-f0-9]{64}$/.test(st.source_hash || "")) fail("import_source_scope_invalid");
        const key = `my_import_source_v22955:${sha(`${hid}|${st.source_hash}`)}`;
        if (!same(st, { v: 1, household_id: hid, source_hash: st.source_hash, state_key: key })) fail("import_source_scope_invalid");
        return { key, scope_key: owner.key, value: find(key)?.value ?? null };
      }
      return source(hid, st.source_hash);
    });
  }
  function commit(data) {
    const hid = data.p_household_id, hash = data.p_source_hash ?? null, expected = data.p_expected_value ?? null, rows = data.p_rows;
    household(hid);
    if (hash !== null) {
      const scope = source(hid, hash);
      if (expected === null || scope.value !== expected) fail("import_source_state_changed");
      const st = parse(expected);
      if (st.state !== "pending" || !Array.isArray(st.rows)) fail("import_source_not_pending");
      if (Array.isArray(rows) && rows.some(r => !st.rows.some(s => s.id === r.id))) fail("import_pending_identity_changed");
    } else {
      if (expected !== null) fail("import_source_scope_invalid");
      for (const scope of scopes(hid)) if (scope.value !== null && !["preview", "complete", "failed"].includes(parse(scope.value).state)) fail("household_import_pending");
    }
    if (!Array.isArray(rows)) fail("rows_must_be_array");
    if (!rows.length || rows.length > 1000) fail("invalid_import_size");
    let inserted = 0, duplicates = 0;
    for (const r of rows) {
      if (r.household_id !== hid) fail("import_household_scope_mismatch");
      if (!db.household_members.some(m => m.household_id === hid && m.user_id === r.user_id && !["blocked", "pending"].includes(m.role))) fail("import_spender_not_member");
      if (!(Number(r.amount) > 0)) fail("invalid_import_amount");
      if (!["income", "expense"].includes(r.type)) fail("invalid_import_type");
      if (!uuid.test(r.id || "")) fail("invalid_uuid");
      if (db.transactions.some(t => t.id === r.id)) { duplicates++; continue; }
      upsert(db, "transactions", { ...r, source: r.source === "backup_import_v19_3" ? r.source : "my_import", category: left(r.category, 80), memo: left(r.memo, 160), payment_method: left(r.payment_method, 40), source_user_key: left(r.source_user_key, 180), raw_text: left(r.raw_text, 500) }, ["id"], sequence);
      inserted++;
    }
    return { inserted, duplicates };
  }
  function purge(hid) {
    household(hid);
    const ownedScopes = scopes(hid, true);
    for (const scope of ownedScopes) if (scope.value !== null) {
      const st = parse(scope.value);
      if (st.state === "pending") fail("household_import_pending");
      if (st.v !== 1 || !/^[a-f0-9]{32}$/.test(st.revision || "") || !["preview", "complete", "failed"].includes(st.state) || !same(st.rows, [])) fail("import_source_state_invalid");
    }
    const removed = new Set(ownedScopes.flatMap(s => [s.key, s.scope_key]));
    db.accountbook_settings = db.accountbook_settings.filter(r => !removed.has(r.key));
    if (db.__lifecycle_fail_purge === "after-metadata") fail("qa_injected_failure");
    const members = db.household_members.filter(r => r.household_id === hid).map(r => r.user_id);
    db.households = db.households.filter(r => r.id !== hid);
    for (const t of ["household_members", "transactions", "accountbook_budgets", "accountbook_categories", "accountbook_recurring", "accountbook_meme_cards", "accountbook_transaction_audit"]) db[t] = (db[t] || []).filter(r => r.household_id !== hid);
    const exact = new Set(["custom_categories", "category_keywords", "payment_assets", "asset_history", "reserve_plans", "member_aliases", "transaction_edit_history", "settlement_history", "free_report_preference", "report_challenge", "goals:v5"].map(p => `${p}:${hid}`));
    const prefixes = ["budgets", "favorites:v5", "free_report_snapshot", "kakao_edit_v2254"].map(p => `${p}:${hid}:`);
    db.accountbook_settings = db.accountbook_settings.filter(r => !exact.has(r.key) && !prefixes.some(p => r.key.startsWith(p)) && !(r.key.startsWith("kakao_cta_v215:") && r.key.includes(`:${hid}:`)) && !(r.key.startsWith("kakao_selected_household_v2251:") && r.value.trim() === hid) && !members.some(id => r.key.startsWith(`kakao_flow_v215:${id}:`)));
    if (db.__lifecycle_fail_purge === "after-relational") fail("qa_injected_failure");
    return { deleted: true, household_id: hid, import_sources: ownedScopes.length };
  }
  return {
    installed,
    protects(table, method, items, existing) {
      if (!installed() || ["GET", "HEAD"].includes(method)) return false;
      return table === "households" && method === "DELETE" || table === "transactions" && method === "POST" && items.some(r => ["my_import", "backup_import_v19_3"].includes(r.source)) || table === "accountbook_settings" && [...items, ...(method === "POST" ? [] : existing)].some(r => owned(r.key));
    },
    async rpc(name, data) {
      if (!installed() || name === "accountbook_commit_import_v22960" && db.__import_rpc_available === false) return Response.json({ code: "PGRST202", message: "RPC not found" }, { status: 404 });
      if (name === "accountbook_commit_import_v22960" && Number(db.__fail_transaction_writes || 0) > 0) { db.__fail_transaction_writes--; return Response.json({ message: "simulated network write failure" }, { status: 503 }); }
      const hid = data.p_household_id, prior = locks.get(hid) || Promise.resolve();
      let release;
      const barrier = new Promise(r => { release = r; }), tail = prior.then(() => barrier);
      locks.set(hid, tail);
      await prior;
      try {
        await db.__lifecycle_in_lock?.(name, data);
        const tables = ["households", "household_members", "transactions", "accountbook_settings", "accountbook_budgets", "accountbook_categories", "accountbook_recurring", "accountbook_meme_cards", "accountbook_transaction_audit"];
        const saved = Object.fromEntries(tables.map(t => [t, structuredClone(db[t] || [])])), seq = sequence.value;
        try {
          const result = name === "accountbook_import_source_v22960" ? source(hid, data.p_source_hash, data.p_expected_value ?? null, data.p_next_value ?? null) : name === "accountbook_commit_import_v22960" ? commit(data) : purge(hid);
          if (name === "accountbook_commit_import_v22960" && Number(db.__lose_next_transaction_response || 0) > 0) { db.__lose_next_transaction_response--; return Response.json({ message: "simulated response loss after commit" }, { status: 503 }); }
          return Response.json(result);
        } catch (e) {
          Object.assign(db, saved); sequence.value = seq;
          return Response.json({ code: "P0001", message: e.message }, { status: 400 });
        }
      } finally { release(); if (locks.get(hid) === tail) locks.delete(hid); }
    },
  };
}
