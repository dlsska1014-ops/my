// @build:imports-start
import {
  markKakaoNluOutcomeV229148, rememberOpsEvent, scheduleNluOpsPersistence,
} from "../runtime/ops-telemetry.js";
import { deferKakaoAfterReply, isUniqueConstraintError, safeError } from "../runtime/leases.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import {
  fetchPaymentAssets, resolveManualInputClassification,
} from "../settings/payment-assets.js";
import {
  commitImportedTransactionRows, importStorageTextIssue,
} from "../import/flexible-import-parser.js";
import { fetchHouseholdMembers, memberNameMap } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { refundLinkLockedKakaoText, refundLinkLockedReason } from "../domain/refund-links.js";
import { myImportStoredValue, reconcileImportedTransactionIds } from "../my/backup-import.js";
import {
  canChangeMyHouseholdRecords, canManageMyHousehold, canWriteMyHousehold,
  memberRecordOnlyRefusalText, myReturnLocation,
} from "../my/access-control.js";
import {
  isKakaoRequestUniqueConflictV229119, isUncertainStorageWrite, kakaoEditSameTextTextV229119,
  kakaoNextStepReply, kakaoText,
} from "./response-builders.js";
import { KAKAO_EDIT_AMOUNT_V4 } from "./edit-vocabulary.js";
import {
  KAKAO_AUDIT_ACTOR_KIND, clearKakaoEditSessionHintV229126, dailySeqForKakaoRow,
  deleteKakaoRowWithUndoV4, findDailyKakaoRowBySeq, getDailyKakaoRows, getKakaoEditSessionV4,
  getKakaoRowById, getLatestKakaoEditByRequesterV229135, getRecentKakaoOwnedTransactionsV2254,
  hasKakaoEditSessionHint, isKakaoDailyListCommand, isKakaoEditCancelCommand,
  isKakaoEditGuideCommand, isKakaoRowOwnedByRequesterV2254, isKakaoSessionSeqReplyV4,
  isKakaoTransactionSpenderChangeCommand, kakaoActiveSpenderMembers, kakaoEditDayPrefixV4,
  kakaoEditDeleteFailedReplyV229148, kakaoEditDeletedTextV4, kakaoEditGuideText,
  kakaoEditMenuTextV4, kakaoEditRecordLineV4, kakaoEditTargetRejectTextV4,
  kakaoRefundLinkUndoNoteV4, kakaoRestoreRowV4, kakaoRowLabel, kakaoRowOwnerSuffixV229135,
  parseKakaoDeleteCommandV4, parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
  parseKakaoSpenderChoiceValue, readKakaoEditUndoItemsV4, resolveKakaoEditDateV4,
  saveKakaoEditSessionV4, twoDigitSeq, withKakaoEditUndoLeaseV4, writeKakaoEditUndoItemsV4,
} from "./edit-session-v4.js";
import {
  KAKAO_EDIT_DEFAULT_CATEGORIES, MAX_FAILS, MAX_TOTAL_TURNS, buildValuePrompt, compact,
  handleEditMessage, isExactKakaoEditFieldStart, isKakaoAmountAnswer, isKakaoEditNotValue,
  isSessionExpired, josa, kakaoEditComplaintField, kakaoEditTypeValue, startsWithKakaoEditField,
} from "./edit-state-machine.js";
import { kakaoGuardFutureBareDayV229120, optionalWithin } from "./request-guards.js";
import { getKakaoSelectedHouseholdId } from "./household-budget-commands.js";
import { getKakaoBotGroupKey, getLinkedKakaoGroupHousehold } from "./group-links-first-record.js";
import {
  KAKAO_ROLE_CHECK_FAILED_TEXT, readHouseholdRoleOrFailure, roleBlockedMessage,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { parseMultipleTransactions } from "../nlu/transaction-parser.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { extractDate, formatDate, nowKstDate } from "../nlu/date-payment.js";
import { CATEGORY_RULES, LEGACY_CATEGORY_SPLITS } from "../nlu/category-rules.js";
import {
  numberWithCommas, updateTransaction, updateTransactionIfUnchangedV22994,
} from "../domain/transactions-core.js";
// @build:imports-end

// =====================================================================
// V4 Worker 통합 — 위 모듈을 실제 카카오 스킬 라우팅·DB에 연결한다.
// =====================================================================

// V22.9.76 카카오 감사 2: 수입·지출 분류 이름표. 다른 구분의 분류를 고르면 반영하지 않는다. 번들의 위쪽 순서와
// 상관없도록 처음 쓸 때 만든다. 사용자 분류는 같은 구분이면 이름이 겹쳐도 받는다(예: 지출 분류 "용돈").
let kakaoEditCategoryTypeSetsCacheV4 = null;
function kakaoEditCategoryTypeSetsV4() {
  if (kakaoEditCategoryTypeSetsCacheV4) return kakaoEditCategoryTypeSetsCacheV4;
  const income = new Set([...CATEGORY_RULES.filter((rule) => rule.type === "income").map((rule) => rule.name), "기타수입", "상여/보너스", "용돈수입", "월급", "상여/성과급", "부수입"]);
  const expense = new Set([...CATEGORY_RULES.filter((rule) => rule.type === "expense").map((rule) => rule.name), ...Object.keys(LEGACY_CATEGORY_SPLITS), "식비", "가족/용돈", "건강", "기타지출"].filter((name) => !income.has(name)));
  kakaoEditCategoryTypeSetsCacheV4 = { income, expense };
  return kakaoEditCategoryTypeSetsCacheV4;
}

// 고른 분류가 기록과 다른 구분의 분류면 그 구분("income"|"expense"), 아니면 "". "기타"와 모르는 이름은 받는다.
function kakaoEditCategoryConflictV4(name = "", rowType = "expense", config = {}) {
  const value = String(name || "").trim();
  if (!value || value === "기타") return "";
  const own = rowType === "income" ? "income" : "expense";
  const other = own === "income" ? "expense" : "income";
  if (safeArray(config.customCategoryTypes?.[own]).includes(value)) return "";
  if (safeArray(config.customCategoryTypes?.[other]).includes(value)) return other;
  const sets = kakaoEditCategoryTypeSetsV4();
  if (sets[own].has(value)) return "";
  return sets[other].has(value) ? other : "";
}

// V22.9.77 감사 K-4: 이 이름이 그 구분의 분류인지(사용자 분류 포함). 구분을 바꿀 때 지금 분류를 그대로 둘 수 있는지 본다.
function kakaoEditCategoryKnownForTypeV4(name = "", type = "expense", config = {}) {
  const own = type === "income" ? "income" : "expense";
  if (safeArray(config.customCategoryTypes?.[own]).includes(name)) return true;
  return kakaoEditCategoryTypeSetsV4()[own].has(name);
}

// V22.9.77 감사 K-4: 구분을 바꾸면 분류도 새 구분의 분류여야 요약·예산이 맞는다. 새 기록과 같은 분류기(사용자 분류·키워드 →
// 기본 규칙)로 메모와 원문을 다시 읽는다. 기본값(기타수입·기타지출)밖에 못 찾았을 때, 지금 분류가 새 구분에도 있는 이름이면
// (사용자 분류 포함) 그대로 두고, 아니면 그 구분의 기본 분류다. 분류기를 읽지 못해도 기본 분류로 바꾼다(다른 구분의 분류를 남기지 않는다).
// V22.9.81 U-10: 원문에서 저절로 채운 메모(원문을 다시 읽은 메모와 같다)는 근거에 다시 넣지 않는다(T-18 의 저장 때 분류와 같다 — manual_memo: false).
// 예전에는 ‘용돈 9000 농협체크’를 지출로 바꾸면 메모 ‘용돈 농협’의 ‘농협’이 장보기를 정했다(같은 문장의 새 지출은 기타지출). 직접 고친 메모와
// 원문이 없는 기록의 메모는 예전처럼 넣는다.
async function kakaoEditTypeChangeCategoryV4(env, householdId = "", row = {}, toType = "expense", config = {}) {
  const fallback = toType === "income" ? "기타수입" : "기타지출";
  let found = "";
  try {
    const rawText = String(row.raw_text || ""), memo = String(row.memo || "");
    const autoMemo = rawText.trim() !== "" && parseMultipleTransactions(rawText, {}).some((parsed) => String(parsed?.memo || "").slice(0, 160) === memo);
    const classified = await resolveManualInputClassification(env, householdId, toType, { raw_text: rawText, memo, ...(autoMemo ? { manual_memo: false } : {}) });
    found = String(classified?.category || "").trim();
  } catch (_) {}
  if (found && found !== fallback) return found.slice(0, 80);
  const current = String(row.category || "").trim();
  if (current && !["기타", "기타수입", "기타지출"].includes(current) && kakaoEditCategoryKnownForTypeV4(current, toType, config)) return current;
  return fallback;
}

// 4장: config 주입 — 이 가계부의 실데이터가 값 옵션이자 검증 규칙이다.
// V22.9.76: 분류 목록은 기록의 구분(rowType)에 맞는 사용자 분류만, 없으면 그 구분의 표준 분류다.
async function buildKakaoEditConfigV4(env, householdId = "", rowType = "expense") {
  const [members, paymentAssets, categoryRows] = await Promise.all([
    fetchHouseholdMembers(env, householdId).catch(() => []),
    fetchPaymentAssets(env, householdId).catch(() => []),
    fetchCustomCategories(env, householdId).catch(() => []),
  ]);
  // V22.9.79 감사 N-4: 지출자 고르기의 이름도 저장 답장·웹 지출자 목록·요약·정산과 같은 규칙(memberNameMap — 같은 이름이면 참여 순서
  // 번호 ‘이름 1’·‘이름 2’)이다. 예전에는 같은 이름의 둘째부터 ‘이름·2’를 붙여, 저장 답장의 ‘카카오사용자 2’와 다른 이름으로 보였다.
  // 번호는 명단 전체(조회 전용·승인 대기 포함)로 매기고 고르는 목록에는 지출자가 될 수 있는 사람만 둔다(웹 renderSpenderOptions 와 같다).
  const personNames = memberNameMap(members);
  // V22.9.135 N-2: 다른 사람의 기록을 고친 답에 그 기록의 지출자 이름을 붙일 때도 같은 이름표를 쓴다(읽기는 그대로 한 번).
  const memberOptions = kakaoActiveSpenderMembers(members).slice(0, 20).map((m) => ({
    label: String(personNames[m.user_id] || m.nickname || "구성원").trim().slice(0, 30) || "구성원",
    user_id: m.user_id,
  }));
  const methods = [];
  for (const asset of safeArray(paymentAssets)) {
    const name = String(asset?.name || "").trim().slice(0, 20);
    if (name && !methods.includes(name)) methods.push(name);
    if (methods.length >= 10) break;
  }
  const categoriesByType = { expense: [], income: [] };
  const customCategoryTypes = { expense: [], income: [] };
  for (const categoryRow of safeArray(categoryRows)) {
    const name = String(categoryRow?.name || "").trim();
    const type = categoryRow?.type === "income" ? "income" : "expense";
    if (!name) continue;
    if (!customCategoryTypes[type].includes(name)) customCategoryTypes[type].push(name);
    if (!categoriesByType[type].includes(name) && categoriesByType[type].length < 12) categoriesByType[type].push(name);
  }
  for (const type of ["expense", "income"]) {
    const categories = categoriesByType[type];
    if (!categories.length) { categories.push(...KAKAO_EDIT_DEFAULT_CATEGORIES[type]); continue; }
    if (!categories.includes("기타")) {
      if (categories.length >= 12) categories.pop();
      categories.push("기타");
    }
  }
  const type = rowType === "income" ? "income" : "expense";
  return {
    members: memberOptions.map((m) => m.label),
    memberOptions,
    personNames,
    methods,
    rowType: type,
    categories: categoriesByType[type],
    categoriesByType,
    customCategoryTypes,
  };
}

// 6장: 미인식 입력 텔레메트리 — 실패해도 응답 흐름을 막지 않는다.
async function logKakaoEditTelemetryV4(env, payload = {}, entry = {}) {
  try {
    const type = ["unrecognized", "unrecognized_final", "duplicate_reply_guard", "restore_error"].includes(entry.type) ? entry.type : "unrecognized";
    const attempt = Math.max(0, Math.min(3, Math.trunc(Number(entry.attempt) || 0)));
    scheduleNluOpsPersistence(null, env, {
      intent: "EDIT", result: "error", reason: `edit_${type}:attempt_${attempt}`,
    });
  } catch (err) {}
}

// V22.9.126 FC-19(2차 검토): 정리 쓰기가 실패하면 세션이 5분 동안 살아 있어 다음 숫자 말(‘5000’)이 같은 기록을 또 고친다. 한 번 더 써 보고,
// 그래도 실패하면 그 오류를 돌려준다(답은 부르는 곳이 정한다).
async function closeKakaoEditSessionV229126(env, kakaoUserKey, payload) {
  try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); return null; } catch (_) {}
  try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); return null; } catch (err) { return err; }
}

