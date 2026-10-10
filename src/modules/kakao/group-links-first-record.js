// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  isUniqueConstraintError, parseStrictSettingsObject, safeError, settingsDataError,
  withHouseholdDatabaseLease, withSettingsRmwLease,
} from "../runtime/leases.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import { bestRoleFromRows } from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeObject } from "../admin/backup-compare.js";
import {
  fetchRawHouseholdMembers, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { optionalSupabase } from "../domain/budgets.js";
import { kakaoClaimUserUnmerged } from "../auth/kakao-web-claim.js";
import {
  isDefiniteStorageFailure, isUncertainStorageWrite, kakaoText,
} from "./response-builders.js";
import { getHouseholdById } from "./household-budget-commands.js";
import { saveKakaoParsedTransactionsReply } from "./transaction-save.js";
import { markKakaoChatFirstHistory, stableShortHash } from "./identity-chat-first.js";
import {
  ensurePrimaryHousehold, getHouseholdMemberRole, roleBlockedMessage,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { makeInviteCode } from "../domain/transactions-core.js";
// @build:imports-end

function getKakaoBotGroupKey(payload) {
  const props = payload?.userRequest?.user?.properties || {};
  const userReq = payload?.userRequest || {};
  const chat = userReq?.chat || payload?.chat || payload?.group || {};
  const candidates = [
    props.botGroupKey,
    props.groupKey,
    userReq.botGroupKey,
    userReq.groupKey,
    chat.botGroupKey,
    chat.groupKey,
    chat.id,
    payload?.botGroupKey,
    payload?.groupKey,
  ].map((x) => String(x || "").trim()).filter(Boolean);
  const stable = candidates.find((x) => x && x !== "unknown-group");
  return stable ? stable.slice(0, 160) : "";
}

function kakaoGroupLinksSettingsKey() {
  return "kakao_group_links";
}

// V22.9.31: only an explicit botGroupKey can authorize a new shared room ledger.
// Legacy groupKey/chat.id remain read/bind compatibility inputs, never provisioning proof.
function getExplicitKakaoBotGroupKey(payload = {}) {
  const req = payload?.userRequest || {};
  const props = req.user?.properties || payload?.user?.properties || {};
  const keys = [...new Set([props.botGroupKey, req.botGroupKey, req.chat?.botGroupKey, payload?.botGroupKey]
    .map(value => String(value || "").trim()).filter(Boolean))];
  return keys.length === 1 && keys[0] !== "unknown-group" && keys[0].length <= 160 ? keys[0] : "";
}

async function kakaoGroupFirstKeys(groupKey, userId = "") {
  const hash = await sha256Hex(String(groupKey));
  const userHash = userId ? await sha256Hex(String(userId)) : "";
  return {
    hash, marker: `kakao_group_first_v22931:${hash}`, done: `kakao_group_first_done_v22931:${hash}`,
    retired: `kakao_group_first_retired_v22931:${hash}`,
    departure: userHash ? `kakao_group_departed_v22931:${userHash}` : "",
    member: userHash ? `kakao_group_member_attempt_v22931:${hash}:${userHash}` : "",
  };
}

function parseKakaoGroupFirstMarker(value, groupKey, complete = false) {
  const marker = parseStrictSettingsObject(value, "kakao_group_first");
  if (!Object.keys(marker).length) return null;
  if (marker.version !== 1 || typeof marker.group_key !== "string" || !marker.group_key.trim() || marker.group_key.length > 160 || marker.group_key !== groupKey || !marker.owner_id || typeof marker.owner_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(marker.candidate_id || "")) ||
      !Number.isFinite(Date.parse(String(marker.created_at || ""))) ||
      !(complete ? marker.phase === "complete" : ["reserved", "create_sent", "owner_sent", "link_sent", "complete"].includes(marker.phase))) {
    throw settingsDataError("kakao_group_first", "invalid_shape");
  }
  return marker;
}

function parseKakaoGroupDepartures(value) {
  const item = parseStrictSettingsObject(value, "kakao_group_departed");
  if (!Object.keys(item).length) return { version: 1, households: {} };
  if (item.version !== 1 || !item.households || typeof item.households !== "object" || Array.isArray(item.households) ||
      Object.entries(item.households).some(([key, flag]) => !/^[0-9a-f]{64}$/.test(key) || flag !== true)) {
    throw settingsDataError("kakao_group_departed", "invalid_shape");
  }
  return item;
}

async function readKakaoGroupFirstSnapshot(env, groupKey, userId = "") {
  const keys = await kakaoGroupFirstKeys(groupKey, userId);
  const primaryKey = kakaoGroupLinkItemSettingsKey(groupKey);
  const wanted = [keys.marker, keys.done, keys.retired, primaryKey, kakaoGroupLinksSettingsKey(), keys.departure, keys.member].filter(Boolean);
  const rows = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${wanted.map(encodeURIComponent).join(",")})&select=key,value`, { method: "GET" });
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.key !== "string") || new Set(rows.map(row => row.key)).size !== rows.length) throw settingsDataError("kakao_group_first", "invalid_rows");
  const value = key => rows.find(row => row.key === key)?.value;
  const primary = normalizeKakaoGroupLinkItem(value(primaryKey), groupKey);
  if (value(primaryKey) && !primary) throw settingsDataError("kakao_group_link", "invalid_shape");
  const legacyMap = parseStrictSettingsObject(value(kakaoGroupLinksSettingsKey()), "kakao_group_links");
  const legacy = legacyMap[groupKey] ? normalizeKakaoGroupLinkItem({ ...legacyMap[groupKey], group_key: groupKey }, groupKey) : null;
  if (legacyMap[groupKey] && !legacy) throw settingsDataError("kakao_group_links", "invalid_shape");
  const retired = parseStrictSettingsObject(value(keys.retired), "kakao_group_first_retired");
  if (Object.keys(retired).length && (retired.version !== 1 || retired.group_hash !== keys.hash)) throw settingsDataError("kakao_group_first_retired", "invalid_shape");
  const member = parseStrictSettingsObject(value(keys.member), "kakao_group_member_attempt");
  if (Object.keys(member).length && (member.version !== 1 || member.user_id !== userId || !member.household_id || member.phase !== "member_sent")) throw settingsDataError("kakao_group_member_attempt", "invalid_shape");
  const marker = parseKakaoGroupFirstMarker(value(keys.marker), groupKey);
  const done = parseKakaoGroupFirstMarker(value(keys.done), groupKey, true);
  if (marker && done && (marker.candidate_id !== done.candidate_id || marker.owner_id !== done.owner_id)) throw settingsDataError("kakao_group_first", "completion_conflict");
  return { keys, marker, done, retired: !!Object.keys(retired).length, link: primary || legacy, departures: parseKakaoGroupDepartures(value(keys.departure)), member };
}

function kakaoGroupPreparationUnknown(cause) {
  const err = new Error("kakao_group_preparation_result_unknown", { cause });
  err.uncertain_write = true;
  return err;
}

function strictKakaoGroupMembershipRows(rows, full = false) {
  if (!Array.isArray(rows) || rows.some(row => !row || !["owner", "admin", "member", "viewer", "pending", "blocked"].includes(row.role) || full && !String(row.user_id || ""))) throw settingsDataError("kakao_group_membership", "invalid_rows");
  return rows;
}

async function insertKakaoGroupFirstSetting(env, key, item, options = {}) {
  let rows;
  try {
    rows = await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ key, value: JSON.stringify(item) }),
    });
    if (!Array.isArray(rows)) throw kakaoGroupPreparationUnknown();
    if (rows[0]?.key === key && rows[0]?.value) return rows[0].value;
  } catch (err) {
    if (isDefiniteStorageFailure(err)) throw err;
    // Reservation and sent rows are immutable INSERTs. A lost response can only be
    // recovered from that exact key; a missing reread is never permission for another POST.
    try { const recovered = await getSettingValueStrict(env, key); if (recovered && !options.requireInserted) return recovered; }
    catch (_) {}
    throw kakaoGroupPreparationUnknown(err);
  }
  const existing = await getSettingValueStrict(env, key);
  if (!existing || options.requireInserted) throw kakaoGroupPreparationUnknown();
  return existing;
}

async function withKakaoGroupLifecycleLease(env, groupKeys, task) {
  const keys = [...new Set((Array.isArray(groupKeys) ? groupKeys : [groupKeys]).map(String).filter(Boolean))].sort();
  const guards = [];
  const run = async index => index === keys.length
    ? task({ roomLeaseHeld: true, assertFresh: () => guards.forEach(guard => guard()) })
    : withSettingsRmwLease(env, `kakao-group-lifecycle:v22931:${await sha256Hex(keys[index])}`, async ({ assertFresh }) => { guards.push(assertFresh); return run(index + 1); });
  return run(0);
}

async function markKakaoGroupRetired(env, groupKey, assertFresh = () => {}) {
  const keys = await kakaoGroupFirstKeys(groupKey);
  assertFresh();
  await insertKakaoGroupFirstSetting(env, keys.retired, { version: 1, group_hash: keys.hash });
}

async function markKakaoGroupDeparture(env, userId, householdId, assertFresh = () => {}) {
  const key = `kakao_group_departed_v22931:${await sha256Hex(String(userId))}`;
  const departures = parseKakaoGroupDepartures(await getSettingValueStrict(env, key));
  departures.households[await sha256Hex(String(householdId))] = true;
  assertFresh();
  // The user lifecycle lease serializes the set. Only digests survive household purge.
  await saveSettingValue(env, key, JSON.stringify(departures));
}

async function preserveKakaoGroupDeparturesForMerge(env, primaryId, secondaryId, assertFresh = () => {}) {
  const primaryKey = `kakao_group_departed_v22931:${await sha256Hex(String(primaryId))}`;
  const secondaryKey = `kakao_group_departed_v22931:${await sha256Hex(String(secondaryId))}`;
  const rows = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${encodeURIComponent(primaryKey)},${encodeURIComponent(secondaryKey)})&select=key,value`, { method: "GET" });
  const wanted = [primaryKey, secondaryKey];
  if (!Array.isArray(rows) || rows.some(row => !row || !wanted.includes(row.key) || typeof row.value !== "string" || !row.value.trim()) || new Set(rows.map(row => row.key)).size !== rows.length) throw settingsDataError("kakao_group_departed", "invalid_rows");
  const primary = parseKakaoGroupDepartures(rows.find(row => row.key === primaryKey)?.value);
  const secondary = parseKakaoGroupDepartures(rows.find(row => row.key === secondaryKey)?.value);
  if (Object.keys(secondary.households).every(hash => primary.households[hash] === true)) return;
  assertFresh();
  // Both user lifecycle leases are held by the supported merge handler. Preserve
  // the union before its possibly unknown RPC; never erase the secondary source.
  await saveSettingValue(env, primaryKey, JSON.stringify({ version: 1, households: { ...primary.households, ...secondary.households } }));
}

