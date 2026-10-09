// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  parseStrictSettingsObject, safeError, settingsDataError, withGlobalIdentitySettingsRmw,
  withSettingsRmwLease,
} from "../runtime/leases.js";
import { kakaoSkillSecretMatches, sha256Hex } from "../auth/crypto-admin-session.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { kakaoLoginUserKey, resolveEffectiveUserId } from "../auth/user-session.js";
import { fetchUserIdentityLinks, saveUserIdentityLinks } from "../auth/identity-reauth.js";
import {
  createUserHousehold, ensureOwnerMembership, fetchUserById, fetchUserHouseholds,
  withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { kakaoClaimUserUnmerged } from "../auth/kakao-web-claim.js";
import { kakaoText } from "./response-builders.js";
import {
  getHouseholdById, getKakaoSelectedHouseholdId, setKakaoSelectedHousehold,
} from "./household-budget-commands.js";
import { saveKakaoParsedTransactionsReply } from "./transaction-save.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { ensureUser } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

function eligibleKakaoUserId(payload = {}) {
  const user = safeObject(payload?.userRequest?.user || payload?.user || {});
  const userType = String(user.type || "").trim();
  const userId = String(user.id || payload?.user?.id || "").trim();
  // 일부 구형 payload는 type을 생략하므로 user.id만 있는 경우에 한해 호환합니다.
  if ((userType === "botUserKey" || !userType) && userId && userId !== "unknown-user") return userId.slice(0, 160);
  return "";
}

function getKakaoUserKey(payload) {
  const user = safeObject(payload?.userRequest?.user || payload?.user || {});
  const props = safeObject(user.properties || payload?.userRequest?.user?.properties || payload?.user?.properties || {});
  const explicitBotKey = String(props.botUserKey || payload?.botUserKey || "").trim();
  if (explicitBotKey && explicitBotKey !== "unknown-user") return explicitBotKey.slice(0, 160);
  const userId = eligibleKakaoUserId(payload);
  if (userId) return userId;
  const appUserId = String(props.appUserId || payload?.appUserId || "").trim();
  if (appUserId) return `app_user:${appUserId}`.slice(0, 160);
  const plusfriend = String(props.plusfriendUserKey || payload?.plusfriendUserKey || "").trim();
  if (plusfriend) return `plusfriend:${plusfriend}`.slice(0, 160);
  // 발화 내용 전체를 해시해 임시 사용자를 만들면 문장마다 사용자가 달라질 수 있으므로 금지합니다.
  return "";
}

function getKakaoIdentityAliases(payload = {}, primaryKey = "") {
  const user = safeObject(payload?.userRequest?.user || payload?.user || {});
  const props = safeObject(user.properties || {});
  const aliases = new Set();
  const key = String(primaryKey || "").trim();
  if (key) aliases.add(`skill_identity:${key}`);
  const eligibleUserId = eligibleKakaoUserId(payload);
  if (eligibleUserId && eligibleUserId !== key) aliases.add(`skill_identity:${eligibleUserId}`);
  const appUserId = String(props.appUserId || payload?.appUserId || "").trim();
  if (appUserId) aliases.add(kakaoLoginUserKey(appUserId));
  const plusfriend = String(props.plusfriendUserKey || payload?.plusfriendUserKey || "").trim();
  if (plusfriend) aliases.add(`plusfriend_identity:${plusfriend}`);
  return [...aliases];
}

function stableShortHash(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function getKakaoNickname(payload) {
  return String(
    payload?.userRequest?.user?.properties?.nickname ||
      payload?.userRequest?.user?.properties?.appUserId ||
      "카카오사용자"
  ).slice(0, 80);
}

async function resolveLinkedIdentityUser(env, aliasKeys = []) {
  if (!safeArray(aliasKeys).length) return null;
  const links = await fetchUserIdentityLinks(env);
  for (const alias of aliasKeys) {
    const linkedUserId = String(safeObject(links[String(alias || "")]).user_id || "");
    if (!linkedUserId) continue;
    const linked = await fetchUserById(env, linkedUserId);
    if (linked) return linked;
  }
  return null;
}

function identityAliasPersistenceError(error) {
  const wrapped = new Error(`identity_alias_persistence_failed:${safeError(error)}`);
  wrapped.name = "IdentityAliasPersistenceError";
  wrapped.code = "identity_alias_persistence_failed";
  wrapped.cause = error;
  return wrapped;
}

function isSettingsRmwBusyError(error) {
  return /settings_rmw_busy/.test(safeError(error));
}

async function persistIdentityAliases(env, aliasKeys = [], userId = "", provider = "skill") {
  const requestedUid = String(userId || "").trim();
  const aliases = [...new Set(safeArray(aliasKeys).map((alias) => String(alias || "").trim()).filter(Boolean))];
  if (!requestedUid || !aliases.length) return false;
  if (env.__AB_IDENTITY_CONFIRMED && aliases.every(alias => env.__AB_IDENTITY_CONFIRMED.get(alias) === requestedUid)) return false;
  let lastBusyError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withGlobalIdentitySettingsRmw(env, async ({ assertFresh }) => {
        const canonicalUid = await resolveEffectiveUserId(env, requestedUid);
        const canonicalUser = canonicalUid ? await fetchUserById(env, canonicalUid) : null;
        if (!canonicalUser) throw new Error("identity_alias_target_missing");
        const links = await fetchUserIdentityLinks(env);
        let changed = false;
        for (const key of aliases) {
          const existingUid = String(safeObject(links[key]).user_id || "").trim();
          if (existingUid) {
            const existingCanonicalUid = await resolveEffectiveUserId(env, existingUid);
            if (existingCanonicalUid && existingCanonicalUid !== canonicalUid) throw new Error("identity_alias_conflict");
          }
          if (existingUid === canonicalUid) continue;
          links[key] = { user_id: canonicalUid, provider, linked_at: new Date().toISOString() };
          changed = true;
        }
        if (changed) {
          assertFresh();
          await saveUserIdentityLinks(env, links);
        }
        if (env.__AB_IDENTITY_CONFIRMED) for (const alias of aliases) env.__AB_IDENTITY_CONFIRMED.set(alias, canonicalUid);
        return changed;
      });
    } catch (err) {
      if (isSettingsRmwBusyError(err) && attempt < 2) {
        lastBusyError = err;
        await new Promise((resolve) => setTimeout(resolve, 12 + attempt * 11 + Math.floor(Math.random() * 7)));
        continue;
      }
      rememberOpsEvent({ kind: "identity_alias_persistence_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
      throw identityAliasPersistenceError(err);
    }
  }
  throw identityAliasPersistenceError(lastBusyError || new Error("settings_rmw_busy"));
}

// V22.9.28: a server-seeded first-use marker is not a household or group membership.
// It survives personal-household deletion so a returning user is never reprovisioned.
function hasChatFirstKakaoIdentity(payload = {}, kakaoUserKey = "") {
  return !!String(kakaoUserKey || "").trim() && !String(kakaoUserKey).startsWith("plusfriend:") &&
    !!(eligibleKakaoUserId(payload) || String(payload?.userRequest?.user?.properties?.botUserKey || payload?.user?.properties?.botUserKey || payload?.botUserKey || "").trim() ||
       String(payload?.userRequest?.user?.properties?.appUserId || payload?.user?.properties?.appUserId || payload?.appUserId || "").trim());
}

function trustedChatFirstSkillCaller(request, env = {}) {
  const expected = String(env.KAKAO_SKILL_SECRET || "").trim();
  return !!expected && kakaoSkillSecretMatches(request, expected);
}

async function kakaoChatFirstSettingsKey(kakaoUserKey = "") {
  return `kakao_first_record_v22928:${await sha256Hex(String(kakaoUserKey || "").trim())}`;
}

async function markKakaoChatFirstHistory(env, userId) {
  // Monotonic, server-owned lifecycle metadata has no household reference to purge.
  await saveSettingValue(env, `kakao_first_record_history_v22928:${String(userId)}`, JSON.stringify({ version: 1, user_id: String(userId) }));
}

async function kakaoChatFirstCompleted(env, markerKey, userId) {
  const historyKey = `kakao_first_record_history_v22928:${String(userId)}`;
  const doneKey = markerKey.replace("kakao_first_record_v22928:", "kakao_first_record_done_v22928:");
  const records = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${encodeURIComponent(historyKey)},${encodeURIComponent(doneKey)})&select=key,value`, {method:"GET"});
  if (!Array.isArray(records)) throw settingsDataError("kakao_first_record_history", "invalid_shape");
  const history = parseStrictSettingsObject(records.find(row => row.key === historyKey)?.value, "kakao_first_record_history");
  if (Object.keys(history).length) {
    if (history.version !== 1 || history.user_id !== String(userId)) throw settingsDataError("kakao_first_record_history", "invalid_shape");
    return true;
  }
  const done = parseStrictSettingsObject(records.find(row => row.key === doneKey)?.value, "kakao_first_record_done");
  if (!Object.keys(done).length) return false;
  if (done.version !== 1 || typeof done.user_id !== "string" || !done.user_id) throw settingsDataError("kakao_first_record_done", "invalid_shape");
  if (done.user_id !== String(userId)) throw new Error("kakao_first_record_completed_identity_conflict");
  return true;
}

function parseKakaoChatFirstMarker(value) {
  const marker = parseStrictSettingsObject(value, "kakao_first_record");
  if (!Object.keys(marker).length) return null;
  if (marker.version !== 1 || !["pending", "complete"].includes(marker.state) || typeof marker.user_id !== "string" ||
      !Number.isFinite(Date.parse(String(marker.created_at || ""))) ||
      (marker.candidate_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(marker.candidate_id)))) {
    throw settingsDataError("kakao_first_record", "invalid_shape");
  }
  return marker;
}

async function seedKakaoChatFirstUser(env, rawKey, nickname, aliases = []) {
  const key = await kakaoChatFirstSettingsKey(rawKey);
  return await withSettingsRmwLease(env, key, async ({ assertFresh }) => {
    // Recheck under the database lease. A parallel request may already have resolved an
    // identity, and zero memberships alone is never permission to create a new household.
    const existing = await ensureUser(env, rawKey, nickname, aliases, { create: false });
    if (existing) return existing;
    let marker = parseKakaoChatFirstMarker(await getSettingValueStrict(env, key));
    if (marker?.user_id || marker?.state === "complete") throw new Error("kakao_first_record_identity_missing");
    if (!marker) {
      marker = { version: 1, state: "pending", user_id: "", created_at: new Date().toISOString() };
      assertFresh();
      await saveSettingValue(env, key, JSON.stringify(marker));
    }
    const user = await ensureUser(env, rawKey, nickname, aliases, { bootstrapSeeded: true, assertFresh, absenceConfirmed: true });
    if (!user?.id) throw new Error("kakao_first_record_user_missing");
    assertFresh();
    await saveSettingValue(env, key, JSON.stringify({ ...marker, user_id: String(user.id) }));
    return user;
  });
}

async function tryKakaoChatFirstRecord(env, context = {}) {
  const { payload, user, kakaoUserKey, nickname, origin, utterance = "", parsedList, handlerStartedAt } = context;
  if (getKakaoBotGroupKey(payload) || !user?.id || !hasChatFirstKakaoIdentity(payload, kakaoUserKey) || context.selectedHouseholdId) return null;
  const key = await kakaoChatFirstSettingsKey(kakaoUserKey);
  const observed = parseKakaoChatFirstMarker(await getSettingValueStrict(env, key));
  if (!observed || observed.state !== "pending" || (observed.user_id && observed.user_id !== String(user.id))) return null;
  if (await kakaoChatFirstCompleted(env, key, user.id)) return null;
  let recordSaved = false;
  try {
    return await withSettingsRmwLease(env, key, async ({ assertFresh: markerFresh }) => {
      let marker = parseKakaoChatFirstMarker(await getSettingValueStrict(env, key));
      if (!marker || marker.state !== "pending" || (marker.user_id && marker.user_id !== String(user.id))) return null;
      // Finish identity-map work before taking the user lifecycle lease.
      await persistIdentityAliases(env, getKakaoIdentityAliases(payload, kakaoUserKey), user.id, "skill");
      markerFresh();
      return withKakaoUserLifecycleLease(env, user.id, async ({ assertFresh: lifecycleFresh }) => {
        const assertFresh = () => { markerFresh(); lifecycleFresh(); };
        if (await kakaoChatFirstCompleted(env, key, user.id) || !(await kakaoClaimUserUnmerged(env, user.id))) return null;
        const [households, selectedId] = await Promise.all([
          fetchUserHouseholds(env, user.id), getKakaoSelectedHouseholdId(env, user.id),
        ]);
        if (selectedId || households.some((h) => !marker.candidate_id || String(h.id) !== marker.candidate_id || String(h.role) !== "owner")) return null;
        if (!marker.candidate_id) {
          marker = { ...marker, user_id: String(user.id), candidate_id: crypto.randomUUID() };
          assertFresh();
          await saveSettingValue(env, key, JSON.stringify(marker));
        }
        let household = await getHouseholdById(env, marker.candidate_id);
        let createdHere = false;
        if (!household) {
          assertFresh();
          household = await createUserHousehold(env, user.id, "내 개인 가계부", nickname, { id: marker.candidate_id, assertFresh, skipChatFirstHistory: true, lifecycleLeaseHeld: true });
          createdHere = true;
        }
        assertFresh();
        const role = createdHere ? "owner" : await ensureOwnerMembership(env, user.id, household.id, { explicitHouseholdCreation: true });
        if (role !== "owner") throw new Error("kakao_first_record_owner_required");
        const firstNotice = "웹 로그인 없이 내 개인 가계부를 준비했어요.\n이름·예산은 나중에 웹에서 설정할 수 있어요.\n\n";
        return await saveKakaoParsedTransactionsReply(env, {
          household: { ...household, role: "owner" }, user, kakaoUserKey, nickname, origin, utterance, parsedList, handlerStartedAt,
          firstNotice, assertFresh,
          onSaved: async () => {
            recordSaved = true;
            // Publish the selection only after saving. Parallel first requests cannot enter
            // the normal selected-household write path while the first save is outstanding.
            assertFresh();
            // This monotonic tombstone uses a separate row and no household reference.
            // Earlier pending writes cannot re-enable automatic creation after deletion.
            await saveSettingValue(env, key.replace("kakao_first_record_v22928:", "kakao_first_record_done_v22928:"), JSON.stringify({ version: 1, user_id: String(user.id) }));
            assertFresh();
            await markKakaoChatFirstHistory(env, user.id);
            assertFresh();
            await saveSettingValue(env, key, JSON.stringify({ version: 1, state: "complete", user_id: String(user.id), created_at: marker.created_at, completed_at: new Date().toISOString() }));
            assertFresh();
            await setKakaoSelectedHousehold(env, user.id, household.id);
          },
        });
      });
    });
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_first_record_failed", severity: "error", path: "/skill", method: "POST", detail: safeError(err) });
    if (recordSaved) return kakaoText("기록 저장은 완료되었지만 결과 안내가 지연됐어요. ‘오늘 기록 보기’에서 확인해 주세요.");
    return kakaoText(/settings_rmw_busy/.test(safeError(err))
      ? "개인 가계부를 준비하는 요청이 처리 중이에요. 이 요청의 기록은 아직 저장하지 않았어요. 잠시 후 다시 보내 주세요."
      : "개인 가계부 준비를 완료하지 못했어요. 이 요청의 기록은 저장하지 않았어요. 잠시 후 같은 내용을 다시 보내 주세요.");
  }
}
// @build:exports-start
export {
  getKakaoIdentityAliases, getKakaoNickname, getKakaoUserKey, hasChatFirstKakaoIdentity,
  markKakaoChatFirstHistory, parseKakaoChatFirstMarker, persistIdentityAliases,
  resolveLinkedIdentityUser, seedKakaoChatFirstUser, stableShortHash, trustedChatFirstSkillCaller,
  tryKakaoChatFirstRecord,
};
// @build:exports-end
