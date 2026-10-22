// @build:imports-start
import { AB_KAKAO_INFLIGHT } from "../runtime/ops-telemetry.js";
import {
  parseStrictSettingsObject, withHouseholdDatabaseLease, withSettingsRmwLease,
} from "../runtime/leases.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { applyUserSettingsToParsedTransactions } from "../settings/payment-assets.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import {
  fetchUserHouseholds, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { canWriteMyHousehold } from "../my/access-control.js";
import { kakaoClaimUserUnmerged } from "../auth/kakao-web-claim.js";
import {
  isDefiniteStorageFailure, isUncertainStorageWrite, kakaoText,
} from "./response-builders.js";
import { isStrongKakaoTransactionInput, stripLeadingCommand } from "./request-guards.js";
import { getKakaoSelectedHouseholdId } from "./household-budget-commands.js";
import {
  clearKakaoConfirmedPendingWrite, fetchKakaoInputSettings, kakaoPendingWriteKey, kakaoRowsByIds,
  kakaoUnknownWriteError, kakaoWriteLeaseKey, parseKakaoPendingWrite,
} from "./transaction-save.js";
import {
  getKakaoBotGroupKey, getLinkedKakaoGroupHousehold, withKakaoGroupLifecycleLease,
} from "./group-links-first-record.js";
import { stableShortHash } from "./identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
import { parseMultipleTransactions } from "../nlu/transaction-parser.js";
import { normalizeText } from "../nlu/amount-parser.js";
import {
  abTransactionRequestId, findTransactionForRequest, numberWithCommas, sameTransactionCore,
} from "../domain/transactions-core.js";
// @build:imports-end
// A confirmation is a server-issued action, never a platform event identity.
function parseKakaoSeparatePurchaseCommand(text = "") {
  const value = String(text).trim();
  // V22.9.76 카카오 감사 11: 수입은 ‘구매’가 아니므로 ‘별도 기록 …’도 같은 명령으로 받는다.
  const add = value.match(/^별도\s+(?:구매|기록)\s+추가\s+([\s\S]+)$/);
  if (add) return { action: "prepare", text: add[1].trim() };
  const control = value.match(/^별도\s+(?:구매|기록)\s+(확인|취소|조회)\s+([a-f0-9]{16})$/);
  if (control) return { action: control[1] === "확인" ? "confirm" : control[1] === "취소" ? "cancel" : "status", token: control[2] };
  return /^별도\s*(?:구매|기록)/.test(value) ? { action: "invalid" } : null;
}

async function kakaoSeparateStateKey(householdId, userId, scope) {
  // This existing household prefix participates in the approved purge lifecycle.
  return `kakao_edit_v2254:${householdId}:separate:${userId}:${await sha256Hex(scope)}`;
}

async function parseKakaoSeparateState(raw, scope) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 8192) throw new Error("separate_state_invalid");
  const state = parseStrictSettingsObject(raw, "separate_purchase");
  if (state.schema_version !== 1 || !/^[a-f0-9]{16}$/.test(state.confirmation_id) ||
      !["candidate", "submitting", "unknown", "confirmed", "failed", "cancelled"].includes(state.state) ||
      !Number.isSafeInteger(state.created_at) || !Number.isSafeInteger(state.expires_at) || state.created_at < 0 ||
      state.expires_at !== state.created_at + 300000 ||
      ["household_id", "user_id", "conversation_scope"].some(key => state[key] !== scope[key]) ||
      !abTransactionRequestId(state.row?.id) || !state.original?.id || state.original.household_id !== scope.household_id || state.original.user_id !== scope.user_id ||
      state.row.household_id !== scope.household_id || state.row.user_id !== scope.user_id ||
      state.row.source !== "kakao_skill" || !["expense", "income"].includes(state.row.type) ||
      !isValidTransactionDateString(state.row.transaction_date) || !Number.isSafeInteger(state.row.amount) || state.row.amount <= 0 || state.row.amount > MAX_TRANSACTION_AMOUNT ||
      [["memo",160],["category",80],["payment_method",40],["raw_text",300],["source_user_key",160]].some(([key,limit]) => typeof state.row[key] !== "string" || state.row[key].length > limit)) throw new Error("separate_state_invalid");
  const digest = await sha256Hex(JSON.stringify([scope, state.row, state.original]));
  if (state.candidate_digest !== digest) throw new Error("separate_candidate_changed");
  return state;
}

