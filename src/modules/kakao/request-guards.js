// @build:imports-start
import {
  AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD, boundedRuntimeNumber, pruneTimestampMap,
} from "../runtime/ops-telemetry.js";
import { incompleteFeatureQaEnabled } from "../public/site-config.js";
import { foldInputWidth } from "../client/shared-input-nlu.js";
import { jsonResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { kakaoSkillSafeFallbackText } from "./reply-texts.js";
import { isCommandMenuCommand, isHouseholdSwitchCommand } from "./intent-nlu.js";
import { kakaoText } from "./response-builders.js";
import {
  KAKAO_DELETE_WORD_V4, KAKAO_EDIT_AMOUNT_V4, KAKAO_EDIT_VERB_V4,
} from "./edit-vocabulary.js";
import {
  KAKAO_AMOUNT_CHANGE_TAIL_V4, KAKAO_LATEST_AMOUNT_EDIT_V4, KAKAO_SEQ_AMOUNT_EDIT_V4,
  hasKakaoEditSessionHint, isKakaoTransactionSpenderChangeCommand, parseKakaoDeleteCommandV4,
  parseKakaoEditCommandV4, parseKakaoRestoreCommandV4, stripKakaoEditDatePrefixV4,
} from "./edit-session-v4.js";
import { isKakaoAmountAnswer } from "./edit-state-machine.js";
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
import {
  cardSmsDatesV229122, extractLeadingDateHint, parseMultipleTransactions,
} from "../nlu/transaction-parser.js";
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
  // V22.9.81 X-29: 대표 명령어 ‘기록하기’를 누르고 이어 쓴 "기록하기 점심 12000원"·"기록하기: 커피 4500원"·"입력하기 …"도 뗀다.
  // 명령어만 보낸 "기록하기"는 그대로 두어 기록 방법 안내로 간다.
  // "수정 01번 금액 13000원" → "01번 금액 13000원"
  const m = t.match(/^\/?(기록하기|입력하기|기록|입력)(?:\s*[:：]\s*|\s+)(.+)$/i);
  if (m) return m[2].trim();
  // V22.9.93 Q-79: ‘수정’ 을 떼면 ‘1번 커피 5000원’ 이 ‘1번 국도 8000원’ 같은 기록과 같아져 메모 ‘1번 커피’ 로 저장됐다. ‘수정 01번 …’ 처럼 두 자리로 맞춰 고치는 말로 남긴다.
  const e = t.match(/^\/?수정\s+(\d{1,3}\s*번.+)$/i);
  if (e) return e[1].trim().replace(/^(\d)(?=\s*번(?:[\s,]|$))/, "0$1");
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
    // V22.9.93 Q-49: 예전 꼴 ‘\s*[,·]?\s*’ 은 공백 하나를 앞뒤 어느 쪽이 가져갈지 갈려 ‘1번 ’ 30번이면 몇 초를 넘겼다(모든 카카오 말이 지난다).
    || /^\d+\s*번(?:\s*(?:[,·]\s*)?\d+\s*번)+\s*(?:금액|가격|얼마|액수|돈|값|분류|카테고리|항목|결제수단|결재수단|수단|지불수단|지불방법|결제방법|내용|이름|품목|제목|메모|날짜|일자|날자|지출자|결제자|결재자|지불자|수입자|삭제|제거|복구|수정)(?=\s|$)/.test(control)
    || KAKAO_SEQ_AMOUNT_EDIT_V4.test(control)
    || /^\d+\s*번\s*(?:금액|가격|얼마|액수|돈|값|분류|카테고리|항목|결제수단|결재수단|수단|지불수단|지불방법|결제방법|내용|이름|품목|제목|메모|날짜|일자|날자|지출자|결제자|결재자|지불자|수입자)(?:을|를|은|는|이|가|도|만|으로|로)?(?=\s|$)/.test(control)
    // "방금 금액 7000"은 방금 기록의 수정이다(parseKakaoEditCommandV4 의 latest 문법). 새 지출 "방금 금액"이 아니다.
    || /^(?:(?:방금|최근|마지막)\s*(?:거|것|건|꺼|기록|입력)?|아까\s*(?:거|것|건|꺼|기록|입력))\s*(?:금액|가격|분류|카테고리|결제수단|내용|메모|날짜|일자|지출자|결제자|수입자)(?:을|를|은|는|이|가)?(?=\s|$)/.test(normalizeText(stripLeadingCommand(text)))
    || KAKAO_LATEST_AMOUNT_EDIT_V4.test(normalizeText(stripLeadingCommand(text)));
}

// V22.9.93 Q-24: 번호 없이 기록을 고치거나 지우려는 말. 어느 기록인지 몰라 고치지는 않지만, 저장하면 메모에 ‘바꿔줘’·‘삭제’ 가 남은 기록이 하나 더 생긴다.
// 금액 뒤에 고치는 말이 오지 않으면(‘바지 수정 5000원’·‘5000원으로 점심’) 기록이다.
// V22.9.93 Q-30: 저장 바로 앞에서만 보면 신뢰된 방(tryKakaoGroupFirstRecord)과 1:1 첫 기록, 열린 세션의 새 기록 넘김이 이 판정 전에 저장해 버린다. 강한 입력 판정이 함께 쓴다.
// 칸 이름으로 시작하는 말은 두 낱말까지만 본다(‘날짜 변경 수수료 30000원’ 은 기록이다).
// V22.9.93 Q-68: ‘메모 패드 3000원’·‘내용 증명 5000원’·‘분류 작업비 30000원’·‘날짜 변경 30000원’ 은 이름이라 기록이다. ‘제거’ 는 금액 바로 뒤에서만 고치는 말이다(‘3만원 곰팡이 제거’ 는 기록이다).
const KAKAO_DELETE_TAIL_V4 = new RegExp(String.raw`(?:\S\s+(?!제거)|(?:원|\d|[만천])\s+)${KAKAO_DELETE_WORD_V4}$`);
// V22.9.93 Q-84: 시키는 말이 앞에 오거나(‘바꿔줘 5000원’·‘정정 5000원’) 대상만 가리킨 꼴(‘그거 5000원으로’·‘1번은 5000원’·‘방금 거 5000원 맞아’)도 고치는 말이다. ‘아까 거 환불 5000원’ 은 기록이다.
const KAKAO_CHANGE_FIRST_V4 = new RegExp(String.raw`^(?:${KAKAO_EDIT_VERB_V4}\s+${KAKAO_EDIT_AMOUNT_V4}(?:\s*(?:으로|로))?|(?:그거|이거|저거|그것|이것|저것)(?:을|를)?\s+${KAKAO_EDIT_AMOUNT_V4}\s*(?:으로|로)|\d{1,2}\s*번(?:은|는)\s+${KAKAO_EDIT_AMOUNT_V4}|(?:방금|아까)\s*(?:거|것|건|꺼)\s+${KAKAO_EDIT_AMOUNT_V4}\s+맞(?:아요?|음|습니다|다))$`);
// V22.9.93 Q-80: ‘4500원 말고 5000원’·‘커피 8000 아니 9000’ 이 두 건이 됐다. 앞도 뒤도 금액이고 말이 거기서 끝날 때만 고치는 말이다(‘커피 4500 말고 라떼 5000’·‘병원 말고 3만원’·‘학원 아니고 30만원’·‘팁 5000원 말고 1000원 더 줌’ 은 기록이다).
const KAKAO_AMOUNT_WORD_V4 = String.raw`(?:${KAKAO_EDIT_AMOUNT_V4}|[일이삼사오육칠팔구십백천만억]+[십백천만억])`;
const KAKAO_AMOUNT_INSTEAD_V4 = new RegExp(String.raw`(?:^|\s)${KAKAO_AMOUNT_WORD_V4}\s*(?:(?:이|가)?\s*(?:아니(?:고요?|라|구|야|요|에요|예요|지|잖아)?|아닌데|아닙니다)|말고|말구)[,\s]+${KAKAO_AMOUNT_WORD_V4}\s*(?:으로|로|이야|야|이요|요|임|입니다|이에요|예요|맞아요?|맞음)?$`);

// V22.9.93 Q-105: ‘5000원으로 다시 적어줘’·‘금액 잘못 넣었어 5000원’·‘방금 거 만 5000으로’ 가 새 기록이 됐다(운영에도 있었다).
function looksLikeKakaoChangeRequest(text = "") {
  const t = normalizeText(text);
  return KAKAO_AMOUNT_CHANGE_TAIL_V4.test(t)
    || isKakaoAmountAnswer(t)
    || (KAKAO_DELETE_TAIL_V4.test(t) && !/(?:예산|가계부|단톡방|연결|구성원|초대|카테고리|분류|정기|알림)/.test(t))
    || /^(?:수정|삭제)\s+(?!테이프|액|펜|볼펜|화장)\S/.test(t)
    || /^(?:금액|가격)\s*(?:수정|변경)(?:\s+\d[\d,.]*\s*원?)?$/.test(t)
    || /^(?:금액|가격)\s*(?:이|가|을|를)?\s*(?:틀렸|틀려|잘못\s*(?:됐|됨|되었|입력|적|썼|넣|기록|저장))/.test(t)
    || /^(?:틀렸|틀려|잘못\s*(?:됐|됨|되었|입력|적|썼|기록|저장))\S*\s+.*\d/.test(t)
    || KAKAO_CHANGE_FIRST_V4.test(t)
    || /^(?:금액|가격|내용|분류|결제수단|날짜|메모)(?:을|를|은|는|이|가)?\s+(?!패드|보드|증명|작업|변경)\S+(?:\s+\S+)?$/.test(t)
    || /^\d{1,3}\s*번\s.*(?:원|\d|[만천])\s*(?:으로|로)$/.test(t)
    || /^0\d\s*번[,\s]/.test(t)
    || /^\d{1,3}\s*번\s*(?:거|것|꺼|건|기록|입력)(?:을|를)?\s/.test(t)
    || (/말[고구]|아니|아닌|아닙/.test(t) && KAKAO_AMOUNT_INSTEAD_V4.test(t))
    || /^(?:방금|아까)\s*(?:거|것|건|꺼)\s+\S+\s+\d[\d,]*\s*원?\s*(?:으로|로)$/.test(t)
    || /^아까\s*(?:거|것|건|꺼|기록|입력)?\s*(?:금액|가격)(?:을|를|은|는|이|가)?(?=\s|$)/.test(t);
}

