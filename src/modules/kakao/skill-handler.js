// @build:imports-start
import {
  boundedRuntimeNumber, checkSkillRateLimit, kakaoNluMarkV229148, markKakaoNluOutcomeV229148,
  nluOutcomeFromKakaoResponse, rateLimitedKakaoText, rememberDuplicateEvent,
  rememberNluRuntimeEvent, rememberOpsEvent, rememberSkillEvent, scheduleNluOpsPersistence,
} from "../runtime/ops-telemetry.js";
import { abMonitorOutcome } from "../runtime/ops-monitor.js";
import { APP_VERSION, publicBaseUrl } from "../public/site-config.js";
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
import { foreignCurrencyAmountIn } from "../client/shared-input-nlu.js";
import {
  deferKakaoAfterReply, finishKakaoMessageLeases, runKakaoAfterReply, safeError,
} from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import {
  kakaoSkillCallerAuthorized, randomEntityId, rememberSkillLatency, sha256Hex,
} from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { kakaoReserveAlert } from "../settings/reserve-plans.js";
import { bestRoleFromRows, saveMemberAlias } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { refundAdjustedStats } from "../domain/refund-links.js";
import { loadRefundDeductions } from "../features/settlement-refund-links.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import { canManageMyHousehold } from "../my/access-control.js";
import { kakaoBudgetStatusParts } from "../domain/budgets.js";
import { kakaoPrivateWebLinkReply } from "../auth/kakao-web-claim.js";
import { afterKakaoSkillIdentityWork } from "../auth/kakao-account-link.js";
import {
  kakaoAmbiguityGuide, kakaoBudgetGuideText, kakaoForeignAmountText, kakaoSkillSafeFallbackText,
} from "./reply-texts.js";
import {
  detectKakaoNaturalIntent, hasKakaoImageAttachment, isCommandMenuCommand, isHouseholdSwitchCommand,
  kakaoImageNotSupportedText, kakaoPublicCommandReply, parseCreateHouseholdCommand,
} from "./intent-nlu.js";
import {
  KAKAO_QR_MESSAGE_MAX_V229127, KAKAO_TERMS_NOTICE_LINE_V229118, dedupeQuickReplies,
  kakaoGroupCompatibleResponse, kakaoGroupEmptyMentionReply, kakaoNextStepReply,
  kakaoRoomLedgerLinkOutputsV229129, kakaoTermsNoticeResponseV229118, kakaoText,
  kakaoTypeChoiceAskTextV229127, kakaoWebLedgerReply, noteKakaoTermsNoticeDroppedV229118,
} from "./response-builders.js";
import { kakaoManualReply, kakaoManualTopic } from "./manual-guides.js";
import {
  getRecentKakaoOwnedTransactionsV2254, isKakaoDailyListCommand, isKakaoSessionSeqReplyV4,
  kakaoEditInputTextV4, kakaoEditSessionKeyV4, kakaoEditSessionTextV4, parseKakaoDeleteCommandV4,
  parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
} from "./edit-session-v4.js";
import { startsWithKakaoEditField } from "./edit-state-machine.js";
import { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 } from "./edit-flow-v4.js";
import {
  armKakaoRepeatGuard, checkKakaoRepeatGuard, clearKakaoInFlight, isKakaoFirstRecordInput,
  isKakaoQaPayload, isStrongKakaoTransactionInput, kakaoChangeRequestReply, kakaoDeferredReply,
  kakaoQaRequestAllowed, kakaoRecordGuardReplyV229120, kakaoRecordGuardV229120,
  kakaoRepeatGuardText, looksLikeKakaoChangeRequest, looksLikeKakaoEditCommandV4,
  normalizeKakaoSkillResponse, stripKakaoBotMention, stripLeadingCommand,
} from "./request-guards.js";
import {
  clearKakaoFlowState, completeKakaoFlowState, getKakaoFlowState, isKakaoBudgetSetupCommand,
  isKakaoCreateFlowCommand, isKakaoJoinFlowCommand, isKakaoMemberAliasCommand, isKakaoStartCommand,
  kakaoBudgetRootQuickReplies, kakaoCreateKindQuickReplies, kakaoFlowStateKey,
  kakaoStartQuickReplies, parseDirectMemberAliasCommand, saveKakaoFlowState,
  shouldInterruptKakaoFlowV2254,
} from "./guided-flow-state.js";
import {
  KAKAO_ROOM_RESTART_COMMAND_V229133, beginKakaoHouseholdChoice, clearKakaoSelectedHousehold,
  getKakaoSelectedHouseholdId, inferKakaoCreateKind, isKakaoBudgetYearMonthCommand,
  isKakaoRoomRestartCommandV229133, kakaoActiveHouseholds, kakaoBudgetAmountTooLargeText,
  kakaoCreateKindPromptText, kakaoDateSummaryParts, kakaoHouseholdReplyName,
  kakaoInviteManagementText, kakaoInviteNotAllowedText, kakaoManageableHouseholds,
  kakaoMemberPolicyReply, kakaoSelectedHouseholdKey, kakaoStartText, kakaoTotalBudgetNote,
  kakaoUnlinkedGroupStartText, parseBudgetMonthHint, parseDirectBudgetSetCommand,
  parseInviteCodeJoinCommand, parseKakaoSummaryRange, resolveBudgetCategoryName,
  sanitizeHouseholdNameInput, saveKakaoBudget, setKakaoSelectedHousehold,
} from "./household-budget-commands.js";
import {
  KAKAO_SKILL_MAX_BODY_BYTES, handleHouseholdGuidedFlow, handlePreHouseholdGuidedFlow,
  kakaoRoomJoinScopeNoteV229122, readRequestTextBounded,
} from "./guided-flows.js";
import { saveKakaoParsedTransactionsReply } from "./transaction-save.js";
import {
  handleKakaoSeparatePurchase, parseKakaoSeparatePurchaseCommand,
} from "./separate-purchase.js";
import { readJson } from "../api/admin-api.js";
import {
  bindKakaoGroupByInviteCode, getExplicitKakaoBotGroupKey, getKakaoBotGroupKey,
  getLinkedKakaoGroupHousehold, joinKakaoRoomOnCallV229115, kakaoGroupInfoText,
  kakaoGroupLinkItemSettingsKey, kakaoRoomBindConfirmLine, kakaoRoomBindDoneText,
  kakaoRoomDepartedFromHousehold, kakaoRoomPhaseOf, normalizeKakaoGroupLinkItem,
  readKakaoGroupFirstSnapshot, readKakaoRoomRoutingSnapshot, restartKakaoRoomV229133,
  startKakaoRoomRecordSnapshot, tryKakaoGroupFirstRecord,
} from "./group-links-first-record.js";
import {
  getKakaoIdentityAliases, getKakaoNickname, getKakaoUserKey, hasChatFirstKakaoIdentity,
  trustedChatFirstSkillCaller, tryKakaoChatFirstRecord,
} from "./identity-chat-first.js";
import {
  cancelPendingHouseholdJoin, ensureUser, joinHouseholdByCode, roleBlockedMessage,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import {
  isBudgetCommand, isGroupLinkInfoCommand, isHelpCommand, isInputExampleCommand, isInviteCommand,
  isJoinCancelCommand, isLinkCommand, isRecentCommand, isSettlementCommand, isSummaryCommand,
  isUndoCommand, kakaoSettlementParts, parseGroupBindCommand, parseJoinCode,
  parseKakaoMemberPolicyCommand,
} from "./simple-commands.js";
import { parseMultipleTransactions, parseTransaction } from "../nlu/transaction-parser.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate } from "../nlu/date-payment.js";
import {
  formatRecentTransactions, formatSummary, getMonthSummary, linkText, nextMonthStart,
  numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

async function handleKakaoSkillStable(request, env, ctx = null) {
  const requestStartedAt = Date.now();
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
      return kakaoGroupCompatibleResponse(kakaoText("이 방의 공동 가계부는 인증된 카카오 요청에서만 사용할 수 있어요. 이 요청으로 기록을 읽거나 저장하지 않았어요. 봇을 다시 호출해 주세요."), payload, origin);
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
    return kakaoGroupCompatibleResponse(kakaoText(kakaoRepeatGuardText(origin, utterance)), payload, origin);
  }

  // V22.9.44: 카카오는 5초 안에 답이 없으면 '스킬 서버 연결 오류'(폴백 블록 오류 알림)로 끝낸다. 처리가 응답 예산(기본 4초)을
  // 넘기면 먼저 '처리 중' 답을 보내고 같은 처리는 ctx.waitUntil 로 끝까지 마친다. 중복 저장을 막는 처리 중 표시는 그 처리가
  // 끝날 때 내려가고, 관제 지표에는 실제로 걸린 시간과 결과를 남긴다.
  const canDeferSave = typeof ctx?.waitUntil === "function";
  if (env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.enabled = canDeferSave;
  // V22.9.90: 관제 이용 현황의 카카오 기능 순위(record_nlu_metric)는 메뉴 낱말 판별(detectKakaoNaturalIntent)만 써서 기록 글("점심 12000원")과
  // 고치기 명령을 ‘알 수 없음’으로 셌다(10-30 관제 확인: 129회 중 53회). 처리기가 기록·고치기로 읽은 글이면 그 이름(usage.intent)을 쓴다.
  // V22.9.148: 답을 만든 곳이 표시를 남긴 답(못 알아들음·금액 없음·인사·첫 안내 — runtime/ops-telemetry.js markKakaoNluOutcomeV229148)은 그 이름(usage.markedIntent)이 먼저다.
  const usage = {};
  // 낱말이 없는 말(‘?’·‘…’ — 판별은 EMPTY)도 못 알아들음 답을 받았으면 그 이름이다(독립 검토: 단톡방의 빈 부름 EMPTY/ok 와 한 줄에 섞였다).
  const metricIntent = () => (intentMatch.intent === "UNKNOWN" && (usage.markedIntent || usage.intent))
    || (intentMatch.intent === "EMPTY" && usage.markedIntent) || intentMatch.intent;
  const work = (async () => { try {
    const headers = new Headers(request.headers || {});
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    const cloned = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    });
    let response;
    try { response = await handleKakaoSkill(cloned, env, { canDeferSave, usage }); }
    finally { await finishKakaoMessageLeases(env); }
    // V22.9.115: 방 명령을 처리하다 그 자리에서 이 방 가계부에 들였으면(또는 첫 호출자로 공동 가계부를 준비했으면) 답 맨 앞에 한 줄로 알린다(답 모양과 무관).
    response = await prependKakaoRoomJoinNoticeV229115(response, env);
    const normalizedResponse = await normalizeKakaoSkillResponse(response, origin);
    // V22.9.118 P-3: 처음 계정(개인 가계부)이 만들어지거나 처음 이 방 가계부에 들어간 답이면 약관 안내 한 줄 + 링크 단추(response-builders.js). 그 밖의 답은 그대로.
    // 독립 검토 P2: 단톡방의 빈 멘션·설명서 첫 화면 답에는 늘 단다(payload 로 단톡방인지 본다).
    const noticedResponse = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(normalizedResponse, payload, origin), env, origin, payload);
    // V22.9.129: 단톡방 답의 ‘웹가계부’ 링크 단추에 이 방 가계부 표식을 싣는다(그런 단추가 있는 답만, 답 예산이 남았을 때만 — 아래 함수 설명).
    const safeResponse = await kakaoRoomLedgerLinksResponseV229129(noticedResponse, env, origin, payload, {
      trusted: trustedChatFirstSkillCaller(request, env),
      deadlineAt: requestStartedAt + boundedRuntimeNumber(env.KAKAO_RESPONSE_BUDGET_MS, 4000, 200, 4700),
    });
    const latencyMs = Date.now() - skillStartedAt;
    const responsePreview = await safeResponse.clone().text();
    const nluMark = kakaoNluMarkV229148(env);
    const outcome = nluOutcomeFromKakaoResponse(responsePreview, nluMark);
    if (outcome.marked) usage.markedIntent = nluMark.intent;
    armKakaoRepeatGuard(repeat.key, responsePreview);
    clearKakaoInFlight(repeat.key);
    rememberSkillLatency(latencyMs, { intent: metricIntent(), result: outcome.result });
    const nluEvent = { at: new Date().toISOString(), request_id: requestId, intent: metricIntent(), confidence: intentMatch.confidence, result: outcome.result, reason: outcome.reason, latency_ms: latencyMs, block: blockName, version: APP_VERSION, utterance };
    rememberNluRuntimeEvent(nluEvent, env);
    scheduleNluOpsPersistence(ctx, env, nluEvent);
    rememberSkillEvent({ kind: "ok", user_key: userKey, utterance, detail: `request_id=${requestId}; intent=${metricIntent()}; result=${outcome.result}; status=${response.status}; normalized=${safeResponse.status}; latency_ms=${latencyMs}; db_retries=${env.__AB_MONITOR_REQUEST?.db_retries || 0}` });
    const safeHeaders = new Headers(safeResponse.headers || {});
    safeHeaders.set("x-kakao-skill-latency-ms", String(latencyMs));
    safeHeaders.set("x-accountbook-latency-ms", String(latencyMs));
    safeHeaders.set("x-accountbook-version", APP_VERSION);
    safeHeaders.set("x-accountbook-intent", metricIntent());
    safeHeaders.set("x-accountbook-nlu-result", outcome.result);
    safeHeaders.set("x-accountbook-request-id", requestId);
    return new Response(safeResponse.body, { status: safeResponse.status, statusText: safeResponse.statusText, headers: safeHeaders });
  } catch (err) {
    // V22.9.122 KR-3: 아래 진단 저장이 쓰기를 보내기 전에, 이 요청이 내용 쓰기를 보냈는지 먼저 읽어 둔다(data/supabase-client.js 표시, 없으면 모름).
    const contentWriteV229122 = env.__AB_KAKAO_REQUEST ? env.__AB_KAKAO_REQUEST.contentWriteV229122 || "" : "unknown";
    const latencyMs = Date.now() - skillStartedAt;
    const nluEvent = { at: new Date().toISOString(), request_id: requestId, intent: metricIntent(), confidence: intentMatch.confidence, result: "error", reason: safeError(err), latency_ms: latencyMs, block: blockName, version: APP_VERSION, utterance };
    rememberNluRuntimeEvent(nluEvent, env);
    scheduleNluOpsPersistence(ctx, env, nluEvent);
    rememberSkillEvent({ kind: "error", user_key: userKey, utterance, detail: `request_id=${requestId}; intent=${metricIntent()}; ${safeError(err)}; latency_ms=${latencyMs}` }, env);
    clearKakaoInFlight(repeat.key);
    rememberSkillLatency(latencyMs, { intent: metricIntent(), result: "error" });
    // V22.9.76 감사 B-6: 식별 별칭 저장이 동시 요청으로 바빠 실패하면 기록하기 전에 멈춘 것이다. "다시 보내주세요" 예시만 주던
    // 일반 안내 대신, 저장하지 않았으니 같은 내용을 다시 보내라고 분명히 말한다.
    const busyIdentity = String(err?.code || "") === "identity_alias_persistence_failed";
    // V22.9.122 KR-3(출시 전 점검 2026-11-14): 저장소 오류(5xx·408·조회 시한·연결 끊김·잠금 함수 없음·결과 불확실 쓰기)가 여기까지 올라오면 ‘아래처럼 다시 보내주세요’
    // 예시만 줬다(‘점심 12000원’을 그대로 보냈어도). 이 요청이 내용 쓰기를 보내지 않았으면(data/supabase-client.js 표시) 저장하지 않았다고 분명히 답하고,
    // 보냈으면(또는 모르면) 저장 기록 확인 안내(transaction-save.js 와 같은 문장)를 낸다. 불확실 판정은 isUncertainStorageWrite 와 같은 원인 사슬 검사다. 그 밖의 오류는 예전 안내.
    const errorChain = [];
    for (let current = err, depth = 0; current && typeof current === "object" && depth < 8; current = current.cause, depth += 1) errorChain.push(current);
    const storageFailed = errorChain.some((item) => item.uncertain_write === true || item.code === "supabase_write_result_unknown" || item.name === "AbortError" ||
      /^(?:Supabase (?:5\d\d|408)\b|supabase_read_timeout\b|database operation lease is unavailable$)/.test(String(item.message || "")) ||
      item instanceof TypeError && /fetch|network|connection/i.test(String(item.message || "")));
    // 독립 검토 2: 내용 쓰기가 없을 때의 답은 ‘기록은 저장하지 않았어요’ 로 좁혀 말한다(가계부 만들기 확인 단계에서는 가계부 행이 이미 생겼을 수 있다). 거래가 아닌 쓰기(예산 등)는
    // ‘중복될 수 있으니 기다리라’ 대신 결과를 확인해 보라고 한다(예산 저장은 다시 보내도 겹치지 않고, 실패했으면 기다려도 저장되지 않는다).
    const storageText = !storageFailed ? "" : !contentWriteV229122 ? "일시적인 오류로 이번 요청을 끝내지 못했어요. 기록은 저장하지 않았어요. 잠시 뒤 같은 내용을 다시 보내 주세요."
      : contentWriteV229122 === "other" ? "저장됐는지 확인하지 못했어요. 잠시 뒤 결과를 확인해 보고, 반영되지 않았으면 같은 내용을 다시 보내 주세요."
      : "지금은 저장 확인이 지연되고 있어요. 중복될 수 있으니 같은 내용을 다시 보내지 말고 기다려 주세요.\n‘오늘기록’에서 확인해 주세요. 목록에 없어도 아직 저장 중일 수 있어요.";
    const fallback = await kakaoGroupCompatibleResponse(kakaoText(busyIdentity ? "요청이 한꺼번에 몰려 이번 내용은 저장하지 못했어요.\n잠시 뒤 같은 내용을 한 번 더 보내 주세요." : storageText || kakaoSkillSafeFallbackText(origin)), payload, origin);
    const headers = new Headers(fallback.headers || {});
    headers.set("x-accountbook-version", APP_VERSION);
    headers.set("x-accountbook-intent", metricIntent());
    headers.set("x-accountbook-nlu-result", "error");
    headers.set("x-accountbook-request-id", requestId);
    headers.set("x-accountbook-latency-ms", String(latencyMs));
    return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
  } })();
  // V22.9.91 계정 잇기: 답 처리 중 모아 둔 잇기 제안과 appUserId 도착 진단을 답 처리가 끝난 뒤 쓴다(auth/kakao-account-link.js).
  // 답을 늦추지 않게 waitUntil 로 미루고, 이 요청의 DB 호출 여유가 있을 때만 쓴다. 실패해도 답에는 영향이 없다.
  if (canDeferSave) ctx.waitUntil(work.then(() => {}, () => {}).then(() => runKakaoAfterReply(env)).then(() => afterKakaoSkillIdentityWork(env, payload, trustedChatFirstSkillCaller(request, env))).catch(() => {}));
  if (!canDeferSave) return await work;
  const budgetMs = boundedRuntimeNumber(env.KAKAO_RESPONSE_BUDGET_MS, 4000, 200, 4700);
  let deadlineTimer = null;
  const first = await Promise.race([work, new Promise((resolve) => { deadlineTimer = setTimeout(() => resolve(null), Math.max(0, budgetMs - (Date.now() - requestStartedAt))); })]);
  if (deadlineTimer) clearTimeout(deadlineTimer);
  if (first) return first;
  ctx.waitUntil(work.then(() => {}, () => {}));
  abMonitorOutcome(env, "deferred", work); // V22.9.77(G-5): 뒤 작업이 끝나면 관제에 최종 결과 표본을 한 번 더 보낸다.
  rememberSkillEvent({ kind: "deferred", user_key: userKey, utterance, detail: `request_id=${requestId}; budget_ms=${budgetMs}` });
  // V22.9.72: 짧은 안내 + 다시 묻는 버튼(기록이면 ‘오늘기록’ 확인, 조회·명령이면 같은 명령). 2026-10-20 디자이너 피드백.
  // V22.9.118 P-3: 지연 답도 그때까지 첫 사용(계정·참여)이 정해졌으면 같은 약관 안내를 단다(정해지기 전에 4초가 지나면 이 답에는 없다).
  const deferred = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(kakaoDeferredReply(utterance, payload), payload, origin), env, origin, payload);
  // V22.9.118 독립 검토 P3: 4초 뒤에 첫 사용이 정해져 이 지연 답에 안내가 없었으면 다음 답에도 오지 않는다 — 동작은 그대로 두고 운영 이벤트 한 건만 남긴다.
  const noticeInDeferred = (await deferred.clone().text()).includes(KAKAO_TERMS_NOTICE_LINE_V229118);
  if (!noticeInDeferred) ctx.waitUntil(work.then(() => { if (env.__AB_KAKAO_REQUEST?.termsNoticeV229118) noteKakaoTermsNoticeDroppedV229118(env, "deferred"); }, () => {}));
  const deferredHeaders = new Headers(deferred.headers || {});
  deferredHeaders.set("x-accountbook-version", APP_VERSION);
  deferredHeaders.set("x-accountbook-intent", metricIntent());
  deferredHeaders.set("x-accountbook-nlu-result", "deferred");
  deferredHeaders.set("x-accountbook-request-id", requestId);
  deferredHeaders.set("x-accountbook-latency-ms", String(Date.now() - skillStartedAt));
  return new Response(deferred.body, { status: deferred.status, statusText: deferred.statusText, headers: deferredHeaders });
}