// V22.9.126 FC-19(3·4차 검토): 정리에 실패해 남은 세션은 만료(5분)까지 숫자·짧은 말과 칸 이름으로 시작하는 기록 문장(‘메모지 2000원’)을 그 기록의 답으로
// 받아 새 기록은 5분 뒤로 권한다. 번호는 적지 않는다(창을 열 때의 번호라 날짜를 고치거나 앞 기록을 지우면 다른 기록을 가리킨다).
const KAKAO_EDIT_CLOSE_FAILED_LINE_V229126 = "⚠️ 5분 안에 숫자나 짧은 말을 보내면 수정 창에 열려 있던 기록이 바뀌거나 지워질 수 있어요(수정 창을 닫지 못했어요). 새 기록은 5분 뒤에 ‘커피 4500원’처럼 내용과 금액을 함께 보내 주세요.";
// V22.9.126 FC-19(4차 검토): 창의 기록이 지워졌거나 없으면 숫자·짧은 말은 저장되지 않고 ‘찾지 못했어요’ 를 받으며, ‘복구’ 는 창을 비켜 같은 id 로
// 되살려 창이 다시 그 기록을 고친다.
const KAKAO_EDIT_CLOSE_FAILED_GONE_LINE_V229126 = "⚠️ 5분 안에 이 기록을 되살린 뒤 숫자나 짧은 말을 보내면 그 기록이 바뀌거나 지워질 수 있어요(수정 창을 닫지 못했어요). 새 기록은 5분 뒤에 ‘커피 4500원’처럼 내용과 금액을 함께 보내 주세요.";
function kakaoEditCloseFailedLineV229126(stored, { goneEntryId = "", blockedHouseholdId = "" } = {}) {
  if (!stored?.entryNo || isSessionExpired(stored, Date.now())) return "";
  if (blockedHouseholdId && String(stored.householdId) === String(blockedHouseholdId)) return "";
  return goneEntryId && String(stored.entryId) === String(goneEntryId) ? KAKAO_EDIT_CLOSE_FAILED_GONE_LINE_V229126 : KAKAO_EDIT_CLOSE_FAILED_LINE_V229126;
}

// V22.9.148(Codex 6차 검토 — V148:C-64): 기록 줄(kakaoRowLabel·kakaoEditRecordLineV4 — 사용자가 정한 메모·결제수단·분류)이 든 답은 만든 곳이 관제 결과를
// 적는다(runtime/ops-telemetry.js markKakaoNluOutcomeV229148). 웹에서 고친 메모·분류에는 줄 바꿈이 들 수 있어(admin/transactions-households.js — 앞뒤 공백만
// 뺀다) 답 글을 줄마다 읽던 관제가 메모의 앞 줄(‘서버 오류 수리’)을 봇 말로 읽어 삭제 성공을 오류로 셌다. 적는 결과(kind)는 그 답을 중립 기록으로 만들어
// 관제가 글로 읽은 결과와 같다 — 검사가 기록 줄을 내는 곳마다 실제 바로답과 함께 대조한다. 답 글은 그대로다. 세션 답은 sendKakaoEditReplyV4 의 nlu 로 넘긴다.
function kakaoEditRowReplyV229148(env, kind, text, quickReplies = null) {
  markKakaoNluOutcomeV229148(env, kind, text);
  return kakaoText(text, quickReplies);
}

// 5-2장: 최후 방어선 — 수정 플로우의 모든 응답은 예외 없이 이 함수로만 전송한다.
// 직전 봇 메시지와 동일하면 루프를 끊고 흔적(duplicate_reply_guard)을 남긴다.
// nlu: 기록 줄이 든 답의 관제 결과(위 kakaoEditRowReplyV229148). 같은 답이 거듭돼 다른 답으로 바뀌면 그 표시는 쓰이지 않는다(첫 줄이 없어진다).
async function sendKakaoEditReplyV4(env, ctx, session, reply, nextSession, { gone = false, blocked = false, userCancel = false, nlu = "" } = {}) {
  const { kakaoUserKey, payload } = ctx;
  if (nlu) markKakaoNluOutcomeV229148(env, nlu, reply);
  let finalReply = String(reply || "");
  let finalNext = nextSession || null;
  if (session && finalReply && finalReply === String(session.lastBotMsg || "")) {
    const guard = (Number(session.guardCount) || 0) + 1;
    if (guard >= 2) {
      // 가드조차 2회면 세션을 강제 폐기하고 탈출 안내
      finalReply = `😅 응답이 반복되어 ${session.entryNo}번 수정을 종료했어요.\n` +
        `다시 하려면: 수정 ${session.entryNo}번 ${session.rowType === "income" ? "수입자" : "지출자"} 엄마`;
      finalNext = null;
    } else {
      finalReply += `\n(같은 안내가 반복됐어요 — '취소'로 나가거나 '도움말'을 보내주세요)`;
      if (finalNext) finalNext.guardCount = guard;
    }
    await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: session.entryNo, type: "duplicate_reply_guard" });
  }
  if (finalNext) {
    finalNext.lastBotMsg = finalReply;
    finalNext.guardCount = Number(finalNext.guardCount) || 0;
  }
  // V22.9.126 FC-19: 끝내는 답의 세션 정리가 두 번 다 실패하면 오류 답 대신 그 답(바꾼 결과, 바꾸지 않은 이유)에 남은 세션의 위험을 한 줄 붙인다.
  // 오류 답이면 이미 바뀐 기록을 다시 고치게 되거나 이유가 사라진다. 사용자가 끝내 달라고 한 ‘취소’ 만 오류로 끝낸다 — 닫는 것이 그 말의 일이다.
  // 3차 검토: 이 요청이 읽은 저장 세션(ctx.stored, 만료된 것 포함)이 없으면 닫을 것이 없어 쓰지 않는다. 세션을 이어 가는 답은 예전처럼 저장 실패가 오류다(I6).
  if (!finalNext) {
    if (ctx.stored === null) { clearKakaoEditSessionHintV229126(kakaoUserKey, payload); return kakaoText(finalReply); }
    const closeError = await closeKakaoEditSessionV229126(env, kakaoUserKey, payload);
    const line = closeError ? kakaoEditCloseFailedLineV229126(ctx.stored, { goneEntryId: gone ? session?.entryId : "", blockedHouseholdId: blocked ? session?.householdId : "" }) : "";
    if (line && userCancel) throw closeError;
    return kakaoText(line ? `${finalReply}\n${line}` : finalReply);
  }
  await saveKakaoEditSessionV4(env, kakaoUserKey, payload, finalNext); // I6: 전송과 원자적 쌍
  return kakaoText(finalReply, finalNext.step === "choose_record_or_edit" ? [["선택한 기록 보기"], ["취소"]] : null);
}

// 필드 → transactions 컬럼 반영. DB 검증(구성원 존재 등)은 여기서 최종 수행한다.
async function applyKakaoEditFieldV4(env, { session, field, value, config, kakaoUserKey, moduleReply, role = "", sessionStored = false, holdWrite = false }) {
  const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
  if (!row) {
    return { reply: `수정하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘기록’로 번호를 다시 확인해 주세요.`, nextSession: null, gone: true };
  }
  const patch = {};
  let reply = moduleReply;
  if (field === "amount") {
    const amount = Number(String(value).replace(/[^\d]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        reply: `⚠️ 금액은 1 이상의 숫자로 보내주세요. 예: 13000`,
        nextSession: { ...session, step: "awaiting_value", field: "amount", valueOptions: null, updatedAt: Date.now() },
      };
    }
    // N3·T11: 새 기록·웹 수정과 같은 20억 상한. 넘으면 바꾸지 않고 다시 묻는다.
    if (amount > MAX_TRANSACTION_AMOUNT) {
      return {
        reply: `⚠️ 금액이 너무 커서 바꾸지 않았어요.\n입력 금액: ${numberWithCommas(amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 다시 보내 주세요.`,
        nextSession: { ...session, step: "awaiting_value", field: "amount", valueOptions: null, updatedAt: Date.now() },
      };
    }
    patch.amount = amount;
  } else if (field === "category") {
    // V22.9.76 카카오 감사 2: 다른 구분의 분류("수정 01번 분류 급여"를 지출 기록에)는 반영하지 않고 같은 구분 목록에서 다시 고르게 한다.
    const rowType = row.type === "income" ? "income" : "expense";
    const conflict = kakaoEditCategoryConflictV4(value, rowType, config);
    if (conflict) {
      const typeText = rowType === "income" ? "수입" : "지출";
      const options = safeArray(config.categoriesByType?.[rowType]).length ? safeArray(config.categoriesByType[rowType]) : [...KAKAO_EDIT_DEFAULT_CATEGORIES[rowType]];
      const head = `⚠️ ‘${String(value).trim()}’ 분류는 ${conflict === "income" ? "수입" : "지출"} 분류라서 ${typeText} 기록에 넣지 않았어요. 기록은 그대로예요.`;
      const count = (Number(session.repeatCount) || 0) + 1;
      if (count >= MAX_FAILS) {
        return { log: { type: "unrecognized_final", entryNo: session.entryNo, input: String(value) }, reply: `${head}\n${typeText} 분류로 한 줄로 보내면 바로 돼요:\n👉 수정 ${session.entryNo}번 분류 ${options[0]}`, nextSession: null };
      }
      return {
        log: { type: "unrecognized", entryNo: session.entryNo, input: String(value), attempt: count },
        reply: `${head}\n${typeText} 분류를 번호로 골라 주세요.\n${options.map((name, i) => `${i + 1}. ${name}`).join("  ")}`,
        nextSession: { ...session, rowType, step: "awaiting_value", field: "category", valueOptions: options, pendingField: null, pendingValue: null, repeatCount: count, updatedAt: Date.now() },
      };
    }
    patch.category = String(value).slice(0, 80);
  } else if (field === "method") {
    patch.payment_method = String(value).slice(0, 80);
  } else if (field === "content") {
    patch.memo = String(value).slice(0, 160);
  } else if (field === "type") {
    // V22.9.77 감사 K-4: 수입↔지출 구분 바꾸기. 예전에는 지우고 다시 기록해야 했다. 금액은 그대로(양수)이고, 분류는 새 구분에
    // 맞게 다시 정해 요약·예산이 새 구분으로 센다. 세션을 연 뒤 웹에서 이미 바뀌었으면 아무것도 바꾸지 않는다.
    const word = kakaoEditTypeValue(String(value || ""));
    const fromType = row.type === "income" ? "income" : "expense";
    const fromWord = fromType === "income" ? "수입" : "지출";
    if (!word) {
      return { reply: `⚠️ 구분은 ‘수입’이나 ‘지출’로 보내 주세요. 기록은 그대로예요.\n예: 수정 ${session.entryNo}번 구분 ${fromType === "income" ? "지출" : "수입"}`, nextSession: null };
    }
    const toType = word === "수입" ? "income" : "expense";
    if (toType === fromType) {
      return { reply: `${session.entryNo}번은 이미 ${fromWord} 기록이에요. 바꾸지 않았어요.\n${kakaoEditRecordLineV4(row)}`, nextSession: null, nlu: "handled" };
    }
    patch.type = toType;
    patch.category = await kakaoEditTypeChangeCategoryV4(env, session.householdId, row, toType, config);
    const before = String(row.category || "").trim() || "-";
    reply = [
      `✅ ${session.entryNo}번 구분을 ${fromWord} → ${word}${josa(word, "으로로")} 바꿨어요.`,
      before === patch.category ? `분류: ${patch.category}(그대로)` : `분류: ${before} → ${patch.category}`,
    ].join("\n");
  } else if (field === "date") {
    // N4·D5: 풀리지 않는 날짜를 오늘로 바꾸지 않는다. 기록은 그대로 두고 다시 묻는다.
    const date = resolveKakaoEditDateV4(value);
    if (!date) {
      const count = (Number(session.repeatCount) || 0) + 1;
      if (count >= MAX_FAILS) {
        return { log: { type: "unrecognized_final", entryNo: session.entryNo, input: String(value) }, reply: `😅 날짜를 알아듣지 못해 ${session.entryNo}번 수정을 끝냈어요. 기록은 그대로예요.\n이렇게 보내면 바로 돼요:\n👉 수정 ${session.entryNo}번 날짜 7월 20일`, nextSession: null };
      }
      return {
        log: { type: "unrecognized", entryNo: session.entryNo, input: String(value), attempt: count },
        reply: `⚠️ '${value}'${josa(String(value), "을를")} 날짜로 알아듣지 못했어요. 기록은 그대로예요.\n날짜를 번호로 고르거나 직접 입력해 주세요.\n1. 오늘  2. 어제  3. 그제  (직접 입력 예: 7월 20일)`,
        nextSession: { ...session, step: "awaiting_value", field: "date", valueOptions: ["오늘", "어제", "그제"], pendingField: null, pendingValue: null, repeatCount: count, updatedAt: Date.now() },
      };
    }
    // V22.9.126 FC-12: 달 없이 쓴 ‘N일’ 이 아직 오지 않은 날로 풀리면 새 기록과 같은 판정·문장으로 다시 묻는다(예전에는 이번 달 앞날로 옮겼다).
    // 달을 쓴 날짜(‘12월 25일’·‘11/25’)와 ‘내일’ 은 예전처럼 바꾼다.
    const future = kakaoGuardFutureBareDayV229120(String(value || ""), [{ transaction_date: date }], formatDate(nowKstDate()));
    if (future) {
      const ask = kakaoEditFutureBareDayAskV229126(future);
      const count = (Number(session.repeatCount) || 0) + 1;
      if (count >= MAX_FAILS) {
        return { log: { type: "unrecognized_final", entryNo: session.entryNo, input: String(value) }, reply: `😅 ${session.entryNo}번 수정을 끝냈어요. 기록은 그대로예요.\n이렇게 보내면 바로 돼요:\n👉 수정 ${session.entryNo}번 날짜 ${ask.prevMonth}월 ${ask.prevDay}일`, nextSession: null };
      }
      return {
        log: { type: "unrecognized", entryNo: session.entryNo, input: String(value), attempt: count },
        reply: `${ask.text}\n(그만하려면: 취소)`,
        nextSession: { ...session, step: "awaiting_value", field: "date", valueOptions: null, pendingField: null, pendingValue: null, repeatCount: count, updatedAt: Date.now() },
      };
    }
    patch.transaction_date = date;
    reply = `✅ ${session.entryNo}번 날짜를 ${date}${josa(date, "으로로")} 변경했어요.`;
  } else if (field === "payer") {
    // T12: 웹(/my/update)과 같은 규칙 — 지출자는 소유자·관리자만 바꾼다.
    if (!canManageMyHousehold(role)) {
      return { reply: `${row.type === "income" ? "수입자" : "지출자"}는 가계부 소유자·관리자만 바꿀 수 있어요. 기록은 그대로예요.\n금액·분류·결제수단·내용·날짜는 바꿀 수 있어요.`, nextSession: null };
    }
    const options = safeArray(config.memberOptions);
    if (!options.length) {
      return { reply: `변경할 수 있는 구성원이 없어요. 먼저 웹에서 가계부 구성원을 초대해 주세요.`, nextSession: null };
    }
    const hit = options.find((m) => compact(m.label) === compact(String(value)));
    if (!hit) {
      // I2: 실패에는 메뉴 재출력 대신 구체 피드백 + 정확한 다음 행동(숫자 옵션)
      const count = (Number(session.repeatCount) || 0) + 1;
      if (count >= MAX_FAILS) {
        return {
          log: { type: "unrecognized_final", entryNo: session.entryNo, input: String(value) },
          reply:
            `😅 구성원 이름을 찾지 못해 ${session.entryNo}번 수정을 취소했어요.\n` +
            `아래 예시를 그대로 복사해 한 줄로 보내면 바로 돼요:\n` +
            `👉 수정 ${session.entryNo}번 ${row.type === "income" ? "수입자" : "지출자"} ${options[0].label}\n` +
            `👉 수정 ${session.entryNo}번 금액 13000`,
          nextSession: null,
        };
      }
      return {
        log: { type: "unrecognized", entryNo: session.entryNo, input: String(value), attempt: count },
        reply:
          `⚠️ '${value}'${josa(String(value), "을를")} 구성원 목록에서 찾지 못했어요.\n` +
          `번호로 골라주세요.\n${options.map((m, i) => `${i + 1}. ${m.label}`).join("  ")}`,
        nextSession: { ...session, step: "awaiting_value", field: "payer", valueOptions: options.map((m) => m.label), pendingField: null, pendingValue: null, repeatCount: count, updatedAt: Date.now() },
      };
    }
    patch.user_id = hit.user_id;
  } else {
    return { reply: moduleReply, nextSession: null };
  }
  // V22.9.131: 값 확인을 모두 지나 이제 기록을 쓴다. 열린 창에 온 새 기록 꼴의 말이면(holdWrite) 쓰지 않고 돌려보낸다 — 부른 쪽이 두 길 안내로 끝낸다.
  if (holdWrite) return { held: true };
  if ((session.originalAmount != null && Number(row.amount) !== Number(session.originalAmount)) || (session.originalRevision && row.updated_at !== session.originalRevision)) {
    return { reply: "그사이 기록이 바뀌었어요. 현재 거래는 " + kakaoRowLabel(row, session.entryNo) + "입니다. 이 거래를 고치려면 ‘선택한 기록 보기’를 보내 주세요.", nextSession: { ...session, step: "choose_record_or_edit", updatedAt: Date.now() }, nlu: "handled" };
  }
  try {
    // V22.9.104 J-9(Codex 검토 V102): 구성원(소유자·관리자 아님)이 카카오 기록 표시(source_user_key) 없는 기록(웹에서 만든 내 기록 — 지출자로 내 기록을
    // 가린다)을 고칠 때, 위에서 읽은 뒤 관리자가 지출자를 바꾸면 예전에는 조건 없는 감사 RPC 가 이제 남의 기록이 된 행에 저장했다. 이제는 웹 수정과 같은
    // 조건부 저장(바꾸는 칸의 읽은 값 + ‘지출자 = 나’)이고, 0행이면 바꾸지 않고 충돌로 답한다. 감사 한 줄은 답장 뒤로 미룬다(답 전 DB 요청 수는 감사 RPC 때와 같다).
    // 카카오로 쓴 기록(source_user_key 있음)은 지출자가 바뀌어도 쓴 사람의 기록이라(isKakaoRowOwnedByRequesterV2254) 예전 그대로다. 소유자·관리자도 그대로다.
    // V22.9.135 N-2: 구성원도 다른 사람의 기록을 고친다. 조건은 ‘지출자 = 나’ 가 아니라 ‘지출자 = 방금 읽은 사람’(그사이 지출자가 바뀌지 않았다)이다 —
    // 남의 기록이 늘 충돌로 거절되지 않게 하고, 읽은 뒤 바뀐 기록에 덮어쓰지 않는 것은 그대로 둔다.
    if (sessionStored || (!canManageMyHousehold(role) && !String(row.source_user_key || "").trim())) {
      const outcome = await updateTransactionIfUnchangedV22994(env, session.entryId, patch, row, {
        householdId: session.householdId, actorUserId: session.userId, actorKind: KAKAO_AUDIT_ACTOR_KIND, path: "/skill", requireUserId: String(row.user_id || ""), strictExpected: sessionStored,
        auditRunner: (job) => deferKakaoAfterReply(env, job, { cost: 1, critical: true }),
      });
      if (outcome.status === "missing") return { reply: `수정하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘기록’로 번호를 다시 확인해 주세요.`, nextSession: null, gone: true };
      if (outcome.status !== "updated") {
        rememberOpsEvent({ kind: "record_edit_conflict", severity: "info", path: "/skill", method: "POST", detail: outcome.status === "spender_changed" ? "kakao_edit_spender_changed" : "kakao_edit_changed" });
        if (sessionStored && outcome.row) return { reply: "그사이 기록이 바뀌었어요. " + kakaoRowLabel(outcome.row, session.entryNo) + "\n최신 내용을 보려면 ‘선택한 기록 보기’를 눌러 주세요.", nextSession: { ...session, step: "choose_record_or_edit", updatedAt: Date.now() }, nlu: "handled" };
        return { reply: kakaoEditConflictTextV229104(session.entryNo, row, outcome.status), nextSession: null };
      }
    } else {
      // 행은 이미 이 가계부에서 찾았다. householdId 를 넘기면 RPC 전 행 조회 한 번이 빠진다.
      // V22.9.37 감사 NEW-9: 웹 수정처럼 행위자(요청한 사용자)와 종류를 감사 기록에 남긴다. 예전에는 행위자 없는 system 이었다.
      await updateTransaction(env, session.entryId, patch, { householdId: session.householdId, actorUserId: session.userId, actorKind: KAKAO_AUDIT_ACTOR_KIND });
    }
  } catch (err) {
    // T2: 결과를 모르면 다시 보내라고 하지 않는다. 날짜 수정은 번호를 옮겨, 다시 보내면 다른 기록이 바뀐다.
    if (isUncertainStorageWrite(err)) {
      return { reply: `수정 결과를 확인하지 못했어요.\n같은 명령을 다시 보내기 전에 ‘${kakaoEditDayPrefixV4(row.transaction_date) || "오늘 "}기록 보기’로 바뀌었는지 먼저 확인해 주세요.`, nextSession: null };
    }
    // V22.9.119 O-1: 날짜·금액·구분을 바꾸면 그 날짜에 같은 문장·같은 금액의 내 카카오 기록이 둘이 되어 운영 DB 의 유니크 인덱스가 거절했다
    // (‘수정 01번 날짜 어제’ 처럼 전날 같은 문장이 있을 때). 기록은 그대로이고 다시 보내도 같으므로 ‘잠시 후 다시’ 라고 하지 않는다.
    if (isKakaoRequestUniqueConflictV229119(err)) {
      rememberOpsEvent({ kind: "kakao_same_text_exists", severity: "info", path: "/skill", method: "POST", detail: `edit:${field}` });
      return { reply: kakaoEditSameTextTextV229119(session.entryNo, row, patch, { today: env?.__AB_KAKAO_REQUEST?.todayV229120 || "" }), nextSession: null };
    }
    // V22.9.80 T-12: 환불과 연결된 기록은 연결 보호 트리거가 막는다. 다시 보내도 같으므로 이유와 풀 곳을 알린다.
    const lockedReason = refundLinkLockedReason(err);
    if (lockedReason) return { reply: refundLinkLockedKakaoText(session.entryNo, lockedReason), nextSession: null };
    return { reply: `${session.entryNo}번 기록을 바꾸지 못했어요. 기록은 그대로예요.\n잠시 후 다시 보내 주세요.`, nextSession: null };
  }
  // V22.9.135 N-2: 다른 사람의 기록을 고쳤으면 기록 줄 끝에 그 기록의 지출자(수입자) 이름을 붙인다(지출자를 바꾼 답은 이미 그 이름을 말한다).
  const changed = { ...row, ...patch };
  const ownerSuffix = field !== "payer" && String(changed.user_id || "") !== String(session.userId || "") ? kakaoRowOwnerSuffixV229135(changed, config?.personNames) : "";
  return { reply: `${reply}\n${kakaoEditRecordLineV4(changed)}${ownerSuffix}`, nextSession: null, nlu: "handled" };
}