async function saveKakaoSeparateState(env, key, state, assertFresh) {
  const value = JSON.stringify(state);
  if (value.length > 8192) throw new Error("separate_state_too_large");
  assertFresh();
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({key,value}),
  });
}

function kakaoSeparateCandidateReply(state, household, payload) {
  const row = state.row;
  const word = row.type === "income" ? "기록" : "구매";
  const confirm = `별도 ${word} 확인 ${state.confirmation_id}`;
  const cancel = `별도 ${word} 취소 ${state.confirmation_id}`;
  return kakaoText([
    `같은 내용의 별도 ${word} 후보입니다. 아직 추가하지 않았어요.`,
    `가계부: ${household.name}`, `${row.transaction_date} · ${row.type === "income" ? "수입" : "지출"} · ${numberWithCommas(row.amount)}원`,
    `${row.category} · ${row.memo || "내용 없음"} · ${row.payment_method || "결제수단 없음"}`,
    "5분 안에 내용을 확인한 뒤 확정해 주세요.",
    ...(getKakaoBotGroupKey(payload) ? [confirm,cancel] : []),
  ].join("\n"), getKakaoBotGroupKey(payload) ? null : [[`별도 ${word} 확정`,confirm],["추가 취소",cancel]]);
}

async function recoverKakaoPendingForSeparate(env, householdId, userId, assertFresh) {
  const pending = parseKakaoPendingWrite(await getSettingValueStrict(env, kakaoPendingWriteKey(householdId,userId)));
  if (!pending) return;
  const rows = await kakaoRowsByIds(env, householdId, pending.ids);
  if (!pending.rows || rows.length !== pending.rows.length || !pending.rows.every(expected => rows.some(actual => actual.id === expected.id && sameTransactionCore(actual,expected)))) throw kakaoUnknownWriteError();
  assertFresh();
  await clearKakaoConfirmedPendingWrite(env,householdId,userId,pending);
}

