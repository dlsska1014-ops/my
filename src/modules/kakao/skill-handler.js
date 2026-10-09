// @build:imports-start
import {
  boundedRuntimeNumber, checkSkillRateLimit, nluOutcomeFromKakaoResponse, rateLimitedKakaoText,
  rememberDuplicateEvent, rememberNluRuntimeEvent, rememberSkillEvent, scheduleNluOpsPersistence,
} from "../runtime/ops-telemetry.js";
import { abMonitorOutcome } from "../runtime/ops-monitor.js";
import { APP_VERSION, publicBaseUrl } from "../public/site-config.js";
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
import { safeError } from "../runtime/leases.js";
import {
  kakaoSkillCallerAuthorized, randomEntityId, rememberSkillLatency,
} from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { kakaoReserveAlert } from "../settings/reserve-plans.js";
import { saveMemberAlias } from "../data/households-members-rows.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import { kakaoBudgetStatusText } from "../domain/budgets.js";
import { kakaoPrivateWebLinkReply } from "../auth/kakao-web-claim.js";
import {
  kakaoAmbiguityGuide, kakaoBudgetGuideText, kakaoSkillSafeFallbackText,
} from "./reply-texts.js";
import {
  detectKakaoNaturalIntent, hasKakaoImageAttachment, isCommandMenuCommand, isHouseholdSwitchCommand,
  kakaoCommandMenuText, kakaoImageNotSupportedText, kakaoPublicCommandReply,
  parseCreateHouseholdCommand,
} from "./intent-nlu.js";
import {
  dedupeQuickReplies, kakaoGroupCompatibleResponse, kakaoText,
} from "./response-builders.js";
import {
  getRecentKakaoOwnedTransactionsV2254, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4,
  parseKakaoRestoreCommandV4,
} from "./edit-session-v4.js";
import { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 } from "./edit-flow-v4.js";
import {
  armKakaoRepeatGuard, checkKakaoRepeatGuard, clearKakaoInFlight, isKakaoQaPayload,
  isStrongKakaoTransactionInput, kakaoQaRequestAllowed, kakaoRepeatGuardText,
  looksLikeKakaoEditCommandV4, normalizeKakaoSkillResponse, stripLeadingCommand,
} from "./request-guards.js";
import {
  clearKakaoFlowState, completeKakaoFlowState, getKakaoFlowState, isKakaoBudgetSetupCommand,
  isKakaoCreateFlowCommand, isKakaoJoinFlowCommand, isKakaoMemberAliasCommand, isKakaoStartCommand,
  kakaoBudgetRootQuickReplies, kakaoCreateKindQuickReplies, kakaoStartQuickReplies,
  parseDirectMemberAliasCommand, saveKakaoFlowState, shouldInterruptKakaoFlowV2254,
} from "./guided-flow-state.js";
import {
  beginKakaoHouseholdChoice, clearKakaoSelectedHousehold, getKakaoSelectedHouseholdId,
  guidedHelpText, inferKakaoCreateKind, kakaoActiveHouseholds, kakaoCreateKindPromptText,
  kakaoDateSummaryText, kakaoDirectStartText, kakaoInviteManagementText, kakaoStartText,
  kakaoUnlinkedGroupStartText, parseDirectBudgetSetCommand, parseKakaoSummaryRange,
  resolveBudgetCategoryName, sanitizeHouseholdNameInput, saveKakaoBudget, setKakaoSelectedHousehold,
} from "./household-budget-commands.js";
import {
  KAKAO_SKILL_MAX_BODY_BYTES, handleHouseholdGuidedFlow, handlePreHouseholdGuidedFlow,
  readRequestTextBounded,
} from "./guided-flows.js";
import { saveKakaoParsedTransactionsReply } from "./transaction-save.js";
import { readJson } from "../api/admin-api.js";
import {
  bindKakaoGroupByInviteCode, getExplicitKakaoBotGroupKey, getKakaoBotGroupKey,
  getLinkedKakaoGroupHousehold, kakaoGroupInfoText, readKakaoGroupFirstSnapshot,
  tryKakaoGroupFirstRecord,
} from "./group-links-first-record.js";
import {
  getKakaoIdentityAliases, getKakaoNickname, getKakaoUserKey, hasChatFirstKakaoIdentity,
  trustedChatFirstSkillCaller, tryKakaoChatFirstRecord,
} from "./identity-chat-first.js";
import { ensureUser, joinHouseholdByCode, roleBlockedMessage } from "../domain/users-households.js";
import {
  isBudgetCommand, isGroupLinkInfoCommand, isHelpCommand, isInviteCommand, isLinkCommand,
  isRecentCommand, isSettlementCommand, isSummaryCommand, isUndoCommand, kakaoSettlementText,
  parseGroupBindCommand, parseJoinCode,
} from "./simple-commands.js";
import { parseMultipleTransactions, parseTransaction } from "../nlu/transaction-parser.js";
import { currentMonthKst } from "../nlu/date-payment.js";
import {
  formatRecentTransactions, formatSummary, getMonthSummary, linkText, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

async function handleKakaoSkillStable(request, env, ctx = null) {
  const origin = publicBaseUrl(env, new URL(request.url));
  if (!kakaoSkillCallerAuthorized(request, env)) {
    abMonitorOutcome(env, "auth_denied");
    rememberSkillEvent({ kind: "caller_auth_failed", user_key: "unknown", utterance: "", detail: "missing or invalid skill authentication header" });
    return kakaoText(kakaoSkillSafeFallbackText(origin), null, 403);
  }
  let bodyText = "";
  let payload = null;
  let userKey = "unknown";
  let utterance = "";
  try {
    bodyText = await readRequestTextBounded(request);
    payload = JSON.parse(bodyText || "{}");
    userKey = getKakaoUserKey(payload);
    utterance = String(payload?.userRequest?.utterance || payload?.utterance || "").trim();
  } catch (err) {
    if (safeError(err).includes("skill_request_too_large")) {
      abMonitorOutcome(env, "error");
      rememberSkillEvent({ kind: "request_too_large", user_key: "unknown", utterance: "", detail: `max_bytes=${KAKAO_SKILL_MAX_BODY_BYTES}` });
      return kakaoText(kakaoSkillSafeFallbackText(origin));
    }
    const rawUtterance = String(bodyText || "").trim();
    if (rawUtterance && await kakaoQaRequestAllowed(request, env)) {
      payload = {
        intent: { id: "raw-test", name: "raw-text-test" },
        userRequest: {
          timezone: "Asia/Seoul",
          params: {},
          block: { id: "raw-test-block", name: "raw-text-test" },
          utterance: rawUtterance,
          lang: "ko",
          user: { id: "raw-test-bot-user-key", type: "botUserKey", properties: { botUserKey: "raw-test-bot-user-key" } },
        },
        bot: { id: "raw-test-bot", name: "말해가계부" },
        action: { id: "raw-test-action", name: "말해가계부_스킬_v21", params: {}, detailParams: {}, clientExtra: {} },
        contexts: [],
      };
      userKey = getKakaoUserKey(payload);
      utterance = rawUtterance;
      rememberSkillEvent({ kind: "raw_text_test", user_key: userKey, utterance, detail: "invalid JSON accepted as test utterance" });
    } else {
      abMonitorOutcome(env, "error");
      rememberSkillEvent({ kind: "bad_json", user_key: "unknown", utterance: "", detail: safeError(err) });
      return kakaoText(kakaoSkillSafeFallbackText(origin));
    }
  }

  if (isKakaoQaPayload(payload) && !(await kakaoQaRequestAllowed(request, env))) {
    abMonitorOutcome(env, "fallback");
    rememberSkillEvent({ kind: "qa_payload_blocked", user_key: userKey, utterance, detail: "production skill rejected a QA identity" });
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }

  // Automatic room access requires real Skill authentication even when the legacy
  // diagnostic mode is observe/off. Check before repeat caches and every command.
  const authenticatedGroupKey = getKakaoBotGroupKey(payload);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && authenticatedGroupKey &&
      !(trustedChatFirstSkillCaller(request, env) && hasChatFirstKakaoIdentity(payload, userKey))) {
    const scope = await readKakaoGroupFirstSnapshot(env, authenticatedGroupKey);
    if ((scope.done || scope.marker)?.candidate_id === scope.link?.household_id && scope.link) {
      return kakaoGroupCompatibleResponse(kakaoText("이 방의 공동 가계부는 인증된 카카오 요청에서만 사용할 수 있어요. 이 요청으로 기록을 읽거나 저장하지 않았어요. 카카오톡에서 봇을 다시 호출해 주세요."), payload, origin);
    }
  }

  const skillStartedAt = Date.now();
  const requestId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") ? globalThis.crypto.randomUUID() : randomEntityId("req");
  const intentMatch = detectKakaoNaturalIntent(utterance);
  const blockName = String(payload?.userRequest?.block?.name || payload?.intent?.name || "").slice(0, 100);
  rememberSkillEvent({ kind: "received", user_key: userKey, utterance, detail: `request_id=${requestId}; version=${APP_VERSION}; intent=${intentMatch.intent}; confidence=${intentMatch.confidence}` });

  const rate = checkSkillRateLimit(userKey, env);
  if (!rate.ok) {
    abMonitorOutcome(env, "fallback");
    rememberSkillEvent({ kind: "rate_limited", user_key: userKey, utterance, detail: `${rate.count}/${rate.limit}` });
    return kakaoGroupCompatibleResponse(rateLimitedKakaoText(origin), payload, origin);
  }

  const repeat = checkKakaoRepeatGuard(userKey, utterance, env, payload);
  if (!repeat.ok) {
    abMonitorOutcome(env, "ok");
    rememberSkillEvent({ kind: "repeat_guard", user_key: userKey, utterance, detail: `${repeat.elapsedMs}ms` });
    rememberDuplicateEvent({ kind: "kakao_repeat", source: "kakao_skill", user_id: userKey, detail: utterance, path: "/skill", method: "POST" });
    return kakaoGroupCompatibleResponse(kakaoText(kakaoRepeatGuardText(origin)), payload, origin);
  }

  try {
    const headers = new Headers(request.headers || {});
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    const cloned = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    });
    const response = await handleKakaoSkill(cloned, env);
    const normalizedResponse = await normalizeKakaoSkillResponse(response, origin);
    const safeResponse = await kakaoGroupCompatibleResponse(normalizedResponse, payload, origin);
    const latencyMs = Date.now() - skillStartedAt;
    const responsePreview = await safeResponse.clone().text();
    const outcome = nluOutcomeFromKakaoResponse(responsePreview);
    armKakaoRepeatGuard(repeat.key, responsePreview);
    clearKakaoInFlight(repeat.key);
    rememberSkillLatency(latencyMs, { intent: intentMatch.intent, result: outcome.result });
    const nluEvent = { at: new Date().toISOString(), request_id: requestId, intent: intentMatch.intent, confidence: intentMatch.confidence, result: outcome.result, reason: outcome.reason, latency_ms: latencyMs, block: blockName, version: APP_VERSION, utterance };
    rememberNluRuntimeEvent(nluEvent, env);
    scheduleNluOpsPersistence(ctx, env, nluEvent);
    rememberSkillEvent({ kind: "ok", user_key: userKey, utterance, detail: `request_id=${requestId}; intent=${intentMatch.intent}; result=${outcome.result}; status=${response.status}; normalized=${safeResponse.status}; latency_ms=${latencyMs}` });
    const safeHeaders = new Headers(safeResponse.headers || {});
    safeHeaders.set("x-kakao-skill-latency-ms", String(latencyMs));
    safeHeaders.set("x-accountbook-latency-ms", String(latencyMs));
    safeHeaders.set("x-accountbook-version", APP_VERSION);
    safeHeaders.set("x-accountbook-intent", intentMatch.intent);
    safeHeaders.set("x-accountbook-nlu-result", outcome.result);
    safeHeaders.set("x-accountbook-request-id", requestId);
    return new Response(safeResponse.body, { status: safeResponse.status, statusText: safeResponse.statusText, headers: safeHeaders });
  } catch (err) {
    const latencyMs = Date.now() - skillStartedAt;
    const nluEvent = { at: new Date().toISOString(), request_id: requestId, intent: intentMatch.intent, confidence: intentMatch.confidence, result: "error", reason: safeError(err), latency_ms: latencyMs, block: blockName, version: APP_VERSION, utterance };
    rememberNluRuntimeEvent(nluEvent, env);
    scheduleNluOpsPersistence(ctx, env, nluEvent);
    rememberSkillEvent({ kind: "error", user_key: userKey, utterance, detail: `request_id=${requestId}; intent=${intentMatch.intent}; ${safeError(err)}; latency_ms=${latencyMs}` });
    clearKakaoInFlight(repeat.key);
    rememberSkillLatency(latencyMs, { intent: intentMatch.intent, result: "error" });
    const fallback = await kakaoGroupCompatibleResponse(kakaoText(kakaoSkillSafeFallbackText(origin)), payload, origin);
    const headers = new Headers(fallback.headers || {});
    headers.set("x-accountbook-version", APP_VERSION);
    headers.set("x-accountbook-intent", intentMatch.intent);
    headers.set("x-accountbook-nlu-result", "error");
    headers.set("x-accountbook-request-id", requestId);
    headers.set("x-accountbook-latency-ms", String(latencyMs));
    return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
  }
}

