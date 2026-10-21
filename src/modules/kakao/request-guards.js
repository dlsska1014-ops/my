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
import { parseKakaoSeparatePurchaseCommand } from "./separate-purchase.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { getKakaoUserKey, stableShortHash } from "./identity-chat-first.js";
import {
  isBudgetCommand, isEditGuideSimpleCommand, isGroupLinkInfoCommand, isHelpCommand,
  isInputExampleCommand, isInviteCommand, isLinkCommand, isRecentCommand, isSettlementCommand,
  isSummaryCommand, isUndoCommand, parseGroupBindCommand,
} from "./simple-commands.js";
import { extractLeadingDateHint, parseMultipleTransactions } from "../nlu/transaction-parser.js";
import { detectType, extractAmount, normalizeText } from "../nlu/amount-parser.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
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
  const original = normalizeText(stripKakaoBotMention(text)).replace(/^\/+\s*/, "");
  return /^(?:수정|삭제|복구)\s*\d+/.test(control)
    || /^\d+\s*번\s*(?:금액|분류|결제수단|내용|날짜|지출자|수입자|수입|지출|수정|삭제|제거|복구)(?=\s|$)/.test(control)
    // V22.9.63 감사(1:1 1): "수정 01번 금액을 13000원으로", "01번 가격 13200", "수정 01번 13300원으로"처럼 조사·동의어·값만 있는
    // 수정 말이 새 지출로 저장됐다(stripLeadingCommand 가 앞의 ‘수정’을 떼고 나면 위 두 규칙이 못 알아봤다). 앞에 ‘수정 NN번’이
    // 있었거나 번호 뒤에 수정 낱말(동의어·조사 포함)이 오면 수정 명령이다. "2번 출구 택시 8000원"처럼 수정 낱말이 없는 번호는 기록이다.
    || /^수정\s*\d{1,3}\s*번(?=\s|$)/.test(original)
    // "01번 13300원으로"는 번호 뒤에 바로 값이 온 수정이다(기록이라면 내용이 있어야 한다).
    // "01번 02번 금액 5000"처럼 번호가 둘 이상 이어지고 수정 낱말이 오면 수정 시도다(한 건씩만 받는다).
    || /^\d+\s*번(?:\s*[,·]?\s*\d+\s*번)+\s*(?:금액|가격|얼마|액수|돈|값|분류|카테고리|항목|결제수단|결재수단|수단|지불수단|지불방법|결제방법|내용|이름|품목|제목|메모|날짜|일자|날자|지출자|결제자|결재자|지불자|수입자|삭제|제거|복구|수정)(?=\s|$)/.test(control)
    || /^\d+\s*번\s*\d[\d,.]*\s*(?:원|만원|천원)?\s*(?:으로|로)(?=\s|$)/.test(control)
    || /^\d+\s*번\s*(?:금액|가격|얼마|액수|돈|값|분류|카테고리|항목|결제수단|결재수단|수단|지불수단|지불방법|결제방법|내용|이름|품목|제목|메모|날짜|일자|날자|지출자|결제자|결재자|지불자|수입자)(?:을|를|은|는|이|가|도|만|으로|로)?(?=\s|$)/.test(control)
    // "방금 금액 7000"은 방금 기록의 수정이다(parseKakaoEditCommandV4 의 latest 문법). 새 지출 "방금 금액"이 아니다.
    || /^(?:방금|최근|마지막)\s*(?:거|것|기록|입력)?\s*(?:금액|가격|분류|카테고리|결제수단|내용|메모|날짜|일자|지출자|결제자|수입자)(?=\s|$)/.test(normalizeText(stripLeadingCommand(text)));
}

