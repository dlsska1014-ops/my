// Cloudflare Workers 운영 런타임(workerd)은 PBKDF2 반복 횟수가 100,000 을 넘는 deriveBits·deriveKey 를
// NotSupportedError 로 거절한다. Node 에는 이 상한이 없어 210,000 회 해시가 모든 검사를 통과했고 운영 가입만
// 실패했다(V22.9.35). 이 픽스처를 쓰는 검사 프로세스에도 같은 상한을 둔다.
export const WORKERS_PBKDF2_MAX_ITERATIONS = 100000;
(function installWorkersPbkdf2Cap() {
  const proto = globalThis.crypto?.subtle && Object.getPrototypeOf(globalThis.crypto.subtle);
  if (!proto || Object.prototype.hasOwnProperty.call(proto, "__abWorkersPbkdf2Cap")) return;
  for (const method of ["deriveBits", "deriveKey"]) {
    const original = proto[method];
    Object.defineProperty(proto, method, {
      configurable: true,
      writable: true,
      value: function cappedPbkdf2(algorithm, ...rest) {
        const name = String(algorithm?.name || algorithm || "").toUpperCase();
        const iterations = Number(algorithm?.iterations);
        if (name === "PBKDF2" && iterations > WORKERS_PBKDF2_MAX_ITERATIONS) {
          return Promise.reject(new DOMException(`Pbkdf2 failed: iteration counts above ${WORKERS_PBKDF2_MAX_ITERATIONS} are not supported (requested ${iterations}).`, "NotSupportedError"));
        }
        return original.call(this, algorithm, ...rest);
      },
    });
  }
  Object.defineProperty(proto, "__abWorkersPbkdf2Cap", { value: WORKERS_PBKDF2_MAX_ITERATIONS });
})();

const clone = (value) => JSON.parse(JSON.stringify(value));

function wildcardRegex(pattern = "") {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[\*%]/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesFilter(row, key, expression) {
  if (key === "or" || key === "and") return true;
  // URL.searchParams has already decoded the query once, as PostgREST receives it.
  const decoded = String(expression || "");
  const dot = decoded.indexOf(".");
  const operator = dot >= 0 ? decoded.slice(0, dot) : "eq";
  const expected = dot >= 0 ? decoded.slice(dot + 1) : decoded;
  const actual = String(row?.[key] ?? "");
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  const comparable = /^-?\d+(?:\.\d+)?$/.test(actual) && /^-?\d+(?:\.\d+)?$/.test(expected)
    ? [Number(actual), Number(expected)]
    : [actual, expected];
  if (operator === "gte") return comparable[0] >= comparable[1];
  if (operator === "gt") return comparable[0] > comparable[1];
  if (operator === "lte") return comparable[0] <= comparable[1];
  if (operator === "lt") return comparable[0] < comparable[1];
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
  const limit = Math.min(Number(db.__max_rows || Infinity), Math.max(0, Number(url.searchParams.get("limit") || rows.length || 0)));
  return rows.slice(offset, offset + (Number.isFinite(limit) ? limit : rows.length));
}

// V22.9.16: PostgREST 자원 포함(`select=...,households(id,name)`) 흉내. 다대일 외래키
// `<단수>_id` 로 상대 표의 한 행을 찾아 붙인다. 없으면 null — 실제 PostgREST 와 같다.
// 서버는 외래키가 없을 때 두 단계 조회로 돌아가므로, 픽스처의 `db.__embed_unsupported = true`
// 로 그 길도 검사할 수 있다(그때는 실제 PostgREST 처럼 400 을 돌려준다).
function embedRelatedRows(db, rows, select = "") {
  const embeds = [...String(select || "").matchAll(/([a-z_]+)\(([^)]*)\)/g)];
  if (!embeds.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const [, table, columns] of embeds) {
      if (table === "accountbook_user_security") {
        out[table] = (db[table] || []).filter(item => String(item.user_id) === String(row.id)).map(item => ({session_version:item.session_version}));
        continue;
      }
      const foreignKey = `${table.replace(/s$/, "")}_id`;
      const target = (db[table] || []).find((item) => String(item.id) === String(row[foreignKey] ?? "")) || null;
      const wanted = columns.split(",").map((column) => column.trim()).filter(Boolean);
      out[table] = target
        ? Object.fromEntries((wanted.length && !wanted.includes("*") ? wanted : Object.keys(target)).map((column) => [column, target[column]]))
        : null;
    }
    return out;
  });
}