// V22.9.115: 방 명령 처리 중 들인 사실(skill-handler 본문이 env.__AB_KAKAO_REQUEST.roomJoinNotice 에 적음)을 답 맨 앞 simpleText 한 줄로 끼운다.
// 출력이 이미 셋(카카오 상한)이거나 JSON 답이 아니면 그대로 둔다. 시작·도움말·웹가계부는 자기 답에 상태를 넣으므로 이 줄을 쓰지 않는다.
async function prependKakaoRoomJoinNoticeV229115(response, env) {
  const notice = String(env?.__AB_KAKAO_REQUEST?.roomJoinNotice || "").trim();
  if (!notice || !response || response.status !== 200) return response;
  try {
    const body = await response.clone().json();
    const outputs = body?.template?.outputs;
    if (!Array.isArray(outputs) || !outputs.length || outputs.length >= 3) return response;
    return jsonResponse({ ...body, template: { ...body.template, outputs: [{ simpleText: { text: notice } }, ...outputs] } }, 200);
  } catch (_) {
    return response;
  }
}

// V22.9.129 W-3·W-4: 단톡방 답의 ‘웹가계부’ 링크 단추(주소가 정확히 <origin>/my 인 것 — 설명서 카드·바꾼 바로가기·글 속 주소에서 옮긴 단추)에 이 방
// 가계부를 가리키는 표식(/my?room=<번호>)을 싣는다. 카카오가 식별 값을 붙이지 않는 PC 카카오톡으로 눌러도 그 단추가 이 방 가계부로 이어지게 하려는 것이다
// (auth/kakao-room-open.js kakaoRoomEntryResponse). ‘웹가계부’ 답은 자기 단추에 이미 표식을 실어 온다(kakaoWebLedgerReply).
//  · 그런 단추가 없는 답(대부분의 답)은 건드리지 않고 읽기도 하지 않는다.
//  · 가계부 번호는 이 요청이 이미 알아낸 값(roomHouseholdIdV229129)을 쓰고, 없으면 방 연결 한 줄을 한 번 읽는다 — Secret 으로 확인된 요청 + 명시된
//    botGroupKey 일 때만, 답 예산(deadlineAt)과 DB 호출 여유가 남았을 때만, 많아야 0.7초. 못 읽으면 예전 주소 그대로 답한다.
//    방별 연결 한 줄만 읽는다 — 옛 통합 맵에만 남은 방은 표식 없이 예전 주소로 나간다(그 맵은 사용자마다 커지는 한 줄이라 여기서 읽지 않는다).
//  · 누가 불렀는지는 가리지 않는다(구성원이 아니거나 이용 제한된 사람의 답에도 실린다). 방의 답 카드는 방 참여자 모두가 보고, 표식은 권한이 아니다.
//  · 표식은 권한이 아니다(읽을 수 있는 사람에게만 그 가계부가 열린다). 답 글·카드 모양은 바꾸지 않는다.
const KAKAO_ROOM_LEDGER_LINK_READ_MS_V229129 = 700;
const KAKAO_ROOM_LEDGER_LINK_TAIL_MS_V229129 = 400;
async function kakaoRoomLedgerLinksResponseV229129(response, env, origin = "", payload = {}, { trusted = false, deadlineAt = 0 } = {}) {
  try {
    const groupKey = getKakaoBotGroupKey(payload);
    if (!origin || !groupKey || !response || response.status !== 200) return response;
    const raw = await response.clone().text();
    if (!raw.includes(JSON.stringify(`${origin}/my`))) return response;
    const data = JSON.parse(raw);
    const outputs = data?.template?.outputs;
    if (!Array.isArray(outputs)) return response;
    let householdId = String(env?.__AB_KAKAO_REQUEST?.roomHouseholdIdV229129 || "").trim();
    if (!householdId) {
      if (!trusted || getExplicitKakaoBotGroupKey(payload) !== groupKey || !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return response;
      // 독립 검토 P3: 읽기 뒤에도 답을 마무리할 몫(0.4초)을 남긴다 — 남은 시간이 그보다 0.15초도 더 없으면 읽지 않고, 있으면 그만큼만(많아야 0.7초) 기다린다.
      const waitMs = deadlineAt ? Math.min(KAKAO_ROOM_LEDGER_LINK_READ_MS_V229129, deadlineAt - Date.now() - KAKAO_ROOM_LEDGER_LINK_TAIL_MS_V229129) : KAKAO_ROOM_LEDGER_LINK_READ_MS_V229129;
      if (waitMs < 150) return response;
      const budget = env.__AB_DB_BUDGET;
      const queued = (env.__AB_KAKAO_REQUEST?.afterReply || []).reduce((sum, item) => sum + Number(item?.cost || 0), 0);
      if (budget && Number(budget.used || 0) + 1 + queued + Number(budget.reserved || 0) > Number(budget.limit || 50)) return response;
      const read = getSettingValueStrict(env, kakaoGroupLinkItemSettingsKey(groupKey));
      read.catch(() => {});
      let timer = null;
      const value = await Promise.race([read, new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), waitMs); })]);
      if (timer) clearTimeout(timer);
      householdId = value === undefined ? "" : String(normalizeKakaoGroupLinkItem(value, groupKey)?.household_id || "").trim();
    }
    const next = householdId ? kakaoRoomLedgerLinkOutputsV229129(outputs, origin, householdId) : null;
    if (!next) return response;
    const headers = new Headers(response.headers || {});
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ ...data, template: { ...data.template, outputs: next } }), { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return response;
  }
}

// V22.9.67: 단톡방 메시지 버튼은 messageText 가 아니라 버튼 이름을 그대로 보낸다(2026-10-19 운영 확인).
// 예전 말풍선에 남은 버튼 이름(이모지 포함)을 원래 명령으로 바꿔, 같은 질문을 되풀이하는 일을 막는다.
const KAKAO_LEGACY_BUTTON_LABELS = Object.freeze({
  "카테고리별": "카테고리별 예산", "지난달 복사": "지난달 예산 복사", "예산 현황": "남은 예산",
  "다른 예산": "예산 설정", "다른 카테고리": "예산 설정", "카테고리 선택": "예산 설정",
  "의료·병원": "의료/병원", "교육·학습": "교육/학습", "문화·여가": "문화/여가", "부부·커플": "부부 커플",
  "첫 기록 방법": "기록 방법", "첫 기록 남기기": "기록 방법", "초대코드 보기": "초대코드", "초대코드 참여": "초대코드로 참여",
  "코드로 참여": "초대코드로 참여", "새로 만들기": "새 가계부 만들기", "새 가계부": "새 가계부 만들기", "가계부 선택": "가계부 전환",
  "연결 방법": "단톡방 연결", "내 표시 이름": "내 이름 설정", "내 이름 변경": "내 이름 설정", "가계부 이름": "가계부 관리",
  // V22.9.72: 띄어쓰기 없는 짧은 버튼 이름(2026-10-20 디자이너 피드백). 단톡방 ‘도움말’은 OpenBuilder 가 가로채므로
  // 버튼 이름은 ‘도움말 보기’이고 여기서 ‘도움말’로 읽는다. 설명서 화면 이름은 KAKAO_MANUAL_TRIGGERS 가 직접 읽는다.
  "도움말 보기": "도움말", "도움말보기": "도움말", "오늘기록": "오늘 기록 보기", "이번달요약": "이번 달 요약", "남은예산": "남은 예산",
  "예산설정": "예산 설정", "웹가계부": "웹 가계부 열기", "이름설정": "내 이름 설정", "가계부만들기": "새 가계부 만들기",
  "초대코드참여": "초대코드로 참여", "단톡방연결": "단톡방 연결", "가계부전환": "가계부 전환",
});