function isStrongKakaoTransactionInput(text = "", parsedList = []) {
  const raw = normalizeText(stripLeadingCommand(text));
  if (!raw || !Array.isArray(parsedList) || !parsedList.length) return false;
  if (looksLikeKakaoEditCommandV4(text) || looksLikeKakaoEditCommandV4(raw) || looksLikeKakaoChangeRequest(text) || looksLikeKakaoChangeRequest(raw)) return false;
  if (/(?:^|\s)예산(?=\s|$)|^초대코드|^단톡방\s*연결|^가계부\s*(?:참여|만들기|생성)/.test(raw)) return false;
  // V22.9.93 Q-72: 거래 해석기와 같은 입구로 읽는다. 원문을 읽어 처음 쓰는 사람의 ‘월세 1.200.000원’ 이 저장되지 않고 시작 안내만 받았다.
  const folded = foldInputWidth(raw);
  const amountInfo = extractAmount(folded);
  if (!amountInfo?.amount) return false;
  const remainder = folded
    .replace(amountInfo.raw || "", " ")
    .replace(/(국민|신한|현대|삼성|롯데|우리|하나|농협|카카오|토스)?\s*(카드|체크카드|신용카드)|현금|계좌이체|이체|페이/gi, " ")
    .replace(/오늘|어제|그제|그저께|내일/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 금액만 보낸 단계형 답변(예: 100만원)은 빠른 거래 경로로 보내지 않습니다. V22.9.93 Q-81: ‘5000정도’·‘5000쯤’ 의 끝맺음도 내용이 아니다(수정 중인 답이 새 기록이 됐다).
  return /[가-힣A-Za-z]{2,}/.test(remainder.replace(/^(?:에|이요|요|이에요|예요|입니다|임|(?:정도|쯤|가량)(?:이?요|입니다|이에요|예요)?)$/, ""));
}

// V22.9.63 감사(1:1 2): 가계부가 없는 사람의 첫 기록 자동 준비는 "밥 4500원", "물 1000원"처럼 한 글자 내용도 받는다. 강한 입력
// 판정(내용 두 글자 이상)은 그대로 두고, 단위(원)가 분명한 한 건짜리 기록만 더 받는다. 첫 기록 자동 준비 자리에서만 쓴다.
function isKakaoFirstRecordInput(text = "", parsedList = []) {
  if (isStrongKakaoTransactionInput(text, parsedList)) return true;
  const raw = normalizeText(stripLeadingCommand(text));
  if (!raw || !Array.isArray(parsedList) || parsedList.length !== 1) return false;
  if (looksLikeKakaoEditCommandV4(text) || looksLikeKakaoEditCommandV4(raw) || looksLikeKakaoChangeRequest(text) || looksLikeKakaoChangeRequest(raw)) return false;
  if (/(?:^|\s)예산(?=\s|$)|^초대코드|^단톡방\s*연결|^가계부\s*(?:참여|만들기|생성)/.test(raw)) return false;
  const folded = foldInputWidth(raw);
  const amountInfo = extractAmount(folded);
  if (!amountInfo?.amount || !/원\s*$/.test(String(amountInfo.raw || ""))) return false;
  const remainder = folded
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

// V22.9.76 카카오 감사 11: 예시를 보낸 문장으로 만든다. 수입 문장이면 ‘별도 기록 추가’로 안내한다.
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
// V22.9.120 후속 3(재검토 P2): 본 처리에서 저장 직전 안전망보다 앞선 관문이 받는 말이면 늦은 답에서도 안전망 안내를 하지 않고 예전 늦은 답(확인 안내)으로 둔다.
// 그런 말은 뒤 처리가 예산을 바꾸거나 기록을 고치는 등 다른 일을 하므로 ‘저장하지 않았어요’ 안내와 어긋난다.
//   ‘예산’ 이 든 말(예산 직접 설정·조회·예산 안내), 번호·방금 고치기·지우기·되살리기·지출자 바꾸기·되돌리기 명령, 기간 요약,
//   단계 흐름 명령·답(시작·만들기·참여·예산 설정·취소·금액만 보낸 답), 열린 수정 세션의 값 답(강한 새 기록은 세션을 끝내고 안전망까지 가므로 뺀다).
// 그 밖의 말은 본 처리도 같은 안전망 안내로 끝난다(번호 없는 고치는 말은 본 처리의 마지막 ‘고치는 말’ 안내와 같은 글이다).
// 단계 흐름의 상태는 DB 에만 있어 늦은 답이 볼 수 없다(흐름 답으로 받을 말을 안전망 안내로 답할 수 있는 드문 경우가 남는다).
function kakaoDeferredGuardSkipV229120(text, payload, rows) {
  const t = normalizeText(text);
  if (/예산/.test(t)) return true;
  if (looksLikeKakaoEditCommandV4(text) || !!parseKakaoEditCommandV4(t) || !!parseKakaoDeleteCommandV4(t) || !!parseKakaoRestoreCommandV4(t) ||
      isKakaoTransactionSpenderChangeCommand(t) || isUndoCommand(t) || !!parseKakaoSummaryRange(t)) return true;
  if (isKakaoGuidedCommand(t) || isKakaoReservedCreateFlowReply(t) || isKakaoFlowCancelCommand(t)) return true;
  return hasKakaoEditSessionHint(getKakaoUserKey(payload), payload) && !isStrongKakaoTransactionInput(text, rows);
}

function kakaoDeferredReply(utterance = "", payload = {}) {
  const text = stripLeadingCommand(utterance);
  const separate = parseKakaoSeparatePurchaseCommand(text);
  const recordRows = separate ? [] : parseMultipleTransactions(text, payload);
  // V22.9.120 후속(독립 검토 P2): 저장 직전 안전망에 걸릴 말이면 ‘저장 확인이 늦어지고 있어요(다시 보내지 말고 확인)’ 대신 그 되묻는 안내를 바로 답한다.
  // 안전망은 DB 를 읽지 않는 판정이라 늦은 답에서도 저장 지점과 같은 결과다. 앞선 관문이 받는 말은 보지 않는다(kakaoDeferredGuardSkipV229120).
  const guard = !separate && recordRows.length && !kakaoDeferredGuardSkipV229120(text, payload, recordRows) ? kakaoRecordGuardV229120(text, recordRows) : null;
  if (guard) return kakaoRecordGuardReplyV229120(guard);
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

// ── V22.9.120 기록 저장 직전 안전망(말뭉치 2026-11-10 FINDINGS ①②③ + 제품 결정 1) ─────────────────────────────
// 해석기(nlu/**)는 그대로 두고, 해석 결과(parsedList)와 보낸 말을 함께 보아 ‘확실하지 않으면 저장하지 않고 되묻는다’.
// 넓게 읽는 규칙은 더하지 않는다: 아래 꼴에 맞으면 저장하지 않고 이유와 바로 되는 예문을 답할 뿐이고, 맞지 않으면 예전과 똑같이 저장한다.
// 상태(세션·대기 표식)를 남기지 않고 DB 를 읽지 않는다. 직접(1:1)·방 두 경로의 저장 직전(skill-handler.js 세 곳)에서 같은 판정을 쓴다.
//   edit     고치는 말(‘13000 아니고 15000이야 고쳐줘’·‘지워줘 잘못넣음’)이 새 기록으로 저장됨
//   question 묻는 말(‘얼마 썼지?’·‘… 알려줘’)이 기록됨
//   date     날짜 말(‘지난주 금욜’·‘25일에’·‘3일 전에’)을 읽지 못해 오늘(또는 틀린 날)로 저장됨 — 메모에 그 말이 남은 오늘 기록만 본다
//   future   달 없이 쓴 ‘N일’ 이 아직 오지 않은 날로 풀림(지난 날로 풀린 것은 그대로 저장)
//   plan     계획·목표(‘… 할 예정’·‘… 모으기’)나 전해 들은 말(‘… 준대’)이 오늘·지난 날 기록으로 저장됨(‘내일 …’ 처럼 앞날로 읽힌 기록은 그대로)
// V22.9.120 후속(과잉 차단 좁히기): 계획·물음·부탁·전해 들은 말 낱말이 꾸미는 말·이유 말로 든 평범한 기록(‘선물하려고 산 꽃 3만원’·‘길 알려줘서 커피 사줌 4500’·
// ‘며칠 고민하다 산 패딩 25만원’·‘5800원 냈어 이게 맞냐?’)은 저장한다. 낱말이 어디 있든 막던 것을 ‘문장 끝 서술어’·‘끝난 기록 서술어 유무’ 로 좁혔다.
const KAKAO_GUARD_ZERO_WIDTH_V229120 = new RegExp(`[${[0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF].map((code) => String.fromCharCode(code)).join("")}]`, "g"); // 폭 0 글자(소스에 보이지 않는 글자를 두지 않는다)
function kakaoGuardNormV229120(text) {
  return String(text || "").replace(KAKAO_GUARD_ZERO_WIDTH_V229120, "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, " ").trim();
}
// 끝 다듬기: 끝의 공백·문장부호·ㅋㅎㅠㅜ 줄이나 이모지 줄을 떼기를 여섯 번까지 되풀이한다. V22.9.120 후속 2(판정 시간): 정규식 ‘[…]+$’ 로 떼면 끝에 닿지 않는
// 긴 줄(‘ㅋㅋ…ㅋ 커피 4500원’)에서 자리마다 줄 끝까지 다시 훑어 길이의 제곱이 되므로, 뒤에서부터 한 번만 훑는다(떼는 범위는 예전 정규식과 같다).
const KAKAO_GUARD_TRAIL_CHAR_V229120 = /^[\s~!！.。…ㅠㅜㅋㅎㅡ;^)"']$/u;
const KAKAO_GUARD_TRAIL_EMOJI_V229120 = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]$/u;
function kakaoGuardTrimTailV229120(text) {
  let t = String(text || "");
  for (let round = 0; round < 6; round += 1) {
    let end = t.length;
    let kind = 0;
    while (end > 0) {
      const low = t.charCodeAt(end - 1);
      const size = low >= 0xDC00 && low <= 0xDFFF && end > 1 && (t.charCodeAt(end - 2) & 0xFC00) === 0xD800 ? 2 : 1; // 짝 맞은 서로게이트는 한 글자
      const ch = t.slice(end - size, end);
      const k = KAKAO_GUARD_TRAIL_CHAR_V229120.test(ch) ? 1 : KAKAO_GUARD_TRAIL_EMOJI_V229120.test(ch) ? 2 : 0;
      if (!k || (kind && k !== kind)) break;
      kind = k;
      end -= size;
    }
    if (!kind) break;
    t = t.slice(0, end);
  }
  return t;
}
// 끝 물음표 떼기(‘.replace(/[?？]+$/, "")’ 를 뒤에서부터 — 같은 까닭).
function kakaoGuardDropQuestionMarksV229120(text) {
  const t = String(text || "");
  let end = t.length;
  while (end > 0 && (t[end - 1] === "?" || t[end - 1] === "？")) end -= 1;
  return t.slice(0, end);
}

// edit: 고치기·지우기를 시키는 말(‘…줘’ 꼴; ‘고쳐줘서’ 같은 이유 말과 ‘바꿔달라 했더니’ 처럼 남에게 한 말을 옮긴 것은 뺀다) / 입력을 잘못했다는 말
// (‘잘못 입력해서 재발급 수수료’ 처럼 이유로 든 것은 뺀다) / 맨 앞 ‘(아) 아니다’ / ‘금액 아니고 금액’(문장이 그 금액에서 끝날 때만, V22.9.120 후속).
// 끝이 ‘수정’·‘삭제’ 인 말만으로는 보지 않는다(‘5000원 회원 수정’ 은 기록, V22.9.93 Q-68 — 고치는 말은 기존 looksLikeKakaoChangeRequest 가 금액 바로 뒤에서 본다).
// V22.9.120 후속 3(재검토 반영): 남을 꾸미거나 이유로 든 꼴은 뺀다 — ‘고쳐주시고·바꿔주시는·고쳐주시며·바꿔주시니’(주시 + 이음·꾸밈 끝),
// ‘바꿔달라는·고쳐주라던’(는·던 = 꾸미는 말·전해 들은 말), ‘바꿔 조금 큰 걸로’(‘조’ 가 다음 낱말의 첫 글자). ‘…줄 수 있어?’·‘…주실 수 있나요’ 처럼 부탁하는 말은
// 조각 끝에서만 본다(KAKAO_EDIT_REQUEST_CAN_V229120 — ‘고쳐줄 수 있는 곳 찾아서 수리비 5만원’ 은 꾸미는 말이라 기록). ‘주실래요’ 는 그대로 부탁이다.
const KAKAO_EDIT_REQUEST_V229120 = /(?:고쳐|수정\s*해|바꿔|변경\s*해|정정\s*해|지워|삭제\s*해|취소\s*해)\s*(?:줘|주세요|줄래|주라|줘요|주실(?=래)|달라|놔|놓아|주시(?![고며니])|줭|죠|조(?![가-힣]))(?![서도는던]|\s*(?:고\s*)?(?:했|하니|하자|하길래|하던|하더|해서|하셔서|하시길래))/;
const KAKAO_EDIT_REQUEST_CAN_V229120 = /(?:고쳐|수정\s*해|바꿔|변경\s*해|정정\s*해|지워|삭제\s*해|취소\s*해)\s*(?:줄|주실)\s*수\s*(?:있|없)[가-힣]*$/;
const KAKAO_EDIT_WRONG_V229120 = /잘못\s*(?:씀|썼|썻|적었|적음|적은|입력(?!\s*(?:해서|하여|하고|돼서|되어|된\s))|넣었|넣음|쳤|침|기록|저장|올렸)/;
const KAKAO_EDIT_NO_LEAD_V229120 = /^(?:아|앗|어|헐|아차|아이고)?\s*아니다(?=[\s,.!~]|$)/;
const KAKAO_GUARD_AMOUNT_V229120 = String.raw`(?:\d[\d,]*(?:\.\d+)?\s*(?:원|[만천])?|[일이삼사오육칠팔구십백천만억]+[십백천만억]\s*원?)`;
// ‘금액 아니고 금액’ 뒤가 문장 끝(‘…3500이야’·‘…25800이었나 ㅠ’·‘…7500원’)이면 고치는 말이고, 서술어가 이어지면(‘…5500원 나왔어 택시’) 기록이다.
// 다만 해석기가 그 말을 두 건 이상으로 읽었으면(‘택시 7000원 아니고 7500원 나옴’ → 7000원·7500원 두 건) 어느 쪽이든 틀린 저장이라 막는다.
const KAKAO_EDIT_AMOUNT_NOT_ANY_V229120 = new RegExp(String.raw`(?:^|\s)${KAKAO_GUARD_AMOUNT_V229120}\s*(?:이|가)?\s*아니(?:고|라|구|야|요|에요|예요)?[,\s]+${KAKAO_GUARD_AMOUNT_V229120}`);
const KAKAO_EDIT_AMOUNT_NOT_WORD_V229120 = new RegExp(String.raw`${KAKAO_EDIT_AMOUNT_NOT_ANY_V229120.source}\s*(?:이야|야|이에요|예요|에요|이요|요|임|이었어|였어|이었음|였음|이었다|였다|이었나|였나|이었네|였네|이었지|였지|이다|다)(?![가-힣])`);
// 문장이 뒤 금액에서 끝나는 꼴(‘…7500원’·‘…3500 ㅠ?’): V22.9.120 후속 2(판정 시간) — 예전 끝 꼴 ‘[ㅠㅜㅋㅎ~!.?？;…,\s]*$’ 는 뒤 금액의 ‘[\d,]*’ 와 쉼표가 겹쳐
// ‘1,,,,…ㅋ x’ 에서 길이의 제곱이 됐다. 그 끝 글자 줄을 먼저 떼고 ‘…금액$’ 으로 본다(뗀 줄에 걸치는 것은 금액 안의 쉼표·빈칸뿐이라 결과는 같다).
const KAKAO_EDIT_AMOUNT_NOT_END_V229120 = new RegExp(String.raw`${KAKAO_EDIT_AMOUNT_NOT_ANY_V229120.source}$`);
const KAKAO_EDIT_AMOUNT_NOT_TAIL_CHAR_V229120 = /[ㅠㅜㅋㅎ~!.?？;…,\s]/;
function kakaoGuardAmountNotV229120(text) {
  let end = text.length;
  while (end > 0 && KAKAO_EDIT_AMOUNT_NOT_TAIL_CHAR_V229120.test(text[end - 1])) end -= 1;
  return KAKAO_EDIT_AMOUNT_NOT_WORD_V229120.test(text) || KAKAO_EDIT_AMOUNT_NOT_END_V229120.test(text.slice(0, end));
}
function kakaoGuardEditLikeV229120(text, rows = []) {
  const t = kakaoGuardNormV229120(text);
  // 조각 끝의 ‘…줄 수 있어’ 는 끝 40자 안에 다 든다(긴 한 낱말에서 자리마다 끝까지 훑지 않도록 끝만 본다 — 판정 시간).
  const askCan = () => String(text || "").replace(/\r/g, "").split(KAKAO_GUARD_PIECE_SPLIT_V229120).some((part) =>
    KAKAO_EDIT_REQUEST_CAN_V229120.test(kakaoGuardNormV229120(kakaoGuardTrimTailV229120(kakaoGuardDropQuestionMarksV229120(kakaoGuardTrimTailV229120(part.trim())))).slice(-40)));
  return KAKAO_EDIT_REQUEST_V229120.test(t) || askCan() || KAKAO_EDIT_WRONG_V229120.test(t) || KAKAO_EDIT_NO_LEAD_V229120.test(t) ||
    kakaoGuardAmountNotV229120(kakaoGuardTrimTailV229120(t)) ||
    (rows.length > 1 && KAKAO_EDIT_AMOUNT_NOT_ANY_V229120.test(t)); // 두 건 이상으로 읽힌 ‘금액 아니고 금액’ — 조정자 결정으로 유지(V22.9.120 후속 2)
}

// date: 오늘로 저장될 기록의 메모에 남은 날짜 말. ‘오늘’ 이 든 말은 오늘이 맞을 수 있어 보지 않는다. 숫자 분수(1/2)·‘이번주’ 만·‘주말’ 은 보지 않는다.
// ‘다음주’ 는 요일·주말·‘에’·‘말’ 이 붙을 때만 날짜로 본다 — ‘다음주 시험 대비 문제집’·‘다음주 캠핑 때 쓸 버너 … 샀어’ 는 뒤 낱말을 꾸미는 말이라 오늘 기록이다(V22.9.120 후속).
// ‘지난주’ 는 홀로 써도 날짜로 본다(‘지난주 금욜 꽃 2만8천’).
const KAKAO_DATE_IN_MEMO_V229120 = [
  /(?:^|[^\d])\d{1,2}\s*일\s*(?:에|날|엔|쯤|께|경)(?![가-힣])/,
  /(?:^|[^\d])\d{1,2}\s*일(?:에|날|쯤|께)/,
  /(?:^|[^가-힣])[월화수목금토일]욜/,
  /(?:지지난|저저번|지난|저번)\s*주(?:\s*(?:[월화수목금토일](?:요일|욜)?|주말)|에|말)?(?![가-힣])|(?:다다음|다음|담)\s*주(?:\s*(?:[월화수목금토일](?:요일|욜)?|주말)|에|말)(?![가-힣])|이번\s*주\s*(?:[월화수목금토일](?:요일|욜)?|주말)(?![가-힣])/,
  /(?:어제|그제|그저께|엊그제|그끄제|그끄저께)(?!도|부터|처럼|보다|만큼)/, // ‘택시 8000 어제도 탔는데 또 탐’ 은 오늘 기록(V22.9.93 Q-112)
  /^낼\s/,
  /(?:지지난|저저번|지난|저번)\s*달\s*(?:초|초순|중순|말|하순|쯤|에)/,
  /(?:^|\s)(?:이|삼)?십(?:[일이삼사오육칠팔구])?일(?=\s|에|날|$)/,
];
const KAKAO_DATE_BEFORE_V229120 = /(?:(?:^|[\s,])(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)|하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름|며칠|일주일)\s*전에/;
// ‘오늘’ 이 날짜 말로 쓰였을 때만 본다(V22.9.120 후속 3): 홀로 쓰거나 조사 하나(오늘은·오늘도·오늘까지·오늘꺼, ‘오늘의 ’ 다음 빈칸)가 붙은 꼴.
// ‘오늘의집’·‘오늘날’·‘오늘자’ 처럼 다른 글자와 붙은 이름은 오늘 말이 아니다(‘지난주 토욜 오늘의집 의자 59000’ 은 날짜 말 안내).
const KAKAO_GUARD_SAYS_TODAY_V229120 = /오늘(?:은|는|도|만|이|에|까지|부터|거|꺼|것)?(?![가-힣])|오늘의\s/;
function kakaoGuardDateLeftV229120(text, rows, today) {
  const t = kakaoGuardNormV229120(text);
  const saysToday = KAKAO_GUARD_SAYS_TODAY_V229120.test(t);
  // ‘3일 전에’·‘사흘 전에’ 는 해석기가 읽으면 메모에서 빠진다(‘3일 전에 와인 6만원’ → 11-07 ‘와인’, 그대로 저장). 메모에 ‘전에’ 가 남았을 때만 못 읽은 것이다.
  const before = t.match(KAKAO_DATE_BEFORE_V229120);
  if (before && rows.some((row) => /전에/.test(kakaoGuardNormV229120(row.memo))) &&
      !(saysToday && rows.every((row) => String(row.transaction_date || "") === today))) return before[0].replace(/^[\s,]+/, "");
  if (saysToday) return "";
  for (const row of rows) {
    if (String(row.transaction_date || "") !== today) continue;
    const memo = kakaoGuardNormV229120(row.memo);
    for (const re of KAKAO_DATE_IN_MEMO_V229120) {
      const m = memo.match(re);
      if (m) return m[0].replace(/^[^0-9가-힣]+/, "").trim();
    }
  }
  return "";
}
// future(제품 결정 1): 달 없이 쓴 ‘N일’ 이 오늘보다 뒤 날짜로 풀린 기록. ‘다음달 5일’·‘12월 5일’ 처럼 달을 쓴 말은 보지 않는다.
const KAKAO_BARE_DAY_V229120 = /(?:^|[^\d월\/.\-])(\d{1,2})\s*일(?!\s*(?:전|후|간|동안|치|분|째|마다|장|권))/g;
const KAKAO_BARE_DAY_MONTH_HEAD_V229120 = /(?:다음|담|다다음|이번|지난|저번)\s*달\s*$|월\s*$/;
// V22.9.120 후속 3(재검토 반영): ‘내일·모레·글피’ 를 함께 쓴 말에서 그 날로 풀린 기록은 보지 않는다(‘내일 11일 관리비 15만원’ → 11월 11일, 앞날로 미리 적는 말).
// ‘내달 25일’ 은 해석기가 이번 달 25일로 읽으므로 그대로 안내한다(달을 붙여 다시 보내면 된다).
const KAKAO_GUARD_NEAR_DAYS_V229120 = [["내일", 1], ["모레", 2], ["글피", 3]];
function kakaoGuardDateAfterV229120(today, days) {
  const [y, m, d] = String(today).split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}
function kakaoGuardFutureBareDayV229120(text, rows, today) {
  const t = kakaoGuardNormV229120(text);
  const near = new Set(KAKAO_GUARD_NEAR_DAYS_V229120.filter(([word]) => t.includes(word)).map(([, days]) => kakaoGuardDateAfterV229120(today, days)));
  // V22.9.120 후속 2(판정 시간): 달 없이 쓴 ‘N일’ 은 글을 한 번만 훑어 모은다(예전에는 앞날 기록마다 다시 훑고 맞는 자리마다 앞 글 전체를 잘라 봤다).
  // 앞말이 ‘다음 달’·‘…월’ 인지는 바로 앞 16자만 보면 된다(정리된 글은 빈칸이 한 칸이라 가장 긴 앞말 ‘다다음 달 ’ 도 6자다).
  let days = null;
  for (const row of rows) {
    const date = String(row.transaction_date || "");
    if (!(date > today) || near.has(date)) continue;
    if (!days) {
      days = new Set();
      for (const m of t.matchAll(KAKAO_BARE_DAY_V229120)) {
        const at = m.index + m[0].indexOf(m[1]);
        if (!KAKAO_BARE_DAY_MONTH_HEAD_V229120.test(t.slice(Math.max(0, at - 16), at))) days.add(Number(m[1]));
      }
    }
    const day = Number(date.slice(8, 10));
    if (days.has(day)) return { day, month: Number(date.slice(5, 7)), year: Number(date.slice(0, 4)) };
  }
  return null;
}

// question·plan: 문장 조각(? ! . … 줄바꿈, ㅋㅋ·ㅠㅠ 뒤)마다 본다. ‘4500?’ 처럼 금액 뒤 물음표는 금액이 확실치 않은 기록이라 막지 않는다.
// 계획·전해 들은 말은 모든 기록이 오늘·지난 날이고(‘내일 보험료 18만원 들어온대요’ 는 앞날 기록이라 그대로) 끝난 기록 서술어가 하나도 없을 때만 본다(V22.9.120 후속).
// ‘ㅋㅋ·ㅠㅠ 뒤’ 는 앞 두 글자만 본다(V22.9.120 후속 2: ‘{2,}’ 뒤보기는 긴 ㅋ 줄에서 자리마다 줄 처음까지 되짚어 길이의 제곱이었다 — 나뉘는 자리는 같다).
const KAKAO_GUARD_PIECE_SPLIT_V229120 = /(?<=[?？!！.。…\n])|(?<=[ㅋㅎㅠㅜ]{2})\s+/;
const KAKAO_GUARD_HAS_MONEY_V229120 = /\d|[십백천만억]\s*원|[천만억](?=\s|$|[^가-힣])/;
const KAKAO_GUARD_UNCERTAIN_Q_V229120 = /(?:\d|[십백천만억원])\s*(?:원)?\s*(?:쯤|정도|가량|내외|안팎)?$|(?:듯|정도|쯤|가량)$/;

// 끝난 기록 서술어(V22.9.120 후속): 지난 일을 적는 말(샀어·냈다·시켰는데·했음 — 받침 ㅆ 뒤가 평서·이음 끝), 명사형 끝(…함·삼·냄·씀·줌·먹음·나감·보냄),
// 금액 바로 옆의 거래 낱말(‘38000원 결제’·‘결제 완료 90000원’·‘등록 15만원’). 바로 뒤에 물음표가 붙은 것(‘샀어?’)·물음 꼴(‘썼나’·‘했니’)·
// 지출이 아닌 말(있었·넘었·남았·기록했·…이었)·앞에 ‘안·못’ 이 붙은 것은 뺀다.
const KAKAO_GUARD_DONE_TAIL_V229120 = /^(?:다|어|어요|음|습니다|슴|슴다|네|네요|는데|는대|는디|는데요|더니|더라|더라고|더라구|고|지만|으니|으니까|길래|당|엉|어용|따|지|죠|다가|구|군)?$/;
const KAKAO_GUARD_DONE_NOT_V229120 = /있었|없었|넘었|남았|모자랐|기록[했됐돼]|저장[했됐돼]|입력[했됐]|적었|몰랐|잊었|까먹었|싶었|이었/;
const KAKAO_GUARD_DONE_NOUN_FORM_V229120 = /(?:함|삼|냄|씀|줌|쏨|뗌|뺌|넣음|드림|받음|먹음|마심|시킴|지름|질름|긁음|빠짐|뜯김|날림|채움|끊음|바꿈|맡김)$/;
const KAKAO_GUARD_DONE_NOUN_NOT_V229120 = /(?:포함|홍삼|인삼|수삼|[안못](?:함|냄|씀|줌|옴|감|봄|탐))$/;
// 한 음절 명사형 ‘감·옴·봄·탐’(V22.9.120 후속 3): 앞 글자가 받침 없는 글자일 때만 끝난 서술어로 본다(나감·사옴·다녀옴·해봄·갈아탐).
// 받침 있는 글자 뒤는 이름이다(장난감·곶감·물감·옷감·식탐·올봄 — ‘조카 장난감 5만원 살 예정’ 은 계획). 홀로 쓴 ‘감·옴·봄·탐’ 은 바로 앞 낱말이 금액일 때만 본다(‘택시 15000 탐’).
// 홀로 쓴 ‘줌’ 도 같다(‘5000원 줌’ 은 끝난 일, ‘줌 구독료 2만원 결제 예정’ 의 줌은 화상 회의 이름). 붙여 쓴 ‘사줌·빌려줌’ 은 그대로 끝난 일.
const KAKAO_GUARD_GO_FORM_V229120 = /([가-힣])(?:탐|봄|옴|감)$/;
const KAKAO_GUARD_GO_ALONE_V229120 = /^(?:탐|봄|옴|감|줌)$/;
const KAKAO_GUARD_DEAL_WORD_V229120 = /^(?:결제|이체|입금|송금|등록|구매|구입|주문|납입|납부|충전|계산|완료)(?:완료|됨|됐|완)?$/;
// 거래 낱말 바로 뒤가 앞으로의 말이면 끝난 일이 아니다(V22.9.120 후속 3: ‘카드값 50만원 결제 예정’·‘이체 할 거야’·‘입금 될 듯’).
const KAKAO_GUARD_DEAL_PLAN_NEXT_V229120 = /^(?:예정|계획|하려|할(?:$|거|꺼|게|까|래|려|예정|듯|지)|될(?:$|거|꺼|듯|예정))/;
const KAKAO_GUARD_MONEY_WORD_V229120 = /^(?:\d[\d,.]*(?:[만천백](?:\d[\d,.]*[천백]?)?)?원?|[일이삼사오육칠팔구십백천만억]+원)$/;
const KAKAO_GUARD_WORD_CHAR_V229120 = /[가-힣A-Za-z0-9]/;
function kakaoGuardWordsV229120(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/\S+/g)) {
    const word = m[0];
    // 앞뒤 기호를 뗀 알맹이와 뒤 기호(V22.9.120 후속 2: ‘[^…]+$’ 정규식은 낱말 가운데 긴 기호 줄에서 길이의 제곱이라 앞뒤에서 한 번씩 훑는다 — 결과는 같다).
    let head = 0;
    while (head < word.length && !KAKAO_GUARD_WORD_CHAR_V229120.test(word[head])) head += 1;
    let tail = word.length;
    while (tail > head && !KAKAO_GUARD_WORD_CHAR_V229120.test(word[tail - 1])) tail -= 1;
    const core = word.slice(head, tail);
    out.push({ core, start: m.index, end: m.index + word.length, asked: /[?？]/.test(core ? word.slice(tail) : word) });
  }
  return out;
}
function kakaoGuardDoneAtV229120(words, i) {
  const { core, asked } = words[i];
  if (!core || asked || (i > 0 && /^[안못]$/.test(words[i - 1].core))) return false;
  const money = (j) => j >= 0 && j < words.length && KAKAO_GUARD_MONEY_WORD_V229120.test(words[j].core);
  if (KAKAO_GUARD_DEAL_WORD_V229120.test(core)) {
    if (KAKAO_GUARD_DEAL_PLAN_NEXT_V229120.test(words[i + 1]?.core || "")) return false;
    return money(i - 1) || money(i + 1) || (words[i + 1]?.core === "완료" && money(i + 2));
  }
  if (KAKAO_GUARD_GO_ALONE_V229120.test(core)) return money(i - 1);
  const go = core.match(KAKAO_GUARD_GO_FORM_V229120);
  const goCode = go ? go[1].charCodeAt(0) - 0xAC00 : -1;
  if ((KAKAO_GUARD_DONE_NOUN_FORM_V229120.test(core) || (goCode >= 0 && goCode < 11172 && goCode % 28 === 0)) && !KAKAO_GUARD_DONE_NOUN_NOT_V229120.test(core)) return true;
  if (KAKAO_GUARD_DONE_NOT_V229120.test(core)) return false;
  for (let k = Math.max(0, core.length - 4); k < core.length; k += 1) { // 받침 ㅆ 뒤 끝(DONE_TAIL)은 세 글자 이하라 마지막 네 글자만 본다
    const code = core.charCodeAt(k) - 0xAC00;
    if (code < 0 || code >= 11172 || code % 28 !== 20 || "있겠였".includes(core[k])) continue; // 받침 ㅆ = 지난 일
    if (KAKAO_GUARD_DONE_TAIL_V229120.test(core.slice(k + 1))) return true;
  }
  return false;
}
function kakaoGuardHasDoneV229120(text) {
  const words = kakaoGuardWordsV229120(kakaoGuardNormV229120(text));
  return words.some((_, i) => kakaoGuardDoneAtV229120(words, i));
}
// 혼잣말 물음(V22.9.120 후속) — 가르는 규칙: 금액 뒤에 끝난 기록 서술어가 먼저 오고 그 뒤에 물음이 따로 붙으면 기록(‘5800원 냈어 이게 맞냐?’·‘23000원 시켰는데 왜 벌써 배고프지?’),
// 물음 꼴이 금액을 거느린 서술어에 바로 붙으면 묻는 말(‘커피 4500 썼나?’·‘15000원 기록돼 있나?’·‘12000 이렇게만 치면 되나요??’). 물음 쪽에 기록·내역을 묻는 낱말이 있으면 묻는 말로 둔다.
const KAKAO_GUARD_META_Q_V229120 = /기록|저장|입력|찍혀|찍혔|중복|두\s*번|확인|가계부|적혔|적혀|얼마|내역|합계|요약/;
// 금액 자리(KAKAO_GUARD_AMOUNT_V229120 을 앞에서부터 겹치지 않게 찾은 것 — matchAll 과 같다) 가운데 마지막 것이 끝나는 자리, 없으면 -1.
// V22.9.120 후속 2(판정 시간): 정규식으로 찾으면 ‘일이삼…’ 처럼 [십백천만억] 이 없는 한글 숫자 줄에서 자리마다 줄 끝까지 다시 훑어 길이의 제곱이라 한 번 훑어 구한다.
const KAKAO_GUARD_HAN_NUM_V229120 = "일이삼사오육칠팔구십백천만억";
const KAKAO_GUARD_HAN_UNIT_V229120 = "십백천만억";
function kakaoGuardMoneyEndV229120(text) {
  const t = String(text || "");
  const digit = (i) => i < t.length && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57;
  const space = (i) => i < t.length && /\s/.test(t[i]);
  let last = -1;
  let i = 0;
  while (i < t.length) {
    if (digit(i)) { // \d[\d,]*(?:\.\d+)?\s*(?:원|[만천])?
      let e = i + 1;
      while (digit(e) || t[e] === ",") e += 1;
      if (t[e] === "." && digit(e + 1)) { e += 2; while (digit(e)) e += 1; }
      while (space(e)) e += 1;
      if (e < t.length && "원만천".includes(t[e])) e += 1;
      last = e;
      i = e;
    } else if (KAKAO_GUARD_HAN_NUM_V229120.includes(t[i])) { // [일…억]+[십백천만억]\s*원? — 한글 숫자 줄 안 마지막 단위 글자까지
      let r = i;
      let unit = -1;
      while (r < t.length && KAKAO_GUARD_HAN_NUM_V229120.includes(t[r])) { if (KAKAO_GUARD_HAN_UNIT_V229120.includes(t[r])) unit = r; r += 1; }
      if (unit > i) {
        let e = unit + 1;
        while (space(e)) e += 1;
        if (t[e] === "원") e += 1;
        last = e;
        i = e;
      } else i = r;
    } else i += 1;
  }
  return last;
}
function kakaoGuardSoliloquyV229120(piece) {
  const text = kakaoGuardNormV229120(piece);
  const moneyEnd = kakaoGuardMoneyEndV229120(text);
  if (moneyEnd < 0) return false;
  const words = kakaoGuardWordsV229120(text);
  for (let i = 0; i < words.length - 1; i += 1) { // 마지막 낱말은 물음이 붙는 자리라 보지 않는다
    if (words[i].start < moneyEnd || !kakaoGuardDoneAtV229120(words, i)) continue;
    return !KAKAO_GUARD_META_Q_V229120.test(text.slice(words[i].end));
  }
  return false;
}
// 물음 꼴은 조각 끝에서만 본다(‘뭐가 들어왔나 했더니 … 환급금’·‘며칠 고민하다 산 패딩’·‘고칠까 하다가 새로 산 이어폰’ 은 기록). ‘…는지’ 도 끝일 때만,
// ‘얼마나’ 는 ‘얼마나 썼지’ 처럼 끝일 때만 본다(‘얼마나 썼는지 몰라 커피 4500’ 은 기록, V22.9.80 T-39). ‘몇 년 만에’·‘몇 번을 참다가’ 의 ‘몇’ 은 보지 않는다.
// V22.9.120 후속 2(판정 시간): 한 정규식으로 보던 것을 갈래별로 나눈다. ‘…\S*$’(끝 낱말까지 이어 보는 ‘얼마나 썼…’·‘언제였…’·‘뭐 있었…’)와
// ‘몇 번 …[어야…]$’ 는 같은 말이 되풀이되면 자리마다 끝까지 다시 훑어 길이의 제곱이었다. 앞의 것은 마지막 빈칸 앞 8자부터만 보고(그 앞에서 시작하는 것은
// 끝 낱말에 닿지 못한다), ‘몇 번’ 은 끝 글자와 ‘몇 번’ 자리를 따로 본다. 판정하는 글(bare)에는 물음표가 없다(조각은 물음표 바로 뒤에서 나뉘고 끝 물음표는 떼었다).
const KAKAO_GUARD_Q_END_V229120 = /(?:(?:썼|샀|했|됐|됬|있|넘었|찍혔|찍혀|들어왔|나갔|맞|넣었|긁었|기록됐|기록돼|저장됐|저장돼|빠졌|나왔|냈|받았)(?:나|니|냐|나요|을까|는지)|얼마(?:야|임|예요|에요|였(?:어|지|나|더라|죠)?|지|씀|썼(?:어|지|나|냐)?)|넘었(?:어|나|냐|니)|(?:^|\s)맞(?:지|나|아|냐|죠|나요|아요)|있나|아니지|되나요?|돼요|알아들어|걸릴까요?|까\s*말까)$/;
const KAKAO_GUARD_Q_END_WORD_V229120 = /(?:얼마나\s*(?:썼|남았|됐|돼|나왔)|언제(?:였|야|지|임)|뭐\s*있었)\S*$/;
const KAKAO_GUARD_Q_COUNT_V229120 = /(?:^|\s)몇\s*(?:번|건|개|명|원|프로)(?!\s*(?:만에|동안|째|을|를))[^?？]/;
const KAKAO_GUARD_Q_COUNT_END_V229120 = /[어야냐나까지요임돼]$/;
const KAKAO_GUARD_Q_DAYS_V229120 = /며칠(?:이나|이야|이에요|이었|째야|인지)[^?？]*$/;
// V22.9.120 후속 3(재검토 반영): ‘몇 번·몇 명·며칠이나’ 는 마지막 금액 뒤에 오면 묻는 말이다(‘병원비 15000 이번달 몇번 나갔어’).
// V22.9.120 후속 4(3차 재검토): 금액 앞의 ‘몇 X·며칠이나’ 는 금액에 닿기 전에 이음말이 이어져 다른 일을 꾸밀 때만 꾸미는 말(기록)로 본다
// (‘친구 몇 명이랑 저녁 5만원 냈어’·‘귤 몇 개 사고 5000원 줬어’·‘며칠이나 고민하다 산 패딩 25만원’·‘몇 번 망설이다 결국 가방 89000원 긁음’).
// 이음말 없이 금액에 닿으면 금액이 셈의 조건인 물음이라 예전 규칙대로 본다(‘이번달 몇 번이나 5만원 넘게 썼어’·‘며칠이나 5만원 넘게 썼지’).
// 이음말 = 낱말 끝 ‘이랑·랑·하고·과·와’ 와 ‘-고·-서·-다·-다가·-며·-면서’, 낱말 ‘만에·동안·째’. ‘…에서·…에게서·…한테서·…께서’ 의 ‘서’ 는 이음말이 아니다(‘카페에서’).
const KAKAO_GUARD_COUNT_LINK_V229120 = /(?:랑|하고|과|와|고|(?<!에|게|테|께)서|다|다가|며|면서)$|^(?:만에|동안|째)$/;
const KAKAO_GUARD_Q_DAYS_AT_V229120 = /며칠(?:이나|이야|이에요|이었|째야|인지)/g;
const KAKAO_GUARD_Q_COUNT_AT_V229120 = /^몇\s*(?:번|건|개|명|원|프로)(?!\s*(?:만에|동안|째|을|를))[^?？]/;
function kakaoGuardCountAsksV229120(bare, moneyEnd) {
  if (moneyEnd <= 0) return false;
  const head = bare.slice(0, moneyEnd);
  if (!head.includes("몇") && !head.includes("며칠")) return false;
  const words = kakaoGuardWordsV229120(bare);
  // linked[i]: i 번째 낱말부터 뒤로 가며 금액 낱말보다 이음말을 먼저 만나는지 — 뒤에서 한 번 훑어 구한다(판정 시간).
  const linked = new Array(words.length + 1).fill(false);
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const core = words[i].core;
    linked[i] = kakaoGuardMoneyEndV229120(core) >= 0 ? false : KAKAO_GUARD_COUNT_LINK_V229120.test(core) || linked[i + 1];
  }
  let w = 0;
  for (const m of head.matchAll(KAKAO_GUARD_Q_DAYS_AT_V229120)) {
    while (w < words.length && words[w].end <= m.index) w += 1;
    if (w < words.length && !linked[w]) return true;
  }
  if (!KAKAO_GUARD_Q_COUNT_END_V229120.test(bare)) return false;
  for (let i = 0; i < words.length && words[i].start < moneyEnd; i += 1) {
    const at = words[i].start; // ‘몇’ 은 낱말 첫머리에서만 본다(예전 꼴 ‘(?:^|\s)몇’ 과 같다). 셈 말과 뒤 확인은 16자 안에 든다.
    if (bare[at] === "몇" && !linked[i] && KAKAO_GUARD_Q_COUNT_AT_V229120.test(bare.slice(at, at + 16))) return true;
  }
  return false;
}
function kakaoGuardQuestionEndV229120(bare) {
  if (KAKAO_GUARD_Q_END_V229120.test(bare)) return true;
  const moneyEnd = kakaoGuardMoneyEndV229120(bare);
  const afterMoney = bare.slice(Math.max(0, moneyEnd));
  if (KAKAO_GUARD_Q_DAYS_V229120.test(afterMoney)) return true;
  if (KAKAO_GUARD_Q_COUNT_END_V229120.test(bare) && KAKAO_GUARD_Q_COUNT_V229120.test(afterMoney)) return true;
  if (kakaoGuardCountAsksV229120(bare, moneyEnd)) return true;
  const space = bare.lastIndexOf(" ");
  return KAKAO_GUARD_Q_END_WORD_V229120.test(space < 8 ? bare : bare.slice(space - 8));
}
// 부탁 말: 시키는 꼴(‘알려줘’·‘보여줘’)은 말 끝이면 묻는 말이고, 가운데 있으면 끝난 기록 서술어가 없을 때만 본다(‘top3 알려줘 5만원 이상만’).
// ‘알려줘서·봐줘서·찾아줘서’ 같은 이유 말은 뺀다. ‘확인 부탁·확인 좀’ 은 말 끝에서만 본다(‘확인 부탁드린 견적대로 … 결제 완료 90000원’ 은 기록).
const KAKAO_GUARD_ASK_V229120 = /(?:알려|보여|찾아|뽑아|봐|정리해|계산해|합쳐)\s*(?:줘|주세요|줄래|주라|줘요|주실래|주실\s*수|줄\s*수)(?![서도])/;
const KAKAO_GUARD_ASK_END_V229120 = /(?:(?:알려|보여|찾아|뽑아|봐|정리해|계산해|합쳐)\s*(?:줘|주세요|줄래|주라|줘요|주실래요?|줄래요)|확인\s*(?:해\s*줘|해\s*주세요|해줄래|좀|부탁(?:해|해요|합니다|드려요|드립니다)?)요?|합치면\s*얼마(?:야|예요|에요)?)$/;
// 계획·목표: 문장 자체가 계획·목표인 말만 본다(꾸미는 말로 든 ‘선물하려고 산 꽃’·‘목표 통장에 20만원 넣었음’·‘계획에 없던 지출’·‘목표 달성 기념 케이크’ 는 기록).
const KAKAO_GUARD_PLAN_ANY_V229120 = /목표(?:는|가)\s|목표\s*(?:금액|액)?\s*[\d일이삼사오육칠팔구십백천만억][\d,.]*\s*(?:[만천억]\s*)?원?\s*(?:으로|로)\s*(?:설정|정해|잡아|바꿔)|달성까지|모으기(?=[\s!.~]|$)|모으는\s*(?:중|데|거)|모아야|모으려(?:면|고)|모을\s*(?:거|꺼|예정|계획|생각)|저축(?:할|하는\s*게|하려)|챌린지\s*(?:\d+\s*일\s*째|중)|(?:할|낼|넣을|쓸|살|갈|올|이체할|결제할|구매할|버틸|모을|저축할|받을|들어올|나갈)\s*(?:예정|계획|생각)(?!\s*(?:없|에\s*없|에도\s*없|도\s*없|이\s*없|밖|외))/;
// V22.9.120 후속 3(재검토 반영): ‘…예정·…계획’ 으로 끝나는 말도 계획이다(‘월급 320만원 입금될 예정’·‘카드값 50만원 빠질 예정’ — 좁히면서 빠졌던 꼴).
// ‘무계획’(계획 없이 쓴 돈, ‘여행 30만원 무계획’)은 계획이 아니다.
const KAKAO_GUARD_PLAN_END_V229120 = /(?:목표(?:야|임|이야|예요|에요|입니다|이다)?|도전|성공\s*중|(?:할|낼|넣을|쓸|살|갈|이체할|버틸|모을|저축할|들|붓)\s*(?:거|꺼)(?:야|임|예요|에요|다|요)?|생각(?:임|이야|이에요|입니다|이다)|[가-힣](?:려고|려구)|(?:나갈|쓸|할|들어올|낼|나올)\s*듯(?:해|함|하다|요)?|싶(?:은데|어|다|음|네|어요|습니다)|(?:예정|(?<!무)계획)(?:이에요|예요|입니다|이야|이다|임|요)?)$/;
// V22.9.120 후속 4(3차 재검토): 금액 조각보다 뒤의 다른 조각이라도 돈이 오가는 움직임의 앞날 꼴로 끝나면 계획이다(‘학원비 30만원⏎이체할 거야’·
// ‘관리비 15만원 ㅠㅠ 이따 낼 거야’·‘카드값 50만원. 나갈 듯’ — 후속 3 에서 덧말을 빼면서 다시 저장되던 꼴). 줄기는 내다·보내다·넣다·갚다·나가다(빠져나가다)·빠지다·
// 들어오다·받다와 이체·송금·결제·입금 + 하다(되다, ‘결제 예정’ 처럼 바로 예정), 끝은 ‘ㄹ 거(야·임·예요…)’·‘ㄹ 듯’·‘ㄹ 예정’·‘려고’ 만 본다.
// 그 밖의 동사(먹다·타다·가다·사다·보다)의 앞날 꼴과 바람 꼴(싶다)은 기록 뒤 덧말이라 보지 않는다(‘택시 18000원 ㅠㅠ 다신 안 탈 거야’·‘치킨 21000원 ㅋㅋ 또 먹고 싶다’).
// 우리말 줄기는 낱말 첫머리에서만 본다(‘지낼·끝낼·꺼낼·돌려보낼’ 의 ‘낼’ 이 아니다). ‘살(이) 빠질 듯·살 빠지려고’ 는 몸무게 말이라 뺀다.
const KAKAO_GUARD_PLAN_MOVE_END_V229120 = /(?:(?:(?<![가-힣])(?:낼|보낼|넣을|갚을|(?:빠져)?나갈|들어올|받을)|(?<![가-힣])(?<!살 |살이 )빠질|(?:이체|송금|결제|입금) ?(?:할|될)) ?(?:(?:거|꺼)(?:야|임|예요|에요|다|요)?|듯(?:해|함|하다|요)?|예정(?:이에요|예요|입니다|이야|이다|임|요)?)|(?:이체|송금|결제|입금) ?예정(?:이에요|예요|입니다|이야|이다|임|요)?|(?<![가-힣])(?:내|보내|넣으|갚으|(?:빠져)?나가|들어오|받으)(?:려고|려구)|(?<![가-힣])(?<!살 |살이 )빠지(?:려고|려구)|(?:이체|송금|결제|입금) ?하(?:려고|려구))$/;
// ‘목표 + 금액’: 끝난 기록 서술어가 없으면 목표를 말한 것이고(‘저축 목표 50만원’), 두 건 이상으로 읽혔으면 목표 금액이 기록으로 들어가므로
// (‘목표 100만원 중에 오늘 5만원 넣었다 이제 45만 남음’ → 100만원·5만원·45만원 세 건) 막는다. ‘목표 통장에 20만원 넣었음’·‘목표 달성 기념 케이크 32000원’ 은 기록.
// — 조정자 결정으로 유지(V22.9.120 후속 2). V22.9.120 후속 3: 숫자 뒤에 돈이 아닌 단위가 붙으면 금액이 아니다(‘다이어트 목표 5kg 달성 기념 케이크 32000원’·‘목표 30%’·‘목표 3번’·걸음 수 ‘목표 10만보’).
// 단위 앞의 만·천도 함께 본다(‘10만보’ 를 ‘10’ 까지만 금액으로 읽고 넘어가지 않게). ‘일’ 은 빼지 않는다: 해석기가 ‘목표 3일 …’ 의 ‘3일’ 을 날짜(이번 달 3일)로
// 읽으므로 예전처럼 막는다. ‘1만 걸음’ 처럼 띄어 쓴 걸음 수도 해석기가 10000원 기록으로 읽으므로 막는다.
const KAKAO_GUARD_PLAN_GOAL_AMOUNT_V229120 = new RegExp(String.raw`목표\s*(?:금액|액)?\s*(?:은|는|이|가)?\s*${KAKAO_GUARD_AMOUNT_V229120}(?![\d,.]|\s*[A-Za-z%㎏㎞]|[만천]?(?:번|회|개|명|등|위|권|층|살|점|시간|분|주|개월|년|키로|킬로|칼로리|프로|퍼센트|보))`);
// 전해 들은 말: 조각 끝이 ‘…이래·…하래·…라던데·…준대’ 꼴일 때만 본다. ‘…더라고’ 는 직접 겪은 일이라 보지 않고(‘15000원 나오더라고’),
// ‘시켰는대’ 처럼 ‘는데’ 를 잘못 친 말은 끝난 기록 서술어로 읽혀 걸리지 않는다.
const KAKAO_GUARD_HEARSAY_V229120 = /(?:이래|하래|래요|라던데|다던데|라더라|다더라|라네|다네)$/;
const KAKAO_GUARD_PRICE_RANGE_V229120 = /(?:원|[\d일이삼사오육칠팔구십백천만억]\s*[십백천만억])\s*대(?:요|여)?$/;
function kakaoGuardHearsayEndV229120(piece) {
  const t = kakaoGuardDropQuestionMarksV229120(kakaoGuardTrimTailV229120(piece));
  if (KAKAO_GUARD_HEARSAY_V229120.test(t)) return true;
  const m = t.match(/([가-힣])대(?:요|여)?$/);
  if (!m) return false;
  // 값의 범위(‘3만원대’·‘1만원대요’·‘10만대’)는 전해 들은 말이 아니다(V22.9.120 후속 3 — ‘원’·‘만’ 도 받침이 ㄴ 이라 ‘준대’ 와 같은 꼴로 읽혔다).
  if (KAKAO_GUARD_PRICE_RANGE_V229120.test(t)) return false;
  const code = m[1].charCodeAt(0) - 0xAC00;
  return code >= 0 && code < 11172 && code % 28 === 4; // 준대·간대·는대 — 받침 ㄴ + 대
}
function kakaoGuardNotRecordV229120(text, rows, today) {
  const raw = String(text || "").replace(/\r/g, "");
  const flat = kakaoGuardNormV229120(raw);
  const done = kakaoGuardHasDoneV229120(raw);
  const flatBare = kakaoGuardTrimTailV229120(kakaoGuardDropQuestionMarksV229120(kakaoGuardTrimTailV229120(flat)));
  // 가운데 부탁 말은 끝난 기록 서술어가 없을 때 묻는 말로 본다 — 조정자 결정으로 유지(V22.9.120 후속 2).
  if (KAKAO_GUARD_ASK_END_V229120.test(flatBare) || (!done && KAKAO_GUARD_ASK_V229120.test(flat))) return "question";
  const notFuture = rows.length > 0 && rows.every((row) => !(String(row.transaction_date || "") > today));
  const quiet = notFuture && !done; // 계획·전해 들은 말을 보는 조건
  // 두 건 이상으로 읽힌 말에 계획 꼴(‘1억 모으기 목표 시작! 첫 입금 100만원’ → 1억·100만원 두 건)이 있으면 목표 금액이 기록으로 들어가므로 끝난 서술어가 있어도 막는다
  // — 조정자 결정으로 유지(V22.9.120 후속 2).
  let plan = (quiet || (notFuture && rows.length > 1)) && (KAKAO_GUARD_PLAN_ANY_V229120.test(flat) || KAKAO_GUARD_PLAN_GOAL_AMOUNT_V229120.test(flat));
  // V22.9.120 후속 3(재검토 반영): 끝 꼴 계획(PLAN_END)은 금액이 든 조각이나 금액 조각보다 앞에 온 조각에서만 본다. 기록 뒤에 붙인 금액 없는 덧말
  // (‘치킨 21000원 ㅋㅋ 또 먹고 싶다’)은 계획이 아니다. 앞에 온 계획 말(‘다음달에 냉장고 사고 싶어. 120만원 정도?’)은 그대로 본다.
  // V22.9.120 후속 4(3차 재검토): 금액 조각보다 뒤의 조각은 돈이 오가는 움직임의 앞날 꼴(PLAN_MOVE_END)일 때만 계획으로 본다(‘카드값 50만원. 나갈 듯’).
  let moneySeen = false;
  for (const part of raw.split(KAKAO_GUARD_PIECE_SPLIT_V229120)) {
    const piece = part.trim();
    if (!piece) continue;
    const body = kakaoGuardTrimTailV229120(piece);
    const bare = kakaoGuardNormV229120(kakaoGuardTrimTailV229120(kakaoGuardDropQuestionMarksV229120(body)));
    const hasMoney = KAKAO_GUARD_HAS_MONEY_V229120.test(piece);
    const later = moneySeen && !hasMoney; // 금액 조각보다 뒤의 금액 없는 조각
    if (quiet && (later ? KAKAO_GUARD_PLAN_MOVE_END_V229120.test(bare) : KAKAO_GUARD_PLAN_END_V229120.test(bare))) plan = true;
    if (!hasMoney) continue;
    moneySeen = true;
    const asks = (/[?？]$/.test(body) && !KAKAO_GUARD_UNCERTAIN_Q_V229120.test(bare)) || kakaoGuardQuestionEndV229120(bare);
    if (asks && !kakaoGuardSoliloquyV229120(piece)) return "question";
    if (quiet && kakaoGuardHearsayEndV229120(piece)) return "hearsay";
  }
  return plan ? "plan" : "";
}