function isStrongKakaoTransactionInput(text = "", parsedList = []) {
  const raw = normalizeText(stripLeadingCommand(text));
  if (!raw || !Array.isArray(parsedList) || !parsedList.length) return false;
  if (looksLikeKakaoEditCommandV4(text) || looksLikeKakaoEditCommandV4(raw)) return false;
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

// V22.9.63 감사(1:1 2): 가계부가 없는 사람의 첫 기록 자동 준비는 "밥 4500원", "물 1000원"처럼 한 글자 내용도 받는다. 강한 입력
// 판정(내용 두 글자 이상)은 그대로 두고, 단위(원)가 분명한 한 건짜리 기록만 더 받는다. 첫 기록 자동 준비 자리에서만 쓴다.
function isKakaoFirstRecordInput(text = "", parsedList = []) {
  if (isStrongKakaoTransactionInput(text, parsedList)) return true;
  const raw = normalizeText(stripLeadingCommand(text));
  if (!raw || !Array.isArray(parsedList) || parsedList.length !== 1) return false;
  if (looksLikeKakaoEditCommandV4(text) || looksLikeKakaoEditCommandV4(raw)) return false;
  if (/(?:^|\s)예산(?=\s|$)|^초대코드|^단톡방\s*연결|^가계부\s*(?:참여|만들기|생성)/.test(raw)) return false;
  const amountInfo = extractAmount(raw);
  if (!amountInfo?.amount || !/원\s*$/.test(String(amountInfo.raw || ""))) return false;
  const remainder = raw
    .replace(amountInfo.raw || "", " ")
    .replace(/(국민|신한|현대|삼성|롯데|우리|하나|농협|카카오|토스)?\s*(카드|체크카드|신용카드)|현금|계좌이체|이체|페이/gi, " ")
    .replace(/오늘|어제|그제|그저께|내일/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^[가-힣A-Za-z]+$/.test(remainder);
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
  if (parseKakaoSeparatePurchaseCommand(text)) return {ok:true,skipped:true};
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

// V22.9.75 카카오 감사 11: 예시를 보낸 문장으로 만든다. 수입 문장이면 ‘별도 기록 추가’로 안내한다.
function kakaoRepeatGuardText(origin = "", utterance = "") {
  const text = normalizeText(stripLeadingCommand(utterance)).slice(0, 60);
  const example = text && extractAmount(text)?.amount ? text : "";
  const income = example && detectType(example) === "income";
  return [
    "방금 같은 내용을 처리했어요 😊",
    "중복 저장을 막기 위해 같은 요청은 잠시 멈췄습니다.",
    "‘오늘기록’로 저장 결과를 확인해 주세요.",
    income ? `따로 들어온 돈이라면 ‘별도 기록 추가 ${example}’라고 보내 후보를 확인해 주세요.`
      : `서로 다른 구매라면 ‘별도 구매 추가 ${example || "커피 4500원"}’처럼 원래 내용을 보내 후보를 확인해 주세요.`,
  ].join("\n");
}

// V22.9.44: 처리가 응답 예산(기본 4초)을 넘길 때 카카오에 먼저 보내는 답. 처리는 뒤에서 끝까지 진행된다.
// V22.9.72: 문구를 두 줄로 줄이고 짧은 명령(오늘기록)으로 맞춘다(2026-10-20 디자이너 피드백).
function kakaoSkillDeferredText() {
  return [
    "확인이 조금 늦어지고 있어요 😊",
    "같은 내용을 다시 보내지 말고 잠시 뒤 ‘오늘기록’에서 확인해 주세요.",
  ].join("\n");
}

function kakaoRecordCheckCommands(utterance = "", payload = {}) {
  const separate = parseKakaoSeparatePurchaseCommand(stripLeadingCommand(utterance));
  if (separate?.token) return [`별도 구매 조회 ${separate.token}`];
  const today = formatDate(nowKstDate());
  const dates = [...new Set(parseMultipleTransactions(stripLeadingCommand(utterance), payload).map(row => row.transaction_date))].slice(0, 2);
  // V22.9.72: 버튼 이름이 곧 명령이므로 짧은 형태(오늘기록 · 2026-10-19 기록)로 맞춘다. 두 형태 모두 날짜 목록 명령으로 읽힌다.
  return (dates.length ? dates : [today]).map(date => date === today ? "오늘기록" : `${date} 기록`);
}

function kakaoRecordCheckReply(text, utterance = "", payload = {}) {
  const commands = kakaoRecordCheckCommands(utterance, payload);
  // V22.9.72: 단톡방도 버튼(textCard)으로 바뀌므로 확인 명령을 같이 보낸다. 긴 면책 문장은 한 줄로 줄인다.
  const body = `${text}\n${commands.map(command => `‘${command}’`).join(" 또는 ")}에서 확인해 주세요. 목록에 없어도 아직 저장 중일 수 있어요.`;
  return kakaoText(body, commands.map(command => [command, command]));
}

// V22.9.72: 응답 예산을 넘긴 요청의 답(2026-10-20 디자이너 피드백 — 짧게, 다음 행동으로). 기록이면 중복 저장을 막는
// 확인 안내와 확인 버튼, 조회·명령이면 같은 명령을 잠시 뒤 다시 보내라는 안내와 그 명령 버튼을 준다. 조회 결과는 뒤에서
// 계산돼도 사용자에게 다시 보낼 길이 없으므로, 버튼 한 번으로 같은 질문을 되풀이할 수 있게 한다.
function kakaoDeferredReply(utterance = "", payload = {}) {
  const text = stripLeadingCommand(utterance);
  const separate = parseKakaoSeparatePurchaseCommand(text);
  const recordRows = separate ? [] : parseMultipleTransactions(text, payload);
  if (separate?.token || recordRows.length) {
    const commands = kakaoRecordCheckCommands(utterance, payload);
    return kakaoText(`기록 저장 확인이 조금 늦어지고 있어요 😊\n같은 내용을 다시 보내지 말고 잠시 뒤 ${commands.map(command => `‘${command}’`).join(" 또는 ")}에서 확인해 주세요.`, commands.map(command => [command, command]));
  }
  const command = String(text || "").replace(/\s+/g, " ").trim();
  // 단톡방 버튼은 이름(14자 이하)을 그대로 보내므로 긴 말은 잘라서 버튼에 넣지 않고 다시 보내 달라고만 한다.
  if (!command || command.length > 14) return kakaoText("확인이 조금 늦어지고 있어요 😊\n잠시 뒤 같은 내용을 다시 보내 주세요.", [["도움말 보기", "도움말 보기"]]);
  return kakaoText(`확인이 조금 늦어지고 있어요 😊\n잠시 뒤 ‘${command}’ 버튼을 눌러 다시 물어봐 주세요.`, [[command, command]]);
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
  isKakaoFirstRecordInput, isKakaoQaPayload, isStrongKakaoTransactionInput, kakaoDeferredReply,
  kakaoQaRequestAllowed, kakaoRecordCheckReply, kakaoRepeatGuardText, looksLikeKakaoEditCommandV4,
  normalizeKakaoSkillResponse, optionalWithin, stripKakaoBotMention, stripLeadingCommand,
};
// @build:exports-end
