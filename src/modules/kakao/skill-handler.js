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
  kakaoSkillCallerAuthorized, randomEntityId, rememberSkillLatency, sha256Hex,
} from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { kakaoReserveAlert } from "../settings/reserve-plans.js";
import { saveMemberAlias } from "../data/households-members-rows.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import { canManageMyHousehold } from "../my/access-control.js";
import { kakaoBudgetStatusParts } from "../domain/budgets.js";
import { kakaoPrivateWebLinkReply } from "../auth/kakao-web-claim.js";
import {
  kakaoAmbiguityGuide, kakaoBudgetGuideText, kakaoSkillSafeFallbackText,
} from "./reply-texts.js";
import {
  detectKakaoNaturalIntent, hasKakaoImageAttachment, isCommandMenuCommand, isHouseholdSwitchCommand,
  kakaoImageNotSupportedText, kakaoPublicCommandReply, parseCreateHouseholdCommand,
} from "./intent-nlu.js";
import {
  dedupeQuickReplies, kakaoGroupCompatibleResponse, kakaoGroupEmptyMentionReply, kakaoNextStepReply,
  kakaoText,
} from "./response-builders.js";
import { kakaoManualReply, kakaoManualTopic } from "./manual-guides.js";
import {
  getRecentKakaoOwnedTransactionsV2254, isKakaoDailyListCommand, isKakaoSessionSeqReplyV4,
  kakaoEditSessionKeyV4, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4,
  parseKakaoRestoreCommandV4,
} from "./edit-session-v4.js";
import { startsWithKakaoEditField } from "./edit-state-machine.js";
import { handleKakaoEditCommandV4, handleKakaoEditSessionMessageV4 } from "./edit-flow-v4.js";
import {
  armKakaoRepeatGuard, checkKakaoRepeatGuard, clearKakaoInFlight, isKakaoFirstRecordInput,
  isKakaoQaPayload, isStrongKakaoTransactionInput, kakaoDeferredReply, kakaoQaRequestAllowed,
  kakaoRepeatGuardText, looksLikeKakaoEditCommandV4, normalizeKakaoSkillResponse,
  stripLeadingCommand,
} from "./request-guards.js";
import {
  clearKakaoFlowState, completeKakaoFlowState, getKakaoFlowState, isKakaoBudgetSetupCommand,
  isKakaoCreateFlowCommand, isKakaoJoinFlowCommand, isKakaoMemberAliasCommand, isKakaoStartCommand,
  kakaoBudgetRootQuickReplies, kakaoCreateKindQuickReplies, kakaoFlowStateKey,
  kakaoStartQuickReplies, parseDirectMemberAliasCommand, saveKakaoFlowState,
  shouldInterruptKakaoFlowV2254,
} from "./guided-flow-state.js";
import {
  beginKakaoHouseholdChoice, clearKakaoSelectedHousehold, getKakaoSelectedHouseholdId,
  inferKakaoCreateKind, kakaoActiveHouseholds, kakaoBudgetAmountTooLargeText,
  kakaoCreateKindPromptText, kakaoDateSummaryParts, kakaoInviteManagementText,
  kakaoInviteNotAllowedText, kakaoManageableHouseholds, kakaoMemberPolicyReply,
  kakaoSelectedHouseholdKey, kakaoStartText, kakaoTotalBudgetNote, kakaoUnlinkedGroupStartText,
  parseDirectBudgetSetCommand, parseKakaoSummaryRange, resolveBudgetCategoryName,
  sanitizeHouseholdNameInput, saveKakaoBudget, setKakaoSelectedHousehold,
} from "./household-budget-commands.js";
import {
  KAKAO_SKILL_MAX_BODY_BYTES, handleHouseholdGuidedFlow, handlePreHouseholdGuidedFlow,
  readRequestTextBounded,
} from "./guided-flows.js";
import { saveKakaoParsedTransactionsReply } from "./transaction-save.js";
import {
  handleKakaoSeparatePurchase, parseKakaoSeparatePurchaseCommand,
} from "./separate-purchase.js";
import { readJson } from "../api/admin-api.js";
import {
  bindKakaoGroupByInviteCode, getExplicitKakaoBotGroupKey, getKakaoBotGroupKey,
  getLinkedKakaoGroupHousehold, kakaoGroupInfoText, kakaoRoomBindConfirmLine, kakaoRoomBindDoneText,
  readKakaoGroupFirstSnapshot, tryKakaoGroupFirstRecord,
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
import { currentMonthKst } from "../nlu/date-payment.js";
import {
  formatRecentTransactions, formatSummary, getMonthSummary, linkText, numberWithCommas,
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
  const work = (async () => { try {
    const headers = new Headers(request.headers || {});
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    const cloned = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    });
    const response = await handleKakaoSkill(cloned, env, { canDeferSave });
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
    rememberSkillEvent({ kind: "ok", user_key: userKey, utterance, detail: `request_id=${requestId}; intent=${intentMatch.intent}; result=${outcome.result}; status=${response.status}; normalized=${safeResponse.status}; latency_ms=${latencyMs}; db_retries=${env.__AB_MONITOR_REQUEST?.db_retries || 0}` });
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
    // V22.9.76 감사 B-6: 식별 별칭 저장이 동시 요청으로 바빠 실패하면 기록하기 전에 멈춘 것이다. "다시 보내주세요" 예시만 주던
    // 일반 안내 대신, 저장하지 않았으니 같은 내용을 다시 보내라고 분명히 말한다.
    const busyIdentity = String(err?.code || "") === "identity_alias_persistence_failed";
    const fallback = await kakaoGroupCompatibleResponse(kakaoText(busyIdentity ? "요청이 한꺼번에 몰려 이번 내용은 저장하지 못했어요.\n잠시 뒤 같은 내용을 한 번 더 보내 주세요." : kakaoSkillSafeFallbackText(origin)), payload, origin);
    const headers = new Headers(fallback.headers || {});
    headers.set("x-accountbook-version", APP_VERSION);
    headers.set("x-accountbook-intent", intentMatch.intent);
    headers.set("x-accountbook-nlu-result", "error");
    headers.set("x-accountbook-request-id", requestId);
    headers.set("x-accountbook-latency-ms", String(latencyMs));
    return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
  } })();
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
  const deferred = await kakaoGroupCompatibleResponse(kakaoDeferredReply(utterance, payload), payload, origin);
  const deferredHeaders = new Headers(deferred.headers || {});
  deferredHeaders.set("x-accountbook-version", APP_VERSION);
  deferredHeaders.set("x-accountbook-intent", intentMatch.intent);
  deferredHeaders.set("x-accountbook-nlu-result", "deferred");
  deferredHeaders.set("x-accountbook-request-id", requestId);
  deferredHeaders.set("x-accountbook-latency-ms", String(Date.now() - skillStartedAt));
  return new Response(deferred.body, { status: deferred.status, statusText: deferred.statusText, headers: deferredHeaders });
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
  if (!t || startsWithKakaoEditField(t) || /^\d+\s*번?$/.test(t)) return false;
  // ‘오늘’·‘어제’ 한 낱말은 요약 명령이기도 하지만, 세션 안에서는 날짜 값(1. 오늘 2. 어제 3. 그제)이다.
  if (/^(?:오늘|어제|그제|그저께|엊그제|이번\s*주|지난\s*주|이번\s*달|지난\s*달)$/.test(t)) return false;
  return isKakaoDailyListCommand(t) || isRecentCommand(t) || isSummaryCommand(t) || !!parseKakaoSummaryRange(t) ||
    isSettlementCommand(t) || isBudgetCommand(t) || isKakaoBudgetSetupCommand(t) || isHouseholdSwitchCommand(t) || isCommandMenuCommand(t);
}

