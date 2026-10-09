// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, operationLeaseOwner, releaseOperationLease, safeError, withOperationMutex,
  withSettingsRmwLease,
} from "../runtime/leases.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import { bestRoleFromRows, fetchRowsByPlainIds, roleRank } from "./households-members-rows.js";
import { isDefiniteStorageFailure, isUncertainStorageWrite } from "../kakao/response-builders.js";
import { getHouseholdById } from "../kakao/household-budget-commands.js";
import { markKakaoChatFirstHistory } from "../kakao/identity-chat-first.js";
import { supabase } from "./supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { makeInviteCode } from "../domain/transactions-core.js";
// @build:imports-end

async function fetchUserById(env, userId) {
  if (env.__AB_REQUEST_USER_ROWS?.has(String(userId))) return env.__AB_REQUEST_USER_ROWS.get(String(userId));
  const rows = await supabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id,nickname,kakao_user_key,created_at&limit=1`, { method: "GET" });
  if (env.__AB_REQUEST_USER_ROWS) env.__AB_REQUEST_USER_ROWS.set(String(userId), rows?.[0] || null);
  return rows?.[0] || null;
}

async function fetchRawHouseholdMembers(env, householdId = "") {
  if (!householdId) return [];
  const rows = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=user_id,role,created_at&order=created_at.asc`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("household_member_source_invalid");
  return rows;
}

async function ensureOwnerMembership(env, userId = "", householdId = "", options = {}) {
  if (!userId || !householdId) return "";
  const rows = await fetchRawHouseholdMembers(env, householdId);
  const currentRows = rows.filter((m) => String(m.user_id || "") === String(userId));
  const currentBest = bestRoleFromRows(currentRows);
  if (currentBest) return currentBest;
  if (!options?.explicitHouseholdCreation) return "";
  const ownerExists = rows.some((m) => String(m.role || "") === "owner");
  if (ownerExists) throw new Error("owner_already_exists");
  await supabase(env, "/rest/v1/household_members?on_conflict=household_id,user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ household_id: householdId, user_id: userId, role: "owner" }),
  });
  return "owner";
}

// V22.9.16: PostgREST 자원 포함(embedding)으로 "참여 행 → 가계부 행" 두 왕복을 한 번에 읽는다.
// 외래키가 없거나 모호해 PostgREST 가 거절(300·400 계열)하면 그 아이솔레이트에서는 예전
// 두 단계 조회로 돌아가고 운영 이벤트에 남긴다. 네트워크 오류는 예전처럼 그대로 던진다.
const AB_POSTGREST_EMBED_SUPPORT = globalThis.__AB_POSTGREST_EMBED_SUPPORT || (globalThis.__AB_POSTGREST_EMBED_SUPPORT = { household_members_households: true, household_members_users: true });

function isPostgrestEmbedRejection(err) {
  return /^Supabase (300|400|404|406)\b/.test(String(err?.message || err || ""));
}

async function supabaseWithEmbedFallback(env, embedKey, embeddedPath, plainPath) {
  if (AB_POSTGREST_EMBED_SUPPORT[embedKey] !== false) {
    try {
      return { rows: (await supabase(env, embeddedPath, { method: "GET" })) || [], embedded: true };
    } catch (err) {
      if (!isPostgrestEmbedRejection(err)) throw err;
      AB_POSTGREST_EMBED_SUPPORT[embedKey] = false;
      rememberOpsEvent({ kind: "postgrest_embed_unavailable", severity: "warn", path: embeddedPath.split("?")[0], method: "GET", detail: `${embedKey}: ${safeError(err)}` });
    }
  }
  return { rows: (await supabase(env, plainPath, { method: "GET" })) || [], embedded: false };
}

async function fetchUserHouseholds(env, userId) {
  const memberPath = `/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}`;
  const { rows: raw, embedded } = await supabaseWithEmbedFallback(
    env,
    "household_members_households",
    `${memberPath}&select=household_id,role,created_at,households(id,name,invite_code,created_at)&order=created_at.desc`,
    `${memberPath}&select=household_id,role,created_at&order=created_at.desc`,
  );
  const byHousehold = new Map();
  for (const m of raw) {
    const hid = String(m.household_id || "");
    if (!hid) continue;
    const prev = byHousehold.get(hid);
    if (!prev || roleRank(m.role) > roleRank(prev.role) || (roleRank(m.role) === roleRank(prev.role) && String(m.created_at || "") > String(prev.created_at || ""))) byHousehold.set(hid, m);
  }
  const orderedMemberships = [...byHousehold.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const householdRows = embedded
    ? orderedMemberships.map((membership) => membership.households).filter((household) => household && household.id)
    : await fetchRowsByPlainIds(env, "households", orderedMemberships.map((membership) => membership.household_id), "id,name,invite_code,created_at");
  const householdsById = new Map(householdRows.map((household) => [String(household.id || ""), household]));
  return orderedMemberships.map((membership) => {
    const household = householdsById.get(String(membership.household_id || ""));
    return household ? { ...household, role: membership.role || "member", joined_at: membership.created_at } : null;
  }).filter(Boolean);
}

async function withKakaoUserLifecycleLease(env, userIds, task) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map((id) => String(id || "").trim()).filter(Boolean))].sort();
  if (!ids.length) throw new Error("missing_household_lifecycle_user");
  const guards = [];
  const run = async (index) => {
    if (index === ids.length) return task({ lifecycleLeaseHeld: true, assertFresh: () => guards.forEach((guard) => guard()) });
    return withSettingsRmwLease(env, `kakao_first_record_lifecycle_v22928:${ids[index]}`, async ({ assertFresh }) => {
      guards.push(assertFresh);
      return run(index + 1);
    });
  };
  return run(0);
}

