// @build:imports-start
import { parseStrictSettingsObject, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserHouseholds, supabaseWithEmbedFallback } from "./users-household-create.js";
import { canReadMyHousehold } from "../my/access-control.js";
import { memberCanBeSpender } from "../my/transactions.js";
import { isMissingCategory, isMissingPayment } from "../kakao/reply-texts.js";
import { supabase } from "./supabase-client.js";
import { escapeHtml, nextMonthStart } from "../domain/transactions-core.js";
// @build:imports-end

async function fetchAdminHouseholds(env) {
  return (await supabase(env, "/rest/v1/households?select=id,name,invite_code,created_at&order=created_at.asc", { method: "GET" })) || [];
}

async function fetchRowsByPlainIds(env, table = "", ids = [], select = "*") {
  const cleanTable = String(table || "").trim();
  if (!/^[a-z][a-z0-9_]*$/.test(cleanTable)) throw new Error("invalid PostgREST table");
  const cleanIds = [...new Set(safeArray(ids).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length) return [];
  const bulkIds = cleanIds.filter((id) => /^[A-Za-z0-9_-]{1,160}$/.test(id));
  const rows = [];
  for (let offset = 0; offset < bulkIds.length; offset += 100) {
    const chunk = bulkIds.slice(offset, offset + 100);
    const params = new URLSearchParams();
    params.set("id", `in.(${chunk.join(",")})`);
    params.set("select", select || "*");
    params.set("limit", String(chunk.length));
    rows.push(...safeArray(await supabase(env, `/rest/v1/${cleanTable}?${params.toString()}`, { method: "GET" })));
  }
  const exceptionalIds = cleanIds.filter((id) => !bulkIds.includes(id));
  if (exceptionalIds.length) {
    const exceptionalRows = await Promise.all(exceptionalIds.map(async (id) => {
      const found = await supabase(env, `/rest/v1/${cleanTable}?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select || "*")}&limit=1`, { method: "GET" });
      return found?.[0] || null;
    }));
    rows.push(...exceptionalRows.filter(Boolean));
  }
  return rows;
}

async function getScopedHouseholdsForPage(request, env) {
  // V22.9.16: 관리자 세션 확인과 가계부 목록은 서로 필요 없다. 함께 던진다.
  const [userId, adminOk] = await Promise.all([
    verifyUserSession(request, env),
    verifyAdminSession(request, env),
  ]);
  if (userId) return { userId, adminOk, households: (await fetchUserHouseholds(env, userId)).filter((h) => canReadMyHousehold(h.role)), scope: "user" };
  if (adminOk) return { userId: "", adminOk, households: await fetchAdminHouseholds(env), scope: "admin" };
  return { userId: "", adminOk: false, households: [], scope: "none" };
}

function selectScopedHousehold(households = [], householdId = "") {
  return safeArray(households).find((h) => String(h.id) === String(householdId || "")) || safeArray(households)[0] || null;
}

function selectRequestedScopedHousehold(households = [], householdId = "") {
  const requested = String(householdId || "").trim();
  if (!requested) return safeArray(households)[0] || null;
  return safeArray(households).find((h) => String(h.id) === requested) || null;
}

function memberAliasSettingsKey(householdId = "") {
  return `member_aliases:${String(householdId || "default").trim() || "default"}`;
}

async function fetchMemberAliasMap(env, householdId = "", options = {}) {
  const strict = options.strict === true;
  try {
    const key = memberAliasSettingsKey(householdId);
    const value = strict ? await getSettingValueStrict(env, key) : await getSettingValue(env, key);
    return normalizeMemberAliasMap(value, { strict });
  } catch (err) {
    if (strict) throw err;
    return {};
  }
}

function normalizeMemberAliasMap(value = {}, options = {}) {
  let parsed = value;
  if (options.strict === true) parsed = parseStrictSettingsObject(parsed, "member_aliases");
  else if (typeof parsed === "string") {
    try { parsed = parsed ? JSON.parse(parsed) : {}; } catch (_) { parsed = {}; }
  }
  const out = {};
  for (const [k, v] of Object.entries(safeObject(parsed))) {
    const uid = String(k || "").trim();
    const name = String(v || "").trim().slice(0, 80);
    if (uid && name) out[uid] = name;
  }
  return out;
}

async function saveMemberAlias(env, householdId = "", userId = "", alias = "") {
  const hid = String(householdId || "").trim();
  const uid = String(userId || "").trim();
  const name = String(alias || "").trim().slice(0, 80);
  if (!hid || !uid || !name) return {};
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const [memberRows, userRows] = await Promise.all([
      supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(hid)}&user_id=eq.${encodeURIComponent(uid)}&select=user_id&limit=1`, { method: "GET" }),
      supabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(uid)}&select=id&limit=1`, { method: "GET" }),
    ]);
    if (!memberRows?.[0] || !userRows?.[0]) throw new Error("member_alias_target_missing");
    const map = await fetchMemberAliasMap(env, hid, { strict: true });
    map[uid] = name;
    assertFresh();
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: memberAliasSettingsKey(hid), value: JSON.stringify(map) }),
    });
    return map;
  });
}

