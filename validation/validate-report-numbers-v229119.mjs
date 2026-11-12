// 리포트·분석 숫자와 문장 맞추기 검사(2026-11-12 전체 점검 개선 승인, 숫자 담당 N-1~N-9·N-13·N-14).
// 점검 4-2 대조 표에서 어긋났던 칸을 합성 가계부로 단언한다.
//  N-1 진행 중인 달 종합 리포트 ‘총 지출·총 수입’ 아래 기준 줄(미리 적은 금액 · 오늘까지 · 지난달 같은 기간). 금액은 그대로.
//      위 줄이 ‘직접 적은 기록이 없어 … 비교하지 않아요’ 이면 견준 두 금액은 빼고 ‘미리 적은 N원 포함’ 만 적는다.
//  N-2 진행 중인 달의 전략 카드·최대 증가 항목·분류 변화 TOP 도 머리 카드와 같은 ‘지난달 같은 기간’ 으로 견준다(같은 부호·같은 값).
//      같은 기간 값을 못 구하면(기록의 날짜·금액 형식 오류) 머리 카드처럼 ‘확인 불가’ 다 — 지난달 전체와 견주는 옛 카드로 돌아가지 않는다.
//  N-3 ‘배달/외식’ = 생활비 리포트 생활 패턴의 배달 + 외식(같은 묶음 함수). 기준은 이 화면의 등록액이라, 오늘 뒤 날짜로 미리 적은 배달·외식이 있으면
//      오늘까지 세는 생활비 리포트보다 그 금액만큼 크다(없으면 같다).
//  N-4 ‘고정비’ 칸 이름 → ‘주거·통신·보험·구독’(셈 그대로), 소비 신호 설명도 같은 이름. 관리자 PC 분석은 그 화면 칸 이름(‘고정비 비중’)대로 ‘고정비’.
//  N-5 카카오 ‘이번 주’ 는 오늘까지(= 웹 주간) + 뺀 금액 한 줄, ‘이번 달’ 은 금액 그대로 + ‘(오늘 뒤 날짜 N원 포함)’(환불 연결을 켜도 같음).
//  N-6 ‘최근 3개월 평균’(진행 중인 달은 직전 세 달, 범위를 적음).   N-7 예산이 없으면 ‘미설정’.   N-8 수입 기록이 없으면 저축률 ‘-’.
//  N-9 직접 적은 기록이 없는 기간(기록 0건·정기 자동 기록만)은 증감률·판정 문장을 내지 않는다(큰 지출 체크의 빈 목록 포함). 주간 카드는
//      종합 리포트와 관리자 PC 분석이 같은 함수라 두 화면 모두 그렇다.
//  N-13 지난 달을 보면 ‘이번 달’ 라벨 대신 ‘10월’(예산 화면 계획 안내 포함).   N-14 휴대폰 홈 ‘지난달 1~N일’ 은 지난달 말일을 넘지 않는다.
// 끝난 달(지난달 보기)은 위 라벨 말고 돈·비율·건수 글자가 고치기 전 번들 출력과 같다(아래 ENDED_MONTH_TOKENS — 고치기 전·후 출력에서
// 같은 값, 분류 표 부재 모드·TZ=UTC 에서도 같음). 판 이름 글자는 적지 않는다(‘판 번호 정본’ 검사). 오프라인: 픽스처 + app.fetch.
import { createHash } from "node:crypto";
import { counter, fixture, intercept, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.119 리포트·분석 숫자와 문장 맞추기 검사 통과");

// ── 화면을 글자 마디 줄로 바꾼다(태그·스크립트·스타일 제거) ───────────────────────────
const textLines = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/g, "\n").replace(/<style[\s\S]*?<\/style>/g, "\n")
  .replace(/<[^>]+>/g, "\n")
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
  .split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const seqAt = (lines, seq) => lines.findIndex((_, i) => seq.every((s, j) => lines[i + j] === s));
const hasSeq = (lines, seq, message) => ok(seqAt(lines, seq) >= 0, `${message}: ${seq.join(" / ")}`);
const lacks = (lines, text, message) => ok(!lines.some((line) => line.includes(text)), `${message}: ‘${text}’ 가 없어야 한다`);
const after = (lines, seq, offset = seq.length) => { const i = seqAt(lines, seq); return i < 0 ? "" : lines[i + offset] || ""; };
const won = (text) => Number(String(text).replace(/[^\d]/g, "")) || 0;
const tokenHash = (lines) => createHash("sha256").update((lines.join("\n").match(/[-+]?\d[\d,]*(?:원|%|건|일)/g) || []).sort().join("|")).digest("hex");

