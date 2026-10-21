// @build:imports-start
import { scheduleNluOpsPersistence } from "../runtime/ops-telemetry.js";
import { isUniqueConstraintError } from "../runtime/leases.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { fetchPaymentAssets } from "../settings/payment-assets.js";
import {
  commitImportedTransactionRows, importStorageTextIssue,
} from "../import/flexible-import-parser.js";
import { fetchHouseholdMembers } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { myImportStoredValue, reconcileImportedTransactionIds } from "../my/backup-import.js";
import {
  canChangeMyHouseholdRecords, canManageMyHousehold, canWriteMyHousehold,
  memberRecordOnlyRefusalText,
} from "../my/access-control.js";
import { isUncertainStorageWrite, kakaoNextStepReply, kakaoText } from "./response-builders.js";
import {
  KAKAO_AUDIT_ACTOR_KIND, dailySeqForKakaoRow, deleteKakaoRowWithUndoV4, findDailyKakaoRowBySeq,
  getDailyKakaoRows, getKakaoEditSessionV4, getKakaoRowById, getRecentKakaoOwnedTransactionsV2254,
  isKakaoDailyListCommand, isKakaoEditCancelCommand, isKakaoEditGuideCommand,
  isKakaoSessionSeqReplyV4, isKakaoTransactionSpenderChangeCommand, kakaoActiveSpenderMembers,
  kakaoEditDayPrefixV4, kakaoEditDeleteFailedTextV4, kakaoEditDeletedTextV4, kakaoEditGuideText,
  kakaoEditMenuTextV4, kakaoEditRecordLineV4, kakaoEditTargetRejectTextV4, kakaoRestoreRowV4,
  kakaoRowLabel, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
  parseKakaoSpenderChoiceValue, readKakaoEditUndoItemsV4, resolveKakaoEditDateV4,
  saveKakaoEditSessionV4, twoDigitSeq, withKakaoEditUndoLeaseV4, writeKakaoEditUndoItemsV4,
} from "./edit-session-v4.js";
import {
  KAKAO_EDIT_DEFAULT_CATEGORIES, MAX_FAILS, compact, handleEditMessage, isExactKakaoEditFieldStart,
  isSessionExpired, josa, startsWithKakaoEditField,
} from "./edit-state-machine.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { extractDate, formatDate, nowKstDate } from "../nlu/date-payment.js";
import { CATEGORY_RULES, LEGACY_CATEGORY_SPLITS } from "../nlu/category-rules.js";
import { numberWithCommas, updateTransaction } from "../domain/transactions-core.js";
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

