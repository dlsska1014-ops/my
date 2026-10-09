
function paymentAssetsKey(householdId = "") {
  return `payment_assets:${String(householdId || "default").trim() || "default"}`;
}

const PAYMENT_ASSET_KIND_CATALOG = [
  { kind: "bank_account", label: "입출금·통장", icon: "🏦", group: "banking", side: "asset" },
  { kind: "cash", label: "현금", icon: "💵", group: "banking", side: "asset" },
  { kind: "easy_pay", label: "페이·포인트", icon: "📱", group: "banking", side: "asset" },
  { kind: "savings", label: "예금·적금", icon: "🐖", group: "saving", side: "asset" },
  { kind: "investment", label: "투자·증권", icon: "📈", group: "invest", side: "asset" },
  { kind: "crypto", label: "가상자산", icon: "🪙", group: "invest", side: "asset" },
  { kind: "pension", label: "연금·보험", icon: "🛡️", group: "pension", side: "asset" },
  { kind: "real_estate", label: "부동산·보증금", icon: "🏠", group: "real", side: "asset" },
  { kind: "car", label: "자동차·실물", icon: "🚗", group: "real", side: "asset" },
  { kind: "asset", label: "기타 자산", icon: "💼", group: "etc", side: "asset" },
  { kind: "loan", label: "대출·부채", icon: "🏛️", group: "debt", side: "liability" },
  { kind: "credit_card", label: "신용카드", icon: "💳", group: "card", side: "card" },
  { kind: "check_card", label: "체크카드", icon: "🧾", group: "card", side: "card" },
];

const PAYMENT_ASSET_GROUP_CATALOG = [
  { id: "banking", label: "입출금·현금", color: "#3182F6" },
  { id: "saving", label: "저축", color: "#12B76A" },
  { id: "invest", label: "투자", color: "#F79009" },
  { id: "pension", label: "연금·보험", color: "#7A5AF8" },
  { id: "real", label: "부동산·실물", color: "#0E9384" },
  { id: "etc", label: "기타 자산", color: "#98A2B3" },
  { id: "debt", label: "대출·부채", color: "#F04438" },
  { id: "card", label: "카드·결제수단", color: "#667085" },
];

function paymentAssetKindMeta(kind = "") {
  return PAYMENT_ASSET_KIND_CATALOG.find((item) => item.kind === kind) || PAYMENT_ASSET_KIND_CATALOG.find((item) => item.kind === "asset");
}

function paymentAssetGroupMeta(id = "") {
  return PAYMENT_ASSET_GROUP_CATALOG.find((item) => item.id === id) || PAYMENT_ASSET_GROUP_CATALOG.find((item) => item.id === "etc");
}

function isValidPaymentAssetKind(kind = "") {
  return PAYMENT_ASSET_KIND_CATALOG.some((item) => item.kind === kind);
}

function assetHistoryKey(householdId = "") {
  return `asset_history:${String(householdId || "default").trim() || "default"}`;
}

function normalizePaymentAssetAmount(value = 0) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(9_000_000_000_000, Math.round(amount)));
}

function computePaymentAssetTotals(assets = []) {
  const totals = { assetTotal: 0, liabilityTotal: 0, netWorth: 0, includedCount: 0, excludedCount: 0, groupTotals: {} };
  for (const asset of safeArray(assets)) {
    const meta = paymentAssetKindMeta(asset.kind);
    const amount = normalizePaymentAssetAmount(asset.balance);
    if (meta.side === "asset") {
      if (asset.include_in_asset === false) {
        totals.excludedCount += 1;
        continue;
      }
      totals.assetTotal += amount;
      totals.groupTotals[meta.group] = (totals.groupTotals[meta.group] || 0) + amount;
      totals.includedCount += 1;
    } else if (meta.side === "liability") {
      totals.liabilityTotal += amount;
      totals.groupTotals.debt = (totals.groupTotals.debt || 0) + amount;
    }
  }
  totals.netWorth = totals.assetTotal - totals.liabilityTotal;
  return totals;
}

function containsSensitiveFinancialNumber(value = "") {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  return digits.length >= 12;
}

