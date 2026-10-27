// V22.9.78 주 없이 쓴 ‘지난·저번 요일’ 날짜 검사 (V77:N-12, 운영자 결정 2026-10-23).
// N-12: ‘지난 금요일’처럼 ‘주’ 없이 쓴 요일 말을 가장 최근의 그 요일(오늘이면 오늘)로 읽었다.
//       이제는 오늘을 뺀 바로 앞의 그 요일이다. 요일만 쓴 ‘금요일’과 ‘지난주·이번 주·다음 주 …’는 예전과 같다.
//       웹 빠른 입력(quickInputDate, 브라우저 자산에도 실림)과 카카오(resolveWeekdayPhrase·문장 해석)가 같은 날로 읽는다.
import { parseTransaction, quickInputDate, resolveWeekdayPhrase } from "../src/index.js";
import { counter, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.78 주 없이 쓴 지난·저번 요일 날짜 검사 통과");
const DAY_MS = 86400000;

// 2026-10-23 은 금요일, 2026-10-25 는 일요일이다.
eq(quickInputDate("지난 금요일 회식 50000", "2026-10-23"), "2026-10-16", "금요일에 쓴 ‘지난 금요일’은 오늘이 아니라 7일 전이다(예전: 오늘 10-23)");
eq(quickInputDate("저번 금요일 회식 50000", "2026-10-23"), "2026-10-16", "‘저번 금요일’도 7일 전이다");
eq(quickInputDate("지난금요일 회식", "2026-10-23"), "2026-10-16", "붙여 쓴 ‘지난금요일’도 7일 전이다");
eq(quickInputDate("지난 금요일 회식", "2026-10-25"), "2026-10-23", "일요일에 쓴 ‘지난 금요일’은 이틀 전 금요일이다(예전과 같음)");
eq(quickInputDate("저번 토요일 마트", "2026-10-25"), "2026-10-24", "일요일에 쓴 ‘저번 토요일’은 어제다(예전과 같음)");
eq(quickInputDate("금요일 회식", "2026-10-23"), "2026-10-23", "요일만 쓴 ‘금요일’은 예전처럼 오늘을 포함한다");
eq(quickInputDate("지난주 금요일 회식", "2026-10-23"), "2026-10-16", "‘지난주 금요일’은 예전과 같다");
eq(quickInputDate("지난 주 금요일 회식", "2026-10-25"), "2026-10-16", "띄어 쓴 ‘지난 주 금요일’도 예전과 같다(주는 월요일 시작)");
eq(quickInputDate("이번 주 금요일 회식", "2026-10-25"), "2026-10-23", "‘이번 주 금요일’은 예전과 같다");
eq(quickInputDate("다음주 금요일 회식", "2026-10-23"), "2026-10-30", "‘다음주 금요일’은 예전과 같다");

// 주 없이 쓴 ‘지난·저번 요일’은 어느 날 쓰든 1~7일 전이고, 웹과 카카오가 같은 날로 읽는다.
const scopes = ["지난 ", "저번 ", "지난", "저번", "", "지난주 ", "이번 주 ", "다음주 "];
const mismatches = [], outOfRange = [];
let compared = 0;
for (let i = 0; i < 21; i += 1) {
  const base = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10);
  const [y, m, d] = base.split("-").map(Number);
  const kakaoNow = new Date(y, m - 1, d, 12, 0, 0);
  for (const scope of scopes) {
    for (const day of "월화수목금토일") {
      const text = `${scope}${day}요일 점심 12000원`;
      const web = quickInputDate(text, base);
      const kakao = resolveWeekdayPhrase(text, kakaoNow);
      compared += 1;
      if (web !== kakao) mismatches.push(`${base} "${text}": 웹 ${web} · 카카오 ${kakao}`);
      if (/^(지난|저번) ?$/.test(scope)) {
        const back = (Date.parse(base) - Date.parse(web)) / DAY_MS;
        if (!(back >= 1 && back <= 7)) outOfRange.push(`${base} "${text}": ${web}`);
      }
    }
  }
}
eq(compared, 21 * scopes.length * 7, "기준일 21일 × 표현 8가지 × 요일 7개를 모두 대조했다");
eq(mismatches.slice(0, 3).join(" | "), "", "웹과 카카오의 요일 날짜가 모든 기준일·표현·요일에서 같다");
eq(outOfRange.slice(0, 3).join(" | "), "", "주 없이 쓴 ‘지난·저번 요일’은 늘 1~7일 전이다(오늘은 아니다)");

// 카카오 문장 해석도 같은 날로 저장하고, 메모는 V77 처럼 ‘지난 금요일’을 통째로 뺀다.
await withClock("2026-10-23", async () => {
  const row = parseTransaction("지난 금요일 회식 50000", {});
  eq(row.transaction_date, "2026-10-16", "카카오 ‘지난 금요일 회식 50000’(금요일에 보냄)은 10월 16일 기록이다");
  eq(row.memo, "회식", "메모는 예전처럼 ‘회식’만 남는다");
  eq(parseTransaction("저번 금요일 택시 8000", {}).transaction_date, "2026-10-16", "카카오 ‘저번 금요일’도 10월 16일");
  eq(parseTransaction("금요일 회식 50000", {}).transaction_date, "2026-10-23", "카카오 ‘금요일 회식’은 예전처럼 오늘");
  eq(parseTransaction("지난주 금요일 회식 50000", {}).transaction_date, "2026-10-16", "카카오 ‘지난주 금요일’은 예전과 같다");
});
await withClock("2026-10-25", async () => {
  eq(parseTransaction("지난 금요일 회식 50000", {}).transaction_date, "2026-10-23", "일요일에 보낸 ‘지난 금요일’은 이틀 전(예전과 같음)");
});

// V22.9.81 V81-a·c: 요일 앞말 묶음이 ‘…|지난번|지난|저번|이번|다음|…’으로 늘어 묶음 끝 괄호를 보지 않는다(주 없는 ‘지난·저번’은 그대로 있다).
ok(/\|지난\|저번[|)]/.test(quickInputDate.toString()), "브라우저에 실리는 quickInputDate 본문에 새 규칙이 들어 있다");

done();