// ── 합성 가계부(점검 때 쓴 장면을 줄임) ──────────────────────────────────────────
const tx = (id, date, type, amount, category, memo, payment, user = "user-bin", extra = {}) => ({
  id, household_id: "house-home", user_id: user, transaction_date: date, type, amount, category, memo, payment_method: payment,
  source: "web", raw_text: memo, created_at: `${date}T03:00:00.000Z`, updated_at: `${date}T03:00:00.000Z`, ...extra,
});
const rec = (id, date, amount, category, memo, ruleId) => tx(id, date, "expense", amount, category, memo, "계좌이체", "user-bin", { source: "recurring_auto", raw_text: `recurring:${ruleId}:${date.slice(0, 7)}` });
const NOV = [
  tx("n-inc-1", "2026-11-10", "income", 3000000, "급여", "11월 월급", "급여통장"),
  tx("n-inc-2", "2026-11-04", "income", 20000, "기타수입", "쿠팡 환불", "국민카드"),
  tx("n-ex-1", "2026-11-01", "expense", 12000, "식비", "점심", "국민카드", "user-bin", { created_at: "2026-10-31T15:10:00.000Z", updated_at: "2026-10-31T15:10:00.000Z" }),
  tx("n-ex-2", "2026-11-03", "expense", 3300, "교통", "버스", "현대카드", "user-wifi"),
  rec("n-ex-3", "2026-11-05", 650000, "주거/관리", "월세", "recurring-rent"),
  tx("n-ex-4", "2026-11-07", "expense", 5500, "카페/간식", "커피", "카카오페이"),
  tx("n-ex-5", "2026-11-08", "expense", 48000, "식비", "외식", "국민카드", "user-wifi"),
  tx("n-ex-6", "2026-11-11", "expense", 7000, "", "편의점", ""),
  tx("n-ex-7", "2026-11-12", "expense", 9000, "식비", "점심", "국민카드"),
  tx("n-ex-8", "2026-11-12", "expense", 30000, "쇼핑", "생활용품", "현대카드", "user-wifi"),
  tx("n-ex-f1", "2026-11-20", "expense", 300000, "여행", "숙소 예약", "국민카드"),
  tx("n-ex-f2", "2026-11-22", "expense", 40000, "식비", "모임 예약", "국민카드"),
  tx("n-inc-f1", "2026-11-25", "income", 100000, "부수입", "중고판매 예정", "카카오뱅크"),
];
const OCT = [
  tx("o-inc-1", "2026-10-10", "income", 3000000, "급여", "10월 월급", "급여통장"),
  tx("o-ex-1", "2026-10-31", "expense", 25000, "식비", "야식", "국민카드", "user-bin", { created_at: "2026-10-31T14:30:00.000Z", updated_at: "2026-10-31T14:30:00.000Z" }),
  tx("o-ex-2", "2026-10-15", "expense", 60000, "교통", "주유", "현대카드", "user-wifi"),
  rec("o-ex-3", "2026-10-05", 650000, "주거/관리", "월세", "recurring-rent"),
  tx("o-ex-4", "2026-10-20", "expense", 100000, "쇼핑", "옷", "현대카드"),
];
const BUDGETS = (month) => [["식비", 400000], ["교통", 100000], ["카페/간식", 50000]].map(([category, amount]) => ({ month, category, amount }));
const JAN = [
  tx("pf-1", "2027-01-01", "expense", 30000, "식비", "신정 외식", "국민카드"),
  tx("pf-2", "2027-01-04", "expense", 9000, "식비", "점심", "국민카드"),
  tx("pf-o1", "2026-12-28", "expense", 70000, "식비", "송년회", "국민카드"),
  tx("pf-o2", "2026-12-31", "expense", 15000, "식비", "야식", "국민카드"),
  tx("pf-o3", "2026-12-10", "expense", 200000, "쇼핑", "선물", "국민카드"),
  tx("pf-o4", "2026-12-02", "expense", 12000, "카페/간식", "케이크", "국민카드"),
];
const MAR = [
  tx("pb-1", "2027-03-02", "expense", 100000, "식비", "장보기", "국민카드"),
  tx("pb-2", "2027-03-30", "expense", 50000, "식비", "외식", "국민카드"),
  tx("pb-3", "2027-03-31", "expense", 20000, "식비", "점심", "국민카드"),
  tx("pb-o1", "2027-02-10", "expense", 60000, "식비", "장보기", "국민카드"),
  tx("pb-o2", "2027-02-28", "expense", 40000, "식비", "외식", "국민카드"),
];

function seed(fx, scene) {
  fx.db.transactions = fx.db.transactions.filter((r) => r.household_id !== "house-home").concat(scene.rows.map((r) => ({ ...r })));
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((b) => b.household_id !== "house-home").concat(
    (scene.budgets || []).map((b, i) => ({ id: `b-${i}-${b.category}`, household_id: "house-home", month: b.month, category: b.category, amount: b.amount, created_at: `${b.month}-01T00:00:00.000Z` })));
  for (const rule of fx.db.accountbook_recurring) if (rule.id === "recurring-rent") rule.last_applied_month = scene.today.slice(0, 7);
  if (scene.recurringEdu) fx.db.accountbook_recurring.push({ id: "recurring-edu", household_id: "house-home", type: "expense", amount: 300000, category: "교육", memo: "학원비", payment_method: "계좌이체", day_of_month: 6, user_id: "user-bin", is_active: true, last_applied_month: "2026-11", created_at: "2026-07-01T00:00:00.000Z" });
}

// 장면 하나: 웹 화면 몇 개(글자 줄)와 카카오 답 몇 개.
async function render(scene, pages = {}, utterances = []) {
  return withClock(scene.today, async () => {
    const out = { pages: {}, html: {}, kakao: {} };
    await fixture(async (fx) => {
      seed(fx, scene);
      for (const [name, path] of Object.entries(pages)) {
        const res = await page(fx, path.replace("?Q", `?month=${scene.month}&household_id=house-home`));
        eq(res.status, 200, `${scene.today} ${name} 화면이 열린다`);
        out.html[name] = res.html;
        out.pages[name] = textLines(res.html);
      }
    });
    if (!utterances.length) return out;
    await fixture(async (fx) => {
      seed(fx, scene);
      // 가계부 하나뿐인 계정(고르는 질문 없이 받는다).
      fx.db.household_members = fx.db.household_members.filter((m) => m.household_id !== "house-trip");
      fx.db.households = fx.db.households.filter((h) => h.id !== "house-trip");
      fx.db.transactions = fx.db.transactions.filter((r) => r.household_id !== "house-trip");
      const say = async (u) => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.(); globalThis.__AB_KAKAO_INFLIGHT?.clear?.(); return skill(fx, u); };
      await say("요약"); await say("1");
      for (const utterance of utterances) out.kakao[utterance] = await say(utterance);
    });
    return out;
  });
}
const kakaoLines = (text) => String(text).split("\n").map((s) => s.trim()).filter(Boolean);