function paymentAssetNameKey(value = "") {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizePaymentAssetList(value, householdId = "") {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = raw ? JSON.parse(raw) : []; } catch (err) { raw = []; }
  }
  if (raw && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  const arr = Array.isArray(raw) ? raw.slice(0, 200) : [];
  return arr.map((x, i) => {
    const item = safeObject(x);
    const name = String(item.name || "").trim().slice(0, 80);
    if (!name) return null;
    const kind = isValidPaymentAssetKind(item.kind) ? item.kind : "credit_card";
    return {
      id: String(item.id || `asset_${i}_${name}`).replace(/[^\w가-힣:-]/g, "_").slice(0, 120),
      household_id: householdId || item.household_id || "",
      name,
      kind,
      issuer: String(item.issuer || "").trim().slice(0, 80),
      balance: normalizePaymentAssetAmount(item.balance),
      include_in_asset: paymentAssetKindMeta(kind).side === "asset" ? item.include_in_asset !== false : false,
      memo: String(item.memo || "").trim().slice(0, 120),
      created_at: item.created_at || new Date(0).toISOString(),
      updated_at: item.updated_at || item.created_at || "",
      balance_updated_at: item.balance_updated_at || item.updated_at || item.created_at || "",
    };
  }).filter(Boolean);
}

function paymentKindLabel(kind = "") {
  return paymentAssetKindMeta(kind)?.label || "결제수단";
}

function normalizeAssetHistory(value) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = raw ? JSON.parse(raw) : {}; } catch (err) { raw = {}; }
  }
  const out = {};
  for (const [month, itemValue] of Object.entries(safeObject(raw))) {
    if (!validMonth(month)) continue;
    const item = safeObject(itemValue);
    const netWorth = Number(item.net_worth || 0);
    out[month] = {
      asset_total: normalizePaymentAssetAmount(item.asset_total),
      liability_total: normalizePaymentAssetAmount(item.liability_total),
      net_worth: Number.isFinite(netWorth) ? Math.max(-9_000_000_000_000, Math.min(9_000_000_000_000, Math.round(netWorth))) : 0,
      saved_at: String(item.saved_at || "").slice(0, 40),
    };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).slice(-24));
}

async function fetchAssetHistory(env, householdId = "") {
  try {
    return normalizeAssetHistory(await getSettingValue(env, assetHistoryKey(householdId)));
  } catch (err) {
    return {};
  }
}

async function recordAssetSnapshot(env, householdId = "", assets = [], month = currentMonthKst()) {
  const snapshotMonth = validMonth(month) || currentMonthKst();
  const totals = computePaymentAssetTotals(assets);
  const history = await fetchAssetHistory(env, householdId);
  history[snapshotMonth] = {
    asset_total: totals.assetTotal,
    liability_total: totals.liabilityTotal,
    net_worth: totals.netWorth,
    saved_at: new Date().toISOString(),
  };
  const trimmed = normalizeAssetHistory(history);
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: assetHistoryKey(householdId), value: JSON.stringify(trimmed) }),
  });
  return trimmed;
}

async function recordAssetSnapshotBestEffort(env, householdId = "", assets = [], month = currentMonthKst()) {
  try {
    await recordAssetSnapshot(env, householdId, assets, month);
    return true;
  } catch (err) {
    rememberOpsEvent({ kind: "asset_snapshot_failed", severity: "warn", path: "/payment-methods", method: "POST", detail: safeError(err) });
    return false;
  }
}

async function fetchPaymentAssets(env, householdId = "") {
  try {
    const value = await getSettingValue(env, paymentAssetsKey(householdId));
    return normalizePaymentAssetList(value, householdId);
  } catch (err) {
    return [];
  }
}

async function savePaymentAssets(env, householdId = "", assets = []) {
  const cleaned = normalizePaymentAssetList(assets, householdId).map((a, i) => ({
    id: a.id || `asset_${Date.now().toString(36)}_${i}`,
    household_id: householdId || a.household_id || "",
    name: a.name,
    kind: a.kind,
    issuer: a.issuer || "",
    balance: normalizePaymentAssetAmount(a.balance),
    include_in_asset: paymentAssetKindMeta(a.kind).side === "asset" ? a.include_in_asset !== false : false,
    memo: a.memo || "",
    created_at: a.created_at || new Date().toISOString(),
    updated_at: a.updated_at || "",
    balance_updated_at: a.balance_updated_at || a.updated_at || a.created_at || "",
  }));
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: paymentAssetsKey(householdId), value: JSON.stringify(cleaned) }),
  });
  return cleaned;
}