function normalizeKakaoButtonLabel(text = "") {
  const stripped = String(text || "").replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{200D}\s]+/u, "").trim();
  const base = stripped || String(text || "").trim();
  return KAKAO_LEGACY_BUTTON_LABELS[base] || base;
}

// V22.9.76 카카오 감사 1: 수입 낱말과 쓰는 말이 함께 있으면 저장하지 않고 구분을 묻는다. 단톡방은 바로답장 버튼을
// 버리므로 글로도 다시 보낼 문장을 알려 준다.
// V22.9.76 감사 B-4: 열린 수정 세션이 날짜별 목록 보기 같은 조회·이동 명령을 ‘내용 변경’ 값으로 삼켰다(‘네’ 하면 메모가 바뀜).
// 목록·요약·정산·예산·가계부 전환·메뉴 명령은 세션을 비켜 가서 원래 답을 받는다. 세션 값이 될 수 있는 말
// (‘금액 13000’, 번호, ‘취소’, ‘도움말’, ‘어제’ 같은 날짜 값)은 여기에 들지 않는다.
function isKakaoEditSessionBypassCommand(text = "") {
  const t = normalizeText(text);
  // V22.9.144 독립 검토 F3: 해 말·연도로 시작하는 금액 있는 예산 설정 명령(‘내년 1월 식비 예산 22만원’)은 아래 칸 이름 판정보다 먼저 비켜 간다.
  // ‘내년’·‘금년’ 은 칸 이름 ‘내용’·‘금액’ 과 한 글자 차이라 오타 판정이 그 칸의 값으로 잡았다(‘혹시 내용을 … 바꾸는 건가요?’ 에 ‘네’ 하면 메모가
  // 바뀜). 칸 이름을 먼저 적은 말(‘내용 내년 1월 …’)은 해 말로 시작하지 않으므로 예전처럼 세션 값이다.
  if (isKakaoBudgetYearMonthCommand(t, { leading: true })) return true;
  if (!t || startsWithKakaoEditField(t) || /^\d+\s*번?$/.test(t)) return false;
  // ‘오늘’·‘어제’ 한 낱말은 요약 명령이기도 하지만, 세션 안에서는 날짜 값(1. 오늘 2. 어제 3. 그제)이다.
  if (/^(?:오늘|어제|그제|그저께|엊그제|이번\s*주|지난\s*주|이번\s*달|지난\s*달)$/.test(t)) return false;
  // V22.9.144 독립 검토 F3: 해 말·연도 + N월을 적은 금액 있는 예산 설정 명령(‘내년 1월 식비 예산 22만원’)도 예산 명령으로 비켜 간다. 예전에는
  // 기록 길의 달력 답이 먼저 받아 세션까지 오지 않았고, 이제 그 답을 건너뛰므로 세션이 ‘내용’ 값으로 삼키지 않게 한다(세션은 남는다).
  return isKakaoDailyListCommand(t) || isRecentCommand(t) || isSummaryCommand(t) || !!parseKakaoSummaryRange(t) ||
    isSettlementCommand(t) || isBudgetCommand(t) || isKakaoBudgetSetupCommand(t) || isHouseholdSwitchCommand(t) || isCommandMenuCommand(t) ||
    isKakaoBudgetYearMonthCommand(t);
}