async function tryKakaoGroupFirstRecord(env, context = {}) {
  const { user, groupKey, parsedList } = context;
  let recordSaved = false;
  try {
    const observed = await readKakaoGroupFirstSnapshot(env, groupKey, user.id);
    const userIds = [...new Set([String(user.id), ...(!observed.done && observed.marker ? [observed.marker.owner_id] : [])])].sort();
    return await withKakaoUserLifecycleLease(env, userIds, async ({ assertFresh: userFresh }) => {
      userFresh();
      env.__AB_REQUEST_USER_ROWS?.delete(String(user.id));
      if (!(await kakaoClaimUserUnmerged(env, user.id))) throw new Error("kakao_group_identity_scope_changed");
      return withKakaoGroupLifecycleLease(env, groupKey, async ({ assertFresh: roomFresh }) => {
        const roomGuard = () => { userFresh(); roomFresh(); };
        let snapshot = await readKakaoGroupFirstSnapshot(env, groupKey, user.id);
        let marker = snapshot.done || snapshot.marker;
        let firstNotice = "";
        if (!snapshot.link && (snapshot.retired || snapshot.done || marker?.phase === "complete")) {
          return kakaoText("이 단톡방의 이전 연결이 해제되거나 가계부가 삭제되어 자동으로 다시 준비하지 않았어요. 이 요청의 기록은 어디에도 저장하지 않았어요. 소유자 또는 관리자가 사용할 가계부를 직접 연결해 주세요.");
        }
        if (!snapshot.link && !marker) {
          // A namespace-derived UUID stays fixed even if the reservation response is lost.
          // The UUID identifies a ledger; all access still requires verified membership.
          const digest = await sha256Hex(`kakao-shared-room:v22931:${groupKey}`);
          const hex = digest.slice(0, 12) + "5" + digest.slice(13, 16) + "8" + digest.slice(17, 32);
          const candidate_id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
          roomGuard();
          marker = parseKakaoGroupFirstMarker(await insertKakaoGroupFirstSetting(env, snapshot.keys.marker, {
            version: 1, group_key: groupKey, candidate_id, owner_id: String(user.id), phase: "reserved", created_at: new Date().toISOString(),
          }), groupKey);
        }
        const preparing = !snapshot.link && !!marker && !snapshot.done;
        if (preparing && !userIds.includes(marker.owner_id)) throw new Error("kakao_group_preparation_scope_changed");
        if (!snapshot.done && marker && marker.phase !== "complete" && marker.owner_id !== String(user.id)) {
          if (!userIds.includes(marker.owner_id)) throw new Error("kakao_group_preparation_scope_changed");
          roomGuard();
          env.__AB_REQUEST_USER_ROWS?.delete(marker.owner_id);
          if (!(await kakaoClaimUserUnmerged(env, marker.owner_id))) throw new Error("kakao_group_identity_scope_changed");
        }
        const householdId = snapshot.link?.household_id || marker?.candidate_id;
        if (!householdId) throw new Error("kakao_group_household_missing");
        // Same order in create/bind/unbind/purge/leave: users -> rooms -> households.
        return await withSettingsRmwLease(env, `household-settings-rmw:${householdId}`, async ({ assertFresh: householdFresh }) => {
          const assertFresh = () => { roomGuard(); householdFresh(); };
          let household = await getHouseholdById(env, householdId);
          const phase = async next => {
            marker = { ...marker, phase: next };
            assertFresh();
            await saveSettingValue(env, snapshot.keys.marker, JSON.stringify(marker));
          };
          // V22.9.37 감사 H6: 저장소가 분명히 거절(4xx)한 POST 는 아무것도 쓰지 않았다. 단계를 한 칸 되돌려 다음 메시지가 같은
          // 고정 ID 로 다시 시도하게 한다. 결과를 모르는 실패는 예전처럼 단계를 남기고 고정 대상만 재조회한다(새 UUID·보상 삭제 없음).
          const rollbackPhase = async previous => { try { await phase(previous); } catch (_) {} };
          const rollbackMemberAttempt = async () => {
            try { assertFresh(); await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(snapshot.keys.member)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); } catch (_) {}
          };
          if (preparing) {
            if (!household) {
              if (marker.phase !== "reserved") throw kakaoGroupPreparationUnknown();
              await phase("create_sent");
              assertFresh();
              try {
                const created = await supabase(env, "/rest/v1/households", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: householdId, name: "이 방의 공동 가계부", invite_code: makeInviteCode() }) });
                household = Array.isArray(created) ? created[0] : null;
                if (household?.id !== householdId) throw kakaoGroupPreparationUnknown();
              } catch (err) {
                if (isDefiniteStorageFailure(err)) { if (!isUniqueConstraintError(err)) await rollbackPhase("reserved"); throw err; }
                assertFresh();
                try { household = await getHouseholdById(env, householdId); }
                catch (_) { throw kakaoGroupPreparationUnknown(err); }
                if (!household) throw kakaoGroupPreparationUnknown(err);
              }
            }
            let members = strictKakaoGroupMembershipRows(await fetchRawHouseholdMembers(env, householdId), true);
            let ownerRole = bestRoleFromRows(members.filter(row => String(row.user_id) === marker.owner_id));
            if (ownerRole && ownerRole !== "owner" || members.some(row => row.role === "owner" && String(row.user_id) !== marker.owner_id)) throw new Error("kakao_group_first_owner_conflict");
            if (!ownerRole) {
              if (marker.phase !== "create_sent") throw kakaoGroupPreparationUnknown();
              await phase("owner_sent");
              assertFresh();
              let writeError;
              try { await supabase(env, "/rest/v1/household_members?on_conflict=household_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ household_id: householdId, user_id: marker.owner_id, role: "owner" }) }); }
              catch (err) { writeError = err; }
              assertFresh();
              try { members = strictKakaoGroupMembershipRows(await fetchRawHouseholdMembers(env, householdId), true); }
              catch (readErr) { if (writeError && !isDefiniteStorageFailure(writeError)) throw kakaoGroupPreparationUnknown(writeError); if (writeError) await rollbackPhase("create_sent"); throw readErr; }
              ownerRole = bestRoleFromRows(members.filter(row => String(row.user_id) === marker.owner_id));
              if (ownerRole !== "owner") {
                if (writeError && isDefiniteStorageFailure(writeError)) { await rollbackPhase("create_sent"); throw writeError; }
                throw kakaoGroupPreparationUnknown(writeError);
              }
            }
            if (marker.phase === "link_sent") throw kakaoGroupPreparationUnknown();
            await phase("link_sent");
            assertFresh();
            let linkedValue;
            try {
              linkedValue = await insertKakaoGroupFirstSetting(env, kakaoGroupLinkItemSettingsKey(groupKey), {
                group_key: groupKey, household_id: householdId, household_name: household.name, invite_code: household.invite_code,
                linked_by: marker.owner_id, linked_at: new Date().toISOString(),
              });
            } catch (err) {
              if (isDefiniteStorageFailure(err)) await rollbackPhase("owner_sent");
              throw err;
            }
            const link = normalizeKakaoGroupLinkItem(linkedValue, groupKey);
            if (link?.household_id !== householdId || link.linked_by !== marker.owner_id) throw new Error("kakao_group_first_link_conflict");
            snapshot.link = link;
          }
          if (!household) {
            assertFresh();
            await markKakaoGroupRetired(env, groupKey, assertFresh);
            return kakaoText("이 단톡방에 연결된 가계부가 없어 기록을 어디에도 저장하지 않았어요. 소유자 또는 관리자가 사용할 가계부를 직접 연결해 주세요.");
          }
          // Recover a confirmed link_sent write by its fixed ledger, never by repeating POST.
          if (!snapshot.retired && !snapshot.done && marker && snapshot.link.household_id === marker.candidate_id && marker.phase === "link_sent") {
            if (snapshot.link.linked_by !== marker.owner_id) throw new Error("kakao_group_first_link_conflict");
            const ownerRows = strictKakaoGroupMembershipRows(await fetchRawHouseholdMembers(env, householdId), true);
            if (bestRoleFromRows(ownerRows.filter(row => String(row.user_id) === marker.owner_id)) !== "owner") throw new Error("kakao_group_first_owner_conflict");
            assertFresh();
            snapshot.done = parseKakaoGroupFirstMarker(await insertKakaoGroupFirstSetting(env, snapshot.keys.done, { ...marker, phase: "complete" }), groupKey, true);
            await phase("complete");
            if (marker.owner_id === String(user.id)) firstNotice = "웹 로그인 없이 이 방의 공동 가계부를 준비했어요.\n이 방에서 기록하는 참여자들이 함께 사용하며, 첫 입력자인 내가 소유자예요.\n이름·예산은 나중에 같은 가계부에서 설정할 수 있어요.\n\n";
          }
          let roleRows = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`, { method: "GET" });
          strictKakaoGroupMembershipRows(roleRows);
          let role = bestRoleFromRows(roleRows);
          const automaticRoom = !snapshot.retired && snapshot.done?.candidate_id === householdId && snapshot.link.household_id === snapshot.done.candidate_id;
          if (!role && automaticRoom) {
            if (snapshot.departures.households[await sha256Hex(householdId)]) return kakaoText("이 가계부에서 나간 이력이 있어 자동으로 다시 참여하지 않았어요. 이 요청의 기록은 어디에도 저장하지 않았어요. 다시 참여하려면 개인 대화에서 초대코드를 사용해 주세요.");
            if (Object.keys(snapshot.member).length && snapshot.member.household_id === householdId) throw kakaoGroupPreparationUnknown();
            assertFresh();
            const attempt = parseStrictSettingsObject(await insertKakaoGroupFirstSetting(env, snapshot.keys.member, { version: 1, user_id: String(user.id), household_id: householdId, phase: "member_sent" }, { requireInserted: true }), "kakao_group_member_attempt");
            if (attempt.household_id !== householdId || attempt.user_id !== String(user.id)) throw new Error("kakao_group_member_attempt_conflict");
            assertFresh();
            let writeError;
            try { await supabase(env, "/rest/v1/household_members?on_conflict=household_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ household_id: householdId, user_id: user.id, role: "member" }) }); }
            catch (err) { writeError = err; }
            assertFresh();
            try { roleRows = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`, { method: "GET" }); }
            catch (readErr) { if (writeError && !isDefiniteStorageFailure(writeError)) throw kakaoGroupPreparationUnknown(writeError); if (writeError) await rollbackMemberAttempt(); throw readErr; }
            strictKakaoGroupMembershipRows(roleRows);
            role = bestRoleFromRows(roleRows);
            if (!role) {
              if (writeError && isDefiniteStorageFailure(writeError)) { await rollbackMemberAttempt(); throw writeError; }
              throw kakaoGroupPreparationUnknown(writeError);
            }
            firstNotice = "이 방의 공동 가계부에 참여했어요.\n같은 방의 참여자들이 함께 기록을 사용해요.\n\n";
          }
          if (!role) return kakaoText("이 방의 가계부에 참여하지 않았어요. 이 요청의 기록은 어디에도 저장하지 않았어요. 개인 대화에서 초대코드로 참여해 주세요.");
          if (!["owner", "admin", "member"].includes(role)) return kakaoText(roleBlockedMessage(role, household.name));
          if (firstNotice) { assertFresh(); await markKakaoChatFirstHistory(env, user.id); }
          return await saveKakaoParsedTransactionsReply(env, { ...context, household: { ...household, role, from_group_link: true, bot_group_key: groupKey }, firstNotice, assertFresh, onSaved: async () => { recordSaved = true; } });
        });
      });
    });
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_group_first_record_failed", severity: "error", path: "/skill", method: "POST", detail: safeError(err) });
    if (recordSaved) return kakaoText("공동 가계부에 기록 저장은 완료되었지만 결과 안내가 지연됐어요. ‘오늘 기록 보기’에서 확인해 주세요.");
    if (/kakao_group_identity_scope_changed/.test(safeError(err))) return kakaoText("계정 통합으로 사용자 정보가 바뀌어 이 요청의 기록은 어디에도 저장하지 않았어요. 카카오톡에서 봇을 다시 호출해 주세요.");
    if (isUncertainStorageWrite(err)) return kakaoText("공동 가계부 준비 결과를 아직 확정하지 못했어요. 이 요청의 거래 기록은 아직 보내지 않았어요. 같은 준비 요청을 반복하지 않고 고정된 가계부의 결과를 확인합니다. 잠시 후 ‘시작’으로 연결 상태를 확인해 주세요.");
    return kakaoText(/settings_rmw_busy|scope_changed/.test(safeError(err))
      ? "이 방의 공동 가계부를 준비하거나 변경하는 요청이 처리 중이에요. 이 요청의 기록은 아직 저장하지 않았어요. 잠시 후 다시 보내 주세요."
      : "이 방의 공동 가계부를 확인하지 못했어요. 이 요청의 기록은 어디에도 저장하지 않았어요. 잠시 후 연결 상태를 확인해 주세요.");
  }
}

