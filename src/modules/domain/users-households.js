// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError, withHouseholdDatabaseLease } from "../runtime/leases.js";
import { bestRoleFromRows } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { mergedMarkerFreeName, resolveEffectiveUserId } from "../auth/user-session.js";
import { fetchUserById, withKakaoUserLifecycleLease } from "../data/users-household-create.js";
import { optionalSupabase } from "./budgets.js";
import { isDefiniteStorageFailure, isUncertainStorageWrite } from "../kakao/response-builders.js";
import {
  markKakaoChatFirstHistory, persistIdentityAliases, resolveLinkedIdentityUser,
  seedKakaoChatFirstUser,
} from "../kakao/identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

async function ensureUser(env, kakaoUserKey, nickname, aliasKeys = [], options = {}) {
  const rawKey = String(kakaoUserKey || "").trim();
  if (!rawKey) throw new Error("missing_kakao_user_identity");
  const key = encodeURIComponent(rawKey);
  const aliases = [...new Set([`skill_identity:${rawKey}`, ...safeArray(aliasKeys)].filter(Boolean))];
  // V22.9.77 감사 B-7: Secret 으로 확인된 카카오 요청일 때만 appUserId 로 기존 웹(카카오 로그인) 계정을 찾고, 그 별칭이 다른
  // 계정의 것이면 별칭만 빼고 지금 계정으로 계속한다. 그 밖의 호출은 예전 계약(찾지 않음, 충돌이면 실패)을 그대로 쓴다.
  const trust = { trustedKakaoCaller: options.trustedKakaoCaller === true };
  const existing = options.absenceConfirmed ? [] : await supabase(env, `/rest/v1/users?kakao_user_key=eq.${key}&select=id,kakao_user_key,nickname&limit=1`, { method: "GET" });
  if (existing?.[0]) {
    const rawUser = existing[0];
    const primaryAlias = `skill_identity:${rawKey}`;
    const hasAlternateAlias = aliases.some((alias) => alias !== primaryAlias);
    const mergedLooking = String(rawUser.kakao_user_key || "").startsWith("merged:") || /\(통합됨\)\s*$/.test(String(rawUser.nickname || ""));
    // A current, non-merged raw key with no distinct alias is already authoritative. Avoid a
    // second users read on a cold isolate, but keep merged-looking or reconciliation paths strict.
    if (!mergedLooking && !hasAlternateAlias) return rawUser;
    const effectiveId = await resolveEffectiveUserId(env, rawUser.id);
    const effective = effectiveId === String(rawUser.id) ? rawUser : await fetchUserById(env, effectiveId);
    if (!effective) throw new Error("effective_user_missing");
    await persistIdentityAliases(env, aliases, effective.id, "skill", trust);
    return effective;
  }

  const linked = options.absenceConfirmed ? null : await resolveLinkedIdentityUser(env, aliases, trust);
  if (linked) {
    const effectiveId = await resolveEffectiveUserId(env, linked.id);
    const effective = effectiveId === String(linked.id) ? linked : await fetchUserById(env, effectiveId);
    if (!effective) throw new Error("effective_user_missing");
    await persistIdentityAliases(env, aliases, effective.id, "skill", trust);
    return effective;
  }

  if (options.create === false) return null;
  // Only a confirmed absence of every existing identity may seed first-use eligibility.
  // The durable marker precedes the user insert so an interrupted first request can resume.
  if (options.seedChatFirst === true && options.bootstrapSeeded !== true) {
    return await seedKakaoChatFirstUser(env, rawKey, nickname, aliases, trust);
  }

  let user = null;
  try {
    options.assertFresh?.();
    const created = await supabase(env, "/rest/v1/users?on_conflict=kakao_user_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ kakao_user_key: rawKey, nickname: mergedMarkerFreeName(nickname, 80) || "카카오사용자" }),
    });
    user = Array.isArray(created) ? created[0] : created;
  } catch (err) {
    let retry;
    try { retry = await supabase(env, `/rest/v1/users?kakao_user_key=eq.${key}&select=id,kakao_user_key,nickname&limit=1`, { method: "GET" }); }
    catch (readErr) { if (isUncertainStorageWrite(err)) throw err; throw readErr; }
    if (!Array.isArray(retry)) throw new Error("user_source_invalid");
    if (retry[0]) user = retry[0];
    else {
      // Bare-insert compatibility is allowed only after a definite missing
      // on-conflict constraint, never after an unknown or late create result.
      if (!isDefiniteStorageFailure(err) || !/42P10|no unique or exclusion constraint|on_conflict/i.test(safeError(err))) throw err;
      options.assertFresh?.();
      const created = await supabase(env, "/rest/v1/users", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ kakao_user_key: rawKey, nickname: mergedMarkerFreeName(nickname, 80) || "카카오사용자" }),
      });
      user = Array.isArray(created) ? created[0] : created;
    }
  }
  if (user?.id) {
    const effectiveId = await resolveEffectiveUserId(env, user.id);
    const effective = effectiveId === String(user.id) ? user : await fetchUserById(env, effectiveId);
    if (!effective) throw new Error("effective_user_missing");
    await persistIdentityAliases(env, aliases, effective.id, "skill", trust);
    return effective;
  }
  return user;
}

