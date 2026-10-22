// @build:imports-start
import {
  boundedRuntimeNumber, rememberDuplicateEvent, rememberOpsEvent,
} from "../runtime/ops-telemetry.js";
import {
  assertSettingsLeaseFresh, claimOperationLease, operationLeaseOwner, parseStrictSettingsObject,
  releaseOperationLease, safeError, withSettingsRmwLease,
} from "../runtime/leases.js";
import { htmlResponse } from "../runtime/http.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import {
  attachCategoryKeywords, categoryKeywordsSettingsKey, categorySettingsKey,
  defaultCategoryKeywordRows, keywordCardClassificationRows, normalizeStoredCategoryList,
} from "../settings/categories-keywords.js";
import {
  applyUserSettingsToParsedTransactions, normalizePaymentAssetList, paymentAssetsKey,
} from "../settings/payment-assets.js";
import {
  memberAliasSettingsKey, normalizeMemberAliasMap,
} from "../data/households-members-rows.js";
import { maskKey } from "../admin/ops-diagnostics-pages.js";
import {
  MEMBER_POLICY_RECORD_ONLY, memberPolicySettingsKey, parseMemberPolicyValue,
} from "../my/access-control.js";
import { kakaoNoMatchGuide } from "./reply-texts.js";
import { kakaoSaveDelayText } from "./intent-nlu.js";
import {
  isDefiniteStorageFailure, isUncertainStorageWrite, kakaoSaveFailedText, kakaoText,
} from "./response-builders.js";
import {
  dailySeqForKakaoRow, kakaoEditDayPrefixV4, kakaoRowLabel, twoDigitSeq,
} from "./edit-session-v4.js";
import { kakaoRecordCheckReply, optionalWithin } from "./request-guards.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import {
  abTransactionRequestId, escapeHtml, numberWithCommas, sameTransactionCore,
} from "../domain/transactions-core.js";
// @build:imports-end

