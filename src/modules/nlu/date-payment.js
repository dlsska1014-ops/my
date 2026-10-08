
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

function nowKstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(qaFixedNowMs()));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
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
const AB_WEEKDAY_PHRASE = /(?:(지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주)\s*)?([월화수목금토일])요일/;
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

function detectPaymentMethod(text) {
  const raw = normalizeText(text);
  const cardBrands = ["신한", "현대", "삼성", "국민", "KB", "우리", "롯데", "하나", "농협", "NH", "BC", "비씨", "카카오", "토스"];
  for (const brand of cardBrands) {
    const re = new RegExp(brand + "\\s*카드", "i");
    if (re.test(raw)) return brand.toUpperCase() === "KB" || brand.toUpperCase() === "NH" || brand.toUpperCase() === "BC" ? `${brand.toUpperCase()}카드` : `${brand}카드`;
  }
  if (/삼성\s*페이|삼페/.test(raw)) return "삼성페이";
  if (/카카오\s*페이|카페이/.test(raw)) return "카카오페이";
  if (/네이버\s*페이|네페/.test(raw)) return "네이버페이";
  if (/애플\s*페이|애플페이/.test(raw)) return "애플페이";
  if (/페이코/.test(raw)) return "페이코";
  if (/제로\s*페이|제로페이/.test(raw)) return "제로페이";
  if (/토스/.test(raw)) return "토스";
  if (/신용/.test(raw)) return "신용카드";
  if (/체크/.test(raw)) return "체크카드";
  if (/카드/.test(raw)) return "카드";
  if (/현금/.test(raw)) return "현금";
  if (/(계좌|이체|송금|자동이체|무통장)/.test(raw)) return "계좌이체";
  return "";
}
