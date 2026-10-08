
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
async function applyKakaoEditFieldV4(env, { session, field, value, config, kakaoUserKey, moduleReply }) {
  const row = await getKakaoRowById(env, session.householdId, session.userId, kakaoUserKey, session.entryId);
  if (!row) {
    return { reply: `수정하려던 ${session.entryNo}번 기록을 찾지 못했어요.\n‘오늘 기록 보기’로 번호를 다시 확인해 주세요.`, nextSession: null };
  }
  const patch = {};
  if (field === "amount") {
    const amount = Number(String(value).replace(/[^\d]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        reply: `⚠️ 금액은 1 이상의 숫자로 보내주세요. 예: 13000`,
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
    patch.transaction_date = extractDate(String(value));
  } else if (field === "payer") {
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
    await updateTransaction(env, session.entryId, patch);
  } catch (err) {
    return {
      reply: `입력은 확인했어요. 지금 저장이 잠시 지연되고 있어요.\n잠시 후 같은 내용을 한 번만 다시 보내주세요.`,
      nextSession: { ...session, updatedAt: Date.now() },
    };
  }
  return { reply: moduleReply, nextSession: null };
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
  if (["apply", "delete"].includes(String(result?.action || ""))) {
    const currentRole = String(await getHouseholdMemberRole(env, session.userId, session.householdId) || "").toLowerCase();
    if (!canWriteMyHousehold(currentRole)) {
      return sendKakaoEditReplyV4(env, ctx, session, "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요. 가계부 관리자에게 권한을 확인한 뒤 ‘오늘 기록 보기’부터 다시 시작해 주세요.", null);
    }
  }
  if (result?.action === "apply") {
    const applied = await applyKakaoEditFieldV4(env, { session, field: result.field, value: result.value, config, kakaoUserKey, moduleReply: result.reply });
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
    // 조회 select 목록에는 household_id가 없다 — 복구 INSERT의 NOT NULL 컬럼이므로 버퍼에 채워 저장한다.
    await saveKakaoEditUndoV4(env, kakaoUserKey, payload, { row: { ...row, household_id: session.householdId }, seq: Number(session.entryNo) || 0 });
    await deleteKakaoRowById(env, row.id);
    return sendKakaoEditReplyV4(env, ctx, session, result.reply, null);
  }
  // ask_value / confirm / reprompt / cancel — 모듈의 reply와 nextSession을 그대로 따른다.
  return sendKakaoEditReplyV4(env, ctx, session, result?.reply || "", result?.nextSession || null);
}

// 3장 3단계: 유효 세션 보유 사용자의 메시지는 전부 이 경로가 소비한다.
async function handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin }) {
  const session = await getKakaoEditSessionV4(env, kakaoUserKey, payload);
  if (!session) return null;
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
    const rows = await getDailyKakaoRows(env, household.id, user.id, kakaoUserKey, date);
    if (!rows.length) return kakaoText([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, "", "기록이 없습니다."].join("\n"));
    return kakaoText([`🧾 ${date} 기록`, `가계부: ${household.name || "가계부"}`, "", ...rows.slice(0, 20).map((r, i) => kakaoRowLabel(r, i + 1)), "", `수정: "수정 01번" 또는 "수정 01번 금액 13000"`, `삭제: "삭제 01번"`].join("\n"));
  }

  const restoreTarget = parseKakaoRestoreCommandV4(raw);
  if (restoreTarget) {
    const undo = await takeKakaoEditUndoV4(env, kakaoUserKey, payload, restoreTarget.seq);
    if (!undo) return kakaoText("복구할 삭제 기록이 없어요.\n삭제 직후 안내된 번호로만 복구할 수 있어요. ‘오늘 기록 보기’로 현재 기록을 확인해 주세요.");
    // 조회 select 목록에는 household_id가 없어 과거 버퍼에는 빠져 있을 수 있다.
    // NOT NULL 컬럼이므로 재삽입 전에 반드시 채운다.
    const baseRow = { ...undo.row, household_id: undo.row.household_id || household.id };
    let restored = null;
    // 직전 시도가 응답 단계에서만 실패해 이미 복구됐을 수 있으므로 먼저 존재를 확인한다.
    if (baseRow.id) {
      restored = await getKakaoRowById(env, baseRow.household_id, user.id, kakaoUserKey, baseRow.id);
    }
    let lastError = null;
    if (!restored) {
      // id가 생성 전용 컬럼이거나 충돌하는 환경을 대비해 id·created_at 제외 재시도까지 순차 수행한다.
      const attempts = [baseRow];
      if (baseRow.id !== undefined) {
        const withoutId = { ...baseRow };
        delete withoutId.id;
        attempts.push(withoutId);
        const withoutCreatedAt = { ...withoutId };
        delete withoutCreatedAt.created_at;
        attempts.push(withoutCreatedAt);
      }
      for (const body of attempts) {
        try {
          const inserted = await supabase(env, "/rest/v1/transactions", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(body),
          });
          restored = (Array.isArray(inserted) && inserted[0]) || body;
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
        }
      }
    }
    if (!restored) {
      await logKakaoEditTelemetryV4(env, payload, { userKey: kakaoUserKey, entryNo: twoDigitSeq(Number(undo.seq || 0)), input: String((lastError && lastError.message) || lastError || "").slice(0, 280), type: "restore_error" });
      return kakaoText("복구가 잠시 지연되고 있어요. 잠시 후 다시 ‘복구’를 입력해 주세요.\n계속 안 되면 ‘오늘 기록 보기’에서 확인 후 새로 입력해 주세요.");
    }
    // 실제 복구가 확인된 뒤에만 버퍼를 비운다. INSERT 실패 중에는 다음 재시도 기회를 보존한다.
    await clearKakaoEditUndoV4(env, kakaoUserKey, payload, undo);
    const seq = (await dailySeqForKakaoRow(env, household.id, user.id, kakaoUserKey, restored)) || Number(undo.seq || 0) || 1;
    return kakaoText(`↩️ 기록을 복구했어요.\n${kakaoRowLabel(restored, seq)}`);
  }

  const deleteTarget = parseKakaoDeleteCommandV4(raw);
  if (deleteTarget) {
    const { row, seq } = await resolveKakaoEditTargetRowV4(env, ctx, deleteTarget);
    if (!row) return kakaoText(kakaoEditRowNotFoundTextV4(deleteTarget));
    // 조회 select 목록에는 household_id가 없다 — 복구 INSERT의 NOT NULL 컬럼이므로 버퍼에 채워 저장한다.
    await saveKakaoEditUndoV4(env, kakaoUserKey, payload, { row: { ...row, household_id: household.id }, seq });
    await deleteKakaoRowById(env, row.id);
    await saveKakaoEditSessionV4(env, kakaoUserKey, payload, null);
    return kakaoText(`🗑️ ${twoDigitSeq(seq)}번 기록을 삭제했어요.\n되돌리려면: 복구 ${twoDigitSeq(seq)}번`);
  }

  const editTarget = parseKakaoEditCommandV4(raw);
  if (editTarget) {
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