async function saveKakaoParsedTransactionsReply(env, context = {}) {
  const { household, user, kakaoUserKey, nickname, origin, parsedList, handlerStartedAt, canDeferSave = false, firstNotice = "", utterance = "", assertFresh, onSaved } = context;
  // V22.9.77 감사 D-6: 같은 이름의 가계부가 또 있으면 호출부가 역할·만든 날을 붙인 이름을 넘긴다(없으면 이름 그대로).
  const householdLine = String(context.householdLabel || household.name || "가계부");
  if (!parsedList.length) { const guide = kakaoNoMatchGuide(utterance, origin); return kakaoText(guide.text, guide.quickReplies); }
  const requestedLimit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
  if (parsedList.length > requestedLimit) return kakaoText(`한 번에 ${requestedLimit}건까지 입력할 수 있어요. ${parsedList.length}건 모두 저장하지 않았어요. 내용을 나눠 다시 보내 주세요.`);

  // V22.9.16: 지출자 이름표는 저장 뒤 응답 문구에만 쓰지만, 읽는 데 저장 결과가 필요 없다.
  // 분류·결제수단과 같이 던져 두고 응답을 만들 때 받는다(왕복 한 단계 절감).
  const messageKey = "kakao-message:" + await sha256Hex(JSON.stringify([household.id,user.id,parsedList]));
  const messageLeasePromise = claimOperationLease(env, {key:kakaoWriteLeaseKey(household.id, user.id),owner:operationLeaseOwner("kakao-message"),leaseSeconds:90});
  // Read beside the lease claim. A stale pending snapshot cannot overwrite a
  // newer marker: writeKakaoPendingWrite atomically compares its server IDs (or
  // inserts only if absent), and no transaction is sent if that comparison fails.
  const inputSettingsPromise = fetchKakaoInputSettings(env, household.id, user.id);
  // V22.9.36: 아래 allSettled 가 붙기 전에(sha256 을 기다리는 사이) 거절되면 "처리되지 않은 거절"이 된다. 결과는
  // allSettled 가 그대로 받으므로 여기서는 거절을 표시만 해 둔다.
  inputSettingsPromise.catch(() => {});
  let messageLease = null, releasePromise = null;
  try {
  const settled = await Promise.allSettled([inputSettingsPromise,messageLeasePromise]);
  if (settled[1].status === "fulfilled") messageLease = settled[1].value;
  if (settled[0].status === "rejected") throw settled[0].reason;
  if (settled[1].status === "rejected") throw settled[1].reason;
  if (!messageLease.acquired) return kakaoText("같은 내용을 처리 중이에요. 이 요청으로 새 기록을 저장하지 않았어요. 먼저 기록 목록을 확인해 주세요.");
  const {customCategoryRows, paymentAssetRows, aliases: inputAliases, memberPolicy, pendingWrite, pendingWriteExists, pendingWriteEmptyValue} = settled[0].value;
  const aliasesPromise = Promise.resolve(inputAliases);
  const finalParsedList = applyUserSettingsToParsedTransactions(parsedList, customCategoryRows, paymentAssetRows);

  const kakaoBulkLimit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
  const limitedParsedList = finalParsedList.slice(0, kakaoBulkLimit);
  // V22.9.26: 웹 입력·카카오 수정과 같은 상한을 생성 경로에도 둔다. 오타 한 번으로 45조원이
  // 저장되면 월 요약과 예산 사용률 전체가 깨지고 수정 명령으로도 되돌리기 어렵다.
  const tooLarge = limitedParsedList.find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
  if (tooLarge) {
    return kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
  }
  const rowsToInsert = limitedParsedList.map((parsed) => ({
    household_id: household.id, user_id: user.id, type: parsed.type, amount: parsed.amount,
    category: parsed.category, memo: parsed.memo, payment_method: parsed.payment_method,
    transaction_date: parsed.transaction_date, source: "kakao_skill", source_user_key: kakaoUserKey,
    raw_text: parsed.raw_text || utterance,
  }));
  // V22.9.45: waitUntil keeps the same save alive after the 4s response. Bound
  // preparation at 20s, leaving time for the write and lease cleanup; synchronous
  // callers retain the 3.5s gate. Group first-record forwards this via ...context.
  const preparationBudgetMs = canDeferSave ? 20000 : 3500;
  if (Date.now() - handlerStartedAt >= preparationBudgetMs) return kakaoText("저장 전 준비 조회가 지연되어 이 요청의 기록은 아직 저장하지 않았어요. 잠시 후 다시 보내 주세요.");

  let savedRows = [];
  try { savedRows = await insertKakaoTransactions(env, rowsToInsert, { messageLeaseHeld:true, fingerprint: messageKey, pendingWrite, pendingWriteExists, pendingWriteEmptyValue, assertFresh:()=>{assertFresh?.();assertSettingsLeaseFresh(messageLease);}, onConfirmed:(cleanup)=>{releasePromise=Promise.all([cleanup,releaseOperationLease(env,messageLease)]);} }); }
  catch (err) {
    // V22.9.26: 저장소가 분명한 실패(4xx·5xx)를 돌려줬으면 저장된 것이 없다. 그때는 "다시 보내지
    // 말라"가 아니라 다시 보내 달라고 해야 기록이 사라지지 않는다. 응답 없이 끊긴 경우(시간
    // 초과·네트워크)만 저장 여부가 불확실하므로 예전 안내를 유지한다.
    rememberOpsEvent({ kind: "kakao_save_failed", severity: "error", path: "/skill", method: "POST", detail: safeError(err) });
    return isUncertainStorageWrite(err) ? kakaoRecordCheckReply("지금은 저장 확인이 지연되고 있어요. 중복될 수 있으니 같은 내용을 다시 보내지 말고 기다려 주세요.", utterance) : kakaoText(kakaoSaveFailedText(origin));
  }
  if (!savedRows.length) return kakaoText(kakaoSaveDelayText(origin));
  const newCount = savedRows.filter(row => !row.__duplicate_skipped).length;
  const duplicateCount = savedRows.length - newCount;
  // V22.9.76 카카오 감사 5: 수입과 지출을 함께 보내면 "합계"가 둘을 더한 값이었다. 구분별로 나눠 보인다(지출만이면 예전처럼 "합계").
  const totalOf = (type) => savedRows.filter((row) => (row.type === "income" ? "income" : "expense") === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenseTotal = totalOf("expense");
  const incomeTotal = totalOf("income");
  const totalText = incomeTotal && expenseTotal ? `지출 합계 ${numberWithCommas(expenseTotal)}원 · 수입 합계 ${numberWithCommas(incomeTotal)}원`
    : incomeTotal ? `수입 합계 ${numberWithCommas(incomeTotal)}원` : `합계 ${numberWithCommas(expenseTotal)}원`;
  // V22.9.76 카카오 감사 11: 중복으로 건너뛴 기록의 안내를 그 기록의 원래 문장으로 만든다. 수입이면 ‘구매’가 아니라 ‘별도 기록’이다.
  const duplicateRows = savedRows.filter((row) => row.__duplicate_skipped);
  const duplicateExample = String(limitedParsedList[savedRows.findIndex((row) => row.__duplicate_skipped)]?.raw_text || duplicateRows[0]?.raw_text || utterance || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const duplicateNotice = !duplicateCount ? ""
    : duplicateRows.every((row) => row.type === "income") ? `\n따로 들어온 돈이라면 ‘별도 기록 추가 ${duplicateExample}’라고 보내 후보를 확인해 주세요.`
    : `\n서로 다른 구매라면 ‘별도 구매 추가 ${duplicateExample}’라고 원래 기록 문장을 보내 후보를 확인해 주세요.`;
  const resultLine = `새로 저장 ${newCount}건 · 중복 저장 안 함 ${duplicateCount}건 · ${totalText}` + duplicateNotice;

  let finalizeNotice = "";
  if (onSaved) {
    try { await onSaved(); }
    catch (err) {
      rememberOpsEvent({ kind: "kakao_first_record_finalize_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
      finalizeNotice = "\n\n기록 저장은 완료되었지만 선택 상태 준비가 지연됐어요. ‘가계부전환’에서 내 개인 가계부를 선택할 수 있어요.";
    }
  }

  if (limitedParsedList.length > 1) {
    // 대량 입력에서 번호 조회를 건별 순차 실행하면 카카오 제한 시간을 넘길 수 있어 저장 결과만 즉시 반환합니다.
    const lines = savedRows.slice(0, 6).map((row) => {
      const memo = row.memo || row.raw_text || row.category || "기록";
      return `${row.transaction_date} · ${row.type === "income" ? "수입" : "지출"} · ${memo} / ${numberWithCommas(row.amount)}원 / ${row.payment_method || "-"}`;
    });
    const bulkGuide = String(household.role || "").toLowerCase() === "member" && memberPolicy === MEMBER_POLICY_RECORD_ONLY
      ? "구성원 권한: 기록만 · 수정·삭제는 소유자나 관리자에게 요청해 주세요." : "수정할 번호는 ‘오늘기록’에서 확인해 주세요.";
    return kakaoText(`${firstNotice}✅ ${resultLine}\n가계부: ${householdLine}\n${lines.join("\n")}\n\n${bulkGuide}${finalizeNotice}`);
  }

  const parsed = limitedParsedList[0];
  const saved = savedRows[0] || parsed;
  const icon = parsed.type === "income" ? "💰" : "💸";
  const typeText = parsed.type === "income" ? "수입" : "지출";
  const enrichBudgetMs = Math.max(150, Math.min(700, 3900 - (Date.now() - handlerStartedAt)));
  const [seq, aliases] = await Promise.all([
    optionalWithin(dailySeqForKakaoRow(env, household.id, user.id, kakaoUserKey, saved), enrichBudgetMs, 0),
    optionalWithin(aliasesPromise, enrichBudgetMs, {}),
  ]);
  const payerName = aliases?.[user.id] || nickname || "나";
  const numberedLine = seq ? kakaoRowLabel(saved, seq) : `${saved.memo || saved.raw_text || saved.category || "기록"} / ${numberWithCommas(saved.amount)}원 / ${saved.payment_method || "-"} / ${saved.category || typeText}`;
  // T2: 오늘이 아닌 날짜로 저장한 기록은 안내에도 그 날짜를 붙인다. 날짜 없는 "수정 01번"은 오늘의 01번이다.
  const dayPrefix = kakaoEditDayPrefixV4(saved.transaction_date);
  // V22.9.43: 구성원 권한이 ‘기록만’인 구성원에게는 할 수 없는 수정·삭제 명령을 안내하지 않는다.
  const recordOnlyMember = String(household.role || "").toLowerCase() === "member" && memberPolicy === MEMBER_POLICY_RECORD_ONLY;
  const editGuide = recordOnlyMember ? `\n\n구성원 권한: 기록만 · 수정·삭제는 소유자나 관리자에게 요청해 주세요.`
    : seq ? `\n\n수정: "${dayPrefix}수정 ${twoDigitSeq(seq)}번" 또는 "${dayPrefix}수정 ${twoDigitSeq(seq)}번 금액 13000"\n삭제: "${dayPrefix}삭제 ${twoDigitSeq(seq)}번"` : `\n\n수정할 번호는 ‘${dayPrefix || "오늘 "}기록 보기’에서 확인해 주세요.`;
  return kakaoText(`${firstNotice}${icon} ${typeText} ${newCount ? "저장했어요" : "중복 저장 안 함"} 😊\n${resultLine}\n날짜: ${saved.transaction_date}\n가계부: ${householdLine}\n${numberedLine}${parsed.type === "income" ? `\n수입자: ${payerName}` : `\n지출자: ${payerName}`}${editGuide}${finalizeNotice}`);
  } finally { if (messageLease?.acquired) await (releasePromise || releaseOperationLease(env,messageLease)); }
}

async function fetchKakaoInputSettings(env, householdId, userId = "") {
  // V22.9.43: 구성원 권한(기록만/기록·수정)도 같은 한 번의 조회로 읽는다. 저장 안내의 수정·삭제 문구에만 쓰고 저장 자체는 막지 않는다.
  const keys=[categoryKeywordsSettingsKey(householdId),categorySettingsKey(householdId),paymentAssetsKey(householdId),memberAliasSettingsKey(householdId),memberPolicySettingsKey(householdId),...(userId ? [kakaoPendingWriteKey(householdId, userId)] : [])];
  const settingsPromise=supabase(env, `/rest/v1/accountbook_settings?key=in.(${keys.map(encodeURIComponent).join(",")})&select=key,value`, {method:"GET"});
  // V22.9.36: 분류 표(accountbook_categories)는 운영 DB 에 없는 선택 표다(/ready 의 unavailable_optional_tables).
  // 웹 경로(fetchCustomCategories)는 표 조회 실패를 설정에 저장된 분류로 대체하지만, V22.9.30 부터 이 함수는
  // 두 조회를 함께 기다리며 실패를 그대로 던졌다. 그래서 운영에서는 카카오 새 기록 저장이 전부 실패했다.
  // 표 조회 실패는 빈 목록으로 보고 설정 저장 분류(keys[1])·기본 분류·키워드만 쓴다. 실패 이유는 인스턴스마다 한 번만 남긴다.
  const categoryPromise=supabase(env, `/rest/v1/accountbook_categories?household_id=eq.${encodeURIComponent(householdId)}&select=id,household_id,name,type,sort_order,created_at&order=sort_order.asc,created_at.asc&limit=300`, {method:"GET", optionalTable:"accountbook_categories"})
    .catch((err) => { if (!globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED) { globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED = true; rememberOpsEvent({ kind: "kakao_category_table_unavailable", severity: "warn", path: "/skill", method: "GET", detail: safeError(err) }); } return []; });
  const [settings,categories]=await Promise.all([settingsPromise,categoryPromise]);
  if (!Array.isArray(settings)) throw new Error("kakao_input_settings_invalid");
  const values=new Map(settings.map(row=>[row.key,row.value]));
  const map=parseStrictSettingsObject(values.get(keys[0]),"category_keywords");
  const listedCategoryRows=[...attachCategoryKeywords(categories,map),...defaultCategoryKeywordRows(map,householdId),...attachCategoryKeywords(normalizeStoredCategoryList(values.get(keys[1]),householdId),map)];
  // V22.9.76 감사 D-9: 기본 목록에 없는 이름의 키워드 카드(통신·교육/육아·용돈·부수입 등)도 분류에 쓴다. 같은 조회 결과라 DB 왕복은 늘지 않는다.
  const customCategoryRows=[...listedCategoryRows,...keywordCardClassificationRows(map,listedCategoryRows,householdId)];
  let memberPolicy="";
  try { memberPolicy=parseMemberPolicyValue(values.get(keys[4])); } catch (_) {}
  return {customCategoryRows,paymentAssetRows:normalizePaymentAssetList(values.get(keys[2]),householdId),aliases:normalizeMemberAliasMap(values.get(keys[3])),memberPolicy,pendingWrite:keys[5] ? parseKakaoPendingWrite(values.get(keys[5])) : null,pendingWriteExists:!!keys[5] && values.has(keys[5]),pendingWriteEmptyValue:keys[5] ? values.get(keys[5]) : undefined};
}

const KAKAO_RETRY_DEDUP_SECONDS = 120;

function kakaoWriteLeaseKey(householdId, userId) {
  return `kakao-message:writer:${householdId}:${userId}`;
}

function kakaoUnknownWriteError() {
  const error = new Error("kakao_pending_write_unresolved");
  error.uncertain_write = true;
  return error;
}

async function dedupeKakaoRowsBeforeInsert(env, cleanRows = []) {
  const existing = [];
  const fresh = [];
  const resolved = [];
  if (!cleanRows.length) return {existing, fresh, resolved};
  const first = cleanRows[0];
  if (cleanRows.some(row => row.household_id !== first.household_id || row.user_id !== first.user_id)) throw new Error("kakao_batch_scope_invalid");
  const params = new URLSearchParams({household_id: `eq.${first.household_id}`, user_id: `eq.${first.user_id}`, amount: `in.(${[...new Set(cleanRows.map(row => row.amount))].join(",")})`, created_at: `gte.${new Date(Date.now() - KAKAO_RETRY_DEDUP_SECONDS*1000).toISOString()}`, select: "*", limit: "1000"});
  const candidates = await supabase(env, `/rest/v1/transactions?${params}`, {method:"GET"});
  if (!Array.isArray(candidates) || candidates.length >= 1000) throw new Error("kakao_duplicate_scan_incomplete");
  const norm = value => normalizeText(value || "");
  for (const row of cleanRows) {
    const duplicate = candidates.find(r => r.transaction_date === row.transaction_date && r.type === row.type && Number(r.amount) === Number(row.amount) && ((norm(row.raw_text) && norm(r.raw_text) === norm(row.raw_text)) || (norm(r.category) === norm(row.category) && norm(r.memo) === norm(row.memo) && norm(r.payment_method) === norm(row.payment_method))));
    if (duplicate) {const found={...duplicate,__duplicate_skipped:true};existing.push(found);resolved.push(found);} else {fresh.push(row);resolved.push(row);}
  }
  return { existing, fresh, resolved };
}

async function insertKakaoTransactions(env, rows, options = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!options.messageLeaseHeld) {
    const key = "kakao-message:" + await sha256Hex(JSON.stringify(rows));
    return withSettingsRmwLease(env, key, async ({assertFresh}) => insertKakaoTransactions(env, rows, {...options, messageLeaseHeld:true, assertFresh: () => { options.assertFresh?.(); assertFresh(); }}));
  }
  const bulkLimit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
  const originalCount = rows.length;
  if (originalCount > bulkLimit) rememberDuplicateEvent({ kind: "bulk_limited", source: "kakao_skill", detail: `${originalCount} requested, ${bulkLimit} processed`, path: "/skill", method: "POST" });
  rows = rows.slice(0, bulkLimit);
  const cleanRows = rows.map((r) => ({
    household_id: r.household_id,
    user_id: r.user_id,
    type: r.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(r.amount || 0))),
    category: String(r.category || "기타").slice(0, 80),
    memo: String(r.memo || "").slice(0, 160),
    payment_method: String(r.payment_method || "").slice(0, 40),
    transaction_date: /^20\d{2}-\d{2}-\d{2}$/.test(String(r.transaction_date || "")) ? String(r.transaction_date) : formatDate(nowKstDate()),
    source: "kakao_skill",
    source_user_key: String(r.source_user_key || "").slice(0, 160),
    raw_text: String(r.raw_text || "").slice(0, 300),
  })).filter((r) => r.household_id && r.user_id && r.amount > 0);

  if (!cleanRows.length) return [];
  // V22.9.34 proto (B13 Kakao): row ids are chosen here. When the same message (same fingerprint) had an UNKNOWN result
  // before, its ids were parked in a pending marker and are reused now, so a late-landing first write collides on the PK.
  const pending = options.pendingWrite;
  if (pending && pending.fp !== options.fingerprint) {
    const recovered = await kakaoRowsByIds(env, cleanRows[0].household_id, pending.ids);
    if (!pending.rows || recovered.length !== pending.rows.length || !pending.rows.every(expected => recovered.some(actual => actual.id === expected.id && sameTransactionCore(actual, expected)))) throw kakaoUnknownWriteError();
  }
  const replayIds = pending?.replay_ids || pending?.ids;
  const reuse = !!(pending && options.fingerprint && pending.fp === options.fingerprint && Array.isArray(replayIds) && replayIds.length === cleanRows.length);
  cleanRows.forEach((row, index) => { row.id = reuse ? String(replayIds[index]) : crypto.randomUUID(); });
  if (reuse && pending.rows && cleanRows.some(expected => !pending.rows.some(actual => actual.id === expected.id && sameTransactionCore(actual,expected)))) throw kakaoUnknownWriteError();

  options.assertFresh?.();
  // Persist stable IDs before any transaction POST. The duplicate scan is independent
  // and runs in parallel; failure of either prevents the write.
  const initialMarker = kakaoPendingMarker(options.fingerprint || "",cleanRows);
  const [deduped] = await Promise.all([
    dedupeKakaoRowsBeforeInsert(env, cleanRows),
    writeKakaoPendingWrite(env, cleanRows[0].household_id, cleanRows[0].user_id, initialMarker, {exists:!!options.pendingWriteExists,marker:pending,emptyValue:options.pendingWriteEmptyValue}),
  ]);
  const { existing, fresh, resolved } = deduped;
  // A skipped duplicate uses its actual stored ID. Persist that correspondence
  // before a partial write, so failed cleanup never strands unsent UUIDs.
  const finalMarker = kakaoPendingMarker(options.fingerprint || "",resolved);
  if (existing.length) await writeKakaoPendingWrite(env,cleanRows[0].household_id,cleanRows[0].user_id,finalMarker,{exists:true,marker:initialMarker});
  for (const dup of existing) rememberDuplicateEvent({ kind: "duplicate_skipped", source: "kakao_skill", household_id: dup.household_id, user_id: dup.user_id, amount: dup.amount, transaction_date: dup.transaction_date, detail: dup.memo || dup.raw_text || "", path: "/skill", method: "POST" });
  let insertedRows = [];
  if (fresh.length) {
    options.assertFresh?.();
    try {
      const inserted = await supabase(env, "/rest/v1/transactions?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(fresh),
      });
      insertedRows = Array.isArray(inserted) ? inserted : (inserted ? [inserted] : []);
    } catch (err) {
      if (!isUncertainStorageWrite(err)) {
        if (isDefiniteStorageFailure(err)) await clearKakaoConfirmedPendingWrite(env,cleanRows[0].household_id,cleanRows[0].user_id,finalMarker).catch(()=>{});
        throw err;
      }
      let found = [];
      try { found = await kakaoRowsByIds(env, fresh[0].household_id, fresh.map((row) => row.id)); } catch (_) { found = null; }
      if (!found || found.length < fresh.length) {
        throw err;
      }
      insertedRows = found;
    }
    if (insertedRows.length < fresh.length) {
      const got = new Set(insertedRows.map((row) => String(row.id)));
      const missing = fresh.filter((row) => !got.has(String(row.id)));
      const already = await kakaoRowsByIds(env, missing[0].household_id, missing.map((row) => row.id));
      for (const row of already) existing.push({ ...row, __duplicate_skipped: true, __pending_replay: true });
    }
  }
  const actualRows = [...existing, ...insertedRows];
  if (actualRows.length !== cleanRows.length || !fresh.every(expected => actualRows.some(actual => actual.id === expected.id && sameTransactionCore(actual,expected)))) throw kakaoUnknownWriteError();
  const cleanup = clearKakaoConfirmedPendingWrite(env, cleanRows[0].household_id, cleanRows[0].user_id, finalMarker).catch(() => {});
  if (options.onConfirmed) options.onConfirmed(cleanup);
  else await cleanup;
  return [...existing, ...insertedRows];
}