function kakaoGroupLinkItemSettingsKey(groupKey = "") {
  const key = String(groupKey || "").trim();
  const reversed = Array.from(key).reverse().join("");
  return `kakao_group_link_v2254:${stableShortHash(key)}:${stableShortHash(reversed)}`;
}

function normalizeKakaoGroupLinkItem(value = null, expectedGroupKey = "") {
  try {
    const item = typeof value === "string" ? JSON.parse(value || "{}") : safeObject(value);
    const groupKey = String(item.group_key || expectedGroupKey || "").trim();
    if (!groupKey || !item.household_id) return null;
    if (expectedGroupKey && groupKey !== String(expectedGroupKey)) return null;
    return {
      group_key: groupKey,
      household_id: String(item.household_id || ""),
      household_name: String(item.household_name || ""),
      invite_code: String(item.invite_code || ""),
      linked_by: String(item.linked_by || ""),
      linked_at: String(item.linked_at || ""),
    };
  } catch (err) {
    return null;
  }
}

async function fetchLegacyKakaoGroupLinkMap(env, strict = false) {
  const value = strict
    ? await getSettingValueStrict(env, kakaoGroupLinksSettingsKey())
    : await getSettingValue(env, kakaoGroupLinksSettingsKey());
  try {
    if (!value) return {};
    const parsed = strict ? parseStrictSettingsObject(value, "kakao_group_links") : typeof value === "string" ? JSON.parse(value || "{}") : value;
    const out = Object.create(null);
    for (const [k, v] of Object.entries(safeObject(parsed))) {
      const groupKey = String(k || "").trim();
      const item = normalizeKakaoGroupLinkItem({ ...safeObject(v), group_key: groupKey }, groupKey);
      if (item) out[groupKey] = item;
      else if (strict) throw settingsDataError("kakao_group_links", "invalid_shape");
    }
    return out;
  } catch (err) {
    if (strict) throw err;
    return {};
  }
}