// V22.9.126 FC-12: 새 기록의 ‘future’ 안내(request-guards.js kakaoRecordGuardV229120)와 같은 두 문장. 예시는 고치는 값(날짜)만 적는다 —
// 새 기록 예시(‘… 미용실 30000원’)를 그대로 보내면 고치기가 아니라 새 기록이 된다. 지난달에 없는 날은 그달 마지막 날로 적는다.
function kakaoEditFutureBareDayAskV229126(future = {}) {
  const prevMonth = future.month === 1 ? 12 : future.month - 1;
  const prevDay = Math.min(future.day, new Date(Date.UTC(future.year, future.month - 1, 0)).getUTCDate());
  const text = `‘${future.day}일’이 이번 달 ${future.day}일(${future.month}월 ${future.day}일, 아직 오지 않은 날)로 읽혀서 저장하지 않았어요.\n지난달이면 달을 붙여 다시 보내 주세요.\n${prevMonth}월 ${prevDay}일\n앞으로 낼 돈을 미리 적는 거면 ‘${future.month}월 ${future.day}일’처럼 보내 주세요.`;
  return { prevMonth, prevDay, text };
}

// V22.9.104 J-9: 고치려던 사이 다른 사람이 이 기록을 먼저 바꿨다(지출자 바뀜은 spender_changed). 아무것도 바꾸지 않았다. 답 글에 주소는 넣지 않는다.
// V22.9.135 N-2: 구성원도 다른 사람의 기록을 고치므로 지출자가 바뀐 것은 ‘내 기록이 아니라서’ 가 아니라 그사이 기록이 바뀐 것이다. 지금 기록을 보라고 한다.
function kakaoEditConflictTextV229104(entryNo = "", row = {}, status = "changed") {
  const look = `‘${kakaoEditDayPrefixV4(row.transaction_date) || "오늘 "}기록 보기’로 지금 기록을 확인해 주세요.`;
  if (status === "spender_changed") return `다른 사람이 ${entryNo}번 기록을 먼저 바꿔서 수정하지 않았어요.\n그 사이 ${row.type === "income" ? "수입자" : "지출자"}가 바뀌었어요. ${look}`;
  return `다른 사람이 ${entryNo}번 기록을 먼저 바꿔서 수정하지 않았어요.\n${look}`;
}

// 3장 표: handleEditMessage 반환 action별 Worker 처리. 다른 해석 금지.
async function processKakaoEditResultV4(env, ctx, session, result, config) {
  const { kakaoUserKey, payload } = ctx;
  if (result?.log) {
    await logKakaoEditTelemetryV4(env, payload, {
      userKey: kakaoUserKey,
      entryNo: result.log.entryNo || session.entryNo,
      input: result.log.input || "",
      attempt: result.log.attempt || 0,
      type: result.log.type || "unrecognized",
    });
  }
  let currentRole = "";
  if (["apply", "delete"].includes(String(result?.action || ""))) {
    // V22.9.81 U-4: 역할 조회가 실패하면 ‘현재 권한으로는 수정·삭제할 수 없어요’라고 하지 않는다(권한이 있는 사람에게 없다고 말하고 세션을 닫았다).
    // 확인하지 못했다고 알리고 기록은 바꾸지 않는다. 열려 있던 세션은 그대로 두어 같은 답을 다시 보내면 이어지고, 한 줄 명령은 세션을 새로 열지 않는다.
    if (ctx.sessionStored) {
      const room = getKakaoBotGroupKey(payload);
      const currentId = room ? (await getLinkedKakaoGroupHousehold(env, room))?.id : await getKakaoSelectedHouseholdId(env, session.userId);
      if (currentId !== session.householdId) return sendKakaoEditReplyV4(env, ctx, session, "현재 가계부가 바뀌었어요. 기록을 바꾸지 않았어요. ‘오늘기록’에서 다시 골라 주세요.", null);
    }
    const lookup = await readHouseholdRoleOrFailure(env, session.userId, session.householdId, { path: "/skill" });
    if (lookup.failed) return sendKakaoEditReplyV4(env, ctx, session, KAKAO_ROLE_CHECK_FAILED_TEXT, ctx.sessionStored ? { ...session, updatedAt: Date.now() } : null);
    currentRole = lookup.role;
    // V22.9.126 FC-19(3차 검토): blocked — 이 가계부에서 기록을 바꿀 수 없다고 정해졌다(남은 세션도 바꾸지 못하므로 정리 실패 줄을 붙이지 않는다).
    if (!canWriteMyHousehold(currentRole)) {
      return sendKakaoEditReplyV4(env, ctx, session, "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요. 가계부 관리자에게 권한을 확인한 뒤 ‘오늘기록’부터 다시 시작해 주세요.", null, { blocked: true });
    }
    // V22.9.43: 세션을 연 뒤 소유자가 구성원 권한을 ‘기록만’으로 바꿨어도 반영 직전에 다시 본다.
    const refusal = await kakaoRecordChangeRefusalTextV4(env, { id: session.householdId, name: session.householdName }, currentRole);
    if (refusal) return sendKakaoEditReplyV4(env, ctx, session, refusal, null, { blocked: refusal !== KAKAO_RECORD_CHANGE_POLICY_UNKNOWN_TEXT_V229126 });
  }
  if (result?.action === "apply") {
    const applied = await applyKakaoEditFieldV4(env, { session, field: result.field, value: result.value, config, kakaoUserKey, moduleReply: result.reply, role: currentRole, sessionStored: !!ctx.sessionStored, holdWrite: !!ctx.ambiguousRecord });
    // V22.9.131: 열린 창에 온 새 기록 꼴의 말이 값 확인까지 지나 이 기록을 바꾸게 됐다 — 바꾸지 않고 두 길 안내(ctx.ambiguousRecord)로 끝낸다.
    if (applied.held) return processKakaoEditResultV4(env, { ...ctx, ambiguousRecord: null }, session, ctx.ambiguousRecord(), config);
    if (applied.log) {
      await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: applied.log.entryNo || session.entryNo, input: applied.log.input || "", attempt: applied.log.attempt || 0, type: applied.log.type });
    }
    return sendKakaoEditReplyV4(env, ctx, session, applied.reply, applied.nextSession || null, { gone: !!applied.gone, nlu: applied.nlu });
  }
  if (result?.action === "delete") {
    const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
    if (!row) {
      return sendKakaoEditReplyV4(env, ctx, session, `삭제하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘기록’로 번호를 다시 확인해 주세요.`, null, { gone: true });
    }
    if (ctx.ambiguousRecord) return processKakaoEditResultV4(env, { ...ctx, ambiguousRecord: null }, session, ctx.ambiguousRecord(), config); // V22.9.131: 위와 같다(지우지 않는다)
    const seq = Number(session.entryNo) || 0;
    let deleted = null;
    try {
      deleted = await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: session.householdId, householdName: session.householdName || "", userId: session.userId, role: currentRole }, row, seq);
    } catch (err) {
      const failed = kakaoEditDeleteFailedReplyV229148(err, row, seq); // 관제 결과는 갈래마다(V148:C-73)
      return sendKakaoEditReplyV4(env, ctx, session, failed.reply, null, { nlu: failed.nlu });
    }
    // V22.9.80 T-13: 환불 연결이 함께 풀렸으면(플래그가 켜진 경우만 버퍼에 칸이 있다) 그 사실을 답장에 붙인다.
    // V22.9.135 N-2: 다른 사람의 기록이면 그 기록의 지출자 이름을 붙인다(수정 창이 이미 읽은 이름표 — 읽기가 늘지 않는다).
    const ownerSuffix = String(row.user_id || "") !== String(session.userId || "") ? kakaoRowOwnerSuffixV229135(row, config?.personNames) : "";
    return sendKakaoEditReplyV4(env, ctx, session, kakaoEditDeletedTextV4(row, seq, deleted?.refund_links, ownerSuffix), null, { gone: true, nlu: "handled" });
  }
  // ask_value / confirm / reprompt / cancel — 모듈의 reply와 nextSession을 그대로 따른다.
  return sendKakaoEditReplyV4(env, ctx, session, result?.reply || "", result?.nextSession || null, { userCancel: !!result?.userCancel, nlu: result?.nlu });
}