function kakaoPendingWriteKey(householdId, userId) {
  // Lives under a prefix that 02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql already deletes with the household.
  return `kakao_edit_v2254:${householdId}:pending_write:${userId}`;
}

function kakaoPendingMarker(fp, rows) {
  const unique = [...new Map(rows.map(row=>[row.id,row])).values()];
  return {fp,ids:unique.map(row=>row.id),rows:unique.map(({__duplicate_skipped,__pending_replay,...row})=>row),replay_ids:rows.map(row=>row.id),at:Date.now()};
}

async function clearKakaoConfirmedPendingWrite(env, householdId, userId, marker) {
  // Match only this confirmed action's server IDs. Cleanup may overlap lease
  // release, but can never erase a newer action's pending marker. No text goes
  // into this filter, only a server fingerprint and fixed UUIDs.
  const prefix = JSON.stringify({fp:marker.fp,ids:marker.ids}).slice(0,-1) + ",";
  const params = new URLSearchParams({key:`eq.${kakaoPendingWriteKey(householdId,userId)}`,value:`like.${prefix}*`});
  await supabase(env,`/rest/v1/accountbook_settings?${params}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
}

async function writeKakaoPendingWrite(env, householdId, userId, marker, expected = {exists:false}) {
  const key = kakaoPendingWriteKey(householdId,userId), value = JSON.stringify(marker);
  let rows;
  if (!expected.exists) {
    rows = await supabase(env,"/rest/v1/accountbook_settings?on_conflict=key",{
      method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({key,value}),
    });
  } else {
    const prefix = expected.marker ? JSON.stringify({fp:expected.marker.fp,ids:expected.marker.ids}).slice(0,-1)+"," : "";
    const filter = expected.marker ? `like.${prefix}*` : expected.emptyValue == null ? "is.null" : "eq.";
    const params = new URLSearchParams({key:`eq.${key}`,value:filter});
    rows = await supabase(env,`/rest/v1/accountbook_settings?${params}`,{
      method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({value}),
    });
  }
  // An empty result means a newer action won the compare-and-set. Never turn
  // that into a new UUID, a blind upsert, or a transaction POST.
  if (!Array.isArray(rows) || rows.length!==1 || rows[0].key!==key || rows[0].value!==value) throw kakaoUnknownWriteError();
}

function parseKakaoPendingWrite(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "null") : value;
    if (!parsed || typeof parsed.fp !== "string" || !parsed.fp || !Array.isArray(parsed.ids) || !parsed.ids.length || parsed.ids.length > 80 || !parsed.ids.every(id => abTransactionRequestId(id)) || new Set(parsed.ids).size !== parsed.ids.length || !Number.isSafeInteger(parsed.at) || parsed.at < 0) throw new Error("invalid");
    if (parsed.rows && (!Array.isArray(parsed.rows) || parsed.rows.length !== parsed.ids.length || parsed.rows.some((row, index) => row.id !== parsed.ids[index]))) throw new Error("invalid");
    if (parsed.replay_ids && (!Array.isArray(parsed.replay_ids) || parsed.replay_ids.length>80 || !parsed.replay_ids.length || !parsed.replay_ids.every(id=>parsed.ids.includes(id)))) throw new Error("invalid");
    return parsed;
  } catch (_) { throw kakaoUnknownWriteError(); }
}

async function kakaoRowsByIds(env, householdId, ids = []) {
  const params = new URLSearchParams({ select: "*", household_id: `eq.${householdId}`, id: `in.(${ids.join(",")})`, limit: String(ids.length) });
  const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("kakao_reconcile_invalid");
  return rows;
}

async function handleKakaoRecentDebug(request, env, url) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,source_user_key,raw_text,created_at");
  params.set("source", "eq.kakao_skill");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>Kakao Recent</title><style>body{font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;padding:20px}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f1f5f9}code{font-size:12px}</style></head><body><h2>최근 카카오 저장 내역</h2><p>최근 ${rows.length}건 · <a href="/ledger?all=1">기록 전체 보기</a></p><table><thead><tr><th>created</th><th>date</th><th>type</th><th>amount</th><th>category</th><th>memo</th><th>household</th><th>user key(마스킹)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.created_at || "")}</td><td>${escapeHtml(r.transaction_date || "")}</td><td>${escapeHtml(r.type || "")}</td><td>${numberWithCommas(r.amount)}</td><td>${escapeHtml(r.category || "")}</td><td>${escapeHtml(r.memo || r.raw_text || "")}</td><td><code>${escapeHtml(r.household_id || "")}</code></td><td><code>${escapeHtml(maskKey(r.source_user_key || ""))}</code></td></tr>`).join("")}</tbody></table></body></html>`);
}
// @build:exports-start
export {
  KAKAO_RETRY_DEDUP_SECONDS, clearKakaoConfirmedPendingWrite, fetchKakaoInputSettings,
  handleKakaoRecentDebug, kakaoPendingWriteKey, kakaoRowsByIds, kakaoUnknownWriteError,
  kakaoWriteLeaseKey, parseKakaoPendingWrite, saveKakaoParsedTransactionsReply,
};
// @build:exports-end
