// @build:imports-start
import { numberWithCommas } from "./transactions-core.js";
// @build:imports-end
// V22.9.89 U-02(디자인 작업 지시서 V2 §5-1·§5-2): 화면에 쓰는 지표 이름과 숫자 쓰는 법을 한곳에 둔다.
// 한 이름은 어느 화면에서나 한 정의다. 범위가 다르면 이름도 다르다(‘이번 달 지출’ = 모든 분류, ‘예산 쓴 돈’ = 예산을 정한 분류).
// 홈·리포트·예산·정기 항목 화면은 이름을 여기서 가져온다(V2 §8 R2). 소비 분석(한눈에 보기·종합 리포트)은 D-5 결정 전이라
// 화면 바이트를 바꾸지 않으므로(R3) 아직 옮기지 않는다 — 결정 뒤 같은 표를 쓴다.
const METRIC_LABELS = Object.freeze({
  monthSpend: Object.freeze({ label: "이번 달 지출", help: "1일부터 오늘까지 모든 분류의 지출 합이에요. 오늘 뒤 날짜로 미리 적은 기록은 넣지 않아요." }),
  budgetSpent: Object.freeze({ label: "예산 쓴 돈", help: "예산을 정한 분류의 지출이에요." }),
  budgetUnset: Object.freeze({ label: "예산 안 정한 지출", help: "예산을 정하지 않은 분류의 지출이에요." }),
  budgetRemaining: Object.freeze({ label: "남은 예산", help: "예산에서 예산 쓴 돈을 뺀 값이에요." }),
  budgetMonthEnd: Object.freeze({ label: "월말에 남을 예산", help: "지금 쓰는 속도와 남은 고정 항목으로 본 월말의 남은 예산이에요." }),
  monthEndSpend: Object.freeze({ label: "월말 예상 지출", help: "오늘까지 지출 + 남은 날 예상 + 아직 안 나간 정기 항목이에요." }),
  dailyAverage: Object.freeze({ label: "하루 평균 지출", help: "이번 달 지출을 지난 날 수(오늘 포함)로 나눈 값이에요." }),
  recurring: Object.freeze({ label: "정기 수입·지출", help: "매월 고정적으로 나가거나 들어오는 돈(월세·구독료·월급)의 기록이에요." }),
  fixedCost: Object.freeze({ label: "고정비", help: "정기 수입·지출 가운데 지출 항목의 합이에요. 분류 합(주거/관리)은 고정비라 부르지 않아요." }),
  reserveSchedule: Object.freeze({ label: "납부·입금 일정", help: "연 1회·반기·분기처럼 날짜가 정해진 큰돈을 미리 알려 줘요. 기록은 만들지 않아요." }),
  thisWeek: Object.freeze({ label: "이번 주", help: "월요일부터 오늘까지예요." }),
  last7Days: Object.freeze({ label: "최근 7일", help: "오늘을 포함한 7일이에요." }),
  noSpendDay: Object.freeze({ label: "무지출일", help: "기록을 시작한 날부터 오늘까지 지출 기록 없이 지난 날이에요. 기록을 시작하기 전의 날은 세지 않아요." }),
});

// 소비 분석 밖의 화면에 다시 나오면 안 되는 옛 이름(V2 U-02). 검증 validate-metric-consistency-v22989 가 쓴다.
const METRIC_RETIRED_LABELS = Object.freeze(["분석 신뢰도", "가계부 경보", "예산 밖", "관측 기간"]);

// V2 §5-2 추정치 표기: 10만 원 이상은 만 원 단위로 반올림해 "약 89만 원", 그보다 작으면 100원 단위로 "약 15,900원".
// 실제 기록 합(지출·수입·남은 예산)은 이 함수를 쓰지 않고 원 단위로 정확히 쓴다.
// 경계(V22.9.89 독립 검토): 반올림이 0원이면 "100원 미만"(‘약 0원 남아요’라 하지 않음), 99,950원부터는 "약 10만 원"(‘약 100,000원’ 아님),
// 1억 원부터는 "약 1억 2,346만 원"(‘약 12,346만 원’ 아님).
function approxWon(amount = 0) {
  const value = Math.abs(Number(amount) || 0);
  const hundreds = Math.round(value / 100) * 100;
  if (hundreds < 100000) return value && !hundreds ? "100원 미만" : `약 ${numberWithCommas(hundreds)}원`;
  const man = Math.round(value / 10000);
  if (man < 10000) return `약 ${numberWithCommas(man)}만 원`;
  const rest = man % 10000;
  return `약 ${numberWithCommas(Math.floor(man / 10000))}억${rest ? ` ${numberWithCommas(rest)}만` : ""} 원`;
}

// V2 §5-1 ‘기록’: 수입이 있으면 "기록 11건 · 지출 9 · 수입 2", 없으면 "기록 9건 · 지출 9" 로 나눠 적는다.
function recordCountText(expenseCount = 0, incomeCount = 0) {
  const expense = Math.max(0, Number(expenseCount) || 0);
  const income = Math.max(0, Number(incomeCount) || 0);
  return `기록 ${numberWithCommas(expense + income)}건 · 지출 ${numberWithCommas(expense)}${income ? ` · 수입 ${numberWithCommas(income)}` : ""}`;
}
// @build:exports-start
export { METRIC_LABELS, approxWon, recordCountText };
// @build:exports-end