// V22.9.94 C-1: 열린 수정 세션에 온 ‘5000원 아니야’·‘5000원 아니요’·‘오천원이 아닌데’ 는 바꿀 값도 새 기록도 아니다. 예전에는 금액과
// 낱말이 있는 강한 입력이라 세션을 끝내고 5,000원 지출을 새로 저장했다(직접·방 모두, 고치던 4,500원은 그대로). 금액 하나 뒤에 부정
// 끝맺음만 온 꼴일 때만 이렇게 읽는다. ‘5000원 아니고 6000원’ 처럼 값이 둘인 말과 다른 꼴은 예전 길 그대로다(상태 기계가 다시 묻는다).
// 세션이 없거나 끝난 뒤의 같은 말은 이 판정에 오지 않는다(운영 동작 그대로).
// 끝맺음은 ‘아니다’ 의 말끝만 받는다(아냐·아니라고·아니었어 …). 묻는 말(‘아닌가요’)·조건(‘아니면’)·다른 낱말(‘틀렸어’·‘안 냈어’)은 예전 길이다.
const KAKAO_EDIT_NEGATED_AMOUNT_V22994 = new RegExp(String.raw`^(?:${KAKAO_EDIT_AMOUNT_V4}|[일이삼사오육칠팔구십백천만억]+[십백천만억])\s*(?:이|가|은|는)?\s*(?:아니(?:야|요|오|고|라|에요|예요|에여|예여|지요?|잖아요?|라고요?|라니까요?|거든요?|[었였]어요?)?|아냐|아녜요|아닌데요?|아닙니다|아님)\s*[?？!.~]*$`);

function isKakaoEditNegatedAmountV22994(text = "") {
  return KAKAO_EDIT_NEGATED_AMOUNT_V22994.test(normalizeText(text));
}

// 아무것도 바꾸지 않고 다시 묻는다. 값을 묻던 중이면 그 칸을, 메뉴·확인 단계면 무엇을 바꿀지 묻는다.
// 상태 기계의 실패와 같게 센다(세 번째면 세션을 끝낸다. 대화 턴 상한도 같다).
function kakaoEditNegatedAmountResultV22994(session = {}, utterance = "", config = {}, now = Date.now()) {
  const repeatCount = (Number(session.repeatCount) || 0) + 1;
  const totalTurns = (Number(session.totalTurns) || 0) + 1;
  const log = { type: repeatCount >= MAX_FAILS ? "unrecognized_final" : "unrecognized", entryNo: session.entryNo, input: String(utterance || "").slice(0, 80), attempt: repeatCount };
  if (repeatCount >= MAX_FAILS || totalTurns > MAX_TOTAL_TURNS) {
    return { action: "cancel", log, nextSession: null, reply: `😅 ${session.entryNo}번 수정을 끝냈어요. 기록은 그대로예요.\n다시 하려면 한 줄로 보내 주세요:\n👉 수정 ${session.entryNo}번 금액 13000` };
  }
  const asking = session.step === "awaiting_value" && !!session.field;
  const prompt = asking ? buildValuePrompt(session.field, { ...config, rowType: config.rowType || session.rowType }) : null;
  return {
    action: "reprompt",
    log,
    reply: `⚠️ 아니라고 하셔서 바꾸지 않았어요. 기록은 그대로예요.\n✏️ ${prompt ? prompt.prompt : "무엇을 바꿀까요? 번호(1~8)나 ‘금액 13000’처럼 보내 주세요."}\n(그만하려면: 취소)`,
    nextSession: { ...session, step: asking ? "awaiting_value" : "awaiting_field", ...(prompt ? { valueOptions: prompt.options } : {}), pendingField: null, pendingValue: null, repeatCount, totalTurns, updatedAt: now },
  };
}

// V22.9.131: 열린 수정 창에 온 새 기록 꼴의 말이 이 기록을 바꾸게 되는가 — 상태 기계가 낸 답(result)을 보고 정한다.
//  - 값을 묻거나 다시 묻거나 ‘네/아니오’ 로 확인하는 답은 아무것도 바꾸지 않는다 → 이 판 전 그대로 내보낸다(창도 열려 있다). 독립 검토 3: 3차 수정까지는 이런
//    말에도 두 길 안내를 내고 창을 닫아, 이어 보낸 ‘1번 13000원으로’ 가 01번을 고치고 ‘13000’ 이 새 기록이 됐다(창이 열려 있으면 이 기록의 답으로 다뤄지던 말이다).
//  - 그 기록을 고치거나 지우는 답(apply·delete)이 ‘바꾸게 되는 말’ 의 후보다. 그 답도 값 확인(날짜 풀기·구성원 찾기·분류의 구분·권한)에서 거절되면 이 판 전처럼
//    그 자리에서 다시 묻는다 — 두 길 안내는 값 확인을 모두 지나 기록을 쓰기 직전(applyKakaoEditFieldV4 의 holdWrite)에 낸다.
//  - 분류·결제수단 값에 금액 낱말이 들어 상태 기계가 거절한 답(moneyInValue)은 이 판 전에는 그대로 썼다 — 새 기록 꼴의 말이면 두 길 안내를 낸다.
//  - ‘금액 칸 + 금액 하나’ 뿐인 답은 고치는 말이라 뺀다: 첫 낱말이 금액 칸 이름 그대로(금액·가격·얼마·액수)이거나 거기에 고치는 말이나 칸을 가리키는 말(변경·수정·정정·란·칸·부분)·조사나 끝말
//    (은·만·요·이요·은요·을요·이에요·입니다·이야·으로 … 셋까지 — ‘금액만으로는’)·문장부호가 붙었거나 메뉴 1번(‘1’·‘1번’)이고, 상태 기계가 금액을 고친다고 읽었을 때다.
//    ‘금액만 13000원으로요’·‘금액변경 5만원’·‘금액이요 13000원’·‘1번 13000원으로 좀’ 은 고치는 말, ‘가격표 3000원’·‘금액권 5만원’·‘금액대 5만원’ 은 아니다
//    (독립 검토 1·3 — 처음에는 정규식 하나로 가렸다가 예전에 고쳐지던 답을 막았다. 상태 기계의 답과 닫힌 머리 꼴을 함께 본다).
//    독립 검토 4: 머리 꼴은 받아들이는 목록이다(모르는 낱말은 두 길 안내 — ‘가격표’·‘금액권’ 같은 물건 이름을 걸러 내는 쪽이 아니라 고치는 말을 알아보는 쪽).
//    운영이 고치던 ‘금액좀 13000원’·‘금액다시 13000원’·‘금액란에 13000원’·‘금액인데요 13000원’·‘금액바꿔 13000원’ 을 더 받는다(고치는 말·칸을 가리키는 말 하나,
//    조사·끝말 셋까지, 끝의 기호 넷까지). 목록에 없는 꼴(‘금액만큼’·‘금액이야말로’)은 두 길 안내를 받는다.
const KAKAO_EDIT_AMOUNT_HEAD_V229131 = /^(?:1번?|(?:금액|가격|얼마|액수)(?:다시입력|재입력|변경|수정|정정|고침|고쳐|바꿔|바꿈|다시|틀림|오타|란|칸|부분|쪽|항목|값)?(?:은요|는요|이요|을요|를요|도요|만요|이에요|예요|에요|입니다|이야|인데요|인데|이고요|이구요|이라도|이죠|이지|이나|이랑|부터|에서|에는|으론|해서|에|엔|죠|지|임|좀|요|야|으로|로|은|는|이|가|을|를|만|도){0,3}[^0-9A-Za-z가-힣\s]{0,4})$/;
function kakaoEditRecordWouldChangeV229131(result, utterance = "") {
  if (result?.action !== "apply" && result?.action !== "delete") return false;
  return !(result.action === "apply" && result.field === "amount" && KAKAO_EDIT_AMOUNT_HEAD_V229131.test(normalizeText(utterance).split(" ")[0] || ""));
}

// Keep the selected ID while offering a read-only way back to its editing menu.
// V22.9.141 (독립 검토 1): ‘선택’ 단계(바뀐 기록을 알렸거나 고치는 말인지 모를 말을 받은 뒤)에서 이 창의 답처럼 보이는 말은 창을 닫지 않고 아무것도
// 바꾸지 않는다 — 칸 이름·메뉴 번호로 시작하는 말(‘금액 9000’·‘내용 버스’·‘1번 9000’·‘3번 카드’·‘4’)과 금액 답(‘9000’·‘9000원으로’). 첫 작업본(Codex)은 창을
// 닫고 그 말을 기록 경로로 넘겨, ‘그사이 기록이 바뀌었어요’ 뒤에 다시 보낸 ‘1번 9000’ 이 오늘의 01번(다른 기록)을 고치고 ‘9000’ 이 새 기록이 됐다.
// 번호와 수정·삭제·복구 말이 함께 있는 말(‘수정 01번’·‘삭제 01번’)은 기록을 고르는 명령이라 예전처럼 기록 경로로 넘긴다. ‘수정 02번 금액 13000’ 은 앞 단계
// (stripLeadingCommand)가 ‘02번 금액 13000’ 으로 바꿔 넘기므로, 원문이 ‘수정 NN번’ 이었다는 것을 skill-handler 가 explicitEdit 로 알린다(답의 예문인 한 줄 명령).
// 고치는 말인지 모를 말에 ‘같은 말을 한 번 더 보내면 새 기록’ 이라고 답한 뒤 온 그 말(askedText)도 예전처럼 넘긴다(V22.9.131 R-1 의 두 길).
const KAKAO_EDIT_BARE_AMOUNT_V229141 = new RegExp(String.raw`^${KAKAO_EDIT_AMOUNT_V4}$`);
function kakaoEditAskedTextV229141(utterance = "") {
  return Array.from(normalizeText(utterance)).slice(0, 200).join("");
}
function isKakaoEditChooseAnswerV229141(utterance = "") {
  const text = normalizeText(utterance);
  if (/\d{1,2}\s*번/.test(text) && /(?:수정|삭제|제거|지워|지우기|복구)/.test(text)) return false;
  return isExactKakaoEditFieldStart(text) || isKakaoSessionSeqReplyV4(text) || isKakaoAmountAnswer(text) || KAKAO_EDIT_BARE_AMOUNT_V229141.test(text);
}
function kakaoEditChooseHoldTextV229141(session = {}) {
  const other = session.entryNo === "01" ? "02" : "01";
  return [
    "⚠️ 아무것도 바꾸거나 저장하지 않았어요.",
    `${session.entryNo}번 기록을 고치려면 먼저 ‘선택한 기록 보기’를 보내 주세요. 지금 내용을 다시 보여 드려요.`,
    // ‘…’처럼 보내 주세요 꼴이라야 단톡방 답이 봇 부르기를 넣는다(V22.9.134 의 보낼 말 규칙 — 단톡방의 봇은 불린 말만 받는다).
    `다른 기록은 ‘수정 ${other}번’처럼 보내 주세요.`,
  ].join("\n");
}

function kakaoEditAmbiguousRecordResultV229131(session, utterance, { memoValue = "" } = {}) {
  const said = Array.from(normalizeText(utterance)).slice(0, 40).join("");
  const target = session.originalLabel || (session.entryDate + " " + session.entryNo + "번 기록");
  const newRecord = memoValue ? "새 기록이면 품목과 금액만 보내 주세요. 예: " + memoValue : "새 기록이면 같은 말을 한 번 더 보내 주세요.";
  return {
    action: "reprompt",
    nextSession: { ...session, step: "choose_record_or_edit", askedText: kakaoEditAskedTextV229141(utterance), updatedAt: Date.now() },
    reply: "‘" + said + "’을 새로 기록할까요?\n아무것도 바꾸거나 저장하지 않았어요.\n" + newRecord + "\n기존 " + target + " · 고치려면 ‘선택한 기록 보기’를 보내 주세요.",
    nlu: "flow_question",
  };
}

