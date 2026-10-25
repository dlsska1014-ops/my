// @build:imports-start
import { moneyTokenSpans, transactionTypeFromText } from "../client/shared-input-parsers.js";
import { normalizeInputText } from "../client/shared-input-nlu.js";
import { CATEGORY_RULES } from "./category-rules.js";
// @build:imports-end

// V22.9.79: 거래 문장 다듬기의 본문은 화면 빠른 입력과 함께 쓰는 공유 함수(client/shared-input-nlu.js normalizeInputText)로 옮겼다.
// 이 이름은 이름·로그인 값 등 거래 문장이 아닌 곳에서도 쓰이므로 전각 숫자 변환은 하지 않는다(거래 문장 입구에서 따로 한다).
function normalizeText(text) {
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
  const found = extractAmount(String(value));
  return found ? found.amount : 0;
}

function extractAmount(text) { const found = moneyTokenSpans(normalizeText(text))[0]; return found ? { amount: found.amount, raw: found.raw } : null; }

function collectCombinedNumericUnitCandidates(text, candidates) {
  let m;
  // 1억2천, 1억 2500만, 1만5천원, 3만 5천, 10만5000원, 2.5만원
  const re = /((?:\d+(?:\.\d+)?\s*(?:억|만|천|백|십)\s*)+(?:\d{3,4})?)\s*원?/g;
  while ((m = re.exec(text))) {
    const raw = m[0].trim();
    const body = m[1].trim();
    if (!raw || !body) continue;
    if (!/[억만천백십]/.test(body)) continue;
    const amount = parseMixedNumericAmount(body);
    if (amount > 0) candidates.push({ raw, amount, index: m.index });
  }
}

function parseMixedNumericAmount(body) { return moneyTokenSpans(body)[0]?.amount || 0; }

function collectSimpleUnitCandidates(text, candidates) {
  let m;
  const re = /(\d+(?:\.\d+)?)\s*(억원|억|만원|만|천원|천|백원|백|십원|십|원)/g;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    let amount = n;
    const unit = m[2];
    if (unit === "억원" || unit === "억") amount *= 100000000;
    else if (unit === "만원" || unit === "만") amount *= 10000;
    else if (unit === "천원" || unit === "천") amount *= 1000;
    else if (unit === "백원" || unit === "백") amount *= 100;
    else if (unit === "십원" || unit === "십") amount *= 10;
    candidates.push({ raw: m[0], amount, index: m.index });
  }
}

function collectStandardNumberCandidates(text, candidates) {
  let m;
  const re = /([0-9]+(?:,[0-9]{3})+|[0-9]{4,})(?:\s*원)?/g;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const numeric = Number(String(m[1]).replace(/,/g, ""));
    if (!Number.isFinite(numeric)) continue;
    candidates.push({ raw, amount: numeric, index: m.index });
  }
}

function collectKoreanNumberCandidates(text, candidates) {
  let m;
  const koreanDigits = "일이삼사오육칠팔구십백천만억영공한두세네다섯여섯일곱여덟아홉하나둘셋넷";
  const reWithWon = new RegExp("([" + koreanDigits + "]+)\\s*원", "g");
  while ((m = reWithWon.exec(text))) {
    const amount = parseKoreanAmount(m[1]);
    if (amount > 0) candidates.push({ raw: m[0], amount, index: m.index });
  }
  const reNoWon = new RegExp("([" + koreanDigits + "]{2,}(?:억|만|천|백|십)[" + koreanDigits + "]*)", "g");
  while ((m = reNoWon.exec(text))) {
    const amount = parseKoreanAmount(m[1]);
    if (amount > 0) candidates.push({ raw: m[0], amount, index: m.index });
  }
}

function isLikelyDateAround(text, index, raw) {
  const before = text.slice(Math.max(0, index - 8), index);
  const after = text.slice(index + raw.length, index + raw.length + 8);
  const r = String(raw || "").trim();
  if (!r) return true;
  if (/년|월|일/.test(r) && !/원|만|천|백|십|억/.test(r)) return true;
  if (/[\-/.]$/.test(before) || /^[\-/.]/.test(after)) return true;
  if (/(지난달|저번달|이번달|이달|다음달|\d월\s*)$/.test(before) && /^일?/.test(after)) return true;
  if (/월\s*$/.test(before) || /^\s*일/.test(after)) return true;
  if (/^\d{1,2}$/.test(r.replace(/,/g, "")) && /일/.test(after)) return true;
  return false;
}

function isLikelyYearOrTime(text, index, raw) {
  const before = text.slice(Math.max(0, index - 4), index);
  const after = text.slice(index + raw.length, index + raw.length + 4);
  const n = Number(String(raw).replace(/[^0-9]/g, ""));
  if (/^20\d{2}$/.test(String(n)) && /년/.test(after)) return true;
  if (/시|분/.test(after) && !/원|만|천/.test(raw)) return true;
  if (/오전|오후/.test(before) && /시/.test(after)) return true;
  return false;
}

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
};
// @build:exports-end
