// @build:imports-start
import { moneyTokenSpans, transactionTypeFromText } from "../client/shared-input-parsers.js";
// @build:imports-end

function normalizeText(text) {
  return String(text || "")
    .replace(/^@[\w가-힣_-]+\s*/, "")
    .replace(/^\/+/, "")
    .replace(/[，]/g, ",")
    .replace(/[₩￦]/g, "원")
    .replace(/원정/g, "원")
    .replace(/만 원/g, "만원")
    .replace(/천 원/g, "천원")
    .replace(/처넌/g, "천원")
    .replace(/처눤/g, "천원")
    .replace(/백 원/g, "백원")
    .replace(/십 원/g, "십원")
    .replace(/[~!@#$^&*_=+\`|\\{}\[\]:;"'<>?]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function detectType(text) { return transactionTypeFromText(normalizeText(text)); }

function parseAmountValue(value) {
  if (typeof value === "number") return Math.round(value);
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
export { detectType, extractAmount, normalizeText, normalizeType, parseAmountValue };
// @build:exports-end
