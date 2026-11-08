// @build:imports-start
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
import { foldInputWidth } from "../client/shared-input-nlu.js";
import {
  detectTypeDetail, extractAmount, normalizeText, normalizeType, parseAmountValue,
} from "./amount-parser.js";
import {
  detectPaymentMethod, extractDate, normalizeDateValue, normalizePaymentMethod,
} from "./date-payment.js";
import { cleanMemo, inferCategory, normalizeCategoryName } from "./category-rules.js";
// @build:imports-end

// V22.9.63: 줄머리 목록 표식. 한 줄짜리("1. 점심 12000원")와 여러 줄 모두에서 뗀다.
const KAKAO_LIST_MARKER_PREFIX = /^(?:\d{1,2}[.)]|[-•*])\s+/;

// V22.9.94 C-3: ‘신한카드 1234 결제 5000’ 의 1234 는 카드 끝자리인데 1,234원과 5,000원 두 건으로 저장됐다.
// 결제 카드 이름(‘카드’ 한 낱말, 결제수단 표의 신한·국민·KB … 카드, 체크·신용카드) 바로 뒤에 단위 없이 홀로 쓴 네 자리 수이고, 같은 줄에 다른 금액이 있을 때만
// 카드 끝자리로 보고 뗀다(메모에도 남기지 않는다). 원화 금액은 10원 단위라 끝자리가 0 인 수는 금액으로 둔다(‘신한카드 5000 국민카드 3000’ 은 카드별 금액이다).
// 네 자리 수 뒤에 낱말이 이어질 때만이다. 다른 금액이 없거나(‘신한카드 1234’) 단위가 붙거나(‘카드 1234원’) 줄 끝이거나(‘신한카드 1234 국민카드 5678’)
// 뒤에 수나 다른 결제수단이 이어지면(‘카드 4567 현금 3000’) 예전처럼 읽는다. ‘포토카드’·‘교통카드’ 같은 물건 이름은 결제 카드가 아니다.
const AB_CARD_DIGITS_V22994 = /(^|\s)((?:(?:신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오|토스|체크|신용)+\s*)?카드)\s*\d{3}[1-9](?=\s+(?!현금|계좌|이체|\S*카드|\S*페이)[^\s\d원십백천만억.,])/gi;

function stripCardDigitsV22994(text = "") {
  return String(text || "").split(/(\r?\n)/).map((line) => {
    const stripped = line.replace(AB_CARD_DIGITS_V22994, "$1$2");
    return stripped !== line && findAmountTokenSpans(stripped).length ? stripped : line;
  }).join("");
}

function parseMultipleTransactions(text, payload) {
  // V22.9.79 A-16: 전각 숫자(“커피 ４５００”)는 입구에서 반각으로 바꿔 날짜·금액·메모가 모두 같은 글자를 읽게 한다. 저장하는 원문은 받은 그대로다.
  const original = text;
  text = stripCardDigitsV22994(foldInputWidth(text));
  const clauses = splitTransactionClauses(text);
  if (clauses.length <= 1) {
    // V22.9.63: 한 줄짜리 번호 목록("1. 점심 12000원")도 표식을 뗀 본문으로 읽는다. 예전에는 "1"이 금액으로 읽혔다.
    const one = parseTransaction(clauses.length === 1 && (clauses.dateJoined || KAKAO_LIST_MARKER_PREFIX.test(String(text || "").trim())) ? clauses[0] : text, payload, true);
    if (one.ok && one.type_confirmation) return blockedTransactionParse(mixedTypeConfirmation(one));
    return one.ok ? [{ ...one, raw_text: original }] : blockedTransactionParse(one);
  }
  const out = [];
  for (const clause of clauses) {
    const parsed = parseTransaction(clause, {}, true);
    if (parsed.message === "invalid_transaction_date" || (parsed.message === "amount_unit_required" || parsed.message === "transaction_type_confirmation_required")) return blockedTransactionParse(parsed);
    if (parsed.ok && parsed.type_confirmation) return blockedTransactionParse(mixedTypeConfirmation(parsed));
    if (parsed.ok) out.push({ ...parsed, raw_text: clause });
    // V22.9.93 Q-57: 금액을 못 읽은 조각은 저장 답에 적는다. 말없이 빠지면 나머지만 저장된 줄을 사람이 모른다(날짜만 쓴 조각은 뜻이 없어 뺀다).
    // Q-112 (독립 검토 7회차): 수가 없는 조각은 금액을 놓친 것이 아니다(‘친구랑 술 5만원’ 의 ‘친구’, 머리말 줄 ‘오늘 지출’, 쉼표 뒤 ‘국민카드’ 를 못 읽은 말로 알렸다).
    else if (clause !== extractLeadingDateHint(clause) && /\d|[십백천만억]\s*원/.test(clause)) (out.unread ||= []).push(clause);
  }
  // V22.9.93 Q-87: 앞 건들의 합을 적은 끝말(‘커피 4000 택시 8000 총 12000원’)이 한 건 더 저장돼 합계가 두 배가 됐다. 합이 정확히 맞을 때만 뺀다(‘카드 총 5000 현금 총 5000’ 은 앞 건도 총이라 두 건이다). ‘전체’·‘모두’ 는 품목일 수 있어 앞 건이 둘 이상일 때만 합이다(‘부분 염색 5만원 전체 5만원’).
  const totalWord = /^(?:총|합|합계|총합|총액|총계|총금액|총합계|총비용|도합|토탈)(?:은|는|이|가|을|를)?$/, allWord = /^(?:전체|모두|전부|합쳐서|다\s*해서)$/;
  const last = out[out.length - 1];
  const before = out.slice(0, -1);
  if (before.length && (totalWord.test(last.memo) || (before.length > 1 && allWord.test(last.memo))) && !before.some((row) => totalWord.test(row.memo) || allWord.test(row.memo)) && last.amount === before.reduce((sum, row) => sum + row.amount, 0)) out.pop();
  return out;
}