function isMissingPaymentAssetRpc(err, rpcName = "") {
  const detail = String(err?.message || err || "");
  return new RegExp(`${rpcName}|PGRST202|function.+not found`, "i").test(detail);
}

async function mutatePaymentAssetsAtomically(env, householdId = "", action = "", asset = {}, assetId = "", snapshotMonth = currentMonthKst()) {
  try {
    const result = await supabase(env, "/rest/v1/rpc/accountbook_mutate_payment_assets_v2280", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_household_id: householdId,
        p_action: action,
        p_asset: safeObject(asset),
        p_asset_id: assetId || null,
        p_snapshot_month: validMonth(snapshotMonth) || currentMonthKst(),
      }),
    });
    const payload = safeObject(result);
    return {
      supported: true,
      version: "v2280",
      assets: normalizePaymentAssetList(payload.assets, householdId),
      history: normalizeAssetHistory(payload.history),
      historyRecorded: payload.history_recorded === true,
    };
  } catch (err) {
    if (!isMissingPaymentAssetRpc(err, "accountbook_mutate_payment_assets_v2280")) throw err;
  }
  try {
    const result = await supabase(env, "/rest/v1/rpc/accountbook_mutate_payment_assets_v2271", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_household_id: householdId, p_action: action, p_asset: safeObject(asset), p_asset_id: assetId || null }),
    });
    rememberOpsEvent({ kind: "asset_rpc_legacy_fallback", severity: "warn", path: "/payment-methods", method: "POST", detail: "v2280_missing_v2271_used" });
    return { supported: true, version: "v2271", assets: normalizePaymentAssetList(result, householdId), history: {}, historyRecorded: false };
  } catch (err) {
    if (isMissingPaymentAssetRpc(err, "accountbook_mutate_payment_assets_v2271")) {
      rememberOpsEvent({ kind: "asset_rpc_non_atomic_fallback", severity: "warn", path: "/payment-methods", method: "POST", detail: "asset_migration_missing" });
      return { supported: false, version: "fallback", assets: [], history: {}, historyRecorded: false };
    }
    throw err;
  }
}

async function withPaymentAssetWriteLease(env, householdId = "", task) {
  const lease = await claimOperationLease(env, {
    key: `payment-assets-write:${String(householdId || "").trim()}`,
    owner: operationLeaseOwner("payment-assets"),
    leaseSeconds: Number(env.PAYMENT_ASSET_LEASE_SECONDS || 30),
  });
  if (!lease.acquired) throw new Error("asset_write_busy");
  try {
    return await task();
  } finally {
    await releaseOperationLease(env, lease);
  }
}

