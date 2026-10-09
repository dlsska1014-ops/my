// @build:imports-start
import { isUniqueConstraintError } from "../runtime/leases.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { fetchPaymentAssets } from "../settings/payment-assets.js";
import { fetchHouseholdMembers } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { canManageMyHousehold, canWriteMyHousehold } from "../my/access-control.js";
import { isUncertainStorageWrite, kakaoText } from "./response-builders.js";
import {
  dailySeqForKakaoRow, deleteKakaoRowWithUndoV4, findDailyKakaoRowBySeq, getDailyKakaoRows,
  getKakaoEditSessionV4, getKakaoRowById, getRecentKakaoOwnedTransactionsV2254,
  isKakaoDailyListCommand, isKakaoEditCancelCommand, isKakaoEditGuideCommand,
  isKakaoTransactionSpenderChangeCommand, kakaoActiveSpenderMembers, kakaoEditConversationScope,
  kakaoEditDayPrefixV4, kakaoEditDeleteFailedTextV4, kakaoEditDeletedTextV4, kakaoEditGuideText,
  kakaoEditMenuTextV4, kakaoEditRecordLineV4, kakaoEditTargetRejectTextV4, kakaoRestoreRowV4,
  kakaoRowLabel, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
  parseKakaoSpenderChoiceValue, readKakaoEditUndoItemsV4, resolveKakaoEditDateV4,
  saveKakaoEditSessionV4, twoDigitSeq, withKakaoEditUndoLeaseV4, writeKakaoEditUndoItemsV4,
} from "./edit-session-v4.js";
import {
  MAX_FAILS, compact, handleEditMessage, isSessionExpired, josa, startsWithKakaoEditField,
} from "./edit-state-machine.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { extractDate, formatDate, nowKstDate } from "../nlu/date-payment.js";
import { numberWithCommas, updateTransaction } from "../domain/transactions-core.js";
// @build:imports-end

// =====================================================================
// V4 Worker 통합 — 위 모듈을 실제 카카오 스킬 라우팅·DB에 연결한다.
// =====================================================================

// 4장: config 주입 — 이 가계부의 실데이터가 값 옵션이자 검증 규칙이다.
async function buildKakaoEditConfigV4(env, householdId = "") {
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
  const categories = [];
  for (const categoryRow of safeArray(categoryRows)) {
    const name = String(categoryRow?.name || "").trim();
    if (name && !categories.includes(name)) categories.push(name);
    if (categories.length >= 12) break;
  }
  if (categories.length && !categories.includes("기타")) {
    if (categories.length >= 12) categories.pop();
    categories.push("기타");
  }
  return {
    members: memberOptions.map((m) => m.label),
    memberOptions,
    methods,
    categories: categories.length ? categories : undefined,
  };
}

// 6장: 미인식 입력 텔레메트리 — 실패해도 응답 흐름을 막지 않는다.
async function logKakaoEditTelemetryV4(env, payload = {}, entry = {}) {
  try {
    await supabase(env, "/rest/v1/unrecognized_inputs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        room_id: kakaoEditConversationScope(payload).slice(0, 120),
        user_id: String(entry.userKey || "").slice(0, 120),
        entry_no: String(entry.entryNo || "").slice(0, 10),
        input: String(entry.input || "").slice(0, 300),
        attempt: Number(entry.attempt || 0) || null,
        type: String(entry.type || "unrecognized").slice(0, 40),
      }),
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
        `다시 하려면: 수정 ${session.entryNo}번 지출자 엄마`;
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
    return { reply: `수정하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘 기록 보기’로 번호를 다시 확인해 주세요.`, nextSession: null };
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
      return { reply: "지출자는 가계부 소유자·관리자만 바꿀 수 있어요. 기록은 그대로예요.\n금액·분류·결제수단·내용·날짜는 바꿀 수 있어요.", nextSession: null };
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
            `👉 수정 ${session.entryNo}번 지출자 ${options[0].label}\n` +
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
    await updateTransaction(env, session.entryId, patch, { householdId: session.householdId });
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
      return sendKakaoEditReplyV4(env, ctx, session, "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요. 가계부 관리자에게 권한을 확인한 뒤 ‘오늘 기록 보기’부터 다시 시작해 주세요.", null);
    }
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
      return sendKakaoEditReplyV4(env, ctx, session, `삭제하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘 기록 보기’로 번호를 다시 확인해 주세요.`, null);
    }
    const seq = Number(session.entryNo) || 0;
    try {
      await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: session.householdId, householdName: session.householdName || "" }, row, seq);
    } catch (err) {
      return sendKakaoEditReplyV4(env, ctx, session, kakaoEditDeleteFailedTextV4(err, row, seq), null);
    }
    return sendKakaoEditReplyV4(env, ctx, session, kakaoEditDeletedTextV4(row, seq), null);
  }
  // ask_value / confirm / reprompt / cancel — 모듈의 reply와 nextSession을 그대로 따른다.
  return sendKakaoEditReplyV4(env, ctx, session, result?.reply || "", result?.nextSession || null);
}