// V22.9.76 카카오 감사 1: 수입 낱말과 쓰는 말이 함께 있는 줄("월급 받아서 카드값 냈어 50만원")은 어느 쪽으로도
// 저장하지 않고 묻는다. parseTransaction 은 가져오기와 같이 쓰므로 ok 를 그대로 두고 표식만 붙이며, 카카오가 쓰는
// 이 함수만 막는다.
function mixedTypeConfirmation(parsed = {}) {
  return { message: "transaction_type_confirmation_required", reason: parsed.type_confirmation, amount: parsed.amount };
}

// V22.9.34 감사 N11: 저장하지 않은 이유를 빈 결과에 붙여 둔다. 배열로만 쓰는 호출부는 그대로 빈 목록을 본다.
function blockedTransactionParse(parsed = {}) {
  const out = [];
  if (parsed.message === "invalid_transaction_date" || (parsed.message === "amount_unit_required" || parsed.message === "transaction_type_confirmation_required")) out.blocked = { message: parsed.message, amount: Number(parsed.amount || 0), ...(parsed.reason ? { reason: parsed.reason } : {}) };
  return out;
}

// V22.9.81 U-24: 한 건 파서(extractDate → quickInputDate·resolveWeekdayPhrase)가 날짜로 읽는 말의 표. 여러 건 입력의 머리 날짜
// (extractLeadingDateHint)와 조각에 제 날짜가 있는지(hasDateHint)를 이 한 표에서 만든다. 예전에는 머리 날짜 정규식을 따로 적어 두어
// ‘지난·저번 금요일’(V22.9.78 N-12 의 주 없는 꼴)·‘모레’·‘20260731’·달 없이 쓴 ‘25일’이 빠졌고, "지난 금요일 커피 4500원 택시 8000원"의
// 택시가 오늘로 저장됐다(커피만 7월 31일). 표의 꼴은 quickInputDate 의 규칙을 그대로 옮겼다 — 그 함수는 브라우저 자산에 본문 그대로
// 실려 이 표를 부를 수 없으므로, 표의 말마다 한 건 파서와 같은 날을 읽는지는 validate-nlu-v22981 이 맞춰 본다. 두 번 앞(지지난주·
// 지지난달·저저번달)과 다가올 요일(다음·오는·이번·지난번 금요일)도 한 건 파서가 V22.9.81 부터 그 뜻으로 읽으므로 표에 둔다.
const AB_DATE_DAY_WORDS = "그끄저께|그끄제|엊그저께|엊그제|그저께|그제|어젯밤|엊저녁|어제|전날|오늘|금일|지금|방금|내일|모레";
const AB_DATE_DAY_PARTS = "아침|점심|저녁|밤|새벽|오전|오후";
const AB_DATE_MONTH_WORDS = "지지난\\s*달|저저번\\s*달|지난\\s*달|저번\\s*달|이번\\s*달|이달|다음\\s*달|담달";
const AB_DATE_YEAR_WORDS = "재작년|작년|지난\\s*해|올해|금년|내년|다음\\s*해";
// V22.9.93 Q-56: 점·슬래시·하이픈 날짜. 뒤에 글자가 붙거나(‘1.5L’·‘3.1절’·‘1.5만원’) 점·하이픈 뒤에 띄어 쓴 단위가 오면(‘1.5 만원’) 날짜가 아니다(quickInputDate 와 같은 규칙).
// 예전에는 앞 조각의 소수가 머리 날짜가 돼 ‘1.5L 콜라 2000, 커피 3000’ 의 커피가 1월 5일이 되고, 뒤 조각의 소수가 제 날짜로 보여 ‘어제 커피 4000, 택시 1.5만원’ 의 택시가 오늘이 됐다.
// Q-100: ‘원’ 뒤에 글자가 오면 낱말이다(‘7/3 원피스 3만원’, quickInputDate 와 같은 규칙).
const AB_DATE_NUMERIC = "(?!\\d{1,2}[.-]\\d{1,2}\\s+[억만천백십]+(?:\\s|$|원))\\d{1,2}[.\\/-]\\d{1,2}일?(?=\\s|$|[.,!?])(?!\\s*원(?![\\d가-힣]))";
const AB_DATE_PHRASES = [
  "(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\\s*[전후](?=\\s|$)",
  "(?:\\d{1,2}|한|두|세|네|일|이|삼|사)\\s*(?:일|주일|주|달|개월)\\s*[전후](?=\\s|$)",
  `(?:${AB_DATE_MONTH_WORDS})?\\s*말일`,
  `(?:${AB_DATE_MONTH_WORDS})\\s*\\d{1,2}일?`,
  "20\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])(?=\\s|$)",
  "20\\d{2}[.\\-/년\\s]+\\d{1,2}[.\\-/월\\s]+\\d{1,2}일?",
  `(?:(?:${AB_DATE_YEAR_WORDS})\\s*)?\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일?`,
  `(?:(?:${AB_DATE_YEAR_WORDS})\\s*)?${AB_DATE_NUMERIC}`,
  "(?:지지난\\s*주|저저번\\s*주|지난\\s*주|저번\\s*주|전주|이번\\s*주|금주|다음\\s*주|내주|지지난번|지지난|저저번|지난번|지난|저번|이번|다음|(?:돌아|다가)?오는)?\\s*[월화수목금토일]요일",
];
// 달 없이 쓴 ‘25일’은 머리 날짜로만 본다. 뒤 조각의 ‘숙박 2일’·‘주차 3일’은 기간이기도 해서 조각의 제 날짜로 보면 머리 날짜를 잃는다(예전 그대로 머리 날짜).
const AB_DATE_DAY_ONLY = "\\d{1,2}일(?=\\s|$)";
// 머리 날짜: 하루 말 바로 뒤에 때 말이 아닌 글자가 붙으면("오늘의집", "내일배움카드") 날짜가 아니다(예전 규칙 그대로, ‘모레’ 포함).
const AB_LEADING_DATE_GUARD = new RegExp(`^(?:${AB_DATE_DAY_WORDS})(?!(?:${AB_DATE_DAY_PARTS})(?:\\s|$))[가-힣A-Za-z]`);
const AB_LEADING_DATE_HINT = new RegExp(`^((?:${AB_DATE_DAY_WORDS}|${AB_DATE_PHRASES.join("|")}|${AB_DATE_DAY_ONLY})\\s*)`);
// 조각 안의 날짜: 예전부터 찾던 말(낱말 속에서도 찾았다)은 그대로 두고, 한 건 파서가 읽는데 빠져 있던 꼴(모레·20260731)은 표에서
// 그 파서와 같은 낱말 경계로 찾는다("아모레"는 날짜가 아니다). 조각이 제 날짜를 가지면 머리 날짜를 붙이지 않는다 — 붙이면 한 건 파서가
// 먼저 보는 머리 말이 조각의 날짜를 덮는다("어제 커피 4500원 모레 택시 8000원"의 택시가 어제가 됐다). 8자리 수는 달·날 꼴일 때만 날짜다(주문번호).
const AB_PIECE_DATE_HINT = new RegExp([
  "(오늘|금일|지금|방금|어제|전날|그제|그저께|엊그저께|어젯밤|엊저녁|엊그제|그끄저께|그끄제|내일|지난\\s*달|저번\\s*달|이번\\s*달|이달|다음\\s*달|담달|말일|(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\\s*[전후](?=\\s|$)|(?:^|\\s)(?:\\d{1,2}|한|두|세|네|일|이|삼|사)\\s*(?:일|주일|주|달|개월)\\s*[전후](?=\\s|$)|20\\d{2}[.\\-/년\\s]+\\d{1,2}|\\d{1,2}\\s*월\\s*\\d{1,2}|[월화수목금토일]요일)",
  `(?:^|\\s)(?:(?:${AB_DATE_DAY_WORDS})(?=(?:${AB_DATE_DAY_PARTS})?(?:\\s|$))|${AB_DATE_PHRASES.join("|")})`,
].join("|"));

