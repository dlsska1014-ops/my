const clone = (value) => JSON.parse(JSON.stringify(value));

function wildcardRegex(pattern = "") {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[\*%]/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesFilter(row, key, expression) {
  if (key === "or" || key === "and") return true;
  const decoded = decodeURIComponent(String(expression || ""));
  const dot = decoded.indexOf(".");
  const operator = dot >= 0 ? decoded.slice(0, dot) : "eq";
  const expected = dot >= 0 ? decoded.slice(dot + 1) : decoded;
  const actual = String(row?.[key] ?? "");
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "gte") return actual >= expected;
  if (operator === "gt") return actual > expected;
  if (operator === "lte") return actual <= expected;
  if (operator === "lt") return actual < expected;
  if (operator === "like" || operator === "ilike") {
    const regex = wildcardRegex(operator === "ilike" ? expected.toLowerCase() : expected);
    return regex.test(operator === "ilike" ? actual.toLowerCase() : actual);
  }
  if (operator === "in") {
    const values = expected.replace(/^\(|\)$/g, "").split(",").map((value) => value.replace(/^"|"$/g, ""));
    return values.includes(actual);
  }
  if (operator === "is") return expected === "null" ? row?.[key] == null : actual === expected;
  return true;
}

function filteredRows(db, table, url) {
  let rows = clone(db[table] || []);
  const ignored = new Set(["select", "order", "limit", "offset", "on_conflict"]);
  for (const key of new Set(url.searchParams.keys())) {
    if (ignored.has(key)) continue;
    const expressions = url.searchParams.getAll(key);
    rows = rows.filter((row) => expressions.every((expression) => matchesFilter(row, key, expression)));
  }
  const order = String(url.searchParams.get("order") || "");
  if (order) {
    const rules = order.split(",").map((rule) => rule.trim().split("."));
    rows.sort((a, b) => {
      for (const [key, direction] of rules) {
        const av = String(a?.[key] ?? "");
        const bv = String(b?.[key] ?? "");
        if (av === bv) continue;
        return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
  }
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const limit = Math.max(0, Number(url.searchParams.get("limit") || rows.length || 0));
  return rows.slice(offset, offset + (Number.isFinite(limit) ? limit : rows.length));
}

function upsert(db, table, item, keys, sequence) {
  const rows = db[table] || (db[table] = []);
  const index = rows.findIndex((row) => keys.every((key) => String(row?.[key] ?? "") === String(item?.[key] ?? "")));
  const existing = index >= 0 ? rows[index] : {};
  const saved = {
    ...existing,
    ...item,
    id: item.id || existing.id || `${table}-${sequence.value++}`,
    created_at: item.created_at || existing.created_at || new Date().toISOString(),
  };
  if (index >= 0) rows[index] = saved;
  else rows.push(saved);
  return clone(saved);
}

function normalizedReceiptFingerprint(row = {}) {
  return String(row.raw_text || row.memo || "").trim().toLowerCase().replace(/\s+/g, "");
}

function transactionUniqueConflict(rows = [], item = {}) {
  if (item.source === "recurring_auto" && String(item.raw_text || "").trim()) {
    return rows.some((row) => row.source === "recurring_auto" && row.household_id === item.household_id && row.raw_text === item.raw_text);
  }
  if (["receipt_confirmed", "receipt"].includes(String(item.source || ""))) {
    const fingerprint = normalizedReceiptFingerprint(item);
    if (!fingerprint) return false;
    return rows.some((row) => ["receipt_confirmed", "receipt"].includes(String(row.source || ""))
      && row.household_id === item.household_id
      && row.transaction_date === item.transaction_date
      && Number(row.amount || 0) === Number(item.amount || 0)
      && normalizedReceiptFingerprint(row) === fingerprint);
  }
  return false;
}

async function signedSessionCookie(userId, secret) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${expires}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString("base64url")}`)}`;
}

export async function createV2265QaFixture() {
  const createdAt = "2026-07-01T00:00:00.000Z";
  const db = {
    users: [
      { id: "user-bin", kakao_user_key: "kakao_login:2265", nickname: "Bin", created_at: createdAt },
      { id: "user-wifi", kakao_user_key: "kakao_login:2266", nickname: "WIFI♥", created_at: createdAt },
    ],
    households: [
      { id: "house-home", name: "우리집 생활비", invite_code: "HOME2265", created_at: createdAt },
      { id: "house-trip", name: "7월 제주여행", invite_code: "TRIP2265", created_at: createdAt },
    ],
    household_members: [
      { household_id: "house-home", user_id: "user-bin", role: "owner", created_at: createdAt },
      { household_id: "house-home", user_id: "user-wifi", role: "member", created_at: "2026-07-02T00:00:00.000Z" },
      { household_id: "house-trip", user_id: "user-bin", role: "owner", created_at: "2026-07-03T00:00:00.000Z" },
    ],
    transactions: [
      { id: "tx-income-1", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-01", type: "income", amount: 3200000, category: "급여", memo: "7월 월급", payment_method: "급여통장", source: "web", raw_text: "월급 320만원" },
      { id: "tx-income-2", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-05", type: "income", amount: 180000, category: "부수입", memo: "중고판매", payment_method: "카카오뱅크", source: "kakao", raw_text: "당근 18만원 입금" },
      { id: "tx-expense-1", household_id: "house-home", user_id: "user-wifi", transaction_date: "2026-07-04", type: "expense", amount: 148000, category: "식비", memo: "주말 장보기", payment_method: "국민카드", source: "kakao", raw_text: "마트 148000 국민카드" },
      { id: "tx-expense-2", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-07", type: "expense", amount: 72000, category: "교통", memo: "주유", payment_method: "현대카드", source: "web", raw_text: "주유 72000 현대카드" },
      { id: "tx-expense-3", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-09", type: "expense", amount: 28600, category: "카페/간식", memo: "가족 카페", payment_method: "카카오페이", source: "kakao", raw_text: "카페 28600 카카오페이" },
      { id: "tx-trip-1", household_id: "house-trip", user_id: "user-bin", transaction_date: "2026-07-12", type: "expense", amount: 215000, category: "여행", memo: "숙소 예약", payment_method: "국민카드", source: "web", raw_text: "숙소 215000" },
    ],
    accountbook_budgets: [
      { id: "budget-income-1", household_id: "house-home", month: "2026-07", category: "__income:급여", amount: 3200000, created_at: createdAt },
      { id: "budget-income-2", household_id: "house-home", month: "2026-07", category: "__income:부수입", amount: 300000, created_at: createdAt },
      { id: "budget-food", household_id: "house-home", month: "2026-07", category: "식비", amount: 800000, created_at: createdAt },
      { id: "budget-traffic", household_id: "house-home", month: "2026-07", category: "교통", amount: 250000, created_at: createdAt },
      { id: "budget-cafe", household_id: "house-home", month: "2026-07", category: "카페/간식", amount: 180000, created_at: createdAt },
      { id: "budget-legacy-total", household_id: "house-home", month: "2026-07", category: "__total", amount: 2500000, created_at: createdAt },
    ],
    accountbook_categories: [],
    accountbook_recurring: [
      { id: "recurring-rent", household_id: "house-home", type: "expense", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: 5, user_id: "user-bin", is_active: true, last_applied_month: "2026-06", created_at: createdAt },
    ],
    accountbook_settings: [
      { id: "setting-alias", key: "member_aliases:house-home", value: JSON.stringify({ "user-bin": "Bin", "user-wifi": "WIFI♥" }), created_at: createdAt },
      { id: "setting-payment", key: "payment_assets:house-home", value: JSON.stringify([{ id: "asset-1", name: "국민카드", kind: "credit_card", balance: 0 }, { id: "asset-2", name: "급여통장", kind: "bank_account", balance: 5200000 }]), created_at: createdAt },
      { id: "setting-reserve", key: "reserve_plans:house-home", value: JSON.stringify([{ id: "reserve-1", name: "자동차보험", amount: 1200000, due_months: [8], recurrence: "annual" }]), created_at: createdAt },
    ],
    accountbook_meme_cards: [],
    accountbook_user_identities: [],
    accountbook_user_security: [],
    accountbook_operation_locks: [],
    nlu_failure_samples: [],
    nlu_intent_metrics_hourly: [],
  };
  const sequence = { value: 1 };
  db.__operation_rpc_available = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") return originalFetch(input, init);
    const method = String(init.method || "GET").toUpperCase();
    const data = init.body ? JSON.parse(String(init.body)) : null;
    const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpcMatch) {
      if (db.__operation_rpc_available === false) {
        return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      const rpcName = rpcMatch[1];
      if (rpcName === "accountbook_claim_operation") {
        const now = Date.now();
        const key = String(data?.p_key || "").slice(0, 180);
        const owner = String(data?.p_owner || "").slice(0, 180);
        const seconds = Math.max(15, Math.min(3600, Number(data?.p_lease_seconds || 600)));
        let row = db.accountbook_operation_locks.find((item) => item.operation_key === key);
        if (!row) {
          row = { operation_key: key, owner, locked_until: new Date(now + seconds * 1000).toISOString(), updated_at: new Date(now).toISOString() };
          db.accountbook_operation_locks.push(row);
        } else if (Date.parse(row.locked_until) <= now || row.owner === owner) {
          Object.assign(row, { owner, locked_until: new Date(now + seconds * 1000).toISOString(), updated_at: new Date(now).toISOString() });
        }
        return new Response(JSON.stringify({ acquired: row.owner === owner && Date.parse(row.locked_until) > now, operation_key: key, owner: row.owner, locked_until: row.locked_until }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_release_operation") {
        const row = db.accountbook_operation_locks.find((item) => item.operation_key === String(data?.p_key || "") && item.owner === String(data?.p_owner || ""));
        if (row) row.locked_until = new Date().toISOString();
        return new Response(JSON.stringify({ released: !!row }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_leave_household_v227") {
        const householdId = String(data?.p_household_id || "");
        const userId = String(data?.p_user_id || "");
        const membership = db.household_members.find((item) => item.household_id === householdId && item.user_id === userId);
        if (!membership) return new Response(JSON.stringify({ left: false }), { status: 200, headers: { "content-type": "application/json" } });
        if (membership.role === "owner") return new Response(JSON.stringify({ code: "P0001", message: "household_owner_cannot_leave" }), { status: 400, headers: { "content-type": "application/json" } });
        db.household_members = db.household_members.filter((item) => !(item.household_id === householdId && item.user_id === userId));
        return new Response(JSON.stringify({ left: true, household_id: householdId, user_id: userId }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_purge_household_v227") {
        const householdId = String(data?.p_household_id || "");
        const household = db.households.find((item) => item.id === householdId);
        if (!household) return new Response(JSON.stringify({ deleted: false }), { status: 200, headers: { "content-type": "application/json" } });
        db.households = db.households.filter((item) => item.id !== householdId);
        for (const table of ["household_members", "transactions", "accountbook_budgets", "accountbook_categories", "accountbook_recurring", "accountbook_meme_cards"]) {
          db[table] = (db[table] || []).filter((item) => item.household_id !== householdId);
        }
        db.accountbook_settings = db.accountbook_settings.filter((item) => !String(item.key || "").includes(householdId));
        return new Response(JSON.stringify({ deleted: true, household_id: householdId }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_update_transaction_v227") {
        const transactionId = String(data?.p_transaction_id || "");
        const householdId = String(data?.p_household_id || "");
        const patch = data?.p_patch && typeof data.p_patch === "object" ? data.p_patch : {};
        const row = db.transactions.find((item) => String(item.id) === transactionId && String(item.household_id) === householdId);
        if (!row) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        Object.assign(row, patch);
        return new Response(JSON.stringify([clone(row)]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_delete_transaction_v227") {
        const transactionId = String(data?.p_transaction_id || "");
        const householdId = String(data?.p_household_id || "");
        const row = db.transactions.find((item) => String(item.id) === transactionId && String(item.household_id) === householdId);
        if (!row) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        db.transactions = db.transactions.filter((item) => String(item.id) !== transactionId);
        return new Response(JSON.stringify([clone(row)]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ code: "PGRST202", message: "RPC not found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    const table = url.pathname.split("/").filter(Boolean).at(-1);
    if (!db[table]) db[table] = [];
    if (method === "GET") {
      return new Response(JSON.stringify(filteredRows(db, table, url)), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST") {
      const items = Array.isArray(data) ? data : [data];
      if (table === "transactions" && items.some((item) => transactionUniqueConflict(db.transactions, item))) {
        return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), { status: 409, headers: { "content-type": "application/json" } });
      }
      const saved = items.map((item) => {
        if (table === "users") return upsert(db, table, item, ["kakao_user_key"], sequence);
        if (table === "household_members") return upsert(db, table, item, ["household_id", "user_id"], sequence);
        if (table === "accountbook_settings") return upsert(db, table, item, ["key"], sequence);
        if (table === "accountbook_budgets") return upsert(db, table, item, ["household_id", "month", "category"], sequence);
        return upsert(db, table, item, ["id"], sequence);
      });
      return new Response(JSON.stringify(saved), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (method === "PATCH") {
      const matches = filteredRows(db, table, url);
      const ids = new Set(matches.map((row) => row.id || `${row.household_id}|${row.user_id}`));
      db[table] = db[table].map((row) => ids.has(row.id || `${row.household_id}|${row.user_id}`) ? { ...row, ...data } : row);
      return new Response(JSON.stringify(matches.map((row) => ({ ...row, ...data }))), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "DELETE") {
      const matches = filteredRows(db, table, url);
      const ids = new Set(matches.map((row) => row.id || `${row.household_id}|${row.user_id}`));
      db[table] = db[table].filter((row) => !ids.has(row.id || `${row.household_id}|${row.user_id}`));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };

  const env = {
    APP_NAME: "똑똑한가계부",
    PUBLIC_BASE_URL: "https://ttokttok-accountbook.com",
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "qa-key",
    USER_SESSION_SECRET: "qa-user-session-v2265",
    MY_IMPORT_TOKEN_SECRET: "qa-import-v2265",
  };
  const cookie = await signedSessionCookie("user-bin", env.USER_SESSION_SECRET);
  return {
    db,
    env,
    cookie,
    cookieFor(userId) { return signedSessionCookie(userId, env.USER_SESSION_SECRET); },
    restore() { globalThis.fetch = originalFetch; },
  };
}
