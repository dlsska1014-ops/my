// @build:imports-start
import { moneyTokenSpans, transactionTypeFromText } from "../client/shared-input-parsers.js";
import { foldInputWidth, normalizeInputText } from "../client/shared-input-nlu.js";
import { CATEGORY_RULES } from "./category-rules.js";
// @build:imports-end

// V22.9.79: 거래 문장 다듬기의 본문은 화면 빠른 입력과 함께 쓰는 공유 함수(client/shared-input-nlu.js normalizeInputText)로 옮겼다.
// 이 이름은 이름·로그인 값 등 거래 문장이 아닌 곳에서도 쓰이므로 전각 숫자 변환은 하지 않는다(거래 문장 입구에서 따로 한다).
// V22.9.79 감사 E-1: 가져오기 해석 한 번 동안만 같은 글의 정규화 결과를 기억한다. 한 행의 분류·구분·결제수단 판정이 같은 글을
// 각자 다시 정규화한다(카드 표 행당 2번 중 1번, 자연어 행당 11번 중 4번이 직전과 같은 글). 범위 밖에서는 예전 그대로 매번 계산한다.
let normalizeTextScope = null;
function withNormalizeTextScope(task) {
  const outer = normalizeTextScope;
  normalizeTextScope = new Map();
  try { return task(); } finally { normalizeTextScope = outer; }
}

function normalizeText(text) {
  const scope = normalizeTextScope;
  if (scope === null || typeof text !== "string" || text.length > 600) return normalizeTextUncached(text);
  let out = scope.get(text);
  if (out === undefined) {
    out = normalizeTextUncached(text);
    if (scope.size < 4096) scope.set(text, out);
  }
  return out;
}

function normalizeTextUncached(text) {
  return normalizeInputText(text);
}

function normalizeType(value) {
  const t = normalizeText(value);
  if (!t) return "";
  if (/(수입|입금|급여|월급|받음|받았|환급|환불받|용돈받|정산받|들어옴|들어온|이자|배당|매출|상여|보너스)/.test(t)) return "income";
  if (/(지출|출금|사용|결제|구매|샀|썼|썻|냄|냈|납부|송금|이체|빠져|빠짐)/.test(t)) return "expense";
  if (/income/i.test(t)) return "income";
  if (/expense/i.test(t)) return "expense";
  return "";
}

// V22.9.77 감사 E-1: 수입 분류 낱말 검사는 정규식 하나로 한 번만 만든다. transactionTypeFromText 는 화면 자산에도 그대로
// 실리는 함수라 고치지 않는다. 그 함수가 규칙 목록으로 하는 일은 "수입 규칙의 낱말 하나가 앞은 처음·공백, 뒤는 공백·숫자·끝인
// 자리에 있는가"뿐이라, 여기서 먼저 찾은 낱말 하나만 넘겨도(없으면 빈 목록) 답이 같다. 예전에는 부를 때마다 수입 낱말 수
// (31개)만큼 RegExp 를 새로 만들어 가져오기 해석 시간의 약 4분의 1을 썼다. CATEGORY_RULES 는 실행 중에 바뀌지 않는다.
let INCOME_RULE_WORD_PATTERN = null;
function incomeRuleWordsFor(text) {
  if (!INCOME_RULE_WORD_PATTERN) {
    const words = CATEGORY_RULES.filter((rule) => rule.type === "income").flatMap((rule) => rule.words || []).map((word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    INCOME_RULE_WORD_PATTERN = new RegExp("(?:^|\\s)(" + words.join("|") + ")(?=\\s|\\d|$)");
  }
  const hit = String(text || "").trim().match(INCOME_RULE_WORD_PATTERN);
  return hit ? [{ type: "income", words: [hit[1]] }] : [];
}

function detectType(text) { const raw = normalizeText(text); return transactionTypeFromText(raw, incomeRuleWordsFor(raw)); }
// V22.9.76: { type, ambiguous } — ambiguous 는 수입 낱말과 쓰는 말이 함께 있거나 수입·지출을 둘 다 적은 문장이다.
function detectTypeDetail(text) { const raw = normalizeText(text); return transactionTypeFromText(raw, incomeRuleWordsFor(raw), { detail: true }); }

function parseAmountValue(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : 0;
  // V22.9.93 Q-21: 값 하나만 받는 칸(예산 대화·정기 폼)도 거래 문장과 같은 입구를 지난다. 안 그러면 ‘12.000’ 이 12원이다.
  const found = extractAmount(foldInputWidth(String(value)));
  return found ? found.amount : 0;
}

function extractAmount(text) { const found = moneyTokenSpans(normalizeText(text))[0]; return found ? { amount: found.amount, raw: found.raw } : null; }

// V22.9.80 T-19: 부르는 곳이 없던 옛 금액 후보 함수(collectCombinedNumericUnitCandidates·parseMixedNumericAmount·collectSimpleUnitCandidates·
// collectStandardNumberCandidates·collectKoreanNumberCandidates)와 날짜·시각 판정(isLikelyDateAround·isLikelyYearOrTime)을 지웠다. 금액은
// moneyTokenSpans(client/shared-input-parsers.js) 하나가 읽는다. parseKoreanAmount 와 그 도우미는 남겨 둔다.
function parseKoreanAmount(input) {
  let s = normalizeKoreanNumerals(String(input || "").replace(/\s+/g, ""));
  if (!s) return 0;
  let total = 0;
  const eok = s.split("억");
  if (eok.length > 1) {
    total += (eok[0] ? parseKoreanBelow10000(eok[0]) : 1) * 100000000;
    s = eok.slice(1).join("억");
  }
  const man = s.split("만");
  if (man.length > 1) {
    total += (man[0] ? parseKoreanBelow10000(man[0]) : 1) * 10000;
    s = man.slice(1).join("만");
  }
  total += parseKoreanBelow10000(s);
  return total;
}

function normalizeKoreanNumerals(s) {
  return String(s || "")
    .replace(/하나|한/g, "일")
    .replace(/둘|두/g, "이")
    .replace(/셋|세/g, "삼")
    .replace(/넷|네/g, "사")
    .replace(/다섯/g, "오")
    .replace(/여섯/g, "육")
    .replace(/일곱/g, "칠")
    .replace(/여덟/g, "팔")
    .replace(/아홉/g, "구");
}

function parseKoreanBelow10000(s) {
  if (!s) return 0;
  const digit = { 영:0, 공:0, 일:1, 이:2, 삼:3, 사:4, 오:5, 육:6, 칠:7, 팔:8, 구:9 };
  let total = 0;
  let rest = s;
  const units = [["천", 1000], ["백", 100], ["십", 10]];
  for (const [unit, value] of units) {
    const idx = rest.indexOf(unit);
    if (idx >= 0) {
      const front = rest.slice(0, idx);
      const n = front ? koreanSimpleNumber(front, digit) : 1;
      total += (n || 1) * value;
      rest = rest.slice(idx + 1);
    }
  }
  if (rest) total += koreanSimpleNumber(rest, digit);
  return total;
}

function koreanSimpleNumber(s, digit) {
  if (!s) return 0;
  let out = 0;
  for (const ch of s) {
    if (digit[ch] === undefined) continue;
    out = out * 10 + digit[ch];
  }
  return out;
}
// @build:exports-start
export {
  detectType, detectTypeDetail, extractAmount, normalizeText, normalizeType, parseAmountValue,
  withNormalizeTextScope,
};
// @build:exports-end