async function fetchKakaoGroupLinkItemRows(env, options = {}) {
  const prefix = "kakao_group_link_v2254:";
  const path = `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(`${prefix}%`)}&select=key,value&limit=5000`;
  // V22.9.34 감사 S2: 연결을 고쳐 쓰는 경로는 읽기 실패를 "연결 없음"으로 보지 않는다.
  const rows = options.strict ? await supabase(env, path, { method: "GET" }) : (await optionalSupabase(env, path, { method: "GET" }, []) || []);
  if (!Array.isArray(rows)) {
    if (options.strict) throw settingsDataError("kakao_group_links", "invalid_shape");
    return {};
  }
  const out = Object.create(null);
  for (const row of rows) {
    if (!String(row?.key || "").startsWith(prefix)) continue;
    const item = normalizeKakaoGroupLinkItem(row?.value);
    if (item) out[item.group_key] = item;
  }
  return out;
}

// V22.9.34 감사 S2: 계정 통합은 방 연결의 linked_by 만 옮긴다. 방마다 잠금 안에서 그 방 행을 다시 읽고,
// 옛 통합 맵은 엄격하게 읽어 같은 칸만 고친다.
async function reassignKakaoGroupLinkOwner(env, fromUserId = "", toUserId = "") {
  const from = String(fromUserId || "");
  const to = String(toUserId || "");
  if (!from || !to || from === to) return 0;
  let changed = 0;
  const items = await fetchKakaoGroupLinkItemRows(env, { strict: true });
  for (const [groupKey, item] of Object.entries(items)) {
    if (String(item.linked_by || "") !== from) continue;
    await withKakaoGroupLifecycleLease(env, groupKey, async ({ assertFresh }) => {
      const value = await getSettingValueStrict(env, kakaoGroupLinkItemSettingsKey(groupKey));
      const current = normalizeKakaoGroupLinkItem(value, groupKey);
      if (!current || String(current.linked_by || "") !== from) return;
      assertFresh();
      await saveKakaoGroupLinkItem(env, groupKey, { ...current, linked_by: to });
      changed += 1;
    });
  }
  await withSettingsRmwLease(env, "settings-rmw:kakao_group_links", async ({ assertFresh }) => {
    const map = await fetchLegacyKakaoGroupLinkMap(env, true);
    let legacyChanged = false;
    for (const item of Object.values(map)) {
      if (String(item.linked_by || "") !== from) continue;
      item.linked_by = to;
      legacyChanged = true;
    }
    if (!legacyChanged) return;
    assertFresh();
    await saveSettingValue(env, kakaoGroupLinksSettingsKey(), JSON.stringify(map));
  });
  return changed;
}

