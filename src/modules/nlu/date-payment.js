// @build:imports-start
import { explicitDateIntent, quickInputDate } from "../client/shared-input-parsers.js";
import { hasDateHint } from "./transaction-parser.js";
import { normalizeText } from "./amount-parser.js";
// @build:imports-end

function normalizeDateValue(value) {
  const strict = parseDateStrict(value);
  if (strict) return strict;
  if (!hasDateHint(value)) return "";
  return extractDate(value);
}

function parseDateStrict(value) {
  let t = String(value || "").trim();
  if (!t) return "";
  t = t.replace(/\ufeff/g, "").replace(/^["']|["']$/g, "").trim();
  if (!t) return "";

  // Excel serial date, including decimal format like 45568.0
  if (/^\d{5}(?:\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (serial >= 30000 && serial <= 70000) return excelSerialDate(serial);
  }

  // 20260618 or 260618
  let m = t.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (m) return safeYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) return safeYmd(2000 + Number(m[1]), Number(m[2]), Number(m[3]));

  // ISO / datetime / Korean / dotted / dashed
  m = t.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return safeYmd(Number(m[1]), Number(m[2]), Number(m[3]));

  // YY-MM-DD, YY.MM.DD, YY/MM/DD
  m = t.match(/^(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?:\s|$)/);
  if (m) return safeYmd(2000 + Number(m[1]), Number(m[2]), Number(m[3]));

  // MM/DD/YYYY or MM-DD-YYYY
  m = t.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(20\d{2})(?:\s|$)/);
  if (m) return safeYmd(Number(m[3]), Number(m[1]), Number(m[2]));

  // M/D/YY or M-D-YY as SheetJS often formats Excel date cells like 1/1/26.
  m = t.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{2})(?:\s|$)/);
  if (m) return safeYmd(2000 + Number(m[3]), Number(m[1]), Number(m[2]));

  // Korean month/day without year, only when clearly a date cell
  m = t.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (m) {
    const now = nowKstDate();
    return safeYmd(now.getFullYear(), Number(m[1]), Number(m[2]));
  }

  return "";
}

function parseExplicitDateFromText(text) {
  const raw = normalizeText(text);
  if (!raw) return "";
  let d = parseDateStrict(raw);
  if (d) return d;

  const now = nowKstDate();
  if (/그저께|그제/.test(raw)) return formatDate(addDays(now, -2));
  if (/어제|전날/.test(raw)) return formatDate(addDays(now, -1));
  if (/내일/.test(raw)) return formatDate(addDays(now, 1));
  if (/오늘|금일|지금|방금/.test(raw)) return formatDate(now);
  const weekdayDate = resolveWeekdayPhrase(raw, now);
  if (weekdayDate) return weekdayDate;

  let m = raw.match(/(\d{1,2})\s*일\s*전/);
  if (m) return formatDate(addDays(now, -Number(m[1])));
  m = raw.match(/(\d{1,2})\s*주\s*전/);
  if (m) return formatDate(addDays(now, -Number(m[1]) * 7));
  m = raw.match(/(?:지난|저번)\s*달\s*(\d{1,2})일?/);
  if (m) return safeYmd(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 12 : now.getMonth(), Number(m[1]));
  m = raw.match(/(?:이번\s*달|이달)\s*(\d{1,2})일?/);
  if (m) return safeYmd(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
  m = raw.match(/(?:다음\s*달|담달)\s*(\d{1,2})일?/);
  if (m) return safeYmd(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), now.getMonth() === 11 ? 1 : now.getMonth() + 2, Number(m[1]));
  m = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return safeYmd(now.getFullYear(), Number(m[1]), Number(m[2]));
  return "";
}

function safeYmd(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
  return formatDate(dt);
}