// 4장: config 주입 — 이 가계부의 실데이터가 값 옵션이자 검증 규칙이다.
// V22.9.76: 분류 목록은 기록의 구분(rowType)에 맞는 사용자 분류만, 없으면 그 구분의 표준 분류다.
async function buildKakaoEditConfigV4(env, householdId = "", rowType = "expense") {
  const [members, paymentAssets, categoryRows] = await Promise.all([
    fetchHouseholdMembers(env, householdId).catch(() => []),
    fetchPaymentAssets(env, householdId).catch(() => []),
    fetchCustomCategories(env, householdId).catch(() => []),
  ]);
  const labelCounts = new Map();
  const memberOptions = kakaoActiveSpenderMembers(members).slice(0, 20).map((m) => {
    const base = String(m.nickname || "구성원").trim().slice(0, 20) || "구성원";
    const count = (labelCounts.get(base) || 0) + 1;
    labelCounts.set(base, count);
    return { label: count > 1 ? `${base}·${count}` : base, user_id: m.user_id };
  });
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

// 5-2장: 최후 방어선 — 수정 플로우의 모든 응답은 예외 없이 이 함수로만 전송한다.
// 직전 봇 메시지와 동일하면 루프를 끊고 흔적(duplicate_reply_guard)을 남긴다.
async function sendKakaoEditReplyV4(env, { kakaoUserKey, payload }, session, reply, nextSession) {
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
  await saveKakaoEditSessionV4(env, kakaoUserKey, payload, finalNext); // I6: 전송과 원자적 쌍
  return kakaoText(finalReply);
}

// 필드 → transactions 컬럼 반영. DB 검증(구성원 존재 등)은 여기서 최종 수행한다.
async function applyKakaoEditFieldV4(env, { session, field, value, config, kakaoUserKey, moduleReply, role = "" }) {
  const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
  if (!row) {
    return { reply: `수정하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘기록’로 번호를 다시 확인해 주세요.`, nextSession: null };
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
  try {
    // 행은 이미 이 가계부에서 찾았다. householdId 를 넘기면 RPC 전 행 조회 한 번이 빠진다.
    // V22.9.37 감사 NEW-9: 웹 수정처럼 행위자(요청한 사용자)와 종류를 감사 기록에 남긴다. 예전에는 행위자 없는 system 이었다.
    await updateTransaction(env, session.entryId, patch, { householdId: session.householdId, actorUserId: session.userId, actorKind: KAKAO_AUDIT_ACTOR_KIND });
  } catch (err) {
    // T2: 결과를 모르면 다시 보내라고 하지 않는다. 날짜 수정은 번호를 옮겨, 다시 보내면 다른 기록이 바뀐다.
    if (isUncertainStorageWrite(err)) {
      return { reply: `수정 결과를 확인하지 못했어요.\n같은 명령을 다시 보내기 전에 ‘${kakaoEditDayPrefixV4(row.transaction_date) || "오늘 "}기록 보기’로 바뀌었는지 먼저 확인해 주세요.`, nextSession: null };
    }
    return { reply: `${session.entryNo}번 기록을 바꾸지 못했어요. 기록은 그대로예요.\n잠시 후 다시 보내 주세요.`, nextSession: null };
  }
  return { reply: `${reply}\n${kakaoEditRecordLineV4({ ...row, ...patch })}`, nextSession: null };
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
    currentRole = String(await getHouseholdMemberRole(env, session.userId, session.householdId) || "").toLowerCase();
    if (!canWriteMyHousehold(currentRole)) {
      return sendKakaoEditReplyV4(env, ctx, session, "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요. 가계부 관리자에게 권한을 확인한 뒤 ‘오늘기록’부터 다시 시작해 주세요.", null);
    }
    // V22.9.43: 세션을 연 뒤 소유자가 구성원 권한을 ‘기록만’으로 바꿨어도 반영 직전에 다시 본다.
    const refusal = await kakaoRecordChangeRefusalTextV4(env, { id: session.householdId, name: session.householdName }, currentRole);
    if (refusal) return sendKakaoEditReplyV4(env, ctx, session, refusal, null);
  }
  if (result?.action === "apply") {
    const applied = await applyKakaoEditFieldV4(env, { session, field: result.field, value: result.value, config, kakaoUserKey, moduleReply: result.reply, role: currentRole });
    if (applied.log) {
      await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: applied.log.entryNo || session.entryNo, input: applied.log.input || "", attempt: applied.log.attempt || 0, type: applied.log.type });
    }
    return sendKakaoEditReplyV4(env, ctx, session, applied.reply, applied.nextSession || null);
  }
  if (result?.action === "delete") {
    const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
    if (!row) {
      return sendKakaoEditReplyV4(env, ctx, session, `삭제하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘기록’로 번호를 다시 확인해 주세요.`, null);
    }
    const seq = Number(session.entryNo) || 0;
    try {
      await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: session.householdId, householdName: session.householdName || "", userId: session.userId }, row, seq);
    } catch (err) {
      return sendKakaoEditReplyV4(env, ctx, session, kakaoEditDeleteFailedTextV4(err, row, seq), null);
    }
    return sendKakaoEditReplyV4(env, ctx, session, kakaoEditDeletedTextV4(row, seq), null);
  }
  // ask_value / confirm / reprompt / cancel — 모듈의 reply와 nextSession을 그대로 따른다.
  return sendKakaoEditReplyV4(env, ctx, session, result?.reply || "", result?.nextSession || null);
}