async function ensurePrimaryHousehold(env, userId, nickname) {
  const forcedHouseholdId = String(env.KAKAO_DEFAULT_HOUSEHOLD_ID || "").trim();
  if (forcedHouseholdId) {
    const forcedRows = await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(forcedHouseholdId)}&select=id,name,invite_code&limit=1`, { method: "GET" });
    if (forcedRows?.[0]) {
      const existingRole = await getHouseholdMemberRole(env, userId, forcedRows[0].id);
      if (!existingRole) {
        await supabase(env, "/rest/v1/household_members?on_conflict=household_id,user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ household_id: forcedRows[0].id, user_id: userId, role: "member" }),
        });
      }
      return forcedRows[0];
    }
  }

  const members = await supabase(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}&select=household_id,role,created_at&order=created_at.desc`, { method: "GET" });
  const writable = (members || []).find((m) => !["pending","blocked","viewer"].includes(String(m.role || "member")));
  if (writable?.household_id) {
    const householdRows = await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(writable.household_id)}&select=id,name,invite_code&limit=1`, { method: "GET" });
    if (householdRows?.[0]) return householdRows[0];
  }

  // V22.4.1: 거래 저장·화면 진입 중에는 가계부를 묵시적으로 만들지 않습니다.
  // 가계부 생성은 createUserHousehold()의 명시적 사용자 요청에서만 허용합니다.
  return null;
}

async function joinHouseholdByCode(env, userId, code, options = {}) {
  if (options.lifecycleLeaseHeld !== true) return withKakaoUserLifecycleLease(env, userId, (lifecycleOptions) => joinHouseholdByCode(env, userId, code, lifecycleOptions));
  const householdRows = await supabase(env, `/rest/v1/households?invite_code=eq.${encodeURIComponent(code)}&select=id,name,invite_code&limit=1`, { method: "GET" });
  const household = householdRows?.[0];
  if (!household) return null;
  options.assertFresh?.();
  return withHouseholdDatabaseLease(env, household.id, async ({ assertFresh: householdFresh }) => {
  const assertFresh = () => { options.assertFresh?.(); householdFresh(); };
  const existing = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(household.id)}&user_id=eq.${encodeURIComponent(userId)}&select=role,created_at&order=created_at.desc`, { method: "GET" }) || [];
  const existingRole = bestRoleFromRows(existing);
  if (existingRole) {
    assertFresh();
    await markKakaoChatFirstHistory(env, userId);
    return { ...household, join_role: existingRole, already_joined: true };
  }

  const pendingRow = { household_id: household.id, user_id: userId, role: "pending" };
  try {
    assertFresh();
    await supabase(env, "/rest/v1/household_members?on_conflict=household_id,user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(pendingRow),
    });
    assertFresh();
    await markKakaoChatFirstHistory(env, userId);
    return { ...household, join_role: "pending", approval_enabled: true };
  } catch (pendingErr) {
    // 승인대기 저장 실패를 member 자동 승격으로 우회하지 않는다. 재전송/동시 요청으로
    // 이미 만들어진 역할만 한 번 다시 읽고, 없으면 안전하게 실패한다.
    let reread;
    try { reread = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(household.id)}&user_id=eq.${encodeURIComponent(userId)}&select=role,created_at&order=created_at.desc`, { method: "GET" }) || []; }
    catch (readErr) { if (isUncertainStorageWrite(pendingErr)) throw pendingErr; throw readErr; }
    const rereadRole = bestRoleFromRows(reread);
    if (rereadRole) {
      assertFresh();
      await markKakaoChatFirstHistory(env, userId);
      return { ...household, join_role: rereadRole, already_joined: true };
    }
    rememberOpsEvent({ kind: "household_join_pending_failed", severity: "error", path: "/rest/v1/household_members", method: "POST", detail: safeError(pendingErr) });
    if (isUncertainStorageWrite(pendingErr)) throw pendingErr;
    throw new Error("approval_request_failed", { cause: pendingErr });
  }
  });
}

// V22.9.37 감사 H15: 승인 대기 중인 사람이 자기 참여 요청만 거둔다. 다른 역할 행은 건드리지 않고, 지운 뒤 다시 읽어
// 비어 있음을 확인한 결과만 성공으로 본다(확인된 쓰기만 알린다). 참여와 같은 사용자 → 가계부 잠금 순서를 쓴다.
async function cancelPendingHouseholdJoin(env, userId, householdId, options = {}) {
  const uid = String(userId || "").trim();
  const hid = String(householdId || "").trim();
  if (!uid || !hid) return { cancelled: false, reason: "missing" };
  if (options.lifecycleLeaseHeld !== true) return withKakaoUserLifecycleLease(env, uid, (lifecycleOptions) => cancelPendingHouseholdJoin(env, uid, hid, lifecycleOptions));
  const membershipPath = `/rest/v1/household_members?household_id=eq.${encodeURIComponent(hid)}&user_id=eq.${encodeURIComponent(uid)}`;
  return withHouseholdDatabaseLease(env, hid, async ({ assertFresh: householdFresh }) => {
    const assertFresh = () => { options.assertFresh?.(); householdFresh(); };
    const rows = await supabase(env, `${membershipPath}&select=role,created_at&order=created_at.desc`, { method: "GET" });
    if (!Array.isArray(rows)) throw new Error("household_member_source_invalid");
    const role = bestRoleFromRows(rows);
    if (role !== "pending") return { cancelled: false, reason: role ? "not_pending" : "not_member", role };
    assertFresh();
    await supabase(env, `${membershipPath}&role=eq.pending`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    const remaining = await supabase(env, `${membershipPath}&select=role,created_at&order=created_at.desc`, { method: "GET" });
    if (!Array.isArray(remaining)) throw new Error("household_member_source_invalid");
    if (bestRoleFromRows(remaining)) return { cancelled: false, reason: "not_confirmed", role: bestRoleFromRows(remaining) };
    return { cancelled: true, household_id: hid };
  });
}

async function getPendingHousehold(env, userId) {
  const rows = await optionalSupabase(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(userId)}&role=eq.pending&select=household_id,created_at&order=created_at.desc&limit=10`, { method: "GET" }, []) || [];
  for (const row of rows) {
    if (!row?.household_id) continue;
    const bestRole = await getHouseholdMemberRole(env, userId, row.household_id);
    if (bestRole !== "pending") continue;
    const h = await optionalSupabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(row.household_id)}&select=id,name,invite_code&limit=1`, { method: "GET" }, []) || [];
    if (h?.[0]) return h[0];
  }
  return null;
}

async function getHouseholdMemberRole(env, userId, householdId) {
  if (!userId || !householdId) return "";
  const rows = await optionalSupabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}&select=role,created_at&order=created_at.desc`, { method: "GET" }, []) || [];
  return bestRoleFromRows(rows);
}