function excelSerialDate(serial) {
  const utc = Date.UTC(1899, 11, 30) + Math.floor(Number(serial)) * 86400000;
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function extractDate(text) {
  const raw = normalizeText(text), now = nowKstDate();
  const date = quickInputDate(raw,formatDate(now));
  if (date) return date;
  if (explicitDateIntent(raw)) return "";
  const weekday = resolveWeekdayPhrase(raw,now);
  if (weekday) return weekday;
  const ago = raw.match(/(?:^|\s)(\d{1,2})\s*(일|주)\s*전(?=\s|$)/);
  if (ago) return formatDate(addDays(now,-Number(ago[1]) * (ago[2] === "주" ? 7 : 1)));
  return formatDate(now);
}

function ymd(year, month, day) {
  const d = new Date(year, month - 1, day);
  return formatDate(d);
}

// V22.9.17: 검증 전용 고정 시계. 검증 스크립트가 globalThis.__AB_QA_FIXED_NOW_MS 에 시각(ms)을
// 넣으면 KST 기준 "지금"이 그 시각이 된다. 환경변수로는 켜지지 않는다 — 운영에서 시계를
// 바꿀 길은 없다. 월말·연말에만 달라지는 화면을 아무 날에나 재현하려고 둔다.
function qaFixedNowMs() {
  const fixed = globalThis.__AB_QA_FIXED_NOW_MS;
  return Number.isFinite(fixed) && fixed > 0 ? Number(fixed) : Date.now();
}

// V22.9.77 감사 E-1: 가져오기 해석 한 번(withKstNowScope) 안에서는 KST 형식기를 하나만 만들어 다시 쓰고, 같은 1초 안에서는
// 읽은 시각을 다시 쓴다(결과는 초 단위라 같다). 예전에는 부를 때마다 Intl.DateTimeFormat 을 새로 만들어 자연어 가져오기가 행마다
// 하나씩(1,000행이면 1,000개) 만들었다. 범위는 동기 해석 한 번 동안만 있고 요청 사이에 남지 않는다. 범위 밖(카카오 문장 한 줄
// 등)은 예전과 같다. 돌려주는 Date 는 예전처럼 부를 때마다 새로 만든다(받은 쪽이 바꿔도 다음 호출에 번지지 않는다).
let KST_NOW_SCOPE = null;
function withKstNowScope(task) {
  if (KST_NOW_SCOPE) return task();
  KST_NOW_SCOPE = { format: null, second: NaN, parts: null };
  try { return task(); } finally { KST_NOW_SCOPE = null; }
}

function kstNowFormat() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function kstNowParts(ms, format) {
  const parts = format.formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return [get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")];
}

function nowKstDate() {
  const ms = qaFixedNowMs();
  const scope = KST_NOW_SCOPE;
  let parts;
  if (!scope) parts = kstNowParts(ms, kstNowFormat());
  else {
    const second = Math.floor(ms / 1000);
    if (second !== scope.second) {
      if (!scope.format) scope.format = kstNowFormat();
      scope.parts = kstNowParts(ms, scope.format);
      scope.second = second;
    }
    parts = scope.parts;
  }
  const [year, month, day, hour, minute, second] = parts;
  return new Date(year, month, day, hour, minute, second);
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthKst() {
  return formatDate(nowKstDate()).slice(0, 7);
}

// V22.9.26: Workers 런타임의 로컬 시간대는 UTC 다. `YYYY-MM-DDT00:00:00+09:00` 을 만들어
// getDay() 를 부르면 KST 자정 = 전날 15:00Z 라 전날 요일이 나온다. 날짜 문자열의 요일은
// UTC 자정으로 만들어 getUTCDay() 로 읽어야 어디서 돌아도 같다.
function weekdayIndexOfYmd(date = "") {
  const d = new Date(`${String(date || "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.getUTCDay() : -1;
}

// V22.9.26: "지난주 금요일", "이번주 월요일", "다음주 일요일", "금요일" 을 날짜로 푼다.
// 주 단위 말이 없으면 오늘을 포함해 가장 가까운 지난 그 요일이다.
// V22.9.78(V77 N-12): 주 없이 ‘지난·저번 금요일’로 쓰면 오늘을 뺀 바로 앞의 그 요일이다(금요일에 쓰면 7일 전).
const AB_WEEKDAY_PHRASE = /(?:(지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주|지난|저번)\s*)?([월화수목금토일])요일/;
function resolveWeekdayPhrase(raw = "", now = nowKstDate()) {
  const m = String(raw || "").match(AB_WEEKDAY_PHRASE);
  if (!m) return "";
  const target = "일월화수목금토".indexOf(m[2]);
  if (target < 0) return "";
  const mondayBased = (idx) => (idx + 6) % 7;
  const scope = String(m[1] || "").replace(/\s+/g, "");
  let offset;
  if (scope === "이번주" || scope === "금주") offset = mondayBased(target) - mondayBased(now.getDay());
  else if (scope === "다음주" || scope === "내주") offset = mondayBased(target) - mondayBased(now.getDay()) + 7;
  else if (scope === "지난" || scope === "저번") offset = -((mondayBased(now.getDay()) - mondayBased(target) + 7) % 7 || 7);
  else if (scope) offset = mondayBased(target) - mondayBased(now.getDay()) - 7;
  else offset = -((mondayBased(now.getDay()) - mondayBased(target) + 7) % 7);
  return formatDate(addDays(now, offset));
}

// 월은 01~12만 허용한다. 형식만 맞고 범위를 벗어난 값(2026-13, 2026-00)은
// 그대로 `transaction_date=gte.2026-13-01` 같은 날짜 리터럴이 되어 Postgres가
// 22008로 거절하고 화면이 500으로 끝난다.
function validMonth(value) {
  return /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(value || "")) ? String(value) : null;
}

function normalizePaymentMethod(value) {
  const t = normalizeText(value);
  if (!t) return "";
  return detectPaymentMethod(t);
}

// V22.9.77: 짧거나 다른 낱말 속에 흔한 결제수단 말(토스·현금·체크·신용·카드·삼페·카페이·네페)은 그 낱말에서 끝날 때만
// 결제수단이다. 예전에는 낱말 속에서도 읽어 "토스트 3000"이 결제수단 ‘토스’·메모 ‘트’로 저장됐다(현금영수증→현금,
// 체크인→체크카드, 신용점수→신용카드, 카드지갑→카드, 카페이용→카카오페이도 같은 결함). 뒤에 조사(로·으로·에 …)나
// 결제·결재·승인·했·줬·보냄 같은 말이 붙은 것("토스로", "카드결재", "현금줬어")은 예전처럼 읽는다. 카드사 이름이 붙은
// 카드(현대카드·KB국민카드)와 온전한 간편결제 이름(카카오페이·네이버페이·토스페이·토스뱅크 …)은 헷갈릴 낱말이 없어 예전처럼
// 어디에 있든 읽는다("현대카드제로", "카카오페이머니로"). 메모에서 결제수단을 지울 때(category-rules.js cleanMemo)도 같은 기준이다.
const AB_PAYMENT_WORD_END = "(?=$|[^가-힣]|(?:으로|로|에|이|가|을|를|은|는|도|만|와|과|의|랑|하고|결제|결재|계산|지불|지출|지급|구매|구입|납부|환불|사용|썼|씀|긁|찍|냄|냈|했|함|해|줌|줬|줘|드림|드렸|보냄|보냈|승인|취소|할부|일시불|송금|입금|출금))";

// V22.9.77 감사 E-1(남은 것): 결제수단 정규식은 처음 부를 때 한 번만 만든다(예전에는 부를 때마다 카드사 수만큼 14개를 새로
// 만들었다). 찾는 순서와 낱말은 위 결제수단 판정 그대로다. 정규식에 g 깃발이 없어 test 가 이전 호출의 상태를 남기지 않는다.
let AB_PAYMENT_PATTERNS = null;
function paymentMethodPatterns() {
  if (AB_PAYMENT_PATTERNS) return AB_PAYMENT_PATTERNS;
  const end = AB_PAYMENT_WORD_END;
  // 앞: 어디에 있든 읽는 온전한 이름, 뒤: 낱말 끝에서만 읽는 짧은 말.
  const pick = (anywhere, short) => new RegExp([anywhere, short && `(?:${short})${end}`].filter(Boolean).join("|"));
  const cardBrands = ["신한", "현대", "삼성", "국민", "KB", "우리", "롯데", "하나", "농협", "NH", "BC", "비씨", "카카오", "토스"];
  AB_PAYMENT_PATTERNS = [
    ...cardBrands.map((brand) => [new RegExp(brand + "\\s*카드", "i"), ["KB", "NH", "BC"].includes(brand.toUpperCase()) ? `${brand.toUpperCase()}카드` : `${brand}카드`]),
    [pick("삼성\\s*페이", "삼페"), "삼성페이"],
    [pick("카카오\\s*페이", "카페이"), "카카오페이"],
    [pick("네이버\\s*페이", "네페"), "네이버페이"],
    [pick("애플\\s*페이"), "애플페이"],
    [pick("페이코"), "페이코"],
    [pick("제로\\s*페이"), "제로페이"],
    [pick("토스\\s*(?:페이|뱅크)", "토스"), "토스"],
    [pick("", "신용(?:\\s*카드)?"), "신용카드"],
    [pick("", "체크(?:\\s*카드)?"), "체크카드"],
    [pick("", "카드"), "카드"],
    [pick("", "현금"), "현금"],
    [/(계좌|이체|송금|자동이체|무통장)/, "계좌이체"],
  ];
  return AB_PAYMENT_PATTERNS;
}

function detectPaymentMethod(text) {
  const raw = normalizeText(text);
  for (const [pattern, method] of paymentMethodPatterns()) if (pattern.test(raw)) return method;
  return "";
}
// @build:exports-start
export {
  AB_PAYMENT_WORD_END, addDays, currentMonthKst, detectPaymentMethod, extractDate, formatDate,
  normalizeDateValue, normalizePaymentMethod, nowKstDate, parseDateStrict, qaFixedNowMs,
  resolveWeekdayPhrase, safeYmd, validMonth, weekdayIndexOfYmd, withKstNowScope,
};
// @build:exports-end
