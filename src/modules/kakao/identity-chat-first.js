// @build:imports-start
import { pruneTimestampMap, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  parseStrictSettingsObject, safeError, settingsDataError, withGlobalIdentitySettingsRmw,
  withSettingsRmwLease,
} from "../runtime/leases.js";
import { kakaoSkillSecretMatches, sha256Hex } from "../auth/crypto-admin-session.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { kakaoLoginUserKey, resolveEffectiveUserId } from "../auth/user-session.js";
import {
  fetchUserIdentityLinks, lookupKakaoLoginOwner, saveUserIdentityLinks,
} from "../auth/identity-reauth.js";
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

// V22.9.77 감사 B-7: appUserId 는 카카오 로그인 id(숫자)라 표시 이름이 아니다. 예전에는 별명이 없으면 이것을 이름으로 써
// 이름이 "2265"인 사용자가 생겼다. 별명이 없으면 기본 이름을 쓴다.
function getKakaoNickname(payload) {
  return String(payload?.userRequest?.user?.properties?.nickname || "카카오사용자").slice(0, 80);
}

function kakaoLoginIdFromAlias(alias = "") {
  const text = String(alias || "");
  return text.startsWith("kakao_login:") ? text.slice("kakao_login:".length).trim() : "";
}

// 같은 요청 안에서 같은 카카오 로그인 id 의 주인을 두 번 읽지 않는다(사용자 찾기 → 별칭 저장). 하위 요청이 50개 한도에
// 가까운 단톡방 첫 기록(25건)에서 조회가 두 번이면 한도 바로 밑까지 갔다. 요청마다 라우터가 새로 만드는
// env.__AB_IDENTITY_CONFIRMED 맵에 매달아 요청이 끝나면 함께 버린다. 그 맵이 없거나 링크 표에 이미 연결이 있으면 늘 새로 읽는다.
const AB_KAKAO_LOGIN_OWNER_LOOKUPS = new WeakMap();
function lookupKakaoLoginOwnerOnce(env, kakaoId = "", links = {}) {
  const scope = env?.__AB_IDENTITY_CONFIRMED;
  if (!(scope instanceof Map) || String(safeObject(links[`kakao_login:${kakaoId}`]).user_id || "")) return lookupKakaoLoginOwner(env, kakaoId, { links });
  let cache = AB_KAKAO_LOGIN_OWNER_LOOKUPS.get(scope);
  if (!cache) {
    cache = new Map();
    AB_KAKAO_LOGIN_OWNER_LOOKUPS.set(scope, cache);
  }
  if (!cache.has(kakaoId)) {
    const pending = lookupKakaoLoginOwner(env, kakaoId, { links });
    // 읽기에 실패하면 기억하지 않는다(같은 요청의 다음 확인은 다시 읽는다).
    pending.catch(() => { if (cache.get(kakaoId) === pending) cache.delete(kakaoId); });
    cache.set(kakaoId, pending);
  }
  return cache.get(kakaoId);
}

async function resolveLinkedIdentityUser(env, aliasKeys = [], options = {}) {
  if (!safeArray(aliasKeys).length) return null;
  const links = await fetchUserIdentityLinks(env);
  for (const alias of aliasKeys) {
    const linkedUserId = String(safeObject(links[String(alias || "")]).user_id || "");
    if (!linkedUserId) continue;
    const linked = await fetchUserById(env, linkedUserId);
    if (linked) return linked;
  }
  // V22.9.77 감사 B-7: 웹(카카오 로그인)으로 먼저 가입한 사람은 링크 표에 kakao_login 별칭이 없고 강한 식별·사용자 행에만 있다.
  // 링크 표로 아무도 찾지 못했을 때만, 새 사용자를 만들기 전에 웹 로그인과 같은 순서로 그 계정을 찾아 쓴다. 예전에는 이름이
  // appUserId 인 새 계정을 만들고 kakao_login 별칭을 그쪽에 묶어, 옛 계정의 웹 로그인까지 새 채팅 계정으로 열렸다.
  // 링크 표에 이미 있는 연결(봇 사용자 별칭 등)은 위에서 예전 순서 그대로 먼저 쓴다(지금 연결을 바꾸지 않는다).
  // Secret 으로 확인된 카카오 요청(trustedKakaoCaller)에서만 찾는다. 확인되지 않은 요청의 appUserId 는 누구나 적어 보낼 수 있어,
  // 이 조회를 열어 두면 남의 카카오 로그인 id 만으로 그 웹 계정을 채팅으로 열 수 있다.
  if (options.trustedKakaoCaller !== true) return null;
  for (const alias of aliasKeys) {
    const kakaoId = kakaoLoginIdFromAlias(alias);
    if (!kakaoId) continue;
    const owner = await lookupKakaoLoginOwnerOnce(env, kakaoId, links);
    if (owner?.user) return owner.user;
  }
  return null;
}

