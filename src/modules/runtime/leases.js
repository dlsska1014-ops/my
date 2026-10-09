
function safeError(err) {
  if (!err) return "unknown";
  return String(err.message || err).slice(0, 400);
}

function logWorkerError(event = {}) {
  const record = {
    level: "error",
    event: String(event.event || "worker_error").slice(0, 80),
    path: String(event.path || "").slice(0, 240),
    method: String(event.method || "").slice(0, 16),
    label: String(event.label || "").slice(0, 120),
    trace_id: String(event.trace_id || "").slice(0, 120),
    error: safeError(event.error),
  };
  console.error(JSON.stringify(record));
}

function isUniqueConstraintError(err) {
  return /(?:Supabase\s+409|\b23505\b|duplicate key|unique constraint)/i.test(safeError(err));
}

function isOperationLockRpcUnavailable(err) {
  return /(?:Supabase\s+404|\bPGRST202\b|\b42883\b|schema cache|function\s+.*accountbook_(?:claim|release)_operation.*does not exist|could not find.*accountbook_(?:claim|release)_operation)/i.test(safeError(err));
}

async function withOperationMutex(rawKey, task) {
  const key = String(rawKey || "operation").slice(0, 300);
  const previous = AB_OPERATION_MUTEXES.get(key) || Promise.resolve();
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  AB_OPERATION_MUTEXES.set(key, tail);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    releaseGate();
    if (AB_OPERATION_MUTEXES.get(key) === tail) AB_OPERATION_MUTEXES.delete(key);
  }
}

function operationLeaseOwner(prefix = "worker") {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : randomHex(16);
  return `${String(prefix || "worker").slice(0, 40)}:${id}`.slice(0, 180);
}

async function claimOperationLease(env, { key, owner = operationLeaseOwner(), leaseSeconds = 600 } = {}) {
  const operationKey = String(key || "").trim().slice(0, 180);
  const cleanOwner = String(owner || operationLeaseOwner()).trim().slice(0, 180);
  const seconds = Math.round(boundedRuntimeNumber(leaseSeconds, 600, 15, 3600));
  if (!operationKey) throw new Error("operation lease key is required");
  try {
    const result = await supabase(env, "/rest/v1/rpc/accountbook_claim_operation", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_key: operationKey, p_owner: cleanOwner, p_lease_seconds: seconds }),
    });
    const record = Array.isArray(result) ? result[0] : result;
    const acquired = record === true || record?.acquired === true || record?.acquired === "true";
    return { acquired, mode: "database", key: operationKey, owner: cleanOwner, locked_until: record?.locked_until || "" };
  } catch (err) {
    if (!isOperationLockRpcUnavailable(err)) throw err;
    rememberOpsEvent({ kind: "operation_lock_unavailable", severity: "error", path: "/rest/v1/rpc/accountbook_claim_operation", method: "POST", detail: operationKey });
    throw new Error("database operation lease is unavailable");
  }
}

async function releaseOperationLease(env, lease = {}) {
  if (!lease?.acquired || !lease.key || !lease.owner) return false;
  try {
    await supabase(env, "/rest/v1/rpc/accountbook_release_operation", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_key: lease.key, p_owner: lease.owner }),
    });
    return true;
  } catch (err) {
    rememberOpsEvent({ kind: "operation_lock_release_failed", severity: "warn", path: "/rest/v1/rpc/accountbook_release_operation", method: "POST", detail: `${lease.key}:${safeError(err)}` });
    return false;
  }
}

function settingsDataError(kind = "settings", reason = "invalid") {
  const error = new Error(`${String(kind || "settings").replace(/[^a-z0-9_:-]/gi, "_")}_settings_${reason}`);
  error.name = "SettingsDataError";
  error.code = "settings_data_invalid";
  return error;
}

function parseStrictSettingsObject(value, kind = "settings") {
  if (value === undefined || value === null || value === "") return {};
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); }
    catch (_) { throw settingsDataError(kind, "malformed_json"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw settingsDataError(kind, "invalid_shape");
  return parsed;
}

function parseStrictSettingsArray(value, kind = "settings", options = {}) {
  if (value === undefined || value === null || value === "") return [];
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); }
    catch (_) { throw settingsDataError(kind, "malformed_json"); }
  }
  if (options.allowItemsObject === true && parsed && !Array.isArray(parsed) && Array.isArray(parsed.items)) parsed = parsed.items;
  if (!Array.isArray(parsed)) throw settingsDataError(kind, "invalid_shape");
  return parsed;
}

function assertSettingsLeaseFresh(lease = {}) {
  const expiry = Date.parse(String(lease?.locked_until || ""));
  if (!Number.isFinite(expiry) || expiry <= Date.now() + 1000) throw new Error("settings_rmw_lease_expired");
}

async function householdExistsForSettingsMutation(env, householdId = "") {
  const hid = String(householdId || "").trim();
  if (!hid) return false;
  const rows = await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(hid)}&select=id&limit=1`, { method: "GET" }) || [];
  return !!rows[0];
}

async function withSettingsRmwLease(env, lockKey = "", task, options = {}) {
  const key = String(lockKey || "").trim().slice(0, 180);
  if (!key) throw new Error("settings_rmw_key_required");
  const runWithDatabaseLease = async () => {
    const lease = await claimOperationLease(env, {
      key,
      owner: operationLeaseOwner("settings-rmw"),
      leaseSeconds: 90,
    });
    if (!lease.acquired) throw new Error("settings_rmw_busy");
    try {
      assertSettingsLeaseFresh(lease);
      const hid = String(options.householdId || "").trim();
      if (hid && !(await householdExistsForSettingsMutation(env, hid))) {
        if (options.missingHousehold === "noop") return options.missingResult;
        throw new Error("settings_rmw_household_missing");
      }
      return await task({ lease, assertFresh: () => assertSettingsLeaseFresh(lease) });
    } finally {
      await releaseOperationLease(env, lease);
    }
  };
  return options.localMutex === false ? runWithDatabaseLease() : withOperationMutex(key, runWithDatabaseLease);
}

function withHouseholdDatabaseLease(env, householdId = "", task, options = {}) {
  const hid = String(householdId || "").trim();
  if (!hid) throw new Error("household_id_required");
  return withSettingsRmwLease(env, `household-settings-rmw:${hid}`, task, { ...options, householdId: hid, localMutex: false });
}

function withHouseholdSettingsRmw(env, householdId = "", task, options = {}) {
  const hid = String(householdId || "").trim();
  if (!hid) throw new Error("household_id_required");
  return withSettingsRmwLease(env, `household-settings-rmw:${hid}`, task, { ...options, householdId: hid });
}

function withGlobalIdentitySettingsRmw(env, task) {
  return withSettingsRmwLease(env, "settings-rmw:user_identity_links", task);
}