// V22.9.79 감사 A-18: ‘오늘 뭐 썼어’·‘어제 뭐 썼어’·‘오늘 기록 보여줘’·‘7월 3일 뭐 썼어’처럼 하루를 가리킨 조회가 그 날짜와 상관없이
// 방금 입력한 5건을 보여 줬다(헤더만 ‘최근 입력 내역’). 이런 말은 ‘그날 기록 보기’와 같은 목록(그날 KST 의 내 기록을 번호와 함께, 빈
// 날은 같은 짧은 안내)으로 답한다 — 아래 수정 명령 라우터에 ‘N일 기록 보기’ 꼴로 바꿔 넘긴다. 하루를 가리키지 않은 ‘최근 기록’·‘마지막’·
// ‘내 기록’·‘이번 주 뭐 썼어’는 예전처럼 최근 5건이고, 날짜 말이 둘 이상이면(‘어제 오늘 뭐 썼어’) 어느 날인지 몰라 바꾸지 않는다.
function kakaoRecentDayListUtterance(text = "") {
  if (!isRecentCommand(text)) return "";
  const t = normalizeText(text);
  const words = [...new Set(t.match(/오늘|어제|그저께|그제/g) || [])];
  const dates = [...new Set((t.match(/(?:20\d{2}\s*[.\-/년]\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/g) || []).map((item) => item.trim()))];
  if (words.length + dates.length !== 1) return "";
  return `${words[0] || dates[0]} 기록 보기`;
}

// V22.9.79 감사 B-10: 연결된 방에서 아직 구성원이 아닌 사람(참여 전·승인 대기)이 조회·명령을 보냈을 때의 안내. 이 방 가계부는 승인 없이
// 거래를 한 번 보내면 구성원이 된다(V22.9.43, 승인 대기도 같다). 예전에는 승인 대기 사람에게 "관리자가 참여자를 승인해야"라고 해서 이미
// 쓸 수 있는 길을 막았고, 이 가계부에서 나간 이력이 있는 사람에게도 "기록을 보내면 바로 참여돼요"라고 했다(실제로는 자동으로 다시 참여하지
// 않는다 — group-links-first-record.js). 나간 이력은 이 두 경우에만 한 번 읽는다(읽지 못하면 이력 없음으로 본다).
async function kakaoRoomJoinGuideReply(env, { payload, groupKey = "", user = {}, household = {}, role = "" } = {}) {
  const departed = await kakaoRoomDepartedFromHousehold(env, groupKey, user.id, household.id);
  if (departed) {
    return kakaoText(role === "pending"
      ? "이 방 가계부 참여 승인을 기다리는 중이에요.\n이 가계부에서 나간 이력이 있어 기록을 보내도 자동으로 참여하지 않아요.\n소유자·관리자가 승인해야 기록할 수 있어요."
      : "이 가계부에서 나간 이력이 있어 이 방에서 기록을 보내도 자동으로 참여하지 않아요.\n다시 참여하려면 개인 대화에서 초대코드를 사용해 주세요.");
  }
  return kakaoNextStepReply(role === "pending"
    ? "이 방 가계부에 참여 대기 중이에요.\n승인 없이 기록을 한 번 보내면 바로 참여돼요.\n예) @말해가계부 커피 4500원"
    : "아직 이 방 가계부에 참여 전이에요.\n기록을 한 번 보내면 바로 참여돼요.\n예) @말해가계부 커피 4500원", payload);
}

// V22.9.148: 가계부가 하나도 없는 사람에게 보내는 첫 안내 — 관제는 ‘첫 안내’(FIRST_CONTACT)의 되묻기(clarify)로 센다(예전에는 ‘알 수 없음’의 ok 에
// 섞였다 — 아직 기록이 안 된 안내 단계라 성공으로 세지 않는다). 답은 그대로다.
function kakaoFirstContactReplyV229148(env) {
  const text = kakaoStartText(false);
  markKakaoNluOutcomeV229148(env, "first_contact", text);
  return kakaoText(text, kakaoStartQuickReplies(false));
}

function kakaoMixedTypeConfirmationReply(utterance = "") {
  const text = String(utterance || "").replace(/\s+/g, " ").trim();
  // V22.9.127: 단추가 보내는 글(‘지출 …’·‘수입 …’, 앞말 석 자)이 바로가기에 온전히 실릴 때만 단추를 만든다(response-builders.js kakaoQr 는 그보다 긴 글을 자른다 —
  // 잘린 글이 그대로 저장으로 이어져 금액이 달라졌다). request-guards.js kakaoGuardTypeConflictReplyV229126 과 같은 조건이다.
  const replies = text.length + 3 <= KAKAO_QR_MESSAGE_MAX_V229127 && !/\n/.test(String(utterance || "")) ? [["지출로 기록", `지출 ${text}`], ["수입으로 기록", `수입 ${text}`]] : [];
  // 글은 response-builders.js kakaoTypeChoiceAskTextV229127 — 40자를 넘는 문장은 잘린 예시를 보여 주지 않는다.
  return kakaoText(kakaoTypeChoiceAskTextV229127(text), replies);
}

async function handleKakaoSkill(request, env, { canDeferSave = false, usage = null } = {}) {
  const handlerStartedAt = Date.now();
  const payload = await readJson(request);
  const origin = publicBaseUrl(env, new URL(request.url));
  const utterance = normalizeKakaoButtonLabel(stripLeadingCommand(String(payload?.userRequest?.utterance || payload?.utterance || "").trim()));
  // V22.9.141 (독립 검토 1): 사람이 ‘수정 NN번 …’ 으로 보낸 한 줄 명령인지 — stripLeadingCommand 가 ‘수정’ 을 떼어 ‘NN번 …’ 이 되므로 원문에서 본다.
  // 수정 창의 ‘선택’ 단계는 이 명령을 예전처럼 기록 경로로 넘기고, ‘수정’ 없이 온 ‘N번 …’ 은 그 창의 답으로 보아 붙잡는다.
  const explicitEditCommandV229141 = /^\/?수정\s+\d{1,3}\s*번/.test(stripKakaoBotMention(String(payload?.userRequest?.utterance || payload?.utterance || "").trim()));
  // V22.9.93 Q-35: 고치고 지우는 말은 전각 숫자와 끝 문장부호를 다듬어 읽는다(저장 원문은 utterance 그대로다).
  const commandText = kakaoEditInputTextV4(utterance);
  const separatePurchaseCommand = parseKakaoSeparatePurchaseCommand(utterance);
  const preParsedList = separatePurchaseCommand ? [] : parseMultipleTransactions(utterance, payload);
  // V22.9.76 카카오 감사 3: "어제수정 01번 금액 5000"·"10월20일수정 …"처럼 날짜와 수정 명령을 붙여 쓴 말은 아래 두
  // 기록 거절 안내가 아니라 수정 흐름으로 보낸다.
  const editLikeUtterance = !separatePurchaseCommand && looksLikeKakaoEditCommandV4(commandText);
  // V22.9.90: 관제 기능 순위용 이름(부른 쪽은 메뉴 낱말 판별이 UNKNOWN 일 때만 쓴다). 기록으로 읽힌 글은 TRANSACTION, 고치기 명령 꼴은 EDIT.
  if (usage) usage.intent = editLikeUtterance || looksLikeKakaoChangeRequest(commandText) ? "EDIT" : separatePurchaseCommand || preParsedList.length ? "TRANSACTION" : "";
  if (!separatePurchaseCommand && !editLikeUtterance && (preParsedList.blocked?.message === "transaction_type_confirmation_required" || (!preParsedList.length && parseTransaction(utterance,payload).message === "transaction_type_confirmation_required"))) {
    if (preParsedList.blocked?.reason === "mixed_cues") return kakaoMixedTypeConfirmationReply(utterance);
    return kakaoText("결제·승인 취소 내역으로 보여 새 기록을 저장하지 않았어요. 환불받은 돈을 기록하려면 ‘수입 결제 취소 36000원’처럼 구분을 명시해 주세요.");
  }
  // V22.9.144 V122:K-5: ‘내년 1월 식비 예산 22만원’·‘2027년 1월 식비 예산 22만원’ 은 기록 파서가 해 말·연도 + 달(날 없음)을 ‘달력에 없는 날짜’ 로
  // 보아 아래 예산 처리기(parseDirectBudgetSetCommand)까지 가지 못했다. 그 달 말 하나 때문에 이 답이 되는 금액 있는 예산 설정 명령이면 건너뛴다
  // (isKakaoBudgetYearMonthCommand — 그 꼴을 떼고 남은 말을 기록 파서의 날짜 말 판정으로 다시 본다). 그 말은 열린 수정 창·단계 흐름도 비켜 가
  // 아래 예산 처리기가 받고, 기록으로 저장하지 않는다. 날을 적은 말(‘2월 30일 …’·‘2월 30 예산’·‘내년 2월 30 …’·‘2/30 …’·‘2.30 …’)과
  // 1~12 밖의 달(‘2027년 13월 …’)은 예전처럼 이 답이다(독립 검토 F1·F2).
  if (!separatePurchaseCommand && !editLikeUtterance && !preParsedList.length && parseTransaction(utterance,payload).message === "invalid_transaction_date"
    && !isKakaoBudgetYearMonthCommand(utterance)) return kakaoText("달력에 없는 날짜여서 기록을 저장하지 않았어요. 날짜를 확인해 다시 보내 주세요. 연도 없는 M/D는 올해 날짜로 저장합니다.");
  // V22.9.95 R-20: 외화 금액(‘커피 $100’·‘USD 100 커피’)이 하나라도 있는 말은 금액을 읽지 않고 되묻는다(직접·방 같은 입구). 예전에는 $ 를 지운
  // 숫자가 원화로 저장됐다(100원). 고치는 말·예산 말도 같다. 열린 수정 세션·단계 흐름은 그대로 두므로 원화로 다시 보내면 이어진다.
  if (foreignCurrencyAmountIn(utterance)) return kakaoText(kakaoForeignAmountText(origin));
  const strongTransactionInput = isStrongKakaoTransactionInput(commandText, preParsedList);
  // V22.9.120: 저장 직전 안전망(request-guards.js kakaoRecordGuardV229120). DB 를 읽지 않는 판정이라 여기서 한 번 보고, 아래 저장 직전 세 곳에서만 쓴다.
  // V22.9.120 통합 수정: 판정한 오늘을 이 요청에 남겨, 같은 요청의 거절 답 예시(V22.9.119, response-builders.js)를 안전망으로 다시 볼 때 같은 날을 쓴다.
  const guardTodayV229120 = formatDate(nowKstDate());
  if (env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.todayV229120 = guardTodayV229120;
  const recordGuard = !separatePurchaseCommand ? kakaoRecordGuardV229120(utterance, preParsedList, guardTodayV229120) : null;
  // V22.9.63 감사(1:1 2): 가계부가 없는 사람의 첫 기록은 "밥 4500원"처럼 한 글자 내용도 받는다. 아래 두 자동 준비 길에만 쓴다.
  const firstRecordInput = strongTransactionInput || isKakaoFirstRecordInput(commandText, preParsedList);
  // V22.9.133(사용자 2026-11-20 "한 번 눌러 새로 시작"): 가계부가 삭제·해제된 방의 ‘이 방에서 새로 시작’ — 정확히 그 말일 때만이다. ‘시작’ 이 든 말이라
  // 설명서·시작·공개 안내·열린 수정 창 판별보다 먼저 가려 두고, 처리는 사용자 행을 얻은 뒤(아래 시작 명령 앞)에서 한다.
  const roomRestartCommand = !strongTransactionInput && !separatePurchaseCommand && !editLikeUtterance && isKakaoRoomRestartCommandV229133(utterance);
  const kakaoUserKey = getKakaoUserKey(payload);
  const nickname = getKakaoNickname(payload);
  const skillConfigured = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const botGroupKey = getKakaoBotGroupKey(payload);
  // V22.9.77 감사 B-7: Secret 으로 확인된 요청만 appUserId 로 기존 웹 계정을 찾는다(ensureUser 의 trustedKakaoCaller).
  const trustedKakaoCaller = trustedChatFirstSkillCaller(request, env);
  const trustedIdentity = trustedKakaoCaller && hasChatFirstKakaoIdentity(payload, kakaoUserKey);
  // V22.9.115(사용자 결정 2026-11-09): 단톡방에서 봇을 부르기만 해도 이 방 가계부의 구성원으로 들이고, 가계부가 없는 방이면 첫 호출자를 소유자로 공동 가계부를
  // 준비한다(group-links-first-record.js joinKakaoRoomOnCallV229115). Secret 으로 확인된 요청 + 명시된 botGroupKey 일 때만(위조·추정 키 제외, 기록 경로와 같은 조건).
  // 설명서·빈 멘션은 답을 늦추지 않도록 답 뒤(deferKakaoAfterReply)에서, 웹가계부·시작·도움말·그 밖의 명령은 답 내용이 달라지므로 그 자리에서 들인다.
  // 들이지 않는 경우(나간 이력·해제된 방·조회 전용·이용 제한·실패)는 예전 안내가 그대로 답한다. 기록(groupFirstRecord)은 예전 경로 그대로다.
  const roomJoinEligible = skillConfigured && !!botGroupKey && trustedIdentity && getExplicitKakaoBotGroupKey(payload) === botGroupKey;
  const joinRoomOnCallSync = async ({ user: knownUser = null, role, source = "command" } = {}) => {
    if (!roomJoinEligible) return null;
    try {
      const joiner = knownUser || await ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { seedChatFirst: false, create: trustedKakaoCaller, trustedKakaoCaller });
      if (!joiner?.id) return null;
      return await joinKakaoRoomOnCallV229115(env, { payload, user: joiner, kakaoUserKey, nickname, origin, utterance, groupKey: botGroupKey, role, source });
    } catch (err) {
      rememberOpsEvent({ kind: "kakao_room_join_failed", severity: "warn", path: "/skill", method: "POST", detail: `${source}:${safeError(err)}` });
      return null;
    }
  };
  // V22.9.118 독립 검토: 빈 멘션·설명서 첫 화면 답은 약관 안내를 늘 달지만(noticeShown), 설명서의 다른 화면(기록하는 법·예산정하기 …)으로 처음 불러 답 뒤에
  // 들인 사람은 그 답에 안내가 없었다 — 동작은 그대로 두고 운영 이벤트 한 건만 남긴다(답 뒤에 도는 경우만; ctx 없는 실행은 들인 뒤 답하므로 안내가 붙는다).
  const deferRoomJoinOnCall = async (source, { noticeShown = false } = {}) => {
    if (!roomJoinEligible) return;
    const afterReply = !!env.__AB_KAKAO_REQUEST?.enabled;
    await deferKakaoAfterReply(env, async () => {
      const joined = await joinRoomOnCallSync({ source });
      if (afterReply && !noticeShown && (joined?.joinedNow || joined?.roomCreatedNow)) noteKakaoTermsNoticeDroppedV229118(env, "after_reply");
      return joined;
    }, { cost: 26 });
  };
  const roomJoinNoticeLine = (joined) => !joined?.ok || joined.skipped ? ""
    : joined.roomCreatedNow ? "이 방의 공동 가계부를 준비했어요. 첫 호출자인 내가 소유자예요."
    : joined.joinedNow ? `이 방 가계부 ‘${joined.household?.name || "가계부"}’에 참여했어요.` : "";
  const roomJoinStatusLine = (joined) => joined.roomCreatedNow ? "첫 호출자인 내가 소유자예요. 이 방에서 봇을 부르는 참여자는 자동으로 구성원이 돼요."
    : joined.joinedNow ? `내 권한: ${userHouseholdRoleLabel(joined.role)} · 방금 이 방 가계부에 참여했어요.`
    : `내 권한: ${userHouseholdRoleLabel(joined.role)}`;
  const roomJoinedResult = (joined) => !!(joined?.ok && !joined.skipped && joined.household?.id);

  if (!utterance) {
    if (hasKakaoImageAttachment(payload)) return kakaoText(kakaoImageNotSupportedText(origin));
    // 단톡방에서 봇만 멘션한 빈 발화: 짧은 안내 + 도움말·챗봇 멘션하기 버튼으로 다음 발화를 유도한다. V22.9.115: 부른 사람을 답 뒤에 이 방 가계부에 들인다.
    // V22.9.118: 인사 카드 안에 약관 안내 한 줄과 ‘이용약관’ 링크 단추를 담는다(말풍선 하나, origin 은 단추 주소에만).
    if (botGroupKey) { await deferRoomJoinOnCall("mention", { noticeShown: true }); return kakaoGroupEmptyMentionReply(origin); }
    return kakaoManualReply("home", { group: false });
  }

  // V22.9.65: 버튼형 사용 설명서. 읽기 전용이라 사용자·가계부 행을 만들지 않고 바로 답한다.
  // 진행 중인 단계형 흐름·수정 세션은 그대로 두므로 설명서를 본 뒤 이어서 입력할 수 있다.
  // "입력 예시"는 앞의 "입력"이 명령 접두어로 벗겨져 "예시"가 되므로, 멘션만 뺀 원문으로 먼저 판별한다.
  const rawManualUtterance = String(payload?.userRequest?.utterance || payload?.utterance || "");
  const manualTopic = strongTransactionInput || roomRestartCommand ? ""
    : kakaoManualTopic(rawManualUtterance) || kakaoManualTopic(utterance) || (isInputExampleCommand(utterance) ? "record" : "");
  // V22.9.115: 설명서를 부른 사람도 답 뒤에 이 방 가계부에 들인다(답은 예전처럼 바로).
  if (manualTopic) { await deferRoomJoinOnCall("manual", { noticeShown: manualTopic === "home" }); return kakaoManualReply(manualTopic, { group: !!botGroupKey }); }

  // V22.9.126 FC-11: ‘수정 01번 내용 자동차보험’ 처럼 고치기 명령으로 읽히는 말은 값의 낱말(자동차보험·홈페이지·개인정보 …)로 공개 안내를 내지 않고 고치기로 보낸다.
  const bypassPublic = roomRestartCommand || !!separatePurchaseCommand || editLikeUtterance || isKakaoStartCommand(utterance) || isHelpCommand(utterance) || isCommandMenuCommand(utterance) ||
    isKakaoCreateFlowCommand(utterance) || isKakaoJoinFlowCommand(utterance) || isKakaoBudgetSetupCommand(utterance) ||
    isKakaoMemberAliasCommand(utterance) || !!parseKakaoSummaryRange(utterance) || !!parseKakaoMemberPolicyCommand(utterance);
  const earlyReply = strongTransactionInput || bypassPublic ? "" : kakaoPublicCommandReply(utterance, origin, env);
  const seedChatFirst = !botGroupKey && trustedIdentity;
  const groupFirstRecord = !!botGroupKey && trustedIdentity && firstRecordInput && getExplicitKakaoBotGroupKey(payload) === botGroupKey;
  const roomRecordRead = !!botGroupKey && trustedIdentity && preParsedList.length > 0 && !earlyReply && getExplicitKakaoBotGroupKey(payload) === botGroupKey;
  const roomSnapshotPromise = roomRecordRead && skillConfigured && env.__AB_KAKAO_REQUEST
    ? readKakaoRoomRoutingSnapshot(env, botGroupKey, kakaoUserKey, payload) : null;
  roomSnapshotPromise?.catch(() => {});

  // V22.9.16: 사용자 행 조회는 수정 세션 확인과 서로 필요 없다. 먼저 던져 두고 아래에서 받는다.
  // 공개 응답으로 끝나는 발화는 예전처럼 사용자 행을 만들지 않도록 여기서는 던지지 않는다.
  const earlyUserPromise = skillConfigured && kakaoUserKey && !earlyReply
    ? ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { seedChatFirst, create: trustedKakaoCaller, trustedKakaoCaller }).then((user) => ({ user }), (error) => ({ error }))
    : null;

  // V22.8.16 지침서 3장 3단계: 유효한 수정 세션이 있으면 메시지 전체를
  // handleEditMessage가 소비하고 다른 어떤 핸들러로도 보내지 않는다.
  // (새 "수정/삭제/복구 NN번" 명령은 아래 본 라우터의 1·2단계에서 새로 시작한다.)
  let editSessionNotice = "";
  let routingSnapshot = null, routingHouseholdsPromise = null;
  let roomContext = null;
  if (roomSnapshotPromise) { roomContext = await roomSnapshotPromise; routingSnapshot = { edit: roomContext.edit }; }
  // One request-local snapshot replaces three independent routing reads. It is
  // never retained across messages; the mutation-sensitive pending marker below
  // is protected separately by an atomic compare-and-set under the writer lease.
  if (strongTransactionInput && !botGroupKey && earlyUserPromise) {
    const resolved = await earlyUserPromise;
    if (resolved.error) throw resolved.error;
    if (resolved.user?.id) {
      const uid = resolved.user.id;
      routingHouseholdsPromise = fetchUserHouseholds(env, uid).then(value => ({value}), error => ({error}));
      const keys = [kakaoEditSessionKeyV4(kakaoUserKey,payload),kakaoSelectedHouseholdKey(uid),kakaoFlowStateKey(uid,payload)];
      const rows = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${keys.map(encodeURIComponent).join(",")})&select=key,value`, {method:"GET"});
      if (!Array.isArray(rows) || rows.some(row=>!keys.includes(row.key)) || new Set(rows.map(row=>row.key)).size!==rows.length) throw new Error("kakao_routing_settings_invalid");
      const values = new Map(rows.map(row=>[row.key,row.value]));
      routingSnapshot = {edit:values.get(keys[0]) ?? null,selected:values.get(keys[1]) ?? null,flow:values.get(keys[2]) ?? null};
    }
  }
  // V22.9.76 감사 B-2: 수정 세션의 메뉴·선택지에 "1번"·"6번 WIFI♥"로 답하면 옛 문법(‘N번 …’ = 오늘의 N번 기록 수정)이
  // 먼저 잡아 다른 기록을 바꿨다. 수정·삭제·복구 말이 없는 "N번…"은 열린 세션에 먼저 넘긴다(세션이 없으면 예전 경로).
  // 감사 B-4: 목록·요약·정산·예산·가계부 전환·메뉴 명령은 세션을 비켜 간다(세션은 남아 있어 이어서 고칠 수 있다).
  if (!separatePurchaseCommand && !roomRestartCommand && skillConfigured && kakaoUserKey && !isKakaoEditSessionBypassCommand(utterance) &&
      (isKakaoSessionSeqReplyV4(commandText) || (!parseKakaoEditCommandV4(commandText) && !parseKakaoDeleteCommandV4(commandText) && !parseKakaoRestoreCommandV4(commandText)))) {
    // T6: 분명한 새 기록이면 세션만 끝나고(passThrough) 아래 기록 경로로 이어진다.
    const editSessionReply = await handleKakaoEditSessionMessageV4(env, { utterance: kakaoEditSessionTextV4(utterance) || utterance, kakaoUserKey, payload, origin, newTransaction: strongTransactionInput, recordGuardKind: String(recordGuard?.kind || ""), sessionRaw: routingSnapshot?.edit, explicitEdit: explicitEditCommandV229141 });
    if (editSessionReply?.passThrough) editSessionNotice = String(editSessionReply.notice || "");
    else if (editSessionReply) {
      // V22.9.90 독립 검토: 열린 수정 세션이 받은 답("금액 13000"·"1번")은 위 미리 읽기가 기록으로 보았어도 관제 기능 순위에서는 고치기(EDIT)다.
      if (usage) usage.intent = "EDIT";
      return editSessionReply;
    }
  }

  if (earlyReply) {
    // V22.9.88(Y-7): 단톡방 ‘웹가계부’는 웹 가계부를 바로 여는 링크 버튼 카드로 답한다(카카오 심사: 답 글에 주소를 넣지 않는다).
    if (skillConfigured && botGroupKey && isLinkCommand(utterance)) {
      // V22.9.115: 누르기 전에 이 방 가계부 구성원으로 들인다(가계부 없는 방은 첫 호출자가 소유자). 그래야 단추가 로그인 화면 없이 이 방 가계부 홈을 연다(V22.9.105 R-1).
      const linkJoined = await joinRoomOnCallSync({ source: "link" });
      const lead = roomJoinNoticeLine(linkJoined);
      // V22.9.118 P-3: 참여 한 줄이 있으면 약관 안내를 그 말풍선에 합치도록 알려 둔다(kakaoTermsNoticeResponseV229118).
      if (lead && env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.termsNoticeLeadV229118 = lead;
      // V22.9.129: 단추 주소에 이 방 가계부를 가리키는 표식을 싣는다(들이기 단계가 이 방 가계부 번호를 알아낸 때 — 이용 제한된 사람의 답에도 실린다.
      // 표식은 권한이 아니다). 카카오가 식별 값을 붙이지 않는 PC 카카오톡으로 눌러도
      // 로그인 뒤 이 방 가계부가 열리고, 그 브라우저에 카카오 로그인이 돼 있으면 화면 없이 들어온다(auth/kakao-room-open.js kakaoRoomEntryResponse).
      const roomHouseholdId = linkJoined?.ok ? String(linkJoined.household?.id || linkJoined.householdId || "") : "";
      return kakaoWebLedgerReply(origin, lead, roomHouseholdId);
    }
    if (skillConfigured && isLinkCommand(utterance)) return kakaoText(await kakaoPrivateWebLinkReply(request, env, payload, kakaoUserKey, nickname, origin));
    return kakaoText(earlyReply);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!strongTransactionInput && isCommandMenuCommand(utterance)) return kakaoManualReply("home", { group: !!botGroupKey });
    if (!strongTransactionInput && isKakaoStartCommand(utterance)) return kakaoManualReply("home", { group: !!botGroupKey });
    if (isHelpCommand(utterance)) return kakaoManualReply("home", { group: !!botGroupKey });
    if (!strongTransactionInput && isBudgetCommand(utterance) || isKakaoBudgetSetupCommand(utterance)) return kakaoText(kakaoBudgetGuideText(origin));
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }

  if (!kakaoUserKey) {
    return kakaoText("사용자 식별정보를 확인하지 못했어요. 봇을 다시 호출해 주세요. 같은 문제가 계속되면 관리자에게 요청 ID와 함께 문의해 주세요.");
  }
  const earlyUser = earlyUserPromise ? await earlyUserPromise : null;
  if (earlyUser?.error) throw earlyUser.error;
  const user = earlyUser?.user || await ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { seedChatFirst, create: trustedKakaoCaller, trustedKakaoCaller });
  if (!user?.id) return kakaoText("skill_identity_untrusted: \uC778\uC99D\uB41C \uCE74\uCE74\uC624 \uC694\uCCAD\uC5D0\uC11C \uCC98\uC74C \uAE30\uB85D\uC744 \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.");
  // Ordinary parsed records can reuse a connected room, but cannot gain first-
  // record onboarding eligibility or automatically join an unlinked room.
  if (roomContext && !groupFirstRecord && !roomContext.observed.link) roomContext = null;
  if (roomContext) roomContext = startKakaoRoomRecordSnapshot(env, roomContext, user, payload);

  // V22.9.16: 가계부 목록·단톡방 연결·선택 가계부는 거의 모든 발화가 결국 읽는다. 흐름 상태
  // 조회와 나란히 던져 두고 필요한 자리에서 받는다. 가계부를 바꾸는 길(만들기·참여·연결)은
  // 전부 아래 사용 지점 전에 응답하고 끝나므로 미리 읽은 값이 낡을 일이 없다.
  // V22.9.133: ‘이 방에서 새로 시작’ 은 가계부 목록·방 연결을 여기서 미리 읽지 않는다(그 처리가 방 잠금 안에서 방 상태를 읽는다 — 저장소 요청 수를 줄인다).
  const householdsPromise = roomRestartCommand ? Promise.resolve({ value: [] })
    : roomContext ? roomContext.membershipPromise.then(value => ({ value: value.households }), error => ({ error }))
    : routingHouseholdsPromise || fetchUserHouseholds(env, user.id).then((rows) => ({ value: rows }), (error) => ({ error }));
  const linkedGroupPromise = botGroupKey && !groupFirstRecord && !roomRestartCommand
    ? (roomContext ? roomContext.membershipPromise.then(snapshot => snapshot.household || getLinkedKakaoGroupHousehold(env, botGroupKey)) : getLinkedKakaoGroupHousehold(env, botGroupKey)).then((value) => ({ value }), (error) => ({ error }))
    : Promise.resolve({ value: null });
  const selectedHouseholdIdPromise = botGroupKey
    ? Promise.resolve({ value: "" })
    : routingSnapshot ? Promise.resolve({value:String(routingSnapshot.selected || "").trim()})
      : getKakaoSelectedHouseholdId(env, user.id).then((value) => ({ value }), (error) => ({ error }));
  const settle = async (promise) => { const result = await promise; if (result.error) throw result.error; return result.value; };
  // V22.9.63 감사(단톡방 2): 연결 전 방 안내는 방의 실제 상태를 따른다. 해제·삭제된 방은 "기록을 보내면 자동으로 준비해요"라고
  // 하지 않고, 기록이 아닌 말에는 "방금 입력한 기록은 저장하지 않았어요"라고 하지 않는다(읽기 실패는 연결 전 방 기본 안내).
  // V22.9.79 감사 B-10: 첫 기록으로 가계부를 만드는 중인 방(preparing)도 따로 알려, 안내가 "기록하면 만들어져요"라고 하지 않게 한다.
  const unlinkedRoomTextOptions = async (writeRejected = false) => {
    let phase = "never";
    if (botGroupKey) {
      try { phase = kakaoRoomPhaseOf(await readKakaoGroupFirstSnapshot(env, botGroupKey)); } catch (_) {}
    }
    return { writeRejected: !!writeRejected, retired: phase === "retired", preparing: phase === "preparing" };
  };
  // 시작·도움말 첫 화면의 상태 한 줄. 한 번도 연결된 적 없는 방은 예전 문구 그대로, 만드는 중인 방은 V22.9.79 부터 따로 말한다.
  // V22.9.132 G-1: 해제·삭제된 방(retired)에는 새로 시작하는 길(‘가계부만들기’)도 적는다 — 예전에는 쓰던 가계부를 붙이는 길만 적었다.
  const unlinkedRoomStatusLine = (options) => options.retired
    ? `이 방에서 쓰던 가계부가 삭제됐거나 연결이 해제되어, 기록을 보내도 자동으로 다시 만들지 않아요. 새로 시작하려면 ‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’, 쓰던 가계부를 붙이려면 주인·관리자가 ‘단톡방연결 초대코드’를 보내 주세요.`
    : options.preparing ? "이 방의 공동 가계부를 만드는 중이에요. 잠시 뒤 다시 확인해 주세요."
    : "이 방은 아직 가계부가 없어요. 첫 기록을 보내면 바로 만들어져요.";
  // 연결이 없는 방의 조회 답에 다는 단추. V22.9.133: 삭제·해제된 방에는 ‘이 방에서 새로 시작’ 을 맨 앞에 둔다(그 밖의 방은 예전 그대로).
  const unlinkedRoomQuickReplies = (options) => dedupeQuickReplies(options.retired
    ? [[KAKAO_ROOM_RESTART_COMMAND_V229133, KAKAO_ROOM_RESTART_COMMAND_V229133], ["단톡방연결", "단톡방연결"], ["가계부전환", "가계부전환"]]
    : [["가계부전환", "가계부전환"], ["단톡방연결", "단톡방연결"], ["가계부만들기", "가계부만들기"]]);

  // V22.9.133(사용자 2026-11-20 물음 창 "한 번 눌러 새로 시작"): 가계부가 삭제됐거나 연결이 해제된 방에서 ‘이 방에서 새로 시작’ 을 누르면 새 가계부를 만들고
  // 이 방에 연결한다(group-links-first-record.js restartKakaoRoomV229133 — 누른 사람이 소유자). 확인된 단톡방 요청에서만 한다(첫 기록 자동 준비와 같은 조건).
  // 기록을 보내는 것만으로는 여전히 다시 만들지 않는다. 연결된 방에서는 아무것도 하지 않고, 한 번도 연결된 적 없는 방에서는 ‘시작’ 과 같게 답한다.
  if (roomRestartCommand) {
    if (!botGroupKey) return kakaoText(`‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’ 은 가계부를 지웠거나 연결을 끊은 단톡방에서 쓰는 말이에요. 그 단톡방에서 봇을 불러 보내 주세요.`, [["시작", "시작"]]);
    if (!roomJoinEligible) return kakaoText("이 요청으로는 이 방의 가계부를 새로 시작할 수 없어요. 단톡방에서 봇을 불러 다시 보내 주세요.", [["시작", "시작"]]);
    await clearKakaoFlowState(env, user.id, payload);
    const restartButton = [KAKAO_ROOM_RESTART_COMMAND_V229133, KAKAO_ROOM_RESTART_COMMAND_V229133];
    const restartBusyText = "이 방의 공동 가계부를 준비하거나 바꾸는 요청이 처리 중이에요. 잠시 뒤 다시 눌러 주세요.";
    let restarted = null;
    try { restarted = await restartKakaoRoomV229133(env, { user, groupKey: botGroupKey, nickname }); }
    catch (err) {
      const reason = safeError(err);
      // 다른 요청이 이 방·이 사람의 잠금을 쥐고 있을 때(함께 누름)와 그 사이 범위가 바뀐 때는 고장이 아니다 — 처리 중이라고 답한다.
      if (/settings_rmw_busy|household_create_busy|scope_changed/.test(reason)) return kakaoText(restartBusyText, [restartButton]);
      rememberOpsEvent({ kind: "kakao_room_restart_failed", severity: "warn", path: "/skill", method: "POST", detail: reason });
      // 다시 눌러도 된다: 만들다 만 가계부가 있으면 누른 사람이 그것으로 이어 한다(group-links-first-record.js 의 이어 하기 표식).
      return kakaoText("이 방의 가계부를 새로 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.", [restartButton]);
    }
    if (restarted?.ok) {
      // 누른 사람이 이 방의 새 가계부에 처음 들어온 것이다 — 약관 안내 한 줄을 단다(첫 기록·첫 호출로 들어올 때와 같다, V22.9.118).
      if (env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;
      return kakaoText([
        "✅ 이 방의 가계부를 새로 시작했어요.",
        `가계부: ${restarted.household?.name || "이 방의 공동 가계부"} · 소유자는 방금 누른 나예요.`,
        "",
        "이제 이 방의 기록은 새 가계부에 저장되고, 이 방에서 봇을 부르거나 거래를 보내는 참여자는 승인 없이 구성원이 돼요.",
        "예전 가계부의 기록은 새 가계부로 옮겨지지 않아요. 저장하지 못한 기록은 다시 보내 주세요.",
      ].join("\n"), [["기록방법", "기록방법"], ["이번달요약", "이번달요약"]]);
    }
    if (restarted?.reason === "linked") {
      return kakaoText(`이 방은 이미 ‘${restarted.household?.name || "가계부"}’ 가계부에 연결돼 있어요. 새로 시작하지 않았어요.`, [["이번달요약", "이번달요약"], ["기록방법", "기록방법"]]);
    }
    if (restarted?.reason === "merged") {
      return kakaoText("계정 통합으로 사용자 정보가 바뀌어 새로 시작하지 않았어요. 봇을 다시 불러 눌러 주세요.", [restartButton]);
    }
    if (restarted?.reason === "pending_other") {
      // 다른 사람이 방금 이 방의 새 가계부를 만들었는데 연결이 끝나지 않았다 — 여기서 또 만들지 않는다(그 사람이 다시 누르면 이어지고, 30분 뒤에는 누구나 새로 시작한다).
      return kakaoText(`다른 분이 이 방의 새 가계부를 만드는 중이에요(연결이 아직 끝나지 않았어요).
그분이 ‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’ 을 다시 누르면 이어서 연결돼요. 30분이 지나면 다른 분도 새로 시작할 수 있어요.`, [restartButton]);
    }
    if (restarted?.reason === "bind_failed") {
      return kakaoText([
        `새 가계부 ‘${restarted.household?.name || "이 방의 공동 가계부"}’ 는 만들었지만 이 방에 연결하지 못했어요.`,
        `‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’ 을 다시 눌러 주세요. 누른 분이 30분 안에 다시 누르면 같은 가계부로 이어서 연결해요.`,
      ].join("\n"), [restartButton, ["단톡방연결", "단톡방연결"]]);
    }
    if (restarted?.reason === "never" || restarted?.reason === "preparing") {
      // 지운 가계부가 없는 방(한 번도 연결된 적 없음·만드는 중): ‘시작’ 과 같다 — 부른 사람을 들이고(가계부 없는 방은 첫 호출자가 소유자로 준비, 만들다 멈춘
      // 준비는 이어서 끝낸다) 상태를 말한다.
      const joined = await joinRoomOnCallSync({ user, source: "restart" });
      if (roomJoinedResult(joined)) return kakaoManualReply("home", { group: true, statusLine: [`이 방 가계부: ${joined.household.name}`, roomJoinStatusLine(joined)].join("\n") });
      return kakaoManualReply("home", { group: true, statusLine: unlinkedRoomStatusLine(await unlinkedRoomTextOptions(false)) });
    }
    return kakaoText(restartBusyText, [restartButton]);
  }

  if (!strongTransactionInput && isCommandMenuCommand(utterance)) {
    return kakaoManualReply("home", { group: !!botGroupKey });
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
      // V22.9.115: 시작을 부른 사람도 이 방 가계부에 들인다(가계부 없는 방은 첫 호출자가 소유자로 준비). 들였으면 그 상태를 한 줄로 말하고, 못 들인 경우(나간 이력·해제된 방·실패)는 예전 안내.
      const startRole = linkedGroupHousehold?.id ? String(households.find((h) => String(h.id) === String(linkedGroupHousehold.id))?.role || "") : "";
      const startJoined = !linkedGroupHousehold?.id || !startRole || startRole === "pending" ? await joinRoomOnCallSync({ user, role: linkedGroupHousehold?.id ? startRole : undefined, source: "start" }) : null;
      if (roomJoinedResult(startJoined)) {
        return kakaoManualReply("home", { group: true, statusLine: [`이 방 가계부: ${startJoined.household.name}`, roomJoinStatusLine(startJoined)].join("\n") });
      }
      // V22.9.68: 시작은 버튼형 사용 설명서 첫 화면으로 답하고, 지금 상태를 한 줄로 알려 준다.
      if (!linkedGroupHousehold?.id) {
        return kakaoManualReply("home", { group: true, statusLine: unlinkedRoomStatusLine(await unlinkedRoomTextOptions(false)) });
      }
      // V22.9.43: 참여 전이거나 승인 대기면 이 방에서 거래 한 번으로 바로 참여한다고 알린다(예전에는 승인대기로만 보였다).
      const membership = households.find((h) => String(h.id) === String(linkedGroupHousehold.id));
      const myRole = String(membership?.role || "");
      const departureSnapshot = !myRole || myRole === "pending" ? await readKakaoGroupFirstSnapshot(env,botGroupKey,user.id) : null;
      const departed = !!departureSnapshot?.departures.households[await sha256Hex(linkedGroupHousehold.id)];
      const roleLine = departed ? "나간 이력이 있어 자동 참여하지 않아요. 초대코드로 참여를 요청해 주세요."
        : !myRole || myRole === "pending" ? "기록을 한 번 보내면 자동으로 참여해요."
          : `내 권한: ${userHouseholdRoleLabel(myRole)}`;
      return kakaoManualReply("home", { group: true, statusLine: [`이 방 가계부: ${linkedGroupHousehold.name}`, roleLine].join("\n") });
    }
    if (!active.length) return kakaoManualReply("home", { group: false, statusLine: "첫 기록을 보내면 내 가계부가 바로 만들어져요." });
    const current = active.find((h) => String(h.id) === String(selectedHouseholdId || "")) || null;
    if (!current) {
      if (selectedHouseholdId) await clearKakaoSelectedHousehold(env, user.id);
      const choice = await beginKakaoHouseholdChoice(env, { user, payload, households: active, action: "select", origin, forceChoice: true });
      return kakaoText(choice.text, choice.quickReplies || []);
    }
    return kakaoManualReply("home", { group: false, statusLine: `지금 가계부: ${current.name}` });
  }

  if (isHelpCommand(utterance)) {
    const [households, linkedGroupHousehold] = await Promise.all([
      settle(householdsPromise),
      settle(linkedGroupPromise),
    ]);
    const active = kakaoActiveHouseholds(households);
    // V22.9.65: 도움말·사용법은 버튼형 사용 설명서 첫 화면으로 답하고, 지금 상태를 한 줄로 알려 준다.
    if (botGroupKey) {
      // V22.9.115: 도움말을 부른 사람도 이 방 가계부에 들인다(시작과 같다).
      const helpRole = linkedGroupHousehold?.id ? String(households.find((h) => String(h.id) === String(linkedGroupHousehold.id))?.role || "") : "";
      const helpJoined = !linkedGroupHousehold?.id || !helpRole || helpRole === "pending" ? await joinRoomOnCallSync({ user, role: linkedGroupHousehold?.id ? helpRole : undefined, source: "help" }) : null;
      if (roomJoinedResult(helpJoined)) {
        return kakaoManualReply("home", { group: true, statusLine: [`이 방 가계부: ${helpJoined.household.name}`, roomJoinStatusLine(helpJoined)].join("\n") });
      }
    }
    if (botGroupKey && !linkedGroupHousehold?.id) {
      // V22.9.68 감사(단톡방 2): 해제·삭제된 방에는 "첫 기록을 보내면 만들어져요"라고 하지 않는다.
      return kakaoManualReply("home", { group: true, statusLine: unlinkedRoomStatusLine(await unlinkedRoomTextOptions(false)) });
    }
    if (botGroupKey && linkedGroupHousehold?.id) {
      return kakaoManualReply("home", { group: true, statusLine: `이 방 가계부: ${linkedGroupHousehold.name}` });
    }
    return kakaoManualReply("home", { group: false, statusLine: active.length ? "" : "첫 기록을 보내면 내 가계부가 바로 만들어져요." });
  }

  const flowSnapshot = roomContext ? (await roomContext.settingsPromise).get(roomContext.flowKey) ?? null : routingSnapshot?.flow;
  const activeFlowBeforeRouting = await getKakaoFlowState(env, user.id, payload, flowSnapshot);
  if (activeFlowBeforeRouting && ["create_household", "join_household", "household_choice"].includes(activeFlowBeforeRouting.flow)) {
    // V22.9.144 독립 검토 F3: 해 말·연도 + N월을 적은 금액 있는 예산 설정 명령은 새 가계부 이름·가계부 고르기 단계의 입력값이 아니다(예전에는
    // 달력 답이 먼저 받았다). 흐름을 끊고 아래 길로 보낸다.
    if (shouldInterruptKakaoFlowV2254(activeFlowBeforeRouting, utterance) || isKakaoBudgetYearMonthCommand(utterance)) {
      await clearKakaoFlowState(env, user.id, payload);
    } else {
      const activePreFlow = await handlePreHouseholdGuidedFlow(env, { utterance, user, payload, nickname, origin, roomLinkPromise: linkedGroupPromise });
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

  // V22.9.37 감사 H3: 앱이 복사해 주는 초대 문구 "가계부 참여 CODE"는 참여 흐름 안내가 아니라 그 코드로 바로 참여다(아래 joinCode 경로).
  if (!strongTransactionInput && isKakaoJoinFlowCommand(utterance) && !parseJoinCode(utterance)) {
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
        // V22.9.79 감사 N-5: 현재 연결과 바꿀 가계부의 이름이 같으면 역할·만든 날(·시각)로 구별해 보여 준다(이름이 다르면 예전과 같다).
        const bindCurrent = result.current?.id ? { ...result.current, role: result.current_role } : null;
        const bindTarget = { ...(result.household || {}), role: result.role };
        return kakaoText(["단톡방 연결을 변경할까요?", bindCurrent?.name ? `현재: ${kakaoHouseholdReplyName(bindCurrent, [bindTarget])}` : "현재: 연결되지 않음", `변경: ${bindCurrent ? kakaoHouseholdReplyName(bindTarget, [bindCurrent]) : (result.household?.name || "가계부")}`, kakaoRoomBindConfirmLine(result.household?.name), "", "연결하려면 ‘응’ 또는 ‘연결하기’를 입력해 주세요."].join("\n"), [["연결하기", "연결하기"], ["취소", "취소"]]);
      }
      return kakaoText("단톡방 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (result.already_linked) return kakaoText(`이 단톡방은 이미 ‘${result.household.name}’ 가계부에 연결되어 있어요.`, kakaoStartQuickReplies(true));
    return kakaoText(await kakaoRoomBindDoneText(env, result.household), [["기록방법", "기록방법"], ["예산설정", "예산설정"], ["이번달요약", "이번달요약"]]);
  }

  if (!strongTransactionInput && isGroupLinkInfoCommand(utterance)) {
    // V22.9.63: 단톡방에서 소유자·관리자가 ‘단톡방연결’을 보내면 안내문이 아니라 연결할 가계부 선택으로 바로 간다. 예전 안내문은
    // 빠른 답장이 다시 ‘단톡방연결’이라 같은 안내만 돌았고, 초대코드를 직접 쳐야만 연결이 바뀌었다(2026-10-19 운영 보고).
    // ‘단톡방 정보’처럼 연결이라는 말이 없는 요청과, 관리할 가계부가 없는 사람에게는 예전처럼 상태만 보여 준다.
    if (botGroupKey && /연결/.test(String(utterance || ""))) {
      const [households, linkedGroupHousehold] = await Promise.all([settle(householdsPromise), settle(linkedGroupPromise)]);
      if (kakaoManageableHouseholds(households).length) {
        const choice = await beginKakaoHouseholdChoice(env, { user, payload, households, action: "bind", origin, groupKey: botGroupKey, forceChoice: true });
        // V22.9.79 감사 N-5: 내 가계부 중에 같은 이름이 또 있으면 현재 연결도 역할·만든 날(·시각)로 구별해 보인다.
        const currentLine = linkedGroupHousehold?.id ? `현재 연결: ${kakaoHouseholdReplyName({ ...linkedGroupHousehold, role: households.find((h) => String(h.id) === String(linkedGroupHousehold.id))?.role }, households)}` : "현재 연결: 없음";
        return kakaoText(`${currentLine}\n${choice.text}`, choice.quickReplies || []);
      }
    }
    const groupInfoText = await kakaoGroupInfoText(env, payload, origin, user);
    // V22.9.133: 삭제·해제된 방의 안내에는 ‘이 방에서 새로 시작’ 줄이 있다 — 그 단추를 맨 앞에 단다(그 밖의 방은 예전 단추 그대로).
    return kakaoText(groupInfoText, groupInfoText.includes(`‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’`)
      ? [[KAKAO_ROOM_RESTART_COMMAND_V229133, KAKAO_ROOM_RESTART_COMMAND_V229133], ["가계부만들기", "가계부만들기"], ["초대코드", "초대코드"]]
      : [["가계부만들기", "가계부만들기"], ["초대코드", "초대코드"]]);
  }

  // V22.9.122 AZ-1(출시 전 점검 2026-11-14): ‘초대코드 CODE’·‘참여코드 CODE’도 ‘참여 CODE’와 같은 참여 길로 보낸다(아래 초대코드 보기·방 자동 참여보다 먼저, 승인 대기 규칙 그대로).
  const joinCode = strongTransactionInput ? "" : (parseJoinCode(utterance) || parseInviteCodeJoinCommand(utterance));
  if (joinCode) {
    try {
      const joined = await joinHouseholdByCode(env, user.id, joinCode);
      if (!joined) return kakaoText(`초대코드 ${joinCode}를 찾지 못했어요. 코드를 다시 확인해 주세요.`);
      // V22.9.37 감사 H2: 단톡방에서 보낸 참여 명령은 1:1 개인 가계부 선택을 바꾸지 않는다.
      if (!botGroupKey && !["pending","blocked"].includes(joined.join_role)) await setKakaoSelectedHousehold(env, user.id, joined.id);
      // V22.9.122 AZ-2(출시 전 점검 2026-11-14): 단톡방에서 참여해도 이 방은 그 가계부에 연결되지 않는데 ‘이제 … 바로 기록할 수 있어요’라고 했다(다음 방 기록은 ‘이 방의 공동 가계부’로 감).
      // 이 방이 그 가계부에 연결돼 있지 않으면 참여 범위(개인 대화·웹)와 ‘단톡방 연결 CODE’를 적는다. 방 연결은 위에서 이미 던져 둔 읽기를 받는다(조회 추가 없음).
      const roomNote = botGroupKey ? kakaoRoomJoinScopeNoteV229122(joined, joinCode, (await linkedGroupPromise)?.value) : "";
      if (["pending","blocked","viewer"].includes(joined.join_role)) return kakaoText((roleBlockedMessage(joined.join_role, joined.name) || `🕒 ‘${joined.name}’ 참여 요청을 보냈어요.`) + (joined.join_role === "pending" && roomNote ? `\n\n${roomNote}` : ""));
      return kakaoText(`✅ ‘${joined.name}’ 가계부에 참여했어요.\n\n${roomNote || "이제 ‘점심 12000원 국민카드’처럼 바로 기록할 수 있어요."}`, kakaoStartQuickReplies(true));
    } catch (err) {
      return kakaoText("초대코드 확인이 잠시 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // V22.9.31: a trusted, explicit room record is its own lifecycle operation. Public
  // conversation and manual creation/join/bind flows above never grant automatic membership.
  if (groupFirstRecord) {
    const limit = boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80);
    if (preParsedList.length > limit) return kakaoText(`한 번에 ${limit}건까지 입력할 수 있어요. ${preParsedList.length}건 모두 저장하지 않았어요. 내용을 나눠 다시 보내 주세요.`);
    // V22.9.120 후속(독립 검토 P3): 금액 상한 검사를 안전망 뒤로 옮겨 세 저장 지점(방·1:1 첫 기록·1:1)이 같은 순서(안전망 → 금액 상한)로 답한다
    // (‘올해 목표 30억 모으기’ 는 어디서나 계획 안내). 방 정보는 위에서 이미 읽기 시작했으므로 DB 호출은 늘지 않는다. 조회 전용·이용 제한은 예전처럼 금액 상한을 먼저 알린다.
    const tooLarge = preParsedList.find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
    const tooLargeReply = () => kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
    // V22.9.120 후속 3(재검토 P3): 안전망에 걸리지 않은 말의 금액 상한 안내는 방 정보 읽기를 기다리지 않는다(예전처럼 읽기 전에 답하므로 읽기가 실패해도 상한 안내).
    if (!recordGuard && tooLarge) return tooLargeReply();
    // V22.9.79 감사 N-5: 방 기록의 저장 답장도 같은 이름 가계부를 구별한다 — 이미 던져 둔 내 가계부 목록을 답장 만들 때 쓰도록 넘긴다(조회는 늘지 않는다).
    const room = roomContext ? await roomContext.ready : null;
    const common = { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, groupKey: botGroupKey, editSessionNotice, householdRowsPromise: householdsPromise.then((result) => result.value || null), ...(room || {}) };
    if (room?.observed.link && (room.observed.done || !room.observed.marker) && room.membership.household && !room.redirectValue && !String(user.kakao_user_key || "").startsWith("merged:") && !/\(통합됨\)\s*$/.test(String(user.nickname || ""))) {
      const role = bestRoleFromRows(room.membership.roomRows.filter(row => String(row.user_id) === String(user.id)));
      if (["owner", "admin", "member"].includes(role)) {
        if (recordGuard) return kakaoRecordGuardReplyV229120(recordGuard, editSessionNotice);
        if (tooLarge) return tooLargeReply();
        const household = { ...room.membership.household, role, from_group_link: true, bot_group_key: botGroupKey };
        return await saveKakaoParsedTransactionsReply(env, { ...common, household, householdLabel: kakaoHouseholdReplyName(household, room.membership.households), firstNotice: editSessionNotice });
      }
      if (["viewer", "blocked"].includes(role)) return tooLarge ? tooLargeReply() : kakaoText(roleBlockedMessage(role, room.membership.household.name));
    }
    // V22.9.120: 저장하지 않고 되묻는 말도 이 방을 부른 것이므로 V22.9.115 처럼 답 뒤에 이 방 가계부에 들인다(설명서·빈 멘션과 같은 길).
    // 통합(V22.9.118 과 합침): 답 뒤에 처음 들인 사람은 이 답에 약관 안내가 없다 — 설명서 화면(deferRoomJoinOnCall)처럼 운영 이벤트 한 건(after_reply)만 남긴다.
    if (recordGuard) {
      if (roomJoinEligible) {
        const afterReply = !!env.__AB_KAKAO_REQUEST?.enabled;
        await deferKakaoAfterReply(env, async () => {
          const joined = await joinRoomOnCallSync({ user, source: "record_guard" });
          if (afterReply && (joined?.joinedNow || joined?.roomCreatedNow)) noteKakaoTermsNoticeDroppedV229118(env, "after_reply");
          return joined;
        }, { cost: 26 });
      }
      return kakaoRecordGuardReplyV229120(recordGuard, editSessionNotice);
    }
    if (tooLarge) return tooLargeReply();
    return await tryKakaoGroupFirstRecord(env, common);
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
  // V22.9.37 감사 H15: 승인 대기 중인 사람은 자기 참여 요청을 거둘 수 있다. 내 pending 행 하나만 지우고 확인된 뒤에만 알린다.
  if (!strongTransactionInput && isJoinCancelCommand(utterance)) {
    const pendingRows = households.filter((h) => String(h.role || "") === "pending");
    if (!pendingRows.length) return kakaoText("취소할 참여 요청이 없어요. 승인 대기 중인 가계부가 없습니다.");
    if (pendingRows.length > 1) return kakaoText([`승인 대기 중인 가계부가 ${pendingRows.length}개예요.`, ...pendingRows.slice(0, 5).map((h, index) => `${index + 1}. ${h.name || "가계부"}`), "", `취소할 가계부는 웹 가계부 관리에서 골라 주세요.\n${origin}/my/households`].join("\n"));
    try {
      const cancelled = await cancelPendingHouseholdJoin(env, user.id, pendingRows[0].id);
      if (!cancelled.cancelled) return kakaoText(`‘${pendingRows[0].name}’ 참여 요청을 취소하지 못했어요. 승인 대기 상태는 그대로예요. 잠시 뒤 다시 시도해 주세요.`);
    } catch (err) {
      return kakaoText(`‘${pendingRows[0].name}’ 참여 요청 취소 결과를 확인하지 못했어요. ‘시작’으로 현재 상태를 먼저 확인해 주세요.`);
    }
    return kakaoText(`✅ ‘${pendingRows[0].name}’ 참여 요청을 취소했어요.\n다시 참여하려면 초대코드를 다시 보내 주세요.`);
  }
  // V22.9.115: 단톡방에서 봇을 부르기만 해도 이 방 가계부의 구성원으로 들이고(승인 대기도 구성원으로), 가계부가 없는 방이면 첫 호출자를 소유자로 공동 가계부를 준비해
  // 그 가계부로 명령을 잇는다(답 맨 앞 한 줄은 래퍼 prependKakaoRoomJoinNoticeV229115). ‘초대’(초대코드 보기·구성원 초대)는 가계부 없는 방에서만 예전처럼 둔다(그 사람은 자기 가계부를 이 방에 연결하려는 것일 수 있다); 연결된 방에서는 들인 뒤 처리한다. 나간 이력·해제된 방·
  // 조회 전용·이용 제한·실패는 아래 예전 안내가 그대로 답한다.
  // V22.9.126 D-7(최종 점검): 금액이 분명한 기록 문장(‘초대권 15000원’)은 ‘초대’ 낱말이 있어도 초대 명령으로 보지 않는다(아래 세 곳도 같다).
  const inviteCommandV229126 = !strongTransactionInput && isInviteCommand(utterance);
  if (roomJoinEligible && (linkedGroupHousehold?.id || !inviteCommandV229126)) {
    const roomRole = linkedGroupHousehold?.id ? String(households.find((h) => String(h.id) === String(linkedGroupHousehold.id))?.role || "") : "";
    if (!linkedGroupHousehold?.id || !roomRole || roomRole === "pending") {
      const joined = await joinRoomOnCallSync({ user, role: linkedGroupHousehold?.id ? roomRole : undefined, source: "command" });
      if (roomJoinedResult(joined)) {
        linkedGroupHousehold = joined.household;
        households = [...households.filter((h) => String(h.id) !== String(joined.household.id)), { ...joined.household, role: joined.role }];
        activeHouseholds = households.filter((h) => !["pending", "blocked"].includes(String(h.role || "member")));
        if (env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.roomJoinNotice = roomJoinNoticeLine(joined);
      }
    }
  }
  if (botGroupKey && !linkedGroupHousehold?.id && !inviteCommandV229126) {
    const unlinkedOptions = await unlinkedRoomTextOptions(strongTransactionInput);
    return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, unlinkedOptions), unlinkedRoomQuickReplies(unlinkedOptions));
  }
  // V22.9.79 감사 B-10: 연결된 방에서는 이 안내를 하지 않는다. 내 승인 대기 가계부는 이 방 가계부와 다른 것일 수 있고(남의 가계부 이름이 방에
  // 나갔다), 이 방 가계부의 승인 대기는 승인 없이 기록 한 번으로 참여되므로 "관리자가 승인해야"가 틀리다. 아래 방 분기가 방 기준으로 답한다.
  if (pendingHousehold && !activeHouseholds.length && !botGroupKey && !isHelpCommand(utterance) && !isLinkCommand(utterance) && !inviteCommandV229126) {
    return kakaoText(`🕒 아직 승인 대기 중입니다.\n가계부: ${pendingHousehold.name}\n\n관리자가 참여자를 승인해야 기록할 수 있어요.`);
  }
  if (!botGroupKey && seedChatFirst && firstRecordInput && !selectedHouseholdId &&
      (!households.length || (households.length === 1 && households[0].role === "owner"))) {
    if (recordGuard) return kakaoRecordGuardReplyV229120(recordGuard, editSessionNotice); // V22.9.120 후속: 안전망 → 금액 상한(세 저장 지점 같은 순서)
    const tooLarge = preParsedList.slice(0, boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80)).find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
    if (tooLarge) return kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
    const firstReply = await tryKakaoChatFirstRecord(env, { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, selectedHouseholdId });
    if (firstReply) return firstReply;
    // A queued first request may have published the one personal household meanwhile.
    [households, selectedHouseholdId] = await Promise.all([fetchUserHouseholds(env, user.id), getKakaoSelectedHouseholdId(env, user.id)]);
    activeHouseholds = households.filter((h) => !["pending", "blocked"].includes(String(h.role || "member")));
  }
  // V22.9.43: 연결된 단톡방에서는 가계부가 하나도 없는 사람도 아래 방 분기에서 ‘거래 한 번이면 참여’ 안내를 받는다.
  if (!households.length && !(botGroupKey && linkedGroupHousehold?.id)) return kakaoFirstContactReplyV229148(env);

  let household = null;
  let accessRole = "";
  if (botGroupKey) {
    if (!linkedGroupHousehold?.id) {
      if (!strongTransactionInput && isInviteCommand(utterance)) {
        const choice = await beginKakaoHouseholdChoice(env, { user, payload, households: activeHouseholds, action: "invite", origin, groupKey: botGroupKey });
        return kakaoText(choice.text, choice.quickReplies || []);
      }
      const unlinkedOptions = await unlinkedRoomTextOptions(strongTransactionInput);
      return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, unlinkedOptions), unlinkedRoomQuickReplies(unlinkedOptions));
    }
    household = { ...linkedGroupHousehold, from_group_link: true, bot_group_key: botGroupKey };
    // V22.9.129: 이 방 가계부 번호를 답 마무리(kakaoRoomLedgerLinksResponseV229129)에 넘겨, ‘웹가계부’ 링크 단추가 있는 답이 방 연결을 다시 읽지 않게 한다.
    if (roomJoinEligible && env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.roomHouseholdIdV229129 = String(linkedGroupHousehold.id);
    const membership = households.find((h) => String(h.id) === String(linkedGroupHousehold.id));
    accessRole = membership?.role || "";
    // V22.9.43: \uC5F0\uACB0\uB41C \uBC29\uC740 \uC2B9\uC778 \uC5C6\uC774 \uAC70\uB798 \uD55C \uBC88\uC73C\uB85C \uCC38\uC5EC\uD55C\uB2E4(group-links-first-record.js). \uAE30\uB85D\uC774 \uC544\uB2CC \uB9D0\uC5D0\uB294 \uADF8 \uBC29\uBC95\uC744 \uC54C\uB9B0\uB2E4.
    // V22.9.72: \uCC38\uC5EC \uC804 \uC548\uB0B4\uB294 \uC138 \uC904\uB85C \uC904\uC774\uACE0 \uB9E8 \uC544\uB798 \u2018\uAE30\uB85D\uD558\uAE30\u2019(\uBA58\uC158) \uBC84\uD2BC\uC73C\uB85C \uB2E4\uC74C \uD589\uB3D9\uC744 \uC787\uB294\uB2E4(2026-10-20 \uB514\uC790\uC774\uB108 \uD53C\uB4DC\uBC31).
    // \uB098\uAC04 \uC774\uB825\uC774 \uC788\uB294 \uC0AC\uB78C\uC740 \uC2E4\uC81C \uAE30\uB85D \uC2DC\uB3C4\uC5D0\uC11C group-links-first-record.js \uAC00 \uCD08\uB300\uCF54\uB4DC \uC548\uB0B4\uB85C \uAC70\uC808\uD55C\uB2E4.
    // V22.9.79 감사 B-10: 나간 이력이 있는 사람에게는 "기록을 보내면 바로 참여돼요"라고 하지 않는다(실제로는 자동으로 다시 참여하지 않는다).
    if (!accessRole) return await kakaoRoomJoinGuideReply(env, { payload, groupKey: botGroupKey, user, household, role: "" });
  } else {
    household = activeHouseholds.find((h) => String(h.id) === String(selectedHouseholdId || "")) || null;
    if (!household && selectedHouseholdId) await clearKakaoSelectedHousehold(env, user.id);
    if (!household && activeHouseholds.length) {
      const choice = await beginKakaoHouseholdChoice(env, {
        user, payload, households: activeHouseholds,
        action: inviteCommandV229126 ? "invite" : "select",
        origin, forceChoice: true,
      });
      return kakaoText(choice.text, choice.quickReplies || []);
    }
    accessRole = household?.role || "";
  }
  if (!household) return kakaoFirstContactReplyV229148(env);

  // pending/blocked는 어떤 데이터 조회도 허용하지 않는다. viewer는 조회 명령만 허용한다.
  if (["pending", "blocked"].includes(accessRole)) {
    // V22.9.79 감사 B-10: 연결된 방의 승인 대기는 승인 없이 기록 한 번으로 참여된다(V22.9.43). 나간 이력이 있을 때만 승인을 기다려야 한다.
    if (botGroupKey && accessRole === "pending") return await kakaoRoomJoinGuideReply(env, { payload, groupKey: botGroupKey, user, household, role: "pending" });
    return kakaoText(roleBlockedMessage(accessRole, household.name));
  }
  if (accessRole === "viewer") {
    // V22.9.79: 조회 전용도 "어제 기록 보기"·"7월 3일 기록 보기"를 볼 수 있다. "오늘 기록 보기"는 최근 기록 낱말로 통과했는데 다른 날짜의 같은
    // 목록은 막혀 "요약/최근 조회는 가능하지만"이라는 안내와 맞지 않았다. 이 목록은 읽기뿐이고(내 기록을 번호로 보일 뿐), 수정·삭제·복구 말은
    // 날짜 목록 말이 아니라서 아래 막는 길을 그대로 지난다.
    const viewerReadCommand = isHelpCommand(utterance)
      || isSummaryCommand(utterance)
      || isRecentCommand(utterance)
      || isKakaoDailyListCommand(utterance)
      || isBudgetCommand(utterance)
      || isSettlementCommand(utterance)
      || !!parseKakaoSummaryRange(utterance)
      || isHouseholdSwitchCommand(utterance);
    // V22.9.79 통합 검토(T-44): 아래 길은 쓰는 말(새 기록·별도 구매·내 이름)을 조회 말보다 먼저 본다. 그래서 ‘요약 커피 4500’·‘정산 커피 4500’·
    // ‘8월 요약 커피 4500’·‘내 이름 설정 요약’이 위 조회 판정을 지나 저장됐다(V22.9.78 운영에도 있음). 쓰는 말로 읽히면 조회 낱말이 있어도 막는다.
    const viewerWriteInput = strongTransactionInput || !!separatePurchaseCommand || !!parseDirectMemberAliasCommand(utterance) || isKakaoMemberAliasCommand(utterance);
    if (!viewerReadCommand || viewerWriteInput) return kakaoText(roleBlockedMessage(accessRole, household.name));
  }

  // V22.9.43: 구성원 권한(기록만/기록·수정) 보기·바꾸기. 바꾸기는 소유자만 한다(kakaoMemberPolicyReply).
  if (separatePurchaseCommand) return handleKakaoSeparatePurchase(env, {command:separatePurchaseCommand,household,user,kakaoUserKey,payload});
  const memberPolicyCommand = strongTransactionInput ? null : parseKakaoMemberPolicyCommand(utterance);
  if (memberPolicyCommand) return kakaoText(await kakaoMemberPolicyReply(env, { household, user, role: accessRole, command: memberPolicyCommand }));

  // V22.1: 짧고 모호한 표현은 임의 실행하지 않고 관련 선택지로 한 번만 명확화합니다.
  const ambiguityReply = kakaoAmbiguityGuide(utterance, origin);
  if (ambiguityReply) {
    rememberSkillEvent({ kind: "clarify", user_key: kakaoUserKey, utterance, detail: `reason=${ambiguityReply.reason || "unknown"}` }, env);
    return kakaoText(ambiguityReply.text, ambiguityReply.quickReplies || []);
  }

  const directAlias = strongTransactionInput ? "" : parseDirectMemberAliasCommand(utterance);
  if (directAlias) {
    await saveMemberAlias(env, household.id, user.id, directAlias);
    const cleanupNotice = await completeKakaoFlowState(env, user.id, payload);
    return kakaoText(`✅ 가계부: ${household.name}
이 가계부에서 내 이름을 ‘${directAlias}’로 변경했어요.\n\n앞으로 내가 기록한 수입·지출은 ‘${directAlias}’ 이름으로 집계됩니다.` + cleanupNotice, [["이번달요약", "이번달요약"], ["기록방법", "기록방법"]]);
  }

  if (!strongTransactionInput && isKakaoMemberAliasCommand(utterance)) {
    await saveKakaoFlowState(env, user.id, payload, { flow: "member_alias", step: "name", data: { household_id: household.id } });
    return kakaoText("가계부에서 표시할 내 이름을 입력해 주세요.\n예: 민지, 엄마, 아빠", nickname ? [[nickname.slice(0,14), nickname], ["취소", "취소"]] : [["취소", "취소"]]);
  }

  if (!strongTransactionInput && isKakaoBudgetSetupCommand(utterance)) {
    if (!["owner","admin"].includes(accessRole)) return kakaoText("예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.", [["남은예산", "남은예산"]]);
    await saveKakaoFlowState(env, user.id, payload, { flow: "budget_setup", step: "root", data: { household_id: household.id, month: currentMonthKst() } });
    return kakaoText("어떤 예산을 설정할까요?", kakaoBudgetRootQuickReplies());
  }

  if (!strongTransactionInput) {
    const guided = await handleHouseholdGuidedFlow(env, { utterance, user, payload, household, nickname, origin });
    if (guided) return kakaoText(guided.text, guided.quickReplies || []);
  }

  const directBudget = parseDirectBudgetSetCommand(utterance);
  if (directBudget) {
    // V22.9.113(Gemini ① 재확인 안내): ‘동아리 예산 회식 50000원’처럼 ‘예산’ 앞뒤에 말이 더 붙어 분류가 두 낱말 이상이면 지출을 적으려던 말일 수 있다.
    // 설계대로 저장하지 않되(지출로 짐작해 저장하면 ‘식비 예산 매달 30만원’이 30만원 지출이 된다 — 픽스처 대조) 되돌아갈 길을 한 줄 덧붙인다.
    // 분류가 한 낱말이면(‘식비 예산 30만원’) 답은 예전과 같다.
    const expenseRetryHint = /\s/.test(String(directBudget.category || "")) ? "\n지출을 기록하려던 거라면 ‘예산’ 말을 빼고 ‘점심 12000원’처럼 보내 주세요." : "";
    if (!["owner","admin"].includes(accessRole)) return kakaoText(`예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.${expenseRetryHint}`);
    // V22.9.37 감사 NEW-8: "예산 50억"도 웹 예산 저장과 같은 20억 상한에서 거절한다.
    if (directBudget.amount > MAX_TRANSACTION_AMOUNT) return kakaoText(kakaoBudgetAmountTooLargeText(directBudget.amount));
    const category = await resolveBudgetCategoryName(env, household.id, directBudget.category);
    if (!category) return kakaoText(`등록된 카테고리를 찾지 못했어요.${expenseRetryHint}\n‘예산설정’을 입력해 단계별로 선택해 주세요.`, [["예산설정", "예산설정"]]);
    await saveKakaoBudget(env, household.id, directBudget.month, category, directBudget.amount);
    const totalNote = category === "__total" ? await kakaoTotalBudgetNote(env, household.id, directBudget.month) : "";
    return kakaoText(`✅ ${directBudget.month} ${category === "__total" ? "전체 월" : category} 예산을 설정했어요.\n\n설정 금액: ${numberWithCommas(directBudget.amount)}원${totalNote}`, [["남은예산", "남은예산"], ["예산설정", "예산설정"]]);
  }

  // V22.8.16 지침서 3장 1·2단계: "수정 NN번"·"삭제 NN번"·"복구"·기록 조회.
  // isStrongKakaoTransactionInput이 수정 명령 패턴을 이미 제외하므로 게이트 불필요.
  // V22.9.113: 이 백스톱은 넓은 그대로 둔다(‘예산’+금액인데 파서가 못 받은 말은 저장하지 않고 안내). ‘예산 바로 뒤 숫자’로 좁히는 안(Gemini ①)은
  // ‘식비 예산 매달 30만원’ 같은 예산 말이 30만원 지출로 저장되는 회귀가 있어 넣지 않았다(픽스처 대조).
  if (!directBudget && moneyTokenSpans(utterance).length && /(?:^|\s)예산(?=\s|$)/.test(utterance)) return kakaoText(kakaoBudgetGuideText(origin));
  // V22.9.79 감사 A-18: 하루를 가리킨 ‘뭐 썼어’류 조회는 그날의 번호 있는 기록 목록으로 답한다(아래 최근 5건 답은 날짜 없는 ‘최근’용).
  const kakaoEditCommandReply = strongTransactionInput ? null : await handleKakaoEditCommandV4(env, { utterance: kakaoRecentDayListUtterance(utterance) || commandText || utterance, household, user, kakaoUserKey, payload, origin, role: accessRole });
  if (kakaoEditCommandReply) return kakaoEditCommandReply;

  if (!strongTransactionInput && isLinkCommand(utterance)) return kakaoText(linkText(origin, household.invite_code));

  if (!strongTransactionInput && isInviteCommand(utterance)) {
    // V22.9.37 감사 H10: 초대코드는 웹 참여자 화면처럼 소유자·관리자만 본다.
    if (!canManageMyHousehold(accessRole)) return kakaoText(kakaoInviteNotAllowedText(household), [["도움말 보기", "도움말 보기"]]);
    return kakaoText(kakaoInviteManagementText(household, origin), [["단톡방연결", "단톡방연결"], ["도움말 보기", "도움말 보기"]]);
  }

  // V22.9.72: 빈 결과(예산 없음·정산할 지출 없음·기록 없음)는 짧게 알리고 다음 행동 버튼(예산설정·기록하기)으로 잇는다.
  if (!strongTransactionInput && isBudgetCommand(utterance)) {
    const canManageBudget = ["owner","admin"].includes(accessRole);
    // V22.9.122 T-2(출시 전 점검 2026-11-14): ‘지난달 예산 현황’·‘12월 예산 현황’도 늘 이번 달로 답했다(1월 1일에 12월 예산이 있어도 ‘아직 예산이 없어요’).
    // 예산 설정 명령과 같은 달 읽기(parseBudgetMonthHint: 지난달·다음 달·N월은 가장 가까운 해)로 물은 달을 보여 준다. 달 말이 없거나 읽지 못하면 예전처럼 이번 달이고, 어느 달인지는 머리줄에 적힌다.
    const budgetMonth = parseBudgetMonthHint(utterance);
    const budgetStatus = await kakaoBudgetStatusParts(env, household.id, budgetMonth, origin, household.name, { canManage: canManageBudget });
    // 독립 검토 2: ‘예산설정’ 단추는 이번 달 예산을 정하므로 다른 달을 물은 답에는 달지 않는다.
    if (budgetStatus.noBudget) return kakaoNextStepReply(budgetStatus.text, payload, canManageBudget && budgetMonth === currentMonthKst() ? [["예산설정", "예산설정"]] : []);
    return kakaoText(budgetStatus.text);
  }

  if (!strongTransactionInput && isSettlementCommand(utterance)) {
    const settlement = await kakaoSettlementParts(env, household);
    return settlement.empty ? kakaoNextStepReply(settlement.text, payload) : kakaoText(settlement.text);
  }

  const summaryRange = parseKakaoSummaryRange(utterance);
  // V22.9.81 U-25: 달력에 없는 날은 다른 날로 넘겨 요약하지 않는다(제목·분석 링크도 만들지 않는다). 날짜 기록 목록의 안내와 같은 말을 쓴다.
  if (summaryRange?.invalidDate) return kakaoText(`‘${summaryRange.text}’은 달력에 없는 날짜라서 요약하지 않았어요.\n이렇게 보내 주세요: 어제 요약 · 7월 10일 요약 · 9월 요약`);
  // V22.9.76 감사 A-13: 읽지 못한 기간을 이번 달로 바꿔 답하지 않는다.
  if (summaryRange?.unreadable) return kakaoText(`요약할 기간을 읽지 못했어요${summaryRange.text ? `: ‘${summaryRange.text}’` : ""}.\n이렇게 보내 주세요: 이번 달 요약 · 지난달 요약 · 9월 요약 · 어제 요약 · 이번 주 요약`);
  if (summaryRange) {
    const dateSummary = await kakaoDateSummaryParts(env, household, user, summaryRange, origin);
    return dateSummary.empty ? kakaoNextStepReply(dateSummary.text, payload) : kakaoText(dateSummary.text);
  }

  if (!strongTransactionInput && isSummaryCommand(utterance)) {
    // V22.9.80 V76 M-7: 연결한 환불 차감을 기록과 같은 단계에서 읽어 지출·수입·상위 분류에 반영한다(플래그가 꺼져 있으면 요청 없음).
    const summaryMonth = currentMonthKst();
    const [rawSummary, refund] = await Promise.all([
      getMonthSummary(env, household.id, summaryMonth),
      loadRefundDeductions(env, { householdId: household.id, start: `${summaryMonth}-01`, end: nextMonthStart(summaryMonth) }),
    ]);
    const summary = refundAdjustedStats(rawSummary, refund.entries || []);
    if (!Number(rawSummary?.totals?.income || 0) && !Number(rawSummary?.totals?.expense || 0)) {
      return kakaoNextStepReply([`📊 ${currentMonthKst()} 요약`, `가계부: ${household.name}`, "", "아직 이번 달 기록이 없어요.", "지금 내역을 기록해 보세요.", "예) @말해가계부 커피 4500원"].join("\n"), payload);
    }
    const reserveLine = await kakaoReserveAlert(env, household.id);
    return kakaoText(`${formatSummary(summary, currentMonthKst())}${refund.failed ? "\n환불 차감은 확인하지 못해 기록 그대로예요." : ""}
가계부: ${household.name}${reserveLine}`);
  }

  if (!strongTransactionInput && isRecentCommand(utterance)) {
    const rows = await getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 5);
    if (!rows.length) return kakaoNextStepReply(`📒 가계부: ${household.name}\n\n아직 내가 기록한 내역이 없어요.\n지금 내역을 기록해 보세요.\n예) @말해가계부 커피 4500원`, payload);
    return kakaoText(`📒 가계부: ${household.name}
${formatRecentTransactions(rows)}`);
  }

  if (!strongTransactionInput && isUndoCommand(commandText)) {
    return kakaoText("삭제할 기록의 번호를 먼저 확인해 주세요.\n예: 오늘 기록 보기 → 삭제 01번\n\n방금 입력을 지우려면 ‘방금 삭제’라고 입력해 주세요.\n삭제한 기록은 ‘복구’로 되돌릴 수 있어요.");
  }

  if (!preParsedList.length && preParsedList.blocked?.message === "amount_unit_required") {
    // V22.9.34 감사 N11: 가계부 선택 같은 흐름을 먼저 본 뒤, 저장 직전에 한 자리 금액을 다시 묻는다.
    const small = preParsedList.blocked.amount;
    return kakaoText(`금액이 ${small}원으로 읽혀 저장하지 않았어요. 정말 ${small}원이면 "${small}원"처럼 원을 붙여 다시 보내 주세요.`);
  }
  // D3: 날짜를 읽지 못한 수정·삭제 명령("지난주 금요일 01번 금액 5000")이 여기까지 오면 새 기록으로 저장하지 않는다.
  if (looksLikeKakaoEditCommandV4(commandText)) return kakaoText("수정·삭제 명령으로 보여서 새 기록으로 저장하지 않았어요.\n날짜는 이렇게 붙여 주세요.\n어제 수정 01번 금액 13000\n7월 10일 삭제 01번");
  if (looksLikeKakaoChangeRequest(commandText)) return kakaoChangeRequestReply();
  // T-44: 조회 전용은 위 판정에서 막는다. 조회 판정이 넓어져도 새 기록 저장에는 닿지 않게 저장 바로 앞에서 한 번 더 본다.
  if (accessRole === "viewer") return kakaoText(roleBlockedMessage(accessRole, household.name));
  if (recordGuard) return kakaoRecordGuardReplyV229120(recordGuard, editSessionNotice);
  // V22.9.43: 단톡방 연결 가계부에는 역할이 실려 있지 않다. 저장 안내가 구성원 권한(기록만)을 알 수 있게 실제 역할을 붙인다.
  // V22.9.77 감사 D-6: 같은 이름의 가계부가 내 목록에 또 있으면 답장의 ‘가계부:’ 줄에 역할·만든 날을 붙인다(이미 읽은 목록이라 조회는 늘지 않는다).
  const savedHousehold = household.role ? household : { ...household, role: accessRole };
  const roomSave = roomContext?.householdId === savedHousehold.id ? await roomContext.ready : null;
  return await saveKakaoParsedTransactionsReply(env, { ...(roomSave || {}), household: savedHousehold, householdLabel: kakaoHouseholdReplyName(savedHousehold, activeHouseholds), user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, firstNotice: editSessionNotice, groupKey: botGroupKey });
}
// @build:exports-start
export { handleKakaoSkillStable, normalizeKakaoButtonLabel };
// @build:exports-end