// 3장 3단계: 유효 세션 보유 사용자의 메시지는 전부 이 경로가 소비한다.
async function handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin, newTransaction = false, recordGuardKind = "", sessionRaw = undefined, explicitEdit = false }) {
  const session = await getKakaoEditSessionV4(env, kakaoUserKey, payload, sessionRaw);
  if (!session) return null;
  // T6: 시간이 지난 세션은 없는 것으로 본다. 다음 말(새 지출·조회)을 만료 안내로 삼키지 않는다.
  if (isSessionExpired(session, Date.now())) {
    try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); } catch (_) {}
    // V22.9.76 감사 B-3: 수정 메뉴 5분 뒤 온 "금액 13000"이 새 지출 ‘금액 / 13,000원’으로 저장됐고, "1번 13000"은 오늘의
    // 01번을 바로 바꿀 수 있었다. 세션이 끝난 지 30분 안에 온 수정 값 모양의 말은 끝났다고 알리고 한 줄 명령을 보여 준다.
    const sinceUpdateMs = Date.now() - Number(session.updatedAt || 0);
    if (session.updatedAt && sinceUpdateMs <= 35 * 60 * 1000 && (isExactKakaoEditFieldStart(utterance) || isKakaoSessionSeqReplyV4(utterance) || isKakaoAmountAnswer(utterance))) {
      return kakaoText(kakaoEditExpiredTextV4(session, utterance));
    }
    return null;
  }
  if (session.step === "choose_record_or_edit") {
    if (normalizeText(utterance) !== "선택한 기록 보기") {
      const askedAgain = !!session.askedText && kakaoEditAskedTextV229141(utterance) === session.askedText;
      if (!askedAgain && !explicitEdit && !isKakaoEditCancelCommand(utterance) && isKakaoEditChooseAnswerV229141(utterance)) return kakaoText(kakaoEditChooseHoldTextV229141(session), [["선택한 기록 보기"], ["취소"]]);
      await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
      if (isKakaoEditCancelCommand(utterance)) return kakaoText("수정을 취소했어요. 기록은 그대로예요.");
      return null;
    }
    const room = getKakaoBotGroupKey(payload);
    const currentId = room ? (await getLinkedKakaoGroupHousehold(env, room))?.id : await getKakaoSelectedHouseholdId(env, session.userId);
    if (currentId !== session.householdId) return kakaoText("현재 가계부가 바뀌었어요. ‘오늘기록’에서 거래를 다시 골라 주세요.", [["오늘기록"]]);
    const lookup = await readHouseholdRoleOrFailure(env, session.userId, session.householdId, { path: "/skill" });
    if (lookup.failed || !canWriteMyHousehold(lookup.role)) return kakaoText("지금은 이 거래의 수정 권한을 확인할 수 없어요. 기록을 바꾸지 않았어요.");
    const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
    if (!row) {
      await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
      return kakaoText("선택한 거래가 사라졌어요. ‘오늘기록’에서 다시 골라 주세요.");
    }
    const items = await getDailyKakaoRows(env, session.householdId, session.userId, kakaoUserKey, row.transaction_date);
    const seq = items.findIndex((item) => item.id === row.id) + 1;
    if (!seq) return kakaoText("현재 목록에서 선택한 거래를 찾지 못했어요. 가계부에서 확인해 주세요.");
    const next = { ...session, step: "awaiting_field", entryNo: twoDigitSeq(seq), entryDate: row.transaction_date, rowType: row.type, field: null, pendingField: null, pendingValue: null, updatedAt: Date.now(), originalLabel: kakaoRowLabel(row, seq), originalAmount: row.amount, originalRevision: row.updated_at || "", askedText: "" };
    return sendKakaoEditReplyV4(env, { kakaoUserKey, payload, stored: session }, next, kakaoEditMenuTextV4(row, seq), next, { nlu: "handled" });
  }
  // T6: 항목 이름 없이 온 분명한 새 기록(금액+내용)은 수정 값이 아니다. 세션을 끝내고 기록 경로로 넘긴다.
  // V22.9.94 C-1: ‘5000원 아니야’ 는 금액과 낱말이 있어 여기서 새 기록으로 넘어갔다. 새 기록도 값도 아니다.
  const negatedAmount = isKakaoEditNegatedAmountV22994(utterance);
  if (newTransaction && !negatedAmount && !startsWithKakaoEditField(utterance)) {
    await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
    return { passThrough: true, notice: `✏️ ${session.entryNo}번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.\n` };
  }
  const text = isKakaoEditCancelCommand(utterance) ? "취소" : utterance;
  const config = await buildKakaoEditConfigV4(env, session.householdId, session.rowType);
  let result = negatedAmount
    ? kakaoEditNegatedAmountResultV22994(session, utterance, config, Date.now())
    : handleEditMessage(session, text, { ...config, now: Date.now() });
  // V22.9.131 (Codex 점검 2026-11-19 1번 = V126:F-41): 새 기록 꼴(금액+내용)인데 칸 이름·메뉴 번호로 시작하는 말은 그 기록의 답으로 받아 왔다 —
  // ‘메모지 2000원’ 이 내용을 ‘2000원’ 으로, ‘가격표 3000원’·‘금액권 5만원’ 이 금액을, ‘3번 출구 떡볶이 5000원’ 이 결제수단을 묻지 않고 바꿨다.
  // 그런 말이 값 확인까지 지나 이 기록을 바꾸게 될 때(kakaoEditRecordWouldChangeV229131 + holdWrite)는 아무것도 바꾸거나 저장하지 않고 두 길을 알린 뒤 창을 닫는다 — 같은 말을 한 번 더
  // 보내면 새 기록이 되고, 고치려면 한 줄 명령을 쓴다. 상태 기계가 묻거나 확인하는 답(‘사과 5000원’ 의 ‘네/아니오’, ‘1번 커피 5000원’ 의 ‘얼마로 바꿀까요?’)과
  // ‘금액 칸 + 금액 하나’ 뿐인 답은 이 판 전 그대로다. 저장 전 안전망이 고치는 말로 본 말(recordGuardKind "edit" — ‘메모 2025 연말정산으로 바꿔줘’)도 이 판 전
  // 그대로 그 기록의 답이다(독립 검토 3: 그런 말은 한 번 더 보내도 새 기록이 되지 않아 두 길 안내의 말이 틀렸다).
  // 기록 꼴이 아닌 답(‘금액 13000’·‘메모 점심’·‘6번 엄마’·‘13000’)은 newTransaction 이 아니다.
  // V22.9.141 (독립 검토 2): 값의 금액은 숫자 금액(‘3만원’·‘12000원’)이나 천·만·억이 든 한글 금액 낱말(‘만원’·‘삼만원’ — 앞뒤에 한글이 붙지 않은 것)만 본다.
  // 첫 작업본은 한글 수 한 글자 + ‘원’ 을 금액으로 봐서 ‘메모 사원 식당’·‘메모 십원빵’·‘내용 다이소 천원샵’·‘메모 일원동 맛집’ 이 기록에 닿지 않았다.
  const memoWithPrice = result?.action === "apply" && result.field === "content" && /[가-힣A-Za-z]/.test(String(result.value || "").replace(/[천만억원십백]/g, "")) && /\d\s*(?:천|만|억)?\s*원|(?<![가-힣])[일이삼사오육칠팔구십백]*[천만억][일이삼사오육칠팔구십백천만]*\s*원(?![가-힣])/.test(String(result.value || "")) && /^(?:메모|내용|4번?)\s/.test(normalizeText(utterance));
  const recordShaped = !negatedAmount && ((newTransaction && recordGuardKind !== "edit") || (memoWithPrice && !/(?:바꿔|고쳐|수정해|변경해)/.test(utterance)));
  if (recordShaped && result?.moneyInValue) result = kakaoEditAmbiguousRecordResultV229131(session, utterance, { named: false });
  const ambiguousRecord = recordShaped && kakaoEditRecordWouldChangeV229131(result, utterance) ? () => kakaoEditAmbiguousRecordResultV229131(session, utterance, { memoValue: memoWithPrice ? String(result.value) : "" }) : null;
  // V22.9.81 U-4: sessionStored — 저장된 세션에 온 답이다(역할 조회가 실패하면 이 세션을 그대로 둔다).
  // V22.9.126 FC-19(3차 검토): stored — 끝내는 답이 닫을 저장 세션(정리가 실패하면 남는 것)이다.
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin, sessionStored: true, stored: session, ambiguousRecord }, session, result, config);
}

// V22.9.76 감사 B-3: 끝난 세션에 수정 값이 왔을 때의 안내. 아무것도 바꾸지 않았다고 말하고, 그 기록을 고치는 한 줄 명령을
// 보낸 말로 만들어 보여 준다(어제 기록이면 ‘어제’·‘8월 4일’을 앞에 붙인다).
function kakaoEditExpiredTextV4(session = {}, utterance = "") {
  const head = `${kakaoEditDayPrefixV4(session.entryDate)}수정 ${session.entryNo}번`;
  const text = normalizeText(utterance).slice(0, 40);
  const person = session.rowType === "income" ? "수입자" : "지출자";
  const fieldFirst = !isKakaoSessionSeqReplyV4(text) && !/^[1-8]$/.test(text) && isExactKakaoEditFieldStart(text);
  const examples = [fieldFirst ? `${head} ${text}` : `${head} 금액 13000`, `${head} ${person} 엄마`];
  return [`⏰ 수정 시간이 지나 ${session.entryNo}번 수정을 끝냈어요. 보낸 내용은 반영하지 않았어요.`, "다시 하려면 한 줄로 보내 주세요:", ...[...new Set(examples)].map((line) => `👉 ${line}`)].join("\n");
}

async function resolveKakaoEditTargetRowV4(env, { household, user, kakaoUserKey }, target = {}) {
  if (target.latest) {
    // V22.9.116 (V110 카카오 점검 P1, 11-07·11-08 운영 재확인): ‘방금’ 은 마지막으로 저장한 기록이었다. ‘수정 01번 금액 2000’ 으로 다른 기록을
    // 고친 직후 ‘방금 거 지워줘’ 가 고친 기록이 아니라 마지막에 저장한 기록을 묻지 않고 지웠다. 마지막으로 바뀐 기록(updated_at 순)을 같은
    // 단계에서 함께 읽어(직렬 깊이 그대로) 마지막 저장 뒤에 내 다른 기록이 바뀌었으면 어느 쪽도 고르지 않고 두 기록을 번호로 묻는다.
    // 삭제·‘방금 거 5000원으로’·번호 없는 지출자 변경이 모두 이 길이다. 바뀐 시각이 없는 줄(예전 검사 픽스처)은 예전처럼 마지막 저장 기록이다.
    // V22.9.135 N-2: 구성원도 다른 사람의 기록을 고치므로, 마지막 저장 뒤에 내가 고친 남의 기록(감사 기록 — 행위자 = 나, 그 기록이 지금도 있는 것만)도
    // 같은 단계에서 읽는다. 그 읽기가 실패하거나 늦으면(KAKAO_LATEST_EDIT_WAIT_MS_V229135) 없는 것으로 본다 — 그때는 V22.9.134 와 같다(내 기록의 바뀐 순서만 본다).
    const auditUnavailable = Symbol("audit-unavailable");
    const [recent, touchedRows, editedByMe] = await Promise.all([
      getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 1),
      getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 1, { touched: true }),
      optionalWithin(getLatestKakaoEditByRequesterV229135(env, household.id, user.id).catch(() => auditUnavailable), KAKAO_LATEST_EDIT_WAIT_MS_V229135, auditUnavailable),
    ]);
    if (editedByMe === auditUnavailable) return { row: null, seq: 0, ambiguousText: "최근에 고친 거래를 확인하지 못했어요. 아무것도 바꾸지 않았어요. ‘오늘기록’에서 거래를 다시 골라 주세요." };
    const row = recent[0] || null;
    if (!row) return { row: null, seq: 0 };
    // V22.9.81 U-13: 그날 목록(가계부 기록 앞의 500건)에 없으면 번호를 모른다(0). 예전에는 ‘01번’으로 적어 그날 01번(다른 기록)을 가리켰다.
    const rows = await getDailyKakaoRows(env, household.id, user.id, kakaoUserKey, row.transaction_date || formatDate(nowKstDate()));
    const seqIn = (list, item) => list.findIndex((other) => String(other.id) === String(item.id)) + 1;
    // V22.9.93 Q-50: 한 말로 저장한 여러 건은 저장 시각이 같아 ‘방금’ 이 어느 건인지 정할 수 없다(번호도 임의 id 순서다). 아무 건이나 고치거나 지우지 않고 번호로 묻는다.
    // V22.9.135 N-2: 그날 목록은 이제 가계부 전체다. ‘방금’ 은 여전히 내 기록이므로 같은 시각의 기록도 내 것만 센다(번호는 가계부 전체 순서).
    const sameSave = rows.flatMap((item, index) => (item.created_at === row.created_at && isKakaoRowOwnedByRequesterV2254(item, user.id, kakaoUserKey) ? [{ item, seq: index + 1 }] : []));
    // 마지막 저장 뒤에 바뀐 다른 기록: 내 기록의 바뀐 순서(V22.9.116)와 내가 고친 기록(V22.9.135 — 남의 기록 포함) 가운데 더 늦은 것.
    const ownTouched = touchedRows[0] || null;
    const changedAfterSave = [
      ownTouched ? { item: ownTouched, at: ownTouched.updated_at } : null,
      editedByMe?.row ? { item: editedByMe.row, at: editedByMe.at } : null,
    ].filter((entry) => entry && String(entry.item.id) !== String(row.id) && kakaoChangedAfterV229116(entry.at, row.created_at));
    const touched = changedAfterSave.length > 1 && kakaoChangedAfterV229116(changedAfterSave[1].at, changedAfterSave[0].at) ? changedAfterSave[1].item : changedAfterSave[0]?.item || null;
    if (touched) {
      const touchedDay = String(touched.transaction_date || "");
      const touchedList = touchedDay === String(row.transaction_date || "") ? rows : await getDailyKakaoRows(env, household.id, user.id, kakaoUserKey, touchedDay || formatDate(nowKstDate()));
      // 고친 기록은 다시 읽은 지금 행이다(지운 기록은 후보가 아니다 — getLatestKakaoEditByRequesterV229135). 그날 목록에서 번호를 찾고, 목록이 읽는 범위(그날 앞의
      // 500건) 밖이면 번호 없이 적는다.
      const current = touchedList.find((other) => String(other.id) === String(touched.id)) || touched;
      const saved = sameSave.length > 1 ? sameSave : [{ item: row, seq: seqIn(rows, row) }];
      return { row: null, seq: 0, dailyLimit: Number(rows.dailyLimit || 0), ambiguousText: kakaoEditTouchedAmbiguousTextV229116({ item: current, seq: seqIn(touchedList, current) }, saved) };
    }
    if (sameSave.length > 1) return { row: null, seq: 0, dailyLimit: Number(rows.dailyLimit || 0), ambiguousText: kakaoEditAmbiguousLatestTextV4(sameSave) };
    return { row, seq: seqIn(rows, row), dailyLimit: Number(rows.dailyLimit || 0) };
  }
  const found = await findDailyKakaoRowBySeq(env, household.id, user.id, kakaoUserKey, target.date, target.seq);
  // V22.9.135 N-2: 번호를 찾지 못한 답이 쓰도록 그날 가계부 기록 수를 함께 돌려준다(같은 읽기에서 센 값).
  return { row: found.row, seq: Number(target.seq || 0), dailyLimit: Number(found.rows?.dailyLimit || 0), dayCount: Number(found.rows?.length || 0) };
}