async function handleKakaoSkill(request, env) {
  const handlerStartedAt = Date.now();
  const payload = await readJson(request);
  const origin = publicBaseUrl(env, new URL(request.url));
  const utterance = stripLeadingCommand(String(payload?.userRequest?.utterance || payload?.utterance || "").trim());
  const preParsedList = parseMultipleTransactions(utterance, payload);
  if (!preParsedList.length && parseTransaction(utterance,payload).message === "invalid_transaction_date") return kakaoText("달력에 없는 날짜여서 기록을 저장하지 않았어요. 날짜를 확인해 다시 보내 주세요. 연도 없는 M/D는 올해 날짜로 저장합니다.");
  const strongTransactionInput = isStrongKakaoTransactionInput(utterance, preParsedList);
  const kakaoUserKey = getKakaoUserKey(payload);
  const nickname = getKakaoNickname(payload);

  if (!utterance) {
    if (hasKakaoImageAttachment(payload)) return kakaoText(kakaoImageNotSupportedText(origin));
    return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));
  }

  const bypassPublic = isKakaoStartCommand(utterance) || isHelpCommand(utterance) || isCommandMenuCommand(utterance) ||
    isKakaoCreateFlowCommand(utterance) || isKakaoJoinFlowCommand(utterance) || isKakaoBudgetSetupCommand(utterance) ||
    isKakaoMemberAliasCommand(utterance) || !!parseKakaoSummaryRange(utterance);
  const earlyReply = strongTransactionInput || bypassPublic ? "" : kakaoPublicCommandReply(utterance, origin, env);
  const skillConfigured = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const botGroupKey = getKakaoBotGroupKey(payload);
  const trustedIdentity = trustedChatFirstSkillCaller(request, env) && hasChatFirstKakaoIdentity(payload, kakaoUserKey);
  const seedChatFirst = !botGroupKey && trustedIdentity;
  const groupFirstRecord = !!botGroupKey && trustedIdentity && strongTransactionInput && getExplicitKakaoBotGroupKey(payload) === botGroupKey;

  // V22.9.16: 사용자 행 조회는 수정 세션 확인과 서로 필요 없다. 먼저 던져 두고 아래에서 받는다.
  // 공개 응답으로 끝나는 발화는 예전처럼 사용자 행을 만들지 않도록 여기서는 던지지 않는다.
  const earlyUserPromise = skillConfigured && kakaoUserKey && !earlyReply
    ? ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { seedChatFirst, create: trustedChatFirstSkillCaller(request, env) }).then((user) => ({ user }), (error) => ({ error }))
    : null;

  // V22.8.16 지침서 3장 3단계: 유효한 수정 세션이 있으면 메시지 전체를
  // handleEditMessage가 소비하고 다른 어떤 핸들러로도 보내지 않는다.
  // (새 "수정/삭제/복구 NN번" 명령은 아래 본 라우터의 1·2단계에서 새로 시작한다.)
  let editSessionNotice = "";
  if (skillConfigured && kakaoUserKey &&
      !parseKakaoEditCommandV4(utterance) && !parseKakaoDeleteCommandV4(utterance) && !parseKakaoRestoreCommandV4(utterance)) {
    // T6: 분명한 새 기록이면 세션만 끝나고(passThrough) 아래 기록 경로로 이어진다.
    const editSessionReply = await handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin, newTransaction: strongTransactionInput });
    if (editSessionReply?.passThrough) editSessionNotice = String(editSessionReply.notice || "");
    else if (editSessionReply) return editSessionReply;
  }

  if (earlyReply) {
    if (skillConfigured && isLinkCommand(utterance)) return kakaoText(await kakaoPrivateWebLinkReply(request, env, payload, kakaoUserKey, nickname, origin));
    return kakaoText(earlyReply);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!strongTransactionInput && isCommandMenuCommand(utterance)) return kakaoText(kakaoCommandMenuText(origin));
    if (!strongTransactionInput && isKakaoStartCommand(utterance) || isHelpCommand(utterance)) return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));
    if (!strongTransactionInput && isBudgetCommand(utterance) || isKakaoBudgetSetupCommand(utterance)) return kakaoText(kakaoBudgetGuideText(origin));
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }

  if (!kakaoUserKey) {
    return kakaoText("사용자 식별정보를 확인하지 못했어요. 카카오톡에서 봇을 다시 호출해 주세요. 같은 문제가 계속되면 관리자에게 요청 ID와 함께 문의해 주세요.");
  }
  const earlyUser = earlyUserPromise ? await earlyUserPromise : null;
  if (earlyUser?.error) throw earlyUser.error;
  const user = earlyUser?.user || await ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { seedChatFirst, create: trustedChatFirstSkillCaller(request, env) });
  if (!user?.id) return kakaoText("skill_identity_untrusted: \uC778\uC99D\uB41C \uCE74\uCE74\uC624 \uC694\uCCAD\uC5D0\uC11C \uCC98\uC74C \uAE30\uB85D\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");

  // V22.9.16: 가계부 목록·단톡방 연결·선택 가계부는 거의 모든 발화가 결국 읽는다. 흐름 상태
  // 조회와 나란히 던져 두고 필요한 자리에서 받는다. 가계부를 바꾸는 길(만들기·참여·연결)은
  // 전부 아래 사용 지점 전에 응답하고 끝나므로 미리 읽은 값이 낡을 일이 없다.
  const householdsPromise = fetchUserHouseholds(env, user.id).then((rows) => ({ value: rows }), (error) => ({ error }));
  const linkedGroupPromise = botGroupKey && !groupFirstRecord
    ? getLinkedKakaoGroupHousehold(env, botGroupKey).then((value) => ({ value }), (error) => ({ error }))
    : Promise.resolve({ value: null });
  const selectedHouseholdIdPromise = botGroupKey
    ? Promise.resolve({ value: "" })
    : getKakaoSelectedHouseholdId(env, user.id).then((value) => ({ value }), (error) => ({ error }));
  const settle = async (promise) => { const result = await promise; if (result.error) throw result.error; return result.value; };

  if (!strongTransactionInput && isCommandMenuCommand(utterance)) {
    return kakaoText(kakaoCommandMenuText(origin));
  }

  if (!strongTransactionInput && isKakaoStartCommand(utterance)) {
    await clearKakaoFlowState(env, user.id, payload);
    const [households, linkedGroupHousehold, selectedHouseholdId] = await Promise.all([
      settle(householdsPromise),
      settle(linkedGroupPromise),
      settle(selectedHouseholdIdPromise),
    ]);
    const active = kakaoActiveHouseholds(households);
    if (botGroupKey) {
      if (!linkedGroupHousehold?.id) {
        return kakaoText(kakaoUnlinkedGroupStartText(active, origin), dedupeQuickReplies([["가계부 선택", "가계부 전환"], ["가계부 만들기", "새 가계부 만들기"], ["초대코드 참여", "초대코드로 참여"]]));
      }
      const membership = active.find((h) => String(h.id) === String(linkedGroupHousehold.id));
      const linked = { ...linkedGroupHousehold, role: membership?.role || "pending" };
      return kakaoText([`📒 이 단톡방 연결 가계부: ${linked.name}`, `내 권한: ${userHouseholdRoleLabel(linked.role)}`, "", "이 방의 기록·예산·요약은 이 가계부 기준으로만 처리합니다."].join("\n"), kakaoStartQuickReplies(true));
    }
    if (!active.length) return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));
    const current = active.find((h) => String(h.id) === String(selectedHouseholdId || "")) || null;
    if (!current) {
      if (selectedHouseholdId) await clearKakaoSelectedHousehold(env, user.id);
      const choice = await beginKakaoHouseholdChoice(env, { user, payload, households: active, action: "select", origin, forceChoice: true });
      return kakaoText(choice.text, choice.quickReplies || []);
    }
    return kakaoText(kakaoDirectStartText(current, active), kakaoStartQuickReplies(true));
  }

  if (isHelpCommand(utterance)) {
    const [households, linkedGroupHousehold] = await Promise.all([
      settle(householdsPromise),
      settle(linkedGroupPromise),
    ]);
    const active = kakaoActiveHouseholds(households);
    if (botGroupKey && !linkedGroupHousehold?.id) {
      return kakaoText(kakaoUnlinkedGroupStartText(active, origin), dedupeQuickReplies([["가계부 선택", "가계부 전환"], ["가계부 만들기", "새 가계부 만들기"], ["초대코드 참여", "초대코드로 참여"]]));
    }
    if (botGroupKey && linkedGroupHousehold?.id) {
      return kakaoText(`${guidedHelpText(true)}\n\n현재 단톡방 연결 가계부: ${linkedGroupHousehold.name}`, kakaoStartQuickReplies(true));
    }
    return kakaoText(guidedHelpText(!!active.length), kakaoStartQuickReplies(!!active.length));
  }

  const activeFlowBeforeRouting = await getKakaoFlowState(env, user.id, payload);
  if (activeFlowBeforeRouting && ["create_household", "join_household", "household_choice"].includes(activeFlowBeforeRouting.flow)) {
    if (shouldInterruptKakaoFlowV2254(activeFlowBeforeRouting, utterance)) {
      await clearKakaoFlowState(env, user.id, payload);
    } else {
      const activePreFlow = await handlePreHouseholdGuidedFlow(env, { utterance, user, payload, nickname, origin });
      if (activePreFlow) return kakaoText(activePreFlow.text, activePreFlow.quickReplies || []);
    }
  }

  if (!strongTransactionInput && isKakaoCreateFlowCommand(utterance)) {
    const directName = sanitizeHouseholdNameInput(parseCreateHouseholdCommand(utterance));
    if (directName) {
      const kind = inferKakaoCreateKind(directName) || "직접 입력";
      await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "confirm_name", data: { kind, name: directName }, attempts: 0 });
      return kakaoText([`가계부 이름: ${directName}`, kind !== "직접 입력" ? `용도: ${kind}` : "", "", "이 이름으로 만들까요?"].filter(Boolean).join("\n"), dedupeQuickReplies([["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["취소", "취소"]]));
    }
    await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "kind", data: {} });
    return kakaoText(kakaoCreateKindPromptText(), kakaoCreateKindQuickReplies());
  }

  if (!strongTransactionInput && isKakaoJoinFlowCommand(utterance)) {
    await saveKakaoFlowState(env, user.id, payload, { flow: "join_household", step: "code", data: {} });
    return kakaoText("초대코드를 입력해 주세요.\n예: ABC123", [["취소", "취소"]]);
  }

  const createHouseholdName = sanitizeHouseholdNameInput(parseCreateHouseholdCommand(utterance));
  if (createHouseholdName) {
    const kind = inferKakaoCreateKind(createHouseholdName) || "직접 입력";
    await saveKakaoFlowState(env, user.id, payload, { flow: "create_household", step: "confirm_name", data: { kind, name: createHouseholdName }, attempts: 0 });
    return kakaoText([`가계부 이름: ${createHouseholdName}`, kind !== "직접 입력" ? `용도: ${kind}` : "", "", "이 이름으로 만들까요?"].filter(Boolean).join("\n"), [["이 이름으로 만들기", "이 이름으로 만들기"], ["이름 다시 입력", "이름 다시 입력"], ["취소", "취소"]]);
  }

  if (!strongTransactionInput && isHouseholdSwitchCommand(utterance)) {
    const households = await settle(householdsPromise);
    const choice = await beginKakaoHouseholdChoice(env, { user, payload, households, action: botGroupKey ? "bind" : "select", origin, groupKey: botGroupKey, forceChoice: !!botGroupKey });
    return kakaoText(choice.text, choice.quickReplies || []);
  }

  const groupBindCode = parseGroupBindCommand(utterance);
  if (groupBindCode) {
    const result = await bindKakaoGroupByInviteCode(env, user, botGroupKey, groupBindCode);
    if (!result.ok) {
      if (result.error === "no_group_key") return kakaoText("👥 단톡방 연결은 그룹 채팅방 안에서만 사용할 수 있어요.\n\n단톡방에 봇을 추가한 뒤 아래처럼 보내주세요.\n단톡방 연결 ABC123");
      if (result.error === "not_found") return kakaoText(`초대코드 ${groupBindCode}를 찾지 못했어요. 코드를 다시 확인해 주세요.`);
      if (result.error === "not_allowed") return kakaoText("단톡방 연결은 해당 가계부의 소유자 또는 관리자만 할 수 있어요. 웹 로그인 계정과 카카오 계정이 분리되어 있다면 계정 감사 화면에서 먼저 확인해 주세요.");
      if (result.error === "not_allowed_current") return kakaoText(`이 단톡방은 현재 ‘${result.current?.name || "다른 가계부"}’에 연결되어 있어요. 연결을 바꾸려면 현재 연결 가계부와 새 가계부 양쪽에서 소유자 또는 관리자 권한이 필요해요.`);
      if (result.error === "replace_confirmation_required") {
        await saveKakaoFlowState(env, user.id, payload, { flow: "household_choice", step: "confirm_bind", data: { action: "bind", group_key: botGroupKey, target_household_id: result.household?.id || "", current_household_id: result.current?.id || "" } });
        return kakaoText(["단톡방 연결을 변경할까요?", result.current?.name ? `현재: ${result.current.name}` : "현재: 연결되지 않음", `변경: ${result.household?.name || "가계부"}`, "", "연결하려면 ‘응’ 또는 ‘연결하기’를 입력해 주세요."].join("\n"), [["연결하기", "연결하기"], ["취소", "취소"]]);
      }
      return kakaoText("단톡방 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (result.already_linked) return kakaoText(`이 단톡방은 이미 ‘${result.household.name}’ 가계부에 연결되어 있어요.`, kakaoStartQuickReplies(true));
    return kakaoText(`✅ 단톡방 연결 완료\n가계부: ${result.household.name}\n\n이제 이 방에서 구성원들이 함께 기록하고 조회할 수 있어요.`, [["기록 방법", "기록 방법"], ["예산 설정", "예산 설정"], ["이번 달 요약", "이번 달 요약"]]);
  }

  if (!strongTransactionInput && isGroupLinkInfoCommand(utterance)) {
    return kakaoText(await kakaoGroupInfoText(env, payload, origin, user), [["연결 방법", "단톡방 연결"], ["초대코드", "초대코드"]]);
  }

  const joinCode = strongTransactionInput ? "" : parseJoinCode(utterance);
  if (joinCode) {
    try {
      const joined = await joinHouseholdByCode(env, user.id, joinCode);
      if (!joined) return kakaoText(`초대코드 ${joinCode}를 찾지 못했어요. 코드를 다시 확인해 주세요.`);
      if (!["pending","blocked"].includes(joined.join_role)) await setKakaoSelectedHousehold(env, user.id, joined.id);
      if (["pending","blocked","viewer"].includes(joined.join_role)) return kakaoText(roleBlockedMessage(joined.join_role, joined.name) || `🕒 ‘${joined.name}’ 참여 요청을 보냈어요.`);
      return kakaoText(`✅ ‘${joined.name}’ 가계부에 참여했어요.\n\n이제 ‘점심 12000원 국민카드’처럼 바로 기록할 수 있어요.`, kakaoStartQuickReplies(true));
    } catch (err) {
      return kakaoText("초대코드 확인이 잠시 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // V22.9.31: a trusted, explicit room record is its own lifecycle operation. Public
  // conversation and manual creation/join/bind flows above never grant automatic membership.
  if (groupFirstRecord) {
    const limit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
    if (preParsedList.length > limit) return kakaoText(`한 번에 ${limit}건까지 입력할 수 있어요. ${preParsedList.length}건 모두 저장하지 않았어요. 내용을 나눠 다시 보내 주세요.`);
    const tooLarge = preParsedList.find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
    if (tooLarge) return kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
    return await tryKakaoGroupFirstRecord(env, { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, groupKey: botGroupKey });
  }

  // V21.5.1: 회원목록과 그룹 연결을 병렬 조회하고 결과를 재사용해 중복 Supabase 왕복을 줄입니다.
  // V22.9.16: 그 조회는 이미 위에서 흐름 상태와 나란히 던져 두었다. 여기서는 받기만 한다.
  let [households, linkedGroupHousehold, selectedHouseholdId] = await Promise.all([
    settle(householdsPromise),
    settle(linkedGroupPromise),
    settle(selectedHouseholdIdPromise),
  ]);
  const pendingHousehold = households.find((h) => String(h.role || "") === "pending") || null;
  let activeHouseholds = households.filter((h) => !["pending", "blocked"].includes(String(h.role || "member")));
  if (botGroupKey && !linkedGroupHousehold?.id && !isInviteCommand(utterance)) {
    return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, { writeRejected: true }), dedupeQuickReplies([["가계부 선택", "가계부 전환"], ["연결 방법", "단톡방 연결"], ["가계부 만들기", "새 가계부 만들기"]]));
  }
  if (pendingHousehold && !activeHouseholds.length && !isHelpCommand(utterance) && !isLinkCommand(utterance) && !isInviteCommand(utterance)) {
    return kakaoText(`🕒 아직 승인 대기 중입니다.\n가계부: ${pendingHousehold.name}\n\n관리자가 참여자를 승인해야 기록할 수 있어요.`);
  }
  if (!botGroupKey && seedChatFirst && strongTransactionInput && !selectedHouseholdId &&
      (!households.length || (households.length === 1 && households[0].role === "owner"))) {
    const tooLarge = preParsedList.slice(0, boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80)).find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
    if (tooLarge) return kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
    const firstReply = await tryKakaoChatFirstRecord(env, { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, selectedHouseholdId });
    if (firstReply) return firstReply;
    // A queued first request may have published the one personal household meanwhile.
    [households, selectedHouseholdId] = await Promise.all([fetchUserHouseholds(env, user.id), getKakaoSelectedHouseholdId(env, user.id)]);
    activeHouseholds = households.filter((h) => !["pending", "blocked"].includes(String(h.role || "member")));
  }
  if (!households.length) return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));

  let household = null;
  let accessRole = "";
  if (botGroupKey) {
    if (!linkedGroupHousehold?.id) {
      if (!strongTransactionInput && isInviteCommand(utterance)) {
        const choice = await beginKakaoHouseholdChoice(env, { user, payload, households: activeHouseholds, action: "invite", origin, groupKey: botGroupKey });
        return kakaoText(choice.text, choice.quickReplies || []);
      }
      return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, { writeRejected: true }), dedupeQuickReplies([["가계부 선택", "가계부 전환"], ["연결 방법", "단톡방 연결"], ["가계부 만들기", "새 가계부 만들기"]]));
    }
    household = { ...linkedGroupHousehold, from_group_link: true, bot_group_key: botGroupKey };
    const membership = households.find((h) => String(h.id) === String(linkedGroupHousehold.id));
    accessRole = membership?.role || "";
    if (!accessRole) return kakaoText("\uC774 \uBC29\uC758 \uAC00\uACC4\uBD80\uC5D0 \uCC38\uC5EC\uD558\uC9C0 \uC54A\uC558\uC5B4\uC694. \uAC1C\uC778 \uB300\uD654\uC5D0\uC11C \uCD08\uB300\uCF54\uB4DC\uB85C \uCC38\uC5EC\uD574 \uC8FC\uC138\uC694.");
  } else {
    household = activeHouseholds.find((h) => String(h.id) === String(selectedHouseholdId || "")) || null;
    if (!household && selectedHouseholdId) await clearKakaoSelectedHousehold(env, user.id);
    if (!household && activeHouseholds.length) {
      const choice = await beginKakaoHouseholdChoice(env, {
        user, payload, households: activeHouseholds,
        action: isInviteCommand(utterance) ? "invite" : "select",
        origin, forceChoice: true,
      });
      return kakaoText(choice.text, choice.quickReplies || []);
    }
    accessRole = household?.role || "";
  }
  if (!household) return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));

  // pending/blocked는 어떤 데이터 조회도 허용하지 않는다. viewer는 조회 명령만 허용한다.
  if (["pending", "blocked"].includes(accessRole)) {
    return kakaoText(roleBlockedMessage(accessRole, household.name));
  }
  if (accessRole === "viewer") {
    const viewerReadCommand = isHelpCommand(utterance)
      || isSummaryCommand(utterance)
      || isRecentCommand(utterance)
      || isBudgetCommand(utterance)
      || isSettlementCommand(utterance)
      || !!parseKakaoSummaryRange(utterance)
      || isHouseholdSwitchCommand(utterance);
    if (!viewerReadCommand) return kakaoText(roleBlockedMessage(accessRole, household.name));
  }

  // V22.1: 짧고 모호한 표현은 임의 실행하지 않고 관련 선택지로 한 번만 명확화합니다.
  const ambiguityReply = kakaoAmbiguityGuide(utterance, origin);
  if (ambiguityReply) {
    rememberSkillEvent({ kind: "clarify", user_key: kakaoUserKey, utterance, detail: `reason=${ambiguityReply.reason || "unknown"}` });
    return kakaoText(ambiguityReply.text, ambiguityReply.quickReplies || []);
  }

  const directAlias = strongTransactionInput ? "" : parseDirectMemberAliasCommand(utterance);
  if (directAlias) {
    await saveMemberAlias(env, household.id, user.id, directAlias);
    const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
    return kakaoText(`✅ 가계부: ${household.name}
이 가계부에서 내 이름을 ‘${directAlias}’로 변경했어요.\n\n앞으로 내가 기록한 지출은 ${directAlias} 지출로 집계됩니다.` + cleanupNotice, [["이번 달 요약", "이번 달 요약"], ["기록 방법", "기록 방법"]]);
  }

  if (!strongTransactionInput && isKakaoMemberAliasCommand(utterance)) {
    await saveKakaoFlowState(env, user.id, payload, { flow: "member_alias", step: "name", data: { household_id: household.id } });
    return kakaoText("가계부에서 표시할 내 이름을 입력해 주세요.\n예: 인남, 엄마, 아빠\n\n한 번에 바꾸려면 ‘닉네임 인남으로 변경’처럼 입력할 수도 있어요.", nickname ? [[nickname.slice(0,14), nickname], ["취소", "취소"]] : [["취소", "취소"]]);
  }

  if (!strongTransactionInput && isKakaoBudgetSetupCommand(utterance)) {
    if (!["owner","admin"].includes(accessRole)) return kakaoText("예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.", [["예산 현황", "남은 예산"]]);
    await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "root", data: { household_id: household.id, month: currentMonthKst() } });
    return kakaoText("어떤 예산을 설정할까요?", kakaoBudgetRootQuickReplies());
  }

  if (!strongTransactionInput) {
    const guided = await handleHouseholdGuidedFlow(env, { utterance, user, payload, household, nickname, origin });
    if (guided) return kakaoText(guided.text, guided.quickReplies || []);
  }

  const directBudget = parseDirectBudgetSetCommand(utterance);
  if (directBudget) {
    if (!["owner","admin"].includes(accessRole)) return kakaoText("예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.");
    const category = await resolveBudgetCategoryName(env, household.id, directBudget.category);
    if (!category) return kakaoText("등록된 카테고리를 찾지 못했어요.\n‘예산 설정’을 입력해 단계별로 선택해 주세요.", [["예산 설정", "예산 설정"]]);
    await saveKakaoBudget(env, household.id, directBudget.month, category, directBudget.amount);
    return kakaoText(`✅ ${directBudget.month} ${category === "__total" ? "전체 월" : category} 예산을 설정했어요.\n\n설정 금액: ${numberWithCommas(directBudget.amount)}원`, [["예산 현황", "남은 예산"], ["다른 예산", "예산 설정"]]);
  }

  // V22.8.16 지침서 3장 1·2단계: "수정 NN번"·"삭제 NN번"·"복구"·기록 조회.
  // isStrongKakaoTransactionInput이 수정 명령 패턴을 이미 제외하므로 게이트 불필요.
  if (!directBudget && moneyTokenSpans(utterance).length && /(?:^|\s)예산(?=\s|$)/.test(utterance)) return kakaoText(kakaoBudgetGuideText(origin));
  const kakaoEditCommandReply = strongTransactionInput ? null : await handleKakaoEditCommandV4(env, { utterance, household, user, kakaoUserKey, payload, origin });
  if (kakaoEditCommandReply) return kakaoEditCommandReply;

  if (!strongTransactionInput && isLinkCommand(utterance)) return kakaoText(linkText(origin, household.invite_code));

  if (!strongTransactionInput && isInviteCommand(utterance)) {
    return kakaoText(kakaoInviteManagementText(household, origin), [["단톡방 연결", "단톡방 연결"], ["도움말", "도움말"]]);
  }

  if (!strongTransactionInput && isBudgetCommand(utterance)) return kakaoText(await kakaoBudgetStatusText(env, household.id, currentMonthKst(), origin, household.name));

  if (!strongTransactionInput && isSettlementCommand(utterance)) return kakaoText(await kakaoSettlementText(env, household));

  const summaryRange = parseKakaoSummaryRange(utterance);
  if (summaryRange) return kakaoText(await kakaoDateSummaryText(env, household, user, summaryRange, origin));

  if (!strongTransactionInput && isSummaryCommand(utterance)) {
    const summary = await getMonthSummary(env, household.id, currentMonthKst());
    const reserveLine = await kakaoReserveAlert(env, household.id);
    return kakaoText(`${formatSummary(summary, currentMonthKst())}
가계부: ${household.name}${reserveLine}`);
  }

  if (!strongTransactionInput && isRecentCommand(utterance)) {
    const rows = await getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 5);
    return kakaoText(`📒 가계부: ${household.name}
${formatRecentTransactions(rows)}`);
  }

  if (!strongTransactionInput && isUndoCommand(utterance)) {
    return kakaoText("삭제할 기록의 번호를 먼저 확인해 주세요.\n예: 오늘 기록 보기 → 삭제 01번\n\n방금 입력을 지우려면 ‘방금 삭제’라고 입력해 주세요.\n삭제한 기록은 ‘복구’로 되돌릴 수 있어요.");
  }

  if (!preParsedList.length && preParsedList.blocked?.message === "amount_unit_required") {
    // V22.9.34 감사 N11: 가계부 선택 같은 흐름을 먼저 본 뒤, 저장 직전에 한 자리 금액을 다시 묻는다.
    const small = preParsedList.blocked.amount;
    return kakaoText(`금액이 ${small}원으로 읽혀 저장하지 않았어요. 정말 ${small}원이면 "${small}원"처럼 원을 붙여 다시 보내 주세요.`);
  }
  // D3: 날짜를 읽지 못한 수정·삭제 명령("지난주 금요일 01번 금액 5000")이 여기까지 오면 새 기록으로 저장하지 않는다.
  if (looksLikeKakaoEditCommandV4(utterance)) return kakaoText("수정·삭제 명령으로 보여서 새 기록으로 저장하지 않았어요.\n날짜는 이렇게 붙여 주세요.\n어제 수정 01번 금액 13000\n7월 10일 삭제 01번");
  return await saveKakaoParsedTransactionsReply(env, { household, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, firstNotice: editSessionNotice });
}
// @build:exports-start
export { handleKakaoSkillStable };
// @build:exports-end