// ── 1. 진행 중인 달(2026-11-12): N-1·N-2·N-3·N-4·N-5·N-6·N-8 ─────────────────────────
{
  const scene = { today: "2026-11-12", month: "2026-11", rows: [...NOV, ...OCT], budgets: BUDGETS("2026-11") };
  const { pages: { report }, html, kakao } = await render(scene, { report: "/my/analysis?Q&view=report" },
    ["이번 달 요약", "이번 달 수입", "11월 요약", "얼마 썼어", "지난달 요약", "10월 요약", "지난주 요약", "오늘 요약"]);
  // N-1 금액은 등록액 그대로, 아래에 견준 금액과 미리 적은 금액.
  hasSeq(report, ["총 지출", "1,104,800원", "지난달 같은 기간 대비 +18%", "미리 적은 340,000원 포함 · 오늘까지 764,800원 · 지난달 같은 기간 650,000원"], "N-1 총 지출 기준 줄");
  hasSeq(report, ["총 수입", "3,120,000원", "지난달 같은 기간 대비 +1%", "미리 적은 100,000원 포함 · 오늘까지 3,020,000원 · 지난달 같은 기간 3,000,000원"], "N-1 총 수입 기준 줄");
  // N-2 머리 카드와 전략 카드가 같은 기간·같은 값(고치기 전: +18% 와 +32% — 지난달 전체와 견줌).
  const head = after(report, ["총 지출", "1,104,800원"]).replace(/^지난달 같은 기간 대비 /, "");
  const card = after(report, ["지난달 같은 기간 대비 지출"], 1);
  eq(card, head, "N-2 전략 카드 증감률 = 총 지출 카드 증감률");
  hasSeq(report, ["지난달 같은 기간 대비 지출", "+18%", "지난달 1~12일 650,000원 → 이번 달 1~12일 764,800원"], "N-2 전략 카드 같은 기간 금액");
  ok(html.report.includes(`<div class="insight warn"><b>지난달 같은 기간 대비 지출</b>`), "N-2 색 판정도 같은 기간 값(+18% = 주의)");
  lacks(report, "전월 대비 지출", "N-2 진행 중인 달은 전체 대 전체 카드가 없다");
  hasSeq(report, ["최대 증가 항목", "식비", "지난달 같은 기간보다 69,000원 증가 · 새로 생김"], "N-2 최대 증가 항목 같은 기간");
  hasSeq(report, ["지난달 같은 기간 대비 분류 변화 TOP", "지난달 같은 기간 대비 분류 변화 TOP", "이번 달 1~12일을 지난달 1~12일과 견줘 크게 늘거나 줄어든 분류입니다.",
    "카테고리", "이번 달 1~12일", "지난달 1~12일", "차이", "증감률", "식비", "69,000원", "0원", "+69,000원", "새로 생김"], "N-2 분류 변화 TOP 같은 기간");
  lacks(report, "+300,000원", "N-2 아직 오지 않은 날짜의 여행 300,000원을 늘어난 분류로 보지 않는다");
  // N-3 생활비 리포트 묶음(점심·외식 = 외식). 11-22 ‘모임 예약’ 은 외식 낱말이 없어 묶음 밖이다(미리 적은 외식 장면은 8절).
  hasSeq(report, ["배달/외식", "69,000원", "3건"], "N-3 배달/외식 칸");
  // N-4 이름만 바뀜(셈 그대로). 옛 이름은 줄 안 글자로 찾는다 — 남는 줄은 보호 화면 머리 문장(화면이 다루는 주제 목록) 하나뿐이다.
  hasSeq(report, ["주거·통신·보험·구독", "650,000원"], "N-4 분석 도구 칸 이름");
  hasSeq(report, ["주거·통신·보험·구독 비중", "59%"], "N-4 소비 패턴 칸 이름");
  ok(report.includes("주거·통신·보험·구독 점검"), "N-4 개선 인사이트 줄 이름");
  const fixedLines = report.filter((s) => s.includes("고정비"));
  eq(fixedLines.length, 1, "N-4 ‘고정비’ 가 든 줄은 하나");
  ok(/· 예산, 소비 추이, 고정비, 반복지출, 분류별 지출을 한 달 단위로 모아 봅니다\.$/.test(fixedLines[0] || ""), "N-4 남은 한 줄은 보호 화면 머리 문장");
  ok(report.some((s) => /^\d+점 · 주거·통신·보험·구독 비중, 쏠림, 미정리, 월말 예상치를 합친 점수예요\. 45점부터 주의, 70점부터 넘침 위험이에요\.$/.test(s)), "N-4 소비 신호 설명도 같은 이름");
  // N-6 진행 중인 달은 직전 세 달 평균(8~10월 중 기록 있는 10월 하나), 판정 색 없음.
  hasSeq(report, ["최근 3개월 평균", "835,000원", "8월~10월 가운데 기록이 있는 1개월의 평균이에요(지출 0원인 달 포함)."], "N-6 평균 칸");
  ok(html.report.includes(`<div class="insight "><b>최근 3개월 평균</b>`), "N-6 진행 중인 달은 평균과 판정하지 않는다");
  lacks(report, "3개월 평균 대비", "N-6 옛 제목");
  // N-7·N-8 예산·수입이 있으면 예전 그대로.
  hasSeq(report, ["잔여 총예산", "432,200원", "이번 달 사용 가능 금액"], "N-7 예산이 있으면 금액");
  ok(report.includes("수입-지출 · 저축률 65%"), "N-8 수입이 있으면 저축률 그대로");
  // N-5 이번 달은 금액 그대로 + 미리 적은 금액.
  for (const u of ["이번 달 요약", "11월 요약"]) {
    const lines = kakaoLines(kakao[u]);
    ok(lines.includes("지출: 1,104,800원 · 10건 (오늘 뒤 날짜 340,000원 포함)"), `N-5 ${u} 지출 줄`);
    ok(lines.includes("수입: 3,120,000원 (오늘 뒤 날짜 100,000원 포함)"), `N-5 ${u} 수입 줄`);
  }
  ok(kakaoLines(kakao["이번 달 수입"]).includes("수입: 3,120,000원 · 3건 (오늘 뒤 날짜 100,000원 포함)"), "N-5 이번 달 수입 줄");
  const fallback = kakaoLines(kakao["얼마 썼어"]);
  ok(fallback.includes("수입: 3,120,000원 (오늘 뒤 날짜 100,000원 포함)") && fallback.includes("지출: 1,104,800원 (오늘 뒤 날짜 340,000원 포함)"), "N-5 ‘얼마 썼어’ 이번 달 요약");
  // 끝난 기간·오늘은 그대로.
  for (const [u, line] of [["지난달 요약", "지출: 835,000원 · 4건"], ["10월 요약", "지출: 835,000원 · 4건"], ["지난주 요약", "지출: 706,800원 · 4건"], ["오늘 요약", "지출: 39,000원 · 2건"]]) {
    ok(kakaoLines(kakao[u]).includes(line), `N-5 끝난 기간 ${u} 금액 그대로`);
    ok(!kakao[u].includes("오늘 뒤 날짜"), `N-5 끝난 기간 ${u} 에는 기준 말이 없다`);
  }
  for (const [u, text] of Object.entries(kakao)) ok(!/https?:\/\//.test(text), `카카오 ${u} 답 글에 주소 없음`);
}

// ── 2. 이번 주(2026-11-12, 11-14 공연 120,000원 미리 적음): 카카오 이번 주 = 웹 주간 ───────────
// 연결한 환불이 없는 주다. 카카오·생활비 리포트 주간은 환급 날짜의 차감을 빼고 종합 리포트 주간 리포트는 빼지 않으므로, 환불이 있는 주에는 셋째 값만 다르다.
{
  const scene = { today: "2026-11-12", month: "2026-11", rows: [...NOV, tx("s3-f", "2026-11-14", "expense", 120000, "여가", "공연 예매", "국민카드"), ...OCT], budgets: BUDGETS("2026-11") };
  const { pages, kakao } = await render(scene, { report: "/my/analysis?Q&view=report", week: "/reports?Q&range=week" }, ["이번 주 요약", "이번 주 얼마 썼어", "이번 달 요약"]);
  const webWeekly = won(after(pages.report, ["주간 리포트"], 2));
  const livingWeekly = won(after(pages.week, ["지출"], 1));
  hasSeq(pages.week, ["지출", "46,000원", "오늘까지 4일 동안 · 오늘 뒤 날짜 120,000원 제외"], "웹 생활비 리포트 주간 기준");
  for (const u of ["이번 주 요약", "이번 주 얼마 썼어"]) {
    const lines = kakaoLines(kakao[u]);
    const line = lines.find((s) => s.startsWith("지출: ")) || "";
    eq(line, "지출: 46,000원 · 3건", `N-5 ${u} 는 오늘까지(고치기 전 166,000원 · 4건)`);
    eq(won(line.split("·")[0]), webWeekly, `N-5 ${u} = 종합 리포트 주간 리포트(환불 연결 없는 주)`);
    eq(won(line.split("·")[0]), livingWeekly, `N-5 ${u} = 생활비 리포트 주간(환불 연결 없는 주)`);
    ok(lines.includes("오늘 뒤 날짜 지출 120,000원은 뺐어요."), `N-5 ${u} 뺀 금액 한 줄`);
    ok(!lines.some((s) => s.includes("여가")), `N-5 ${u} 분류에 오늘 뒤 기록 없음`);
  }
  ok(kakaoLines(kakao["이번 달 요약"]).includes("지출: 1,224,800원 · 11건 (오늘 뒤 날짜 460,000원 포함)"), "N-5 이번 달은 등록액 그대로 + 미리 적은 금액");
}

// ── 3. 달 첫날(2026-11-01): 같은 기간이 하루 ──────────────────────────────────────
{
  const scene = { today: "2026-11-01", month: "2026-11", rows: [...NOV, ...OCT], budgets: BUDGETS("2026-11") };
  const { pages: { report } } = await render(scene, { report: "/my/analysis?Q&view=report" });
  hasSeq(report, ["지난달 같은 기간 대비 지출", "비교 기록 없음", "지난달 1일 0원 → 이번 달 1일 12,000원"], "N-2 첫날은 ‘1일’");
  hasSeq(report, ["카테고리", "이번 달 1일", "지난달 1일", "차이", "증감률"], "N-2 첫날 표 머리");
  hasSeq(report, ["미리 적은 1,092,800원 포함 · 오늘까지 12,000원 · 지난달 같은 기간 0원"], "N-1 첫날 기준 줄");
}

// ── 4. 해 바뀐 달(2027-01-04): 고치기 전에는 머리 +225%·전략 카드 -87% ─────────────────────
{
  const scene = { today: "2027-01-04", month: "2027-01", rows: JAN, budgets: BUDGETS("2027-01") };
  const { pages: { report } } = await render(scene, { report: "/my/analysis?Q&view=report" });
  const head = after(report, ["총 지출", "39,000원"]).replace(/^지난달 같은 기간 대비 /, "");
  eq(head, "+225%", "1월 4일 총 지출 카드");
  eq(after(report, ["지난달 같은 기간 대비 지출"], 1), head, "N-2 1월 4일 전략 카드 = 총 지출 카드");
  hasSeq(report, ["지난달 같은 기간 대비 지출", "+225%", "지난달 1~4일 12,000원 → 이번 달 1~4일 39,000원"], "N-2 1월 4일 같은 기간 금액");
  hasSeq(report, ["최근 3개월 평균", "297,000원", "2026년 10월~12월 가운데 기록이 있는 1개월의 평균이에요(지출 0원인 달 포함)."], "N-6 해가 바뀌면 연도를 적는다");
}

// ── 5. 지난달이 짧은 달 끝날(2027-03-31): N-14·N-2·N-7 ─────────────────────────────
{
  const scene = { today: "2027-03-31", month: "2027-03", rows: MAR, budgets: [] };
  const { pages } = await render(scene, { home: "/app?Q", report: "/my/analysis?Q&view=report", budgets: "/budgets?Q" });
  ok(pages.home.includes("지난달 1~28일보다 70,000원 더 썼어요."), "N-14 홈은 지난달 말일(2월 28일)까지");
  lacks(pages.home, "지난달 1~31일", "N-14 없는 날짜 라벨");
  hasSeq(pages.report, ["지난달 같은 기간 대비 지출", "+70%", "지난달 1~28일 100,000원 → 이번 달 1~31일 170,000원"], "N-2 지난달이 짧으면 말일까지");
  eq(after(pages.report, ["총 지출", "170,000원"]), "지난달 같은 기간 대비 +70%", "3월 31일 총 지출 카드");
  hasSeq(pages.report, ["최근 3개월 평균", "100,000원", "2026년 12월~2027년 2월 가운데 기록이 있는 1개월의 평균이에요(지출 0원인 달 포함)."], "N-6 해를 걸친 범위");
  ok(pages.budgets.includes("예산 미설정"), "N-7 예산 화면 예산 없음");
  lacks(pages.budgets, "예산 사용 0%", "N-7 예산 화면");
  ok(pages.budgets.includes("분류별 금액의 합계가 이번 달 전체 지출 예산이 됩니다."), "N-13 예산 화면 계획 안내(보는 달이 이번 달)");
}

// ── 6. 지난달 보기(2026-11-12 에 10월): N-13 라벨만, 숫자 그대로 ─────────────────────────
// 돈·비율·건수·일수 글자 묶음의 해시. 고치기 전 번들 출력과 고친 뒤 출력이 같은 값이다(끝난 달은 라벨만 바뀜).
const ENDED_MONTH_TOKENS = {
  report: "e29a368f4b77",
  analysis: "b46c5045c8e4",
  budgets: "918ff1d26a33",
  home: "1b2b69e26011",
};
{
  const scene = { today: "2026-11-12", month: "2026-10", rows: [...NOV, ...OCT], budgets: [...BUDGETS("2026-11"), ...BUDGETS("2026-10")] };
  const { pages } = await render(scene, { report: "/my/analysis?Q&view=report", analysis: "/my/analysis?Q", budgets: "/budgets?Q", home: "/app?Q" });
  for (const [name, hash] of Object.entries(ENDED_MONTH_TOKENS)) eq(tokenHash(pages[name]).slice(0, 12), hash, `끝난 달 ${name} 의 돈·비율·건수 글자가 그대로`);
  const { report } = pages;
  hasSeq(report, ["총 지출", "835,000원", "지난달 대비 835,000원 증가 (지난달 0원)"], "끝난 달 총 지출 카드 그대로");
  ok(!report.some((s) => s.startsWith("미리 적은 ")), "N-1 끝난 달에는 기준 줄이 없다");
  hasSeq(report, ["전월 대비 지출", "비교 기록 없음", "전월 0원 → 10월 835,000원"], "N-2·N-13 끝난 달은 전체 대 전체, 라벨은 10월");
  hasSeq(report, ["10월 지출 구성 (도넛 차트)", "10월 지출 구성"], "N-13 도넛 제목");
  hasSeq(report, ["전월 대비 분류 변화 TOP", "전월 대비 분류 변화 TOP", "지난달보다 크게 늘거나 줄어든 분류입니다.", "카테고리", "10월", "전월", "차이", "증감률"], "N-13 분류 변화 표 머리");
  ok(report.includes("2026-10-05 · 주거/관리 · 10월 지출의 78%"), "N-13 큰 지출 비중 라벨");
  hasSeq(report, ["잔여 총예산", "465,000원", "10월 사용 가능 금액"], "N-13 분석 도구 예산 칸");
  hasSeq(report, ["최근 3개월 평균", "835,000원", "8월~10월 가운데 기록이 있는 1개월의 평균이에요(지출 0원인 달 포함)."], "N-6 끝난 달은 그 달까지 세 달");
  for (const label of ["이번 달 지출 구성", "이번 달 지출의", "이번 달 사용 가능 금액"]) lacks(report, label, "N-13 끝난 달 종합 리포트");
  ok(pages.analysis.includes("10월 지출") && pages.analysis.includes("10월 수입"), "N-13 한눈에 보기 요약 칸");
  lacks(pages.analysis, "이번 달 지출", "N-13 한눈에 보기");
  ok(pages.budgets.includes("10월 남은 예산") && pages.budgets.includes("10월 지출"), "N-13 예산 화면");
  lacks(pages.budgets, "이번 달 남은 예산", "N-13 예산 화면");
  ok(pages.budgets.includes("분류별 금액의 합계가 10월 전체 지출 예산이 됩니다."), "N-13 예산 화면 계획 안내");
  lacks(pages.budgets, "이번 달 전체 지출 예산", "N-13 예산 화면 계획 안내");
  ok(pages.home.some((s) => s.startsWith("가장 많이 쓴 곳이고 10월 지출의 78%")), "N-13 홈 가장 많이 쓴 곳");
}

// ── 7. 직접 적은 기록이 없는 기간: N-9 ────────────────────────────────────────────
{
  // 이번 달 기록 0건(지난달만 있음). 고치기 전: ‘-100%’, ‘지난주와 비슷한 속도’, ‘안정적인 소비 흐름이에요’.
  const empty = await render({ today: "2026-11-12", month: "2026-11", rows: [...OCT] }, { report: "/my/analysis?Q&view=report" });
  const report = empty.pages.report;
  eq(report.filter((s) => s === "직접 적은 기록이 없어 지난달 같은 기간과 비교하지 않아요").length, 2, "N-9 총 지출·총 수입 카드");
  lacks(report, "-100%", "N-9 기록 0건 기간");
  hasSeq(report, ["지난주와 비교하지 않음"], "N-9 주간 리포트 머리");
  ok(report.includes("이번 주에 직접 적은 기록이 없어 지난주와 비교하지 않아요."), "N-9 주간 리포트 문장");
  lacks(report, "지난주와 비슷한 속도", "N-9 주간 판정");
  hasSeq(report, ["지난달 같은 기간 대비 지출", "-", "직접 적은 기록이 없어 비교하지 않아요."], "N-9 전략 카드");
  hasSeq(report, ["최대 증가 항목", "-", "직접 적은 기록이 없어 비교하지 않아요."], "N-9 최대 증가 항목");
  hasSeq(report, ["소비 신호", "-", "지출 기록이 없어 판정하지 않아요."], "N-9 소비 신호 카드");
  ok(report.includes("지출 기록이 없어 판정하지 않아요"), "N-9 분석 도구 소비 신호");
  hasSeq(report, ["이 기간에 직접 적은 기록이 없어 비교하지 않아요.", "비교할 데이터가 없습니다."], "N-9 분류 변화 TOP");
  ok(report.includes("이번 달 지출 기록이 없어요."), "N-9 큰 지출 체크");
  lacks(report, "안정적인 소비 흐름이에요", "N-9 큰 지출 체크 판정");

  // 정기 자동 기록만(이번 달 월세 650,000원). 고치기 전: ‘-11%’, ‘지난주보다 잘 아끼고 있어요’.
  const recurringOnly = [rec("pc-1", "2026-11-05", 650000, "주거/관리", "월세", "recurring-rent"), rec("pc-o1", "2026-10-05", 650000, "주거/관리", "월세", "recurring-rent"), tx("pc-o2", "2026-10-07", "expense", 80000, "식비", "장보기", "국민카드")];
  const reconly = (await render({ today: "2026-11-12", month: "2026-11", rows: recurringOnly, budgets: [{ month: "2026-11", category: "식비", amount: 300000 }] }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(reconly, ["총 지출", "650,000원", "직접 적은 기록이 없어 지난달 같은 기간과 비교하지 않아요"], "N-9 정기 자동 기록만");
  lacks(reconly, "-11%", "N-9 정기 자동 기록만");
  ok(reconly.includes("이번 주에 직접 적은 기록이 없어 지난주와 비교하지 않아요."), "N-9 정기 자동 기록만 주간");
  lacks(reconly, "지난주보다 잘 아끼고 있어요", "N-9 정기 자동 기록만 주간 판정");

  // 정기 자동 기록만 + 오늘 뒤 날짜로 미리 적은 지출 40,000원: 기준 줄은 ‘미리 적은 N원 포함’ 만(고치기 전: ‘… · 오늘까지 650,000원 · 지난달 같은 기간 730,000원’ —
  // 바로 위 ‘비교하지 않아요’ 옆에서 비교 금액을 보였다).
  const aheadRows = [...recurringOnly, tx("pc-f1", "2026-11-20", "expense", 40000, "식비", "모임", "국민카드")];
  const reconlyAhead = (await render({ today: "2026-11-12", month: "2026-11", rows: aheadRows }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(reconlyAhead, ["총 지출", "690,000원", "직접 적은 기록이 없어 지난달 같은 기간과 비교하지 않아요", "미리 적은 40,000원 포함"], "N-1×N-9 기준 줄은 미리 적은 금액만");
  lacks(reconlyAhead, "오늘까지 650,000원", "N-1×N-9 비교하지 않는 카드 아래 견준 금액");

  // 정기 자동 기록만 여덟 건(각 40,000원 = 12.5%, 큰 지출 기준 15% 미만): 큰 지출 체크가 빈 목록이어도 ‘안정적인 소비 흐름’ 이라고 판정하지 않는다.
  const eight = ["주거/관리", "공과금/통신", "보험", "교육", "구독", "교통", "의료", "기타"].map((c, i) => rec(`pm-${i}`, `2026-11-0${i + 1}`, 40000, c, `정기 ${i + 1}`, `recurring-m${i}`));
  const reconlyEight = (await render({ today: "2026-11-12", month: "2026-11", rows: [...eight, tx("pm-o1", "2026-10-07", "expense", 80000, "식비", "장보기", "국민카드")] }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(reconlyEight, ["큰 지출 체크", "평소 그 분류에서 쓰던 평균보다 크게 벗어난 지출입니다.", "직접 적은 기록이 없어 판정하지 않아요."], "N-9 큰 지출 체크 정기 자동 기록만");
  lacks(reconlyEight, "안정적인 소비 흐름이에요", "N-9 큰 지출 체크 정기 자동 기록만(고치기 전 ‘안정적인 소비 흐름이에요’)");

  // 끝난 달도 같다(10월 보기, 정기 자동 기록만). 고치기 전: ‘지난달 대비 -11%’.
  const recurringOct = [rec("pco-1", "2026-10-05", 650000, "주거/관리", "월세", "recurring-rent"), rec("pco-o1", "2026-09-05", 650000, "주거/관리", "월세", "recurring-rent"), tx("pco-o2", "2026-09-07", "expense", 80000, "식비", "장보기", "국민카드")];
  const reconlyOct = (await render({ today: "2026-11-12", month: "2026-10", rows: recurringOct }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(reconlyOct, ["총 지출", "650,000원", "직접 적은 기록이 없어 지난달과 비교하지 않아요"], "N-9 끝난 달 정기 자동 기록만");
  lacks(reconlyOct, "-11%", "N-9 끝난 달 정기 자동 기록만");
}

// ── 8. 배달/외식 = 생활비 리포트 배달 + 외식(N-3, 등록액 기준) ─────────────────────────
{
  const living = (lines) => { const bucket = (name) => { const i = lines.findIndex((s) => s.startsWith(`${name} `) && /원$/.test(s)); return { amount: won(lines[i]), count: won(lines[i + 1]) }; };
    const delivery = bucket("배달"), meal = bucket("외식"); return { amount: delivery.amount + meal.amount, count: delivery.count + meal.count }; };
  const box = (lines) => { const i = seqAt(lines, ["배달/외식"]); return { amount: won(lines[i + 1]), count: won(lines[i + 2]) }; };
  const rows = [
    tx("pa-1", "2026-11-03", "expense", 30000, "쇼핑", "옷", "국민카드"),
    tx("pa-4", "2026-11-06", "expense", 12000, "외식", "점심", "국민카드"),
    tx("pa-5", "2026-11-07", "expense", 35000, "외식", "저녁 모임", "국민카드"),
    tx("pa-6", "2026-11-08", "expense", 22000, "배달", "치킨", "국민카드"),
    tx("pa-7", "2026-11-09", "expense", 8000, "식비", "외식", "국민카드"),
    tx("pa-8", "2026-11-10", "expense", 16000, "식비", "배민 떡볶이", "국민카드"),
    tx("pa-o1", "2026-10-06", "expense", 20000, "외식", "점심", "국민카드"),
  ];
  const { pages } = await render({ today: "2026-11-12", month: "2026-11", rows }, { report: "/my/analysis?Q&view=report", living: "/reports?Q" });
  hasSeq(pages.report, ["배달/외식", "93,000원", "5건"], "N-3 배달/외식 칸(고치기 전 38,000원·2건 = 배달 낱말만)");
  eq(living(pages.living).amount, 93000, "N-3 미리 적은 배달·외식이 없으면 생활비 리포트 배달 + 외식 금액 = 배달/외식 칸");
  eq(living(pages.living).count, 5, "N-3 미리 적은 배달·외식이 없으면 생활비 리포트 배달 + 외식 건수 = 배달/외식 칸");

  // 오늘 뒤 날짜로 미리 적은 외식(11-22 ‘저녁 모임’ 식비 40,000원): 배달/외식 칸은 등록액이라 그만큼 크고, 생활비 리포트(오늘까지)는 그대로다.
  const ahead = await render({ today: "2026-11-12", month: "2026-11", rows: [...rows, tx("pa-f1", "2026-11-22", "expense", 40000, "식비", "저녁 모임", "국민카드")] },
    { report: "/my/analysis?Q&view=report", living: "/reports?Q" });
  hasSeq(ahead.pages.report, ["배달/외식", "133,000원", "6건"], "N-3 등록액 기준 배달/외식 칸(미리 적은 외식 포함)");
  eq(living(ahead.pages.living).amount, 93000, "N-3 생활비 리포트 배달 + 외식은 오늘까지(미리 적은 외식 제외)");
  eq(box(ahead.pages.report).amount - living(ahead.pages.living).amount, 40000, "N-3 미리 적은 외식이 있으면 배달/외식 칸이 그 금액만큼 크다");
  eq(box(ahead.pages.report).count - living(ahead.pages.living).count, 1, "N-3 미리 적은 외식이 있으면 배달/외식 칸이 그 건수만큼 크다");
}

// ── 9. 이름·미설정·저축률(N-4·N-7·N-8) ──────────────────────────────────────────
{
  const fixedRows = [
    rec("s2-1", "2026-11-05", 650000, "주거/관리", "월세", "recurring-rent"),
    rec("s2-2", "2026-11-06", 300000, "교육", "학원비", "recurring-edu"),
    tx("s2-3", "2026-11-08", "expense", 200000, "주거/관리", "보일러 수리", "국민카드"),
    tx("s2-4", "2026-11-10", "expense", 50000, "식비", "장보기", "국민카드"),
    tx("s2-5", "2026-11-11", "expense", 55000, "공과금/통신", "휴대폰 요금", "국민카드"),
  ];
  const fixed = (await render({ today: "2026-11-12", month: "2026-11", rows: fixedRows, recurringEdu: true }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(fixed, ["주거·통신·보험·구독", "905,000원", "지출 중 72%"], "N-4 분석 도구 값은 그대로");
  hasSeq(fixed, ["주거·통신·보험·구독 비중", "72%", "905,000원"], "N-4 소비 패턴 값은 그대로");

  const noIncome = (await render({ today: "2026-11-12", month: "2026-11", rows: [tx("ni-1", "2026-11-03", "expense", 357120, "식비", "장보기", "국민카드")] }, { report: "/my/analysis?Q&view=report" })).pages.report;
  ok(noIncome.includes("수입-지출 · 저축률 - (수입 기록 없음)"), "N-8 수입 기록이 없으면 저축률 ‘-’");
  lacks(noIncome, "저축률 0%", "N-8");
  const negative = (await render({ today: "2026-11-12", month: "2026-11", rows: [tx("ng-1", "2026-11-03", "expense", 500000, "쇼핑", "가전", "국민카드"), tx("ng-2", "2026-11-04", "income", 200000, "부수입", "중고판매", "카카오뱅크")] }, { report: "/my/analysis?Q&view=report" })).pages.report;
  ok(negative.includes("수입-지출 · 저축률 -150%"), "N-8 수입보다 지출이 크면 음수 그대로((200,000-500,000)/200,000)");

  // 예산이 없음 / 0원 행(단건 저장 /admin/budget/save 로 남을 수 있지만 계산이 예산으로 세지 않아 없는 것과 같다 — budgets.js budgetCategoryScope).
  for (const [label, budgets] of [["예산 없음", []], ["0원 예산 행", [{ month: "2026-11", category: "식비", amount: 0 }]]]) {
    const { pages } = await render({ today: "2026-11-12", month: "2026-11", rows: [...NOV, ...OCT], budgets }, { report: "/my/analysis?Q&view=report", budgets: "/budgets?Q" });
    hasSeq(pages.report, ["총 예산", "미설정", "사용"], `N-7 ${label} 게이지`);
    hasSeq(pages.report, ["잔여 총예산", "미설정", "이번 달 사용 가능 금액"], `N-7 ${label} 분석 도구`);
    ok(pages.budgets.includes("예산 미설정"), `N-7 ${label} 예산 화면`);
    lacks(pages.budgets, "예산 사용 0%", `N-7 ${label} 예산 화면`);
  }
}

// ── 10. 진행 중인 달인데 같은 기간 값을 못 구함(금액 칸이 빈 기록 하나): N-2 ‘확인 불가’ ─────────────
// 고치기 전: 머리 카드는 ‘확인 불가’ 인데 전략 카드·최대 증가 항목·분류 표는 지난달 전체와 견준 옛 값(‘전월 대비 지출 +32%’·‘여행 300,000원 증가’)이었다.
{
  const rows = [...NOV, tx("bad-1", "2026-11-06", "expense", "", "식비", "금액 빈 기록", "국민카드"), ...OCT];
  const report = (await render({ today: "2026-11-12", month: "2026-11", rows }, { report: "/my/analysis?Q&view=report" })).pages.report;
  hasSeq(report, ["총 지출", "1,104,800원", "확인 불가 · 자료를 다시 조회해 주세요"], "N-2 머리 카드 확인 불가");
  hasSeq(report, ["지난달 같은 기간 대비 지출", "확인 불가", "자료를 다시 조회해 주세요."], "N-2 전략 카드도 확인 불가");
  hasSeq(report, ["최대 증가 항목", "확인 불가", "자료를 다시 조회해 주세요."], "N-2 최대 증가 항목도 확인 불가");
  hasSeq(report, ["지난달 같은 기간 대비 분류 변화 TOP", "확인 불가 · 자료를 다시 조회해 주세요.", "비교할 데이터가 없습니다."], "N-2 분류 변화 표도 확인 불가");
  for (const old of ["전월 대비 지출", "전월 대비 분류 변화 TOP", "+32%", "300,000원 증가", "NaN"]) lacks(report, old, "N-2 확인 불가인 달");
}

// ── 11. 관리자 PC 분석(/analysis): 주간 카드는 종합 리포트와 같은 함수(N-9), 소비 신호 설명은 그 화면 이름 그대로(N-4) ─────────
{
  const adminLines = async (rows) => withClock("2026-11-12", () => fixture(async (fx) => {
    seed(fx, { rows, today: "2026-11-12" });
    fx.env.ADMIN_PASSWORD = "report-numbers-admin";
    fx.env.ADMIN_SESSION_SECRET = "report-numbers-admin-session";
    const login = await post(fx, "/login", { password: "report-numbers-admin", return_to: "/admin-view" }, { cookie: "" });
    const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
    ok(admin.length > "ab_admin=".length, "관리자 로그인 쿠키");
    const res = await page(fx, "/analysis?month=2026-11&household_id=house-home", { cookie: `${admin}; ${fx.cookie}` });
    eq(res.status, 200, "관리자 PC 분석 화면이 열린다");
    return textLines(res.html);
  }));
  // 이번 주(11/9~11/12)는 정기 자동 기록만. 고치기 전(9a646eb): ‘지난주 같은 시점 대비 +2067%’·‘지난주보다 소비 속도가 빨라요’ 판정.
  const reconly = await adminLines([rec("pa-r1", "2026-11-10", 650000, "주거/관리", "월세", "recurring-rent"), tx("pa-o", "2026-11-03", "expense", 30000, "식비", "점심", "국민카드")]);
  eq(after(reconly, ["주간 리포트"], 3), "지난주와 비교하지 않음", "N-9 관리자 PC 분석 주간 카드: 정기 자동 기록만이면 비교하지 않음");
  ok(reconly.includes("이번 주에 직접 적은 기록이 없어 지난주와 비교하지 않아요. 이번 주는"), "N-9 관리자 PC 분석 주간 카드 문장");
  // 직접 적은 기록이 있는 주는 예전 그대로.
  const own = await adminLines([...NOV, ...OCT]);
  eq(after(own, ["주간 리포트"], 3), "지난주 같은 시점 대비 -93%", "관리자 PC 분석 주간 카드: 직접 적은 기록이 있으면 예전 그대로");
  ok(own.some((s) => /^\d+점 · 고정비, 쏠림, 미정리, 월말 예상치를 합친 점수예요\./.test(s)), "N-4 관리자 PC 분석 소비 신호 설명은 그 화면 칸 이름(‘고정비 비중’)대로");
}

// ── 12. 환불 연결을 켠 이번 달 요약: ‘(오늘 뒤 날짜 N원 포함)’ 과 환불 차감 말이 함께 남는다(N-5) ─────────────
{
  const rows = [tx("rf-e1", "2026-11-05", "expense", 40000, "식비", "마트", "국민카드"), tx("rf-r1", "2026-11-10", "income", 40000, "환급", "마트 환불", "국민카드"),
    tx("rf-e2", "2026-11-08", "expense", 12000, "식비", "점심", "국민카드"), tx("rf-f1", "2026-11-20", "expense", 30000, "여행", "기차 예매", "국민카드")];
  const links = [{ id: "rf-link", household_id: "house-home", expense_id: "rf-e1", refund_id: "rf-r1", amount: 40000, created_by: "user-bin", created_at: "2026-11-10T01:00:00Z" }];
  const replies = await withClock("2026-11-12", () => fixture(async (fx) => {
    seed(fx, { rows, today: "2026-11-12" });
    fx.env.REFUND_LINKS_ENABLED = "1";
    fx.db.accountbook_refund_links = links;
    fx.db.household_members = fx.db.household_members.filter((m) => m.household_id !== "house-trip");
    fx.db.households = fx.db.households.filter((h) => h.id !== "house-trip");
    const find = (id) => fx.db.transactions.find((r) => r.id === id) || null;
    const pick = (row, cols) => (row ? Object.fromEntries(cols.map((c) => [c, row[c] ?? null])) : null);
    // 차감 읽기(refund:transactions!…·expense:transactions!… 묶음 조회, refund.transaction_date 범위)만 메모리 표로 답한다 — validate-refund-links-v22980 과 같은 꼴.
    const stop = intercept(async ({ url, method }) => {
      if (url.pathname !== "/rest/v1/accountbook_refund_links" || method !== "GET" || !(url.searchParams.get("select") || "").includes("refund:transactions!")) return undefined;
      const range = url.searchParams.getAll("refund.transaction_date");
      const gte = range.find((v) => v.startsWith("gte."))?.slice(4) || "", lt = range.find((v) => v.startsWith("lt."))?.slice(3) || "";
      const body = links.map((l) => ({ l, refund: find(l.refund_id), expense: find(l.expense_id) }))
        .filter(({ refund }) => refund && (!gte || refund.transaction_date >= gte) && (!lt || refund.transaction_date < lt))
        .map(({ l, refund, expense }) => ({ id: l.id, household_id: l.household_id, expense_id: l.expense_id, refund_id: l.refund_id, amount: l.amount, created_at: l.created_at,
          refund: pick(refund, ["id", "household_id", "user_id", "type", "amount", "category", "transaction_date"]), expense: pick(expense, ["id", "household_id", "user_id", "type", "amount", "category", "memo", "raw_text", "transaction_date"]) }));
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const say = async (u) => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.(); globalThis.__AB_KAKAO_INFLIGHT?.clear?.(); return skill(fx, u); };
      await say("요약"); await say("1");
      return { fallback: await say("얼마 썼어"), month: await say("이번 달 요약") };
    } finally { stop(); }
  }));
  ok(kakaoLines(replies.fallback).includes("지출: 42,000원 (오늘 뒤 날짜 30,000원 포함 · 환불 차감 40,000원 반영)"), "N-5 환불 연결 켬 ‘얼마 썼어’ 에도 미리 적은 금액 말");
  ok(kakaoLines(replies.month).includes("지출: 42,000원 · 3건 (오늘 뒤 날짜 30,000원 포함 · 환불 차감 40,000원 반영)"), "N-5 환불 연결 켬 이번 달 요약에도 미리 적은 금액 말");
}

done();
