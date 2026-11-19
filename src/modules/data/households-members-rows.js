// @build:imports-start
import { parseStrictSettingsObject, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserHouseholds, supabaseWithEmbedFallback } from "./users-household-create.js";
import { recurringSpenderEligible } from "../cron/recurring-auto-apply.js";
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
  const out = Object.create(null);
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

// V22.9.130 방 전용 보기(auth/user-session.js 의 넷째 칸 설명 참고): 라우터가 요청 처음에 세션 쿠키를 읽어 요청별 env 에 적어 둔 범위
// (env.__AB_ROOM_VIEW = { userId, householdId })를 읽는다. 범위는 그 세션의 사용자 번호로 읽을 때만 걸린다 — 같은 요청에서 다른 사람 번호로 읽는 일
// (구성원 목록·이름 표)은 그대로다. 카카오 스킬·예약 실행·관리자 화면에는 이 값이 없다(세션 쿠키가 없거나 다른 쿠키다).
function roomViewScopeForV229130(env, userId = "") {
  const scope = env?.__AB_ROOM_VIEW;
  const uid = String(userId || "");
  return scope && scope.householdId && scope.userId && uid && scope.userId === uid ? scope : null;
}

// 그 사용자의 역할을 범위에 맞춘다. 범위 밖 가계부는 구성원이 아닌 것("")으로, 범위 안 가계부는 읽을 수 있는 역할(소유자·관리자·구성원·조회 전용)이면
// 조회 전용(viewer)으로 낮춘다. 승인 대기·이용 제한·빈 역할은 그대로 둔다 — 읽을 수 없던 사람이 범위 때문에 읽게 되는 일은 없다.
// 범위가 없으면(보통 세션) 받은 값을 글자 하나 바꾸지 않고 돌려준다.
const ROOM_VIEW_READABLE_ROLES_V229130 = ["owner", "admin", "member", "viewer"];
function roomViewRoleV229130(env, userId = "", householdId = "", role = "") {
  const scope = roomViewScopeForV229130(env, userId);
  if (!scope) return role;
  if (String(householdId || "") !== scope.householdId) return "";
  return ROOM_VIEW_READABLE_ROLES_V229130.includes(String(role || "").toLowerCase()) ? "viewer" : role;
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
      // V22.9.77 N-15: options.strict(백업)는 별명 읽기 실패를 빈 별명으로 바꾸지 않는다.
      : fetchMemberAliasMap(env, householdId, { strict: options?.strict === true });
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
  const list = members.map((m) => {
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
  // V22.9.126 FC-21: 정기 규칙 지출자 자격을 예약 실행과 같은 판정(보정 전 역할 행, 역할이 비면 자격 없음)으로 붙여 둔다.
  // 화면 판정용 숨은 값이라(열거되지 않음) JSON·백업·비교에는 나오지 않고, role 보정(권한)은 그대로다.
  for (const member of list) Object.defineProperty(member, "recurringSpender", { value: recurringSpenderEligible(rawMembers, member.user_id) });
  return list;
}

async function fetchAllHouseholdMembersMap(env, households = []) {
  const out = Object.create(null);
  for (const h of households || []) {
    out[h.id] = await fetchHouseholdMembers(env, h.id);
  }
  return out;
}

// V22.9.37 감사 H8: 가계부마다 참여자를 따로 읽지 않고 한 번에(100개씩) 읽어 가계부별 인원만 센다. 같은 사람의 중복 행은 한 명이다.
async function fetchHouseholdMemberCounts(env, households = []) {
  const ids = [...new Set(safeArray(households).map((h) => String(h?.id || "").trim()).filter((id) => /^[A-Za-z0-9_-]{1,160}$/.test(id)))];
  const counts = Object.create(null);
  for (const id of ids) counts[id] = 0;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const params = new URLSearchParams();
    params.set("household_id", `in.(${chunk.join(",")})`);
    params.set("select", "household_id,user_id,role,created_at");
    params.set("order", "created_at.asc");
    const rows = await fetchPostgrestRows(env, `/rest/v1/household_members?${params.toString()}`);
    const seen = new Set();
    for (const row of rows) {
      const householdId = String(row?.household_id || "");
      const key = `${householdId}|${String(row?.user_id || "")}`;
      if (!householdId || !row?.user_id || seen.has(key)) continue;
      seen.add(key);
      counts[householdId] = (counts[householdId] || 0) + 1;
    }
  }
  return counts;
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
async function fetchPostgrestRows(env, path, { pageSize = 1000, limit = null, maxRows = 100000, analysisReceipt = false } = {}) {
  const parsed = new URL(String(path || ""), "https://postgrest.local");
  parsed.searchParams.delete("limit");
  parsed.searchParams.delete("offset");
  const wanted = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : null;
  const hardMax = Math.max(1000, Math.floor(Number(maxRows || 100000)));
  const size = Math.max(50, Math.min(1000, Math.floor(Number(pageSize || 500))));
  const rows = [];
  const receipt = { status: "complete", total: null, received: 0, pages: 0 };
  const ids = new Set();
  function uncertain(status) {
    if (receipt.status === "complete" || status === "inconsistent") receipt.status = status;
  }
  let offset = 0;
  while (true) {
    const remaining = wanted === null ? size : Math.min(size, wanted - rows.length);
    if (remaining <= 0) break;
    parsed.searchParams.set("limit", String(remaining));
    parsed.searchParams.set("offset", String(offset));
    const response = await supabase(env, `${parsed.pathname}${parsed.search}`, { method: "GET", ...(analysisReceipt ? {
      analysisGetResponse: true, headers: { prefer: "count=exact" },
    } : {}) });
    const page = analysisReceipt ? response.data : response;
    if (!Array.isArray(page)) throw new Error("PostgREST 목록 응답 형식이 올바르지 않습니다.");
    if (analysisReceipt) {
      receipt.pages++;
      const meta = response.meta;
      const range = String(meta.contentRange || "");
      const match = range.match(/^(?:(\d+)-(\d+)|\*)\/(\d+)$/);
      // A short page alone is never evidence of completion. Exact total is
      // requested on this same GET; missing/unknown metadata cannot prove zero.
      if (!match) uncertain("unknown");
      else {
        const total = Number(match[3]);
        const first = match[1] == null ? null : Number(match[1]);
        const last = match[2] == null ? null : Number(match[2]);
        if (![total, first, last].filter(value => value !== null).every(Number.isSafeInteger) ||
            (page.length ? first !== offset || last < first || last - first + 1 !== page.length || last >= total : first !== null || total > offset) ||
            (receipt.total !== null && receipt.total !== total)) uncertain("inconsistent");
        if (receipt.total === null) receipt.total = total;
      }
      if ((meta.rangeUnit && meta.rangeUnit !== "items") ||
          (meta.preferenceApplied && /count=(?!exact\b)/i.test(meta.preferenceApplied)) || ![200, 206].includes(meta.status)) uncertain("inconsistent");
      if (page.length > remaining) uncertain("inconsistent");
      for (const row of page) {
        const id = row && typeof row.id === "string" ? row.id : "";
        if (!id || ids.has(id)) uncertain("inconsistent");
        ids.add(id);
      }
    }
    if (!page.length) break;
    rows.push(...page);
    offset += page.length;
    if (page.length < remaining) {
      if (analysisReceipt && receipt.total !== null && offset < receipt.total) uncertain("response-cap");
      break;
    }
    if (analysisReceipt && receipt.total !== null && offset >= receipt.total) break;
    if (wanted !== null && rows.length >= wanted) break;
    if (rows.length >= hardMax) {
      parsed.searchParams.set("limit", "1");
      parsed.searchParams.set("offset", String(offset));
      const probe = await supabase(env, `${parsed.pathname}${parsed.search}`, { method: "GET" });
      if (Array.isArray(probe) && probe.length) throw rowLimitExceededError(hardMax);
      break;
    }
  }
  if (analysisReceipt) {
    receipt.received = rows.length;
    if (receipt.status === "complete" && receipt.total === null) receipt.status = "unknown";
    if (receipt.status === "complete" && rows.length < receipt.total) receipt.status = "limit";
    return { rows: wanted === null ? rows : rows.slice(0, wanted), receipt };
  }
  return wanted === null ? rows : rows.slice(0, wanted);
}

// V22.9.131 (Codex 점검 2026-11-19 2번): 백업처럼 ‘그 순간의 전부’ 여야 하는 조회. fetchPostgrestRows 는 1,000건씩 offset 으로 넘겨 읽어서,
// 쪽을 넘기는 사이 다른 구성원이 앞쪽 기록을 더하면 다음 쪽 첫 줄이 이미 읽은 기록이 되고(겹침), 지우면 한 건을 건너뛴다(빠짐).
// 쪽마다 정확한 전체 건수를 함께 받아(분석 화면이 쓰는 receipt — 호출 수는 그대로) 건수가 달라지거나 같은 id 가 다시 오면 처음부터 다시 읽는다.
// attempts 번 모두 어긋나면 rows_changed_during_read 오류를 낸다 — 겹치거나 빠진 파일을 온전한 백업처럼 내려보내지 않는다.
//  - complete: 건수·범위·id 가 모두 맞았다. unknown: 서버가 건수를 주지 않았다(겹친 id 는 없다) — 견줄 것이 없어 예전처럼 받는다.
//  - inconsistent(건수·범위가 달라짐, 같은 id)·response-cap(쪽이 서버 한도로 짧게 옴)·limit: 다시 읽는다.
//  - 쪽을 넘기는 사이 기록이 지워져 다음 쪽의 시작이 전체 건수를 넘으면 PostgREST 가 416 으로 답한다 — 바뀐 것으로 보고 다시 읽는다.
//  - 다시 읽는 중에 이 요청의 DB 호출 몫(기본 50)이 떨어지면 같은 오류로 끝낸다(쪽이 스물 몇을 넘는 가계부가 읽는 사이 바뀐 경우).
// 한 쪽으로 끝나는 조회는 읽기 한 번이라 어긋날 수 없다. 한도(maxRows)를 넘는 오류(row_limit_exceeded)와 그 밖의 오류는 그대로 올린다.
function rowsChangedDuringReadError(status = "") {
  return Object.assign(new Error("조회하는 동안 기록이 바뀌어 전체를 한 번에 읽지 못했습니다. 잠시 후 다시 시도해 주세요."), { name: "RowsChangedDuringReadError", code: "rows_changed_during_read", status });
}

function isRowsChangedDuringReadError(error) {
  return error?.code === "rows_changed_during_read";
}

async function fetchStableRowsV229131(env, path, { maxRows = 100000, attempts = 3 } = {}) {
  let status = "";
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    let result;
    try { result = await fetchPostgrestRows(env, path, { maxRows, analysisReceipt: true }); }
    catch (err) {
      // 다시 읽다가 이 요청의 DB 호출 몫이 떨어지면(쪽이 많은 가계부) 오류 화면 대신 ‘바뀌어서 만들지 못했다’ 로 알린다. 첫 읽기의 몫 부족은 예전처럼 그대로 올린다.
      if (attempt > 1 && String(err?.code || "") === "supabase_subrequest_budget_before_dispatch") throw rowsChangedDuringReadError("budget");
      if (!/^Supabase 416\b/.test(String(err?.message || ""))) throw err;
      status = "range";
      continue;
    }
    if (result.receipt.status === "complete" || result.receipt.status === "unknown") return result.rows;
    status = result.receipt.status;
  }
  throw rowsChangedDuringReadError(status);
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

// V22.9.77 감사 B-5: 이름이 같은 사람이 요약·정산·기록 목록에서 한 사람처럼 보였다. 단톡방 구성원은 payload 에 별명이 없어
// 모두 ‘카카오사용자’라서 "카카오사용자: 36,000원" 한 줄, "카카오사용자 → 카카오사용자" 송금 제안이 나왔다.
// 같은 이름이 둘 이상이면 넘겨받은 순서대로 ‘이름 1’·‘이름 2’를 붙인다. 다른 사람이 이미 쓰는 이름(예: 별명 ‘카카오사용자 1’)은
// 건너뛰고, 이름이 하나뿐이면 그대로 둔다. reserved 는 이 목록 밖에서 이미 쓰는 이름이다(겹치면 하나뿐이어도 번호를 붙인다).
// 돌려주는 Map 은 id → 겹치지 않는 이름이다.
function distinctPersonLabels(entries = [], reserved = new Set()) {
  const labels = new Map();
  const groups = new Map();
  for (const entry of safeArray(entries)) {
    const id = String(entry?.id ?? "").trim();
    if (!id || labels.has(id)) continue;
    const label = String(entry?.label || "").trim() || "구성원";
    labels.set(id, label);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(id);
  }
  const taken = new Set([...reserved, ...labels.values()]);
  for (const [label, ids] of groups) {
    if (ids.length < 2 && !reserved.has(label)) continue;
    let n = 0;
    for (const id of ids) {
      let candidate = "";
      do { n += 1; candidate = `${label} ${n}`; } while (taken.has(candidate));
      taken.add(candidate);
      labels.set(id, candidate);
    }
  }
  return labels;
}

// 번호는 지금 구성원끼리 참여 순서(가계부에 들어온 시각, fetchHouseholdMembers 와 같은 비교)로 매긴다. 부르는 쪽이 명단을
// 어떤 순서로 넘겨도, 나간 사람(role "left", fetchFormerSpenderMembers)을 섞어 넘겨도 같은 사람은 요약·정산·기록 목록에서
// 같은 이름을 받는다. 나간 사람은 나간 사람끼리 번호를 매기고(정산의 formerMap 과 같다), 지금 구성원과 이름이 겹치면
// 정산의 D-20 규칙처럼 ‘이름(나간 구성원)’으로 쓴다. 겹치지 않으면 예전처럼 기록 당시 이름 그대로다.
function memberNameMap(members = []) {
  const ordered = safeArray(members)
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member && member.user_id)
    .sort((a, b) => String(a.member.created_at || "").localeCompare(String(b.member.created_at || "")) || a.index - b.index);
  const entry = ({ member }) => ({ id: String(member.user_id).trim(), label: String(member.nickname || "").trim() || "구성원" });
  const current = ordered.filter(({ member }) => member.role !== "left").map(entry);
  const currentLabels = distinctPersonLabels(current);
  const reserved = new Set([...current.map((item) => item.label), ...currentLabels.values()]);
  const departedRaw = ordered.filter(({ member }) => member.role === "left").map(entry);
  const departedNumbered = distinctPersonLabels(departedRaw);
  const departed = departedRaw.map((item) => {
    const label = departedNumbered.get(item.id) || item.label;
    return { id: item.id, label: reserved.has(item.label) || reserved.has(label) ? `${label}(나간 구성원)` : label };
  });
  const map = Object.create(null);
  for (const [id, label] of currentLabels) map[id] = label;
  for (const [id, label] of distinctPersonLabels(departed, reserved)) if (!(id in map)) map[id] = label;
  return map;
}

// V22.9.77 감사 B-5: 카카오 요약의 지출자별 합계에 쓰는 이름. 정산(buildSettlementModel, V22.9.58 지문으로 고정)과 같은 규칙이다 —
// 지금 구성원은 memberNameMap(같은 이름이면 참여 순서 번호), 나간 사람은 V22.9.76 D-20 규칙(‘별명(나간 구성원)’,
// 이름을 모르면 ‘이전 구성원’·‘이전 구성원 N’). 끝에 한 번 더 겹치지 않게 맞춘다(별명을 일부러 ‘이전 구성원’처럼 지은 경우).
function householdPersonLabels(members = [], formerMembers = [], ids = []) {
  const memberMap = memberNameMap(members);
  const formerMap = memberNameMap(safeArray(formerMembers));
  const list = [...new Set(safeArray(ids).map((id) => String(id ?? "").trim()).filter(Boolean))];
  const departedIds = list.filter((id) => !memberMap[id]);
  const departedName = (id) => formerMap[id] ? `${formerMap[id]}(나간 구성원)` : departedIds.length > 1 ? `이전 구성원 ${departedIds.indexOf(id) + 1}` : "이전 구성원";
  return distinctPersonLabels(list.map((id) => ({ id, label: memberMap[id] || departedName(id) })));
}

function attachSpenderNames(rows = [], members = []) {
  const map = memberNameMap(members);
  return (rows || []).map((t) => ({
    ...t,
    spender_name: t.user_id ? (map[t.user_id] || "이전 구성원") : "미지정",
  }));
}

// V22.9.37 감사 H11: 가계부에서 나가면 참여 행은 지워지지만(RPC) 사용자 행과 기록은 남는다. 참여 명단에 없는 지출자는
// 사용자 행의 이름을 한 번에 읽어 기록 당시 이름으로 보여 주고, 그것도 없을 때만 "이전 구성원"이다.
// V22.9.40 A4: 홈 피드도 같은 조회를 쓰도록 조회 부분을 나눴다. 명단에 없는 지출자가 없으면 DB 를 부르지 않고 빈 목록,
// 조회에 실패해도 빈 목록이다(부르는 쪽은 예전 문구로 그린다). 돌려주는 줄(role "left")은 이름 맵에만 쓰고 지출자 선택지에는 넣지 않는다.
async function fetchFormerSpenderMembers(env, rows = [], members = []) {
  const known = memberNameMap(members);
  const missing = [...new Set(safeArray(rows).map((t) => String(t?.user_id || "").trim()).filter((id) => id && !known[id]))];
  if (!missing.length) return [];
  let users = [];
  try {
    users = await fetchRowsByPlainIds(env, "users", missing, "id,nickname");
  } catch (_) {
    users = [];
  }
  return safeArray(users)
    .filter((user) => user?.id && String(user.nickname || "").trim())
    .map((user) => ({ user_id: String(user.id), nickname: String(user.nickname).trim(), role: "left" }));
}

async function attachSpenderNamesWithHistory(env, rows = [], members = []) {
  const former = await fetchFormerSpenderMembers(env, rows, members);
  return attachSpenderNames(rows, former.length ? [...safeArray(members), ...former] : members);
}

function renderSpenderOptions(members = [], selected = "", blankLabel = "지출자 미지정") {
  const opts = [`<option value=""${!selected ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`];
  // V22.9.77 감사 B-5: 이름이 같은 구성원(‘카카오사용자’ 여럿)도 고를 수 있게 요약·정산과 같은 구분 이름을 쓴다.
  const names = memberNameMap(members);
  for (const m of members) {
    if (!memberCanBeSpender(m)) continue;
    opts.push(`<option value="${escapeHtml(m.user_id)}"${selected === m.user_id ? " selected" : ""}>${escapeHtml(names[m.user_id] || m.nickname || "구성원")} (${escapeHtml(userHouseholdRoleLabel(m.role || "member"))})</option>`);
  }
  return opts.join("");
}

// V22.9.131: stable — 백업 파일용(fetchStableRowsV229131). 화면·합계는 예전 그대로 읽는다.
async function fetchAdminRows(env, { month, householdId, type = "all", date = "", q = "", quality = "all", category = "", payment_method = "", stable = false }) {
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
  let rows = stable ? await fetchStableRowsV229131(env, `/rest/v1/transactions?${params.toString()}`) : await fetchPostgrestRows(env, `/rest/v1/transactions?${params.toString()}`);
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
// V22.9.131: stable(complete 일 때만) — 백업 파일용(fetchStableRowsV229131). 리포트·검색·합계는 예전 그대로 읽는다.
async function fetchAdminRowsRange(env, { householdId = "", start = "", end = "", type = "all", limit = 6000, complete = true, analysisReceipt = false, stable = false }) {
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  if (start) params.set("transaction_date", `gte.${start}`);
  if (end) params.append("transaction_date", `lt.${end}`);
  if (householdId) params.set("household_id", `eq.${householdId}`);
  if (type === "income" || type === "expense") params.set("type", `eq.${type}`);
  params.set("order", "transaction_date.desc,created_at.desc,id.desc");
  const rowLimit = Math.max(100, Math.min(Number(limit || 6000), 100000));
  const path = `/rest/v1/transactions?${params.toString()}`;
  if (complete && stable) return fetchStableRowsV229131(env, path, { maxRows: rowLimit });
  return complete
    ? fetchPostgrestRows(env, path, { maxRows: rowLimit })
    : fetchPostgrestRows(env, path, { limit: rowLimit, maxRows: rowLimit, analysisReceipt });
}
// @build:exports-start
export {
  attachSpenderNames, attachSpenderNamesWithHistory, bestRoleFromRows, countHouseholdTransactions,
  dedupeMemberRowsByKey, distinctPersonLabels, fetchAdminHouseholds, fetchAdminRows,
  fetchAdminRowsRange, fetchAnalysisRowsRange, fetchFormerSpenderMembers,
  fetchHouseholdMemberCounts, fetchHouseholdMembers, fetchMemberAliasMap, fetchPostgrestRows,
  fetchRowsByPlainIds, getScopedHouseholdsForPage, householdPersonLabels, isRowLimitExceededError,
  isRowsChangedDuringReadError, memberAliasSettingsKey, memberNameMap, normalizeMemberAliasMap,
  renderSpenderOptions, roleRank, roomViewRoleV229130, roomViewScopeForV229130, saveMemberAlias,
  selectRequestedScopedHousehold, supabaseExactCount,
};
// @build:exports-end
