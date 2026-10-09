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
  identityMergeRedirectSettingsKey, parseIdentityMergeRedirectValue, rewireEffectiveUserCache,
} from "../auth/user-session.js";
import { fetchUserIdentityLinks, saveUserIdentityLinks } from "../auth/identity-reauth.js";
import {
  fetchRawHouseholdMembers, fetchUserById, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { kakaoClaimUserUnmerged } from "../auth/kakao-web-claim.js";
import { isDefiniteStorageFailure } from "../kakao/response-builders.js";
import {
  preserveKakaoGroupDeparturesForMerge, reassignKakaoGroupLinkOwner,
} from "../kakao/group-links-first-record.js";
import { markKakaoChatFirstHistory } from "../kakao/identity-chat-first.js";
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
  const warning = audit.owners.length > 1 ? `소유자가 ${audit.owners.length}명입니다. 같은 사람의 챗봇·웹 로그인 계정이 나뉜 경우, 거래가 많은 계정을 주 계정으로 선택해 통합하세요.` : "소유자 수는 정상입니다.";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>계정·가계부 안정성 점검</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#ede9fe;line-height:1.6}.warn,.ok,.error{border-radius:15px;padding:12px;line-height:1.55}.warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px;margin:10px 0}.field select,.field input{height:44px;border:1px solid #d1d5db;border-radius:12px;padding:0 10px;font:inherit}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:12px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;font-size:13px}td span{color:#64748b}code{font-size:11px}@media(max-width:760px){.wrap{padding:10px}.grid{grid-template-columns:1fr}.hero{border-radius:20px}.field select,.field input,button{width:100%;font-size:16px}}</style></head><body>${renderUnifiedNav("identity-audit", { householdId: selected?.id || "", householdName: selected?.name || "" })}<main class="wrap"><section class="hero"><h1>계정·가계부 안정성 점검</h1><p>챗봇, 카카오 웹 로그인, 백업 로그인이 서로 다른 사용자로 생성됐는지 확인하고 관리자가 명시적으로 통합합니다. 이 화면은 자동으로 계정을 합치거나 거래를 삭제하지 않습니다.</p></section>${msg ? `<div class="ok">${escapeHtml(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}<section class="card"><form method="get" action="/identity-audit"><div class="field"><label>점검할 가계부</label><select name="household_id">${householdOptions}</select></div><button type="submit">점검하기</button></form><p class="warn">${escapeHtml(warning)}<br/>화면에 보였던 8자리 값은 초대코드가 아니라 내부 사용자 ID 일부였습니다. V22.4.1부터 일반 사용자 화면에서는 표시하지 않습니다.</p></section><section class="card"><h2>${escapeHtml(selected?.name || "가계부 없음")} 참여자</h2><div class="tableWrap"><table><thead><tr><th>표시 이름</th><th>역할</th><th>계정 유형</th><th>거래</th><th>참여 시각</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="card"><h2>중복 계정 통합</h2><div class="warn">주 계정은 앞으로 로그인과 거래를 유지할 계정입니다. 일반적으로 거래 건수가 많고 현재 웹에서 정상 접속되는 계정을 선택합니다. 확신이 없으면 통합하지 마세요.</div><form method="post" action="/admin/identity/merge"><input type="hidden" name="household_id" value="${escapeHtml(selected?.id || "")}"/><div class="grid"><div class="field"><label>주 계정(남길 계정)</label><select name="primary_user_id" required><option value="">선택</option>${memberOptions}</select></div><div class="field"><label>보조 계정(합칠 계정)</label><select name="secondary_user_id" required><option value="">선택</option>${memberOptions}</select></div></div><div class="field"><label>확인 문구</label><input name="confirm_text" placeholder="통합" required/></div><button type="submit">계정 통합 실행</button></form></section><section class="card"><h2>통합 범위</h2><ul><li>보조 계정의 거래 지출자 ID를 주 계정으로 변경</li><li>가계부 참여 역할을 가장 높은 역할 하나로 합침</li><li>가계부 표시 별명과 로그인 연결 정보를 주 계정으로 이전</li><li>보조 계정은 삭제하지 않고 ‘통합된 이전 계정’으로 보존</li><li>가계부·거래·초대코드는 삭제하거나 재생성하지 않음</li></ul></section></main></body></html>`);
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

  let aliasHouseholdIds = [];
  let mergeRpcStarted = false;
  let departurePreservationStarted = false;
  try {
    await withKakaoUserLifecycleLease(env, [primaryId, secondaryId], async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
      const assertFresh = () => { lifecycleFresh(); householdFresh(); };
      if (!(await kakaoClaimUserUnmerged(env, primaryId)) || !(await kakaoClaimUserUnmerged(env, secondaryId))) throw new Error("identity_merge_scope_changed");
      const [secondaryMemberships, selectedMembers] = await Promise.all([
        supabase(env, `/rest/v1/household_members?user_id=eq.${encodeURIComponent(secondaryId)}&select=household_id,user_id,role,created_at`, { method: "GET" }),
        fetchRawHouseholdMembers(env, householdId),
      ]);
      if (!selectedMembers.some((m) => String(m.user_id) === primaryId) || !selectedMembers.some((m) => String(m.user_id) === secondaryId)) throw new Error("identity_merge_scope_changed");
      aliasHouseholdIds = [...new Set(secondaryMemberships.map((item) => String(item.household_id || "").trim()).filter(Boolean))];
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
        const [mergedUser, redirect] = await Promise.all([fetchUserById(env, secondaryId), getSettingValueStrict(env, identityMergeRedirectSettingsKey(secondaryId))]);
        if (!String(mergedUser?.kakao_user_key || "").startsWith("merged:") || parseIdentityMergeRedirectValue(redirect, secondaryId) !== primaryId) throw err;
        result = { merged: true, recovered: true };
      }
      const summary = Array.isArray(result) ? result[0] : result;
      if (!summary?.merged) throw new Error("identity_merge_not_confirmed");
      try {
        assertFresh();
        await markKakaoChatFirstHistory(env, primaryId);
        assertFresh();
        await markKakaoChatFirstHistory(env, secondaryId);
      } catch (historyErr) {
        rememberOpsEvent({ kind: "identity_merge_history_pending", severity: "warn", path: "/admin/identity/merge", method: "POST", detail: safeError(historyErr) });
      }
      return summary;
    }));
  } catch (err) {
    rememberOpsEvent({ kind: "identity_atomic_merge_failed", severity: "error", path: "/admin/identity/merge", method: "POST", detail: safeError(err) });
    const message = /identity_merge_scope_changed/.test(safeError(err)) ? "선택한 두 계정이 모두 이 가계부의 참여자인지 다시 확인하세요."
      : (!mergeRpcStarted || isDefiniteStorageFailure(err) || /identity_merge_not_confirmed/.test(safeError(err))) ? (departurePreservationStarted
        ? "계정 통합을 완료하지 못했습니다. 기존 계정과 거래는 변경하지 않았습니다. 나가기 이력을 먼저 보존했을 수 있어 자동 참여가 제한될 수 있습니다."
        : "계정 통합을 완료하지 못했습니다. 기존 계정과 거래는 변경하지 않았습니다.")
      : "계정 통합 결과를 확인하지 못했습니다. 같은 요청을 다시 제출하지 말고 통합 목록에서 현재 상태를 확인하세요.";
    return redirectResponse(`${base}&err=${encodeURIComponent(message)}`);
  }

  rewireEffectiveUserCache(secondaryId, primaryId);
  // 병합 RPC 뒤 최신 별칭을 가계부별로 다시 읽는다. 잠금은 한 번에 하나만 잡아
  // 여러 가계부의 설정 잠금 순서가 교차하지 않게 한다.
  for (const hid of aliasHouseholdIds) {
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
      rememberOpsEvent({ kind: "identity_alias_cleanup_failed", severity: "warn", path: "/admin/identity/merge", method: "POST", detail: "alias cleanup pending" });
    }
  }
  try {
    await withGlobalIdentitySettingsRmw(env, async ({ assertFresh }) => {
      const links = await fetchUserIdentityLinks(env);
      for (const [key, value] of Object.entries(safeObject(links))) {
        if (String(safeObject(value).user_id || "") === secondaryId) links[key] = { ...safeObject(value), user_id: primaryId, merged_at: new Date().toISOString() };
      }
      if (secondary.kakao_user_key) links[`skill_identity:${secondary.kakao_user_key}`] = { user_id: primaryId, provider: "identity_merge", linked_at: new Date().toISOString() };
      if (primary.kakao_user_key) links[`skill_identity:${primary.kakao_user_key}`] = { user_id: primaryId, provider: "identity_merge", linked_at: new Date().toISOString() };
      assertFresh();
      await saveUserIdentityLinks(env, links);
    });
  } catch (err) {
    rememberOpsEvent({ kind: "identity_legacy_link_cleanup_failed", severity: "warn", path: "/admin/identity/merge", method: "POST", detail: "legacy identity cleanup pending" });
  }
  try {
    // V22.9.34 감사 S2: 방 연결은 linked_by 만 바꾼다. 예전에는 관대하게 읽은 합친 맵으로 옛 통합 맵 전체를
    // 다시 써서, 옛 맵 읽기가 실패하면 옛 맵에만 있던 방 연결이 사라지고 그 방의 다음 기록이 새 가계부로 갔다.
    await reassignKakaoGroupLinkOwner(env, secondaryId, primaryId);
  } catch (err) {
    rememberOpsEvent({ kind: "identity_group_link_cleanup_failed", severity: "warn", path: "/admin/identity/merge", method: "POST", detail: "group link cleanup pending" });
  }
  return redirectResponse(`${base}&msg=${encodeURIComponent("계정 통합이 완료됐습니다. 거래와 참여 권한은 한 번에 이동됐습니다.")}`);
}
// @build:exports-start
export { handleIdentityAuditPage, handleIdentityMerge };
// @build:exports-end
