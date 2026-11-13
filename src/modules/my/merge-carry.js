// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  normalizeSupporterFlag, supporterInValueV22995, supporterSettingsKey, supporterTextV22995,
} from "./supporters.js";
import { saveSettingValue } from "./reports-premium.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end
// V22.9.121 계정 합치기 뒤 설정 줄 옮기기. 관리자 통합(/admin/identity/merge)과 계정 잇기(/my/account-link/run)는 모두
// performIdentityMerge(admin/identity-merge.js) → 합치기 RPC(accountbook_merge_users_v227)로 가계부 참여·기록·정기 규칙·로그인 연결을
// 주 계정으로 옮기지만, 설정 표의 사용자 줄은 옮기지 않는다. 그래서 보조 계정 쪽에 있던 후원자 표시(supporter:<id>)가 남아
// 계정을 이은 후원자가 배지·포인트 색·공개 명단 줄을 잃었고, 주 계정에 안내 확인 기록(consent:<id>)이 없을 수 있었다.
// performIdentityMerge 의 맨 끝(합치기 RPC 와 기존 뒤처리 — 세션·링크 표·방 연결·가계부별 표시 별명 — 다음)에서 이 둘만 옮긴다.
//  · 읽기: 네 줄(supporter:주·보조, consent:주·보조)을 key=in.(…) 한 번으로 읽는다.
//  · 후원자 표시: 보조 계정 값이 맞는 표시(normalizeSupporterFlag)이고 주 계정에 맞는 표시가 없으면 그대로 주 계정에 적고, 둘 다 있으면
//    시작일은 이른 날, 끝나는 날은 한쪽이라도 없으면 없음(계속) · 둘 다 있으면 늦은 날, 메모는 주 계정 것 우선(둘 다 있고 다르면 ‘주 / 보조’,
//    200자), 명단 이름은 주 계정 것 우선으로 합쳐 적는다. 그다음 보조 계정 줄을 지운다(남으면 관리자 목록·공개 명단에 같은 분이 두 번 보인다).
//    보조 계정 값이 맞지 않으면(값 오류) 아무것도 바꾸지 않는다.
//  · 안내 확인 기록: 주 계정에 없고 보조 계정에 있으면 같은 값을 주 계정에 적는다(보조 계정 줄은 남긴다 — 그 사람이 안내를 본 기록이다).
//  · DB 호출은 읽기 1회 + 쓰기 많아야 3회(후원자 쓰기·보조 줄 지우기·안내 기록 쓰기). 부르는 쪽의 남은 호출(hasRoom)이 모자라면 시작하지 않거나
//    아무것도 쓰지 않고 운영 이벤트(merge_settings_carry_deferred)로 남긴다(반쯤 옮긴 상태를 만들지 않는다).
//  · 실패해도 합치기 결과·응답은 그대로다(모든 오류를 여기서 받고 운영 이벤트 merge_settings_carry_failed 만 남긴다 — 값·키는 적지 않는다).

function mergeCarryConsentKeyV229121(userId = "") {
  const id = String(userId || "").trim();
  // 동의 기록을 쓰고 읽는 곳(auth/local-login-pages.js recordSignupConsent·auth/kakao-start-screen.js)과 같은 키 모양이다.
  return id ? `consent:${id}`.slice(0, 180) : "";
}

// 두 후원자 표시(둘 다 normalizeSupporterFlag 를 지난 값)를 하나로 합친다.
function mergeSupporterFlagsV229121(primary, secondary) {
  const since = primary.since <= secondary.since ? primary.since : secondary.since;
  const until = !primary.until || !secondary.until ? null : (primary.until >= secondary.until ? primary.until : secondary.until);
  const notes = [primary.note, secondary.note].filter(Boolean);
  const note = notes.length === 2 && notes[0] !== notes[1] ? supporterTextV22995(`${notes[0]} / ${notes[1]}`, 200) : (notes[0] || "");
  return { since, until, note, public_name: primary.public_name || secondary.public_name || null };
}

// 운영 이벤트에 붙일 짧은 이유(오류 글의 본문·키·값은 싣지 않는다).
function mergeCarryFailureCodeV229121(err) {
  const code = String(err?.code || "");
  if (/^[A-Za-z0-9_.-]{1,60}$/.test(code)) return code;
  const status = String(err?.message || "").match(/^Supabase (\d{3})\b/);
  return status ? `http_${status[1]}` : "error";
}