const AB_KAKAO_LOGIN_CONFLICT_TRACED = globalThis.__AB_KAKAO_LOGIN_CONFLICT_TRACED || (globalThis.__AB_KAKAO_LOGIN_CONFLICT_TRACED = new Map());

// 운영 이벤트(ops-telemetry)에 남긴다. 받은 말·카카오 id 는 넣지 않고, 사용자 id 는 앞 8자만 적는다(전체 id 는 이벤트에서 가려진다).
// 같은 두 계정은 isolate 마다 10분에 한 번만 적는다.
function traceKakaoLoginAliasConflict(chatUid = "", ownerUid = "", source = "") {
  const key = `${chatUid}|${ownerUid}`;
  const now = Date.now();
  if (now - Number(AB_KAKAO_LOGIN_CONFLICT_TRACED.get(key) || 0) < 10 * 60 * 1000) return;
  AB_KAKAO_LOGIN_CONFLICT_TRACED.set(key, now);
  pruneTimestampMap(AB_KAKAO_LOGIN_CONFLICT_TRACED, now, 10 * 60 * 1000, 2000);
  rememberOpsEvent({
    kind: "kakao_login_alias_conflict", severity: "warn", path: "/skill", method: "POST", label: "채팅 계정과 카카오 로그인 계정이 다름",
    detail: `자동 병합 안 함·지금 연결 유지 · 채팅 ${String(chatUid).slice(0, 8)} · 카카오 로그인 ${String(ownerUid).slice(0, 8)} · 근거 ${source || "-"}`,
  });
}