async function fetchKakaoGroupLinkMap(env) {
  const [legacy, items] = await Promise.all([
    fetchLegacyKakaoGroupLinkMap(env),
    fetchKakaoGroupLinkItemRows(env),
  ]);
  return { ...legacy, ...items };
}

async function saveKakaoGroupLinkItem(env, groupKey = "", item = {}) {
  const key = String(groupKey || "").trim();
  if (!key || !item?.household_id) return null;
  const normalized = normalizeKakaoGroupLinkItem({ ...item, group_key: key }, key);
  if (!normalized) return null;
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoGroupLinkItemSettingsKey(key), value: JSON.stringify(normalized) }),
  });
  return normalized;
}

async function removeKakaoGroupLinksForHousehold(env, householdId = "") {
  if (!householdId) return 0;
  const map = await fetchKakaoGroupLinkMap(env);
  const targets = Object.entries(map).filter(([, item]) => String(item?.household_id || "") === String(householdId));
  for (const [groupKey] of targets) await removeKakaoGroupLink(env, groupKey, { expectedHouseholdId: String(householdId) });
  return targets.length;
}

async function removeKakaoGroupLink(env, groupKey = "", options = {}) {
  const key = String(groupKey || "").trim();
  if (!key) return;
  if (!options.roomLeaseHeld) return withKakaoGroupLifecycleLease(env, key, guard => removeKakaoGroupLink(env, key, { ...options, ...guard }));
  // A separate immutable row survives purge and late pending/link writes.
  const snapshot = await readKakaoGroupFirstSnapshot(env, key);
  // A missing-household read or purge cleanup may predate a successful manual rebind.
  if (options.expectedHouseholdId && snapshot.link?.household_id !== String(options.expectedHouseholdId)) return false;
  await markKakaoGroupRetired(env, key, options.assertFresh);
  options.assertFresh?.();
  // Per-group row is authoritative. Deleting one row cannot overwrite another room's link.
  await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(kakaoGroupLinkItemSettingsKey(key))}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  // Keep the legacy map as a compatibility mirror for older admin pages/packages.
  return withSettingsRmwLease(env, "settings-rmw:kakao_group_links", async ({ assertFresh }) => {
    const map = await fetchLegacyKakaoGroupLinkMap(env, true);
    if (key in map) {
      delete map[key];
      options.assertFresh?.(); assertFresh();
      await saveSettingValue(env, kakaoGroupLinksSettingsKey(), JSON.stringify(map));
    }
  });
}