async function createUserHousehold(env, userId, name, nickname, options = {}) {
  if (options.lifecycleLeaseHeld !== true) {
    return withKakaoUserLifecycleLease(env, userId, ({ assertFresh }) => createUserHousehold(env, userId, name, nickname, {
      ...options, lifecycleLeaseHeld: true, assertFresh: () => { options.assertFresh?.(); assertFresh(); },
    }));
  }
  const householdName = String(name || `${nickname || "내"} 가계부`).trim().slice(0, 80) || "내 가계부";
  options.assertFresh?.();
  const candidateId = options.id || crypto.randomUUID();
  let householdRows;
  try {
    householdRows = await supabase(env, "/rest/v1/households", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id: candidateId, name: householdName, invite_code: makeInviteCode() }),
    });
  } catch (err) {
    if (isDefiniteStorageFailure(err)) throw err;
    options.assertFresh?.();
    const recovered = await getHouseholdById(env, candidateId);
    if (!recovered) throw err;
    householdRows = [recovered];
  }
  const household = Array.isArray(householdRows) ? householdRows[0] : householdRows;
  if (!household?.id) throw new Error("household_create_response_invalid");
  try {
    options.assertFresh?.();
    await ensureOwnerMembership(env, userId, household.id, { explicitHouseholdCreation: true });
  } catch (membershipErr) {
    options.assertFresh?.();
    // Strict full-membership read: an outage is not evidence of absent ownership.
    let freshMembers;
    try { freshMembers = await fetchRawHouseholdMembers(env, household.id); }
    catch (readErr) { if (isUncertainStorageWrite(membershipErr)) throw membershipErr; throw readErr; }
    const recoveredOwner = bestRoleFromRows(freshMembers.filter((row) => String(row.user_id || "") === String(userId))) === "owner";
    if (!recoveredOwner) {
      // Even a confirmed empty reread cannot exclude an unknown POST committing later.
      if (!isDefiniteStorageFailure(membershipErr) || freshMembers.length) throw membershipErr;
      const transactions = await supabase(env, `/rest/v1/transactions?household_id=eq.${encodeURIComponent(household.id)}&select=id&limit=1`, { method: "GET" });
      if (!Array.isArray(transactions)) throw new Error("household_transaction_source_invalid");
      if (transactions.length) throw membershipErr;
      try {
        options.assertFresh?.();
        await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(household.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      } catch (cleanupErr) {
        rememberOpsEvent({ kind: "household_create_compensation_failed", severity: "critical", path: "/rest/v1/households", method: "DELETE", detail: `household=${String(household.id).slice(0, 80)} membership=${safeError(membershipErr)} cleanup=${safeError(cleanupErr)}` });
      }
      throw membershipErr;
    }
  }
  options.assertFresh?.();
  if (options.skipChatFirstHistory !== true) await markKakaoChatFirstHistory(env, userId);
  return household;
}

async function withHouseholdCreateLock(env, userId = "", name = "", task) {
  const normalizedUser = String(userId || "anonymous").trim().slice(0, 120);
  const normalizedName = normalizeText(name).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  const key = `household-create:${await sha256Hex(`${normalizedUser}:${normalizedName}`)}`;
  return withOperationMutex(key, async () => {
    const lease = await claimOperationLease(env, {
      key,
      owner: operationLeaseOwner("household-create"),
      leaseSeconds: Number(env.HOUSEHOLD_CREATE_LEASE_SECONDS || 30),
    });
    if (!lease.acquired) throw new Error("household_create_busy");
    try {
      return await withKakaoUserLifecycleLease(env, userId, async (lifecycleOptions) => {
        lifecycleOptions.assertFresh();
        const result = await task(lifecycleOptions);
        if (result?.existed && result.household?.id) {
          lifecycleOptions.assertFresh();
          await markKakaoChatFirstHistory(env, userId);
        }
        return result;
      });
    } finally {
      await releaseOperationLease(env, lease);
    }
  });
}
// @build:exports-start
export {
  createUserHousehold, ensureOwnerMembership, fetchRawHouseholdMembers, fetchUserById,
  fetchUserHouseholds, supabaseWithEmbedFallback, withHouseholdCreateLock,
  withKakaoUserLifecycleLease,
};
// @build:exports-end