function kakaoMixedTypeConfirmationReply(utterance = "") {
  const text = String(utterance || "").replace(/\s+/g, " ").trim();
  const example = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  const replies = text.length <= 200 && !/\n/.test(String(utterance || "")) ? [["지출로 기록", `지출 ${text}`], ["수입으로 기록", `수입 ${text}`]] : [];
  return kakaoText(`수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.\n쓴 돈이면 ‘지출 ${example}’, 들어온 돈이면 ‘수입 ${example}’처럼 앞에 구분을 붙여 다시 보내 주세요.`, replies);
}

async function handleKakaoSkill(request, env, { canDeferSave = false } = {}) {
  const handlerStartedAt = Date.now();
  const payload = await readJson(request);
  const origin = publicBaseUrl(env, new URL(request.url));
  const utterance = normalizeKakaoButtonLabel(stripLeadingCommand(String(payload?.userRequest?.utterance || payload?.utterance || "").trim()));
  const separatePurchaseCommand = parseKakaoSeparatePurchaseCommand(utterance);
  const preParsedList = separatePurchaseCommand ? [] : parseMultipleTransactions(utterance, payload);
  // V22.9.76 카카오 감사 3: "어제수정 01번 금액 5000"·"10월20일수정 …"처럼 날짜와 수정 명령을 붙여 쓴 말은 아래 두
  // 기록 거절 안내가 아니라 수정 흐름으로 보낸다.
  const editLikeUtterance = !separatePurchaseCommand && looksLikeKakaoEditCommandV4(utterance);
  if (!separatePurchaseCommand && !editLikeUtterance && (preParsedList.blocked?.message === "transaction_type_confirmation_required" || (!preParsedList.length && parseTransaction(utterance,payload).message === "transaction_type_confirmation_required"))) {
    if (preParsedList.blocked?.reason === "mixed_cues") return kakaoMixedTypeConfirmationReply(utterance);
    return kakaoText("결제·승인 취소 내역으로 보여 새 기록을 저장하지 않았어요. 환불받은 돈을 기록하려면 ‘수입 결제 취소 36000원’처럼 구분을 명시해 주세요.");
  }
  if (!separatePurchaseCommand && !editLikeUtterance && !preParsedList.length && parseTransaction(utterance,payload).message === "invalid_transaction_date") return kakaoText("달력에 없는 날짜여서 기록을 저장하지 않았어요. 날짜를 확인해 다시 보내 주세요. 연도 없는 M/D는 올해 날짜로 저장합니다.");
  const strongTransactionInput = isStrongKakaoTransactionInput(utterance, preParsedList);
  // V22.9.63 감사(1:1 2): 가계부가 없는 사람의 첫 기록은 "밥 4500원"처럼 한 글자 내용도 받는다. 아래 두 자동 준비 길에만 쓴다.
  const firstRecordInput = strongTransactionInput || isKakaoFirstRecordInput(utterance, preParsedList);
  const kakaoUserKey = getKakaoUserKey(payload);
  const nickname = getKakaoNickname(payload);

  if (!utterance) {
    if (hasKakaoImageAttachment(payload)) return kakaoText(kakaoImageNotSupportedText(origin));
    // 단톡방에서 봇만 멘션한 빈 발화: 짧은 안내 + 도움말·챗봇 멘션하기 버튼으로 다음 발화를 유도한다.
    if (getKakaoBotGroupKey(payload)) return kakaoGroupEmptyMentionReply();
    return kakaoManualReply("home", { group: false });
  }

  // V22.9.65: 버튼형 사용 설명서. 읽기 전용이라 사용자·가계부 행을 만들지 않고 바로 답한다.
  // 진행 중인 단계형 흐름·수정 세션은 그대로 두므로 설명서를 본 뒤 이어서 입력할 수 있다.
  // "입력 예시"는 앞의 "입력"이 명령 접두어로 벗겨져 "예시"가 되므로, 멘션만 뺀 원문으로 먼저 판별한다.
  const rawManualUtterance = String(payload?.userRequest?.utterance || payload?.utterance || "");
  const manualTopic = strongTransactionInput ? ""
    : kakaoManualTopic(rawManualUtterance) || kakaoManualTopic(utterance) || (isInputExampleCommand(utterance) ? "record" : "");
  if (manualTopic) return kakaoManualReply(manualTopic, { group: !!getKakaoBotGroupKey(payload) });

  const bypassPublic = !!separatePurchaseCommand || isKakaoStartCommand(utterance) || isHelpCommand(utterance) || isCommandMenuCommand(utterance) ||
    isKakaoCreateFlowCommand(utterance) || isKakaoJoinFlowCommand(utterance) || isKakaoBudgetSetupCommand(utterance) ||
    isKakaoMemberAliasCommand(utterance) || !!parseKakaoSummaryRange(utterance) || !!parseKakaoMemberPolicyCommand(utterance);
  const earlyReply = strongTransactionInput || bypassPublic ? "" : kakaoPublicCommandReply(utterance, origin, env);
  const skillConfigured = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const botGroupKey = getKakaoBotGroupKey(payload);
  // V22.9.77 감사 B-7: Secret 으로 확인된 요청만 appUserId 로 기존 웹 계정을 찾는다(ensureUser 의 trustedKakaoCaller).
  const trustedKakaoCaller = trustedChatFirstSkillCaller(request, env);
  const trustedIdentity = trustedKakaoCaller && hasChatFirstKakaoIdentity(payload, kakaoUserKey);
  const seedChatFirst = !botGroupKey && trustedIdentity;
  const groupFirstRecord = !!botGroupKey && trustedIdentity && firstRecordInput && getExplicitKakaoBotGroupKey(payload) === botGroupKey;

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
  if (!separatePurchaseCommand && skillConfigured && kakaoUserKey && !isKakaoEditSessionBypassCommand(utterance) &&
      (isKakaoSessionSeqReplyV4(utterance) || (!parseKakaoEditCommandV4(utterance) && !parseKakaoDeleteCommandV4(utterance) && !parseKakaoRestoreCommandV4(utterance)))) {
    // T6: 분명한 새 기록이면 세션만 끝나고(passThrough) 아래 기록 경로로 이어진다.
    const editSessionReply = await handleKakaoEditSessionMessageV4(env, { utterance, kakaoUserKey, payload, origin, newTransaction: strongTransactionInput, sessionRaw: routingSnapshot?.edit });
    if (editSessionReply?.passThrough) editSessionNotice = String(editSessionReply.notice || "");
    else if (editSessionReply) return editSessionReply;
  }

  if (earlyReply) {
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

  // V22.9.16: 가계부 목록·단톡방 연결·선택 가계부는 거의 모든 발화가 결국 읽는다. 흐름 상태
  // 조회와 나란히 던져 두고 필요한 자리에서 받는다. 가계부를 바꾸는 길(만들기·참여·연결)은
  // 전부 아래 사용 지점 전에 응답하고 끝나므로 미리 읽은 값이 낡을 일이 없다.
  const householdsPromise = routingHouseholdsPromise || fetchUserHouseholds(env, user.id).then((rows) => ({ value: rows }), (error) => ({ error }));
  const linkedGroupPromise = botGroupKey && !groupFirstRecord
    ? getLinkedKakaoGroupHousehold(env, botGroupKey).then((value) => ({ value }), (error) => ({ error }))
    : Promise.resolve({ value: null });
  const selectedHouseholdIdPromise = botGroupKey
    ? Promise.resolve({ value: "" })
    : routingSnapshot ? Promise.resolve({value:String(routingSnapshot.selected || "").trim()})
      : getKakaoSelectedHouseholdId(env, user.id).then((value) => ({ value }), (error) => ({ error }));
  const settle = async (promise) => { const result = await promise; if (result.error) throw result.error; return result.value; };
  // V22.9.63 감사(단톡방 2): 연결 전 방 안내는 방의 실제 상태를 따른다. 해제·삭제된 방은 "기록을 보내면 자동으로 준비해요"라고
  // 하지 않고, 기록이 아닌 말에는 "방금 입력한 기록은 저장하지 않았어요"라고 하지 않는다(읽기 실패는 연결 전 방 기본 안내).
  const unlinkedRoomTextOptions = async (writeRejected = false) => {
    let retired = false;
    if (botGroupKey) {
      try {
        const roomState = await readKakaoGroupFirstSnapshot(env, botGroupKey);
        retired = !roomState.link && (roomState.retired || !!roomState.done || roomState.marker?.phase === "complete");
      } catch (_) {}
    }
    return { writeRejected: !!writeRejected, retired };
  };

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
      // V22.9.68: 시작은 버튼형 사용 설명서 첫 화면으로 답하고, 지금 상태를 한 줄로 알려 준다.
      if (!linkedGroupHousehold?.id) {
        const roomOptions = await unlinkedRoomTextOptions(false);
        return kakaoManualReply("home", { group: true, statusLine: roomOptions.retired
          ? "이 방의 이전 가계부 연결이 해제되어 기록을 보내도 자동으로 다시 만들지 않아요. 주인·관리자가 ‘단톡방연결 초대코드’를 보내 주세요."
          : "이 방은 아직 가계부가 없어요. 첫 기록을 보내면 바로 만들어져요." });
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
    if (botGroupKey && !linkedGroupHousehold?.id) {
      // V22.9.68 감사(단톡방 2): 해제·삭제된 방에는 "첫 기록을 보내면 만들어져요"라고 하지 않는다.
      const roomOptions = await unlinkedRoomTextOptions(false);
      return kakaoManualReply("home", { group: true, statusLine: roomOptions.retired
        ? "이 방의 이전 가계부 연결이 해제되어 기록을 보내도 자동으로 다시 만들지 않아요. 주인·관리자가 ‘단톡방연결 초대코드’를 보내 주세요."
        : "이 방은 아직 가계부가 없어요. 첫 기록을 보내면 바로 만들어져요." });
    }
    if (botGroupKey && linkedGroupHousehold?.id) {
      return kakaoManualReply("home", { group: true, statusLine: `이 방 가계부: ${linkedGroupHousehold.name}` });
    }
    return kakaoManualReply("home", { group: false, statusLine: active.length ? "" : "첫 기록을 보내면 내 가계부가 바로 만들어져요." });
  }

  const activeFlowBeforeRouting = await getKakaoFlowState(env, user.id, payload, routingSnapshot?.flow);
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
        return kakaoText(["단톡방 연결을 변경할까요?", result.current?.name ? `현재: ${result.current.name}` : "현재: 연결되지 않음", `변경: ${result.household?.name || "가계부"}`, kakaoRoomBindConfirmLine(result.household?.name), "", "연결하려면 ‘응’ 또는 ‘연결하기’를 입력해 주세요."].join("\n"), [["연결하기", "연결하기"], ["취소", "취소"]]);
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
        const currentLine = linkedGroupHousehold?.id ? `현재 연결: ${linkedGroupHousehold.name}` : "현재 연결: 없음";
        return kakaoText(`${currentLine}\n${choice.text}`, choice.quickReplies || []);
      }
    }
    return kakaoText(await kakaoGroupInfoText(env, payload, origin, user), [["가계부만들기", "가계부만들기"], ["초대코드", "초대코드"]]);
  }

  const joinCode = strongTransactionInput ? "" : parseJoinCode(utterance);
  if (joinCode) {
    try {
      const joined = await joinHouseholdByCode(env, user.id, joinCode);
      if (!joined) return kakaoText(`초대코드 ${joinCode}를 찾지 못했어요. 코드를 다시 확인해 주세요.`);
      // V22.9.37 감사 H2: 단톡방에서 보낸 참여 명령은 1:1 개인 가계부 선택을 바꾸지 않는다.
      if (!botGroupKey && !["pending","blocked"].includes(joined.join_role)) await setKakaoSelectedHousehold(env, user.id, joined.id);
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
    return await tryKakaoGroupFirstRecord(env, { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, groupKey: botGroupKey });
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
  if (botGroupKey && !linkedGroupHousehold?.id && !isInviteCommand(utterance)) {
    return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, await unlinkedRoomTextOptions(strongTransactionInput)), dedupeQuickReplies([["가계부전환", "가계부전환"], ["단톡방연결", "단톡방연결"], ["가계부만들기", "가계부만들기"]]));
  }
  if (pendingHousehold && !activeHouseholds.length && !isHelpCommand(utterance) && !isLinkCommand(utterance) && !isInviteCommand(utterance)) {
    return kakaoText(`🕒 아직 승인 대기 중입니다.\n가계부: ${pendingHousehold.name}\n\n관리자가 참여자를 승인해야 기록할 수 있어요.`);
  }
  if (!botGroupKey && seedChatFirst && firstRecordInput && !selectedHouseholdId &&
      (!households.length || (households.length === 1 && households[0].role === "owner"))) {
    const tooLarge = preParsedList.slice(0, boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80)).find((parsed) => Number(parsed.amount || 0) > MAX_TRANSACTION_AMOUNT);
    if (tooLarge) return kakaoText(`금액이 너무 커서 저장하지 않았어요.\n입력 금액: ${numberWithCommas(tooLarge.amount)}원\n최대 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원까지 기록할 수 있어요. 금액을 확인해 다시 보내 주세요.`);
    const firstReply = await tryKakaoChatFirstRecord(env, { payload, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, selectedHouseholdId });
    if (firstReply) return firstReply;
    // A queued first request may have published the one personal household meanwhile.
    [households, selectedHouseholdId] = await Promise.all([fetchUserHouseholds(env, user.id), getKakaoSelectedHouseholdId(env, user.id)]);
    activeHouseholds = households.filter((h) => !["pending", "blocked"].includes(String(h.role || "member")));
  }
  // V22.9.43: 연결된 단톡방에서는 가계부가 하나도 없는 사람도 아래 방 분기에서 ‘거래 한 번이면 참여’ 안내를 받는다.
  if (!households.length && !(botGroupKey && linkedGroupHousehold?.id)) return kakaoText(kakaoStartText(false), kakaoStartQuickReplies(false));

  let household = null;
  let accessRole = "";
  if (botGroupKey) {
    if (!linkedGroupHousehold?.id) {
      if (!strongTransactionInput && isInviteCommand(utterance)) {
        const choice = await beginKakaoHouseholdChoice(env, { user, payload, households: activeHouseholds, action: "invite", origin, groupKey: botGroupKey });
        return kakaoText(choice.text, choice.quickReplies || []);
      }
      return kakaoText(kakaoUnlinkedGroupStartText(activeHouseholds, origin, await unlinkedRoomTextOptions(strongTransactionInput)), dedupeQuickReplies([["가계부전환", "가계부전환"], ["단톡방연결", "단톡방연결"], ["가계부만들기", "가계부만들기"]]));
    }
    household = { ...linkedGroupHousehold, from_group_link: true, bot_group_key: botGroupKey };
    const membership = households.find((h) => String(h.id) === String(linkedGroupHousehold.id));
    accessRole = membership?.role || "";
    // V22.9.43: \uC5F0\uACB0\uB41C \uBC29\uC740 \uC2B9\uC778 \uC5C6\uC774 \uAC70\uB798 \uD55C \uBC88\uC73C\uB85C \uCC38\uC5EC\uD55C\uB2E4(group-links-first-record.js). \uAE30\uB85D\uC774 \uC544\uB2CC \uB9D0\uC5D0\uB294 \uADF8 \uBC29\uBC95\uC744 \uC54C\uB9B0\uB2E4.
    // V22.9.72: \uCC38\uC5EC \uC804 \uC548\uB0B4\uB294 \uC138 \uC904\uB85C \uC904\uC774\uACE0 \uB9E8 \uC544\uB798 \u2018\uAE30\uB85D\uD558\uAE30\u2019(\uBA58\uC158) \uBC84\uD2BC\uC73C\uB85C \uB2E4\uC74C \uD589\uB3D9\uC744 \uC787\uB294\uB2E4(2026-10-20 \uB514\uC790\uC774\uB108 \uD53C\uB4DC\uBC31).
    // \uB098\uAC04 \uC774\uB825\uC774 \uC788\uB294 \uC0AC\uB78C\uC740 \uC2E4\uC81C \uAE30\uB85D \uC2DC\uB3C4\uC5D0\uC11C group-links-first-record.js \uAC00 \uCD08\uB300\uCF54\uB4DC \uC548\uB0B4\uB85C \uAC70\uC808\uD55C\uB2E4.
    if (!accessRole) return kakaoNextStepReply("\uC544\uC9C1 \uC774 \uBC29 \uAC00\uACC4\uBD80\uC5D0 \uCC38\uC5EC \uC804\uC774\uC5D0\uC694.\n\uAE30\uB85D\uC744 \uD55C \uBC88 \uBCF4\uB0B4\uBA74 \uBC14\uB85C \uCC38\uC5EC\uB3FC\uC694.\n\uC608) @\uB9D0\uD574\uAC00\uACC4\uBD80 \uCEE4\uD53C 4500\uC6D0", payload);
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

  // V22.9.43: 구성원 권한(기록만/기록·수정) 보기·바꾸기. 바꾸기는 소유자만 한다(kakaoMemberPolicyReply).
  if (separatePurchaseCommand) return handleKakaoSeparatePurchase(env, {command:separatePurchaseCommand,household,user,kakaoUserKey,payload});
  const memberPolicyCommand = strongTransactionInput ? null : parseKakaoMemberPolicyCommand(utterance);
  if (memberPolicyCommand) return kakaoText(await kakaoMemberPolicyReply(env, { household, user, role: accessRole, command: memberPolicyCommand }));

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
    if (!["owner","admin"].includes(accessRole)) return kakaoText("예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.");
    // V22.9.37 감사 NEW-8: "예산 50억"도 웹 예산 저장과 같은 20억 상한에서 거절한다.
    if (directBudget.amount > MAX_TRANSACTION_AMOUNT) return kakaoText(kakaoBudgetAmountTooLargeText(directBudget.amount));
    const category = await resolveBudgetCategoryName(env, household.id, directBudget.category);
    if (!category) return kakaoText("등록된 카테고리를 찾지 못했어요.\n‘예산설정’을 입력해 단계별로 선택해 주세요.", [["예산설정", "예산설정"]]);
    await saveKakaoBudget(env, household.id, directBudget.month, category, directBudget.amount);
    const totalNote = category === "__total" ? await kakaoTotalBudgetNote(env, household.id, directBudget.month) : "";
    return kakaoText(`✅ ${directBudget.month} ${category === "__total" ? "전체 월" : category} 예산을 설정했어요.\n\n설정 금액: ${numberWithCommas(directBudget.amount)}원${totalNote}`, [["남은예산", "남은예산"], ["예산설정", "예산설정"]]);
  }

  // V22.8.16 지침서 3장 1·2단계: "수정 NN번"·"삭제 NN번"·"복구"·기록 조회.
  // isStrongKakaoTransactionInput이 수정 명령 패턴을 이미 제외하므로 게이트 불필요.
  if (!directBudget && moneyTokenSpans(utterance).length && /(?:^|\s)예산(?=\s|$)/.test(utterance)) return kakaoText(kakaoBudgetGuideText(origin));
  const kakaoEditCommandReply = strongTransactionInput ? null : await handleKakaoEditCommandV4(env, { utterance, household, user, kakaoUserKey, payload, origin, role: accessRole });
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
    const budgetStatus = await kakaoBudgetStatusParts(env, household.id, currentMonthKst(), origin, household.name, { canManage: canManageBudget });
    if (budgetStatus.noBudget) return kakaoNextStepReply(budgetStatus.text, payload, canManageBudget ? [["예산설정", "예산설정"]] : []);
    return kakaoText(budgetStatus.text);
  }

  if (!strongTransactionInput && isSettlementCommand(utterance)) {
    const settlement = await kakaoSettlementParts(env, household);
    return settlement.empty ? kakaoNextStepReply(settlement.text, payload) : kakaoText(settlement.text);
  }

  const summaryRange = parseKakaoSummaryRange(utterance);
  // V22.9.76 감사 A-13: 읽지 못한 기간을 이번 달로 바꿔 답하지 않는다.
  if (summaryRange?.unreadable) return kakaoText(`요약할 기간을 읽지 못했어요${summaryRange.text ? `: ‘${summaryRange.text}’` : ""}.\n이렇게 보내 주세요: 이번 달 요약 · 지난달 요약 · 9월 요약 · 어제 요약 · 이번 주 요약`);
  if (summaryRange) {
    const dateSummary = await kakaoDateSummaryParts(env, household, user, summaryRange, origin);
    return dateSummary.empty ? kakaoNextStepReply(dateSummary.text, payload) : kakaoText(dateSummary.text);
  }

  if (!strongTransactionInput && isSummaryCommand(utterance)) {
    const summary = await getMonthSummary(env, household.id, currentMonthKst());
    if (!Number(summary?.totals?.income || 0) && !Number(summary?.totals?.expense || 0)) {
      return kakaoNextStepReply([`📊 ${currentMonthKst()} 요약`, `가계부: ${household.name}`, "", "아직 이번 달 기록이 없어요.", "지금 내역을 기록해 보세요.", "예) @말해가계부 커피 4500원"].join("\n"), payload);
    }
    const reserveLine = await kakaoReserveAlert(env, household.id);
    return kakaoText(`${formatSummary(summary, currentMonthKst())}
가계부: ${household.name}${reserveLine}`);
  }

  if (!strongTransactionInput && isRecentCommand(utterance)) {
    const rows = await getRecentKakaoOwnedTransactionsV2254(env, household.id, user.id, kakaoUserKey, 5);
    if (!rows.length) return kakaoNextStepReply(`📒 가계부: ${household.name}\n\n아직 내가 기록한 내역이 없어요.\n지금 내역을 기록해 보세요.\n예) @말해가계부 커피 4500원`, payload);
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
  // V22.9.43: 단톡방 연결 가계부에는 역할이 실려 있지 않다. 저장 안내가 구성원 권한(기록만)을 알 수 있게 실제 역할을 붙인다.
  return await saveKakaoParsedTransactionsReply(env, { household: household.role ? household : { ...household, role: accessRole }, user, kakaoUserKey, nickname, origin, utterance, parsedList: preParsedList, handlerStartedAt, canDeferSave, firstNotice: editSessionNotice });
}
// @build:exports-start
export { handleKakaoSkillStable };
// @build:exports-end
