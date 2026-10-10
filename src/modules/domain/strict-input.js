// @build:imports-start
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { validMonth } from "../nlu/date-payment.js";
// @build:imports-end

// V22.9.37 감사 묶음 D(N7·N13·SIM-7 의 공용 기반): 폼·관리자 API·파일에서 들어온 금액·월·날짜·일자를 엄격하게 읽는
// 공용 검증기. Number("0x10")=16, Number("1e3")=1000, Number(true)=1, Number(" ")=0 처럼 Number() 가 조용히
// 받아 주는 값을 모두 거절하고 정수(또는 null)만 돌려준다. 단위가 붙은 문자열("1만2천원")은 여기서 해석하지
// 않는다 — 그런 입력은 호출한 쪽이 자연어 금액 해석기를 거친 뒤 그 결과 숫자를 다시 이 함수로 확인한다.
// 연결 빌드에서 선언 순서가 초기화 순서이므로 이 모듈은 최상위에 함수 선언만 둔다(로드 때 평가되는 상수 없음).
// 기본값(거래 상한 등)은 호출 시점에 읽는다.

// 정수 금액. 숫자 또는 "12000"·"+500" 꼴 문자열만 받는다("1,500,000" 같은 천 단위 쉼표는 allowCommas 일 때만).
// 범위는 min(기본 0) ≤ n ≤ max(기본 거래 상한)이고, allowNegative 이면 -max ≤ n ≤ max 다(0 이상일 때는 min 도 적용).
// NaN·Infinity·소수·지수·16진수·불리언·객체·빈 값은 null 이다.
function parseStrictAmount(value, options = {}) {
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : MAX_TRANSACTION_AMOUNT;
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const allowNegative = options.allowNegative === true;
  let n;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const text = value.trim();
    const grouped = options.allowCommas === true && /^[-+]?\d{1,3}(?:,\d{3})+$/.test(text);
    if (!grouped && !/^[-+]?\d+$/.test(text)) return null;
    n = Number(text.replace(/,/g, ""));
  } else return null;
  if (!Number.isSafeInteger(n)) return null;
  if (n === 0) n = 0; // -0 → 0
  if (n < 0) return allowNegative && -n <= max ? n : null;
  return n >= min && n <= max ? n : null;
}

// "YYYY-MM" 꼴의 실제 달(validMonth 와 같은 2000-01~2099-12)만. 숫자·"2026-13"·"2026/07" 은 null 이다.
function parseStrictMonth(value) {
  if (typeof value !== "string") return null;
  return validMonth(value.trim());
}

// "YYYY-MM-DD" 꼴의 달력에 있는 날짜만(2000~2099년). "2026-02-30", "2026/07/01", 날짜시각 문자열은 null 이다.
function parseStrictDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return isValidTransactionDateString(text) ? text : null;
}

// min(기본 1)~max(기본 31) 범위의 정수 일자. "05" → 5.
function parseStrictDay(value, options = {}) {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 1;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 31;
  return parseStrictAmount(value, { min, max });
}
// @build:exports-start
export { parseStrictAmount, parseStrictDate };
// @build:exports-end