async function handleKakaoSeparatePurchase(env, context) {
  const { command, household, user, kakaoUserKey, payload } = context;
  if (command.action === "invalid") return kakaoText("별도 구매는 ‘별도 구매 추가 커피 4500원’처럼 먼저 후보를 확인해 주세요. 확인 식별자가 없는 ‘예’나 ‘확인’으로는 저장하지 않습니다.");
  const groupKey = getKakaoBotGroupKey(payload);
  const scope = {household_id:String(household.id), user_id:String(user.id), conversation_scope:groupKey || "direct"};
  const run = async (lifecycleFresh) => withHouseholdDatabaseLease(env,household.id,async ({assertFresh:householdFresh}) =>
    withSettingsRmwLease(env,kakaoWriteLeaseKey(household.id,user.id),async ({assertFresh:writerFresh}) => {
      const assertFresh = () => {lifecycleFresh();householdFresh();writerFresh();};
      env.__AB_REQUEST_USER_ROWS?.delete(String(user.id));
      if (!(await kakaoClaimUserUnmerged(env,user.id))) throw new Error("separate_identity_changed");
      const current = (await fetchUserHouseholds(env,user.id)).find(row => String(row.id) === String(household.id));
      if (!current || !canWriteMyHousehold(current.role)) throw new Error("separate_permission_changed");
      if (groupKey) {
        const linked = await getLinkedKakaoGroupHousehold(env,groupKey,{roomLeaseHeld:true});
        if (linked?.id !== household.id) throw new Error("separate_room_changed");
      } else if (await getKakaoSelectedHouseholdId(env,user.id) !== household.id) throw new Error("separate_household_changed");
      const key = await kakaoSeparateStateKey(household.id,user.id,scope.conversation_scope);
      let state = await parseKakaoSeparateState(await getSettingValueStrict(env,key),scope);
      if (command.action !== "prepare" && (!state || state.confirmation_id !== command.token)) return kakaoText("이 확인은 현재 사용자·방·가계부의 후보와 맞지 않거나 오래된 확인입니다. 새 기록은 저장하지 않았어요.");
      if (state && ["submitting","unknown"].includes(state.state)) {
        const found = await findTransactionForRequest(env,state.row);
        if (found && sameTransactionCore(found,state.row)) {
          state.state="confirmed";
          await saveKakaoSeparateState(env,key,state,assertFresh);
          return kakaoText("별도 구매 한 건의 저장을 확인했어요. 같은 확인으로 다시 추가하지 않습니다.");
        }
        return kakaoText("기존 확인의 저장 결과가 아직 불명확합니다. 새 후보나 기록은 만들지 않았어요. 잠시 뒤 같은 확인 명령으로 결과를 다시 조회해 주세요.");
      }
      if (command.action === "confirm" && state.state === "confirmed") return kakaoText("이미 처리한 별도 구매 확인입니다. 다시 추가하지 않았어요. 기록 목록에서 확인해 주세요.");
      if (command.action === "status") {
        const recordCommand=`${state.row.transaction_date} 기록`; // V22.9.72: 짧은 명령 형식(두 형식 모두 날짜 목록으로 읽힌다)
        const description=state.state === "confirmed" ? "이미 저장을 확인한 별도 구매입니다." : state.state === "candidate" ? "아직 추가하지 않은 별도 구매 후보입니다." : "취소·만료 또는 저장이 거절된 후보입니다.";
        return kakaoText(`${description}\n${state.row.transaction_date} · ${state.row.memo||state.row.category} · ${numberWithCommas(state.row.amount)}원\n‘${recordCommand}’로 해당 날짜의 기록 목록을 확인해 주세요. 목록만으로 이번 요청의 실패를 단정하지 않습니다.`,groupKey?null:[["해당 날짜 기록",recordCommand]]);
      }
      if (command.action !== "prepare" && (state.expires_at <= Date.now() || state.state === "cancelled")) return kakaoText("취소되었거나 만료된 확인입니다. 새 기록은 저장하지 않았어요.");
      if (command.action === "cancel") {
        state.state="cancelled";
        await saveKakaoSeparateState(env,key,state,assertFresh);
        return kakaoText("별도 구매 추가를 취소했어요. 새 기록은 저장하지 않았어요.");
      }
      await recoverKakaoPendingForSeparate(env,household.id,user.id,assertFresh);
      if (command.action === "prepare") {
        const parsed = parseMultipleTransactions(command.text,payload);
        if (parsed.length !== 1 || parsed.blocked || !isStrongKakaoTransactionInput(command.text,parsed)) return kakaoText("별도 구매 후보는 날짜·내용·금액이 분명한 한 건으로 보내 주세요. 아직 저장하지 않았어요.");
        const inflightKey=`${String(kakaoUserKey).slice(0,80)}|${stableShortHash(scope.conversation_scope)}|${stableShortHash(normalizeText(stripLeadingCommand(command.text)))}`;
        if (AB_KAKAO_INFLIGHT.has(inflightKey)) throw kakaoUnknownWriteError();
        const settings=await fetchKakaoInputSettings(env,household.id,user.id);
        const [candidate]=applyUserSettingsToParsedTransactions(parsed,settings.customCategoryRows,settings.paymentAssetRows);
        if (!Number.isSafeInteger(candidate.amount) || candidate.amount <= 0 || candidate.amount > MAX_TRANSACTION_AMOUNT) return kakaoText("금액을 확인해 주세요. 새 기록은 저장하지 않았어요.");
        const row={household_id:household.id,user_id:user.id,type:candidate.type,amount:candidate.amount,category:String(candidate.category||"기타").slice(0,80),memo:String(candidate.memo||"").slice(0,160),payment_method:String(candidate.payment_method||"").slice(0,40),transaction_date:candidate.transaction_date,source:"kakao_skill",source_user_key:String(kakaoUserKey).slice(0,160),raw_text:String(candidate.raw_text||command.text).slice(0,300)};
        const params=new URLSearchParams({select:"*",household_id:`eq.${household.id}`,user_id:`eq.${user.id}`,type:`eq.${row.type}`,amount:`eq.${row.amount}`,transaction_date:`eq.${row.transaction_date}`,source:"eq.kakao_skill",order:"created_at.desc",limit:"1000"});
        const originals=await supabase(env,`/rest/v1/transactions?${params}`,{method:"GET"});
        if (!Array.isArray(originals) || originals.length >= 1000) throw new Error("separate_original_read_incomplete");
        const original=originals.find(actual => ["category","memo","payment_method","transaction_date","type"].every(field => String(actual[field]||"")===String(row[field]||"")));
        if (!original) return kakaoText("같은 내용으로 저장된 원래 기록을 확인하지 못했어요. 먼저 기록 목록에서 원래 기록을 확인해 주세요. 이 요청으로 새 기록은 저장하지 않았어요.");
        if (state?.state === "candidate" && state.expires_at > Date.now() && sameTransactionCore(state.row,row)) return kakaoSeparateCandidateReply(state,current,payload);
        row.id=crypto.randomUUID();
        const created=Date.now();
        state={schema_version:1,...scope,confirmation_id:crypto.randomUUID().replace(/-/g,"").slice(0,16),row,original,candidate_digest:await sha256Hex(JSON.stringify([scope,row,original])),created_at:created,expires_at:created+300000,state:"candidate"};
        await saveKakaoSeparateState(env,key,state,assertFresh);
        return kakaoSeparateCandidateReply(state,current,payload);
      }
      const original=await findTransactionForRequest(env,state.original);
      if (!original || !sameTransactionCore(original,state.original)) return kakaoText("후보를 확인한 뒤 원래 기록이 바뀌었거나 삭제되었습니다. 새 기록은 저장하지 않았어요. 후보를 다시 준비해 주세요.");
      const already=await findTransactionForRequest(env,state.row);
      if (already) {
        if (!sameTransactionCore(already,state.row)) throw new Error("separate_id_conflict");
      } else {
        if (state.expires_at <= Date.now()) return kakaoText("확인 유효 시간이 지나 새 기록을 저장하지 않았어요. 후보를 다시 준비해 주세요.");
        state.state="submitting";
        await saveKakaoSeparateState(env,key,state,assertFresh);
        try {
          assertFresh();
          if (state.expires_at <= Date.now()) {
            state.state="cancelled";
            await saveKakaoSeparateState(env,key,state,assertFresh).catch(()=>{});
            return kakaoText("확인 유효 시간이 지나 새 기록을 저장하지 않았어요. 후보를 다시 준비해 주세요.");
          }
          await supabase(env,"/rest/v1/transactions?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(state.row)});
        } catch (error) {
          state.state=isDefiniteStorageFailure(error)?"failed":"unknown";
          await saveKakaoSeparateState(env,key,state,assertFresh).catch(()=>{});
          if (state.state === "failed") return kakaoText("저장소가 요청을 거절해 별도 구매를 추가하지 못했어요. 같은 확인 식별자로만 다시 시도해 주세요.");
        }
        const saved=await findTransactionForRequest(env,state.row);
        if (!saved || !sameTransactionCore(saved,state.row)) return kakaoText("별도 구매의 저장 결과가 아직 불명확합니다. 같은 확인 명령으로 결과를 다시 확인해 주세요.");
      }
      state.state="confirmed";
      await saveKakaoSeparateState(env,key,state,assertFresh);
      return kakaoText(`별도 ${state.row.type === "income" ? "기록" : "구매"} 한 건을 저장했어요.\n${state.row.transaction_date} · ${state.row.memo || state.row.category} · ${numberWithCommas(state.row.amount)}원\n같은 확인으로 다시 추가하지 않습니다.`);
    },{localMutex:false}));
  try {
    return await withKakaoUserLifecycleLease(env,user.id,async ({assertFresh:userFresh}) => groupKey
      ? withKakaoGroupLifecycleLease(env,groupKey,async ({assertFresh:roomFresh})=>run(()=>{userFresh();roomFresh();}))
      : run(userFresh));
  } catch (error) {
    return kakaoText(isUncertainStorageWrite(error) ? "기존 기록의 처리 결과가 불명확하여 별도 구매를 추가하지 않았어요. 원래 기록의 결과를 먼저 확인해 주세요." : "후보·권한·저장 상태를 안전하게 확인하지 못했어요. 새 기록을 다시 만들지 않았습니다. 잠시 뒤 같은 확인 명령으로 상태를 확인해 주세요.");
  }
}
// @build:exports-start
export { handleKakaoSeparatePurchase, parseKakaoSeparatePurchaseCommand };
// @build:exports-end