// 3장 3단계: 유효 세션 보유 사용자의 메시지는 전부 이 경로가 소비한다.
async function handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin, newTransaction = false, sessionRaw = undefined }) {
  const session = await getKakaoEditSessionV4(env, kakaoUserKey, payload, sessionRaw);
  if (!session) return null;
  // T6: 시간이 지난 세션은 없는 것으로 본다. 다음 말(새 지출·조회)을 만료 안내로 삼키지 않는다.
  if (isSessionExpired(session, Date.now())) {
    try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); } catch (_) {}
    // V22.9.76 감사 B-3: 수정 메뉴 5분 뒤 온 "금액 13000"이 새 지출 ‘금액 / 13,000원’으로 저장됐고, "1번 13000"은 오늘의
    // 01번을 바로 바꿀 수 있었다. 세션이 끝난 지 30분 안에 온 수정 값 모양의 말은 끝났다고 알리고 한 줄 명령을 보여 준다.
    const sinceUpdateMs = Date.now() - Number(session.updatedAt || 0);
    if (session.updatedAt && sinceUpdateMs <= 35 * 60 * 1000 && (isExactKakaoEditFieldStart(utterance) || isKakaoSessionSeqReplyV4(utterance))) {
      return kakaoText(kakaoEditExpiredTextV4(session, utterance));
    }
    return null;
  }
  // T6: 항목 이름 없이 온 분명한 새 기록(금액+내용)은 수정 값이 아니다. 세션을 끝내고 기록 경로로 넘긴다.
  if (newTransaction && !startsWithKakaoEditField(utterance)) {
    await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
    return { passThrough: true, notice: `✏️ ${session.entryNo}번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.\n` };
  }
  const text = isKakaoEditCancelCommand(utterance) ? "취소" : utterance;
  const config = await buildKakaoEditConfigV4(env, session.householdId, session.rowType);
  const result = handleEditMessage(session, text, { ...config, now: Date.now() });
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin }, session, result, config);
}

// V22.9.76 감사 B-3: 끝난 세션에 수정 값이 왔을 때의 안내. 아무것도 바꾸지 않았다고 말하고, 그 기록을 고치는 한 줄 명령을
// 보낸 말로 만들어 보여 준다(어제 기록이면 ‘어제’·‘8월 4일’을 앞에 붙인다).
function kakaoEditExpiredTextV4(session = {}, utterance = "") {
  const head = `${kakaoEditDayPrefixV4(session.entryDate)}수정 ${session.entryNo}번`;
  const text = normalizeText(utterance).slice(0, 40);
  const person = session.rowType === "income" ? "수입자" : "지출자";
  const fieldFirst = !isKakaoSessionSeqReplyV4(text) && !/^[1-7]$/.test(text) && isExactKakaoEditFieldStart(text);
  const examples = [fieldFirst ? `${head} ${text}` : `${head} 금액 13000`, `${head} ${person} 엄마`];
  return [`⏰ 수정 시간이 지나 ${session.entryNo}번 수정을 끝냈어요. 보낸 내용은 반영하지 않았어요.`, "다시 하려면 한 줄로 보내 주세요:", ...[...new Set(examples)].map((line) => `👉 ${line}`)].join("\n");
}

async function resolveKakaoEditTargetRowV4(env, { household, user, kakaoUserKey }, target = {}) {
  if (target.latest) {
    const recent = await getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 1);
    const row = recent[0] || null;
    if (!row) return { row: null, seq: 0 };
    const seq = (await dailySeqForKakaoRow(env, household.id, user.id, kakaoUserKey, row)) || 1;
    return { row, seq };
  }
  const found = await findDailyKakaoRowBySeq(env, household.id, user.id, kakaoUserKey, target.date, target.seq);
  return { row: found.row, seq: Number(target.seq || 0) };
}

function kakaoEditRowNotFoundTextV4(target = {}) {
  const date = target.date || formatDate(nowKstDate());
  const seqText = target.seq ? ` ${twoDigitSeq(target.seq)}번` : "";
  return `${date}${seqText} 기록을 찾지 못했어요.\n"${date} 기록"이라고 입력해 번호를 다시 확인해 주세요.`;
}