function hasDateHint(text) {
  // V22.9.34 감사 N6·D4·D8: 엊그제·그끄저께, 말일, "일주일/이틀/한 달 전" 도 날짜 표현이다(quickInputDate 와 같은 말).
  return AB_PIECE_DATE_HINT.test(normalizeText(text));
}

function extractLeadingDateHint(text) {
  const t = normalizeText(text);
  if (AB_LEADING_DATE_GUARD.test(t)) return "";
  const m = t.match(AB_LEADING_DATE_HINT);
  return m ? m[1].trim() : "";
}

// V22.9.93 Q-104: 날짜만 쓴 줄은 다음 줄들의 날짜다(‘어제\n커피 4000\n오늘\n택시 8000’ 이 둘 다 어제였다).
// Q-107 (독립 검토 7·8회차): ‘N일’ 로 시작하는 조각은 운영처럼 머리 날짜를 따른다. ‘N일’ 은 기간일 수 있고(‘5일 약국 1만원\n3일 치 약값 9000’), 맨 숫자 줄도 머리 날짜가 아니다(‘택시 8000\n1.5\n커피 3000’). ‘랑’·‘하고’ 로 갈린 날 말은 날짜가 아니다(‘어제랑 똑같이 커피 4000’).
function splitTransactionClauses(text) {
  const raw = normalizeText(text);
  if (!raw) return [];
  // 접속사는 낱말 경계에서만 나눈다. 그냥 "또"로 자르면 "로또 10000"이 "로" + "10000"으로
  // 쪼개져 내용이 통째로 사라진다. 조사형(랑·하고)은 앞에 두 글자 이상 붙어 있을 때만 나눈다.
  // 숫자 사이의 쉼표는 자릿수 구분이지 문장 구분이 아니다. 그냥 나누면 "12,345원"이
  // "12" + "345원"으로 쪼개져 345원만 저장된다.
  // V22.9.63 감사(1:1 3): 줄바꿈은 normalizeText 가 공백으로 바꿔 아래 규칙의 \n 이 한 번도 쓰이지 않았다. 금액 없는 줄("커피")이
  // 다음 줄에 붙어 "커피 택시 8100원"이 됐고, "1. 점심 12000원" 같은 번호 목록은 1원으로 읽혔다. 줄을 먼저 나누고 줄머리 목록
  // 표식(1. · 2) · - · •)을 뗀 뒤, 예전 규칙을 줄마다 적용한다.
  // V22.9.93 Q-28: normalizeText 가 괄호를 지우므로 ‘2)’ 는 다듬기 전에 뗀다. 다듬은 뒤에 떼면 ‘2 커피 4000원’ 이 남아 저장되지 않았다.
  const lines = String(text || "").split(/\r?\n/).flatMap(splitAmountSemicolons).flatMap(splitInlineNumberedList).map((line) => normalizeText(line.trim().replace(KAKAO_LIST_MARKER_PREFIX, "")).trim()).filter(Boolean);
  let dateJoined = false;
  const sourceLines = lines.length ? lines : [raw];
  // V22.9.94 C-2: 첫 줄이 맨 ‘N일’ 하나뿐인 머리말 꼴(‘3일⏎커피 4000⏎5일⏎택시 8000’)이면 뒤에 오는 맨 ‘M일’ 한 줄도 다음 줄들의 날짜다.
  // 예전에는 ‘5일’ 줄이 ‘3일 5일’ 로 읽혀 택시도 3일에 저장되고 ‘3일 5일’ 을 못 읽은 말로 알렸다. 줄 전체가 ‘M일’ 일 때만이다.
  // ‘5일 택시 8000’ 처럼 낱말이 붙은 줄은 기간일 수 있어(‘5일 약국 1만원⏎3일 치 약값 9000’·‘10일 렌트 10만원⏎2일 보험 3만원’, Q-115) 예전처럼 머리 날짜를 따른다.
  // 첫 줄에 달이 있으면(‘6월 3일’) 달을 옮겨 붙일 수 없어 예전 그대로다.
  const dayHeadLine = (line) => /^(?:[1-9]|[12]\d|3[01])일$/.test(line);
  const dayHeadsOn = sourceLines.length > 1 && dayHeadLine(sourceLines[0]) && extractLeadingDateHint(raw) === sourceLines[0];
  const dayHeads = new Set();
  let produced = 0;
  const firstPass = sourceLines.flatMap((line, index) => {
    const pieces = line
    // V22.9.26: 공백이 붙은 슬래시("커피 4500 / 점심 9000")와 가운뎃점도 문장 구분이다.
    // "10/3 마트 52000" 의 날짜 슬래시는 양쪽이 붙어 있어 나누지 않는다.
    .split(/\s*(?:(?<!\d)[,，](?!\d)|[,，](?!\d)|(?<!\d)[,，]|;|；|\n|(?<=\s)\/|\/(?=\s)|·|(?<=^|\s)(?:그리고|또|추가로|다음으로)\s+|(?<=[가-힣]{2})(?:랑|하고)\s+)\s*/)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
    const joined = attachDateOnlyPieces(pieces);
    dateJoined ||= joined.length < pieces.length;
    if (dayHeadsOn && index > 0 && joined.length === 1 && dayHeadLine(line)) dayHeads.add(produced);
    produced += joined.length;
    return joined;
  });
  let datePrefix = extractLeadingDateHint(raw);
  // V22.9.93 Q-56: 머리 날짜는 ‘7월 3일’ 꼴로 붙인다. ‘7.3’ 그대로 붙이면 다음 조각의 ‘만원’ 과 이어져 7.3만 = 73,000원이 됐다.
  const carryDate = (date) => date.replace(/(^|\s)(\d{1,2})[.\/-](\d{1,2})일?$/, "$1$2월 $3일");
  const clauses = [];
  for (const [at, part] of firstPass.entries()) {
    if ((isDateOnlyPiece(part) && !raw.includes(`${part}랑 `) && !raw.includes(`${part}하고 `)) || dayHeads.has(at)) datePrefix = part;
    // V22.9.93 Q-117: 줄 전체에서 한 조각이어도 그 조각만 보면 금액이 둘일 수 있다(‘커피 5000점심 9000 택시 3000’ 의 앞 조각). 다시 나누지 않으면 뒤 금액이 메모로 사라진다.
    const pieces = splitByAmountEnds(part).flatMap(splitByAmountEnds);
    for (let piece of pieces) {
      // V22.9.81 U-24: 머리 날짜로 시작하는 조각(첫 조각)에는 다시 붙이지 않는다. 달 없는 ‘25일’은 조각 날짜 판정에 없어 두 번 붙으면 메모에 ‘25일’이 남는다.
      if (datePrefix && !hasDateHint(piece) && !`${piece} `.startsWith(`${datePrefix} `)) piece = `${carryDate(datePrefix)} ${piece}`;
      if (piece.trim()) clauses.push(piece.trim());
    }
  }
  if (dateJoined) clauses.dateJoined = true;
  return clauses;
}