// V22.9.76 감사 D-27: getHouseholdMemberRole 은 조회가 실패(503 등)하면 빈 역할("")을 돌려줘 "권한이 없습니다"·
// "참여자가 아닙니다"로 안내됐다. 권한을 바꾸거나 거절을 알리는 곳은 이 엄격판을 써서 '확인하지 못함'을 따로 알린다.
async function getHouseholdMemberRoleStrict(env, userId, householdId) {
  if (!userId || !householdId) return "";
  let rows;
  try {
    rows = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}&select=role,created_at&order=created_at.desc`, { method: "GET" });
  } catch (err) {
    throw Object.assign(new Error(`household_role_check_failed: ${String(err?.message || err).slice(0, 120)}`), { code: "household_role_check_failed" });
  }
  if (!Array.isArray(rows)) throw Object.assign(new Error("household_role_check_failed: invalid response"), { code: "household_role_check_failed" });
  return bestRoleFromRows(rows);
}

function isHouseholdRoleCheckFailure(err) {
  return err?.code === "household_role_check_failed" || /household_role_check_failed/.test(String(err?.message || ""));
}

// V22.9.80 T-35: 웹 저장 화면(예산·정기 항목·자산·홈 구성·표시 설정)의 권한 확인용 엄격 조회. getHouseholdMemberRole 은 조회가 실패(503·시간 초과)하면
// 빈 역할("")을 돌려줘 ‘권한 없음’으로 읽혔다(V22.9.79 D-27 과 같은 꼴 — 권한이 있는 사람에게 권한이 없다고 말했다). 이 함수는 실패를 failed=true 로
// 따로 돌려준다: 부르는 쪽은 거절이 아니라 ‘권한을 확인하지 못했다’(household_role_check_failed)로 알리고 아무것도 바꾸지 않는다. 참여자가 아님·역할 부족은
// 예전처럼 role 로 판정한다. 읽기는 getHouseholdMemberRole 과 같은 한 번이고, 로그인·가계부가 없으면 읽지 않는다(role "").
const ROLE_CHECK_FAILED_TEXT = "권한을 확인하지 못해 아무것도 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.";
// V22.9.81 U-4: 카카오 답장(‘~어요’ 말투)에서 같은 뜻으로 쓰는 문장. 예산 설정·내 이름·기록 수정·단톡방 연결 흐름이 역할 조회 실패를 ‘권한 없음’으로 읽지 않고 이렇게 알린다.
const KAKAO_ROLE_CHECK_FAILED_TEXT = "권한을 확인하지 못해 아무것도 바꾸지 않았어요. 잠시 후 다시 보내 주세요.";
async function readHouseholdRoleOrFailure(env, userId, householdId, { path = "", method = "POST" } = {}) {
  try {
    return { role: String(await getHouseholdMemberRoleStrict(env, userId, householdId) || "").toLowerCase(), failed: false };
  } catch (err) {
    if (!isHouseholdRoleCheckFailure(err)) throw err;
    rememberOpsEvent({ kind: "household_role_check_failed", severity: "warn", path: String(path || ""), method: String(method || "POST"), detail: safeError(err) });
    return { role: "", failed: true };
  }
}

function roleBlockedMessage(role, householdName = "") {
  if (role === "blocked") return `⛔ 이 가계부에서 사용이 제한되어 있습니다.\n가계부: ${householdName || "-"}\n\n관리자에게 /households 화면에서 권한을 확인해달라고 요청하세요.`;
  if (role === "viewer") return `👀 조회 전용 권한입니다.\n가계부: ${householdName || "-"}\n\n요약/최근 조회는 가능하지만 새 지출 입력은 관리자 승인이 필요합니다.`;
  if (role === "pending") return `🕒 아직 승인 대기 중입니다.\n가계부: ${householdName || "-"}\n\n관리자가 /households 화면에서 참여자를 승인해야 기록할 수 있습니다.`;
  return "";
}
// @build:exports-start
export {
  KAKAO_ROLE_CHECK_FAILED_TEXT, cancelPendingHouseholdJoin, ensurePrimaryHousehold, ensureUser,
  getHouseholdMemberRole, getHouseholdMemberRoleStrict, isHouseholdRoleCheckFailure,
  joinHouseholdByCode, readHouseholdRoleOrFailure, roleBlockedMessage,
};
// @build:exports-end