// 3장 1단계: "수정 NN번 [나머지]" — 나머지가 없으면 메뉴, 있으면 모듈 파서로.
// 즉시 반영(apply)되면 세션은 저장되지 않는다.
async function startKakaoEditFlowV4(env, ctx, { row, seq, rest }) {
  const { kakaoUserKey, payload, household, user, origin } = ctx;
  const prior = await getKakaoEditSessionV4(env, kakaoUserKey, payload);
  const session = {
    entryNo: twoDigitSeq(seq),
    entryId: row.id,
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
  if (!rest) {
    return sendKakaoEditReplyV4(env, { kakaoUserKey, payload }, session, kakaoEditMenuTextV4(row, seq), session);
  }
  const config = await buildKakaoEditConfigV4(env, household.id, session.rowType);
  const result = handleEditMessage(session, rest, { ...config, now: Date.now() });
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin }, session, result, config);
}

// V22.9.43: 소유자가 구성원 권한을 ‘기록만’으로 정한 가계부에서 구성원은 기록을 고치거나 지우거나 되살리지 못한다.
// 권한을 읽지 못하면 아무것도 바꾸지 않는다(막힌 쪽). 소유자·관리자는 정책을 읽지 않는다.
async function kakaoRecordChangeRefusalTextV4(env, household = {}, role = "") {
  try {
    if (await canChangeMyHouseholdRecords(env, role, household?.id)) return "";
  } catch (_) {
    return "기록 수정 권한을 확인하지 못해 아무것도 바꾸지 않았어요. 잠시 후 다시 보내 주세요.";
  }
  return memberRecordOnlyRefusalText(household?.name);
}

