// @build:imports-start
import {
  AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD, boundedRuntimeNumber, pruneTimestampMap,
} from "../runtime/ops-telemetry.js";
import { incompleteFeatureQaEnabled } from "../public/site-config.js";
import { jsonResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { kakaoSkillSafeFallbackText } from "./reply-texts.js";
import { isCommandMenuCommand, isHouseholdSwitchCommand } from "./intent-nlu.js";
import { kakaoText } from "./response-builders.js";
import {
  hasKakaoEditSessionHint, isKakaoTransactionSpenderChangeCommand, parseKakaoDeleteCommandV4,
  parseKakaoEditCommandV4, parseKakaoRestoreCommandV4, stripKakaoEditDatePrefixV4,
} from "./edit-session-v4.js";
import {
  isKakaoFlowCancelCommand, isKakaoGuidedCommand, isKakaoStartCommand,
} from "./guided-flow-state.js";
import {
  isKakaoReservedCreateFlowReply, parseKakaoSummaryRange,
} from "./household-budget-commands.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { getKakaoUserKey, stableShortHash } from "./identity-chat-first.js";
import {
  isBudgetCommand, isEditGuideSimpleCommand, isGroupLinkInfoCommand, isHelpCommand,
  isInputExampleCommand, isInviteCommand, isLinkCommand, isRecentCommand, isSettlementCommand,
  isSummaryCommand, isUndoCommand, parseGroupBindCommand,
} from "./simple-commands.js";
import { extractLeadingDateHint } from "../nlu/transaction-parser.js";
import { extractAmount, normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

function stripKakaoBotMention(text = "") {
  let t = String(text || "").trim();
  // 그룹챗봇 payload에 멘션 문자열이 포함되는 환경도 안전하게 처리합니다.
  // V22.9.20: 이름을 바꿨지만 단톡방에는 옛 멘션이 남을 수 있어 둘 다 벗긴다.
  t = t.replace(/^@?(?:말해가계부|똑똑한가계부)(?:봇)?\s*/i, "");
  t = t.replace(/^@[가-힣A-Za-z0-9_.-]{1,40}\s+/, "");
  return t.trim();
}

function stripLeadingCommand(text = "") {
  const t = stripKakaoBotMention(text);
  // "기록 점심 12000원" / "/기록 점심 12000원" → "점심 12000원"
  // "수정 01번 금액 13000원" → "01번 금액 13000원"
  const m = t.match(/^\/?(기록|입력)\s+(.+)$/i);
  if (m) return m[2].trim();
  const e = t.match(/^\/?수정\s+(\d{1,3}\s*번.+)$/i);
  if (e) return e[1].trim();
  // 대표 명령어가 /시작처럼 전달되거나 사용자가 직접 슬래시를 입력해도
  // 모든 기존 자연어 판별 함수가 동일한 문장을 받도록 선행 슬래시를 제거합니다.
  if (/^\/+\s*$/.test(t)) return "메뉴";
  return t.replace(/^\/+\s*/, "").trim();
}

// D3: 날짜를 앞에 붙인 수정·삭제·복구 명령("어제 01번 금액 5000", "7/10 01번 삭제")은 날짜를 뗀 본문으로 판정한다.
// 기록 입력의 날짜 접두(요일 등)와 수정 명령의 날짜 접두(엊그제·M-D 등)를 모두 떼어 낸다.
function kakaoEditControlTextV4(text = "") {
  const raw = normalizeText(stripLeadingCommand(text));
  const afterHint = raw.slice(extractLeadingDateHint(raw).length).trim();
  return stripKakaoEditDatePrefixV4(afterHint).replace(/^\d{1,2}\s*(?:일|주)\s*전\s+/, "").trim();
}

function looksLikeKakaoEditCommandV4(text = "") {
  const control = kakaoEditControlTextV4(text);
  return /^(?:수정|삭제|복구)\s*\d+/.test(control)
    || /^\d+\s*번\s*(?:금액|분류|결제수단|내용|날짜|지출자|수입|지출|수정|삭제|제거|복구)(?=\s|$)/.test(control)
    // "방금 금액 7000"은 방금 기록의 수정이다(parseKakaoEditCommandV4 의 latest 문법). 새 지출 "방금 금액"이 아니다.
    || /^(?:방금|최근|마지막)\s*(?:거|것|기록|입력)?\s*(?:금액|가격|분류|카테고리|결제수단|내용|메모|날짜|일자|지출자|결제자)(?=\s|$)/.test(normalizeText(stripLeadingCommand(text)));
}

function isStrongKakaoTransactionInput(text = "", parsedList = []) {
  const raw = normalizeText(stripLeadingCommand(text));
  if (!raw || !Array.isArray(parsedList) || !parsedList.length) return false;
  if (looksLikeKakaoEditCommandV4(raw)) return false;
  if (/(?:^|\s)예산(?=\s|$)|^초대코드|^단톡방\s*연결|^가계부\s*(?:참여|만들기|생성)/.test(raw)) return false;
  const amountInfo = extractAmount(raw);
  if (!amountInfo?.amount) return false;
  const remainder = raw
    .replace(amountInfo.raw || "", " ")
    .replace(/(국민|신한|현대|삼성|롯데|우리|하나|농협|카카오|토스)?\s*(카드|체크카드|신용카드)|현금|계좌이체|이체|페이/gi, " ")
    .replace(/오늘|어제|그제|그저께|내일/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 금액만 보낸 단계형 답변(예: 100만원)은 빠른 거래 경로로 보내지 않습니다.
  return /[가-힣A-Za-z]{2,}/.test(remainder);
}

async function optionalWithin(promise, timeoutMs, fallback) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), Math.max(50, Number(timeoutMs || 0))); }),
    ]);
  } catch (err) {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function checkKakaoRepeatGuard(userKey = "", utterance = "", env = {}, payload = {}) {
  const text = normalizeText(stripLeadingCommand(utterance));
  if (!text || isKakaoStartCommand(text) || isCommandMenuCommand(text) || isSummaryCommand(text) || isRecentCommand(text) || isBudgetCommand(text) || isSettlementCommand(text) || isHelpCommand(text) || isLinkCommand(text) || isInviteCommand(text) || isGroupLinkInfoCommand(text) || !!parseGroupBindCommand(text) || isHouseholdSwitchCommand(text) || isInputExampleCommand(text) || isEditGuideSimpleCommand(text) || isUndoCommand(text) || !!parseKakaoEditCommandV4(text) || !!parseKakaoDeleteCommandV4(text) || !!parseKakaoRestoreCommandV4(text) || isKakaoTransactionSpenderChangeCommand(text) || hasKakaoEditSessionHint(userKey, payload) || isKakaoGuidedCommand(text) || isKakaoReservedCreateFlowReply(text) || isKakaoFlowCancelCommand(text) || !!parseKakaoSummaryRange(text)) return { ok: true, skipped: true };
  const windowMs = boundedRuntimeNumber(env.KAKAO_REPEAT_GUARD_SECONDS, 8, 2, 600) * 1000;
  const now = Date.now();
  const conversationScope = getKakaoBotGroupKey(payload) || "direct";
  const key = `${String(userKey || "unknown").slice(0, 80)}|${stableShortHash(conversationScope)}|${stableShortHash(text)}`;
  const last = AB_KAKAO_REPEAT_GUARD.get(key) || 0;
  pruneTimestampMap(AB_KAKAO_REPEAT_GUARD, now);
  // 여기서 바로 기록하면 저장되지 않은 요청(가계부 선택 안내·인식 실패 등)까지 잠긴다.
  // 사용자가 같은 문구를 다시 보내도 막히면서 결국 아무것도 저장되지 않는다.
  // 실제로 저장이 끝난 뒤에만 armKakaoRepeatGuard 로 잠근다.
  if (last && now - Number(last) < windowMs) return { ok: false, key, elapsedMs: now - Number(last), windowMs };
  // 저장이 끝난 뒤에만 잠그다 보니 "처리 중"인 동안은 문이 열려 있었다.
  // 카카오는 응답이 늦으면 같은 발화를 다시 보내는데, 그 재전송이 이 창으로
  // 들어와 같은 기록이 두 번 남았다. 처리 중 표시를 먼저 걸어 그 창을 닫는다.
  const inFlightAt = AB_KAKAO_INFLIGHT.get(key) || 0;
  pruneTimestampMap(AB_KAKAO_INFLIGHT, now);
  if (inFlightAt && now - Number(inFlightAt) < windowMs) {
    return { ok: false, key, elapsedMs: now - Number(inFlightAt), windowMs, inFlight: true };
  }
  AB_KAKAO_INFLIGHT.set(key, now);
  return { ok: true, key, elapsedMs: last ? now - Number(last) : 0, windowMs };
}

// 처리가 끝나면 "처리 중" 표시는 반드시 내린다. 저장에 실패한 요청까지
// 잠긴 채로 남으면 사용자가 다시 보내도 아무것도 저장되지 않는다.
function clearKakaoInFlight(key = "") {
  if (key) AB_KAKAO_INFLIGHT.delete(key);
}

// 카카오 응답이 "실제로 저장·수정·삭제가 일어났다"고 말할 때만 중복 방지를 건다.
const AB_KAKAO_PERSISTED_RESPONSE = /(저장했어요|기록했어요|수정했어요|삭제했어요|복구했어요|반영했어요|등록했어요|건 저장)/;

function armKakaoRepeatGuard(key = "", responseText = "") {
  if (!key) return false;
  let text = String(responseText || "");
  try {
    const body = JSON.parse(text);
    text = String(body?.template?.outputs?.map((o) => o?.simpleText?.text || "").join("\n") || text);
  } catch (_error) {}
  if (!AB_KAKAO_PERSISTED_RESPONSE.test(text)) return false;
  AB_KAKAO_REPEAT_GUARD.set(key, Date.now());
  return true;
}

function kakaoRepeatGuardText(origin = "") {
  return [
    "방금 같은 내용을 처리했어요 😊",
    "중복 저장을 막기 위해 같은 요청은 잠시 멈췄습니다.",
    "‘오늘 기록 보기’로 저장 결과를 확인해 주세요.",
  ].join("\n");
}

function buildKakaoSkillTestPayload(utterance = "메뉴") {
  const text = String(utterance || "메뉴").trim() || "메뉴";
  return {
    intent: { id: "test-intent", name: "90_가계부_통합스킬" },
    userRequest: {
      timezone: "Asia/Seoul",
      params: {},
      block: { id: "test-block", name: "90_가계부_통합스킬" },
      utterance: text,
      lang: "kr",
      user: {
        id: "test-bot-user-key",
        type: "botUserKey",
        properties: { botUserKey: "test-bot-user-key" },
      },
    },
    bot: { id: "test-bot", name: "말해가계부" },
    action: { id: "test-action", name: "말해가계부_스킬_v21", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  };
}

function isKakaoQaPayload(payload = {}) {
  const userKey = getKakaoUserKey(payload);
  const botId = String(payload?.bot?.id || "").trim();
  const intentId = String(payload?.intent?.id || "").trim();
  return ["test-bot-user-key", "raw-test-bot-user-key"].includes(userKey)
    || botId === "test-bot" || botId === "raw-test-bot"
    || intentId === "test-intent" || intentId === "raw-test";
}

async function kakaoQaRequestAllowed(request, env) {
  return incompleteFeatureQaEnabled(env) && await verifyAdminSession(request, env);
}

async function normalizeKakaoSkillResponse(response, origin = "") {
  try {
    if (!response || response.status < 200 || response.status >= 300) {
      return kakaoText(kakaoSkillSafeFallbackText(origin));
    }
    const raw = await response.clone().text();
    const data = JSON.parse(raw || "{}");
    const outputs = data?.template?.outputs;
    if (data?.version !== "2.0" || !Array.isArray(outputs) || !outputs.length) {
      return kakaoText(kakaoSkillSafeFallbackText(origin));
    }
    return jsonResponse(data, 200);
  } catch (err) {
    return kakaoText(kakaoSkillSafeFallbackText(origin));
  }
}
// @build:exports-start
export {
  armKakaoRepeatGuard, buildKakaoSkillTestPayload, checkKakaoRepeatGuard, clearKakaoInFlight,
  isKakaoQaPayload, isStrongKakaoTransactionInput, kakaoQaRequestAllowed, kakaoRepeatGuardText,
  looksLikeKakaoEditCommandV4, normalizeKakaoSkillResponse, optionalWithin, stripKakaoBotMention,
  stripLeadingCommand,
};
// @build:exports-end