// 기존 ‘고치는 말’ 안내(저장 직전 looksLikeKakaoChangeRequest)와 같은 글. 안전망 ① 도 이 글로 답한다.
const KAKAO_CHANGE_REQUEST_TEXT_V229120 = "기록을 고치거나 지우려는 말로 보여서 새 기록으로 저장하지 않았어요.\n‘오늘기록’으로 번호를 본 뒤 이렇게 보내 주세요.\n수정 01번 금액 5000\n삭제 01번\n방금 기록이라면 ‘방금 5000원으로 바꿔줘’·‘방금 삭제’로 돼요.\n\n새로 적는 거라면 ‘커피 5000원’처럼 보내 주세요.";
function kakaoChangeRequestReply() {
  return kakaoText(KAKAO_CHANGE_REQUEST_TEXT_V229120, [["오늘기록", "오늘기록"]]);
}
function kakaoGuardShiftDateV229120(today, days) {
  const [y, m, d] = String(today).split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d - days));
  return { month: at.getUTCMonth() + 1, day: at.getUTCDate() };
}
// 판정 순서: 고치는 말 → 묻는 말 → 날짜 말 → 앞날 N일 → 계획·전해 들은 말(앞의 것이 더 분명한 신호다). 걸리지 않으면 null(예전처럼 저장).
// 길이 상한(V22.9.120 후속 2): 이보다 긴 말은 판정하지 않고 null(예전처럼 저장) — 붙여 넣은 긴 글에 판정 시간을 쓰지 않도록 묶는다(판정은 길이에 비례).
const KAKAO_GUARD_MAX_TEXT_V229120 = 1500;

