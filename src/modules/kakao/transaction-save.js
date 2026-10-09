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
  defaultCategoryKeywordRows, normalizeStoredCategoryList,
} from "../settings/categories-keywords.js";
import {
  applyUserSettingsToParsedTransactions, normalizePaymentAssetList, paymentAssetsKey,
} from "../settings/payment-assets.js";
import {
  memberAliasSettingsKey, normalizeMemberAliasMap,
} from "../data/households-members-rows.js";
import { maskKey } from "../admin/ops-diagnostics-pages.js";
import { kakaoNoMatchGuide } from "./reply-texts.js";
import { kakaoSaveDelayText } from "./intent-nlu.js";
import { isUncertainStorageWrite, kakaoSaveFailedText, kakaoText } from "./response-builders.js";
import {
  dailySeqForKakaoRow, kakaoEditDayPrefixV4, kakaoRowLabel, twoDigitSeq,
} from "./edit-session-v4.js";
import { optionalWithin } from "./request-guards.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function saveKakaoParsedTransactionsReply(env, context = {}) {
  const { household, user, kakaoUserKey, nickname, origin, parsedList, handlerStartedAt, firstNotice = "", utterance = "", assertFresh, onSaved } = context;
  if (!parsedList.length) { const guide = kakaoNoMatchGuide(utterance, origin); return kakaoText(guide.text, guide.quickReplies); }
  const requestedLimit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
  if (parsedList.length > requestedLimit) return kakaoText(`한 번에 ${requestedLimit}건까지 입력할 수 있어요. ${parsedList.length}건 모두 저장하지 않았어요. 내용을 나눠 다시 보내 주세요.`);

  // V22.9.16: 지출자 이름표는 저장 뒤 응답 문구에만 쓰지만, 읽는 데 저장 결과가 필요 없다.
  // 분류·결제수단과 같이 던져 두고 응답을 만들 때 받는다(왕복 한 단계 절감).
  const inputSettingsPromise = fetchKakaoInputSettings(env, household.id, user.id);
  // V22.9.36: 아래 allSettled 가 붙기 전에(sha256 을 기다리는 사이) 거절되면 "처리되지 않은 거절"이 된다. 결과는
  // allSettled 가 그대로 받으므로 여기서는 거절을 표시만 해 둔다.
  inputSettingsPromise.catch(() => {});
  const messageKey = "kakao-message:" + await sha256Hex(JSON.stringify([household.id,user.id,parsedList]));
  const messageLeasePromise = claimOperationLease(env, {key:messageKey,owner:operationLeaseOwner("kakao-message"),leaseSeconds:90});
  let messageLease = null, releasePromise = null;
  try {
  const settled = await Promise.allSettled([inputSettingsPromise,messageLeasePromise]);
  if (settled[1].status === "fulfilled") messageLease = settled[1].value;
  if (settled[0].status === "rejected") throw settled[0].reason;
  if (settled[1].status === "rejected") throw settled[1].reason;
  if (!messageLease.acquired) return kakaoText("같은 내용을 처리 중이에요. 이 요청으로 새 기록을 저장하지 않았어요. 먼저 기록 목록을 확인해 주세요.");
  const {customCategoryRows, paymentAssetRows, aliases: inputAliases, pendingWrite} = settled[0].value;
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
  if (Date.now() - handlerStartedAt >= 3500) return kakaoText("저장 전 준비 조회가 지연되어 이 요청의 기록은 아직 저장하지 않았어요. 잠시 후 다시 보내 주세요.");

  let savedRows = [];
  try { savedRows = await insertKakaoTransactions(env, rowsToInsert, { messageLeaseHeld:true, fingerprint: messageKey, pendingWrite, assertFresh:()=>{assertFresh?.();assertSettingsLeaseFresh(messageLease);}, onConfirmed:()=>{releasePromise=releaseOperationLease(env,messageLease);} }); }
  catch (err) {
    // V22.9.26: 저장소가 분명한 실패(4xx·5xx)를 돌려줬으면 저장된 것이 없다. 그때는 "다시 보내지
    // 말라"가 아니라 다시 보내 달라고 해야 기록이 사라지지 않는다. 응답 없이 끊긴 경우(시간
    // 초과·네트워크)만 저장 여부가 불확실하므로 예전 안내를 유지한다.
    rememberOpsEvent({ kind: "kakao_save_failed", severity: "error", path: "/skill", method: "POST", detail: safeError(err) });
    return kakaoText(isUncertainStorageWrite(err) ? kakaoSaveDelayText(origin) : kakaoSaveFailedText(origin));
  }
  if (!savedRows.length) return kakaoText(kakaoSaveDelayText(origin));
  const newCount = savedRows.filter(row => !row.__duplicate_skipped).length;
  const duplicateCount = savedRows.length - newCount;
  const resultLine = `새로 저장 ${newCount}건 · 중복 저장 안 함 ${duplicateCount}건 · 합계 ${numberWithCommas(savedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}원`;

  let finalizeNotice = "";
  if (onSaved) {
    try { await onSaved(); }
    catch (err) {
      rememberOpsEvent({ kind: "kakao_first_record_finalize_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
      finalizeNotice = "\n\n기록 저장은 완료되었지만 선택 상태 준비가 지연됐어요. ‘가계부 전환’에서 내 개인 가계부를 선택할 수 있어요.";
    }
  }

  if (limitedParsedList.length > 1) {
    // 대량 입력에서 번호 조회를 건별 순차 실행하면 카카오 제한 시간을 넘길 수 있어 저장 결과만 즉시 반환합니다.
    const lines = savedRows.slice(0, 6).map((row) => {
      const memo = row.memo || row.raw_text || row.category || "기록";
      return `${row.transaction_date} · ${row.type === "income" ? "수입" : "지출"} · ${memo} / ${numberWithCommas(row.amount)}원 / ${row.payment_method || "-"}`;
    });
    return kakaoText(`${firstNotice}✅ ${resultLine}\n가계부: ${household.name}\n${lines.join("\n")}\n\n수정할 번호는 ‘오늘 기록 보기’에서 확인해 주세요.${finalizeNotice}`);
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
  const editGuide = seq ? `\n\n수정: "${dayPrefix}수정 ${twoDigitSeq(seq)}번" 또는 "${dayPrefix}수정 ${twoDigitSeq(seq)}번 금액 13000"\n삭제: "${dayPrefix}삭제 ${twoDigitSeq(seq)}번"` : `\n\n수정할 번호는 ‘${dayPrefix || "오늘 "}기록 보기’에서 확인해 주세요.`;
  return kakaoText(`${firstNotice}${icon} ${typeText} ${newCount ? "저장했어요" : "중복 저장 안 함"} 😊\n${resultLine}\n날짜: ${saved.transaction_date}\n가계부: ${household.name}\n${numberedLine}\n지출자: ${payerName}${editGuide}${finalizeNotice}`);
  } finally { if (messageLease?.acquired) await (releasePromise || releaseOperationLease(env,messageLease)); }
}

async function fetchKakaoInputSettings(env, householdId, userId = "") {
  const keys=[categoryKeywordsSettingsKey(householdId),categorySettingsKey(householdId),paymentAssetsKey(householdId),memberAliasSettingsKey(householdId),...(userId ? [kakaoPendingWriteKey(householdId, userId)] : [])];
  const settingsPromise=supabase(env, `/rest/v1/accountbook_settings?key=in.(${keys.map(encodeURIComponent).join(",")})&select=key,value`, {method:"GET"});
  // V22.9.36: 분류 표(accountbook_categories)는 운영 DB 에 없는 선택 표다(/ready 의 unavailable_optional_tables).
  // 웹 경로(fetchCustomCategories)는 표 조회 실패를 설정에 저장된 분류로 대체하지만, V22.9.30 부터 이 함수는
  // 두 조회를 함께 기다리며 실패를 그대로 던졌다. 그래서 운영에서는 카카오 새 기록 저장이 전부 실패했다.
  // 표 조회 실패는 빈 목록으로 보고 설정 저장 분류(keys[1])·기본 분류·키워드만 쓴다. 실패 이유는 인스턴스마다 한 번만 남긴다.
  const categoryPromise=supabase(env, `/rest/v1/accountbook_categories?household_id=eq.${encodeURIComponent(householdId)}&select=id,household_id,name,type,sort_order,created_at&order=sort_order.asc,created_at.asc&limit=300`, {method:"GET"})
    .catch((err) => { if (!globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED) { globalThis.__AB_KAKAO_CATEGORY_TABLE_WARNED = true; rememberOpsEvent({ kind: "kakao_category_table_unavailable", severity: "warn", path: "/skill", method: "GET", detail: safeError(err) }); } return []; });
  const [settings,categories]=await Promise.all([settingsPromise,categoryPromise]);
  if (!Array.isArray(settings)) throw new Error("kakao_input_settings_invalid");
  const values=new Map(settings.map(row=>[row.key,row.value]));
  const map=parseStrictSettingsObject(values.get(keys[0]),"category_keywords");
  const customCategoryRows=[...attachCategoryKeywords(categories,map),...defaultCategoryKeywordRows(map,householdId),...attachCategoryKeywords(normalizeStoredCategoryList(values.get(keys[1]),householdId),map)];
  return {customCategoryRows,paymentAssetRows:normalizePaymentAssetList(values.get(keys[2]),householdId),aliases:normalizeMemberAliasMap(values.get(keys[3])),pendingWrite:keys[4] ? parseKakaoPendingWrite(values.get(keys[4])) : null};
}

const KAKAO_RETRY_DEDUP_SECONDS = 120;

async function dedupeKakaoRowsBeforeInsert(env, cleanRows = []) {
  const existing = [];
  const fresh = [];
  if (!cleanRows.length) return {existing, fresh};
  const first = cleanRows[0];
  if (cleanRows.some(row => row.household_id !== first.household_id || row.user_id !== first.user_id)) throw new Error("kakao_batch_scope_invalid");
  const params = new URLSearchParams({household_id: `eq.${first.household_id}`, user_id: `eq.${first.user_id}`, amount: `in.(${[...new Set(cleanRows.map(row => row.amount))].join(",")})`, created_at: `gte.${new Date(Date.now() - KAKAO_RETRY_DEDUP_SECONDS*1000).toISOString()}`, select: "*", limit: "1000"});
  const candidates = await supabase(env, `/rest/v1/transactions?${params}`, {method:"GET"});
  if (!Array.isArray(candidates) || candidates.length >= 1000) throw new Error("kakao_duplicate_scan_incomplete");
  const norm = value => normalizeText(value || "");
  for (const row of cleanRows) {
    const duplicate = candidates.find(r => r.transaction_date === row.transaction_date && r.type === row.type && Number(r.amount) === Number(row.amount) && ((norm(row.raw_text) && norm(r.raw_text) === norm(row.raw_text)) || (norm(r.category) === norm(row.category) && norm(r.memo) === norm(row.memo) && norm(r.payment_method) === norm(row.payment_method))));
    if (duplicate) existing.push({...duplicate, __duplicate_skipped: true}); else fresh.push(row);
  }
  return { existing, fresh };
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
  const reuse = !!(pending && options.fingerprint && pending.fp === options.fingerprint && Array.isArray(pending.ids) && pending.ids.length === cleanRows.length);
  cleanRows.forEach((row, index) => { row.id = reuse ? String(pending.ids[index]) : crypto.randomUUID(); });

  options.assertFresh?.();
  const { existing, fresh } = await dedupeKakaoRowsBeforeInsert(env, cleanRows);
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
      if (!isUncertainStorageWrite(err)) throw err;
      let found = [];
      try { found = await kakaoRowsByIds(env, fresh[0].household_id, fresh.map((row) => row.id)); } catch (_) { found = null; }
      if (!found || found.length < fresh.length) {
        await writeKakaoPendingWrite(env, cleanRows[0].household_id, cleanRows[0].user_id, { fp: options.fingerprint || "", ids: cleanRows.map((row) => row.id), at: Date.now() }).catch(() => {});
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
  if (reuse) await writeKakaoPendingWrite(env, cleanRows[0].household_id, cleanRows[0].user_id, null).catch(() => {});

  options.onConfirmed?.();
  return [...existing, ...insertedRows];
}

function kakaoPendingWriteKey(householdId, userId) {
  // Lives under a prefix that 02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql already deletes with the household.
  return `kakao_edit_v2254:${householdId}:pending_write:${userId}`;
}

async function writeKakaoPendingWrite(env, householdId, userId, marker) {
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoPendingWriteKey(householdId, userId), value: marker ? JSON.stringify(marker) : "" }),
  });
}

function parseKakaoPendingWrite(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "null") : value;
    if (!parsed || !parsed.fp || !Array.isArray(parsed.ids)) return null;
    if (Date.now() - Number(parsed.at || 0) > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch (_) { return null; }
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
export { KAKAO_RETRY_DEDUP_SECONDS, handleKakaoRecentDebug, saveKakaoParsedTransactionsReply };
// @build:exports-end