async function saveKakaoGroupLink(env, groupKey = "", household = {}, userId = "") {
  const key = String(groupKey || "").trim();
  if (!key || !household?.id) return {};
  const item = {
    group_key: key,
    household_id: household.id,
    household_name: household.name || "",
    invite_code: household.invite_code || "",
    linked_by: userId || "",
    linked_at: new Date().toISOString(),
  };
  // Authoritative per-room row prevents lost updates when different rooms are linked concurrently.
  const saved = await saveKakaoGroupLinkItem(env, key, item);
  // Best-effort compatibility mirror. Runtime reads the per-room row first.
  try {
    await withSettingsRmwLease(env, "settings-rmw:kakao_group_links", async ({ assertFresh }) => {
      const map = await fetchLegacyKakaoGroupLinkMap(env, true);
      map[key] = item;
      assertFresh();
      await saveSettingValue(env, kakaoGroupLinksSettingsKey(), JSON.stringify(map));
    });
  } catch (err) {}
  return saved || item;
}

async function getLinkedKakaoGroupHousehold(env, groupKey = "", options = {}) {
  const key = String(groupKey || "").trim();
  if (!key) return null;
  // Only a successful empty primary read may fall back to the legacy mirror.
  // A failed read must never change room scope or skip existing-link authorization.
  const itemValue = await getSettingValueStrict(env, kakaoGroupLinkItemSettingsKey(key));
  const primary = normalizeKakaoGroupLinkItem(itemValue, key);
  if (itemValue && !primary) throw new Error("invalid_kakao_group_link");
  const linked = primary || (await fetchLegacyKakaoGroupLinkMap(env, true))[key] || null;
  if (!linked?.household_id) return null;
  // A failed lookup does not prove deletion. Preserve the link and propagate the error.
  const rows = await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(linked.household_id)}&select=id,name,invite_code,created_at&limit=1`, { method: "GET" }) || [];
  if (!rows?.[0]) {
    await removeKakaoGroupLink(env, key, { ...options, expectedHouseholdId: String(linked.household_id) });
    return null;
  }
  return rows[0];
}

async function ensurePendingMemberIfMissing(env, householdId = "", userId = "") {
  return getHouseholdMemberRole(env, userId, householdId);
}

async function resolveKakaoHousehold(env, user = {}, nickname = "", payload = {}) {
  const groupKey = getKakaoBotGroupKey(payload);
  if (groupKey) {
    const linked = await getLinkedKakaoGroupHousehold(env, groupKey);
    if (linked?.id) {
      await ensurePendingMemberIfMissing(env, linked.id, user.id);
      return { ...linked, from_group_link: true, bot_group_key: groupKey };
    }
  }
  return await ensurePrimaryHousehold(env, user.id, nickname);
}

async function bindKakaoGroupByInviteCode(env, user = {}, groupKey = "", code = "", options = {}) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!groupKey) return { ok: false, error: "no_group_key" };
  if (!normalized) return { ok: false, error: "no_code" };
  if (!options.lifecycleLeaseHeld) return withKakaoUserLifecycleLease(env, user.id, guard => bindKakaoGroupByInviteCode(env, user, groupKey, normalized, { ...options, ...guard }));
  if (!options.roomLeaseHeld) return withKakaoGroupLifecycleLease(env, groupKey, guard => bindKakaoGroupByInviteCode(env, user, groupKey, normalized, { ...options, ...guard, assertFresh: () => { options.assertFresh?.(); guard.assertFresh(); } }));
  options.assertFresh?.();
  const householdRows = await supabase(env, `/rest/v1/households?invite_code=eq.${encodeURIComponent(normalized)}&select=id,name,invite_code,created_at&limit=1`, { method: "GET" });
  const household = householdRows?.[0];
  if (!household) return { ok: false, error: "not_found", code: normalized };
  const role = await getHouseholdMemberRole(env, user.id, household.id);
  if (!["owner", "admin"].includes(role)) return { ok: false, error: "not_allowed", role: role || "none", household };
  const current = await getLinkedKakaoGroupHousehold(env, groupKey, options);
  if (current?.id && String(current.id) === String(household.id)) return { ok: true, already_linked: true, role, household: current, linked: null };
  if (current?.id && String(current.id) !== String(household.id)) {
    const currentRole = await getHouseholdMemberRole(env, user.id, current.id);
    if (!["owner", "admin"].includes(currentRole)) {
      return { ok: false, error: "not_allowed_current", role, current_role: currentRole || "none", current, household };
    }
    if (!options?.allowReplace) return { ok: false, error: "replace_confirmation_required", role, current_role: currentRole, current, household };
  }
  const ids = [...new Set([String(household.id), ...(current?.id ? [String(current.id)] : [])])].sort();
  const guards = [];
  const run = async index => {
    if (index < ids.length) return withHouseholdDatabaseLease(env, ids[index], async ({ assertFresh }) => { guards.push(assertFresh); return run(index + 1); });
    const assertFresh = () => { options.assertFresh?.(); guards.forEach(guard => guard()); };
    const freshRoles = await Promise.all(ids.map(id => supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`, { method: "GET" })));
    if (freshRoles.some(rows => !Array.isArray(rows) || !["owner", "admin"].includes(bestRoleFromRows(rows)))) return { ok: false, error: "not_allowed", household };
    const snapshot = await readKakaoGroupFirstSnapshot(env, groupKey);
    if (String(snapshot.link?.household_id || "") !== String(current?.id || "")) throw new Error("kakao_group_bind_scope_changed");
    await markKakaoGroupRetired(env, groupKey, assertFresh);
    assertFresh();
    const linked = await saveKakaoGroupLink(env, groupKey, household, user.id);
    return { ok: true, role, household, linked };
  };
  return run(0);
}