// 합친 뒤 한 번 부른다. 무엇을 옮겼는지 돌려주지만 performIdentityMerge 는 이 값을 쓰지 않는다(합치기 결과는 그대로).
async function carryUserSettingsAfterMergeV229121(env, primaryId, secondaryId, options = {}) {
  const outcome = { read: false, supporter: "none", consent: false, deferred: false, failed: [] };
  const path = String(options?.path || "/admin/identity/merge");
  const event = (kind, detail) => rememberOpsEvent({ kind, severity: "warn", path, method: "POST", detail });
  const failed = (stage, err) => {
    outcome.failed.push(stage);
    event("merge_settings_carry_failed", `settings carry pending (${stage}): ${mergeCarryFailureCodeV229121(err)}`);
  };
  try {
    const primary = String(primaryId || "").trim();
    const secondary = String(secondaryId || "").trim();
    if (!primary || !secondary || primary === secondary) return outcome;
    const hasRoom = typeof options?.hasRoom === "function" ? options.hasRoom : () => true;
    const keys = {
      supporterPrimary: supporterSettingsKey(primary),
      supporterSecondary: supporterSettingsKey(secondary),
      consentPrimary: mergeCarryConsentKeyV229121(primary),
      consentSecondary: mergeCarryConsentKeyV229121(secondary),
    };
    if (!hasRoom(1)) {
      outcome.deferred = true;
      event("merge_settings_carry_deferred", "settings carry pending: no database budget (read)");
      return outcome;
    }
    let rows;
    try {
      const params = new URLSearchParams();
      params.set("key", `in.(${Object.values(keys).map(supporterInValueV22995).join(",")})`);
      params.set("select", "key,value");
      params.set("limit", "4");
      rows = await supabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET" });
      if (!Array.isArray(rows)) throw new Error("merge_settings_carry_read_invalid");
    } catch (err) {
      failed("read", err);
      return outcome;
    }
    outcome.read = true;
    const found = new Map(rows.map((row) => [String(row?.key || ""), row?.value]));
    const present = (key) => found.has(key) && found.get(key) !== null && found.get(key) !== undefined && found.get(key) !== "";
    let supporterValue = null;
    if (present(keys.supporterSecondary)) {
      const secondaryFlag = normalizeSupporterFlag(found.get(keys.supporterSecondary));
      if (secondaryFlag) {
        const primaryFlag = normalizeSupporterFlag(found.get(keys.supporterPrimary));
        supporterValue = primaryFlag ? mergeSupporterFlagsV229121(primaryFlag, secondaryFlag) : secondaryFlag;
        outcome.supporter = primaryFlag ? "merged" : "moved";
      } else {
        outcome.supporter = "invalid";
      }
    }
    const consentValue = !present(keys.consentPrimary) && present(keys.consentSecondary) ? found.get(keys.consentSecondary) : null;
    const writes = (supporterValue ? 2 : 0) + (consentValue !== null ? 1 : 0);
    if (!writes) return outcome;
    if (!hasRoom(writes)) {
      outcome.deferred = true;
      if (supporterValue) outcome.supporter = "deferred";
      event("merge_settings_carry_deferred", `settings carry pending: no database budget (${writes} write(s))`);
      return outcome;
    }
    const steps = [];
    if (supporterValue) {
      steps.push((async () => {
        try {
          await saveSettingValue(env, keys.supporterPrimary, supporterValue);
        } catch (err) {
          outcome.supporter = "failed";
          failed("supporter", err);
          return;
        }
        try {
          await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(keys.supporterSecondary)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        } catch (err) {
          // 주 계정에는 이미 적었다. 보조 계정 줄만 남는다(관리자 목록에서 지울 수 있다).
          failed("supporter_cleanup", err);
        }
      })());
    }
    if (consentValue !== null) {
      steps.push((async () => {
        try {
          await saveSettingValue(env, keys.consentPrimary, consentValue);
          outcome.consent = true;
        } catch (err) {
          failed("consent", err);
        }
      })());
    }
    await Promise.all(steps);
    return outcome;
  } catch (err) {
    failed("unexpected", err);
    return outcome;
  }
}
// @build:exports-start
export { carryUserSettingsAfterMergeV229121 };
// @build:exports-end