// V22.9.77 감사 B-7: kakao_login:<appUserId> 별칭의 주인이 이 사용자가 아닌 다른 계정인지 본다(링크 표에 있으면 그 사람,
// 없으면 강한 식별·사용자 행 — 웹 로그인과 같은 순서). 다른 계정이면 { ownerUid, source, explicit }, 주인이 없거나 같은 사람이면 null.
// 주인이 따로 있는 별칭은 누구의 요청이든 이 사용자에게 묶지 않는다 — 옛 웹 계정의 로그인이 채팅 계정으로 바뀌던 길이다.
// explicit 은 링크 표에서 이미 다른 사람에게 묶여 있다는 뜻이다(예전에도 충돌 오류였던 경우).
async function foreignKakaoLoginOwner(env, alias = "", canonicalUid = "", links = {}) {
  const kakaoId = kakaoLoginIdFromAlias(alias);
  if (!kakaoId || !canonicalUid) return null;
  const linkedUid = String(safeObject(links[alias]).user_id || "").trim();
  let ownerUid = linkedUid;
  let source = "link";
  if (!ownerUid) {
    const owner = await lookupKakaoLoginOwnerOnce(env, kakaoId, links);
    ownerUid = String(owner?.user?.id || "").trim();
    source = owner?.source || "";
  }
  if (!ownerUid || ownerUid === canonicalUid || await resolveEffectiveUserId(env, ownerUid) === canonicalUid) return null;
  return { ownerUid, source, explicit: !!linkedUid };
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

async function persistIdentityAliases(env, aliasKeys = [], userId = "", provider = "skill", options = {}) {
  const requestedUid = String(userId || "").trim();
  let aliases = [...new Set(safeArray(aliasKeys).map((alias) => String(alias || "").trim()).filter(Boolean))];
  if (!requestedUid || !aliases.length) return false;
  if (env.__AB_IDENTITY_CONFIRMED && aliases.every(alias => env.__AB_IDENTITY_CONFIRMED.get(alias) === requestedUid)) return false;
  // V22.9.77 감사 B-7: 주인이 따로 있는 kakao_login 별칭(foreignKakaoLoginOwner)은 묶지 않는다.
  //  - Secret 으로 확인된 카카오 요청(options.trustedKakaoCaller): 봇 채널의 appUserId 가 로그인 앱과 같은 번호 체계인지
  //    확인되지 않았으므로 두 계정을 자동으로 합치지 않고, 그 별칭만 빼고 지금 계정으로 계속한다(운영 이벤트를 남긴다).
  //    예전에는 링크 표에 있으면 충돌 오류로 그 사람의 요청이 매번 실패했고, 사용자 행·강한 식별에만 있으면 새로 묶었다.
  //  - 그 밖의 호출: 링크 표에서 다른 사람에게 묶인 별칭은 예전처럼 identity_alias_conflict 로 실패한다(V22.9.26 계약 —
  //    다른 사람의 별칭을 함부로 옮기지 않는다). 강한 식별·사용자 행으로만 아는 주인이면 묶지 않고 조용히 건너뛴다(예전에는
  //    묶었다. 실패로 바꾸면 Secret 없이 들어온 요청의 기록이 저장되지 않으므로 기록은 지금 계정으로 계속한다).
  // 확인한 별칭은 기억해 잠금 경로에서 같은 조회를 되풀이하지 않는다. 확인하지 못한 별칭은 잠금 경로가 새로 읽은 링크 표로 다시 본다.
  const keepCurrentOnConflict = options.trustedKakaoCaller === true;
  const kakaoLoginChecked = new Set();
  const dropForeignKakaoLogin = async (canonicalUid, links) => {
    const kept = [];
    for (const alias of aliases) {
      if (!kakaoLoginIdFromAlias(alias) || kakaoLoginChecked.has(alias)) { kept.push(alias); continue; }
      const foreign = await foreignKakaoLoginOwner(env, alias, canonicalUid, links);
      if (foreign && (keepCurrentOnConflict || !foreign.explicit)) {
        if (keepCurrentOnConflict) traceKakaoLoginAliasConflict(canonicalUid, foreign.ownerUid, foreign.source);
        // 이 요청 안에서는 다시 확인하지 않는다(별칭은 쓰지 않았고, 채팅은 지금 계정으로 계속한다).
        if (env.__AB_IDENTITY_CONFIRMED) env.__AB_IDENTITY_CONFIRMED.set(alias, requestedUid);
        continue;
      }
      if (!foreign) kakaoLoginChecked.add(alias);
      kept.push(alias);
    }
    aliases = kept;
  };
  // V22.9.76 감사 B-6: 별칭이 이미 이 사용자에게 연결돼 있으면 전역 식별 잠금(settings-rmw:user_identity_links)을 잡지 않는다.
  // 예전에는 appUserId·plusfriendUserKey 가 실린 요청마다 잠금을 잡아, 서로 다른 사용자 둘이 동시에 보내면 늦은 쪽이
  // settings_rmw_busy 로 끝나 기록이 저장되지 않았다(동시 8건 중 4건). 읽기만 하고, 바꿀 것이 있거나 읽지 못하면
  // 예전 잠금 경로가 다시 읽고 판단한다(충돌·대상 없음 오류도 그 경로가 그대로 낸다).
  try {
    const canonicalUid = await resolveEffectiveUserId(env, requestedUid);
    const links = canonicalUid ? await fetchUserIdentityLinks(env) : null;
    if (links) await dropForeignKakaoLogin(canonicalUid, links);
    if (!aliases.length) return false;
    let allLinked = !!links;
    for (const key of links ? aliases : []) {
      const existingUid = String(safeObject(links[key]).user_id || "").trim();
      if (!existingUid || (existingUid !== canonicalUid && await resolveEffectiveUserId(env, existingUid) !== canonicalUid)) { allLinked = false; break; }
    }
    if (allLinked) {
      if (env.__AB_IDENTITY_CONFIRMED) for (const alias of aliases) env.__AB_IDENTITY_CONFIRMED.set(alias, canonicalUid);
      return false;
    }
  } catch (_) {}
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
          // V22.9.77 감사 B-7: 다른 사람에게 묶였거나 주인이 따로 있는 kakao_login 별칭은 절대 이 사용자에게 옮기지 않는다.
          // 확인된 카카오 요청은 그 별칭만 건너뛰고, 그 밖의 호출은 링크 표 충돌이면 오류, 아니면 건너뛴다(위 설명).
          const foreign = kakaoLoginIdFromAlias(key) && (existingUid || !kakaoLoginChecked.has(key))
            ? await foreignKakaoLoginOwner(env, key, canonicalUid, links) : null;
          if (foreign) {
            if (!keepCurrentOnConflict && foreign.explicit) throw new Error("identity_alias_conflict");
            if (keepCurrentOnConflict) traceKakaoLoginAliasConflict(canonicalUid, foreign.ownerUid, foreign.source);
            continue;
          }
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

// V22.9.37 감사 H5: 가계부 삭제는 참여자 수만큼 표식을 한 건씩 썼다. 하위 요청이 참여자 수에 비례해 늘어 큰 가계부는
// 지워지지 않았다. 같은 표식을 한 번의 upsert 로 쓴다(값은 markKakaoChatFirstHistory 와 같다).
async function markKakaoChatFirstHistoryBatch(env, userIds = []) {
  const ids = [...new Set(safeArray(userIds).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return 0;
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(ids.map((id) => ({ key: `kakao_first_record_history_v22928:${id}`, value: JSON.stringify({ version: 1, user_id: id }) }))),
  });
  return ids.length;
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

async function seedKakaoChatFirstUser(env, rawKey, nickname, aliases = [], options = {}) {
  // V22.9.77 감사 B-7: 확인된 카카오 요청 표시(trustedKakaoCaller)를 다시 확인·생성에도 그대로 넘긴다.
  const trustedKakaoCaller = options.trustedKakaoCaller === true;
  const key = await kakaoChatFirstSettingsKey(rawKey);
  return await withSettingsRmwLease(env, key, async ({ assertFresh }) => {
    // Recheck under the database lease. A parallel request may already have resolved an
    // identity, and zero memberships alone is never permission to create a new household.
    const existing = await ensureUser(env, rawKey, nickname, aliases, { create: false, trustedKakaoCaller });
    if (existing) return existing;
    let marker = parseKakaoChatFirstMarker(await getSettingValueStrict(env, key));
    if (marker?.user_id || marker?.state === "complete") throw new Error("kakao_first_record_identity_missing");
    if (!marker) {
      marker = { version: 1, state: "pending", user_id: "", created_at: new Date().toISOString() };
      assertFresh();
      await saveSettingValue(env, key, JSON.stringify(marker));
    }
    const user = await ensureUser(env, rawKey, nickname, aliases, { bootstrapSeeded: true, assertFresh, absenceConfirmed: true, trustedKakaoCaller });
    if (!user?.id) throw new Error("kakao_first_record_user_missing");
    assertFresh();
    await saveSettingValue(env, key, JSON.stringify({ ...marker, user_id: String(user.id) }));
    return user;
  });
}

async function tryKakaoChatFirstRecord(env, context = {}) {
  const { payload, user, kakaoUserKey, nickname, origin, utterance = "", parsedList, handlerStartedAt, canDeferSave = false } = context;
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
      // 이 길은 Secret 으로 확인된 1:1 첫 기록(seedChatFirst)에서만 온다.
      await persistIdentityAliases(env, getKakaoIdentityAliases(payload, kakaoUserKey), user.id, "skill", { trustedKakaoCaller: true });
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
          household: { ...household, role: "owner" }, user, kakaoUserKey, nickname, origin, utterance, parsedList, handlerStartedAt, canDeferSave,
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
    if (recordSaved) return kakaoText("기록 저장은 완료되었지만 결과 안내가 지연됐어요. ‘오늘기록’에서 확인해 주세요.");
    return kakaoText(/settings_rmw_busy/.test(safeError(err))
      ? "개인 가계부를 준비하는 요청이 처리 중이에요. 이 요청의 기록은 아직 저장하지 않았어요. 잠시 후 다시 보내 주세요."
      : "개인 가계부 준비를 완료하지 못했어요. 이 요청의 기록은 저장하지 않았어요. 잠시 후 같은 내용을 다시 보내 주세요.");
  }
}
// @build:exports-start
export {
  getKakaoIdentityAliases, getKakaoNickname, getKakaoUserKey, hasChatFirstKakaoIdentity,
  markKakaoChatFirstHistory, markKakaoChatFirstHistoryBatch, parseKakaoChatFirstMarker,
  persistIdentityAliases, resolveLinkedIdentityUser, seedKakaoChatFirstUser, stableShortHash,
  trustedChatFirstSkillCaller, tryKakaoChatFirstRecord,
};
// @build:exports-end