// V22.9.93 Q-85: 쉼표 뒤에 날짜만 쓴 조각은 앞 조각의 날짜다(‘커피 4000, 어제’ 의 날짜를 버려 오늘로 저장됐다. 웹은 읽었다). 줄 끝 조각이면 앞 조각 모두의 날짜다(‘커피 4000, 택시 8000, 어제’).
// 맨 숫자 꼴은 기간·수량일 수 있어 잇지 않는다(‘숙박 20만원, 2일’·‘콜라 2000, 1.5’·‘쿠폰 1000, 1/2’). ‘후’ 로 끝나면 쓴 날이 아니다(‘적금 50만원, 6개월 후’, Q-120). 연도까지 쓴 세 칸은 날짜다(‘택시 8000, 26. 3. 5’). 줄이 다르면 다음 줄의 머리말일 수 있어 잇지 않는다.
function isDateOnlyPiece(piece) {
  return piece === extractLeadingDateHint(piece) && !piece.endsWith("후") && (!/^\d/.test(piece) || /^\d{1,2}\s*월|[전후]$|^\d{2,4}\s*[./\-년]\s*\d{1,2}\s*[./\-월]\s*\d{1,2}/.test(piece));
}

function attachDateOnlyPieces(pieces) {
  if (isDateOnlyPiece(pieces[0])) return pieces;
  const out = [];
  for (const piece of pieces) {
    if (out.length && isDateOnlyPiece(piece)) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  const trailing = pieces[pieces.length - 1];
  return out.length < pieces.length && isDateOnlyPiece(trailing) ? out.map((piece) => (hasDateHint(piece) ? piece : `${piece} ${trailing}`)) : out;
}

// V22.9.93 Q-59: 세미콜론은 다듬으면 지워져 다음 조각과 이어졌다(‘식사 12000; 천 원 커튼’ 이 12,000,000원). 조각마다 금액이 있을 때만 줄처럼 나눈다(‘날짜=2026-09-02; 금액=12000; 메모=점심’ 은 한 건이다).
function splitAmountSemicolons(line = "") {
  const parts = line.split(/[;；]/);
  return parts.length > 1 && parts.every((part) => findAmountTokenSpans(part).length) ? parts : [line];
}

// V22.9.93 Q-53: 한 줄로 이어 쓴 번호 목록을 줄로 나눈다. ‘1. 김밥 1만 2. 떡볶이 4천원’ 의 ‘1만 2’ 가 10,002원이 됐고, ‘1. 김밥 1만원 2. 떡볶이 4천원’ 은 저장되지 않았다.
// 1번으로 시작해 같은 표식의 다음 번호가 차례로 이어질 때만 목록이다(문장 속 ‘2.’ 하나로는 나누지 않는다). 나눈 줄은 다시 접는다(‘1. 커피 4000 2. 12. 25 점심 9000’ 의 날짜가 줄 가운데라 12원·25원 두 건이 됐다).
function splitInlineNumberedList(line = "") {
  const mark = /^\s*1([.)])\s/.exec(line)?.[1];
  if (!mark) return [line];
  const parts = [];
  let from = 0;
  for (let next = 2; next <= 20; next += 1) {
    const at = line.indexOf(` ${next}${mark} `, from);
    if (at < 0) break;
    parts.push(line.slice(from, at));
    from = at + 1;
  }
  parts.push(line.slice(from));
  return parts.length > 1 ? parts.map((part) => foldInputWidth(part)) : parts;
}

