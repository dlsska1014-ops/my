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
function kakaoRecordGuardV229120(utterance, parsedList, today = formatDate(nowKstDate())) {
  const rows = Array.isArray(parsedList) ? parsedList : [];
  if (!rows.length) return null;
  const text = String(utterance || "");
  if (text.length > KAKAO_GUARD_MAX_TEXT_V229120) return null;
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
  return null;
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