// V22.9.122 K-1 (출시 전 점검 2026-11-14): 카드·은행 알림 문자를 붙여 넣은 말에서 예전 길이 틀리게 저장하던 꼴 여섯 가지를 저장 직전에 막고 되묻는다.
// 문자를 새로 읽지 않는다(승인 문자 한 통 읽기는 nlu/transaction-parser.js readCardApprovalSmsV229122). 여기 걸리지 않으면 예전처럼 저장한다.
//   ① 결제·출금이 되지 않았다는 알림(승인거절·승인거부·미승인·출금불능)이 지출로 저장됨 — 알림 문자 꼴일 때만 막는다.
//   ② 카드 끝 번호(‘하나 1357 승인’)·승인번호가 금액으로 한 건 더 저장됨
//   ③ 취소 문자(‘신한카드(1234)취소’·‘체크취소’·‘부분취소’·‘출금취소’)가 지출로 저장됨
//   ④ 문자에 날짜가 하나 적혀 있는데 다른 날(오늘)로 저장됨
//   ⑤ 받은 돈 알림(‘○○님이 25,000원을 보냈어요’)이 지출로 저장됨
//   ⑥ 한글 단위로 적은 잔액·누적·한도(‘잔액 3만원’)의 단위가 10,000원 헛기록이 됨
// 독립 검토 두 번을 거치며 좁혔다: 이야기로 쓴 말(‘승인 거절돼서 현금으로 점심 9000원’, ‘카드 취소 2건 처리하고 …’, ‘주차 2000 승인 …’)은 막지 않고,
// 되묻는 답에는 지어낸 금액·가게 이름을 쓰지 않으며, 정규식의 빈칸 되풀이는 모두 상한을 둔다(긴 빈칸 글에서 0.6초가 걸리던 것).
const KAKAO_NOTICE_ISSUERS_V229122 = "신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오뱅크|카카오|토스뱅크|토스|씨티|IBK";
const KAKAO_NOTICE_FAILED_V229122 = /승인\s{0,2}(?:거절|거부|불가|보류|실패)|미승인|(?:출금|이체)\s{0,2}불능|결제\s{0,2}실패/;
// 다른 방법으로 다시 냈다는 말이 있으면 실패 알림이 아니라 실제 지출 이야기다.
const KAKAO_NOTICE_REPAID_V229122 = /현금(?:으로)?\s{0,2}(?:결제|계산|냄|냈|드림|드렸|승차|지불)|현금으로|(?:체크|회사|법인|다른|개인)\s{0,2}카드로?|페이로|토스로|계좌로|계좌이체로|송금|성공|재결제|다시\s{0,2}(?:결제|이체|보냄|보냈|긁)|겨우\s{0,2}결제/;
const KAKAO_NOTICE_CANCEL_V229122 = /(?:(?:카드|체크)[ \t]{0,2}[\])】]?[ \t]{0,2}[(\[]?[\d*]{0,4}[)\]]?|출금|부분)[ \t]{0,2}취소\s{0,3}(?=-?\d[\d,]{0,12}\s{0,2}원|[가-힣]\*)/;
const KAKAO_NOTICE_RECEIVED_V229122 = /님이\s{0,2}[\d,]{1,15}\s{0,2}원을?\s{0,2}보냈/;
const KAKAO_NOTICE_WEB_TAG_V229122 = /[\[(【]\s{0,2}web\s{0,2}발신\s{0,2}[\])】]/i;
const KAKAO_NOTICE_BANK_TAG_V229122 = new RegExp("^[ \\t]{0,3}[\\[(【][^\\])】\\n]{0,10}(?:" + KAKAO_NOTICE_ISSUERS_V229122 + "|은행|카드|뱅크|페이|금고)[^\\])】\\n]{0,10}[\\])】]", "im");
const KAKAO_NOTICE_MASKED_NAME_V229122 = /[가-힣]\*{1,3}[가-힣]{0,3}/;
const KAKAO_NOTICE_TIME_V229122 = /(?<!\d)\d{1,2}:\d{2}(?!\d)/;
const KAKAO_NOTICE_BALANCE_V229122 = /(?:누적|잔액|잔고)\s{0,2}:?\s{0,2}[\d,]{1,15}/;
const KAKAO_NOTICE_TYPE_WORD_V229122 = /(?:^|\s)(?:수입|지출)(?=\s|$)/;
const KAKAO_NOTICE_BALANCE_UNIT_V229122 = /(?:누적|잔액|잔고|남은\s{0,2}한도|한도)\s{0,2}:?\s{0,2}[\d,.]{1,15}\s{0,2}[십백천만억]/;
// 카드 이름 바로 뒤의 네 자리(끝이 0 이 아닌 수)만 끝 번호로 본다 — ‘주차 2000 승인 점심 8000’·‘카드 4500 승인 났고 …’ 는 금액이다(V22.9.94 C-3 과 같은 기준).
const KAKAO_NOTICE_CARD_DIGITS_V229122 = new RegExp("(?:카드|체크|" + KAKAO_NOTICE_ISSUERS_V229122 + ")\\s{0,2}[\\])】]?\\s{0,2}[(\\[]?(\\d{3}[1-9])[)\\]]?\\s{0,2}승인(?!\\s{0,2}번호)", "gi");
const KAKAO_CANCEL_NOTICE_TEXT_V229122 = "결제·승인 취소 내역으로 보여 새 기록을 저장하지 않았어요. 환불받은 돈을 기록하려면 ‘수입 결제 취소 36000원’처럼 구분을 명시해 주세요.";
// 다시 보낼 예시. 지어낸 금액·가게 이름을 쓰지 않는다 — 그대로 보내면 틀린 기록이 저장된다. 금액과 날짜를 알 때만 그 값으로 만들고
// (쓴 곳 자리는 ‘쓴곳’, 들어온 돈이면 ‘수입’), 모르면 예시 없이 순서만 알린다.
function kakaoCardSmsExampleV229122(date, amount, today, income = false) {
  const ymd = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !(Number(amount) > 0)) return "";
  const year = ymd.slice(0, 4) === String(today).slice(0, 4) ? "" : Number(ymd.slice(0, 4)) + "년 ";
  return year + Number(ymd.slice(5, 7)) + "월 " + Number(ymd.slice(8, 10)) + "일 " + (income ? "수입 " : "쓴곳 ") + Math.round(Number(amount)) + "원";
}
function kakaoCardSmsHowToV229122(example, income = false) {
  if (!example) return "문자에서 날짜·쓴 곳·금액만 골라 ‘날짜 쓴 곳 금액원’ 순서로 한 건씩 보내 주세요.";
  return income ? "문자에서 날짜·금액만 골라 이렇게 보내 주세요.\n" + example : "문자에서 날짜·쓴 곳·금액만 골라 이렇게 보내 주세요(‘쓴곳’ 자리에 쓴 곳 이름).\n" + example;
}
function kakaoGuardNoticeV229122(text, rows, today) {
  const replies = [["오늘기록", "오늘기록"]];
  const hasDate = cardSmsDatesV229122(text, today);
  // 알림 문자 꼴: [Web발신], 줄 머리의 은행·카드 꼬리표, 가린 이름, 또는 날짜와 시각이 함께.
  const noticeShape = KAKAO_NOTICE_WEB_TAG_V229122.test(text) || KAKAO_NOTICE_BANK_TAG_V229122.test(text) || KAKAO_NOTICE_MASKED_NAME_V229122.test(text) || (hasDate.length > 0 && KAKAO_NOTICE_TIME_V229122.test(text));
  if (noticeShape && KAKAO_NOTICE_FAILED_V229122.test(text) && !KAKAO_NOTICE_REPAID_V229122.test(text)) {
    return { kind: "notice_failed", text: "결제나 출금이 되지 않았다는 알림으로 보여서 기록하지 않았어요.\n실제로 쓴 돈이면 내용과 금액만 적어 다시 보내 주세요.", quickReplies: replies };
  }
  const digits = new Set();
  for (const match of text.matchAll(/승인\s{0,2}번호\s{0,2}:?\s{0,2}(\d{4,12})/g)) digits.add(Number(match[1]));
  if (rows.length > 1) for (const match of text.matchAll(KAKAO_NOTICE_CARD_DIGITS_V229122)) digits.add(Number(match[1]));
  if (rows.some((row) => digits.has(Number(row.amount)))) {
    // 끝 번호·승인번호로 읽힌 건을 빼고 정확히 한 건이 남을 때만 그 건의 날짜·금액으로 예시를 만든다.
    const real = rows.filter((row) => !digits.has(Number(row.amount)));
    // 독립 검토 3: 예시의 날짜는 글에 하나 적힌 날짜를 쓴다(예전 길이 읽은 날짜는 오늘일 수 있다). 적힌 날짜가 하나가 아니면 예시를 들지 않는다.
    const example = real.length === 1 && hasDate.length === 1 && hasDate[0] ? kakaoCardSmsExampleV229122(hasDate[0], real[0].amount, today, real[0].type === "income") : "";
    return { kind: "notice_digits", text: "카드 끝 번호나 승인번호가 금액으로 읽혀서 저장하지 않았어요.\n" + kakaoCardSmsHowToV229122(example, real.length === 1 && real[0].type === "income"), quickReplies: replies };
  }
  // ⑥ 고르는 쪽(브라우저 자산과 같이 쓰는 normalizeInputText)이 잔액 뒤의 숫자만 빼고 단위(‘만원’)를 남겨 10,000원 같은 헛기록이 생긴다. 그쪽은 그대로 두고 저장만 막는다.
  if (KAKAO_NOTICE_BALANCE_UNIT_V229122.test(text)) {
    return { kind: "notice_balance", text: "잔액·누적·한도 금액이 기록으로 읽힐 수 있어서 저장하지 않았어요.\n잔액 부분을 빼고 쓴 돈만 내용과 금액으로 다시 보내 주세요.", quickReplies: replies };
  }
  const spends = rows.some((row) => row.type === "expense");
  if (spends && !KAKAO_NOTICE_TYPE_WORD_V229122.test(text)) {
    if (KAKAO_NOTICE_CANCEL_V229122.test(text)) return { kind: "notice_cancel", text: KAKAO_CANCEL_NOTICE_TEXT_V229122, quickReplies: replies };
    if (KAKAO_NOTICE_RECEIVED_V229122.test(text)) {
      const dated = rows.length === 1 && hasDate.length === 1 && hasDate[0] ? kakaoCardSmsExampleV229122(hasDate[0], rows[0].amount, today, true) : "";
      const own = dated ? "\n" + dated : rows.length === 1 && Number(rows[0].amount) > 0 ? "\n수입 " + Math.round(Number(rows[0].amount)) + "원" : "";
      return { kind: "notice_received", text: "받은 돈 알림으로 보이는데 쓴 돈으로 읽혀서 저장하지 않았어요.\n받은 돈이면 앞에 ‘수입’을 붙여 다시 보내 주세요." + own, quickReplies: replies };
    }
  }
  // ④ 알림 문자 꼴이거나 누적·잔액 금액이 있는 글에 날짜가 하나 적혀 있는데 다른 날로 읽혔다. 달력에 없거나 앞날인 날짜("")는 문자의 사실로 삼지 않는다.
  // 독립 검토 3: 다른 날로 읽힌 건이 글의 ‘오늘·어제·그제’ 로 설명되면 틀리게 읽힌 것이 아니다(‘11/8 08:30 택시 12000원 오늘 점심 9000원’ 은 두 건 다 맞다).
  const wordDay = (days) => { const at = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) - days)); return at.toISOString().slice(0, 10); };
  const wordDates = new Set([/오늘|금일|방금|지금/.test(text) ? wordDay(0) : "", /어제|어젯밤|전날/.test(text) ? wordDay(1) : "", /그제|그저께|엊그제/.test(text) ? wordDay(2) : ""].filter(Boolean));
  if ((noticeShape || KAKAO_NOTICE_BALANCE_V229122.test(text)) && hasDate.length === 1 && hasDate[0] && rows.some((row) => String(row.transaction_date || "") !== hasDate[0] && !wordDates.has(String(row.transaction_date || "")))) {
    const day = Number(hasDate[0].slice(5, 7)) + "월 " + Number(hasDate[0].slice(8, 10)) + "일";
    const income = rows.length === 1 && rows[0].type === "income";
    const example = rows.length === 1 ? kakaoCardSmsExampleV229122(hasDate[0], rows[0].amount, today, income) : "";
    return { kind: "notice_date", text: "문자에 적힌 날짜(" + day + ")와 다른 날로 읽혀서 저장하지 않았어요.\n" + kakaoCardSmsHowToV229122(example, income), quickReplies: replies };
  }
  return null;
}

