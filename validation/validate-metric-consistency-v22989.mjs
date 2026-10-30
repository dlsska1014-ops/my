// V22.9.89 — 숫자 신뢰 검사(디자인 작업 지시서 V2 6단계 U-02·U-03·U-04·U-07·U-08·U-09·U-10·U-11·U-01 일부 + Codex Astra 리포트 7건).
//
// ── 이 파일이 왜 생겼는지 ──
// V2 지시서(docs/ux/MALHAEBOOK_UX_WORK_ORDER_V2.md §3)는 2026년 10월 픽스처의 30개 숫자를 손계산과 맞춘 뒤 "산수가 틀린 곳은 없다, 고칠 것은
// 정의 하나(연말정산)와 표시 방식"이라고 했다: 같은 이름에 다른 범위(홈 ‘지출 319,100원’ = 예산 쓴 돈, 분석 ‘이번 달 지출 462,000원’),
// 쓸 수 없는 하루 금액(남은 3일에 ‘하루 303,633원씩’), 문턱을 뺀 연말정산 ‘예상’. 같은 날 Codex Astra 리포트는 계산 쪽 일곱 가지를 더했다:
// 연간 월 평균에 미래 달 지출(1), 화면마다 다른 이번 달 합계의 기준(2), 정기 항목을 못 읽은 월말 예상(3), 기록 없는 날을 무지출로 셈(4),
// 지난 리포트의 현재 정기 항목(5), 연말정산 예상(6), ‘분석 신뢰도 0건’·‘가계부 경보 32점’·70 미만 ‘정상 범위’(7).
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처(DB·서버 없음)에 V2 §1 장면을 넣고(지출 9건 462,000원·수입 2건 3,380,000원·예산 3개 1,230,000원·월세 650,000원 반영 전·
// 자동차보험 연 1회 일정) 오늘을 2026-10-29 로 고정해 실제 화면(/app·/reports·/annual·/reserve-plans·/my/analysis)을 그린다.
// §3 의 값과 V2 §5-1 용어(옛 이름이 다시 나오지 않음)를 확인하고, Astra 장면은 기록을 바꿔 다시 그린다.
// 사용: node validation/validate-metric-consistency-v22989.mjs
import { readFileSync } from "node:fs";
import { counter, failure, fixture, intercept, page, withClock } from "./lib-audit-v22934.mjs";
import { approxWon } from "../src/modules/domain/metric-labels.js";

const t = counter("V22.9.89 숫자 신뢰(V2 §3 대조 30개 중 보호 화면 밖·용어 사전·월말 문장·정기 카드·연말정산·미등록 카드·기록 수·월요일 주·Astra 7건) 검사");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const text = (html) => String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const Q = "month=2026-10&household_id=house-home";
const tx = (id, date, type, amount, category, memo, payment, user = "user-bin", extra = {}) => ({ id, household_id: "house-home", user_id: user, transaction_date: date, type, amount, category, memo, payment_method: payment, source: "web", raw_text: memo, created_at: `${date}T03:00:00.000Z`, ...extra });
// V2 §1: 기록 11건(§3 손계산에서 거꾸로 맞춤 — 10/23~29 124,400원, 10/16~22 337,600원, 월 26~29일 70,400원, 결제수단·구성원별 합이 §3 과 같다).
const V2_ROWS = [
  tx("v2-inc-1", "2026-10-01", "income", 3200000, "급여", "10월 월급", "급여통장"),
  tx("v2-inc-2", "2026-10-05", "income", 180000, "부수입", "중고판매", "카카오뱅크"),
  tx("v2-ex-1", "2026-10-16", "expense", 148000, "식비", "주말 장보기", "국민카드", "user-wifi"),
  tx("v2-ex-2", "2026-10-19", "expense", 89000, "주거/관리", "관리비", "계좌이체"),
  tx("v2-ex-3", "2026-10-21", "expense", 72000, "교통", "주유", "현대카드"),
  tx("v2-ex-4", "2026-10-21", "expense", 28600, "카페/간식", "가족 카페", "카카오페이"),
  tx("v2-ex-5", "2026-10-24", "expense", 54000, "식비", "외식", "현대카드"),
  tx("v2-ex-6", "2026-10-26", "expense", 38900, "쇼핑", "생활용품", "현대카드"),
  tx("v2-ex-7", "2026-10-28", "expense", 15000, "의료", "약국", "국민카드", "user-wifi"),
  tx("v2-ex-8", "2026-10-29", "expense", 12000, "식비", "점심", "국민카드"),
  tx("v2-ex-9", "2026-10-29", "expense", 4500, "카페/간식", "커피", "카카오페이", "user-wifi"),
];
function seedV2(fx, rows = V2_ROWS) {
  fx.db.transactions = fx.db.transactions.filter((r) => r.household_id !== "house-home").concat(rows.map((r) => ({ ...r })));
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((b) => b.household_id !== "house-home" || b.month !== "2026-10").concat([
    ["식비", 800000], ["교통", 250000], ["카페/간식", 180000],
  ].map(([category, amount]) => ({ id: `v2-b-${category}`, household_id: "house-home", month: "2026-10", category, amount, created_at: "2026-10-01T00:00:00.000Z" })));
  for (const rule of fx.db.accountbook_recurring) if (rule.id === "recurring-rent") rule.last_applied_month = "2026-09";
}
const has = (haystack, needle) => String(haystack).includes(needle);
const retiredSource = read("src/modules/domain/metric-labels.js").match(/METRIC_RETIRED_LABELS = Object\.freeze\(\[([^\]]+)\]\)/);
const RETIRED = retiredSource ? [...retiredSource[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
t.deepEq(RETIRED, ["분석 신뢰도", "가계부 경보", "예산 밖", "관측 기간"], "U-02 옛 이름 목록이 metric-labels.js 한곳에 있다(V2 U-02 금지 라벨 넷)");
// 독립 검토(5): 근사 금액의 경계. 예전에는 월말에 남을 예산이 1~49원이면 ‘약 0원 남아요’, 99,950~99,999원은 ‘약 100,000원’, 1억 원부터 ‘약 10,000만 원’이었다.
t.deepEq([30, 49, 50, 15940, 99949, 99950, 100000, 1834567, 99995000, 123456789].map((v) => approxWon(v)),
  ["100원 미만", "100원 미만", "약 100원", "약 15,900원", "약 99,900원", "약 10만 원", "약 10만 원", "약 183만 원", "약 1억 원", "약 1억 2,346만 원"],
  "독립 검토 approxWon 경계: 반올림이 0원이면 ‘100원 미만’, 99,950원부터 만 원 단위, 1억 원부터 억 단위");

await withClock("2026-10-29", async () => {
  // ── V2 §1 그대로: §3 대조 ──
  await fixture(async (fx) => {
    seedV2(fx);
    const homeHtml = (await page(fx, `/app?${Q}`)).html;
    const home = text(homeHtml);
    t.ok(has(home, "남은 3일, 예산이 넉넉해요."), "U-04 남은 날이 5일 이하이고 월말 예상이 예산 안이면 짧게 말한다");
    // 빠른 입력 칸 아래 계산 줄("남은 예산 910,900원 · 하루 303,633원", 입력하면 바로 바뀌는 사실 계산)은 문장이 아니라 그대로 둔다.
    t.ok(!/303,633원씩/.test(home), "U-04 10/29 픽스처에서 쓸 수 없는 하루 금액 문장 ‘303,633원씩 쓰면 돼요’가 나오지 않는다(V2 §3 #7)");
    t.ok(has(home, "이대로면 월말에 예산이 약 89만 원 남아요"), "U-03 월말 문장은 예산 범위를 말하고 §5-2 대로 반올림한다(§3 #8 888,893 → 약 89만 원)");
    t.ok(!has(home, "월말 예상대로면"), "U-03 예전 문장 ‘월말 예상대로면 888,893원이 남아요’가 없다");
    t.ok(has(home, "예산에 안 넣은 월세 650,000원은 따로 나가요"), "U-03 예산에 넣지 않은 분류의 반영 전 월세를 한 줄로 따로 알린다");
    t.ok(has(home, "예산 1,230,000원 예산 쓴 돈 319,100원 예산 안 정한 지출 142,900원"), "U-02 홈 예산 카드 아래 줄 = 예산 · 예산 쓴 돈(§3 #2) · 예산 안 정한 지출(§3 #3, 옛 ‘예산 밖’)");
    t.ok(/class="homeBudgetAmount"[^>]*>\s*<b[^>]*>910,900</.test(homeHtml) || has(home, "910,900원"), "§3 #4 홈 큰 숫자 남은 예산 910,900원");
    t.ok(/<span>오늘 쓴 돈<\/span><b>16,500원<\/b>/.test(homeHtml), "U-01 한도 안의 오늘 쓴 돈(§3 #12 16,500원)에 수입 색(income)을 쓰지 않는다");
    t.ok(has(home, "정기 수입·지출 매달 나감 650,000원 · 들어옴 0원 이번 달 아직 안 나감 1건(월세 · 5일) 납부·입금 일정 1건 · 자동차보험 2027년 8월"),
      "U-07 홈 정기 카드: 매달 고정 항목이 첫 줄, 아직 안 나간 월세, 납부·입금 일정은 셋째 줄(ISO 날짜 없음)");
    t.ok(/앞으로 나갈 돈 정기지출 650,000원/.test(home), "U-07 요약 카드의 ‘앞으로 나갈 돈’도 같은 650,000원이다(같은 homeUpcomingOut)");
    t.ok(has(homeHtml, "<div class=\"homeReportTop\"><span>최근 7일</span>") && !has(homeHtml, "<span>쓰는 속도</span>"), "U-11 최근 7일을 견주는 홈 카드 이름은 ‘최근 7일’이다(한 주와 다른 기간)");
    const reserveHtml = (await page(fx, `/reserve-plans?${Q}`)).html;
    const reserve = text(reserveHtml);
    t.ok(has(reserve, "등록 항목 매달 1 · 일정 1 매달 나감 650,000원 들어옴 0원 이번 달 아직 안 나감 1건 월세 650,000원"), "U-07 /reserve-plans 위 요약이 매달 고정 항목 기준이다");
    const order = ["매달 자동 기록", "다가오는 납부·입금", "납부·입금 일정 추가"].map((h) => reserveHtml.indexOf(`<h2>${h}</h2>`));
    t.ok(order.every((at) => at > 0) && order[0] < order[1] && order[1] < order[2], "U-07 칸 순서는 매달 자동 기록 → 다가오는 납부·입금 → 추가 폼");
    t.ok(/다가오는 납부·입금[\s\S]*월 준비 권장액/.test(reserve) && !/등록 항목[^가]{0,80}월 준비 권장액/.test(reserve.slice(0, reserve.indexOf("매달 자동 기록"))), "U-07 ‘월 준비 권장액’은 납부·입금 일정 칸 안으로 옮겼다");

    const reportsHtml = (await page(fx, `/reports?${Q}`)).html;
    const reports = text(reportsHtml);
    t.ok(has(reports, "지출 462,000원 오늘까지 29일 동안"), "§3 #1 생활비 리포트 이번 달 지출 462,000원과 기준(오늘까지)");
    t.ok(has(reports, "하루 평균 15,931원 29일 평균 · 지출한 날 7일"), "§3 #11 하루 평균 15,931원은 29일 평균이라고 적는다(Astra 2)");
    t.ok(has(reports, "기록 11건 지출 9 · 수입 2 · 무지출 22일"), "U-10 기록 수를 지출·수입으로 나눠 적고 §3 #21 무지출 22일");
    t.ok(has(reports, "등록 안 된 카드: 현대카드 164,900원(3건)"), "U-09 등록하지 않은 카드 사용액이 말없이 빠지지 않는다(§3 #29 현대카드 164,900원)");
    const share = (reportsHtml.match(/<textarea[^>]*id="reportShare"[^>]*>([\s\S]*?)<\/textarea>/) || [])[1] || "";
    t.ok(has(share, "기록 11건 · 지출 9 · 수입 2") && /\d+\/\d+\([월화수목금토일]\) 작성 · 말해가계부/.test(share), "U-10·Astra 5 공유 글도 기록 수를 나누고 언제 만든 글인지 적는다");

    const annual = text((await page(fx, "/annual?year=2026&household_id=house-home")).html);
    t.ok(has(annual, "연간 지출 462,000원") && has(annual, "월 평균 지출 · 기록 있는 1개월 462,000원"), "Astra 1 연간 월 평균은 같은 기록으로 합과 달 수를 센다(미래 기록 없음)");
    t.ok(has(annual, "신용카드 사용액 339,900원"), "§3 #26 연간 신용카드 사용액 339,900원(사용액 칸은 둔다)");
    t.ok(!/예상 50,985원|예상 9,930원|예상 \d[\d,]*원/.test(annual), "U-08 연말정산 칸에 ‘예상’ 공제 금액이 없다(§3 #30 50,985원 / 9,930원)");
    t.ok(has(annual, "공제는 총급여의 25%를 넘게 쓴 부분부터 계산돼요. 문턱을 넘은 뒤에는 체크카드·현금영수증 공제율이 더 높아요.") && has(annual, "참고용 안내"), "U-08 25% 문턱 안내와 기존 참고용 안내");

    const cockpitHtml = (await page(fx, `/my/analysis?${Q}`)).html;
    const cockpit = text(cockpitHtml);
    t.ok(has(cockpit, "이번 달 지출 462,000원") && has(cockpit, "남은 예산 910,900원") && has(cockpit, "월말 예상 지출 1,143,862원"), "§3 #1·#4·#9 분석 한눈에 보기의 같은 이름은 같은 값이다");
    const report = text((await page(fx, `/my/analysis?view=report&${Q}`)).html);
    t.ok(has(report, "무지출일 22일"), "§3 #21 종합 리포트 무지출일 22일(생활비 리포트와 같은 값)");
    t.ok(has(report, "정리할 기록 깔끔해요") && !has(report, "분석 신뢰도") && !has(report, "분류 누락"), "Astra 7 ‘분석 신뢰도 0건’·‘분류 누락’ → ‘정리할 기록’(0이면 깔끔해요)");
    t.ok(/소비 신호 안정 \d+점 · 고정비, 쏠림, 미정리, 월말 예상치를 합친 점수예요\. 45점부터 주의, 70점부터 넘침 위험이에요\./.test(report) && !has(report, "가계부 경보") && !has(report, "정상 범위"),
      "Astra 7 ‘가계부 경보 N점’ → 소비 신호(안정·주의·넘침 위험), 점수와 경계(45·70)를 설명하고 ‘정상 범위’(70 미만)를 쓰지 않는다");
    for (const [name, body] of [["홈", home], ["생활비 리포트", reports], ["연간 리포트", annual], ["정기 수입·지출", reserve]]) {
      const found = RETIRED.filter((label) => has(body, label));
      t.deepEq(found, [], `U-02 ${name} 화면에 옛 이름(${RETIRED.join("·")})이 없다`);
    }
    t.deepEq(["분석 신뢰도", "가계부 경보", "예산 밖"].filter((label) => has(cockpit + report, label)), [], "U-02 소비 분석(한눈에 보기·종합 리포트)에도 옛 이름 셋이 없다(‘관측 기간’은 D-5 결정 뒤)");
  });

  // ── Astra 2·1: 오늘 뒤 날짜 기록(10/30 가스비 50,000 · 11/5 보증금 900,000) ──
  await fixture(async (fx) => {
    seedV2(fx, [...V2_ROWS, tx("fut-1", "2026-10-30", "expense", 50000, "주거/관리", "가스비", "계좌이체"), tx("fut-2", "2026-11-05", "expense", 900000, "주거/관리", "보증금 일부", "계좌이체")]);
    const reports = text((await page(fx, `/reports?${Q}`)).html);
    t.ok(has(reports, "지출 462,000원 오늘까지 29일 동안 · 오늘 뒤 날짜 50,000원 제외"), "Astra 2 생활비 리포트는 오늘까지만 세고 오늘 뒤 날짜 기록 금액을 ‘제외’로 적는다");
    const cockpit = text((await page(fx, `/my/analysis?${Q}`)).html);
    t.ok(has(cockpit, "이번 달 지출 · 미리 적은 50,000원 포함 512,000원"), "Astra 2 분석 한눈에 보기는 그 달 기록을 모두 세고 ‘미리 적은 N원 포함’을 붙인다");
    const annual = text((await page(fx, "/annual?year=2026&household_id=house-home")).html);
    t.ok(has(annual, "연간 지출 1,412,000원 오늘 뒤 날짜 기록 950,000원 포함"), "Astra 1 연간 지출 합은 모든 기록이고 오늘 뒤 날짜 금액을 적는다");
    t.ok(has(annual, "월 평균 지출 · 오늘까지 기록 있는 1개월 462,000원"), "Astra 1 월 평균은 오늘까지 기록으로 센다(예전 1,412,000원 ÷ 1개월)");
  });

  // ── Astra 3: 정기 항목을 못 읽은 월말 예상 ──
  await fixture(async (fx) => {
    seedV2(fx);
    const restore = intercept(({ url, method }) => method === "GET" && /accountbook_recurring/.test(url.pathname) ? failure(503) : null);
    try {
      const cockpit = text((await page(fx, `/my/analysis?${Q}`)).html);
      t.ok(/월말 예상 지출 · 정기 항목 빼고 계산 [\d,]+원/.test(cockpit), "Astra 3 정기 항목을 못 읽은 월말 예상에는 ‘정기 항목 빼고 계산’을 붙인다");
      const report = text((await page(fx, `/my/analysis?view=report&${Q}`)).html);
      t.ok(/월말 예상 지출 · 정기 항목 빼고 계산 [\d,]+원/.test(report), "Astra 3 종합 리포트 숫자 칸도 같다");
    } finally { restore(); }
  });

  // ── Astra 4: 기록 없는 가계부 / 이번 달에 시작한 가계부 ──
  await fixture(async (fx) => {
    seedV2(fx, []);
    const reportsHtml = (await page(fx, `/reports?${Q}`)).html;
    const reports = text(reportsHtml);
    t.ok(has(reports, "기록 0건 지출 0 · 수입 0 · 직접 적은 기록 없음") && !/무지출 \d+일/.test(reports), "Astra 4 기록이 없는 가계부는 무지출을 세지 않는다(예전 ‘무지출 29일’)");
    t.ok(!reportsHtml.includes("🌿"), "Astra 4 기록이 없으면 무지출 배지가 없다");
    const analysis = text((await page(fx, `/my/analysis?${Q}`)).html);
    t.ok(has(analysis, "무지출 0/4일") && has(analysis, "직접 적은 기록이 없어 성공한 날을 세지 않았어요") && !has(analysis, "목표를 달성했습니다"), "Astra 4 기록이 없으면 기본 챌린지가 ‘무지출 4/4일 · 목표를 달성했습니다’가 아니다");
    const report = text((await page(fx, `/my/analysis?view=report&${Q}`)).html);
    t.ok(/무지출일 - /.test(report) && has(report, "직접 적은 기록 없음"), "Astra 4 종합 리포트 무지출일도 ‘-’ · 직접 적은 기록 없음");
    const home = text((await page(fx, `/app?${Q}`)).html);
    t.ok(has(home, "무지출 0/4일"), "Astra 4 홈 챌린지도 0/4일이다");
    t.ok(/오늘 쓴 돈 아직 없어요/.test(home), "U-01 오늘 쓴 돈이 0원이면 ‘아직 없어요’");
  });
  await fixture(async (fx) => {
    seedV2(fx, [tx("new-1", "2026-10-21", "expense", 30000, "식비", "장보기", "국민카드"), tx("new-2", "2026-10-25", "expense", 8000, "카페/간식", "커피", "카카오페이")]);
    for (const h of fx.db.households) if (h.id === "house-home") h.created_at = "2026-10-19T15:30:00.000Z"; // KST 10/20 00:30
    const reports = text((await page(fx, `/reports?${Q}`)).html);
    t.ok(has(reports, "무지출 8일"), "Astra 4 이번 달에 만든 가계부는 만든 날(KST 10/20)부터 센다: 10/20~29 10일 − 지출한 날 2일 = 8일(예전 27일)");
    const report = text((await page(fx, `/my/analysis?view=report&${Q}`)).html);
    t.ok(has(report, "무지출일 8일"), "Astra 4 종합 리포트도 같은 시작일로 센다");
    const analysis = text((await page(fx, `/my/analysis?${Q}`)).html);
    t.ok(has(analysis, "기간 2026-10-20 ~ 2026-10-23"), "Astra 4 저장하지 않은 기본 챌린지는 가계부를 시작한 날부터 4일이다");
  });

  // ── Astra 5: 끝난 기간(9월) 리포트 ──
  await fixture(async (fx) => {
    seedV2(fx, [...V2_ROWS, tx("sep-rent", "2026-09-05", "expense", 650000, "주거/관리", "월세", "계좌이체", "user-bin", { source: "recurring", raw_text: "recurring:recurring-rent:2026-09" }), tx("sep-1", "2026-09-10", "expense", 30000, "식비", "점심", "국민카드")]);
    const html = (await page(fx, "/reports?month=2026-09&household_id=house-home")).html;
    const body = text(html);
    t.ok(has(body, "이 기간에 기록된 정기 지출 650,000원 월세 9/5(토) 650,000원 지금 등록한 정기 지출은 1건, 매달 650,000원이에요(오늘 기준)."), "Astra 5 지난 기간은 그 기간에 자동 기록된 정기 지출과 지금 등록한 항목(오늘 기준)을 나눠 적는다");
    t.ok(!has(body, "고정비 1건 등록") && !has(body, "30일 안에 나갈 적립 계획") && !has(body, "선택한 달 반영"), "Astra 5 지난 기간에는 ‘고정비 N건 등록’ 배지·오늘 기준 적립 계획·반영 꼬리표가 없다");
    const share = (html.match(/<textarea[^>]*id="reportShare"[^>]*>([\s\S]*?)<\/textarea>/) || [])[1] || "";
    t.ok(has(share, "이 기간에 기록된 정기 지출 650,000원 (1건)") && !has(share, "고정비 650,000원"), "Astra 5 공유 글도 그 기간의 정기 지출을 쓴다");
  });

  // ── U-11: 한 주는 월요일 시작 ──
  await fixture(async (fx) => {
    seedV2(fx);
    const weekly = (await page(fx, `/app?${Q}&trend=weekly`)).html;
    t.ok(/1~4일/.test(text(weekly)) && /26~31일/.test(text(weekly)) && has(weekly, "한 주는 월요일~일요일"), "U-11 홈 ‘주별’ 탭은 월요일~일요일로 나눈다(10/1 목요일 → 1~4일, 마지막 26~31일)");
    const calendar = (await page(fx, `/app?${Q}&view=calendar`)).html;
    const heads = [...calendar.matchAll(/<span class="calDow[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
    t.deepEq(heads, ["월", "화", "수", "목", "금", "토", "일"], "U-11 홈 캘린더 한 줄도 월요일부터");
    const grid = calendar.slice(calendar.indexOf('class="calDow'));
    t.eq((grid.slice(0, grid.indexOf("<b>1</b>")).match(/calDay blank/g) || []).length, 3, "U-11 10월 1일(목) 앞 빈칸은 3개(월·화·수)");
    t.ok(/<span class="calDow sat">토<\/span><span class="calDow sun">일<\/span>/.test(calendar), "U-11 토·일 색 표시는 요일 이름을 따라간다");
    t.ok(!read("src/modules/admin/pc-analysis-calendar.js").includes("일요일부터 한 주를 세므로"), "U-11 ‘홈 주별 탭은 일요일부터’ 사과 문구를 지웠다");
  });

  // ── U-04: 15일(최근 7일 지출 없음)에는 지금 문장을 유지 ──
  await fixture(async (fx) => {
    seedV2(fx);
    await withClock("2026-10-15", async () => {
      const home = text((await page(fx, `/app?${Q}`)).html);
      t.ok(/이번 달의 48%가 지났고 예산은 \d+%만 썼어요\. 하루 [\d,]+ ?원씩 쓰면 돼요\./.test(home), "U-04 15일로 고정한 V2 픽스처에서는 지금 문장이 유지된다");
    });
  });

  // ── Astra 2 곁가지: 미리 적은 지출이 속도 예상보다 크면 월말 예상의 바닥이 된다(spending-outlook.js) ──
  // 10/20 기준 V2 기록(예산 쓴 돈 148,000원) + 10/25 로 미리 적은 식비 400,000원. 예전에는 남은 날 예상(약 81,400원)만 더해
  // ‘월말에 예산이 약 100만 원 남아요’라 했지만 지금 남은 예산은 682,000원이었다. 월말에 남을 예산은 지금 남은 예산을 넘을 수 없다.
  await fixture(async (fx) => {
    seedV2(fx, [...V2_ROWS.filter((r) => r.transaction_date <= "2026-10-20"), tx("v2-ahead", "2026-10-25", "expense", 400000, "식비", "미리 적은 회식", "국민카드")]);
    await withClock("2026-10-20", async () => {
      const home = text((await page(fx, `/app?${Q}`)).html);
      t.ok(home.includes("남은 예산 682,000원"), "Astra 2 미리 적은 400,000원도 남은 예산에서 뺀다(1,230,000 − 548,000)");
      t.ok(home.includes("이대로면 월말에 예산이 약 68만 원 남아요"), "Astra 2 월말에 남을 예산(약 68만 원)이 지금 남은 예산 682,000원을 넘지 않는다");
      t.ok(!home.includes("약 100만 원 남아요"), "Astra 2 미리 적은 지출을 빼고 본 예전 문장(약 100만 원 남아요)이 나오지 않는다");
    });
  });

  // ── Z-9(Astra 4 와 같은 갈래): 직접 적은 기록이 없는 기간을 ‘덜 썼어요’라고 하지 않는다 ──
  // 9월 2일에 지출 50,000원, 10월은 1~3일에 기록이 없고 10/20 로 미리 적은 점심만 있다(10/3 기준). 예전 홈은 ‘지난달 1~3일보다 50,000원 덜 썼어요’,
  // 생활비 리포트는 ‘지난달 같은 기간(1~3일)보다 50,000원 덜 썼어요 (−100%)’와 ‘📉 … 100% 적게’ 배지를 붙였다.
  await fixture(async (fx) => {
    seedV2(fx, [tx("sep-a", "2026-09-02", "expense", 50000, "식비", "장보기", "국민카드"), tx("oct-later", "2026-10-20", "expense", 12000, "식비", "미리 적은 점심", "국민카드"),
      tx("oct-rent", "2026-10-01", "expense", 650000, "주거/관리", "월세", "계좌이체", "user-bin", { source: "recurring", raw_text: "recurring:recurring-rent:2026-10" })]);
    await withClock("2026-10-03", async () => {
      const home = text((await page(fx, `/app?${Q}`)).html);
      t.ok(has(home, "직접 적은 기록이 없어 지난달 1~3일과 비교하지 않아요.") && !has(home, "덜 썼어요") && !has(home, "더 썼어요"), "Z-9 홈: 오늘까지 직접 적은 기록이 없으면(정기 자동 기록·미리 적은 기록만) 지난달 같은 기간과 견주지 않는다");
      const reportsHtml = (await page(fx, `/reports?${Q}`)).html;
      const reports = text(reportsHtml);
      t.ok(has(reports, "이 기간에 직접 적은 기록이 없어 비교하지 않아요.") && !has(reports, "덜 썼어요") && !has(reports, "더 썼어요") && !reportsHtml.includes("📉"), "Z-9 생활비 리포트: 직접 적은 기록이 없는 기간은 비교 문장·감소 배지가 없다");
    });
    // 같은 기간에 직접 적은 기록이 하나라도 생기면 예전처럼 견준다.
    fx.db.transactions = fx.db.transactions.filter((r) => r.id !== "oct-rent").concat([tx("oct-1", "2026-10-02", "expense", 9000, "카페/간식", "커피", "카카오페이")]);
    await withClock("2026-10-03", async () => {
      const home = text((await page(fx, `/app?${Q}`)).html);
      t.ok(has(home, "지난달 1~3일보다 41,000원 덜 썼어요."), "Z-9 홈: 직접 적은 기록이 있으면 예전처럼 견준다(9,000 − 50,000)");
      const reports = text((await page(fx, `/reports?${Q}`)).html);
      t.ok(/지난달 같은 기간\(1~3일\)보다 41,000원 덜 썼어요/.test(reports), "Z-9 생활비 리포트: 직접 적은 기록이 있으면 예전처럼 견준다");
    });
  });

  // ── V22.9.89 독립 검토(병합 전, 1~6) ──
  // (1) 오늘 쓴 돈의 ‘하루 한도를 넘었어요’는 오늘 아침의 하루 한도와 오늘 직접 적은 예산 분류 지출로 견준다. 10/20(남은 12일), 10/5 식비 30,000원만
  // 있으면 오늘 아침 남은 예산 1,200,000원 → 하루 100,000원. 예전 비교는 오늘 쓴 돈을 뺀 뒤의 한도(91,666원)와 모든 분류·정기 자동 기록을 견줬다.
  await fixture(async (fx) => {
    const base = [tx("lim-0", "2026-10-05", "expense", 30000, "식비", "장보기", "국민카드")];
    const todayLine = async () => ((await page(fx, `/app?${Q}`)).html.match(/<div class="homeBudgetToday">([\s\S]*?)<\/div>/) || [])[1] || "";
    await withClock("2026-10-20", async () => {
      seedV2(fx, base);
      t.ok(/하루 100,000 ?원씩 쓰면 돼요/.test(text((await page(fx, `/app?${Q}`)).html)), "독립 검토 1 장면: 오늘 아침 하루 금액은 100,000원이다");
      seedV2(fx, [...base, tx("lim-1", "2026-10-20", "expense", 100000, "식비", "회식", "국민카드")]);
      t.eq(await todayLine(), "<span>오늘 쓴 돈</span><b>100,000원</b>", "독립 검토 1 안내받은 하루 금액만큼 쓰면 넘었다고 하지 않는다(예전 ‘하루 한도를 넘었어요’)");
      seedV2(fx, [...base, tx("lim-2", "2026-10-20", "expense", 200000, "의료", "병원", "국민카드")]);
      t.eq(await todayLine(), "<span>오늘 쓴 돈</span><b>200,000원</b>", "독립 검토 1 예산을 정하지 않은 분류의 지출은 하루 한도와 견주지 않는다(금액 칸은 오늘 쓴 돈 전부)");
      seedV2(fx, [...base, tx("lim-3", "2026-10-20", "expense", 300000, "식비", "정기 배송", "국민카드", "user-bin", { source: "recurring", raw_text: "recurring:recurring-meal:2026-10" })]);
      t.eq(await todayLine(), "<span>오늘 쓴 돈</span><b>300,000원</b>", "독립 검토 1 정기 자동 기록은 하루 한도와 견주지 않는다");
      seedV2(fx, [...base, tx("lim-4", "2026-10-20", "expense", 100010, "식비", "회식", "국민카드")]);
      t.eq(await todayLine(), "<span>오늘 쓴 돈 · 하루 한도를 넘었어요</span><b class=\"expense\">100,010원</b>", "독립 검토 1 오늘 아침 한도(100,000원)를 넘으면 글과 넘침 색으로 알린다");
    });
  });
  // (2) /reserve-plans: 고정 항목 목록을 못 읽으면(D-25) 첫 칸도 ‘매달 0’이라 하지 않는다.
  await fixture(async (fx) => {
    seedV2(fx);
    const restore = intercept(({ url, method }) => method === "GET" && /accountbook_recurring/.test(url.pathname) ? failure(503) : null);
    try {
      const reserve = text((await page(fx, `/reserve-plans?${Q}`)).html);
      t.ok(has(reserve, "등록 항목 매달 확인 불가 · 일정 1") && !/매달 0 · 일정/.test(reserve), "독립 검토 2 /reserve-plans 고정 항목을 못 읽으면 ‘매달 확인 불가’(예전 ‘매달 0’)");
    } finally { restore(); }
  });
  // (3) 직접 적은 기록이 없어 지난 날을 셀 수 없으면 챌린지를 날짜 칸으로 그리지 않는다. 홈 칸의 상태 글자는 1년 캐시 클라이언트가 붙여
  // ‘기록 없음’ 칸이 ‘○ 예정’으로 읽혔다. 기록이 있으면 예전처럼 날짜 칸이다.
  await fixture(async (fx) => {
    seedV2(fx, []);
    const homeHtml = (await page(fx, `/app?${Q}`)).html;
    t.ok(!homeHtml.includes("data-ab-challenge-slots") && /class="reportChallengePercent"[\s\S]{0,400}?0\/4일 달성/.test(homeHtml), "독립 검토 3 홈 챌린지: 기록이 없으면 지난 날을 ‘예정’ 칸으로 그리지 않고 달성률 0/4일로 보인다");
    const analysisHtml = (await page(fx, `/my/analysis?${Q}`)).html;
    const challengeHtml = analysisHtml.slice(analysisHtml.indexOf('id="reportChallenge"'));
    t.ok(!/class="reportChallengeDays"/.test(challengeHtml) && challengeHtml.includes("0/4일 달성") && !challengeHtml.includes("○ 예정"), "독립 검토 3 소비 분석 챌린지도 날짜 칸·‘○ 예정’ 범례 없이 달성률로 보인다");
    seedV2(fx);
    t.ok((await page(fx, `/app?${Q}`)).html.includes("data-ab-challenge-slots=\"1:목:s,2:금:s,3:토:s,4:일:s\""), "독립 검토 3 직접 적은 기록이 있으면 예전처럼 날짜 칸이다(10/1~4 무지출 성공)");
  });
  // (4) 무지출일의 시작일은 화면마다 같은 기간의 기록으로 센다. 10/20(KST)에 만든 가계부에 9/10·10/5·10/25 기록: 예전 생활비 리포트는 두 달치 기록으로
  // 9/10 을 시작일로 보아 ‘무지출 27일’, 종합 리포트는 그 달 기록으로 ‘무지출일 23일’이었다.
  await fixture(async (fx) => {
    seedV2(fx, [tx("bf-sep", "2026-09-10", "expense", 20000, "식비", "지난달에 적은 장보기", "국민카드"), tx("bf-oct", "2026-10-05", "expense", 30000, "식비", "장보기", "국민카드"), tx("bf-oct2", "2026-10-25", "expense", 8000, "카페/간식", "커피", "카카오페이")]);
    for (const h of fx.db.households) if (h.id === "house-home") h.created_at = "2026-10-19T15:30:00.000Z"; // KST 10/20 00:30
    const reports = text((await page(fx, `/reports?${Q}`)).html);
    const report = text((await page(fx, `/my/analysis?view=report&${Q}`)).html);
    t.ok(has(reports, "무지출 23일") && !has(reports, "무지출 27일") && has(report, "무지출일 23일"), "독립 검토 4 생활비 리포트와 종합 리포트의 무지출일이 같다(10/5~29 25일 − 지출한 날 2일)");
    t.ok(has(text((await page(fx, `/my/analysis?${Q}`)).html), "기간 2026-10-05 ~ 2026-10-08"), "독립 검토 4 기본 챌린지도 같은 시작일(10/5)부터다");
  });
  // (6) 아직 오지 않은 달은 그 달 기록이 모두 미리 적은 것이다 — 분석 한눈에 보기에 ‘미리 적은 N원 포함’을 붙인다(예전에는 표시 없음).
  await fixture(async (fx) => {
    seedV2(fx, [...V2_ROWS, tx("nov-ahead", "2026-11-03", "expense", 900000, "주거/관리", "미리 적은 이사 비용", "계좌이체")]);
    const cockpit = text((await page(fx, "/my/analysis?month=2026-11&household_id=house-home")).html);
    t.ok(has(cockpit, "이번 달 지출 · 미리 적은 900,000원 포함 900,000원"), "독립 검토 6 다음 달을 보면 그 달 지출이 모두 미리 적은 것임을 적는다");
  });
});

t.done();