// V22.9.135 N-2: 다른 사람의 기록이 있으면 기록 줄에 붙일 이름표(구성원 명단 — 저장 답·웹과 같은 이름 규칙 memberNameMap)를 읽기 시작한다.
// 모두 내 기록이면 읽지 않는다(null). 기다리는 쪽은 optionalWithin 으로 짧게만 기다린다 — 늦거나 실패하면 이름 없이 답한다.
const KAKAO_OWNER_NAMES_WAIT_MS_V229135 = 800;
// V22.9.135 N-2: ‘방금’ 을 정할 때 내가 마지막으로 고친 기록(감사 기록)을 기다리는 한도. 다른 두 읽기와 같은 단계라 보통은 그 둘보다 먼저 끝난다.
const KAKAO_LATEST_EDIT_WAIT_MS_V229135 = 1200;
function kakaoOwnerNamesPromiseV229135(env, householdId = "", rows = [], userId = "") {
  if (!safeArray(rows).some((row) => row && String(row.user_id || "") !== String(userId || ""))) return null;
  const promise = fetchHouseholdMembers(env, householdId).then(memberNameMap);
  promise.catch(() => {});
  return promise;
}

// V22.9.79 감사 B-8: 복구가 끝나지 않았을 때의 안내. 예전에는 어느 경우든 "다시 ‘복구’를 입력"하라고 했다.
//  - 잠금 충돌(busy): 다른 요청이 같은 복구 버퍼를 쥐고 있었다. 그 요청이 이 요청이 되살리려던 기록을 이미 되살렸을 수 있어서, 번호 없는
//    "복구"를 그대로 다시 보내면 그다음(더 오래된) 삭제 기록까지 되살아났다. 확인부터 하라고 하고 바로 다시 보내라고 하지 않는다.
//  - 그 밖의 실패: 버퍼는 그대로라 같은 말을 다시 보내면 같은 기록을 한 번만 되살린다(되살릴 때 원래 id 로 이미 있는지 먼저 본다).
//    번호를 붙인 복구는 번호까지 그대로 다시 보내라고 한다 — 번호를 떼고 "복구"만 보내면 가장 최근 삭제가 되살아난다.
function kakaoRestoreDelayedTextV4(restoreTarget = {}, outcome = {}) {
  const again = restoreTarget.seq ? `복구 ${twoDigitSeq(restoreTarget.seq)}번` : "복구";
  if (outcome.busy) {
    return [
      "복구 요청이 겹쳐서 이번 요청은 처리하지 않았어요.",
      "앞서 보낸 복구가 이미 끝났을 수 있어요. ‘오늘기록’(다른 날 기록은 ‘어제 기록 보기’처럼)으로 되살아났는지 먼저 확인해 주세요.",
      `아직 그대로일 때만 ‘${again}’${josa(again, "을를")} 다시 보내 주세요. 확인 없이 바로 다시 보내면 다른 삭제 기록까지 되살아날 수 있어요.`,
    ].join("\n");
  }
  return [
    "복구가 잠시 지연되고 있어요.",
    outcome.undo ? `복구하려던 기록: ${kakaoRowLabel(outcome.undo.row, outcome.undo.seq)}` : "",
    `잠시 후 같은 ‘${again}’${josa(again, "을를")} 다시 보내 주세요.`,
    "같은 기록이 두 번 생기지 않게 확인한 뒤 되살려요.",
  ].filter(Boolean).join("\n");
}

// V22.9.80 T-10: 그날 기록을 읽은 범위가 500건 한도에 닿았을 때(getDailyKakaoRows 가 돌려준 배열의 dailyLimit) 답장에 붙이는 한 줄.
function kakaoDailyLimitLineV22980(limit = 0) {
  return limit > 0 ? `※ 이 날 가계부 기록이 ${limit}건에 닿아 앞의 ${limit}건까지만 읽었어요. 뒤쪽 기록은 목록에 없을 수 있어요.` : "";
}

function kakaoEditAmbiguousLatestTextV4(sameSave = []) {
  const prefix = kakaoEditDayPrefixV4(sameSave[0].item.transaction_date);
  const shown = twoDigitSeq(sameSave[0].seq);
  const more = sameSave.length > 6 ? [`외 ${sameSave.length - 6}건은 ‘${prefix || "오늘"}기록’에서 볼 수 있어요.`] : [];
  return [`방금 한 번에 저장한 기록이 ${sameSave.length}건이라 어느 기록인지 정하지 못했어요. 아무것도 바꾸지 않았어요.`, ...sameSave.slice(0, 6).map(({ item, seq }) => kakaoRowLabel(item, seq)), ...more, `번호로 보내 주세요. 예: ${prefix}수정 ${shown}번 금액 13000 / ${prefix}삭제 ${shown}번`].join("\n");
}

// V22.9.116: PostgREST 의 timestamptz(‘2026-11-08T05:23:45.123456+00:00’, 소수 자릿수는 바뀐다)를 마이크로초까지 견준다. 같은 말로 저장한
// 기록은 created_at 과 updated_at 이 같은 값이라 ‘뒤에 바뀜’ 이 아니다. 바뀐 시각이 없으면(예전 검사 픽스처) 아니라고 보고, 둘 다 있는데
// 읽지 못하는 꼴이면 같은 글자가 아닌 한 바뀐 것으로 본다 — 그때는 고르지 않고 묻는다.
function kakaoTimestampMicrosV229116(value = "") {
  const m = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/);
  if (!m) return NaN;
  const zone = !m[4] || m[4] === "Z" ? "Z" : /^[+-]\d{2}$/.test(m[4]) ? `${m[4]}:00` : m[4].length === 5 ? `${m[4].slice(0, 3)}:${m[4].slice(3)}` : m[4];
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isFinite(ms) ? ms * 1000 + Number(String(m[3] || "").padEnd(6, "0").slice(0, 6)) : NaN;
}
function kakaoChangedAfterV229116(changedAt = "", savedAt = "") {
  const changed = String(changedAt || "").trim(), saved = String(savedAt || "").trim();
  if (!changed || !saved) return false;
  const a = kakaoTimestampMicrosV229116(changed), b = kakaoTimestampMicrosV229116(saved);
  return Number.isFinite(a) && Number.isFinite(b) ? a > b : changed !== saved;
}

// V22.9.116: 마지막 저장 뒤에 다른 기록을 고쳤을 때의 ‘방금’ 답. 고친 기록과 마지막에 저장한 기록(한 말로 여러 건이면 그 기록들)을 날짜·번호와 함께 보이고
// 아무것도 바꾸지 않는다. 예시는 고친 기록의 번호로 적는다(번호를 모르면 저장한 기록, 둘 다 모르면 목록 보기 안내).
// V22.9.135(독립 검토 2026-11-21 2차): 구성원이 서로의 기록을 고치게 되어, 내 다른 기록을 남이 고친 뒤에도 이 답이 나온다(E-11). ‘고쳐서’·‘고친 기록’ 은 말한
// 사람이 고친 것처럼 읽혀 ‘바뀌어서’·‘바뀐 기록’ 으로 적는다(누가 고쳤든 맞는 말).
function kakaoEditTouchedAmbiguousTextV229116(touched = {}, saved = []) {
  const line = ({ item, seq }) => `${kakaoEditDayPrefixV4(item.transaction_date)}${kakaoRowLabel(item, seq)}`;
  const pick = Number(touched.seq) >= 1 ? touched : saved.find((entry) => Number(entry.seq) >= 1) || null;
  const prefix = pick ? kakaoEditDayPrefixV4(pick.item.transaction_date) : "";
  const shown = pick ? twoDigitSeq(pick.seq) : "";
  const more = saved.length > 6 ? [`외 ${saved.length - 6}건은 ‘${kakaoEditDayPrefixV4(saved[0].item.transaction_date) || "오늘"}기록’에서 볼 수 있어요.`] : [];
  return [
    "마지막에 저장한 뒤에 다른 기록이 바뀌어서 ‘방금’이 어느 기록인지 정하지 못했어요. 아무것도 바꾸지 않았어요.",
    `마지막에 바뀐 기록: ${line(touched)}`,
    saved.length > 1 ? `마지막에 한 번에 저장한 기록 ${saved.length}건:` : `마지막에 저장한 기록: ${line(saved[0])}`,
    ...(saved.length > 1 ? saved.slice(0, 6).map(line) : []),
    ...more,
    pick ? `번호로 보내 주세요. 예: ${prefix}수정 ${shown}번 금액 13000 / ${prefix}삭제 ${shown}번` : "‘오늘기록’(다른 날 기록은 ‘어제 기록 보기’처럼)으로 번호를 확인해 보내 주세요.",
  ].join("\n");
}

// V22.9.135 N-2(운영자 2026-11-21 — ‘구성원 누구나’): 번호는 이제 그날 가계부 기록 전체의 순서라 누구의 번호든 같은 기록을 가리킨다. V22.9.134 N-1 의
// ‘번호는 기록한 사람마다 따로’ 안내는 없어졌다. 찾지 못한 번호면 그날 기록이 몇 번까지인지(counts.dayCount — 같은 읽기에서 센 값) 말한다.
//  · 그날 읽은 범위가 한도(500건)에 닿았으면 기록이 읽은 범위 밖에 있을 수 있으므로 수를 말하지 않는다 — 예전 글과 한도 줄 그대로다.
//  · 번호 없는 요청(‘방금’)의 답도 예전 그대로다.
function kakaoEditRowNotFoundTextV4(target = {}, dailyLimit = 0, counts = {}) {
  const date = target.date || formatDate(nowKstDate());
  const seqText = target.seq ? ` ${twoDigitSeq(target.seq)}번` : "";
  const dayCount = Math.max(0, Math.round(Number(counts.dayCount || 0)));
  const head = !target.seq || dailyLimit ? `${date}${seqText} 기록을 찾지 못했어요.`
    : dayCount ? `${date}${seqText} 기록을 찾지 못했어요. 이 날 기록은 ${twoDigitSeq(dayCount)}번까지예요.`
    : `${date}${seqText} 기록을 찾지 못했어요. 이 날은 기록이 없어요.`;
  return [head, `"${date} 기록"이라고 입력해 번호를 다시 확인해 주세요.`, kakaoDailyLimitLineV22980(dailyLimit)].filter(Boolean).join("\n");
}

// V22.9.77 감사 A-14: ‘오늘기록’ 목록은 앞의 20건(가장 오래된 기록)에서 끊겼고, 950자를 넘으면 줄 중간이 잘렸다. 다 들어가면
// 예전처럼 01번부터 모두 보인다. 넘치면 최근 기록을 번호순으로 남기고 오래된 기록부터 줄 단위로 뺀다(20건·900자 안 — 카카오
// 답장 안전 길이 950자보다 짧게). 뺀 건수(외 N건)와 전체를 볼 곳(웹 가계부의 그 달 기록)을 적는다. 번호는 저장 순서 그대로다.
const KAKAO_DAILY_LIST_MAX_ROWS_V22977 = 20;
const KAKAO_DAILY_LIST_MAX_CHARS_V22977 = 900;
// V22.9.135 N-2: rows 는 그날 가계부 기록 전체(번호 = 저장 순서)다. names 가 있으면(다른 사람의 기록이 섞인 날) 줄마다 끝에 지출자(수입자) 이름을 붙이고,
// headLine(‘구성원 모두의 기록이에요 …’)은 그런 날에만 온다 — 모두 내 기록인 날의 목록은 예전 모양 그대로다.
function kakaoDailyListTextV4({ date = "", householdName = "", headLine = "", limitLine = "", rows = [], dayPrefix = "", webLink = "", names = null } = {}) {
  const head = [`🧾 ${date} 기록`, `가계부: ${householdName || "가계부"}`, ...(headLine ? [headLine] : []), ...(limitLine ? [limitLine] : [])];
  const guide = (seq) => ["", `수정: "${dayPrefix}수정 ${seq}번" 또는 "${dayPrefix}수정 ${seq}번 금액 13000"`, `삭제: "${dayPrefix}삭제 ${seq}번"`];
  const lines = safeArray(rows).map((r, i) => `${kakaoRowLabel(r, i + 1)}${kakaoRowOwnerSuffixV229135(r, names)}`.replace(/\s*\n+\s*/g, " "));
  const all = [...head, "", ...lines, ...guide("01")].join("\n");
  if (lines.length <= KAKAO_DAILY_LIST_MAX_ROWS_V22977 && all.length <= KAKAO_DAILY_LIST_MAX_CHARS_V22977) return all;
  for (let shown = Math.min(lines.length - 1, KAKAO_DAILY_LIST_MAX_ROWS_V22977); shown >= 1; shown -= 1) {
    const omitted = lines.length - shown;
    const text = [
      ...head,
      `최근 ${shown}건을 번호순으로 보여요.`,
      "",
      ...lines.slice(omitted),
      `… 외 ${omitted}건(01~${twoDigitSeq(omitted)}번)은 웹 가계부 기록에서 볼 수 있어요.`,
      ...(webLink ? [webLink] : []),
      ...guide(twoDigitSeq(omitted + 1)),
    ].join("\n");
    if (text.length <= KAKAO_DAILY_LIST_MAX_CHARS_V22977 || shown === 1) return text;
  }
  return all;
}