function roleRank(role = "") {
  const r = String(role || "member").toLowerCase();
  if (r === "owner") return 60;
  if (r === "admin") return 50;
  if (r === "member") return 40;
  if (r === "viewer") return 30;
  if (r === "pending") return 20;
  if (r === "blocked") return 10;
  return 35;
}

function bestMemberRow(rows = []) {
  const arr = safeArray(rows);
  if (!arr.length) return null;
  return arr.slice().sort((a, b) => {
    const rankDiff = roleRank(b.role) - roleRank(a.role);
    if (rankDiff) return rankDiff;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  })[0] || null;
}

function bestRoleFromRows(rows = []) {
  return String(bestMemberRow(rows)?.role || "");
}

function dedupeMemberRowsByKey(rows = [], keyName = "user_id") {
  const map = new Map();
  for (const row of safeArray(rows)) {
    const key = String(row?.[keyName] || "").trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || roleRank(row.role) > roleRank(prev.role) || (roleRank(row.role) === roleRank(prev.role) && String(row.created_at || "") > String(prev.created_at || ""))) {
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

async function fetchHouseholdMembers(env, householdId, options = {}) {
  if (!householdId) return [];
  const aliasesPromise = Object.prototype.hasOwnProperty.call(options || {}, "aliases")
    ? Promise.resolve(normalizeMemberAliasMap(options.aliases))
    : options?.aliasesPromise
      ? Promise.resolve(options.aliasesPromise).then(normalizeMemberAliasMap).catch(() => ({}))
      : fetchMemberAliasMap(env, householdId);
  // V22.9.16: 구성원 행에 사용자 행을 포함해 한 번에 읽는다(외래키가 없으면 두 단계로 복귀).
  const memberPath = `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}`;
  const [{ rows: rawMembers, embedded }, aliases] = await Promise.all([
    supabaseWithEmbedFallback(
      env,
      "household_members_users",
      `${memberPath}&select=user_id,role,created_at,users(id,nickname,kakao_user_key,created_at)&order=created_at.asc`,
      `${memberPath}&select=user_id,role,created_at&order=created_at.asc`,
    ),
    aliasesPromise,
  ]);
  const members = dedupeMemberRowsByKey(rawMembers, "user_id");
  const userRows = embedded
    ? members.map((member) => member.users).filter((user) => user && user.id)
    : await fetchRowsByPlainIds(env, "users", members.map((member) => member.user_id), "id,nickname,kakao_user_key,created_at");
  const usersById = new Map(userRows.map((user) => [String(user.id || ""), user]));
  return members.map((m) => {
    const user = usersById.get(String(m.user_id || "")) || {};
    const alias = aliases[m.user_id] || "";
    return {
      user_id: m.user_id || "",
      role: m.role || "member",
      nickname: alias || user.nickname || (m.role === "owner" ? "관리자" : "구성원"),
      base_nickname: user.nickname || "",
      display_alias: alias,
      kakao_user_key: user.kakao_user_key || "",
      created_at: m.created_at || user.created_at || "",
    };
  });
}

async function fetchAllHouseholdMembersMap(env, households = []) {
  const out = {};
  for (const h of households || []) {
    out[h.id] = await fetchHouseholdMembers(env, h.id);
  }
  return out;
}

// 조회 결과가 한도를 넘었다는 오류. 일부 행만으로 합계·리포트·백업을 만들지 않도록 호출부가 이 코드로 구분한다(QA B05).
function rowLimitExceededError(limit) {
  return Object.assign(new Error(`조회 결과가 안전 한도 ${limit}건을 넘었습니다. 기간을 나눠 조회해 주세요.`), { name: "RowLimitExceededError", code: "row_limit_exceeded", limit });
}

function isRowLimitExceededError(error) {
  return error?.code === "row_limit_exceeded";
}

// pageSize를 서버의 PostgREST `max-rows`보다 크게 잡으면 페이지가 짧게 돌아오고
// 아래 `page.length < remaining` 판정이 이를 데이터 끝으로 오인해 조용히 잘린다.
// 그래서 기존 클램프 상한(1000)을 넘기지 않는 범위에서만 기본값을 올린다.
// 1000을 초과하려면 운영 PostgREST의 max-rows 설정을 먼저 확인해야 한다.
async function fetchPostgrestRows(env, path, { pageSize = 1000, limit = null, maxRows = 100000 } = {}) {
  const parsed = new URL(String(path || ""), "https://postgrest.local");
  parsed.searchParams.delete("limit");
  parsed.searchParams.delete("offset");
  const wanted = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : null;
  const hardMax = Math.max(1000, Math.floor(Number(maxRows || 100000)));
  const size = Math.max(50, Math.min(1000, Math.floor(Number(pageSize || 500))));
  const rows = [];
  let offset = 0;
  while (true) {
    const remaining = wanted === null ? size : Math.min(size, wanted - rows.length);
    if (remaining <= 0) break;
    parsed.searchParams.set("limit", String(remaining));
    parsed.searchParams.set("offset", String(offset));
    const page = await supabase(env, `${parsed.pathname}${parsed.search}`, { method: "GET" });
    if (!Array.isArray(page)) throw new Error("PostgREST 목록 응답 형식이 올바르지 않습니다.");
    if (!page.length) break;
    rows.push(...page);
    offset += page.length;
    if (page.length < remaining) break;
    if (wanted !== null && rows.length >= wanted) break;
    if (rows.length >= hardMax) {
      parsed.searchParams.set("limit", "1");
      parsed.searchParams.set("offset", String(offset));
      const probe = await supabase(env, `${parsed.pathname}${parsed.search}`, { method: "GET" });
      if (Array.isArray(probe) && probe.length) throw rowLimitExceededError(hardMax);
      break;
    }
  }
  return wanted === null ? rows : rows.slice(0, wanted);
}

// 분석 화면용 범위 조회. 한도+1건을 받아 잘렸는지 함께 돌려준다. 합계·리포트·백업에는 쓰지 않는다(QA B05).
async function fetchAnalysisRowsRange(env, options = {}, limit = 6000) {
  const rows = await fetchAdminRowsRange(env, { ...options, limit: limit + 1, complete: false });
  return rows.length > limit ? { rows: rows.slice(0, limit), truncated: true } : { rows, truncated: false };
}

async function supabaseExactCount(env, path, { timeoutMs } = {}) {
  const parsed = new URL(String(path || ""), "https://postgrest.local");
  if (!parsed.searchParams.has("select")) parsed.searchParams.set("select", "id");
  parsed.searchParams.set("limit", "1");
  const headers = new Headers({ prefer: "count=exact", "range-unit": "items" });
  // HEAD uses the same read deadline and monitor accounting as ordinary GETs.
  const response = await supabase(env, `${parsed.pathname}${parsed.search}`, { method: "HEAD", headers, rawHeadResponse: true, timeoutMs });
  if (response.ok) {
    const range = String(response.headers.get("content-range") || "");
    const match = range.match(/\/(\d+)$/);
    if (match) return Number(match[1]);
  } else if (![405, 501].includes(response.status)) {
    throw new Error(`Supabase count ${response.status}`);
  }

  // 일부 프록시·로컬 에뮬레이터는 HEAD 요청을 처리하면서도
  // content-range 헤더를 제거한다. 화면 전체를 실패시키지 않고 같은
  // 필터를 페이지 단위로 조회하되, 안전 상한을 넘으면 명시적으로 중단한다.
  parsed.searchParams.delete("limit");
  parsed.searchParams.delete("offset");
  const rows = await fetchPostgrestRows(env, `${parsed.pathname}${parsed.search}`, {
    pageSize: 1000,
    maxRows: 100000,
  });
  return rows.length;
}

async function countHouseholdTransactions(env, householdId) {
  if (!householdId) return 0;
  return supabaseExactCount(env, `/rest/v1/transactions?household_id=eq.${encodeURIComponent(householdId)}&select=id`);
}

function memberNameMap(members = []) {
  const map = {};
  for (const m of members) if (m.user_id) map[m.user_id] = m.nickname || "구성원";
  return map;
}

function attachSpenderNames(rows = [], members = []) {
  const map = memberNameMap(members);
  return (rows || []).map((t) => ({
    ...t,
    spender_name: t.user_id ? (map[t.user_id] || "이전 구성원") : "미지정",
  }));
}

function renderSpenderOptions(members = [], selected = "", blankLabel = "지출자 미지정") {
  const opts = [`<option value=""${!selected ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`];
  for (const m of members) {
    if (!memberCanBeSpender(m)) continue;
    opts.push(`<option value="${escapeHtml(m.user_id)}"${selected === m.user_id ? " selected" : ""}>${escapeHtml(m.nickname || "구성원")} (${escapeHtml(m.role || "member")})</option>`);
  }
  return opts.join("");
}

function renderSpenderDatalist(members = []) {
  return `<datalist id="spenderNameList">${members.map((m) => `<option value="${escapeHtml(m.nickname || "")}"></option>`).join("")}</datalist>`;
}

async function fetchAdminRows(env, { month, householdId, type = "all", date = "", q = "", quality = "all", category = "", payment_method = "" }) {
  const start = `${month}-01`;
  const end = nextMonthStart(month);
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  params.set("transaction_date", `gte.${start}`);
  params.append("transaction_date", `lt.${end}`);
  if (householdId) params.set("household_id", `eq.${householdId}`);
  if (type === "income" || type === "expense") params.set("type", `eq.${type}`);
  if (date) params.set("transaction_date", `eq.${date}`);
  params.set("order", "transaction_date.desc,created_at.desc,id.desc");
  let rows = await fetchPostgrestRows(env, `/rest/v1/transactions?${params.toString()}`);
  const needle = String(q || "").trim().toLowerCase();
  if (needle) rows = rows.filter((t) => String(`${t.memo || ""} ${t.category || ""} ${t.payment_method || ""} ${t.raw_text || ""}`).toLowerCase().includes(needle));
  if (category) {
    rows = rows.filter((t) => category === "__missing" ? isMissingCategory(t.category) : String(t.category || "") === category);
  }
  if (payment_method) {
    rows = rows.filter((t) => payment_method === "__missing" ? isMissingPayment(t.payment_method) : String(t.payment_method || "") === payment_method);
  }
  if (quality === "missing_category") rows = rows.filter((t) => isMissingCategory(t.category));
  if (quality === "missing_payment") rows = rows.filter((t) => t.type === "expense" && isMissingPayment(t.payment_method));
  if (quality === "missing_any") rows = rows.filter((t) => isMissingCategory(t.category) || (t.type === "expense" && isMissingPayment(t.payment_method)));
  if (quality === "kakao_only") rows = rows.filter((t) => String(t.source || "").includes("kakao"));
  if (quality === "web_only") rows = rows.filter((t) => String(t.source || "").includes("web"));
  return rows;
}

// complete(기본)는 한도를 넘는 기록이 있으면 조용히 자르지 않고 row_limit_exceeded 오류를 낸다(QA B05).
// 합계·리포트·백업·검색은 이 방식이어야 한다. complete:false 는 호출부가 한도+1건을 받아 잘림을 직접
// 감지하고 화면에 알리는 경우(분석 화면)나 일부여도 되는 추정(반복 거래 후보)에만 쓴다.
async function fetchAdminRowsRange(env, { householdId = "", start = "", end = "", type = "all", limit = 6000, complete = true }) {
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  if (start) params.set("transaction_date", `gte.${start}`);
  if (end) params.append("transaction_date", `lt.${end}`);
  if (householdId) params.set("household_id", `eq.${householdId}`);
  if (type === "income" || type === "expense") params.set("type", `eq.${type}`);
  params.set("order", "transaction_date.desc,created_at.desc,id.desc");
  const rowLimit = Math.max(100, Math.min(Number(limit || 6000), 100000));
  const path = `/rest/v1/transactions?${params.toString()}`;
  return complete
    ? fetchPostgrestRows(env, path, { maxRows: rowLimit })
    : fetchPostgrestRows(env, path, { limit: rowLimit, maxRows: rowLimit });
}
// @build:exports-start
export {
  attachSpenderNames, bestRoleFromRows, countHouseholdTransactions, fetchAdminHouseholds,
  fetchAdminRows, fetchAdminRowsRange, fetchAllHouseholdMembersMap, fetchAnalysisRowsRange,
  fetchHouseholdMembers, fetchMemberAliasMap, fetchPostgrestRows, fetchRowsByPlainIds,
  getScopedHouseholdsForPage, isRowLimitExceededError, memberAliasSettingsKey, memberNameMap,
  normalizeMemberAliasMap, renderSpenderDatalist, renderSpenderOptions, roleRank, saveMemberAlias,
  selectRequestedScopedHousehold, selectScopedHousehold, supabaseExactCount,
};
// @build:exports-end