async function kakaoGroupInfoText(env, payload = {}, origin = "", user = null) {
  const groupKey = getKakaoBotGroupKey(payload);
  if (!groupKey) {
    return [
      "👥 단톡방 연결 안내",
      "",
      "현재 요청에서 그룹방 식별키를 찾지 못했어요.",
      "그룹 채팅방 안에서 아래처럼 보내주세요.",
      "",
      "단톡방 연결 초대코드",
      "예: 단톡방 연결 ABC123",
      "",
      "초대코드는 가계부 관리자에게 확인해 주세요.",
    ].join("\n");
  }
  const household = await getLinkedKakaoGroupHousehold(env, groupKey);
  if (!household) {
    return [
      "👥 이 단톡방은 아직 가계부와 연결되지 않았어요.",
      "",
      "가계부 소유자 또는 관리자가 아래처럼 연결할 수 있어요.",
      "",
      "단톡방 연결 초대코드",
      "예: 단톡방 연결 ABC123",
      "",
      "초대코드는 가계부 관리자에게 확인해주세요.",
    ].join("\n");
  }
  const role = user?.id ? await getHouseholdMemberRole(env, user.id, household.id) : "";
  return [
    "👥 단톡방 연결 상태",
    "",
    `연결 가계부: ${household.name}`,
    role ? `내 권한: ${role}` : "",
    "",
    "이 방에서 입력한 지출/수입은 연결된 가계부에 기록됩니다.",
    "예: 점심 12000원 국민카드",
  ].filter(Boolean).join("\n");
}
// @build:exports-start
export {
  bindKakaoGroupByInviteCode, fetchKakaoGroupLinkMap, fetchLegacyKakaoGroupLinkMap,
  getExplicitKakaoBotGroupKey, getKakaoBotGroupKey, getLinkedKakaoGroupHousehold,
  kakaoGroupFirstKeys, kakaoGroupInfoText, kakaoGroupLinkItemSettingsKey, markKakaoGroupDeparture,
  markKakaoGroupRetired, normalizeKakaoGroupLinkItem, parseKakaoGroupFirstMarker,
  preserveKakaoGroupDeparturesForMerge, readKakaoGroupFirstSnapshot, reassignKakaoGroupLinkOwner,
  removeKakaoGroupLink, removeKakaoGroupLinksForHousehold, tryKakaoGroupFirstRecord,
  withKakaoGroupLifecycleLease,
};
// @build:exports-end