// 3장 1단계: "수정 NN번 [나머지]" — 나머지가 없으면 메뉴, 있으면 모듈 파서로.
// 즉시 반영(apply)되면 세션은 저장되지 않는다.
async function startKakaoEditFlowV4(env, ctx, { row, seq, rest, dailyLimit = 0, directed = false }) {
  const { kakaoUserKey, payload, household, user, origin } = ctx;
  // V22.9.81 U-13: 번호를 모르는 기록(‘방금’ 기록이 그날 목록 밖)은 번호로 이어지는 수정 세션을 열지 않는다. 세션 답장·안내가 모두
  // ‘수정 NN번 …’ 꼴이라, 번호를 지어내면 그 번호의 다른 기록을 고치게 된다.
  if (!(Number(seq) >= 1)) return kakaoEditRowReplyV229148(env, "handled", ["방금 기록의 번호를 정하지 못해 아무것도 바꾸지 않았어요.", kakaoRowLabel(row, 0), kakaoDailyLimitLineV22980(dailyLimit), `웹 가계부의 ${kakaoEditDayPrefixV4(row.transaction_date) || "오늘 "}기록에서 고쳐 주세요.`].filter(Boolean).join("\n"));
  const prior = await getKakaoEditSessionV4(env, kakaoUserKey, payload);
  const session = {
    entryNo: twoDigitSeq(seq),
    entryId: row.id,
    originalLabel: kakaoRowLabel(row, seq),
    originalAmount: row.amount,
    originalRevision: row.updated_at || "",
    entryDate: row.transaction_date || "",
    // V22.9.76 카카오 감사 2·8: 기록의 구분. 분류 목록과 ‘수입자/지출자’ 표기를 정한다.
    rowType: row.type === "income" ? "income" : "expense",
    householdId: household.id,
    householdName: String(household.name || "").slice(0, 60),
    userId: user.id,
    step: "awaiting_field",
    field: null,
    valueOptions: null,
    pendingField: null,
    pendingValue: null,
    repeatCount: 0,
    totalTurns: 0,
    // 직전 세션의 마지막 봇 메시지를 승계해 같은 메뉴의 2연속 전송(I1)을 차단한다.
    guardCount: Number(prior?.guardCount) || 0,
    lastBotMsg: String(prior?.lastBotMsg || ""),
    updatedAt: Date.now(),
  };
  // V22.9.126 FC-19(3차 검토): 끝내는 답이 닫을 것은 앞서 저장된 세션(prior, 다른 기록의 것일 수 있다)뿐이다. 없으면 정리 쓰기도 없다.
  if (!rest) {
    return sendKakaoEditReplyV4(env, { kakaoUserKey, payload, stored: prior }, session, kakaoEditMenuTextV4(row, seq), session, { nlu: "handled" });
  }
  const config = await buildKakaoEditConfigV4(env, household.id, session.rowType);
  const result = handleEditMessage(session, rest, { ...config, now: Date.now(), directed });
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin, stored: prior }, session, result, config);
}

// V22.9.43: 소유자가 구성원 권한을 ‘기록만’으로 정한 가계부에서 구성원은 기록을 고치거나 지우거나 되살리지 못한다.
// 권한을 읽지 못하면 아무것도 바꾸지 않는다(막힌 쪽). 소유자·관리자는 정책을 읽지 않는다.
// V22.9.126 FC-19(3차 검토): 읽지 못한 경우의 글은 따로 둔다 — 정해진 거절과 달리 남은 수정 세션이 다음에 기록을 바꿀 수 있다.
const KAKAO_RECORD_CHANGE_POLICY_UNKNOWN_TEXT_V229126 = "기록 수정 권한을 확인하지 못해 아무것도 바꾸지 않았어요. 잠시 후 다시 보내 주세요.";
async function kakaoRecordChangeRefusalTextV4(env, household = {}, role = "") {
  // V22.9.93 Q-73: 조회 전용 구성원의 ‘최근 기록 삭제’ 에 ‘기록만’ 정책을 안내했다.
  const blocked = roleBlockedMessage(role, household?.name);
  if (blocked) return blocked;
  try {
    if (await canChangeMyHouseholdRecords(env, role, household?.id)) return "";
  } catch (_) {
    return KAKAO_RECORD_CHANGE_POLICY_UNKNOWN_TEXT_V229126;
  }
  return memberRecordOnlyRefusalText(household?.name);
}

// 3장 1·2단계 + 조회·복구: 최상위 수정 관련 명령 라우터.
// 어떤 이해 실패도 메뉴 재출력으로 이어지지 않는다(I8) — 실패는 모듈 fail 경로뿐.
function kakaoEditNamesRowV4(row = {}, word = "") {
  const said = compact(word), memo = compact(row.memo || "");
  return !!memo && (memo.includes(said) || said.includes(memo));
}