async function addPaymentAsset(env, householdId = "", data = {}) {
  const name = String(data.name || "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "이름을 입력해주세요." };
  if (containsSensitiveFinancialNumber(name) || containsSensitiveFinancialNumber(data.issuer) || containsSensitiveFinancialNumber(data.memo)) return { ok: false, error: "계좌번호·카드번호 전체는 저장할 수 없습니다. 알아볼 수 있는 별칭만 입력해주세요." };
  return withPaymentAssetWriteLease(env, householdId, async () => {
    const kind = isValidPaymentAssetKind(data.kind) ? data.kind : "bank_account";
    const now = new Date().toISOString();
    const current = await fetchPaymentAssets(env, householdId);
    if (current.some((x) => paymentAssetNameKey(x.name) === paymentAssetNameKey(name))) return { ok: false, error: "같은 이름의 자산·결제수단이 이미 있습니다. 기존 항목을 수정해주세요." };
    const next = current.slice();
    const item = {
      id: randomEntityId("asset"),
      household_id: householdId || "",
      name,
      kind,
      issuer: String(data.issuer || "").trim().slice(0, 80),
      balance: normalizePaymentAssetAmount(data.balance),
      include_in_asset: paymentAssetKindMeta(kind).side === "asset" ? data.include_in_asset !== false : false,
      memo: String(data.memo || "").trim().slice(0, 120),
      created_at: now,
      updated_at: now,
      balance_updated_at: now,
    };
    next.push(item);
    const atomic = await mutatePaymentAssetsAtomically(env, householdId, "create", item, item.id);
    const saved = atomic.supported ? atomic.assets : await savePaymentAssets(env, householdId, next);
    const snapshotOk = atomic.historyRecorded || await recordAssetSnapshotBestEffort(env, householdId, saved);
    return { ok: true, snapshotOk };
  });
}

async function updatePaymentAsset(env, householdId = "", id = "", patch = {}) {
  return withPaymentAssetWriteLease(env, householdId, async () => {
    const current = await fetchPaymentAssets(env, householdId);
    const target = current.find((item) => String(item.id) === String(id));
    if (!target) return { ok: false, error: "수정할 항목을 찾지 못했습니다." };
    const requestedName = patch.name === undefined ? target.name : String(patch.name || "").trim().slice(0, 80);
    if (current.some((item) => String(item.id) !== String(id) && paymentAssetNameKey(item.name) === paymentAssetNameKey(requestedName))) {
      return { ok: false, error: "같은 이름의 자산·결제수단이 이미 있습니다. 다른 이름을 사용해주세요." };
    }
    const next = current.map((item) => {
      if (String(item.id) !== String(id)) return item;
      const kind = isValidPaymentAssetKind(patch.kind) ? patch.kind : item.kind;
      const name = patch.name === undefined ? item.name : String(patch.name || "").trim().slice(0, 80);
      const issuer = patch.issuer === undefined ? item.issuer : String(patch.issuer || "").trim().slice(0, 80);
      const memo = patch.memo === undefined ? item.memo : String(patch.memo || "").trim().slice(0, 120);
      if (!name || containsSensitiveFinancialNumber(name) || containsSensitiveFinancialNumber(issuer) || containsSensitiveFinancialNumber(memo)) throw new Error("asset_sensitive_or_invalid");
      const balance = patch.balance === undefined ? item.balance : normalizePaymentAssetAmount(patch.balance);
      const balanceChanged = balance !== normalizePaymentAssetAmount(item.balance);
      const updatedAt = new Date().toISOString();
      return { ...item, name, issuer, memo, kind, balance, include_in_asset: paymentAssetKindMeta(kind).side === "asset" ? patch.include_in_asset !== false : false, updated_at: updatedAt, balance_updated_at: balanceChanged ? updatedAt : (item.balance_updated_at || item.updated_at || item.created_at || updatedAt) };
    });
    const updated = next.find((item) => String(item.id) === String(id));
    const atomic = await mutatePaymentAssetsAtomically(env, householdId, "update", updated, id);
    const saved = atomic.supported ? atomic.assets : await savePaymentAssets(env, householdId, next);
    const snapshotOk = atomic.historyRecorded || await recordAssetSnapshotBestEffort(env, householdId, saved);
    return { ok: true, snapshotOk };
  });
}

async function deletePaymentAsset(env, householdId = "", id = "") {
  return withPaymentAssetWriteLease(env, householdId, async () => {
    const current = await fetchPaymentAssets(env, householdId);
    if (!current.some((item) => String(item.id) === String(id))) return { ok: false, error: "삭제할 항목을 찾지 못했습니다." };
    const atomic = await mutatePaymentAssetsAtomically(env, householdId, "delete", {}, id);
    const saved = atomic.supported ? atomic.assets : await savePaymentAssets(env, householdId, current.filter((x) => String(x.id) !== String(id)));
    const snapshotOk = atomic.historyRecorded || await recordAssetSnapshotBestEffort(env, householdId, saved);
    return { ok: true, snapshotOk };
  });
}

function inferPaymentAssetFromText(text = "", assets = []) {
  const raw = normalizeText(text);
  if (!raw) return "";
  const sorted = safeArray(assets).filter((a) => a.name).sort((a, b) => b.name.length - a.name.length);
  for (const asset of sorted) {
    const name = normalizeText(asset.name);
    if (name && raw.includes(name)) return asset.name;
    const issuer = normalizeText(asset.issuer || "");
    if (issuer && raw.includes(issuer) && /(카드|체크|통장|계좌|페이|현금)/.test(raw)) return asset.name;
  }
  return "";
}

function inferCustomCategoryFromText(text = "", type = "expense", categories = []) {
  const raw = normalizeText(text);
  if (!raw) return "";
  const list = safeArray(categories).filter((c) => c.name && (c.type || "expense") === type).sort((a, b) => {
    const ak = Math.max(normalizeText(a.name).length, ...normalizeCategoryKeywords(a.keywords || "").map((x) => normalizeText(x).length));
    const bk = Math.max(normalizeText(b.name).length, ...normalizeCategoryKeywords(b.keywords || "").map((x) => normalizeText(x).length));
    return bk - ak;
  });
  for (const c of list) {
    for (const kw of normalizeCategoryKeywords(c.keywords || "")) {
      const key = normalizeText(kw);
      if (key && raw.includes(key)) return c.name;
    }
    const name = normalizeText(c.name);
    if (name && raw.includes(name)) return c.name;
  }
  return "";
}

function applyUserSettingsToParsedTransactions(parsedList = [], categories = [], paymentAssets = []) {
  return safeArray(parsedList).map((p) => {
    const baseText = `${p.raw_text || ""} ${p.memo || ""} ${p.category || ""} ${p.payment_method || ""}`;
    const customCategory = inferCustomCategoryFromText(baseText, p.type, categories);
    const customPayment = inferPaymentAssetFromText(baseText, paymentAssets);
    return {
      ...p,
      category: customCategory || p.category,
      payment_method: customPayment || p.payment_method,
    };
  });
}

async function resolveManualInputClassification(env, householdId = "", type = "expense", fields = {}) {
  const cleanType = type === "income" ? "income" : "expense";
  const rawText = normalizeText([fields.raw_text, fields.memo, fields.category, fields.payment_method].filter(Boolean).join(" "));
  const explicitCategory = String(fields.category || "").trim();
  const explicitPayment = String(fields.payment_method || "").trim();
  const baseCategory = explicitCategory || inferCategory(rawText || fields.memo || "", cleanType) || "";
  const basePayment = explicitPayment || detectPaymentMethod(rawText || fields.memo || "") || "";
  try {
    const [customCategoryRows, paymentAssetRows] = await Promise.all([
      fetchCustomCategories(env, householdId),
      fetchPaymentAssets(env, householdId),
    ]);
    const refined = applyUserSettingsToParsedTransactions([{ type: cleanType, raw_text: rawText, memo: fields.memo || "", category: baseCategory, payment_method: basePayment }], customCategoryRows, paymentAssetRows)[0] || {};
    return {
      category: String(explicitCategory || refined.category || baseCategory || "").trim(),
      payment_method: String(explicitPayment || refined.payment_method || basePayment || "").trim(),
    };
  } catch (err) {
    return { category: baseCategory, payment_method: basePayment };
  }
}

function paymentMethodsLocation(month = "", householdId = "", extra = {}) {
  const qs = new URLSearchParams();
  qs.set("month", validMonth(month) || currentMonthKst());
  if (householdId) qs.set("household_id", householdId);
  for (const [key, value] of Object.entries(extra || {})) {
    if (value !== undefined && value !== null && String(value) !== "") qs.set(key, String(value));
  }
  return `/payment-methods?${qs.toString()}`;
}

async function resolvePaymentAssetManage(request, env, householdId = "", month = "") {
  if (!householdId) return { ok: false, redirect: paymentMethodsLocation(month, "", { err: "가계부를 먼저 선택해주세요." }) };
  if (await verifyAdminSession(request, env)) return { ok: true, role: "admin" };
  const userId = await verifyUserSession(request, env);
  if (!userId) return { ok: false, redirect: "/my" };
  const role = await getHouseholdMemberRole(env, userId, householdId);
  if (["owner", "admin"].includes(role)) return { ok: true, role, userId };
  return { ok: false, redirect: paymentMethodsLocation(month, householdId, { err: "자산·결제수단 관리는 가계부 소유자와 관리자만 할 수 있습니다." }) };
}

async function handlePaymentAssetCreate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const access = await resolvePaymentAssetManage(request, env, householdId, month);
  if (!access.ok) return redirectResponse(access.redirect);
  try {
    const result = await addPaymentAsset(env, householdId, {
      name: form.get("name"),
      kind: form.get("kind"),
      issuer: form.get("issuer"),
      balance: parseAmountValue(form.get("balance") || "0"),
      include_in_asset: form.getAll("include_in_asset").includes("on"),
      memo: form.get("memo"),
    });
    if (!result.ok) return redirectResponse(paymentMethodsLocation(month, householdId, { err: result.error || "자산을 저장하지 못했습니다." }));
    return redirectResponse(paymentMethodsLocation(month, householdId, { msg: result.snapshotOk ? "payment_asset_saved" : "payment_asset_saved_snapshot_deferred" }));
  } catch (err) {
    const detail = String(err?.message || "");
    const message = /asset_name_duplicate/i.test(detail) ? "같은 이름의 자산·결제수단이 이미 있습니다." : /asset_write_busy/i.test(detail) ? "다른 자산 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요." : "자산 저장을 완료하지 못했습니다. 기존 자산은 변경되지 않았습니다.";
    rememberOpsEvent({ kind: "payment_asset_create_failed", severity: "warn", path: "/admin/payment-asset/create", method: "POST", detail });
    return redirectResponse(paymentMethodsLocation(month, householdId, { err: message }));
  }
}

