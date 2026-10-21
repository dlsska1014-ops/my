// @build:imports-start
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
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

function parseMultipleTransactions(text, payload) {
  const clauses = splitTransactionClauses(text);
  if (clauses.length <= 1) {
    // V22.9.63: 한 줄짜리 번호 목록("1. 점심 12000원")도 표식을 뗀 본문으로 읽는다. 예전에는 "1"이 금액으로 읽혔다.
    const one = parseTransaction(clauses.length === 1 && KAKAO_LIST_MARKER_PREFIX.test(String(text || "").trim()) ? clauses[0] : text, payload);
    if (one.ok && one.type_confirmation) return blockedTransactionParse(mixedTypeConfirmation(one));
    return one.ok ? [{ ...one, raw_text: text }] : blockedTransactionParse(one);
  }
  const out = [];
  for (const clause of clauses) {
    const parsed = parseTransaction(clause, {});
    if (parsed.message === "invalid_transaction_date" || (parsed.message === "amount_unit_required" || parsed.message === "transaction_type_confirmation_required")) return blockedTransactionParse(parsed);
    if (parsed.ok && parsed.type_confirmation) return blockedTransactionParse(mixedTypeConfirmation(parsed));
    if (parsed.ok) out.push({ ...parsed, raw_text: clause });
  }
  return out;
}

// V22.9.75 카카오 감사 1: 수입 낱말과 쓰는 말이 함께 있는 줄("월급 받아서 카드값 냈어 50만원")은 어느 쪽으로도
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

function hasDateHint(text) {
  const t = normalizeText(text);
  // V22.9.34 감사 N6·D4·D8: 엊그제·그끄저께, 말일, "일주일/이틀/한 달 전" 도 날짜 표현이다(quickInputDate 와 같은 말).
  return /(오늘|금일|지금|방금|어제|전날|그제|그저께|엊그저께|어젯밤|엊저녁|엊그제|그끄저께|그끄제|내일|지난\s*달|저번\s*달|이번\s*달|이달|다음\s*달|담달|말일|(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*[전후](?=\s|$)|(?:^|\s)(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*[전후](?=\s|$)|20\d{2}[.\-/년\s]+\d{1,2}|\d{1,2}\s*월\s*\d{1,2}|\d{1,2}[.\/-]\d{1,2}|[월화수목금토일]요일)/.test(t);
}

function extractLeadingDateHint(text) {
  const t = normalizeText(text);
  if (/^(?:오늘|금일|지금|방금|어제|전날|그제|그저께|엊그저께|어젯밤|엊저녁|엊그제|그끄저께|그끄제|내일)(?!(?:아침|점심|저녁|밤|새벽|오전|오후)(?:\s|$))[가-힣A-Za-z]/.test(t)) return "";
  const m = t.match(/^((오늘|금일|지금|방금|어제|전날|그제|그저께|엊그저께|어젯밤|엊저녁|엊그제|그끄저께|그끄제|내일|(?:지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주)?\s*[월화수목금토일]요일|(?:지난\s*달|저번\s*달|이번\s*달|이달|다음\s*달|담달)?\s*말일|지난\s*달\s*\d{1,2}일?|저번\s*달\s*\d{1,2}일?|이번\s*달\s*\d{1,2}일?|이달\s*\d{1,2}일?|다음\s*달\s*\d{1,2}일?|담달\s*\d{1,2}일?|(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*[전후](?=\s|$)|(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*[전후](?=\s|$)|20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?|(?:(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일?|(?:(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*)?\d{1,2}[.\/-]\d{1,2})\s*)/);
  return m ? m[1].trim() : "";
}

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
  const lines = String(text || "").split(/\r?\n/).map((line) => normalizeText(line).replace(KAKAO_LIST_MARKER_PREFIX, "").trim()).filter(Boolean);
  const firstPass = (lines.length ? lines : [raw]).flatMap((line) => line
    // V22.9.26: 공백이 붙은 슬래시("커피 4500 / 점심 9000")와 가운뎃점도 문장 구분이다.
    // "10/3 마트 52000" 의 날짜 슬래시는 양쪽이 붙어 있어 나누지 않는다.
    .split(/\s*(?:(?<!\d)[,，](?!\d)|[,，](?!\d)|(?<!\d)[,，]|;|；|\n|(?<=\s)\/|\/(?=\s)|·|(?<=^|\s)(?:그리고|또|추가로|다음으로)\s+|(?<=[가-힣]{2})(?:랑|하고)\s+)\s*/)
    .map((x) => String(x || "").trim())
    .filter(Boolean));
  const datePrefix = extractLeadingDateHint(raw);
  const clauses = [];
  for (const part of firstPass) {
    const pieces = splitByAmountEnds(part);
    for (let piece of pieces) {
      if (datePrefix && !hasDateHint(piece)) piece = `${datePrefix} ${piece}`;
      if (piece.trim()) clauses.push(piece.trim());
    }
  }
  return clauses;
}

function splitByAmountEnds(text) {
  const t = normalizeText(text);
  const spans = findAmountTokenSpans(t);
  if (spans.length <= 1) return [t];
  const out = [];
  let start = 0;
  for (let i = 0; i < spans.length; i++) {
    const end = spans[i].end;
    const part = t.slice(start, end).trim();
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

function parseTransaction(text, payload) {
  const raw = normalizeText(text);
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
export { extractLeadingDateHint, hasDateHint, parseMultipleTransactions, parseTransaction };
// @build:exports-end