// V22.9.126 가상 문장 점검(2026-11-16): 지금도 틀리게 저장되는 꼴 아홉 가지는 저장하지 않고 되묻는다. 읽는 규칙은 그대로 두고 꼴이 다 맞을 때만 막는다.
// 카드 승인 문자로 읽힌 기록(readCardApprovalSmsV229122 의 표식)은 보지 않는다. 금액 자리는 한 번 훑어 찾고 정규식은 범위를 정해 판정이 길이에 비례한다.
const KAKAO_GUARD_ONE_REPLY_V229126 = [["오늘기록", "오늘기록"]];
// 맨 숫자(단위 없는 수) 바로 뒤의 세는 말·단위: 이런 수는 금액으로 세지 않는다(‘2잔’·‘11시’·‘3일’·‘20%’·‘1.25L’). ‘4500인데’ 처럼 금액 뒤에 흔한 ‘인’ 은 홀로일 때만.
// 한 칸 띄운 한 글자 세는 말은 낱말이 거기서 끝날 때만(‘23000 시킴’·‘5000 주고’ 의 23000·5000 은 금액이다).
const KAKAO_GUARD_COUNTER_WORDS_V229126 = "개|명|번|회|층|박|잔|병|권|장|마리|대|살|세|등|위|호|평|시|분|초|일|월|년|주|달|차|배|판|봉|캔|통|벌|줄|건|구|팩|알|근|쪽|곡|편|부|점|단";
const KAKAO_GUARD_COUNTER_AFTER_V229126 = new RegExp(String.raw`^(?:%|퍼센트|프로|퍼|개월|명당|인분|인당|인(?![가-힣])|키로|킬로|리터|시간|학년|교시|켤레|박스|세트|포기|송이|kg|km|ml|cc|[gLl](?![A-Za-z])|${KAKAO_GUARD_COUNTER_WORDS_V229126})|^\s(?:%|퍼센트|프로|개월|인분|키로|킬로|리터|시간|학년|교시|켤레|박스|세트|포기|송이|kg|km|ml|cc|[gLl](?![A-Za-z])|(?:${KAKAO_GUARD_COUNTER_WORDS_V229126})(?:이서|이|에|씩|째|짜리|당|도|만|은|는|을|를|간|전|후|치)?(?![가-힣]))`);
function kakaoGuardMoneySpansV229126(t) {
  // 금액 자리 모두: num = 수 끝(빈칸·단위 앞), end = 빈칸·단위까지, unit = 붙은 단위(원·만·천, 한글 수는 마지막 단위 글자), money = 금액으로 셀 자리.
  const digit = (i) => i >= 0 && i < t.length && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57;
  const space = (i) => i < t.length && /\s/.test(t[i]);
  const spans = [];
  let i = 0;
  while (i < t.length) {
    if (digit(i)) {
      let e = i + 1;
      while (digit(e) || t[e] === ",") e += 1;
      if (t[e] === "." && digit(e + 1)) { e += 2; while (digit(e)) e += 1; }
      const num = e;
      while (space(e)) e += 1;
      let unit = "";
      if (e < t.length && "원만천".includes(t[e])) { unit = t[e]; e += 1; }
      // 맨 숫자 가운데 날짜·시각 조각(11/3·10:30·2026.11.07)·세는 말이 붙은 수·‘11.3’ 꼴은 금액으로 세지 않는다.
      const dateBit = ("/.:-".includes(t[i - 1] || "x") && digit(i - 2)) || ("/.:-".includes(t[num] || "x") && digit(num + 1));
      const money = !!unit || (!dateBit && !KAKAO_GUARD_COUNTER_AFTER_V229126.test(t.slice(num, num + 4)) && !/^\d{1,2}\.\d{1,2}$/.test(t.slice(i, num)));
      // like = 돈다운 수: 원·천·만(억·백)이 붙었거나 100 이상인 맨 숫자. 메뉴 뒤 수량(‘떡볶이2’)과 바로 ‘도’ 가 붙은 수(‘1도 안’)는 아니다.
      const like = money && (!!unit || /^\s?[억백]/.test(t.slice(num, num + 2)) || (Number(t.slice(i, num).replace(/,/g, "")) >= 100 && t[num] !== "도"));
      spans.push({ start: i, num, end: e, unit, money, like, dateBit });
      i = e;
    } else if (KAKAO_GUARD_HAN_NUM_V229120.includes(t[i])) {
      let r = i;
      let u = -1;
      while (r < t.length && KAKAO_GUARD_HAN_NUM_V229120.includes(t[r])) { if (KAKAO_GUARD_HAN_UNIT_V229120.includes(t[r])) u = r; r += 1; }
      if (u > i) {
        let e = u + 1;
        const num = e;
        while (space(e)) e += 1;
        let unit = t[u];
        if (t[e] === "원") { unit = "원"; e += 1; }
        spans.push({ start: i, num, end: e, unit, money: true, like: unit !== "십", dateBit: false });
        i = e;
      } else i = r;
    } else i += 1;
  }
  return spans;
}
// 큰 단위 바로 다음(붙여 쓰거나 한 칸 띄운) 자리는 앞 자리와 한 금액이다(‘1만2천원’·‘3만 5천’·‘3만 5000’).
function kakaoGuardJoinedV229126(t, a, b) {
  const gap = b.start - a.end;
  return (gap === 0 || (gap === 1 && t[a.end] === " ")) && ("만억".includes(a.unit) || (a.unit === "천" && gap === 0));
}
// 금액 꼴 수: 돈다운 자리(like)만 센다.
function kakaoGuardMoneyCountV229126(t, spans) {
  let count = 0;
  let prev = null;
  for (const span of spans) {
    if (!span.like) { prev = null; continue; }
    if (!prev || !kakaoGuardJoinedV229126(t, prev, span)) count += 1;
    prev = span;
  }
  return count;
}
// unit: 단가 금액(자리 번호 집합 marked)과 같은 조각에 2 이상의 수량이 있는지. 조각은 앞 금액·쉼표·줄바꿈 뒤부터 이 금액까지이고,
// 그 줄의 마지막 금액일 때만 줄 끝까지 본다(‘치킨 한마리 18000 콜라 2병 4000’ 의 ‘2병’ 은 다음 기록 몫이다).
function kakaoGuardUnitQtyV229126(t, spans, marked) {
  const qtyAt = [...t.matchAll(KAKAO_GUARD_QTY_ALL_V229126)].map((m) => m.index);
  const groups = [];
  spans.forEach((span, k) => {
    if (!span.like) return;
    const g = groups[groups.length - 1];
    if (g && g.last === k - 1 && kakaoGuardJoinedV229126(t, spans[k - 1], span)) { g.last = k; g.end = span.end; } else groups.push({ first: k, last: k, start: span.start, end: span.end });
  });
  let q = 0;
  for (let gi = 0; gi < groups.length; gi += 1) {
    const g = groups[gi];
    const prevEnd = gi ? groups[gi - 1].end : 0;
    let from = prevEnd;
    for (let p = g.start - 1; p >= prevEnd; p -= 1) if (t[p] === "," || t[p] === "\n") { from = p + 1; break; }
    const nextStart = gi + 1 < groups.length ? groups[gi + 1].start : t.length;
    let p = g.end;
    while (p < nextStart && t[p] !== "," && t[p] !== "\n") p += 1;
    const to = p < nextStart || gi + 1 === groups.length ? p : g.end;
    if (!marked.has(g.first) && !marked.has(g.last)) continue;
    while (q < qtyAt.length && qtyAt[q] < from) q += 1;
    if (q < qtyAt.length && qtyAt[q] < to) return true;
  }
  return false;
}
// 숫자 금액 자리의 값(‘3만’ 30000, 바로 붙은 ‘1만 2천’ 12000). 한글 수는 NaN — 값을 견줄 때만 쓴다.
function kakaoGuardSpanValueV229126(t, spans, k) {
  const one = (s) => (/\d/.test(t[s.start]) ? Number(t.slice(s.start, s.num).replace(/,/g, "")) * (s.unit === "만" ? 10000 : s.unit === "천" ? 1000 : 1) : NaN);
  const span = spans[k];
  const next = spans[k + 1];
  return one(span) + (span.unit === "만" && next && next.money && next.start - span.end <= 1 ? one(next) : 0);
}
// change: ‘거슬러’, 거스름돈·잔돈을 받거나 돌려준 말, 낸 돈 뒤의 거스름돈·잔돈(‘만원 내고 … 잔돈’)이나 영수증의 ‘받은돈’ 만 본다(‘잔돈 모아 저금’ 은 아니다).
// 거스름돈을 안 받은 말(‘잔돈은 안 받고’)은 낸 돈이 쓴 돈이다.
const KAKAO_GUARD_CHANGE_V229126 = /거슬러|(?:거스름돈?|잔돈)[^\n]{0,12}?(?:받(?!으러|으려|을)|줌|주심|주셨|줬)|받은\s?돈|(?:낸|냈|내고|내구|드렸|드림|깨서|깼)[^\n]{0,30}?(?:거스름|잔돈)/;
const KAKAO_GUARD_CHANGE_NOT_V229126 = /(?:거스름돈?|잔돈)(?:은|는|을|도)?\s?(?:안|못)\s?받/;
// range: ‘금액 ~ 금액’·‘금액에서 금액’. 물결표 뒤에 금액이 있어야 하고, 오른쪽 수에 세는 말이 붙으면(‘2~3명’·‘1~3일’) 범위가 아니다(그런 수는 money 가 아니다).
// 날짜·시각 조각(‘11/3~11/5’·‘10:00~12:00’)과 해 둘(‘2025~2026’)은 보지 않는다. ‘에서’ 꼴은 오른쪽 금액 뒤가 ‘사이·정도·쯤’ 이거나 말이 끝날 때만(‘25000에서 할인 5천’ 은 아니다).
// 단위 없는 두 수는 글에 다른 돈다운 금액이 없고 오른쪽이 더 클 때만 범위다(‘용돈 20~30 받음’ 은 범위, ‘24~25 시즌권 15만원’·‘운동화 250~255 … 89000원’ 은 아니다).
function kakaoGuardRangeV229126(t, spans) {
  const year = (span) => !span.unit && /^(?:19|20)\d\d$/.test(t.slice(span.start, span.num));
  const bare = (span) => !span.unit && /\d/.test(t[span.start]) && !/^\s?[억백]/.test(t.slice(span.num, span.num + 2));
  const value = (span) => Number(t.slice(span.start, span.num).replace(/,/g, ""));
  const likeCount = spans.filter((span) => span.like).length;
  for (let k = 0; k + 1 < spans.length; k += 1) {
    const a = spans[k];
    const b = spans[k + 1];
    if (!a.money || !b.money || (year(a) && year(b))) continue;
    if (bare(a) && bare(b) && (likeCount > Number(a.like) + Number(b.like) || !(value(b) > value(a)))) continue;
    const gap = t.slice(a.end, b.start);
    if (/^원?\s{0,2}[~〜]{1,3}\s{0,2}$/.test(gap)) return true;
    if (!/^원?\s{0,2}에서\s{0,2}$/.test(gap)) continue;
    const c = spans[k + 2];
    const end = c && c.money && "만억".includes(b.unit) && c.start - b.end <= 1 ? c.end : b.end;
    if (/^원?\s{0,2}(?:사이|정도|쯤|가량|$|[^\s가-힣])/.test(t.slice(end, end + 6))) return true;
  }
  return false;
}
// currency: 수 바로 뒤의 외화 낱말(‘30달러’·‘300엔’·‘1만엔’ — 낱말 뒤에 다른 글자가 붙은 이름 ‘100엔샵’·‘1달러샵’ 은 뺀다), 낱말 바로 뒤의 수(‘위안 300’ — 그 금액에 ‘원’ 이 붙으면
// 원화라 뺀다: ‘엔화 5만원 환전’), 기호가 붙은 수(‘$30’). 낱말이 다른 낱말의 일부인 것(‘달러구트’·‘유로스타’)과 ‘엔빵’ 은 수가 붙지 않아 걸리지 않는다.
const KAKAO_GUARD_FX_WORD_V229126 = "달러|유로|위안|엔화|파운드|바트";
const KAKAO_GUARD_FX_AFTER_V229126 = new RegExp(String.raw`^\s?(?:${KAKAO_GUARD_FX_WORD_V229126}|엔)(?:$|[^가-힣]|짜리|어치|씩|정도|쯤|가량|이|가|은|는|을|를|에|으로|로|도|만|요|임|썼|씀|결제|사용|나왔|나옴|냈|냄)`);
const KAKAO_GUARD_FX_BEFORE_V229126 = new RegExp(String.raw`(?:^|[^가-힣])(?:${KAKAO_GUARD_FX_WORD_V229126})\s?(?=[\d일이삼사오육칠팔구십백천만억])`, "g");
const KAKAO_GUARD_FX_SIGN_V229126 = /[$€£¥￥￡]\s?\d|\d\s?[$€£¥￥￡]/;
function kakaoGuardCurrencyV229126(t, spans, startAt) {
  if (KAKAO_GUARD_FX_SIGN_V229126.test(t)) return true;
  // ‘파운드’ 는 무게일 때가 있어(‘1파운드 스테이크 32000원’) 글에 원·천·만이 붙은 금액이 있으면 그 낱말은 보지 않는다.
  const won = spans.some((span) => span.like && "원천만".includes(span.unit || "x"));
  if (spans.some((span) => span.unit !== "원" && !span.dateBit && KAKAO_GUARD_FX_AFTER_V229126.test(t.slice(span.end, span.end + 6)) && !(won && /^\s?파운드/.test(t.slice(span.end, span.end + 4))))) return true;
  for (const m of t.matchAll(KAKAO_GUARD_FX_BEFORE_V229126)) {
    const span = startAt.get(m.index + m[0].length);
    if (span && span.unit !== "원" && t[span.end] !== "원") return true;
  }
  return false;
}
// discount: 할인 말이 돈다운 금액과 붙어 있고(낱말 바로 뒤 금액 ‘쿠폰 3천’·‘- 쿠폰1000’, 금액 바로 뒤 낱말 ‘5천원 쿠폰’·‘100원 할인’) 글에 금액이 둘 이상.
// ‘포인트 충전 30000’·‘쿠폰북 3000’·‘할인마트 5000’ 은 낱말이 금액과 붙지 않는다. 퍼센트(‘20%할인’)와 ‘할인 1도 없이’ 의 1 은 금액이 아니다.
const KAKAO_GUARD_DISCOUNT_WORD_V229126 = /쿠폰|할인|포인트|기프티콘|적립금|마일리지/g;
// 쿠폰·포인트를 사거나 충전한 말(‘포인트 5000원 충전하고’·‘기프티콘 5천원 선물함’·‘5천원 쿠폰 샀어’)은 쓴 돈이다.
const KAKAO_GUARD_DISCOUNT_BUY_V229126 = /^\s?(?:[\d,]{1,9}\s?(?:원|[만천]\s?원?)?|[일이삼사오육칠팔구십백천만]{1,6}\s?원?)?\s?(?:권|짜리)?\s?(?:을|를)?\s?(?:충전|선물|구매|구입|샀|삼(?![가-힣])|사서|사고|결제)/;
// unit: 금액짜리·단가 말·금액 뒤 ‘씩’ 과 2 이상의 물건 수량이 함께 있을 때(‘4500원짜리 커피 2잔’·‘빵 3개 각 3500’). ‘각티슈’·‘각자’ 는 단가 말이 아니다.
// 사람 수와 1인당 값은 내 몫일 때가 많아(‘6명이랑 1인당 3만원 냄’) 내가 다 낸 말이나 금액 둘 이상이 함께 있을 때만 본다.
// ‘짜리’ 뒤 수량에는 ‘시간’ 을 넣지 않는다(‘6만원짜리 2시간 코스’ 는 한 건이다 — 시간 값은 ‘시간당’ 일 때만 본다).
const KAKAO_GUARD_QTY_ITEM_V229126 = "개(?!월)|잔|병|장|권|마리|줄|인분|판|봉|캔|통|벌|켤레|박스|세트";
const KAKAO_GUARD_QTY_UNIT_V229126 = `${KAKAO_GUARD_QTY_ITEM_V229126}|시간`;
const KAKAO_GUARD_QTY_V229126 = new RegExp(String.raw`(?:(?<!\d)(?:[2-9]|[1-9]\d{1,2})|(?<![가-힣])(?:두|세|네))\s?(?:${KAKAO_GUARD_QTY_UNIT_V229126})(?!당|째)|(?<![가-힣])(?:둘|셋|넷)(?:한테|에게|은|는|도|만|과|와)?(?![가-힣])`);
const KAKAO_GUARD_QTY_ALL_V229126 = new RegExp(KAKAO_GUARD_QTY_V229126.source, "g");
const KAKAO_GUARD_JJARI_QTY_V229126 = new RegExp(String.raw`^\s?(?:[가-힣A-Za-z]{1,10}\s)?(?:(?:[2-9]|[1-9]\d{1,2})\s?(?:${KAKAO_GUARD_QTY_ITEM_V229126})(?!당|째)|(?:두|세|네)\s?(?:${KAKAO_GUARD_QTY_ITEM_V229126})|(?:둘|셋|넷)(?![가-힣]))`);
// ‘한마리’ 는 ‘한마리에’ 이거나 바로 앞에 ‘2마리’ 같은 수량이 있을 때만 단가 말이다(‘치킨 한마리 18000’ 은 한 마리 값).
const KAKAO_GUARD_PER_WORD_V229126 = /(?:개당|장당|병당|잔당|마리당|판당|권당|시간당|한\s?개에|하나에|한\s?마리에|(?<=(?:[2-9]|두|세|네)\s?마리\s{0,2})한\s?마리|한\s?장에|(?<![가-힣])각(?:각)?)\s?(?=[\d일이삼사오육칠팔구십백천만억])/g;
const KAKAO_GUARD_PER_PERSON_V229126 = /(?:인당|명당|한\s?사람당|한\s?명당)\s?(?=[\d일이삼사오육칠팔구십백천만억])/g;
const KAKAO_GUARD_PEOPLE_V229126 = /(?<!\d)(?:[2-9]|[1-9]\d)\s?명|(?<![가-힣])(?:둘|셋|넷|다섯|여섯)이(?:서)?(?![가-힣])/;
const KAKAO_GUARD_PAID_ALL_V229126 = /(?:내가|제가)\s?(?:다|전부|혼자|냄|냈|결제|긁|계산|쏨|쐈)|(?<![가-힣])다\s?(?:냄|냈|결제|긁|계산|들어|받)|[xX×*]\s?\d{1,2}\s?명/;
// split: 나눠 낸 말 + 금액에 내 몫 금액과 다른 금액이 함께 있거나(‘6만원 n빵함 내꺼 15000’) 사람 수가 있을 때(‘18600 셋이 나눔’).
// 사람 수도 내 몫 말도 없는 ‘회식 n빵 23000’ 은 적은 금액이 내 몫이라 그대로 저장한다(말뭉치에서 맞게 저장되던 꼴).
const KAKAO_GUARD_SPLIT_V229126 = /반띵|엔빵|[nN]빵|더치페이|더치(?=함|했|해|하|로)|뿜빠이|나눠\s?(?:냄|냈|내)|나눠서\s?냄|[nN]분의\s?1|1\s?\/\s?[nN](?![A-Za-z])/;
// 맨 ‘나눠·나누어(서)’ 는 뒤에 금액·낸 말·내 몫 말이 오거나 줄이 끝날 때만, ‘나눔’ 은 줄 끝일 때만 본다(‘나눠 먹음’·‘나눠 주려고’ 는 음식·물건을 나눈 말).
const KAKAO_GUARD_SPLIT_SOFT_V229126 = /(?:나눠|나누어)(?:서)?(?=\s{0,2}(?:$|\n|[^\s가-힣]|내(?!일|용|려)|냄|냈|낸|제가|나는|난(?![가-힣])|계산|결제|부담|정산|송금|이체|입금|보냄|보냈|했|함|하기로))|나눔(?=\s{0,2}(?:$|\n|[^\s가-힣]))/;
const KAKAO_GUARD_HEADS_V229126 = /(?<!\d)(?:[2-9]|[1-9]\d)\s?명|(?<![가-힣])(?:둘|셋|넷|다섯|여섯)(?:이서|이)?(?![가-힣])|[가-힣](?:이랑|랑|하고)\s?(?:반띵|[nN]빵|엔빵|더치|나눔|나눠)/;
const KAKAO_GUARD_MINE_BEFORE_V229126 = /(?:^|[^가-힣])(?:내\s?(?:꺼|거|것|몫|부담)|나|난|내가|제\s?(?:꺼|거|것|몫)|저|전|제가)(?:은|는|이|가|만|도)?\s?$/;
const KAKAO_GUARD_MINE_AFTER_V229126 = /^원?\s?(?:내가|제가|내\s?(?:꺼|거|몫)|나|저)(?:\s?(?:냄|냈|낸|부담))?\s{0,2}(?:$|[^\s가-힣])/;
// total_items: ‘총·합계·토탈’ 바로 뒤 금액 + 글에 금액 셋 이상(‘총무한테 30000’·‘총각네 …’ 는 바로 뒤가 금액이 아니고, 메뉴 뒤 ‘떡볶이2’ 의 2 는 금액으로 세지 않는다).
const KAKAO_GUARD_TOTAL_V229126 = /(?:^|[^가-힣])(?:총|합계|토탈)\s?(?=[\d일이삼사오육칠팔구십백천만억])/g;
// multi_date: 적힌 날이 둘 이상인데 어느 기록의 날에도 없는 날이 있으면(줄마다 다른 ‘N일’ 이 첫 날로 저장되던 알려진 한계) 되묻는다.
// ‘3일 동안’·‘7일 체험권’·‘2박3일’·‘1일 1식’ 처럼 기간·되풀이를 말하는 ‘N일’ 과 세는 말이 바로 붙은 분수(‘1/2판’·‘1/4조각’)는 날로 세지 않는다.
const KAKAO_GUARD_DAY_MENTION_V229126 = /(?<!\d)\d{1,2}\s?월\s?(\d{1,2})\s?일|(?<![\d/.])\d{1,2}\/(\d{1,2})(?![\d/]|판|조각|쪽|컵|공기|인분|개|잔|병|근|통|봉|팩|토막|줄|등분)|(?<![\d월/.~\-]|박\s?|박)(\d{1,2})\s?일(?!\s?(?:전|후|간|동안|치|분|째|마다|장|권|부터|까지|씩|이상|넘게|정도|쯤|간격|~|연속|짜리|코스|과정|복용|이용권|체험권|자유이용권|패스|정기권|사용권|\d{1,2}\s?(?:식|회|번|알|포|봉|잔|끼)))/g;
// type_conflict: 기록이 모두 한 구분인데 말에는 반대쪽 돈 움직임 말만 있을 때. ‘입금 완료·입금했’ 은 낸 돈이고(말뭉치 다섯 문장 모두 지출) ‘보냄·보냈다’ 는 받은 돈일 때가 있어 뺀다.
// 같은 쪽 말은 되묻기를 줄이는 쪽이라 넓게 보고, 앞에 ‘지출·수입’ 을 붙인 말은 보지 않는다(답의 단추가 보내는 말이 다시 막히지 않게).
const KAKAO_GUARD_ARRIVE_V229126 = /입금\s?(?:됨|됐|됬|되었)|(?<!(?<!계좌|통장)(?:에|에서|으로|로)\s?)들어(?:왔|옴)|팔았|환불\s?받(?!으러|으려|을|기|아야|으면|는)|환불\s?됨|환불\s?완료|환급\s?받(?!으러|으려|을|기|아야|으면|는)|취소\s?금액|배당금|벌었/g;
const KAKAO_GUARD_ARRIVE_REASON_V229126 = /^(?:길래|으니|으면|더니|어서|아서|[은는]?\s?(?:돈|거|걸|것)\s?(?:으로|로)|[은는]?\s?김에)/;
const KAKAO_GUARD_SPEND_V229126 = /결제\s?(?:함|했|완료)|샀(?:다|어|음)|(?<![가-힣])산\s?거|구매\s?(?:함|했)|시킴|시켰|(?<!보)냈(?:다|어|음)|지름|질렀|긁음|긁었|나감|나갔|썼(?:다|어|음)/g;
const KAKAO_GUARD_SPEND_MORE_V229126 = /입금\s?(?:했|함|완료)|송금\s?(?:했|함)|이체\s?(?:했|함)|주문\s?(?:했|함)|구입|(?<![가-힣])사서|(?<![가-힣])사고|사\s?먹|시켜|결제\s?(?:하고|해서)|긁고|질러|(?<!보)내고|(?<!보)내서|쓰고|써서|배송비|택배비|착불|설치비|배달비|배달팁/g;
const KAKAO_GUARD_ARRIVE_MORE_V229126 = /입금(?!\s?(?:했|함|완료))|들어오|들어와|들어온|정산\s?받|돌려\s?받|받(?:은|고|아서|았|음)|보내\s?(?:줌|줬|주셨|주심)|주셨|주심/g;
const KAKAO_GUARD_EXPLICIT_TYPE_V229126 = /^(?:지출|수입)(?=\s|[:：]|$)/;
// 3차 A: 낸 말의 맺는 꼴(‘냈어’·‘이체함’·‘보냄’·‘삼’). ‘산 책’ 같은 꾸밈꼴, ‘결제 취소’ 같은 이름씨, ‘냈는데’ 같은 이음꼴은 아니다.
const KAKAO_GUARD_SPEND_FINAL_V229126 = /(?:결제\s?(?:함|완료|했(?:다|어|음|습니다|지|네))|구매\s?(?:함|했(?:다|어|음|습니다|지|네))|(?:이체|송금)\s?(?:함|했(?:다|어|음|습니다|지|네))|보냄|(?<!꺼|빼)냈(?:다|어|음|습니다|지|네)|샀(?:다|어|음|습니다|지|네)|시킴|시켰(?:다|어|음|습니다|지|네)|썼(?:다|어|음|습니다|지|네)|긁음|긁었(?:다|어|음|습니다|지|네)|냄|(?<![홍인수산해고백흑미장])삼(?!\s?[\d십백천만])|(?<!말)씀)요?(?![가-힣])/g;
// 금액과 낸 말 사이에 올 수 있는 말(원·을·를·빈칸, 결제 수단 낱말 둘까지). ‘(민수가 보냄)’ 처럼 다른 사람이 낸 말은 금액에 붙지 않는다.
const KAKAO_GUARD_SPEND_GAP_V229126 = /^원?\s{0,2}(?:을|를)?\s{0,2}(?:(?:현금|카드|계좌|계좌이체|체크카드|신용카드|일시불|바로|그냥|전부|다)\s?(?:으로|로)?\s{0,2}){0,2}$/;
// 3차 B: 금액 바로 뒤(원·을·를·빈칸만 사이에 둠)의 반대쪽 말. ‘이체됨·송금받음’ 은 들어온 말, ‘들어오면·환불 안 됨’ 은 아직·아닌 말이라 뺀다.
// 5차(독립 검토): ‘결제계좌·결제대금·결제 수단’ 처럼 이름씨로 이어지는 결제는 낸 말이 아니다(‘보험금 30만원 결제계좌로 들어옴’ 은 수입이다).
// ‘들어오는 길에·들어오던 길에·들어오다가’ 는 돈이 아니라 사람이 들어오는 말이다(‘택시 15000 들어오는 길에 편의점 3500’ 은 지출 둘이다).
const KAKAO_GUARD_SPEND_CORE_V229126 = String.raw`(?:결제(?!\s{0,2}(?:취소|안|못|예정|할|해야|하면|하려|받|들어|계좌|대금|수단|내역|금액|실패|오류|한도))|사\s?먹|샀|삼(?![가-힣])|썼|씀|(?<!보)냈|냄|시킴|시켰|긁|(?:이체|송금)(?!\s{0,2}(?:받|됨|됐|되|예정|할|해야|하면|하려|취소|안|못))|보냄|보냈|나갔|나감)`;
const KAKAO_GUARD_ARRIVE_CORE_V229126 = String.raw`(?:받(?:음|았|고|아서|은)|(?:돌려|정산)\s?받(?!을|기로|아야)|들어(?:옴|왔|와|오(?!면|려|기로|다가|[는던]\s?(?:길|도중)))|입금\s?(?:됨|됐|되었)|(?:환불|환급)(?!\s{0,2}(?:안|못|불가|요청|신청|예정|해야))|벌었|벌고|지급\s?(?:됨|됐|되었))`;
const KAKAO_GUARD_AFTER_SPEND_V229126 = new RegExp(String.raw`^원?\s{0,2}(?:을|를)?\s{0,2}` + KAKAO_GUARD_SPEND_CORE_V229126);
const KAKAO_GUARD_AFTER_ARRIVE_V229126 = new RegExp(String.raw`^원?\s{0,2}(?:을|를|이|가)?\s{0,2}` + KAKAO_GUARD_ARRIVE_CORE_V229126);
// 4차: 기록마다 붙은 말을 볼 때는 ‘2만원은 받았고’·‘5000원도 냄’ 처럼 은·는·도 도 사이에 둔다.
const KAKAO_GUARD_ROW_SPEND_V229126 = new RegExp(String.raw`^원?\s{0,2}(?:을|를|은|는|도)?\s{0,2}` + KAKAO_GUARD_SPEND_CORE_V229126);
const KAKAO_GUARD_ROW_ARRIVE_V229126 = new RegExp(String.raw`^원?\s{0,2}(?:을|를|은|는|도|이|가)?\s{0,2}` + KAKAO_GUARD_ARRIVE_CORE_V229126);
const KAKAO_GUARD_TAKE_V229126 = /^원?\s{0,2}(?:을|를|은|는|도|이|가)?\s{0,2}받/;
// 3차 A·B: 보낸 말(보냄·이체·송금)의 금액 바로 앞이 남이 주어인 말(‘친구가 3만원 보냄’ — 내가 보낸 돈이 아니다), 받은 것이 서비스인 말(‘네일 6만원 받고’ — 들어온 돈이 아니다).
// 주어 꼴은 ‘떡볶이’ 같은 낱말 끝도 잡으므로 보낸 말에만 쓴다.
const KAKAO_GUARD_SEND_V229126 = /^원?\s{0,2}(?:을|를|은|는|도)?\s{0,2}(?:보냄|보냈|이체|송금)/;
const KAKAO_GUARD_OTHER_SUBJECT_V229126 = /(?:[가-힣](?:가|이)|께서|에서)\s{0,2}$/;
const KAKAO_GUARD_SERVICE_WORDS_V229126 = "마사지|네일|관리|시술|치료|진료|검사|수업|레슨|상담|커트|컷|펌|염색|케어|교육|수리|점검|강습|세차|주사|체험|강의|과외|진찰|왁싱|헤어|미용|이발|세신|스파|서비스";
const KAKAO_GUARD_SERVICE_V229126 = new RegExp(`(?:${KAKAO_GUARD_SERVICE_WORDS_V229126})\\D{0,4}$`);
// 4차(기록마다): 받은 것이 서비스인 말은 금액 앞 마디 어디에 있어도 보고(‘네일 젤 연장 6만원 받음’), 서비스 낱말도 조금 넓힌다.
const KAKAO_GUARD_SERVICE_ANY_V229126 = new RegExp(`${KAKAO_GUARD_SERVICE_WORDS_V229126}|연장|스케일링|검진|필라테스|요가|피티|PT|레이저|타투|문신|교정|피부|두피|속눈썹|반영구|태닝`, "i");
// 4차(기록마다): 붙은 말 뒤 같은 마디에 되돌린 말이 오면(‘89000원 샀다가 환불받음’·‘5만원 받은 거 갚음’) 그 기록은 되돌린 몫이라 세지 않는다.
const KAKAO_GUARD_UNDO_V229126 = /환불|환급|취소|반품|캔슬|정산|돌려\s?(?:받|줌|줬|주|드)|반납|갚|다시|도로/;
// 4차(기록마다): 보낸 말의 금액 앞 마디에 남이 주어·보낸 쪽인 말(‘엄마가 용돈 5만원 보냈음’·‘회사에서 … 이체함’)이 있으면 세지 않는다.
const KAKAO_GUARD_SENDER_V229126 = /(?:[가-힣](?:가|이)|께서|에서|한테서|에게서|로부터)(?=\s|$)/;
// 5·8차(독립 검토): 금액에 붙은 ‘결제일’(일시불 아님)에 들어온 말이 바로 이어지면(‘캐시백 3000원 결제일에 들어옴’·‘… 결제일 전에 입금됨’) 그 결제는 이름씨다.
// 토씨·때 말만 사이에 둔다. 풀이말인 결제(‘결제했는데 캐시백 들어옴’)나 다른 주어의 말(‘결제일이라 월급 들어오자마자 빠짐’)은 그대로 낸 말이다.
const KAKAO_GUARD_PAY_NOUN_V229126 = /^원?\s{0,2}(?:을|를|은|는|도)?\s{0,2}결제\s?일(?!시불)\s?(?:에|날|날에|전에|전날|당일|당일에|쯤|쯤에)?\s?(?:(?:딱|바로|미리)\s?)?(?:들어(?:옴|왔)|입금\s?(?:됨|됐|되었)|환급\s?(?:됨|됐)|지급\s?(?:됨|됐|되었))/;
// 3차 C: 정말 두 자리 원인 일이 흔한 말(봉투값·이자) 바로 뒤의 수.
const KAKAO_GUARD_SMALL_FEE_V229126 = /(?:봉투|비닐|쇼핑백|종이백|이자)(?:값|비)?\s{0,2}$/;
// ‘들어왔·들어옴·벌었’ 은 같은 줄 앞 24자 안에 금액이나 돈 말이 있을 때만 들어온 돈 말로 센다(‘택시 타고 들어옴’·‘20분 벌었다’ 는 아니다).
const KAKAO_GUARD_ARRIVE_LOOSE_V229126 = /^(?:들어(?:왔|옴)|벌었)$/;
const KAKAO_GUARD_MONEY_NEAR_V229126 = /\d{3}|\d\s?[원천만억]|[일이삼사오육칠팔구십백천만]\s?원|돈|월급|용돈|수당|급여|보너스|성과급|인센티브|이자|배당|환불|환급|청구|정산|입금|실손|월세|캐시백|[가-힣]금(?<!지금|방금|조금|소금)|[가-힣]비(?<!준비|장비)|[가-힣]료(?<!재료|음료|동료|무료|자료|완료|종료)/;
// 카드 승인 문자 표식(nlu/transaction-parser.js readCardApprovalSmsV229122 의 marked 와 같은 기준).
const KAKAO_GUARD_SMS_MARK_V229126 = /(?:누적|잔액|잔여\s{0,2}한도)\s{0,2}:?\s{0,2}[\d,]+/;
// 4차: kakaoGuardNormV229120 과 글자 자리가 같고 줄바꿈이 든 빈칸만 ‘\n’ 으로 남긴 글. 줄마다 다른 기록이라 붙은 말을 다음 줄에서 찾지 않으려고 쓴다.
function kakaoGuardNormLinesV229126(text) {
  const s = String(text || "").replace(KAKAO_GUARD_ZERO_WIDTH_V229120, "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 빈칸 줄은 한 번 훑어 한 칸으로 줄인다(이 구역 정규식의 빈칸 되풀이에는 상한을 둔다). 앞뒤 빈칸은 trim 처럼 버린다.
  let out = "";
  let gap = "";
  for (const ch of s) {
    if (/\s/.test(ch)) { gap = ch === "\n" || gap === "\n" ? "\n" : " "; continue; }
    if (gap && out) out += gap;
    gap = "";
    out += ch;
  }
  return out;
}
// 돈다운 금액 묶음(바로 붙은 ‘1만 2천’ 은 한 묶음)을 값별로 모은다. 기록 금액과 값이 같은 묶음이 하나뿐일 때만 그 기록의 금액 자리로 본다.
function kakaoGuardAmountGroupsV229126(t, spans) {
  const groups = [];
  const byValue = new Map();
  for (let k = 0; k < spans.length; k += 1) {
    if (!spans[k].like || (k > 0 && spans[k - 1].like && kakaoGuardJoinedV229126(t, spans[k - 1], spans[k]))) continue;
    let last = k;
    while (last + 1 < spans.length && spans[last + 1].like && kakaoGuardJoinedV229126(t, spans[last], spans[last + 1])) last += 1;
    const group = { at: groups.length, value: kakaoGuardSpanValueV229126(t, spans, k), start: spans[k].start, end: spans[last].end };
    groups.push(group);
    if (!Number.isFinite(group.value)) continue;
    if (!byValue.has(group.value)) byValue.set(group.value, []);
    byValue.get(group.value).push(group);
  }
  return { groups, only: (amount) => { const found = byValue.get(Number(amount)); return found && found.length === 1 ? found[0] : null; } };
}
// 금액 묶음의 앞 마디(같은 줄, 앞 금액 끝부터·20자 안)와 뒤 마디(같은 줄, 다음 금액 앞까지·30자 안). lines 는 글자 자리가 t 와 같은 글이다.
function kakaoGuardClauseV229126(lines, groups, g) {
  const before = lines.slice(Math.max(g.at > 0 ? groups[g.at - 1].end : 0, g.start - 20), g.start);
  return { lead: before.slice(before.lastIndexOf("\n") + 1), rest: lines.slice(g.end, Math.min(g.at + 1 < groups.length ? groups[g.at + 1].start : lines.length, g.end + 30)).split("\n")[0] };
}
// 금액 바로 뒤의 반대쪽 말 m(뒤 마디 rest 의 처음에서 맞은 것)을 세지 않는 경우.
// 기록마다 시험(4차, strict 아님): 되돌린 말이 같은 마디에 뒤따른다, 받은 것이 서비스다(앞 마디에 서비스 낱말), 결제일 뒤에 들어온 말이 온다(결제가 이름씨),
//  보낸 쪽이 남이다(앞 마디에 주어·보낸 쪽), 홀로 쓴 ‘이체·송금’(‘팔아서 100만원 이체’ — 누가 보냈는지 모르므로 ‘이체함·송금했’ 처럼 맺을 때만 센다).
// 3차 B(strict, 5~8차): 4차 예외를 그대로 옮기면 B 가 잡아 온 틀린 저장을 놓친다(독립 검토 네 번). 정확한 마디 꼴만 둔다 — 그 밖은 4차처럼 되묻는다.
//  지출 기록의 받은 말: 받은 것을 되돌린 말이 바로 이어지거나(‘받은 거 갚음’·‘받고 다시 돌려줌’ — KAKAO_GUARD_UNDO_GOT_V229126),
//   받은 것이 서비스일 때(kakaoGuardServiceStrictV229126 — 서비스 낱말과 금액 사이에 짧은 꾸밈 낱말·횟수만).
//  수입 기록의 낸 말: 낸 것을 되돌린 말이 바로 이어지거나(‘샀다가 환불받음’ — KAKAO_GUARD_UNDO_PAID_V229126, ‘환불 안 됨·돌려받기로 함’ 은 아님), 결제일에 들어온 말.
//  보낸 쪽(‘친구가 밥값 3만원 보냄’)은 더 보지 않는다 — 3차의 금액 바로 앞 주어 예외만 남는다(‘아이가 다니는 학원 30만원 이체함’·‘엄마가 부탁한 30만원 보냄’ 을 놓치지 않게).
function kakaoGuardFlipExceptV229126(type, lead, rest, m, strict = false) {
  const after = rest.slice(m[0].length);
  if (strict) {
    if (type === "expense") return KAKAO_GUARD_UNDO_GOT_V229126.test(after) || (KAKAO_GUARD_TAKE_V229126.test(rest) && kakaoGuardServiceStrictV229126(lead));
    return KAKAO_GUARD_UNDO_PAID_V229126.test(after) || KAKAO_GUARD_PAY_NOUN_V229126.test(rest);
  }
  if (KAKAO_GUARD_UNDO_V229126.test(after)) return true;
  if (type === "expense") return KAKAO_GUARD_TAKE_V229126.test(rest) && KAKAO_GUARD_SERVICE_ANY_V229126.test(lead);
  if (KAKAO_GUARD_PAY_NOUN_V229126.test(rest)) return true;
  if (!KAKAO_GUARD_SEND_V229126.test(rest)) return false;
  return KAKAO_GUARD_SENDER_V229126.test(lead) || (/(?:이체|송금)$/.test(m[0]) && !/^\s?(?:함|했)/.test(after));
}
// 4차: 여러 건의 기록마다, 그 금액 자리 바로 뒤(같은 줄) 말이 기록 구분과 반대인지 본다(‘알바비 40만원 받았다 … 운동화 32000원 샀다’ 가 지출·수입으로 뒤바뀐 꼴).
// 금액 자리가 없거나 바로 뒤에 말이 없으면 정하지 않는다. 예외는 3차 B 와 같고, 마디(앞 금액·줄 처음부터 다음 금액·줄 끝까지)를 넓혀 본다.
function kakaoGuardRowFlipV229126(t, spans, rows, lines) {
  if (lines.length !== t.length) return false;
  const { groups, only } = kakaoGuardAmountGroupsV229126(t, spans);
  return rows.some((row) => {
    const g = only(row.amount);
    const sense = row.type === "expense" ? KAKAO_GUARD_ROW_ARRIVE_V229126 : row.type === "income" ? KAKAO_GUARD_ROW_SPEND_V229126 : null;
    if (!g || !sense) return false;
    const { lead, rest } = kakaoGuardClauseV229126(lines, groups, g);
    const m = rest.match(sense);
    return !!m && !kakaoGuardFlipExceptV229126(row.type, lead, rest, m);
  });
}
// 4차 E: 지출 한 건인데 남(사람·곳)이 주어로 돈을 준 말이 마지막에 오는 글(‘엄마가 용돈 5만원 주심’·‘회사에서 출장비 20만원 입금해줌’)은 들어온 돈일 수 있다.
// 준 말은 맺는 꼴만 보고, 내가 주어·받는 쪽 표시(‘동생한테’·‘엄마께’)·드린 말이 있거나, 준 사람과 준 말 사이에 이음꼴(‘급하다고 해서’)·뒤에 낸 말이 오면 보지 않는다.
const KAKAO_GUARD_GIVE_V229126 = /(?:갚(?:았|음)|(?<![가-힣])(?:주심|주셨|줬|줌)|(?:쥐어|보내|넣어|돌려|쏴|(?:송금|입금|이체)\s?해)\s?(?:주심|주셨|줬|줌)|입금\s?함)(?:다|어|음|습니다|네)?요?(?![가-힣])/g;
const KAKAO_GUARD_GIVER_V229126 = /(?:엄마|아빠|어머니|아버지|어머님|아버님|부모님|할머니|할아버지|이모|고모|삼촌|숙모|이모부|고모부|큰아빠|작은아빠|큰엄마|작은엄마|누나|언니|오빠|형|형님|동생|남편|아내|와이프|신랑|남친|여친|남자친구|여자친구|애인|친구|선배|후배|동기|동료|사장님|사장|대표님|팀장님|부장님|과장님|교수님|선생님|사촌|조카|아들|딸|시어머니|시아버지|장모님|장인어른|지인|세입자|집주인|고객|손님|거래처|회사|학교|정부|나라|구청|시청|주민센터|보험사|은행|카드사|공단|교회)(?:이|가|께서|에서)(?![가-힣])/g;
// 6~8차(독립 검토): 3차 B 가 쓰는 좁은 예외(정확한 마디 꼴).
//  서비스: 받는 것이 돈일 수 없는 낱말(몸·미용·진료·수리 — ‘과외·레슨·수업·상담’ 처럼 돈을 받는 쪽일 수도 있는 낱말은 3차의 금액 바로 앞 예외에만 둔다)이 홀로 서 있고
//  (‘치료비·관리사무소’ 아님, 영문 PT 는 ‘ChatGPT’ 아님), 그 낱말과 금액 사이에는 짧은 꾸밈 낱말과 횟수가 셋까지만 있다(‘네일 젤 연장 6만원’·‘피부 관리 10회권 30만원’·‘요가 수업 1회 2만원’).
//  돈 말·사람과 곳을 가리키는 말·풀이말이 끼면(‘네일 받고 엄마한테 용돈 5만원 받음’·‘세차 아르바이트 일당 8만원 받고’·‘스케일링 보험금 5만원 받고’) 받은 것은 돈일 수 있다.
const KAKAO_GUARD_SERVICE_STRICT_V229126 = /(?:마사지|네일|관리|시술|치료|진료|검사|커트|컷|펌|염색|케어|수리|점검|세차|주사|진찰|왁싱|헤어|미용|이발|세신|스파|연장|스케일링|검진|필라테스|요가|피티|(?<![A-Za-z])PT(?![A-Za-z])|레이저|타투|문신|교정|피부|두피|속눈썹|반영구|태닝)(?![가-힣])/gi;
const KAKAO_GUARD_SERVICE_COUNT_V229126 = /^\d{1,3}(?:회권|회|분|시간|개월|주|번|차)$/;
const KAKAO_GUARD_SERVICE_PLAIN_V229126 = /^[가-힣A-Za-z]{1,4}$/;
const KAKAO_GUARD_SERVICE_NOT_PLAIN_V229126 = /돈|알바|일당|월급|급여|상여|보너스|사례|수고|환불|환급|취소|위약|보상|배상|지원|쿠폰|포인트|적립|할인|보험|실비|실손|정산|받|(?:비|금|값|료|고|서|며|면|에|로|께|이|가|은|는|을|를|도|만|한테|에게|부터)$/;
function kakaoGuardServiceStrictV229126(lead) {
  let end = -1;
  for (const m of lead.matchAll(KAKAO_GUARD_SERVICE_STRICT_V229126)) end = m.index + m[0].length;
  if (end < 0) return false;
  const words = kakaoGuardWordsV229120(lead.slice(end));
  return words.length <= 3 && words.every(({ core }) => KAKAO_GUARD_SERVICE_COUNT_V229126.test(core) || (KAKAO_GUARD_SERVICE_PLAIN_V229126.test(core) && !KAKAO_GUARD_SERVICE_NOT_PLAIN_V229126.test(core)));
}
//  되돌린 말: 풀이말 꼬리와 덧말 하나만 사이에 두고 바로 이어질 때만. 낸 것을 되돌린 말(환불·취소·돌려받음)과 받은 것을 되돌린 말(갚음·돌려줌·반납)을 가른다.
//  안 된·앞으로의 되돌림(‘환불 안 됨’·‘돌려받기로 함’·‘정산 받을 예정’)과 다른 빚을 갚는 말(‘받아서 친구 돈 갚음’)은 아니다. ‘다시·도로’ 만으로는 되돌린 말이 아니다.
const KAKAO_GUARD_UNDO_PAID_V229126 = /^[가-힣]{0,5}\s?(?:(?:바로|다시|도로|결국|전액|그냥)\s?)?(?:(?:환불|환급|취소|반품|캔슬)(?!\s{0,2}(?:안|못|불가|요청|신청|예정|해야|할|하려|하고\s?싶|받을|받기로|받아야|받으려))|(?:돌려|정산)\s?받(?!을|기로|아야|으려))/;
const KAKAO_GUARD_UNDO_GOT_V229126 = /^[가-힣]{0,2}\s?(?:거|걸|것|돈)?\s?(?:을|를|은|는)?\s?(?:(?:바로|다시|도로|결국|전액|그냥)\s?)?(?:갚(?:았|음)|돌려\s?(?:줌|줬|드림|드렸)|반납\s?(?:함|했))/;
const KAKAO_GUARD_SELF_V229126 = /(?<![가-힣])(?:내가|제가|나는|난|저는|나도|저도|우리가|저희가)(?![가-힣])/;
const KAKAO_GUARD_TO_V229126 = /(?:한테|에게|께)(?!서)/g;
const KAKAO_GUARD_HUMBLE_V229126 = /드림|드렸|드려|드릴/;
// 준 사람과 준 말 사이에 다른 풀이말(이음꼴·맺는 꼴)이 끼면 준 사람이 그 풀이말의 주어일 수 있어(‘조카가 세배함 세뱃돈 5만원 줌’) 보지 않는다.
// 다만 시키는 말(‘밥값 하라고’)은 넘기고, 높임 꼴(‘주심·주셨’)은 내가 한 일이 아니므로 사이 말을 보지 않는다. ‘빌려준·주신’ 이 끼면 준 사람이 앞서 준 돈을 내가 갚는 글이다.
const KAKAO_GUARD_LINK_V229126 = /(?:서|고|며|면|니|는데|은데|지만|자|도록|러|라|다가|해도|어도|아도|길래|더니|함|음|됨|임|다|요)$/;
// 5차: 준 사람이 나에게 주거나 대신 낸 꾸밈꼴(‘내줬던거’·‘대신 낸 거’·‘계산한 밥값’)도 같다(붙여 쓴 거·걸·것·돈까지).
// 나에게서 가져간 꼴(‘빌려간·빌렸던·꿔간·가져간’)은 준 사람이 갚는 글이라 그대로 본다.
const KAKAO_GUARD_GAVE_BEFORE_V229126 = /(?:준|주신|줬던|주던|주셨던|주시던|(?:(?<![가-힣])|대신|보)(?:낸|냈던|내던|내신|내셨던)|(?<![가-힣])(?:산|샀던|쏜|쐈던)|(?:계산|결제)(?:한|했던|하신|하셨던))(?:거|걸|것|게|건|돈)?(?:을|를|은|는|도)?$/;
// 5~8차(독립 검토): 금액이 준 말 뒤에 있을 때 묻지 않는 꼴은 하나다 — 준 것이 돈이 아닌 물건·혜택이고(준 말 바로 앞 낱말), 준 말과 금액 사이에 내가 산 것의 이름이 있다
// (‘사장님이 서비스 줌 치킨 20000원’·‘언니가 옷 줬음 세탁비 8000원’). 준 것이 돈 이름이거나(차비·용돈·장학금), 준 것을 앞에 적지 않았거나(‘아빠가 (오늘 아침에) 줌 차비 2만원’),
// 사이에 받은 길·구두점뿐이면(‘… 줌 (2만원)’·‘… 줌 현금 2만원’) 4차처럼 묻는다.
const KAKAO_GUARD_GIVE_NOT_THING_V229126 = /(?:돈|비|금|값|료|원|현금|수당|급여|월급|보너스|이자|페이)$|^(?:오늘|어제|아까|방금|지금|또|그냥|바로|갑자기|이번에|막|먼저|따로|직접|몰래|대신)$|(?:에|에서|로|으로|께|한테|에게|부터|까지|라고)$|\d/;
const KAKAO_GUARD_GIVE_ROUTE_V229126 = /^(?:현금|계좌|통장|카드|토스|카톡|카카오페이|페이|송금|이체|입금|무려|합계|겨우|고작)(?:으로|로)?$/;
// 낸 말(맺는 꼴·이음꼴·‘삼·냄·씀’)이 어느 자리 뒤에 있는지. E·F 가 함께 쓴다(준 말 자리 skip 은 빼고 본다).
function kakaoGuardSpendAfterV229126(t, at, negated, skip = null) {
  for (const re of [KAKAO_GUARD_SPEND_V229126, KAKAO_GUARD_SPEND_FINAL_V229126, KAKAO_GUARD_SPEND_MORE_V229126, KAKAO_GUARD_BUY_MORE_V229126]) {
    for (const m of t.matchAll(re)) if (m.index > at && !negated(m.index) && !(skip && m.index < skip.end && m.index + m[0].length > skip.start)) return true;
  }
  return kakaoGuardWordsV229120(t).some(({ core, start }) => start > at && /[삼냄씀]$/.test(core) && !/^[안못]/.test(core));
}
function kakaoGuardGiverV229126(t, spans, row, negated) {
  if (KAKAO_GUARD_SELF_V229126.test(t) || KAKAO_GUARD_HUMBLE_V229126.test(t)) return false;
  // 받는 쪽이 나(‘나한테·저에게·우리한테’)일 때만 넘긴다.
  for (const m of t.matchAll(KAKAO_GUARD_TO_V229126)) if (!/(?:^|[^가-힣])(?:나|저|우리|저희)$/.test((m.index >= 3 ? "" : " ") + t.slice(Math.max(0, m.index - 3), m.index))) return false;
  let give = null;
  for (const m of t.matchAll(KAKAO_GUARD_GIVE_V229126)) if (!negated(m.index)) give = m;
  if (!give) return false;
  let giver = null;
  for (const m of t.matchAll(KAKAO_GUARD_GIVER_V229126)) if (m.index < give.index) giver = m;
  // ‘입금함’ 은 ‘은행에서 적금 … 입금함’ 처럼 곳 뒤에도 내가 한 일로 흔히 쓰므로 사람 주어(이·가·께서)일 때만 본다.
  if (!giver || (/입금\s?함/.test(give[0]) && giver[0].endsWith("에서"))) return false;
  const span = { start: give.index, end: give.index + give[0].length };
  const honor = /주(?:심|셨)/.test(give[0]);
  const mid = kakaoGuardWordsV229120(t.slice(giver.index + giver[0].length, give.index));
  for (const { core } of mid) {
    if (KAKAO_GUARD_GAVE_BEFORE_V229126.test(core) || (!honor && KAKAO_GUARD_LINK_V229126.test(core) && !/(?<!이)라고$/.test(core))) return false;
  }
  if (kakaoGuardSpendAfterV229126(t, giver.index, negated, span)) return false;
  const g = kakaoGuardAmountGroupsV229126(t, spans).only(row.amount);
  if (!g || g.start <= giver.index) return false;
  if (g.end <= span.start) return true;
  const object = mid.length ? mid[mid.length - 1].core : "";
  const thing = !!object && !KAKAO_GUARD_GIVE_NOT_THING_V229126.test(object);
  const item = kakaoGuardWordsV229120(t.slice(span.end, g.start)).some(({ core }) => /^[가-힣A-Za-z]{2,}/.test(core) && !KAKAO_GUARD_GIVE_ROUTE_V229126.test(core));
  return !(thing && item);
}
// 4차 F: 수입 한 건인데 들어온 돈 말이 모두 돈의 출처·까닭 마디(‘용돈 받은 걸로’·‘월급 들어온 기념으로’·‘환불받아서’)에만 있고, 그 마디 뒤에 산 말과 기록 금액이 오는 글
// (‘… 운동화 89000원 삼’). 1차의 ‘까닭 꼬리’(지출 쪽)를 거꾸로 쓴 것이다. 마디 밖에 들어온 말이 하나라도 있으면(‘… 나머지 2만원 받음’) 보지 않는다.
const KAKAO_GUARD_SOURCE_END_V229126 = /(?:서|길래|으니|니까|니|더니|으면|면)$/;
const KAKAO_GUARD_SOURCE_NEXT_V229126 = /^\s?(?:(?:돈|거|걸|것)\s?(?:으로|로)|김에|기념(?:으로)?|날이(?:니까|라|라서|니))/;
const KAKAO_GUARD_SOURCE_GIVE_V229126 = /(?:(?<![가-힣])|보내\s?|넣어\s?)(?:주신|준)(?=\s?(?:돈|거|걸|것)\s?(?:으로|로))/g;
const KAKAO_GUARD_BUY_MORE_V229126 = /먹(?:음|었)|맞춤|맞췄/g;
function kakaoGuardSourceBuyV229126(t, spans, row, negated, moneyNear) {
  let last = -1;
  for (const re of [KAKAO_GUARD_ARRIVE_V229126, KAKAO_GUARD_ARRIVE_MORE_V229126, KAKAO_GUARD_SOURCE_GIVE_V229126]) {
    let reach = -1;
    for (const m of t.matchAll(re)) {
      if (negated(m.index) || (KAKAO_GUARD_ARRIVE_LOOSE_V229126.test(m[0]) && !moneyNear(m.index))) continue;
      // 같은 낱말 안의 다음 말은 앞에서 찾은 낱말 끝을 그대로 쓴다(긴 낱말을 거듭 훑지 않는다).
      let end = Math.max(m.index + m[0].length, reach);
      while (end < t.length && /[가-힣]/.test(t[end])) end += 1;
      reach = end;
      // 5차(독립 검토): 낱말 끝 세 글자만 본다(끝 꼴은 두 글자 이하다). 빈칸 없는 긴 한 낱말을 맞은 자리마다 처음부터 훑지 않는다.
      const tail = t.slice(Math.max(m.index, end - 3), end);
      const n = t.charCodeAt(end - 1) - 0xAC00;
      const source = KAKAO_GUARD_SOURCE_END_V229126.test(tail) || (n >= 0 && n % 28 === 4 && KAKAO_GUARD_SOURCE_NEXT_V229126.test(t.slice(end, end + 8)));
      if (!source) return false;
      last = Math.max(last, end);
    }
  }
  if (last < 0 || !kakaoGuardSpendAfterV229126(t, last, negated)) return false;
  const g = kakaoGuardAmountGroupsV229126(t, spans).only(row.amount);
  return !!g && g.start > last;
}
function kakaoGuardTypeConflictV229126(t, spans, rows, raw = "") {
  // 앞에 붙인 구분이 해석기에서 떨어져 나가 한 건이 반대 구분으로 읽힌 말(‘수입 작년에 깜빡하고 … 58000원’ → 지출)은 ‘plain’ — 단추 없이 한 건씩 다시 묻는다.
  const explicit = t.match(KAKAO_GUARD_EXPLICIT_TYPE_V229126);
  if (explicit) return rows.length === 1 && rows[0].type !== (explicit[0] === "수입" ? "income" : "expense") ? "plain" : false;
  const lines = kakaoGuardNormLinesV229126(raw);
  if (rows.length > 1 && kakaoGuardRowFlipV229126(t, spans, rows, lines)) return true;
  // 4차(한 건): 앞 규칙들이 정하지 못한 한 건에도 같은 시험을 마지막에 쓴다. 금액이 둘 이상이면 한 건이 빠진 글이라 단추 없이 묻는다.
  const single = () => (kakaoGuardRowFlipV229126(t, spans, rows, lines) ? (kakaoGuardMoneyCountV229126(t, spans) > 1 ? "plain" : true) : false);
  const type = rows[0]?.type;
  if ((type !== "income" && type !== "expense") || !rows.every((row) => row.type === type)) return false;
  // 바로 앞에 ‘안·못’(홀로 쓴 낱말이거나 붙여 쓴 첫 글자)이 오면 그 말은 세지 않는다(‘안 샀어’·‘할인 못받음’).
  const negated = (at) => {
    let p = at;
    if (p > 0 && t[p - 1] === " ") p -= 1;
    return p > 0 && (t[p - 1] === "안" || t[p - 1] === "못") && (p - 2 < 0 || !/[가-힣]/.test(t[p - 2]));
  };
  // 들어온 돈 말이 까닭·조건으로 이어지면(‘들어왔길래’·‘환불받아서’·‘환불받은 돈으로’) 그 뒤 기록은 쓴 돈일 수 있어 세지 않는다.
  const moneyNear = (at) => { const w = t.slice(Math.max(0, at - 24), at); return KAKAO_GUARD_MONEY_NEAR_V229126.test(w.slice(w.lastIndexOf("\n") + 1)); };
  const cue = (re, reason = null) => {
    for (const m of t.matchAll(re)) if (!negated(m.index) && !(reason && reason.test(t.slice(m.index + m[0].length, m.index + m[0].length + 8))) && (!KAKAO_GUARD_ARRIVE_LOOSE_V229126.test(m[0]) || moneyNear(m.index))) return true;
    return false;
  };
  const words = kakaoGuardWordsV229120(t);
  const spendEnd = words.some(({ core }, i) => {
    if (!/[삼냄씀]$/.test(core) || (i > 0 && /^[안못]$/.test(words[i - 1].core)) || /^[안못].$/.test(core)) return false;
    if (core.endsWith("삼")) return !(core.length > 1 && "홍인수산해고백흑미장".includes(core[core.length - 2]));
    return core.endsWith("냄") ? !core.endsWith("보냄") : !core.endsWith("말씀");
  });
  const spend = spendEnd || cue(KAKAO_GUARD_SPEND_V229126);
  const arrive = cue(KAKAO_GUARD_ARRIVE_V229126, type === "expense" ? KAKAO_GUARD_ARRIVE_REASON_V229126 : null) || spans.some((span) => span.like && /^원?\s?받(?:음|았)/.test(t.slice(span.end, span.end + 5)) && !negated(span.end));
  // 3차 B: 여러 건이 모두 한 구분인데 어느 돈다운 금액 바로 뒤에 반대쪽 말이 붙어 있다(‘… 15000원 결제’ 가 수입, ‘… 2만원 받고’ 가 지출).
  const opposite = type === "expense" ? KAKAO_GUARD_AFTER_ARRIVE_V229126 : KAKAO_GUARD_AFTER_SPEND_V229126;
  const lead = (span) => t.slice(Math.max(0, span.start - 12), span.start);
  // 5~7차(독립 검토): 기록마다 시험이 놓아준 글(‘속눈썹 연장 5만원 받고 커피 4500원’·‘… 패딩 89000원 샀다가 환불받음’)을 B 가 다시 막았다.
  // 3차의 좁은 예외(금액 앞 12자)는 그대로 두고, 그 뒤에 kakaoGuardFlipExceptV229126 의 strict 예외(서비스·되돌린 말·결제일)를 금액의 앞뒤 마디에서 더 본다.
  const body = lines.length === t.length ? lines : t;
  let grouped = null;
  const clauseOf = (span) => {
    if (!grouped) { const { groups } = kakaoGuardAmountGroupsV229126(t, spans); grouped = { groups, byEnd: new Map(groups.map((g) => [g.end, g])) }; }
    const g = grouped.byEnd.get(span.end);
    return g ? kakaoGuardClauseV229126(body, grouped.groups, g) : null;
  };
  const oppositeAt = (span) => {
    const rest = t.slice(span.end, span.end + 12);
    if (!opposite.test(rest)) return false;
    if (type === "expense" ? KAKAO_GUARD_TAKE_V229126.test(rest) && KAKAO_GUARD_SERVICE_V229126.test(lead(span)) : KAKAO_GUARD_SEND_V229126.test(rest) && KAKAO_GUARD_OTHER_SUBJECT_V229126.test(lead(span))) return false;
    // 반대쪽 말이 붙은 금액은 그 묶음의 마지막 조각이다. 마디에서 같은 말을 찾지 못하면(줄이 바뀐 글 등) 예전처럼 센다.
    const clause = clauseOf(span);
    const m = clause ? clause.rest.match(opposite) : null;
    return !m || !kakaoGuardFlipExceptV229126(type, clause.lead, clause.rest, m, true);
  };
  if (rows.length > 1 && spans.some((span) => span.like && oppositeAt(span))) return true;
  if (type === "expense") return (arrive && !spend && !cue(KAKAO_GUARD_SPEND_MORE_V229126)) || (rows.length === 1 && (kakaoGuardGiverV229126(t, spans, rows[0], negated) || single()));
  if (spend && !arrive && !cue(KAKAO_GUARD_ARRIVE_MORE_V229126)) return true;
  // 3차 A: 수입 한 건인데 마지막 돈 움직임 말이 돈다운 금액에 바로 붙은 낸 말의 맺는 꼴이다(‘마사지 받고 현금 8만원 냈어’ — 받은 것은 돈이 아니다).
  // 들어온 말은 꼴·부정과 상관없이 모두 세어(좁게) 그것이 뒤에 오면(‘시켰다가 환불 받음’) 그대로 둔다. 붙은 금액이 기록 금액과 다르면 단추 없이 묻는다.
  if (rows.length !== 1) return false;
  // 3차 A 가 정하지 못하면 4차 F, 그다음 한 건 시험을 본다(A 가 되묻던 글의 답은 그대로 둔다).
  const source = kakaoGuardSourceBuyV229126(t, spans, rows[0], negated, moneyNear) || single();
  let last = null;
  for (const m of t.matchAll(KAKAO_GUARD_SPEND_FINAL_V229126)) if (!negated(m.index)) last = m;
  if (!last) return source;
  for (const re of [KAKAO_GUARD_ARRIVE_V229126, KAKAO_GUARD_ARRIVE_MORE_V229126]) for (const m of t.matchAll(re)) if (m.index > last.index) return source;
  const end = last.index + last[0].length;
  let before = null;
  let after = null;
  for (const span of spans) { if (!span.like) continue; if (span.end <= last.index) before = span; else if (span.start >= end) { after = span; break; } }
  const near = before && last.index - before.end <= 40 && KAKAO_GUARD_SPEND_GAP_V229126.test(t.slice(before.end, last.index)) ? before
    : after && after.start - end <= 2 && /^\s{0,2}$/.test(t.slice(end, after.start)) ? after : null;
  if (!near || (KAKAO_GUARD_SEND_V229126.test(last[0]) && KAKAO_GUARD_OTHER_SUBJECT_V229126.test(lead(near)))) return source;
  let k = spans.indexOf(near);
  if (k > 0 && kakaoGuardJoinedV229126(t, spans[k - 1], near)) k -= 1;
  return kakaoGuardSpanValueV229126(t, spans, k) === Number(rows[0].amount) ? true : "plain";
}
// 답: skill-handler.js kakaoMixedTypeConfirmationReply 를 본뜬다(같은 글·같은 두 단추, 40자에서 자른 예시, 200자 이하이고 줄바꿈 없을 때만 단추). 그 함수가 바뀌면 함께 바꾼다.
// 빈칸 정리는 그 함수의 replace·trim 과 같은 결과를 split 으로 낸다(이 구역 정규식의 빈칸 되풀이에는 상한을 둔다).
function kakaoGuardTypeConflictReplyV229126(utterance, rows, plain = false) {
  const text = String(utterance || "").split(/\s/).filter(Boolean).join(" ");
  const buttons = text.length <= 200 && !/\n/.test(String(utterance || ""));
  // 단추 말(앞에 ‘지출’·‘수입’)이 그 구분의 같은 금액 한 건으로 읽힐 때만 단추를 준다. 여러 건(앞말이 첫 건에만 닿는다)·앞말이 떨어져 나가는 말
  // (‘수입 작년에 깜빡하고 … 58000원’ 은 지출로 읽힌다)·앞말을 붙이고도 반대로 읽힌 말·낸 금액이 기록 금액과 다른 말(plain)은 단추·통째 예시 없이 한 건씩 짧게 보내 달라고 한다.
  const sticks = (word, type) => { const got = parseMultipleTransactions(`${word} ${text}`, {}); return got.length === 1 && got[0].type === type && Number(got[0].amount) === Number(rows[0].amount); };
  if (plain || rows.length !== 1 || (buttons && (!sticks("지출", "expense") || !sticks("수입", "income")))) return { kind: "type_conflict", text: "수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.\n기록을 한 건씩, 앞에 ‘지출’ 이나 ‘수입’ 을 붙여 다시 보내 주세요.\n예: 수입 중고 자전거 15만원", quickReplies: KAKAO_GUARD_ONE_REPLY_V229126 };
  const example = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  const quickReplies = buttons ? [["지출로 기록", `지출 ${text}`], ["수입으로 기록", `수입 ${text}`]] : [];
  return { kind: "type_conflict", text: `수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.\n쓴 돈이면 ‘지출 ${example}’, 들어온 돈이면 ‘수입 ${example}’처럼 앞에 구분을 붙여 다시 보내 주세요.`, quickReplies };
}
function kakaoGuardMoreV229126(text, rows) {
  const raw = String(text || "").replace(/\r/g, "");
  if (rows.length === 1 && /승인/.test(raw) && (KAKAO_NOTICE_WEB_TAG_V229122.test(raw) || KAKAO_NOTICE_MASKED_NAME_V229122.test(raw) || KAKAO_GUARD_SMS_MARK_V229126.test(raw))) return null;
  const t = kakaoGuardNormV229120(raw);
  const spans = kakaoGuardMoneySpansV229126(t);
  if (!spans.length) return null;
  const startAt = new Map(spans.map((span) => [span.start, span]));
  const endAt = new Map();
  for (const span of spans) { endAt.set(span.end, span); if (t[span.end] === "원") endAt.set(span.end + 1, span); }
  const likeAt = (at) => { const span = startAt.get(at) || (t[at] === " " ? startAt.get(at + 1) : null); return !!span && span.like; };
  const likeBefore = (at) => { const span = endAt.get(at) || (t[at - 1] === " " ? endAt.get(at - 1) : null); return !!span && span.like; };
  // ‘금액 둘·셋 이상’ 은 돈다운 금액이나 기록 수로 센다(V22.9.126 2차: 메뉴 뒤 수량 ‘떡볶이2 김밥3’·‘할인 1도’ 를 금액으로 세어 막던 꼴).
  let count = -1;
  const amounts = () => (count >= 0 ? count : (count = Math.max(kakaoGuardMoneyCountV229126(t, spans), rows.length)));
  const ask = (kind, body) => ({ kind, text: body, quickReplies: KAKAO_GUARD_ONE_REPLY_V229126 });
  if (kakaoGuardRangeV229126(t, spans)) return ask("range", "금액이 범위로 적혀 있어서 저장하지 않았어요.\n실제로 쓴 금액 하나로 다시 보내 주세요.\n예: 택시 9500원");
  // 읽지 못한 조각(rows.unread — 답이 ‘금액을 읽지 못해 저장하지 않은 말’ 로 알린다)의 외화는 기록이 되지 않는다. 그때는 기록이 된 조각만 본다.
  const readT = Array.isArray(rows.unread) && rows.unread.length && rows.every((row) => typeof row.raw_text === "string") ? kakaoGuardNormV229120(rows.map((row) => row.raw_text).join("\n")) : t;
  const readSpans = readT === t ? spans : kakaoGuardMoneySpansV229126(readT);
  if (kakaoGuardCurrencyV229126(readT, readSpans, readT === t ? startAt : new Map(readSpans.map((span) => [span.start, span])))) return ask("currency", "원화가 아닌 금액으로 보여서 저장하지 않았어요.\n원으로 바꾼 금액으로 다시 보내 주세요.\n예: 기념품 43500원");
  if (KAKAO_GUARD_CHANGE_V229126.test(t) && !KAKAO_GUARD_CHANGE_NOT_V229126.test(t) && amounts() >= 2) return ask("change", "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요.\n실제로 쓴 금액만 다시 보내 주세요.\n예: 편의점 6800원");
  for (const m of t.matchAll(KAKAO_GUARD_DISCOUNT_WORD_V229126)) {
    const bought = KAKAO_GUARD_DISCOUNT_BUY_V229126.test(t.slice(m.index + m[0].length, m.index + m[0].length + 16));
    if ((likeAt(m.index + m[0].length) || likeBefore(m.index)) && !bought && amounts() >= 2) return ask("discount", "할인·쿠폰·포인트 금액이 함께 적혀 있어서 저장하지 않았어요.\n실제로 낸 금액만 다시 보내 주세요.\n예: 다이소 7000원");
  }
  const unitAsk = () => ask("unit", "개당 가격과 개수가 함께 적혀 있어서 저장하지 않았어요.\n합계 금액으로 다시 보내 주세요.\n예: 치킨 2마리 36000원");
  for (const m of t.matchAll(/짜리/g)) if (likeBefore(m.index) && KAKAO_GUARD_JJARI_QTY_V229126.test(t.slice(m.index + 2, m.index + 26))) return unitAsk();
  const startIndex = new Map(spans.map((span, k) => [span.start, k]));
  const likeIndexAt = (at) => { const k = startIndex.has(at) ? startIndex.get(at) : t[at] === " " && startIndex.has(at + 1) ? startIndex.get(at + 1) : -1; return k >= 0 && spans[k].like ? k : -1; };
  const marked = new Set();
  for (const m of t.matchAll(KAKAO_GUARD_PER_WORD_V229126)) { const k = likeIndexAt(m.index + m[0].length); if (k >= 0) marked.add(k); }
  const perItem = marked.size > 0;
  const perPerson = [...t.matchAll(KAKAO_GUARD_PER_PERSON_V229126)].some((m) => likeAt(m.index + m[0].length));
  const eachAt = spans.map((span, k) => (span.like && /^원?\s?씩/.test(t.slice(span.end, span.end + 3)) ? k : -1)).filter((k) => k >= 0);
  const each = eachAt.length > 0;
  for (const k of eachAt) marked.add(k);
  const splitHard = KAKAO_GUARD_SPLIT_V229126.test(t);
  const splitSoft = splitHard || KAKAO_GUARD_SPLIT_SOFT_V229126.test(t);
  if ((perItem || each) && !perPerson && kakaoGuardUnitQtyV229126(t, spans, marked)) return unitAsk();
  if ((perItem || perPerson || each) && !splitSoft && KAKAO_GUARD_PEOPLE_V229126.test(t) && (KAKAO_GUARD_PAID_ALL_V229126.test(t) || amounts() >= 2)) return unitAsk();
  if (splitSoft && spans.some((span) => span.like)) {
    const mine = [];
    spans.forEach((span, k) => { if (span.like && (KAKAO_GUARD_MINE_BEFORE_V229126.test(t.slice(Math.max(0, span.start - 8), span.start)) || KAKAO_GUARD_MINE_AFTER_V229126.test(t.slice(span.end, span.end + 6)))) mine.push(k); });
    const heads = KAKAO_GUARD_HEADS_V229126.test(t);
    // 내 몫 금액 하나만 기록으로 읽혔으면(‘12만인데 4명이 나눠서 난 3만 냄’ → 30000) 맞게 읽은 것이다.
    // 금액이 하나이고 그 뒤에 낸 말이 오면(‘반띵해서 15000 냈어’) 그 금액이 내 몫이다.
    const paid = spans.some((span) => span.like && /^원?\s?(?:씩\s?)?(?:냄|냈|내고|결제|보냄|보냈|송금|이체|입금)/.test(t.slice(span.end, span.end + 8)));
    const share = (rows.length === 1 && mine.some((k) => kakaoGuardSpanValueV229126(t, spans, k) === Number(rows[0].amount))) || (amounts() === 1 && (mine.length > 0 || each || paid));
    if ((splitHard && mine.length && amounts() >= 2 && !share) || (heads && !share)) return ask("split", "여럿이 나눠 낸 돈으로 보여서 저장하지 않았어요.\n내가 낸 금액만 다시 보내 주세요.\n예: 택시 6200원");
  }
  // 합이 맞는 총액은 해석기가 이미 빼고 내역만 읽었다(‘커피 3000 택시 8000 총 11000원’ → 두 건) — 그 꼴은 그대로 저장한다.
  const sum = rows.reduce((acc, row) => acc + Number(row.amount), 0);
  for (const m of t.matchAll(KAKAO_GUARD_TOTAL_V229126)) {
    const at = m.index + m[0].length;
    const k = startIndex.has(at) ? startIndex.get(at) : t[at] === " " && startIndex.has(at + 1) ? startIndex.get(at + 1) : -1;
    if (k < 0 || !spans[k].money || amounts() < 3) continue;
    const total = kakaoGuardSpanValueV229126(t, spans, k);
    if (rows.length >= 2 && total === sum && rows.every((row) => Number(row.amount) !== total)) continue;
    return ask("total_items", "총액과 내역이 함께 적혀 있어서 저장하지 않았어요.\n총액 하나만 보내거나 내역만 보내 주세요.\n예: 마트 43500원");
  }
  if (rows.length > 1) {
    const days = new Set();
    for (const m of t.matchAll(KAKAO_GUARD_DAY_MENTION_V229126)) { const day = Number(m[1] || m[2] || m[3]); if (day >= 1 && day <= 31) days.add(day); }
    const rowDays = new Set(rows.map((row) => Number(String(row.transaction_date || "").slice(8, 10))));
    if (days.size > 1 && [...days].some((day) => !rowDays.has(day))) return ask("multi_date", "날짜가 둘 이상 적혀 있어서 저장하지 않았어요.\n날짜가 다른 기록은 한 줄씩 보내 주세요.\n예: 11월 2일 편의점 3500원");
  }
  const conflict = kakaoGuardTypeConflictV229126(t, spans, rows, raw);
  if (conflict) return kakaoGuardTypeConflictReplyV229126(text, rows, conflict === "plain");
  // 3차 C: 10~99 로 저장될 기록의 수가 글에 원 없이만 적혀 있으면(‘10~11월 관리비’ 의 10, 개수가 금액으로 읽힌 꼴) 한 자리 금액처럼 되묻는다
  // (skill-handler.js 의 amount_unit_required 답과 같은 글). ‘사탕 50원’ 처럼 원을 붙인 수는 그대로 저장한다.
  const twoDigit = new Map();
  for (const span of spans) {
    const value = /\d/.test(t[span.start]) ? Number(t.slice(span.start, span.num).replace(/,/g, "")) : NaN;
    if (Number.isInteger(value) && value >= 10 && value <= 99) { if (!twoDigit.has(value)) twoDigit.set(value, []); twoDigit.get(value).push(span); }
  }
  // 수 하나만 적힌 말(‘편의점 봉투 50’)은 예전처럼 원으로 저장한다. 글에 돈다운 금액이 따로 있거나, 물결표에 붙었거나(‘10~11월’), 세는 말·날짜 조각인 수만 본다
  // (두 자리 맨 수는 돈다운 금액이 아니므로 ‘따로 있는 금액’ 은 돈다운 자리 아무것이다). 봉투값·이자 뒤의 수는 다른 기록도 함께 읽혔으면 그대로 둔다
  // (‘마트 45000 비닐봉투 50’ 은 두 건, ‘도시락 4500 봉투 50’ 이 50 한 건만 읽힌 것은 되묻는다).
  const anyLike = twoDigit.size > 0 && spans.some((span) => span.like);
  const fee = (span) => KAKAO_GUARD_SMALL_FEE_V229126.test(t.slice(Math.max(0, span.start - 8), span.start));
  let small = 0;
  for (const amount of new Set(rows.map((row) => Number(row.amount)))) {
    const same = twoDigit.get(amount);
    if (!same || same.some((span) => span.unit) || (rows.length > 1 && same.every(fee))) continue;
    if (anyLike || same.some((span) => !span.money || /^\s?[~〜]/.test(t.slice(span.num, span.num + 2)) || /[~〜]\s?$/.test(t.slice(Math.max(0, span.start - 2), span.start)))) { small = amount; break; }
  }
  if (small) return { kind: "small_amount", text: `금액이 ${small}원으로 읽혀 저장하지 않았어요. 정말 ${small}원이면 "${small}원"처럼 원을 붙여 다시 보내 주세요.`, quickReplies: KAKAO_GUARD_ONE_REPLY_V229126 };
  return null;
}

function kakaoRecordGuardV229120(utterance, parsedList, today = formatDate(nowKstDate())) {
  const rows = Array.isArray(parsedList) ? parsedList : [];
  if (!rows.length) return null;
  const text = String(utterance || "");
  if (text.length > KAKAO_GUARD_MAX_TEXT_V229120) return null;
  const notice = kakaoGuardNoticeV229122(text.replace(/\r/g, ""), rows, today);
  if (notice) return notice;
  if (kakaoGuardEditLikeV229120(text, rows)) return { kind: "edit", text: KAKAO_CHANGE_REQUEST_TEXT_V229120, quickReplies: [["오늘기록", "오늘기록"]] };
  const notRecord = kakaoGuardNotRecordV229120(text, rows, today);
  const browse = [["오늘기록", "오늘기록"], ["이번달요약", "이번달요약"]];
  if (notRecord === "question") {
    return { kind: "question", text: "묻는 말로 보여서 기록하지 않았어요.\n쓴 돈을 적으려면 ‘커피 4500원’처럼 보내 주세요.\n내역은 아래 ‘오늘기록’·‘이번달요약’으로 볼 수 있어요.", quickReplies: browse };
  }
  const dateWord = kakaoGuardDateLeftV229120(text, rows, today);
  if (dateWord) {
    const past = kakaoGuardShiftDateV229120(today, 3);
    return { kind: "date", text: `날짜로 보이는 ‘${dateWord}’ 부분을 읽지 못해서 저장하지 않았어요. 이대로면 날짜가 틀리게 저장돼요.\n날짜를 이렇게 적어 다시 보내 주세요.\n${past.month}월 ${past.day}일 택시 12800원\n어제 커피 4500원`, quickReplies: [["오늘기록", "오늘기록"]] };
  }
  const future = kakaoGuardFutureBareDayV229120(text, rows, today);
  if (future) {
    const prevMonth = future.month === 1 ? 12 : future.month - 1;
    // 지난달에 없는 날(10월의 ‘31일’ → 9월 31일)은 예문이 통하지 않으므로 지난달 마지막 날로 적는다.
    const prevDay = Math.min(future.day, new Date(Date.UTC(future.year, future.month - 1, 0)).getUTCDate());
    return { kind: "future", text: `‘${future.day}일’이 이번 달 ${future.day}일(${future.month}월 ${future.day}일, 아직 오지 않은 날)로 읽혀서 저장하지 않았어요.\n지난달이면 달을 붙여 다시 보내 주세요.\n${prevMonth}월 ${prevDay}일 미용실 30000원\n앞으로 낼 돈을 미리 적는 거면 ‘${future.month}월 ${future.day}일 미용실 30000원’처럼 보내 주세요.`, quickReplies: [["오늘기록", "오늘기록"]] };
  }
  if (notRecord === "plan" || notRecord === "hearsay") {
    const why = notRecord === "plan" ? "앞으로의 계획·목표로 보여서" : "다른 사람에게 들은 말로 보여서";
    return { kind: notRecord, text: `${why} 기록하지 않았어요.\n이미 쓰거나 받은 돈이면 ‘커피 4500원’처럼 보내 주세요.\n미리 적어 둘 거면 ‘내일 관리비 187000원’처럼 날짜를 붙여 주세요.`, quickReplies: browse };
  }
  return kakaoGuardMoreV229126(text, rows);
}
// 열린 수정 세션을 끝내고 기록 경로로 넘어온 말이 안전망에 걸리면 ‘새 기록으로 처리했어요’ 대신 ‘수정은 끝냈어요’ 로 알린다.
function kakaoRecordGuardReplyV229120(guard, sessionNotice = "") {
  const notice = String(sessionNotice || "").replace("수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.", "수정은 끝냈어요.");
  return kakaoText(`${notice}${guard.text}`, guard.quickReplies);
}
// @build:exports-start
export {
  armKakaoRepeatGuard, buildKakaoSkillTestPayload, checkKakaoRepeatGuard, clearKakaoInFlight,
  isKakaoFirstRecordInput, isKakaoQaPayload, isStrongKakaoTransactionInput, kakaoChangeRequestReply,
  kakaoDeferredReply, kakaoQaRequestAllowed, kakaoRecordCheckReply, kakaoRecordGuardReplyV229120,
  kakaoRecordGuardV229120, kakaoRepeatGuardText, looksLikeKakaoChangeRequest,
  looksLikeKakaoEditCommandV4, normalizeKakaoSkillResponse, optionalWithin, stripKakaoBotMention,
  stripLeadingCommand,
};
// @build:exports-end