// 3장 1·2단계 + 조회·복구: 최상위 수정 관련 명령 라우터.
// 어떤 이해 실패도 메뉴 재출력으로 이어지지 않는다(I8) — 실패는 모듈 fail 경로뿐.
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
    // V22.9.76 카카오 감사 7: 이 목록은 내가 남긴 기록만 번호를 붙여 보인다(번호 체계는 그대로). 가계부 전체는 요약으로 안내한다.
    const ownOnlyLine = `내 기록만 보여요 · 가계부 전체는 ‘${(kakaoEditDayPrefixV4(date) || "오늘 ").trim()} 요약’`;
    if (!rows.length) return kakaoNextStepReply([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, ownOnlyLine, "", "아직 기록이 없어요.", "지금 내역을 기록해 보세요.", "예) @말해가계부 커피 4500원"].join("\n"), payload);
    // T2: 오늘이 아닌 날의 목록은 안내에도 그 날짜를 붙인다. 날짜 없는 "삭제 01번"은 오늘의 01번이다.
    const dayPrefix = kakaoEditDayPrefixV4(date);
    return kakaoText([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, ownOnlyLine, "", ...rows.slice(0, 20).map((r, i) => kakaoRowLabel(r, i + 1)), ...(rows.length > 20 ? [`… 외 ${rows.length - 20}건 (21번부터 번호가 이어져요. 예: "수정 ${String(rows.length).padStart(2, "0")}번")`] : []), "",`수정: "${dayPrefix}수정 01번" 또는 "${dayPrefix}수정 01번 금액 13000"`, `삭제: "${dayPrefix}삭제 01번"`].join("\n"));
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
        const undo = restoreTarget.seq ? items.find((item) => Number(item.seq || 0) === restoreTarget.seq) : items[0];
        if (!undo) return { kind: "empty" };
        // T12: 지운 가계부와 지금 가계부가 같을 때만 되살린다. 지금 가계부의 쓰기 권한은 위 라우터가 이미 확인했다.
        const targetHouseholdId = String(undo.row.household_id || household.id);
        if (targetHouseholdId !== String(household.id)) return { kind: "other_household", undo };
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
      outcome = { kind: "failed", undo: null, error: err };
    }
    if (outcome.kind === "empty") return kakaoText("복구할 삭제 기록이 없어요.\n삭제 직후 안내된 번호로만 복구할 수 있어요. ‘오늘기록’로 현재 기록을 확인해 주세요.");
    if (outcome.kind === "other_household") {
      return kakaoText(`이 기록은 ‘${outcome.undo.household_name || "다른 가계부"}’에서 지웠어요. 지금 가계부(‘${household.name || "가계부"}’)에는 되살리지 않았어요.\n그 가계부에서 다시 ‘복구 ${twoDigitSeq(Number(outcome.undo.seq || 0))}번’을 보내 주세요.`);
    }
    if (outcome.kind !== "restored") {
      const lastError = outcome.error;
      await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: twoDigitSeq(Number(outcome.undo?.seq || restoreTarget.seq || 0)), input: String((lastError && lastError.message) || lastError || "").slice(0, 280), type: "restore_error" });
      return kakaoText("복구가 잠시 지연되고 있어요. 잠시 후 다시 ‘복구’를 입력해 주세요.\n같은 기록이 두 번 생기지 않게 확인한 뒤 되살려요.");
    }
    const restored = outcome.restored;
    const seq = (await dailySeqForKakaoRow(env, household.id, user.id, kakaoUserKey, restored)) || Number(outcome.undo.seq || 0) || 1;
    return kakaoText(`↩️ ${kakaoEditDayPrefixV4(restored.transaction_date)}기록을 복구했어요.\n${kakaoRowLabel(restored, seq)}`);
  }

  const deleteTarget = parseKakaoDeleteCommandV4(raw);
  if (deleteTarget) {
    const rejected = kakaoEditTargetRejectTextV4(deleteTarget);
    if (rejected) return kakaoText(rejected);
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, deleteTarget);
    if (!row) return kakaoText(kakaoEditRowNotFoundTextV4(deleteTarget));
    try {
      await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: household.id, householdName: household.name, userId: user.id }, row, seq);
    } catch (err) {
      return kakaoText(kakaoEditDeleteFailedTextV4(err, row, seq));
    }
    // 삭제는 끝났다. 남은 세션 정리가 실패해도 "다시 보내 주세요"로 바뀌면 안 된다(다시 보내면 다음 번호가 지워진다).
    try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); } catch (_) {}
    return kakaoText(kakaoEditDeletedTextV4(row, seq));
  }

  const editTarget = parseKakaoEditCommandV4(raw);
  if (editTarget) {
    // V22.9.63 감사(1:1 1): "수정 01번 02번 금액 5000"처럼 번호가 둘 이상이면 어느 기록인지 정하지 않고 한 건씩 적어 달라고 한다.
    if (/^\d{1,2}\s*번(?=\s|$)/.test(String(editTarget.rest || ""))) return kakaoText("한 번에 한 건씩만 수정할 수 있어요. 번호 하나만 적어 주세요.\n예: 수정 01번 금액 5000");
    const rejected = kakaoEditTargetRejectTextV4(editTarget);
    if (rejected) return kakaoText(rejected);
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, editTarget);
    if (!row) return kakaoText(kakaoEditRowNotFoundTextV4(editTarget));
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: editTarget.rest });
  }

  // 번호 없는 "지출자 변경"/"지출자 엄마" — 방금 저장한 기록에 대해 같은 V4 경로로 처리
  if (isKakaoTransactionSpenderChangeCommand(raw)) {
    // V22.9.76 감사 B-4: 바꿀 수 없는 사람에게도 선택지 세션을 열어, 그 세션이 다음 명령(예산 등)을 ‘목록의 번호로
    // 골라주세요’로 삼켰다. 기록 수정 권한과 지출자 변경 권한(소유자·관리자)을 먼저 본다.
    { const refused = await refuseRecordChange(); if (refused) return refused; }
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, { latest: true });
    if (!row) return kakaoText("변경할 최근 기록이 없어요. 먼저 ‘오늘기록’에서 번호를 확인해 주세요.");
    if (!canManageMyHousehold(ctx.role)) return kakaoText(`${row.type === "income" ? "수입자" : "지출자"}는 가계부 소유자·관리자만 바꿀 수 있어요. 기록은 그대로예요.\n금액·분류·결제수단·내용·날짜는 바꿀 수 있어요.`);
    const value = parseKakaoSpenderChoiceValue(raw);
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: value ? `지출자 ${value}` : "지출자" });
  }

  return null;
}
// @build:exports-start
export { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 };
// @build:exports-end