// V22.9.33: 실제 PostgREST 는 select 에 적은 칸만 돌려준다. db.__honor_select = true 이면 픽스처도 그렇게 한다.
// 세 칸만 읽은 행으로 수정 폼을 그려 운영에서만 빈 폼이 되던 결함(감사 T1)을 검사가 잡도록 둔다. 기본은 꺼 둔다.
function projectSelectedColumns(rows, select = "") {
  const text = String(select || "").trim();
  if (!text) return rows;
  const columns = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { columns.push(current.trim()); current = ""; } else current += ch;
  }
  if (current.trim()) columns.push(current.trim());
  if (columns.includes("*")) return rows;
  const pairs = columns.map((column) => {
    const name = column.replace(/\(.*$/s, "").trim();
    const [alias, source] = name.includes(":") ? name.split(":").map((part) => part.trim()) : [name, name];
    return [alias, source];
  }).filter(([alias]) => alias);
  return rows.map((row) => Object.fromEntries(pairs.filter(([, source]) => source in row).map(([alias, source]) => [alias, row[source]])));
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

export async function createV2265QaFixture(options = {}) {
  const categoriesPresent = options.categoriesPresent ?? process.env.AB_QA_CATEGORIES_ABSENT !== "1";
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
  db.__rpc_calls = [];
  db.__settings_write_count = 0;
  db.__operation_claim_count = 0;
  db.__operation_release_count = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") return originalFetch(input, init);
    const method = String(init.method || "GET").toUpperCase();
    const data = init.body ? JSON.parse(String(init.body)) : null;
    const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpcMatch) {
      const rpcName = rpcMatch[1];
      db.__rpc_calls.push({ name: rpcName, data: clone(data || {}) });
      if (typeof db.__before_rpc === "function") await db.__before_rpc(rpcName, clone(data || {}));
      if (db.__operation_rpc_available === false || (db.__missing_rpcs || []).includes(rpcName)) {
        return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      // Opt-in model of schema_v22_7_0_auth_atomicity.sql for import round-trip tests.
      if (rpcName === "accountbook_import_transactions_v227" && db.__import_rpc_available === true) {
        const rows = data?.p_rows;
        const householdId = String(data?.p_household_id || "");
        const error = !Array.isArray(rows) ? "rows_must_be_array"
          : rows.length < 1 || rows.length > 1000 ? "invalid_import_size"
          : rows.find(item => String(item.household_id) !== householdId) ? "import_household_scope_mismatch"
          : rows.find(item => !db.household_members.some(member => member.household_id === householdId && member.user_id === item.user_id && !["blocked", "pending"].includes(member.role))) ? "import_spender_not_member"
          : rows.find(item => !(Number(item.amount) > 0)) ? "invalid_import_amount"
          : rows.find(item => !["income", "expense"].includes(item.type)) ? "invalid_import_type" : "";
        // Validate the complete batch before mutation, matching the SQL transaction.
        if (error) return new Response(JSON.stringify({ code: "P0001", message: error }), { status: 400, headers: { "content-type": "application/json" } });
        let inserted = 0;
        let duplicates = 0;
        for (const item of rows) {
          if (db.transactions.some(row => row.id === item.id)) { duplicates++; continue; }
          upsert(db, "transactions", { ...clone(item), source: "my_import" }, ["id"], sequence);
          inserted++;
        }
        return new Response(JSON.stringify({ inserted, duplicates }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_auth_attempt") {
        if (db.__enforce_auth_rate) {
          db.__auth_attempts ||= new Map();
          const attempts = data.p_success ? 0 : Number(db.__auth_attempts.get(data.p_key) || 0)+1;
          db.__auth_attempts.set(data.p_key,attempts);
          return new Response(JSON.stringify({allowed:attempts<=Number(data.p_limit),attempts,blocked_until:null}), {headers:{"content-type":"application/json"}});
        }
        return new Response(JSON.stringify({ allowed: true, attempts: data?.p_success ? 0 : 1, blocked_until: null }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_set_local_identity_v227" && db.__operation_rpc_available !== false) {
        if (!db.users.some(row=>row.id===data.p_user_id) || String(data.p_credential_hash || "").length < 20 || String(data.p_credential_salt || "").length < 16 || Number(data.p_credential_iterations) < 100000) return new Response(JSON.stringify({message:"invalid_credential"}),{status:400});
        const subject=String(data.p_login_name).normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
        if (db.accountbook_user_identities.some(row=>row.provider==="local"&&row.provider_subject===subject&&row.user_id!==data.p_user_id)) return new Response(JSON.stringify({message:"login_name_in_use"}),{status:400});
        const index=db.accountbook_user_identities.findIndex(row=>row.provider==="local"&&row.user_id===data.p_user_id);
        const identity={user_id:data.p_user_id,provider:"local",provider_subject:subject,login_name:data.p_login_name,credential_hash:data.p_credential_hash,credential_salt:data.p_credential_salt,credential_iterations:data.p_credential_iterations,credential_version:2};
        if(index>=0) db.accountbook_user_identities[index]=identity;else db.accountbook_user_identities.push(identity);
        const security=db.accountbook_user_security.find(row=>row.user_id===data.p_user_id);
        const version=Number(security?.session_version||1)+(data.p_revoke_sessions?1:0);
        upsert(db,"accountbook_user_security",{user_id:data.p_user_id,session_version:version,password_changed_at:new Date().toISOString()},["user_id"],sequence);
        return new Response(JSON.stringify({saved:true,session_version:version,login_name:data.p_login_name}),{headers:{"content-type":"application/json"}});
      }
      if (rpcName === "accountbook_create_local_user_v227") {
        if (db.__create_local_user_error) {
          const simulated = db.__create_local_user_error;
          return new Response(JSON.stringify({ code: simulated.code || "PGRST202", message: simulated.message || "simulated account creation failure" }), { status: Number(simulated.status || 404), headers: { "content-type": "application/json" } });
        }
        const loginName = String(data?.p_login_name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
        const nickname = String(data?.p_nickname || "").trim();
        if (loginName.length < 2 || loginName.length > 80) {
          return new Response(JSON.stringify({ code: "P0001", message: "invalid_login_name" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        if (db.accountbook_user_identities.some((item) => item.provider === "local" && item.provider_subject === loginName)) {
          return new Response(JSON.stringify({ code: "P0001", message: "login_name_in_use" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        if (String(data?.p_credential_hash || "").length < 20 || String(data?.p_credential_salt || "").length < 16 || Number(data?.p_credential_iterations || 0) < 100000) {
          return new Response(JSON.stringify({ code: "P0001", message: "invalid_credential" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        const user = upsert(db, "users", { kakao_user_key: `local_account:qa-${sequence.value}`, nickname: nickname || loginName }, ["kakao_user_key"], sequence);
        upsert(db, "accountbook_user_identities", {
          user_id: user.id,
          provider: "local",
          provider_subject: loginName,
          login_name: String(data?.p_login_name || "").slice(0, 80),
          credential_hash: String(data?.p_credential_hash || ""),
          credential_salt: String(data?.p_credential_salt || ""),
          credential_iterations: Number(data?.p_credential_iterations || 0),
          credential_version: 2,
        }, ["provider", "user_id"], sequence);
        upsert(db, "accountbook_user_security", { user_id: user.id, session_version: 1, password_changed_at: new Date().toISOString() }, ["user_id"], sequence);
        return new Response(JSON.stringify({ id: user.id, kakao_user_key: user.kakao_user_key, nickname: user.nickname }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_claim_operation") {
        db.__operation_claim_count += 1;
        if (db.__fail_next_operation_claim) {
          db.__fail_next_operation_claim = false;
          return new Response(JSON.stringify({ code: "QA_OPERATION_CLAIM_FAILED", message: "simulated operation claim failure" }), { status: 503, headers: { "content-type": "application/json" } });
        }
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
        db.__operation_release_count += 1;
        if (db.__fail_next_operation_release) {
          db.__fail_next_operation_release = false;
          return new Response(JSON.stringify({ code: "QA_OPERATION_RELEASE_FAILED", message: "simulated operation release failure" }), { status: 503, headers: { "content-type": "application/json" } });
        }
        const row = db.accountbook_operation_locks.find((item) => item.operation_key === String(data?.p_key || "") && item.owner === String(data?.p_owner || ""));
        if (row) row.locked_until = new Date().toISOString();
        return new Response(JSON.stringify({ released: !!row }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_mutate_payment_assets_v2271") {
        const key = `payment_assets:${String(data?.p_household_id || "")}`;
        const setting = db.accountbook_settings.find((item) => item.key === key);
        let assets = [];
        try { assets = JSON.parse(setting?.value || "[]"); } catch (_) { assets = []; }
        const action = String(data?.p_action || "");
        const asset = data?.p_asset && typeof data.p_asset === "object" ? clone(data.p_asset) : {};
        const assetId = String(data?.p_asset_id || asset.id || "");
        if (action === "create") assets = assets.filter((item) => String(item.id) !== String(asset.id)).concat([asset]);
        else if (action === "update") assets = assets.map((item) => String(item.id) === assetId ? asset : item);
        else if (action === "delete") assets = assets.filter((item) => String(item.id) !== assetId);
        else return new Response(JSON.stringify({ code: "QA_ASSET_ACTION_INVALID", message: "asset_action_invalid" }), { status: 400, headers: { "content-type": "application/json" } });
        upsert(db, "accountbook_settings", { key, value: JSON.stringify(assets) }, ["key"], sequence);
        return new Response(JSON.stringify(assets), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_apply_recurring_v227") {
        const householdId = String(data?.p_household_id || "");
        const month = String(data?.p_month || "");
        if (!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)) return new Response(JSON.stringify({ code: "P0001", message: "invalid_month" }), { status: 400 });
        const rules = db.accountbook_recurring.filter((item) => item.household_id === householdId && item.is_active !== false && String(item.last_applied_month || "") !== month);
        if (rules.some((rule) => !rule.user_id || !db.household_members.some((member) => member.household_id === householdId && member.user_id === rule.user_id && !["blocked", "pending"].includes(member.role)))) return new Response(JSON.stringify({ code: "P0001", message: "recurring_spender_required" }), { status: 400 });
        const [year, monthNumber] = month.split("-").map(Number);
        const monthLastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
        let inserted = 0;
        for (const rule of rules) {
          const day = Math.min(monthLastDay, Math.max(1, Number(rule.day_of_month ?? 1)));
          const date = month + "-" + String(day).padStart(2, "0");
          const rawText = "recurring:" + rule.id + ":" + month;
          const type = rule.type === "income" ? "income" : "expense";
          const duplicate = db.transactions.some((tx) => tx.household_id === householdId && tx.source === "recurring_auto" && (tx.raw_text === rawText || (tx.transaction_date === date && tx.type === type && Number(tx.amount) === Number(rule.amount) && tx.memo === rule.memo && tx.category === rule.category)));
          if (!duplicate) {
            upsert(db, "transactions", { household_id: householdId, user_id: rule.user_id, type, amount: rule.amount, category: rule.category, memo: rule.memo, payment_method: rule.payment_method, transaction_date: date, source: "recurring_auto", raw_text: rawText }, ["id"], sequence);
            inserted += 1;
          }
        }
        for (const rule of rules) rule.last_applied_month = month;
        return new Response(JSON.stringify({ inserted, skipped: rules.length - inserted }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (rpcName === "accountbook_replace_budget_plan_v227") {
        const householdId = String(data?.p_household_id || "");
        const month = String(data?.p_month || "");
        const rows = Array.isArray(data?.p_rows) ? data.p_rows : [];
        db.accountbook_budgets = db.accountbook_budgets.filter((item) => !(item.household_id === householdId && item.month === month));
        for (const item of rows) {
          const category = String(item?.category || "").trim().slice(0, 80);
          const amount = Math.max(0, Math.round(Number(item?.amount || 0)));
          if (!category || !amount) continue;
          upsert(db, "accountbook_budgets", { household_id: householdId, month, category, amount }, ["household_id", "month", "category"], sequence);
        }
        const settingsKey = `budgets:${householdId}:${month}`;
        db.accountbook_settings = db.accountbook_settings.filter((item) => item.key !== settingsKey);
        return new Response(JSON.stringify({ saved: rows.length }), { status: 200, headers: { "content-type": "application/json" } });
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
        const memberIds = db.household_members.filter(item => item.household_id === householdId).map(item => String(item.user_id));
        db.households = db.households.filter((item) => item.id !== householdId);
        for (const table of ["household_members", "transactions", "accountbook_budgets", "accountbook_categories", "accountbook_recurring", "accountbook_meme_cards", "accountbook_transaction_audit"]) {
          db[table] = (db[table] || []).filter((item) => item.household_id !== householdId);
        }
        // Match 02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql's explicit keys/prefixes. An
        // arbitrary household-id substring must not delete durable lifecycle metadata.
        const exactKeys = new Set(["custom_categories", "category_keywords", "payment_assets", "asset_history", "reserve_plans", "member_aliases", "transaction_edit_history", "settlement_history", "free_report_preference", "report_challenge", "goals:v5"].map(prefix => `${prefix}:${householdId}`));
        const prefixes = ["budgets", "favorites:v5", "free_report_snapshot", "kakao_edit_v2254"].map(prefix => `${prefix}:${householdId}:`);
        db.accountbook_settings = db.accountbook_settings.filter(item => {
          const key = String(item.key || "");
          return !exactKeys.has(key) && !prefixes.some(prefix => key.startsWith(prefix)) &&
            !(key.startsWith("kakao_cta_v215:") && key.includes(`:${householdId}:`)) &&
            !(key.startsWith("kakao_selected_household_v2251:") && String(item.value || "").trim() === householdId) &&
            !memberIds.some(id => key.startsWith(`kakao_flow_v215:${id}:`));
        });
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
    if (table === "accountbook_categories" && !categoriesPresent) return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table public.accountbook_categories in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
    if (!db[table]) db[table] = [];
    if (method === "GET") {
      if (table === "accountbook_settings" && (db.__fail_next_settings_read || (db.__fail_settings_read_key && url.searchParams.get("key") === `eq.${db.__fail_settings_read_key}`))) {
        db.__fail_next_settings_read = false;
        return new Response(JSON.stringify({ code: "QA_SETTINGS_READ_FAILED", message: "simulated settings read failure" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      if (db.__embed_unsupported && /\w+\([^)]*\)/.test(String(url.searchParams.get("select") || ""))) {
        return new Response(JSON.stringify({ code: "PGRST200", message: "Could not find a relationship in the schema cache" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      if ((table === "accountbook_user_security" || String(url.searchParams.get("select") || "").includes("accountbook_user_security(")) && db.__fail_user_security_reads) {
        return new Response(JSON.stringify({ code: "QA_USER_SECURITY_UNAVAILABLE", message: "simulated session security read failure" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      const selectedRows = embedRelatedRows(db, filteredRows(db, table, url), url.searchParams.get("select"));
      return new Response(JSON.stringify(db.__honor_select ? projectSelectedColumns(selectedRows, url.searchParams.get("select")) : selectedRows), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST") {
      const items = Array.isArray(data) ? data : [data];
      if (table === "accountbook_settings") {
        if (typeof db.__before_settings_write === "function") await db.__before_settings_write(clone(items));
        db.__settings_write_count += 1;
      }
      if (table === "accountbook_settings" && db.__fail_next_settings_write) {
        db.__fail_next_settings_write = false;
        return new Response(JSON.stringify({ code: "QA_SETTINGS_WRITE_FAILED", message: "simulated settings write failure" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      if (table === "transactions" && Number(db.__fail_transaction_writes || 0) > 0) {
        db.__fail_transaction_writes = Number(db.__fail_transaction_writes || 0) - 1;
        return new Response(JSON.stringify({ code: "QA_TRANSACTION_WRITE_FAILED", message: "simulated transaction write failure" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      // 운영 transactions 테이블의 NOT NULL 제약을 그대로 재현한다.
      // household_id 없는 INSERT가 검증을 통과해 운영에서만 실패하는 회귀를 막는다.
      if (table === "transactions" && items.some((item) => !item.household_id || !item.user_id)) {
        return new Response(JSON.stringify({ code: "23502", message: "null value in column violates not-null constraint" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      // V22.9.34 감사 B13: PostgREST answers a duplicate primary key with 409/23505 unless Prefer asks for
      // merge-duplicates or ignore-duplicates. The fixture used to upsert silently, which hid PK-based idempotency bugs.
      if (table === "transactions" && db.__strict_primary_keys !== false) {
        const preferHeader = new Headers(init.headers || {}).get("Prefer") || "";
        if (!/resolution=(?:merge|ignore)-duplicates/.test(preferHeader)) {
          const ids = items.map((item) => item && item.id).filter(Boolean).map(String);
          const clash = ids.find((id, index) => ids.indexOf(id) !== index || db.transactions.some((row) => String(row.id) === id));
          if (clash) return new Response(JSON.stringify({ code: "23505", details: `Key (id)=(${clash}) already exists.`, hint: null, message: "duplicate key value violates unique constraint \"transactions_pkey\"" }), { status: 409, headers: { "content-type": "application/json" } });
        }
      }
      if (table === "transactions" && items.some((item) => transactionUniqueConflict(db.transactions, item))) {
        return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), { status: 409, headers: { "content-type": "application/json" } });
      }
      const ignoreDuplicates = new Headers(init.headers || {}).get("Prefer")?.includes("resolution=ignore-duplicates");
      const saved = items.flatMap((item) => {
        const conflictKeys = table === "users" ? ["kakao_user_key"] : table === "household_members" ? ["household_id", "user_id"] : table === "accountbook_settings" ? ["key"] : table === "accountbook_budgets" ? ["household_id", "month", "category"] : ["id"];
        if (ignoreDuplicates && db[table].some(row => conflictKeys.every(key => String(row[key] ?? "") === String(item[key] ?? "")))) return [];
        if (table === "users") return upsert(db, table, item, ["kakao_user_key"], sequence);
        if (table === "household_members") return upsert(db, table, item, ["household_id", "user_id"], sequence);
        if (table === "accountbook_settings") return upsert(db, table, item, ["key"], sequence);
        if (table === "accountbook_budgets") return upsert(db, table, item, ["household_id", "month", "category"], sequence);
        return upsert(db, table, item, ["id"], sequence);
      });
      if (table === "transactions" && Number(db.__lose_next_transaction_response || 0) > 0) {
        db.__lose_next_transaction_response = Number(db.__lose_next_transaction_response) - 1;
        return new Response(JSON.stringify({ code: "QA_RESPONSE_LOST", message: "simulated lost response after commit" }), { status: 503, headers: { "content-type": "application/json" } });
      }
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
    APP_NAME: "말해가계부",
    PUBLIC_BASE_URL: "https://malhaebook.com",
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