// V22.9.93 Q-47: 금액 뒤에서 나눈 조각의 머리에 이음말·부호가 남아 메모가 ‘과 점심’·‘+ 점심’ 이었다. Q-81 의 끝맺음(‘커피 4000에 빵 3000’)도 같다.
// V22.9.93 Q-76: 금액으로 시작해 낱말로 끝나는 줄은 금액 앞에서 나눈다. ‘4000 커피 5000 라면’ 이 4,000원 기타지출과 5,000원 ‘커피 라면’ 이 됐다. 낱말로 끝나지 않거나(‘5000 커피 4000’) 금액 사이에 날짜가 있으면(날짜가 뒤 금액의 것이다) 예전대로 읽는다.
function splitByAmountEnds(text) {
  const t = normalizeText(text);
  const spans = findAmountTokenSpans(t);
  if (spans.length <= 1) return [t];
  const head = t.slice(0, spans[0].start).trim();
  const dated = spans.slice(1).some((span, i) => hasDateHint(t.slice(spans[i].end, span.start)));
  if ((!head || head === extractLeadingDateHint(t)) && !dated && t.slice(spans[spans.length - 1].end).trim()) {
    return spans.map((span, i) => t.slice(i ? span.start : 0, i + 1 < spans.length ? spans[i + 1].start : t.length).trim());
  }
  const out = [];
  let start = 0;
  for (let i = 0; i < spans.length; i++) {
    const end = spans[i].end;
    const part = t.slice(start, end).replace(i ? /^\s*(?:(?:과|와|랑|이랑|하고|및|에|이고|이며|이요|요|이에요|예요|입니다|임|정도|쯤|가량)\s+|[.+\-–—ㅡ&|]+\s*)/ : "", "").trim();
    if (part) out.push(part);
    start = end;
  }
  const tail = t.slice(start).trim();
  if (tail) {
    if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${tail}`.trim();
    else out.push(tail);
  }
  return out;
}

function findAmountTokenSpans(text) { return moneyTokenSpans(normalizeText(text)); }

// V22.9.93: 점 자릿수 판정은 줄 전체를 봐야 한다(foldInputWidth 머리말). 입구에서 이미 접은 절은 folded 로 넘겨 다시 판정하지 않는다.
function parseTransaction(text, payload, folded = false) {
  const raw = normalizeText(foldInputWidth(text, folded));
  const params = extractKakaoParams(payload);
  const entityType = normalizeType(params.type || params.transaction_type || params.거래구분 || params.구분);
  const typeDetail = entityType ? null : detectTypeDetail(raw);
  const type = entityType || typeDetail.type;
  if (!entityType && /(?:결제|승인)\s*취소/.test(raw) && !/(?:^|\s)(?:수입|지출)(?=\s|$)/.test(raw)) return {ok:false,message:"transaction_type_confirmation_required"};

  const entityAmountValue = params.amount || params.amount_text || params.금액;
  const amountInfo = entityAmountValue ? { amount: parseAmountValue(entityAmountValue), raw: String(entityAmountValue) } : extractAmount(raw);
  if (!amountInfo || !Number.isFinite(amountInfo.amount) || amountInfo.amount <= 0) {
    return { ok: false, message: amountFailText() };
  }
  // V22.9.34 감사 N11: 단위 없는 한 자리 숫자("택시 7", "5")를 1~9원 지출로 저장하지 않고 다시 묻는다.
  if (!entityAmountValue && amountInfo.amount < 10 && !/[원십백천만억]/.test(String(amountInfo.raw || ""))) {
    return { ok: false, message: "amount_unit_required", amount: Math.round(amountInfo.amount) };
  }

  const entityDateValue = params.date || params.transaction_date || params.날짜 || params.일자;
  const transactionDate = entityDateValue ? normalizeDateValue(entityDateValue) : extractDate(raw);
  if (!transactionDate) return {ok:false, message:"invalid_transaction_date"};
  const paymentMethod = normalizePaymentMethod(params.payment_method || params.payment || params.결제수단 || params.수단) || detectPaymentMethod(raw);
  const explicitCategory = normalizeCategoryName(params.category || params.카테고리 || params.분류, type);
  const category = explicitCategory || inferCategory(raw, type);
  const entityMemo = params.memo || params.description || params.메모 || params.내용;
  const memo = entityMemo ? cleanMemo(String(entityMemo), amountInfo.raw, type, paymentMethod, category) : cleanMemo(raw, amountInfo.raw, type, paymentMethod, category);

  return {
    ok: true,
    type,
    amount: Math.round(amountInfo.amount),
    category,
    memo,
    payment_method: paymentMethod,
    transaction_date: transactionDate,
    ...(typeDetail && typeDetail.ambiguous ? { type_confirmation: "mixed_cues" } : {}),
  };
}

function amountFailText() {
  return [
    "금액을 같이 보내주시면 바로 기록할 수 있어요.",
    "",
    "예시:",
    "점심 12000원 국민카드",
    "커피 4천5백원 현금",
    "마트 3만원 삼성페이",
    "지난달 25일 월세 80만원",
    "월급 250만원",
  ].join("\n");
}

function extractKakaoParams(payload) {
  const out = Object.create(null);
  const sources = [payload?.action?.params, payload?.action?.detailParams, payload?.params, payload?.detailParams];
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const key of Object.keys(src)) {
      const value = unwrapKakaoParam(src[key]);
      if (value !== undefined && value !== null && String(value).trim() !== "") out[key] = value;
    }
  }
  return out;
}

function unwrapKakaoParam(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(unwrapKakaoParam).filter(Boolean).join(" ");
  if (typeof value === "object") {
    if (value.value !== undefined) return value.value;
    if (value.origin !== undefined) return value.origin;
    if (value.resolved !== undefined) return value.resolved;
    if (value.groupName !== undefined) return value.groupName;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  return String(value);
}
// @build:exports-start
export {
  extractLeadingDateHint, findAmountTokenSpans, hasDateHint, parseMultipleTransactions,
  parseTransaction,
};
// @build:exports-end