async function handleKakaoEditCommandV4(env, ctx) {
  const { utterance, household, user, kakaoUserKey, payload, origin } = ctx;
  const raw = normalizeText(utterance);
  // 고치기·지우기·되살리기 명령으로 확인된 뒤에만 권한을 읽는다(조회·안내는 그대로).
  const refuseRecordChange = async () => {
    const text = await kakaoRecordChangeRefusalTextV4(env, household, ctx.role);
    return text ? kakaoText(text) : null;
  };

  if (isKakaoEditGuideCommand(raw)) return kakaoText(kakaoEditGuideText(origin));

  if (isKakaoDailyListCommand(raw)) {
    // V22.9.76 카카오 감사 6: "어제기록"·"그제기록"·"7월7일기록"처럼 붙여 쓰면 날짜를 못 읽어 오늘 목록을 보였다.
    // 날짜 부분과 뒤의 ‘기록·내역·목록’을 띄어 읽는다.
    const date = extractDate(raw.replace(/\s*(기록|내역|목록)(\s*보기)?$/, " $1"));
    if (!date) return kakaoText("달력에 없는 날짜라서 기록을 찾지 않았어요.\n예: 어제 기록 보기 · 7월 10일 기록 보기");
    const rows = await getDailyKakaoRows(env, household.id, user.id, kakaoUserKey, date);
    // V22.9.72: 빈 날은 짧게 알리고 맨 아래 ‘기록하기’ 버튼으로 잇는다(2026-10-20 디자이너 피드백).
    // V22.9.80 T-10: 그날 기록은 500건까지만 읽는다. 그 한도에 닿았으면 뒤쪽 기록이 목록에 없을 수 있다고 한 줄로 말한다(추가 조회 없음).
    // V22.9.135 N-2(운영자 2026-11-21 — ‘구성원 누구나’): 이 목록은 그날 가계부 기록 전체다(V22.9.76 감사 7 부터 134 까지는 내 기록만 보였다).
    // 번호는 누가 보든 같다. 다른 사람의 기록이 섞인 날에는 줄마다 지출자(수입자) 이름을 붙이고 머리에 한 줄로 알린다(단톡방에서는 이 답을 모두가 본다 —
    // ‘나’ 가 아니라 이름이다). 모두 내 기록인 날(혼자 쓰는 가계부 포함)의 목록은 예전 모양 그대로다. 이름표를 늦게 읽으면 이름 없이 보인다.
    if (!rows.length) return kakaoNextStepReply([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, "", "아직 기록이 없어요.", "지금 내역을 기록해 보세요.", "예) @말해가계부 커피 4500원"].join("\n"), payload);
    const limitLine = kakaoDailyLimitLineV22980(rows.dailyLimit);
    const namesPromise = kakaoOwnerNamesPromiseV229135(env, household.id, rows, user.id);
    const names = namesPromise ? await optionalWithin(namesPromise, KAKAO_OWNER_NAMES_WAIT_MS_V229135, null) : null;
    const headLine = !namesPromise ? "" : names ? "구성원 모두의 기록이에요 · 괄호 안은 지출자(수입은 수입자)" : "구성원 모두의 기록이에요";
    // T2: 오늘이 아닌 날의 목록은 안내에도 그 날짜를 붙인다. 날짜 없는 "삭제 01번"은 오늘의 01번이다.
    const dayPrefix = kakaoEditDayPrefixV4(date);
    const webLink = origin ? `${origin}${myReturnLocation(date.slice(0, 7), household.id)}` : "";
    return kakaoEditRowReplyV229148(env, "handled", kakaoDailyListTextV4({ date, householdName: household.name, headLine, limitLine, rows, dayPrefix, webLink, names }));
  }

  const restoreTarget = parseKakaoRestoreCommandV4(raw);
  if (restoreTarget) {
    if (restoreTarget.invalidSeq) return kakaoText(kakaoEditTargetRejectTextV4({ seq: 0 }));
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    let outcome = null;
    try {
      // S1·T4: 버퍼 읽기·복구·버퍼 정리를 한 잠금 안에서 한다. 겹친 두 "복구"가 같은 기록을 두 번 넣지 못한다.
      outcome = await withKakaoEditUndoLeaseV4(env, kakaoUserKey, payload, async ({ assertFresh }) => {
        const items = await readKakaoEditUndoItemsV4(env, kakaoUserKey, payload);
        // 번호가 겹치면 가장 최근에 지운 것부터 되돌린다. 지운 순서의 역순이 사용자가 기대하는 순서다.
        // V22.9.79 감사 B-9: 복구 버퍼는 가계부와 상관없이 한 사람·한 대화에 하나라, 다른 가계부에서 같은 번호를 더 나중에 지웠으면
        // "복구 01번"이 그쪽 기록을 먼저 잡아 지금 가계부의 01번을 영영 되살릴 수 없었다. 번호를 붙인 복구는 지금 가계부에서 지운 것 중에서
        // 먼저 고르고, 그 번호가 지금 가계부에는 없을 때만 다른 가계부의 기록(아래 안내만 하고 되살리지 않는다)을 잡는다.
        // 번호 없는 "복구"는 가장 최근에 지운 것 그대로다 — 다른 가계부 것이면 어느 쪽을 뜻하는지 모르므로 되살리지 않고 안내한다.
        const ownHousehold = (item) => String(item?.row?.household_id || household.id) === String(household.id);
        const numbered = restoreTarget.seq ? items.filter((item) => Number(item.seq || 0) === restoreTarget.seq) : [];
        const undo = restoreTarget.seq ? (numbered.find(ownHousehold) || numbered[0]) : items[0];
        if (!undo) return { kind: "empty" };
        // T12: 지운 가계부와 지금 가계부가 같을 때만 되살린다. 지금 가계부의 쓰기 권한은 위 라우터가 이미 확인했다.
        const targetHouseholdId = String(undo.row.household_id || household.id);
        if (targetHouseholdId !== String(household.id)) return { kind: "other_household", undo, ownSeq: Number(items.find(ownHousehold)?.seq || 0) };
        const body = kakaoRestoreRowV4(undo.row, household.id);
        // 직전 시도가 응답 단계에서만 실패해 이미 복구됐을 수 있으므로 먼저 존재를 확인한다.
        let restored = body.id ? await getKakaoRowById(env, targetHouseholdId, user.id, kakaoUserKey, body.id) : null;
        if (!restored) {
          assertFresh();
          try {
            if (["my_import", "backup_import_v19_3"].includes(body.source)) {
              if (!body.id || importStorageTextIssue(body)) throw new Error("import_restore_fields_invalid");
              await commitImportedTransactionRows(env, targetHouseholdId, [body]);
              const found = await reconcileImportedTransactionIds(env, targetHouseholdId, [body]);
              if (!found.has(String(body.id))) throw Object.assign(new Error("import_restore_unconfirmed"), { uncertain_write: true });
              restored = body;
            } else {
              const inserted = await supabase(env, "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
              restored = (Array.isArray(inserted) && inserted[0]) || body;
            }
          } catch (err) {
            // T4: 결과를 모르거나 같은 id 가 이미 있으면 다시 넣지 않고 id 로 확인한다. id 를 뺀 재삽입은 중복을 만든다.
            if (!body.id || (!isUncertainStorageWrite(err) && !isUniqueConstraintError(err))) return { kind: "failed", undo, error: err };
            restored = await getKakaoRowById(env, targetHouseholdId, user.id, kakaoUserKey, body.id);
            // V22.9.119 O-1 후속(독립 검토 B): 같은 id 가 아니라 같은 날·같은 문장·같은 금액의 다른 내 카카오 기록 때문에 운영 유니크 인덱스가 거절했다.
            // 다시 보내도 같으므로 ‘잠시 후 다시’ 가 아니라 그 사실을 답한다(복구 목록은 그대로 둔다).
            // 후속 2(재검토 P3): 이 기록이 목록에 남아 번호 없는 ‘복구’ 는 늘 이 기록을 고른다. 번호를 붙이면 다른 기록이 골라지는 번호(위 고르기 규칙으로
            // 그 번호의 첫 기록이 이 가계부의 다른 기록인 것, 최대 셋)를 답에 알린다. 같은 번호의 앞 기록이 이 기록이면 그 번호는 알리지 않는다.
            if (!restored && isKakaoRequestUniqueConflictV229119(err)) {
              const seqs = [...new Set(items.map((item) => Number(item?.seq || 0)).filter((seq) => seq >= 1))].filter((seq) => {
                const pick = items.filter((item) => Number(item?.seq || 0) === seq).find(ownHousehold);
                return !!pick && pick !== undo;
              });
              return { kind: "same_text_exists", undo, error: err, otherSeqs: seqs.slice(0, 3) };
            }
            if (!restored) return { kind: "failed", undo, error: err };
          }
        }
        if (["my_import", "backup_import_v19_3"].includes(body.source) && myImportStoredValue(restored) !== myImportStoredValue(body)) return { kind: "failed", undo, error: new Error("import_restore_unconfirmed") };
        // 실제 복구가 확인된 이 한 건만 뺀다. 같은 잠금 안에서 읽은 목록을 쓰므로 다른 삭제분을 지우지 않는다.
        try {
          assertFresh();
          await writeKakaoEditUndoItemsV4(env, kakaoUserKey, payload, items.filter((item) => item !== undo));
        } catch (_) {}
        return { kind: "restored", undo, restored };
      });
    } catch (err) {
      // V22.9.79 감사 B-8: 잠금을 못 잡은 요청(settings_rmw_busy)은 아무것도 읽지도 쓰지도 않았다. 다른 요청이 같은 버퍼를 쥐고 있었다는 뜻이라
      // 그 요청이 방금 기록을 되살렸을 수 있다 — 아래 답장이 구분해서 말한다.
      outcome = { kind: "failed", undo: null, error: err, busy: /settings_rmw_busy/.test(safeError(err)) };
    }
    // V22.9.135 N-2: 구성원이 다른 사람의 기록도 지우게 됐다. 복구 목록은 지운 사람마다 따로라(같은 방이라도), 내가 지우지 않은 기록은 내 ‘복구’ 로 되살릴 수 없다고 말한다.
    if (outcome.kind === "empty") return kakaoText("복구할 삭제 기록이 없어요.\n복구는 기록을 지운 사람이 삭제 직후 안내된 번호로 할 수 있어요. ‘오늘기록’로 현재 기록을 확인해 주세요.");
    if (outcome.kind === "other_household") {
      // V22.9.79 감사 B-9: 지금 가계부에서 지운 기록이 따로 있으면 그 번호를 알려 준다(다른 가계부 기록을 건드리지 않고 이 가계부 기록만 안내).
      const ownHint = outcome.ownSeq ? `\n지금 가계부에서 지운 기록은 ‘복구 ${twoDigitSeq(outcome.ownSeq)}번’으로 되살릴 수 있어요.` : "";
      // V22.9.81 U-13: 번호 없이 지운 기록(번호를 몰랐던 ‘방금 삭제’)은 ‘복구 00번’이 아니라 ‘복구’로 안내한다.
      return kakaoText(`이 기록은 ‘${outcome.undo.household_name || "다른 가계부"}’에서 지웠어요. 지금 가계부(‘${household.name || "가계부"}’)에는 되살리지 않았어요.\n그 가계부에서 다시 ‘${Number(outcome.undo.seq || 0) >= 1 ? `복구 ${twoDigitSeq(Number(outcome.undo.seq))}번` : "복구"}’을 보내 주세요.${ownHint}`);
    }
    if (outcome.kind === "same_text_exists") {
      rememberOpsEvent({ kind: "kakao_same_text_exists", severity: "info", path: "/skill", method: "POST", detail: "restore" });
      const otherSeqs = Array.isArray(outcome.otherSeqs) ? outcome.otherSeqs : [];
      return kakaoEditRowReplyV229148(env, "handled", [
        "같은 내용의 기록이 이미 있어 복구하지 않았어요.",
        `복구하려던 기록: ${kakaoRowLabel(outcome.undo.row, outcome.undo.seq)}`,
        `‘${kakaoEditDayPrefixV4(outcome.undo.row?.transaction_date) || "오늘 "}기록 보기’로 같은 내용의 기록을 확인해 주세요.`,
        ...(otherSeqs.length ? [`이 기록은 복구 목록에 남아 있어요. 다른 삭제 기록은 ${otherSeqs.map((seq) => `‘복구 ${twoDigitSeq(seq)}번’`).join("·")}으로 되살릴 수 있어요.`] : []),
      ].join("\n"));
    }
    if (outcome.kind !== "restored") {
      const lastError = outcome.error;
      await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: twoDigitSeq(Number(outcome.undo?.seq || restoreTarget.seq || 0)), input: String((lastError && lastError.message) || lastError || "").slice(0, 280), type: "restore_error" });
      return kakaoEditRowReplyV229148(env, "handled", kakaoRestoreDelayedTextV4(restoreTarget, outcome));
    }
    const restored = outcome.restored;
    // V22.9.81 U-13: 번호를 모르면 지어낸 ‘01번’ 없이 적는다. 되살린 뒤의 번호 조회가 실패해도 복구는 끝났으므로 답장을 실패로 바꾸지 않는다
    // (실패 답장을 보고 ‘복구’를 다시 보내면 그다음 삭제 기록까지 되살아난다).
    // V22.9.135 N-2: 다른 사람의 기록을 되살렸으면 기록 줄에 그 기록의 지출자 이름을 붙인다(번호를 읽는 동안 함께 읽는다 — 늦으면 이름 없이).
    const namesPromise = kakaoOwnerNamesPromiseV229135(env, household.id, [restored], user.id);
    const seq = (await dailySeqForKakaoRow(env, household.id, user.id, kakaoUserKey, restored).catch(() => 0)) || Number(outcome.undo.seq || 0);
    const ownerSuffix = namesPromise ? kakaoRowOwnerSuffixV229135(restored, await optionalWithin(namesPromise, KAKAO_OWNER_NAMES_WAIT_MS_V229135, null)) : "";
    // V22.9.80 T-13: 지울 때 버퍼에 적은 환불 연결은 복구로 되살아나지 않는다(연결은 삭제와 함께 지워졌다). 답장이 그 사실을 말한다.
    return kakaoEditRowReplyV229148(env, "handled", `↩️ ${kakaoEditDayPrefixV4(restored.transaction_date)}기록을 복구했어요.\n${kakaoRowLabel(restored, seq)}${ownerSuffix}${kakaoRefundLinkUndoNoteV4(outcome.undo?.refund_links, "restore")}`);
  }

  const deleteTarget = parseKakaoDeleteCommandV4(raw);
  if (deleteTarget) {
    const rejected = kakaoEditTargetRejectTextV4(deleteTarget);
    if (rejected) return kakaoText(rejected);
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq, dailyLimit, ambiguousText, dayCount } = await resolveKakaoEditTargetRowV4(env, ctx, deleteTarget);
    if (!row) return ambiguousText ? kakaoEditRowReplyV229148(env, "handled", ambiguousText) : kakaoText(kakaoEditRowNotFoundTextV4(deleteTarget, dailyLimit, { dayCount }));
    // V22.9.135 N-2: 다른 사람의 기록을 지우면 답의 기록 줄에 그 기록의 지출자 이름을 붙인다. 이름표는 지우는 동안 함께 읽는다(늦으면 이름 없이).
    const namesPromise = kakaoOwnerNamesPromiseV229135(env, household.id, [row], user.id);
    let deleted = null;
    try {
      deleted = await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: household.id, householdName: household.name, userId: user.id, role: ctx.role }, row, seq);
    } catch (err) {
      const failed = kakaoEditDeleteFailedReplyV229148(err, row, seq); // 관제 결과는 갈래마다(V148:C-73)
      return kakaoEditRowReplyV229148(env, failed.nlu, failed.reply);
    }
    const ownerSuffix = namesPromise ? kakaoRowOwnerSuffixV229135(row, await optionalWithin(namesPromise, KAKAO_OWNER_NAMES_WAIT_MS_V229135, null)) : "";
    // 삭제는 끝났다. 남은 세션 정리가 실패해도 "다시 보내 주세요"로 바뀌면 안 된다(다시 보내면 다음 번호가 지워진다).
    // V22.9.126 FC-19: 고치기와 같게 한 번 더 써 본다. 이 길은 세션을 미리 읽지 않아 두 번 다 실패했을 때만 남은 세션을 읽어 줄을 고르고(3차 검토),
    // 그 읽기도 실패하면 정리가 지우기 전에 본 이 isolate 의 힌트로 판단한다(4차 검토 — 저장소가 실패하는 동안에도 창은 남아 있을 수 있다).
    const hinted = hasKakaoEditSessionHint(kakaoUserKey, payload);
    const closeError = await closeKakaoEditSessionV229126(env, kakaoUserKey, payload);
    const deletedText = kakaoEditDeletedTextV4(row, seq, deleted?.refund_links, ownerSuffix);
    const stale = closeError ? await getKakaoEditSessionV4(env, kakaoUserKey, payload).catch(() => undefined) : null;
    const line = stale === undefined ? (hinted ? KAKAO_EDIT_CLOSE_FAILED_LINE_V229126 : "") : kakaoEditCloseFailedLineV229126(stale, { goneEntryId: row.id });
    return kakaoEditRowReplyV229148(env, "handled", line ? `${deletedText}\n${line}` : deletedText);
  }

  const editTarget = parseKakaoEditCommandV4(raw);
  if (editTarget) {
    // V22.9.63 감사(1:1 1): "수정 01번 02번 금액 5000"처럼 번호가 둘 이상이면 어느 기록인지 정하지 않고 한 건씩 적어 달라고 한다.
    if (editTarget.multi || /^\d{1,2}\s*번(?=\s|$)/.test(String(editTarget.rest || ""))) return kakaoText("한 번에 한 건씩만 수정할 수 있어요. 번호 하나만 적어 주세요.\n예: 수정 01번 금액 5000");
    const rejected = kakaoEditTargetRejectTextV4(editTarget);
    if (rejected) return kakaoText(rejected);
    // V22.9.93 Q-25: ‘1번 취소’ 에 ‘01번 수정을 취소했어요’ 라고 답해 기록이 지워진 줄 알게 했다. 기록은 그대로라고 말한다.
    if (editTarget.seq && /^취소(?:요|\s*해\s*(?:요|줘요?|주세요)?|\s*할(?:게요?|래요?)|\s*합니다|\s*하기)?$/.test(String(editTarget.rest || ""))) {
      const shown = twoDigitSeq(editTarget.seq);
      return kakaoText(`${shown}번 기록은 그대로예요.\n지우려면 ‘삭제 ${shown}번’이라고 보내 주세요.`);
    }
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq, dailyLimit, ambiguousText, dayCount } = await resolveKakaoEditTargetRowV4(env, ctx, editTarget);
    if (!row) return ambiguousText ? kakaoEditRowReplyV229148(env, "handled", ambiguousText) : kakaoText(kakaoEditRowNotFoundTextV4(editTarget, dailyLimit, { dayCount }));
    // V22.9.93 Q-32: ‘방금 분류 이상해’ 는 그 칸을 다시 묻고, ‘아까 거 내용 뭐였지’ 는 기록을 보여 준다. 둘 다 값이 아니라 기록을 바꾸지 않는다.
    if (isKakaoEditNotValue(editTarget.rest) && !/^구분(?:\s|$)/.test(editTarget.rest)) {
      const complaint = kakaoEditComplaintField(editTarget.rest);
      if (complaint) return startKakaoEditFlowV4(env, ctx, { row, seq, rest: complaint, dailyLimit });
      return kakaoEditRowReplyV229148(env, "handled", [kakaoRowLabel(row, seq), "기록은 그대로예요. 바꾸려면 이렇게 보내 주세요.", `${Number(seq) >= 1 ? `수정 ${twoDigitSeq(seq)}번` : "방금"} 내용 점심`].join("\n"));
    }
    // V22.9.93 Q-62: 말한 내용이 그 번호의 기록이 아니면 고치지 않는다(‘3번 버스 1400원으로’ 가 3번 김밥 기록의 금액을 덮어썼다. 금액은 ‘복구’ 로 되돌릴 수 없다).
    if (editTarget.namedWord && !kakaoEditNamesRowV4(row, editTarget.namedWord)) {
      const shown = twoDigitSeq(seq);
      return kakaoEditRowReplyV229148(env, "handled", [kakaoRowLabel(row, seq), `보낸 내용(‘${editTarget.namedWord}’)과 달라서 고치지 않았어요. 이 기록이 맞다면 이렇게 보내 주세요.`, `수정 ${shown}번 ${editTarget.rest}`].join("\n"));
    }
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: editTarget.rest, dailyLimit, directed: editTarget.directed });
  }

  // 번호 없는 "지출자 변경"/"지출자 엄마" — 방금 저장한 기록에 대해 같은 V4 경로로 처리
  if (isKakaoTransactionSpenderChangeCommand(raw)) {
    // V22.9.76 감사 B-4: 바꿀 수 없는 사람에게도 선택지 세션을 열어, 그 세션이 다음 명령(예산 등)을 ‘목록의 번호로
    // 골라주세요’로 삼켰다. 기록 수정 권한과 지출자 변경 권한(소유자·관리자)을 먼저 본다.
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq, dailyLimit, ambiguousText } = await resolveKakaoEditTargetRowV4(env, ctx, { latest: true });
    if (!row) return ambiguousText ? kakaoEditRowReplyV229148(env, "handled", ambiguousText) : kakaoText("변경할 최근 기록이 없어요. 먼저 ‘오늘기록’에서 번호를 확인해 주세요.");
    if (!canManageMyHousehold(ctx.role)) return kakaoText(`${row.type === "income" ? "수입자" : "지출자"}는 가계부 소유자·관리자만 바꿀 수 있어요. 기록은 그대로예요.\n금액·분류·결제수단·내용·날짜는 바꿀 수 있어요.`);
    const value = parseKakaoSpenderChoiceValue(raw);
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: value ? `지출자 ${value}` : "지출자", dailyLimit });
  }

  return null;
}
// @build:exports-start
export { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 };
// @build:exports-end