// 3장 3단계: 유효 세션 보유 사용자의 메시지는 전부 이 경로가 소비한다.
async function handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin, newTransaction = false }) {
  const session = await getKakaoEditSessionV4(env, kakaoUserKey, payload);
  if (!session) return null;
  // T6: 시간이 지난 세션은 없는 것으로 본다. 다음 말(새 지출·조회)을 만료 안내로 삼키지 않는다.
  if (isSessionExpired(session, Date.now())) {
    try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); } catch (_) {}
    return null;
  }
  // T6: 항목 이름 없이 온 분명한 새 기록(금액+내용)은 수정 값이 아니다. 세션을 끝내고 기록 경로로 넘긴다.
  if (newTransaction && !startsWithKakaoEditField(utterance)) {
    await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
    return { passThrough: true, notice: `✏️ ${session.entryNo}번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.\n` };
  }
  const text = isKakaoEditCancelCommand(utterance) ? "취소" : utterance;
  const config = await buildKakaoEditConfigV4(env, session.householdId);
  const result = handleEditMessage(session, text, { ...config, now: Date.now() });
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin }, session, result, config);
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
  const config = await buildKakaoEditConfigV4(env, household.id);
  const result = handleEditMessage(session, rest, { ...config, now: Date.now() });
  return processKakaoEditResultV4(env, { kakaoUserKey, payload, origin }, session, result, config);
}

// 3장 1·2단계 + 조회·복구: 최상위 수정 관련 명령 라우터.
// 어떤 이해 실패도 메뉴 재출력으로 이어지지 않는다(I8) — 실패는 모듈 fail 경로뿐.
async function handleKakaoEditCommandV4(env, ctx) {
  const { utterance, household, user, kakaoUserKey, payload, origin } = ctx;
  const raw = normalizeText(utterance);

  if (isKakaoEditGuideCommand(raw)) return kakaoText(kakaoEditGuideText(origin));

  if (isKakaoDailyListCommand(raw)) {
    const date = extractDate(raw);
    if (!date) return kakaoText("달력에 없는 날짜라서 기록을 찾지 않았어요.\n예: 어제 기록 보기 · 7월 10일 기록 보기");
    const rows = await getDailyKakaoRows(env, household.id, user.id, kakaoUserKey, date);
    if (!rows.length) return kakaoText([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, "", "기록이 없습니다."].join("\n"));
    // T2: 오늘이 아닌 날의 목록은 안내에도 그 날짜를 붙인다. 날짜 없는 "삭제 01번"은 오늘의 01번이다.
    const dayPrefix = kakaoEditDayPrefixV4(date);
    return kakaoText([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, "", ...rows.slice(0, 20).map((r, i) => kakaoRowLabel(r, i + 1)), "", `수정: "${dayPrefix}수정 01번" 또는 "${dayPrefix}수정 01번 금액 13000"`, `삭제: "${dayPrefix}삭제 01번"`].join("\n"));
  }

  const restoreTarget = parseKakaoRestoreCommandV4(raw);
  if (restoreTarget) {
    if (restoreTarget.invalidSeq) return kakaoText(kakaoEditTargetRejectTextV4({ seq: 0 }));
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
            const inserted = await supabase(env, "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
            restored = (Array.isArray(inserted) && inserted[0]) || body;
          } catch (err) {
            // T4: 결과를 모르거나 같은 id 가 이미 있으면 다시 넣지 않고 id 로 확인한다. id 를 뺀 재삽입은 중복을 만든다.
            if (!body.id || (!isUncertainStorageWrite(err) && !isUniqueConstraintError(err))) return { kind: "failed", undo, error: err };
            restored = await getKakaoRowById(env, targetHouseholdId, user.id, kakaoUserKey, body.id);
            if (!restored) return { kind: "failed", undo, error: err };
          }
        }
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
    if (outcome.kind === "empty") return kakaoText("복구할 삭제 기록이 없어요.\n삭제 직후 안내된 번호로만 복구할 수 있어요. ‘오늘 기록 보기’로 현재 기록을 확인해 주세요.");
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
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, deleteTarget);
    if (!row) return kakaoText(kakaoEditRowNotFoundTextV4(deleteTarget));
    try {
      await deleteKakaoRowWithUndoV4(env, { kakaoUserKey, payload, householdId: household.id, householdName: household.name }, row, seq);
    } catch (err) {
      return kakaoText(kakaoEditDeleteFailedTextV4(err, row, seq));
    }
    // 삭제는 끝났다. 남은 세션 정리가 실패해도 "다시 보내 주세요"로 바뀌면 안 된다(다시 보내면 다음 번호가 지워진다).
    try { await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null); } catch (_) {}
    return kakaoText(kakaoEditDeletedTextV4(row, seq));
  }

  const editTarget = parseKakaoEditCommandV4(raw);
  if (editTarget) {
    const rejected = kakaoEditTargetRejectTextV4(editTarget);
    if (rejected) return kakaoText(rejected);
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, editTarget);
    if (!row) return kakaoText(kakaoEditRowNotFoundTextV4(editTarget));
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: editTarget.rest });
  }

  // 번호 없는 "지출자 변경"/"지출자 엄마" — 방금 저장한 기록에 대해 같은 V4 경로로 처리
  if (isKakaoTransactionSpenderChangeCommand(raw)) {
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, { latest: true });
    if (!row) return kakaoText("변경할 최근 기록이 없어요. 먼저 ‘오늘 기록 보기’에서 번호를 확인해 주세요.");
    const value = parseKakaoSpenderChoiceValue(raw);
    return startKakaoEditFlowV4(env, ctx, { row, seq, rest: value ? `지출자 ${value}` : "지출자" });
  }

  return null;
}
// @build:exports-start
export { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 };
// @build:exports-end
