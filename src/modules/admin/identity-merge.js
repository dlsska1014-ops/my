// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  safeError, withGlobalIdentitySettingsRmw, withHouseholdDatabaseLease, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  fetchAdminHouseholds, fetchHouseholdMembers, fetchMemberAliasMap, memberAliasSettingsKey,
  selectRequestedScopedHousehold, supabaseExactCount,
} from "../data/households-members-rows.js";
import { getSettingValueStrict } from "./settings-audit-pages.js";
import { safeObject } from "./backup-compare.js";
import { identityTypeLabel, userHouseholdRoleLabel } from "./ops-diagnostics-pages.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import {
  getUserSessionVersion, identityMergeRedirectSettingsKey, parseIdentityMergeRedirectValue,
  rewireEffectiveUserCache,
} from "../auth/user-session.js";
import { fetchUserIdentityLinks, saveUserIdentityLinks } from "../auth/identity-reauth.js";
import {
  fetchRawHouseholdMembers, fetchUserById, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { kakaoClaimUserUnmerged } from "../auth/kakao-web-claim.js";
import { renderKakaoAccountLinkDiagnostics } from "../auth/kakao-account-link.js";
import { isDefiniteStorageFailure } from "../kakao/response-builders.js";
import {
  preserveKakaoGroupDeparturesForMerge, reassignKakaoGroupLinkOwner,
} from "../kakao/group-links-first-record.js";
import { markKakaoChatFirstHistoryBatch } from "../kakao/identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function maskIdentityKey(value = "") {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= 8) return `${text.slice(0, 2)}•••`;
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

async function countUserTransactionsInHousehold(env, householdId = "", userId = "") {
  if (!householdId || !userId) return 0;
  return supabaseExactCount(env, `/rest/v1/transactions?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`);
}

async function buildIdentityAudit(env, householdId = "") {
  const households = await fetchAdminHouseholds(env);
  const selected = selectRequestedScopedHousehold(households, householdId);
  const members = selected ? await fetchHouseholdMembers(env, selected.id) : [];
  const rows = [];
  for (const member of members) {
    rows.push({ ...member, transaction_count: await countUserTransactionsInHousehold(env, selected.id, member.user_id) });
  }
  const owners = rows.filter((m) => String(m.role || "") === "owner");
  const nicknameGroups = Object.create(null);
  for (const row of rows) {
    const key = normalizeText(row.nickname || row.base_nickname || "");
    if (!key) continue;
    (nicknameGroups[key] ||= []).push(row);
  }
  const sameNameDuplicates = Object.values(nicknameGroups).filter((arr) => arr.length > 1);
  return { households, selected, members: rows, owners, sameNameDuplicates };
}

async function handleIdentityAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const audit = await buildIdentityAudit(env, url.searchParams.get("household_id") || "");
  const selected = audit.selected;
  const msg = String(url.searchParams.get("msg") || "");
  const err = String(url.searchParams.get("err") || "");
  const householdOptions = audit.households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${selected?.id === h.id ? " selected" : ""}>${escapeHtml(h.name || h.id)}</option>`).join("");
  const memberOptions = audit.members.map((m) => `<option value="${escapeHtml(m.user_id)}">${escapeHtml(m.nickname || "구성원")} · ${escapeHtml(identityTypeLabel(m.kakao_user_key))} · 거래 ${numberWithCommas(m.transaction_count)}건</option>`).join("");
  const tableRows = audit.members.map((m) => `<tr><td><b>${escapeHtml(m.nickname || "구성원")}</b><br/><span>${escapeHtml(m.base_nickname || "")}</span></td><td>${escapeHtml(userHouseholdRoleLabel(m.role))}</td><td>${escapeHtml(identityTypeLabel(m.kakao_user_key))}<br/><code>${escapeHtml(maskIdentityKey(m.kakao_user_key))}</code></td><td>${numberWithCommas(m.transaction_count)}건</td><td>${escapeHtml(String(m.created_at || "").slice(0, 19).replace("T", " "))}</td></tr>`).join("") || `<tr><td colspan="5">참여자가 없습니다.</td></tr>`;
  const linkDiagnostics = await renderKakaoAccountLinkDiagnostics(env);
  const warning = audit.owners.length > 1 ? `소유자가 ${audit.owners.length}명입니다. 같은 사람의 챗봇·웹 로그인 계정이 나뉜 경우, 거래가 많은 계정을 주 계정으로 선택해 통합하세요.` : "소유자 수는 정상입니다.";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>계정·가계부 안정성 점검</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#ede9fe;line-height:1.6}.warn,.ok,.error{border-radius:15px;padding:12px;line-height:1.55}.warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px;margin:10px 0}.field select,.field input{height:44px;border:1px solid #d1d5db;border-radius:12px;padding:0 10px;font:inherit}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:12px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;font-size:13px}td span{color:#64748b}code{font-size:11px}@media(max-width:760px){.wrap{padding:10px}.grid{grid-template-columns:1fr}.hero{border-radius:20px}.field select,.field input,button{width:100%;font-size:16px}}</style></head><body>${renderUnifiedNav("identity-audit", { householdId: selected?.id || "", householdName: selected?.name || "" })}<main class="wrap"><section class="hero"><h1>계정·가계부 안정성 점검</h1><p>챗봇, 카카오 웹 로그인, 백업 로그인이 서로 다른 사용자로 생성됐는지 확인하고 관리자가 명시적으로 통합합니다. 이 화면은 자동으로 계정을 합치거나 거래를 삭제하지 않습니다.</p></section>${msg ? `<div class="ok">${escapeHtml(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}<section class="card"><form method="get" action="/identity-audit"><div class="field"><label>점검할 가계부</label><select name="household_id">${householdOptions}</select></div><button type="submit">점검하기</button></form><p class="warn">${escapeHtml(warning)}<br/>화면에 보였던 8자리 값은 초대코드가 아니라 내부 사용자 ID 일부였습니다. V22.4.1부터 일반 사용자 화면에서는 표시하지 않습니다.</p></section><section class="card"><h2>${escapeHtml(selected?.name || "가계부 없음")} 참여자</h2><div class="tableWrap"><table><thead><tr><th>표시 이름</th><th>역할</th><th>계정 유형</th><th>거래</th><th>참여 시각</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="card"><h2>중복 계정 통합</h2><div class="warn">주 계정은 앞으로 로그인과 거래를 유지할 계정입니다. 일반적으로 거래 건수가 많고 현재 웹에서 정상 접속되는 계정을 선택합니다. 확신이 없으면 통합하지 마세요.</div><form method="post" action="/admin/identity/merge"><input type="hidden" name="household_id" value="${escapeHtml(selected?.id || "")}"/><div class="grid"><div class="field"><label>주 계정(남길 계정)</label><select name="primary_user_id" required><option value="">선택</option>${memberOptions}</select></div><div class="field"><label>보조 계정(합칠 계정)</label><select name="secondary_user_id" required><option value="">선택</option>${memberOptions}</select></div></div><div class="field"><label>확인 문구</label><input name="confirm_text" placeholder="통합" required/></div><button type="submit">계정 통합 실행</button></form></section>${linkDiagnostics}<section class="card"><h2>통합 범위</h2><ul><li>보조 계정의 거래 지출자 ID를 주 계정으로 변경</li><li>가계부 참여 역할을 가장 높은 역할 하나로 합침</li><li>가계부 표시 별명과 로그인 연결 정보를 주 계정으로 이전</li><li>보조 계정은 삭제하지 않고 ‘통합된 이전 계정’으로 보존</li><li>가계부·거래·초대코드는 삭제하거나 재생성하지 않음</li></ul></section></main></body></html>`);
}

// V22.9.91: 관리자 통합(handleIdentityMerge)과 계정 잇기(auth/kakao-account-link.js 의 /my/account-link/run)가 같은 순서로 합친다.
//  - primaryId·secondaryId: 정해진 두 계정(관리자 통합). choose 를 주면 두 계정의 잠금을 잡은 뒤 choose() 가 방향을 정한다
//    (계정 잇기 — 가계부·기록 유무로 정한다). choose 가 null 이면 아무것도 바꾸지 않고 null 을 돌려준다.
//  - householdId: 관리자 통합의 범위 가계부. 두 계정이 모두 그 가계부 구성원이어야 하고 그 가계부 잠금도 함께 잡는다. 계정 잇기는 비운다.
//  - revokeSecondarySessions: 합친 뒤 보조 계정의 옛 세션 판을 올려 옛 쿠키를 주 계정 세션으로 이어 주지 않는다. 계정 잇기만 켠다
//    (보조 계정 쿠키를 가진 다른 브라우저가 주 계정의 가계부까지 열지 않게). 관리자 통합은 예전처럼 옛 세션을 주 계정으로 이어 준다.
//    판을 읽지 못하면 아무것도 바꾸기 전에 멈춘다.
//  - afterMerge({ primaryId, secondaryId }): 합친 바로 뒤, 아래 정리(링크 표·방 연결·표시 별명)보다 먼저 부른다. 계정 잇기는 여기서
//    이 브라우저의 새 세션을 만들고 제안을 지운다. 정리는 한 요청의 DB 호출 한도(50회) 안에서만 하고, 모자라면 남기고 운영 이벤트를 적는다.
// 실패하면 오류에 mergeRpcStarted·departurePreservationStarted 를 달아 던진다(관리자 화면 안내 문구가 이것으로 갈린다).
async function performIdentityMerge(env, options = {}) {
  const path = String(options.path || "/admin/identity/merge");
  const householdId = String(options.householdId || "").trim();
  let primaryId = String(options.primaryId || "").trim();
  let secondaryId = String(options.secondaryId || "").trim();
  const lockIds = [...new Set((Array.isArray(options.userIds) ? options.userIds : [primaryId, secondaryId]).map((id) => String(id || "").trim()).filter(Boolean))];
  let primary = null;
  let secondary = null;
  let aliasHouseholdIds = [];
  let mergeRpcStarted = false;
  let departurePreservationStarted = false;
  let summary = null;
  try {
    summary = await withKakaoUserLifecycleLease(env, lockIds, async ({ assertFresh: lifecycleFresh }) => {
      const merge = async (assertFresh) => {
        let decided = null;
        if (typeof options.choose === "function") {
          decided = await options.choose({ assertFresh });
          if (!decided) return null;
          primaryId = String(decided.primaryId || "").trim();
          secondaryId = String(decided.secondaryId || "").trim();
          if (!primaryId || !secondaryId || primaryId === secondaryId || !lockIds.includes(primaryId) || !lockIds.includes(secondaryId)) throw new Error("identity_merge_scope_changed");
        } else if (!(await kakaoClaimUserUnmerged(env, primaryId)) || !(await kakaoClaimUserUnmerged(env, secondaryId))) {
          throw new Error("identity_merge_scope_changed");
        }
        const knownHouseholdIds = Array.isArray(decided?.secondaryHouseholdIds) ? decided.secondaryHouseholdIds : null;
        const [secondaryMemberships, selectedMembers] = await Promise.all([
          knownHouseholdIds ? null
            : supabase(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(secondaryId)}&select=household_id,user_id,role,created_at`, { method: "GET" }),
          householdId ? fetchRawHouseholdMembers(env, householdId) : null,
        ]);
        if (householdId && (!selectedMembers.some((m) => String(m.user_id) === primaryId) || !selectedMembers.some((m) => String(m.user_id) === secondaryId))) throw new Error("identity_merge_scope_changed");
        if (!knownHouseholdIds && !Array.isArray(secondaryMemberships)) throw new Error("household_member_source_invalid");
        aliasHouseholdIds = [...new Set((knownHouseholdIds || secondaryMemberships.map((item) => item.household_id)).map((id) => String(id || "").trim()).filter(Boolean))];
        // 합친 뒤 링크 표를 고칠 때 쓰는 두 계정의 원래 키. 합치기 RPC 가 보조 계정 키를 merged: 로 바꾸므로 먼저 잡아 둔다.
        [primary, secondary] = await Promise.all([fetchUserById(env, primaryId), fetchUserById(env, secondaryId)]);
        // 보조 계정의 세션 판을 읽지 못하면 옛 세션을 끊을 수 없으니 합치지 않는다(아무것도 바꾸기 전이다).
        const secondarySessionVersion = options.revokeSecondarySessions ? await getUserSessionVersion(env, secondaryId) : 0;
        if (options.revokeSecondarySessions && secondarySessionVersion < 1) throw new Error("identity_merge_session_version_unavailable");
        assertFresh();
        departurePreservationStarted = true;
        await preserveKakaoGroupDeparturesForMerge(env, primaryId, secondaryId, assertFresh);
        assertFresh();
        let result;
        try {
          mergeRpcStarted = true;
          result = await supabase(env, "/rest/v1/rpc/accountbook_merge_users_v227", {
            method: "POST", headers: { Prefer: "return=representation" },
            body: JSON.stringify({ p_primary_user_id: primaryId, p_secondary_user_id: secondaryId }),
          });
        } catch (err) {
          if (isDefiniteStorageFailure(err)) throw err;
          assertFresh();
          env.__AB_REQUEST_USER_ROWS?.delete(secondaryId);
          const [mergedUser, redirect] = await Promise.all([fetchUserById(env, secondaryId), getSettingValueStrict(env, identityMergeRedirectSettingsKey(secondaryId))]);
          if (!String(mergedUser?.kakao_user_key || "").startsWith("merged:") || parseIdentityMergeRedirectValue(redirect, secondaryId) !== primaryId) throw err;
          result = { merged: true, recovered: true };
        }
        const merged = Array.isArray(result) ? result[0] : result;
        if (!merged?.merged) throw new Error("identity_merge_not_confirmed");
        env.__AB_REQUEST_USER_ROWS?.delete(primaryId);
        env.__AB_REQUEST_USER_ROWS?.delete(secondaryId);
        try {
          assertFresh();
          await markKakaoChatFirstHistoryBatch(env, [primaryId, secondaryId]);
        } catch (historyErr) {
          rememberOpsEvent({ kind: "identity_merge_history_pending", severity: "warn", path, method: "POST", detail: safeError(historyErr) });
        }
        if (secondarySessionVersion > 0) {
          // 합치기 RPC 가 보조 계정의 세션 판 행을 지웠다. 옛 판보다 큰 판으로 다시 적어 옛 쿠키가 통합 복구로 주 계정 세션이 되지 않게 한다.
          try {
            await supabase(env, "/rest/v1/accountbook_user_security?on_conflict=user_id", {
              method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
              body: JSON.stringify({ user_id: secondaryId, session_version: secondarySessionVersion + 1 }),
            });
          } catch (revokeErr) {
            rememberOpsEvent({ kind: "identity_merge_session_revoke_pending", severity: "warn", path, method: "POST", detail: safeError(revokeErr) });
          }
        }
        return merged;
      };
      if (!householdId) return merge(lifecycleFresh);
      return withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => merge(() => { lifecycleFresh(); householdFresh(); }));
    });
  } catch (err) {
    const failure = err instanceof Error ? err : new Error(safeError(err));
    failure.mergeRpcStarted = mergeRpcStarted;
    failure.departurePreservationStarted = departurePreservationStarted;
    throw failure;
  }
  if (!summary) return null;

  rewireEffectiveUserCache(secondaryId, primaryId);
  // V22.9.91: 뒤처리는 모두 실패해도 합치기를 되돌리지 않는다. 한 요청의 DB 호출 한도(50회) 안에서 부르는 쪽의 뒤처리(afterMerge)부터
  // 하고 링크 표 → 방 연결 → 가계부별 표시 별명 순서로 한다. 잠금을 잡고 못 풀면 90초 남으므로, 남은 호출이 모자라면 시작하지 않고
  // 운영 이벤트(…_deferred)로 남긴다. 남겨도 로그인·기록은 통합 리다이렉트로 주 계정을 찾는다.
  const dbRoom = (calls) => {
    const budget = env.__AB_DB_BUDGET;
    return !budget || Number(budget.used || 0) + calls <= Number(budget.limit || 50);
  };
  if (typeof options.afterMerge === "function") {
    try {
      await options.afterMerge({ primaryId, secondaryId });
    } catch (err) {
      rememberOpsEvent({ kind: "identity_merge_after_failed", severity: "warn", path, method: "POST", detail: safeError(err) });
    }
  }
  // 링크 표: 잠금·읽기·쓰기·풀기 4회.
  try {
    if (!dbRoom(4)) throw Object.assign(new Error("legacy identity cleanup pending: no database budget"), { deferred: true });
    await withGlobalIdentitySettingsRmw(env, async ({ assertFresh }) => {
      const links = await fetchUserIdentityLinks(env);
      for (const [key, value] of Object.entries(safeObject(links))) {
        if (String(safeObject(value).user_id || "") === secondaryId) links[key] = { ...safeObject(value), user_id: primaryId, merged_at: new Date().toISOString() };
      }
      if (secondary?.kakao_user_key) links[`skill_identity:${secondary.kakao_user_key}`] = { user_id: primaryId, provider: "identity_merge", linked_at: new Date().toISOString() };
      if (primary?.kakao_user_key) links[`skill_identity:${primary.kakao_user_key}`] = { user_id: primaryId, provider: "identity_merge", linked_at: new Date().toISOString() };
      // V22.9.91: 웹 카카오 로그인으로 만든 계정의 사용자 키(kakao_login:<카카오 id>)도 링크 표에서 주 계정을 가리키게 한다. 합치기 RPC 가
      // 보조 계정의 키를 merged: 로 바꾸므로, 강한 식별이 없는 옛 가입자는 다음 웹 로그인에 주인을 못 찾아 빈 새 계정이 생길 수 있었다.
      for (const row of [secondary, primary]) {
        const key = String(row?.kakao_user_key || "");
        if (key.startsWith("kakao_login:")) links[key] = { ...safeObject(links[key]), user_id: primaryId, provider: safeObject(links[key]).provider || "identity_merge", linked_at: safeObject(links[key]).linked_at || new Date().toISOString() };
      }
      assertFresh();
      await saveUserIdentityLinks(env, links);
    });
  } catch (err) {
    rememberOpsEvent({ kind: err?.deferred ? "identity_legacy_link_cleanup_deferred" : "identity_legacy_link_cleanup_failed", severity: "warn", path, method: "POST", detail: err?.deferred ? err.message : "legacy identity cleanup pending" });
  }
  // 방 연결: 연결 읽기 1회 + 옛 통합 맵 4회가 남아야 시작한다. 방마다 4회는 reassignKakaoGroupLinkOwner 가 hasRoom 으로 본다.
  if (!dbRoom(5)) {
    rememberOpsEvent({ kind: "identity_group_link_cleanup_deferred", severity: "warn", path, method: "POST", detail: "group link cleanup pending: not checked" });
  } else {
    try {
      // V22.9.34 감사 S2: 방 연결은 linked_by 만 바꾼다. 예전에는 관대하게 읽은 합친 맵으로 옛 통합 맵 전체를
      // 다시 써서, 옛 맵 읽기가 실패하면 옛 맵에만 있던 방 연결이 사라지고 그 방의 다음 기록이 새 가계부로 갔다.
      const rooms = await reassignKakaoGroupLinkOwner(env, secondaryId, primaryId, { hasRoom: dbRoom });
      if (rooms.pending || rooms.legacyPending) rememberOpsEvent({ kind: "identity_group_link_cleanup_deferred", severity: "warn", path, method: "POST", detail: `group link cleanup pending: ${rooms.pending} room(s)${rooms.legacyPending ? " + legacy map" : ""}` });
    } catch (err) {
      rememberOpsEvent({ kind: "identity_group_link_cleanup_failed", severity: "warn", path, method: "POST", detail: "group link cleanup pending" });
    }
  }
  // V22.9.91: 보조 계정의 표시 별명이 있는 가계부만 잠그고 고친다. 별명 표를 한 번에 읽어 보고, 읽지 못하면 예전처럼 모든 가계부를 본다.
  // 가계부마다 잠금·확인·읽기·쓰기·풀기로 4~5회씩 들어 가계부가 많은 사람은 한 요청의 한도를 넘겼다. 남은 호출이 모자라면 멈추고 남긴다.
  if (aliasHouseholdIds.length && dbRoom(6)) {
    try {
      const rows = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${aliasHouseholdIds.map((hid) => encodeURIComponent(memberAliasSettingsKey(hid))).join(",")})&select=key,value`, { method: "GET" });
      if (Array.isArray(rows)) {
        const keys = new Set(rows.filter((row) => {
          try { return Object.prototype.hasOwnProperty.call(safeObject(JSON.parse(String(row?.value || "{}"))), secondaryId); } catch (_) { return true; }
        }).map((row) => String(row?.key || "")));
        aliasHouseholdIds = aliasHouseholdIds.filter((hid) => keys.has(memberAliasSettingsKey(hid)));
      }
    } catch (_) {
      // 읽지 못하면 모든 가계부를 잠그고 다시 읽는다(아래).
    }
  }
  let aliasHouseholdsDone = 0;
  // 병합 RPC 뒤 최신 별칭을 가계부별로 다시 읽는다. 잠금은 한 번에 하나만 잡아
  // 여러 가계부의 설정 잠금 순서가 교차하지 않게 한다.
  for (const hid of aliasHouseholdIds) {
    if (!dbRoom(5)) {
      rememberOpsEvent({ kind: "identity_alias_cleanup_deferred", severity: "warn", path, method: "POST", detail: `alias cleanup pending: ${aliasHouseholdIds.length - aliasHouseholdsDone} household(s)` });
      break;
    }
    aliasHouseholdsDone += 1;
    try {
      await withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
        const aliases = await fetchMemberAliasMap(env, hid, { strict: true });
        let changed = false;
        if (!aliases[primaryId] && aliases[secondaryId]) { aliases[primaryId] = aliases[secondaryId]; changed = true; }
        if (Object.prototype.hasOwnProperty.call(aliases, secondaryId)) { delete aliases[secondaryId]; changed = true; }
        if (!changed) return false;
        assertFresh();
        await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: memberAliasSettingsKey(hid), value: JSON.stringify(aliases) }) });
        return true;
      }, { missingHousehold: "noop", missingResult: false });
    } catch (err) {
      rememberOpsEvent({ kind: "identity_alias_cleanup_failed", severity: "warn", path, method: "POST", detail: "alias cleanup pending" });
    }
  }
  return { summary, primaryId, secondaryId };
}

async function handleIdentityMerge(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const primaryId = String(form.get("primary_user_id") || "").trim();
  const secondaryId = String(form.get("secondary_user_id") || "").trim();
  const confirmText = String(form.get("confirm_text") || "").trim();
  const base = `/identity-audit?household_id=${encodeURIComponent(householdId)}`;
  if (!householdId || !primaryId || !secondaryId || primaryId === secondaryId || confirmText !== "통합") return redirectResponse(`${base}&err=${encodeURIComponent("통합 대상과 확인 문구를 확인하세요.")}`);
  const [primary, secondary] = await Promise.all([fetchUserById(env, primaryId), fetchUserById(env, secondaryId)]);
  if (!primary || !secondary) return redirectResponse(`${base}&err=${encodeURIComponent("사용자 계정을 찾지 못했습니다.")}`);

  try {
    await performIdentityMerge(env, { primaryId, secondaryId, householdId, path: "/admin/identity/merge" });
  } catch (err) {
    rememberOpsEvent({ kind: "identity_atomic_merge_failed", severity: "error", path: "/admin/identity/merge", method: "POST", detail: safeError(err) });
    const message = /identity_merge_scope_changed/.test(safeError(err)) ? "선택한 두 계정이 모두 이 가계부의 참여자인지 다시 확인하세요."
      : (!err?.mergeRpcStarted || isDefiniteStorageFailure(err) || /identity_merge_not_confirmed/.test(safeError(err))) ? (err?.departurePreservationStarted
        ? "계정 통합을 완료하지 못했습니다. 기존 계정과 거래는 변경하지 않았습니다. 나가기 이력을 먼저 보존했을 수 있어 자동 참여가 제한될 수 있습니다."
        : "계정 통합을 완료하지 못했습니다. 기존 계정과 거래는 변경하지 않았습니다.")
      : "계정 통합 결과를 확인하지 못했습니다. 같은 요청을 다시 제출하지 말고 통합 목록에서 현재 상태를 확인하세요.";
    return redirectResponse(`${base}&err=${encodeURIComponent(message)}`);
  }
  return redirectResponse(`${base}&msg=${encodeURIComponent("계정 통합이 완료됐습니다. 거래와 참여 권한은 한 번에 이동됐습니다.")}`);
}
// @build:exports-start
export { handleIdentityAuditPage, handleIdentityMerge, performIdentityMerge };
// @build:exports-end