async function handlePaymentAssetUpdate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const id = String(form.get("id") || "").trim();
  const access = await resolvePaymentAssetManage(request, env, householdId, month);
  if (!access.ok) return redirectResponse(access.redirect);
  const mode = String(form.get("mode") || "edit").trim();
  const patch = {};
  if (form.get("balance") !== null) patch.balance = parseAmountValue(form.get("balance") || "0");
  if (mode !== "balance") {
    if (form.get("name") !== null) patch.name = form.get("name");
    if (form.get("kind") !== null) patch.kind = form.get("kind");
    if (form.get("issuer") !== null) patch.issuer = form.get("issuer");
    if (form.get("memo") !== null) patch.memo = form.get("memo");
    patch.include_in_asset = form.getAll("include_in_asset").includes("on");
  }
  try {
    const result = await updatePaymentAsset(env, householdId, id, patch);
    if (!result.ok) return redirectResponse(paymentMethodsLocation(month, householdId, { err: result.error || "자산을 수정하지 못했습니다." }));
    const successMessage = mode === "balance" ? "payment_asset_balance_updated" : "payment_asset_updated";
    return redirectResponse(paymentMethodsLocation(month, householdId, { msg: result.snapshotOk ? successMessage : `${successMessage}_snapshot_deferred` }));
  } catch (err) {
    const detail = String(err?.message || "");
    const message = /asset_sensitive_or_invalid/i.test(detail) ? "계좌번호·카드번호 전체 대신 별칭을 입력해주세요." : /asset_name_duplicate/i.test(detail) ? "같은 이름의 자산·결제수단이 이미 있습니다." : /asset_not_found/i.test(detail) ? "수정할 항목을 찾지 못했습니다. 화면을 새로고침해 주세요." : /asset_write_busy/i.test(detail) ? "다른 자산 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요." : "자산 수정을 완료하지 못했습니다. 기존 값은 유지됩니다.";
    rememberOpsEvent({ kind: "payment_asset_update_failed", severity: "warn", path: "/admin/payment-asset/update", method: "POST", detail });
    return redirectResponse(paymentMethodsLocation(month, householdId, { err: message }));
  }
}

async function handlePaymentAssetDelete(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const id = String(form.get("id") || "").trim();
  const access = await resolvePaymentAssetManage(request, env, householdId, month);
  if (!access.ok) return redirectResponse(access.redirect);
  try {
    const result = await deletePaymentAsset(env, householdId, id);
    if (!result.ok) return redirectResponse(paymentMethodsLocation(month, householdId, { err: result.error || "자산을 삭제하지 못했습니다." }));
    return redirectResponse(paymentMethodsLocation(month, householdId, { msg: result.snapshotOk ? "payment_asset_deleted" : "payment_asset_deleted_snapshot_deferred" }));
  } catch (err) {
    const detail = String(err?.message || "");
    const message = /asset_not_found/i.test(detail) ? "삭제할 항목을 찾지 못했습니다. 화면을 새로고침해 주세요." : /asset_write_busy/i.test(detail) ? "다른 자산 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요." : "자산 삭제를 완료하지 못했습니다. 기존 항목은 유지됩니다.";
    rememberOpsEvent({ kind: "payment_asset_delete_failed", severity: "warn", path: "/admin/payment-asset/delete", method: "POST", detail });
    return redirectResponse(paymentMethodsLocation(month, householdId, { err: message }));
  }
}
