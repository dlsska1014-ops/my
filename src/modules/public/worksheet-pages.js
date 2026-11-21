// @build:imports-start
import { worksheetComputeV229106 } from "./worksheet-calculations.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

const PUBLIC_WORKSHEETS_V229106 = {
  "shared-living-cost-rules": {
    title: "공동 생활비 네 가지 분담 계산표",
    outcome: "각 지출에 참여한 사람을 먼저 정한 뒤 그 안에서 균등·소득·이용량·합의 비율을 비교합니다.",
    instruction: "참여자 이름은 쉼표 없이 적고 각 지출의 참여자는 A,B,C처럼 적습니다. 본문의 전체 금액 동일 분배를 재현하려면 모든 지출에 전체 참여자를 선택합니다. 품목별 분배를 재현하려면 그 품목을 함께 쓴 사람만 선택한 뒤 균등 결과를 봅니다. 소득·이용량·합의 칸은 선택한 사람 사이의 비율이며, 인원수 기준은 해당 인원수를 비율로 입력할 수 있습니다. 같은 참여자의 지출을 합친 뒤 원 단위로 배분합니다.",
    fields: [],
    groups: [
      { key: "people", label: "참여자와 비율", max: 12, columns: [["name", "이름", "text"], ["income", "소득 비율", "number"], ["use", "이용량 비율", "number"], ["agreed", "합의 비율", "number"]] },
      { key: "transactions", label: "원본 지출", columns: [["payer", "결제자", "text"], ["amount", "금액(원)", "number"], ["participants", "참여자(쉼표로 구분)", "text"]] },
    ],
    example: { settings: {}, people: [{ name: "A", income: 3, use: 1, agreed: 40 }, { name: "B", income: 2, use: 2, agreed: 35 }, { name: "C", income: 1, use: 3, agreed: 25 }], transactions: [{ payer: "A", amount: 60001, participants: "A,B,C" }, { payer: "B", amount: 40000, participants: "A,B,C" }, { payer: "C", amount: 20000, participants: "A,B,C" }] },
    checks: ["균등 분담은 40,001원·40,000원·40,000원이며 C가 A에게 20,000원을 보냅니다.", "A가 12,000원을 낸 지출에 A,B만 참여하도록 추가하면 C는 그 항목을 부담하지 않습니다.", "참여자가 없거나 비율의 합이 0이면 완료 결과 대신 수정 안내가 나옵니다."],
  },
  "roommate-shared-ledger": {
    title: "중도 입퇴거 공동 비용 계산표",
    outcome: "같은 월 비용을 날짜별 거주자 분담과 총 거주 인일 비례로 비교합니다. 거주자가 없는 날의 비용을 따로 남깁니다.",
    instruction: "시작일과 입주일은 포함하고 종료일과 퇴거일은 제외합니다. 11월 전체는 11월 1일부터 12월 1일 전까지입니다. 보증금과 별도 합의한 비용은 이 계산에 섞지 않습니다.",
    fields: [["start", "비용 시작일(포함)", "date"], ["end", "비용 종료일(제외)", "date"], ["cost", "공동 비용(원)", "number"]],
    groups: [{ key: "people", label: "거주 기간", max: 12, columns: [["name", "이름", "text"], ["start", "입주일(포함)", "date"], ["end", "퇴거일(제외)", "date"]] }],
    example: { settings: { start: "2026-11-01", end: "2026-12-01", cost: 90000 }, people: [{ name: "A", start: "2026-11-01", end: "2026-12-01" }, { name: "B", start: "2026-11-11", end: "2026-12-01" }] },
    checks: ["날짜별 분담은 A 60,000원·B 30,000원, 인일 비례는 A 54,000원·B 36,000원입니다.", "이 차이는 계산 오류가 아니라 합의 방식의 차이입니다. 임대차법상 유일한 기준으로 제시하지 않습니다.", "28·29·31일인 달과 중도 퇴거도 날짜를 바꿔 확인할 수 있습니다."],
  },
  "cash-flow-table": {
    title: "계좌 범위를 정하는 현금흐름 계산표",
    outcome: "원본 입출금에서 현금흐름 여섯 줄과 기말잔액을 만들고, 거래마다 포함하거나 제외한 이유를 확인합니다.",
    instruction: "관리 계좌는 A,B처럼 적습니다. 범위 밖 거래처는 외부로 표시하고, 확인된 내부 이체는 출금·입금을 한 행에 묶습니다. 금액은 양수로 적고 보낸 계좌와 받은 계좌로 방향을 구분합니다.",
    fields: [["accounts", "관리 계좌(쉼표로 구분)", "text"], ["beginning", "관리 계좌 합산 기초잔액(원)", "number"]],
    groups: [{ key: "transactions", label: "입출금과 확인한 이체", columns: [["id", "거래 ID", "text"], ["from", "보낸 계좌", "text"], ["to", "받은 계좌", "text"], ["amount", "금액(원)", "number"], ["kind", "구분", "select", [["income", "입금"], ["living", "생활 출금"], ["saving", "저축 이동"], ["refund", "환불 입금"]]]] }],
    example: { settings: { accounts: "A,B", beginning: 1000000 }, transactions: [{ id: "급여", from: "외부", to: "A", amount: 3000000, kind: "income" }, { id: "월세", from: "A", to: "외부", amount: 700000, kind: "living" }, { id: "식비", from: "A", to: "외부", amount: 300000, kind: "living" }, { id: "지난달 카드대금", from: "A", to: "외부", amount: 400000, kind: "living" }, { id: "확인한 이체", from: "A", to: "B", amount: 200000, kind: "living" }, { id: "적금 이동", from: "A", to: "S", amount: 500000, kind: "saving" }, { id: "환불", from: "외부", to: "B", amount: 50000, kind: "refund" }] },
    checks: ["기초잔액 1,000,000원 + 유입 3,050,000원 − 생활 출금 1,400,000원 − 저축 이동 500,000원 = 기말잔액 2,150,000원입니다.", "기초잔액이 0원인 S 계좌를 범위에 추가하면 적금 이동이 내부 이체가 되어 합산 기말잔액은 2,650,000원입니다.", "환불은 입금된 날의 현금 유입이며 근로소득이나 실제 절약 성과로 부르지 않습니다."],
  },
  "sinking-fund-annual-expenses": {
    title: "납부일에 맞춘 비정기 지출 적립표",
    outcome: "이미 모은 금액과 납부일까지 가능한 적립일을 반영해 회차별 금액과 부족액을 계산합니다.",
    instruction: "기준일 이후 실제로 입금할 수 있는 날짜를 적습니다. 납부 당일은 출금 전에 입금할 수 있을 때만 포함하세요. 이미 지난 적립일은 남은 회차에서 제외합니다.",
    fields: [["basis", "기준일", "date"], ["due", "납부일", "date"], ["target", "목표액(원)", "number"], ["saved", "기적립액(원)", "number"], ["status", "납부 상태", "select", [["saving", "적립 중"], ["paid", "납부 완료"]]]],
    groups: [{ key: "dates", label: "가능한 적립일", columns: [["date", "입금 가능한 날짜", "date"]] }],
    example: { settings: { basis: "2026-09-15", due: "2026-11-30", target: 1200000, saved: 300000, status: "saving" }, dates: [{ date: "2026-09-25" }, { date: "2026-10-25" }, { date: "2026-11-25" }] },
    checks: ["남은 900,000원을 세 날짜에 300,000원씩 배분합니다.", "100,000원을 세 번 나누면 빠른 날짜부터 33,334원·33,333원·33,333원입니다.", "기한 안에 적립일이 없으면 부족액을 남기며, 이미 납부했거나 충분히 모았으면 추가 필요액은 0원입니다."],
  },
  "monthly-closing-routine": {
    title: "근거를 남기는 월 마감 대조표",
    outcome: "원거래 ID로 중복을 구별하고 확인한 누락을 반영해 수정 전후 잔액과 차이를 설명합니다.",
    instruction: "지출은 음수, 입금은 양수로 적습니다. 은행·카드 원자료에서 같은 거래임을 확인했을 때만 같은 ID를 붙입니다. 실제 입금되지 않은 취소는 환불 입금으로 추가하지 마세요.",
    fields: [["beginning", "기초잔액(원)", "number"], ["start", "시작일(포함)", "date"], ["end", "종료일(제외)", "date"]],
    groups: [{ key: "transactions", label: "확인할 거래", columns: [["id", "원거래 ID", "text"], ["date", "날짜", "date"], ["amount", "증감액(지출은 음수)", "number"], ["recorded", "기존 기록 여부", "select", [["yes", "기록됨"], ["no", "누락 확인"]]], ["status", "확정 상태", "select", [["confirmed", "확정"], ["pending", "미확정"]]]] }],
    example: { settings: { beginning: 500000, start: "2026-11-01", end: "2026-12-01" }, transactions: [{ id: "식비-001", date: "2026-11-02", amount: -80000, recorded: "yes", status: "confirmed" }, { id: "식비-001", date: "2026-11-02", amount: -80000, recorded: "yes", status: "confirmed" }, { id: "교통-002", date: "2026-11-03", amount: -20000, recorded: "yes", status: "confirmed" }, { id: "구독-003", date: "2026-11-04", amount: -10000, recorded: "yes", status: "confirmed" }, { id: "구독환불-004", date: "2026-11-05", amount: 10000, recorded: "yes", status: "confirmed" }, { id: "월세-005", date: "2026-11-01", amount: -120000, recorded: "no", status: "confirmed" }, { id: "임시승인-006", date: "2026-11-07", amount: -15000, recorded: "yes", status: "pending" }, { id: "다음달-007", date: "2026-12-01", amount: -5000, recorded: "yes", status: "confirmed" }] },
    checks: ["수정 전 잔액은 320,000원입니다. 중복 80,000원을 제거하고 누락 월세 120,000원을 반영하면 280,000원입니다.", "수정 전후 차이는 −40,000원입니다. 미확정 승인과 다음 달 거래는 별도로 제외 이유를 남깁니다.", "같은 날짜·금액이라도 다른 ID이면 삭제하지 않습니다. 같은 ID의 금액이 다르면 원자료를 먼저 확인하도록 안내합니다."],
  },
  "subscription-cleanup": {
    title: "다음 결제와 해지 확인을 나누는 구독표",
    outcome: "월 환산 비용, 향후 30일의 다음 결제, 이용 종료, 실제 환불을 구별합니다.",
    instruction: "아래 상품과 약관은 모두 가상입니다. 해지 완료는 다음 갱신이 취소됐다는 확인을 받은 경우에만 선택하세요. 다음 결제일이 기준일 이전이면 실제 다음 청구가 없는지 확인해야 합니다.",
    fields: [["basis", "기준일(30일 구간의 첫날)", "date"]],
    groups: [{ key: "subscriptions", label: "구독과 확인 결과", columns: [["name", "구독 이름", "text"], ["amount", "1회 결제액(원)", "number"], ["cycle", "주기", "select", [["monthly", "월 구독"], ["annual", "연 구독"]]], ["next", "다음 결제일/마지막 예정일", "date"], ["cancel", "해지 상태", "select", [["active", "유지"], ["requested", "해지 요청"], ["confirmed", "갱신 해지 확인"]]], ["confirmed", "해지 완료일(선택)", "date"], ["until", "이용 종료일(선택)", "date"], ["refund", "실제 환불 입금액(원)", "number"]] }],
    example: { settings: { basis: "2026-11-05" }, subscriptions: [{ name: "A 월 구독", amount: 9900, cycle: "monthly", next: "2026-11-20", cancel: "confirmed", confirmed: "2026-11-05", until: "2026-11-19", refund: 0 }, { name: "B 연 구독", amount: 120000, cycle: "annual", next: "2027-09-01", cancel: "confirmed", confirmed: "2026-11-05", until: "2027-08-31", refund: 0 }, { name: "C 이미 해지", amount: 6900, cycle: "monthly", next: "2026-10-25", cancel: "confirmed", confirmed: "2026-10-25", until: "2026-11-09", refund: 0 }] },
    checks: ["11월 5일 이상 12월 5일 미만 구간의 다음 결제는 A의 9,900원입니다. 갱신 해지를 확인한 뒤 예정액은 0원입니다.", "B의 월 환산 비용은 10,000원이지만 이 구간의 출금과 환불 입금은 모두 0원입니다.", "A를 ‘해지 요청’으로 바꾸면 청구 예정액 9,900원이 남습니다. 실제 환불과 예정 결제 감소를 혼동하지 않습니다."],
  },
};

// V22.9.139: 세무·예산·실적 핵심 글 6편에 본문 인라인 미니 계산기를 더해 계산 도구 글을 총 12편으로 늘린다.
const PUBLIC_MINI_CALCULATORS_V229139 = {
  "payment-method-switch-nov-dec": {
    title: "연말정산 카드 25% 문턱·결제수단 전환 계산표",
    outcome: "총급여 25% 최저사용금액 문턱 충족 여부와 11~12월 신용카드(15%) 대비 체크카드·현금영수증(30%) 전환 시 소득공제 증가액을 비교합니다.",
    instruction: "홈택스 연말정산 미리보기 또는 카드사 앱의 1~10월 공제 대상 사용액을 넣고, 남은 기간 예정 지출액을 입력해 전환 효과를 확인하세요.",
    fields: [
      ["salary", "연간 총급여액(원)", "number"],
      ["credit", "1~10월 신용카드 공제 대상액(원)", "number"],
      ["debit", "1~10월 체크·현금영수증 대상액(원)", "number"],
      ["remain", "11~12월 예정 공제 대상 지출(원)", "number"],
    ],
    groups: [],
    example: { settings: { salary: 48000000, credit: 13500000, debit: 1800000, remain: 3000000 } },
    checks: [
      "총급여 4,800만 원의 25% 문턱은 1,200만 원이며, 1~10월 신용카드 1,350만 원으로 이미 문턱을 넘겼습니다.",
      "남은 300만 원을 신용카드(15%)로 쓰면 총 공제액이 1,215,000원, 체크·현금영수증(30%)으로 바꾸면 1,665,000원으로 소득공제가 450,000원 늘어납니다.",
      "이미 기본 공제 한도(300만 원 또는 250만 원)를 채웠다면 결제수단을 바꿔도 한도 적용 후 공제 증가액은 0원입니다.",
    ],
  },
  "rent-tax-credit-records": {
    title: "월세 세액공제 vs 현금영수증 소득공제 비교 계산표",
    outcome: "연간 납부 월세에 대해 무주택 세대주 월세 세액공제(17%·15%)와 주택임차료 현금영수증 소득공제(30%) 중 실제 세금 감소액을 비교합니다.",
    instruction: "총급여액과 월세액, 납부 개월 수를 입력하세요. 같은 월세에 세액공제와 현금영수증 소득공제는 중복 적용되지 않습니다.",
    fields: [
      ["salary", "연간 총급여액(원)", "number"],
      ["monthlyRent", "월세 금액(원)", "number"],
      ["months", "해당 연도 납부 개월 수(1~12)", "number"],
      ["marginalRate", "비교용 한계 소득세율(%)", "select", [["6", "6% (과세표준 1,400만 이하)"], ["15", "15% (1,400만~5,000만)"], ["24", "24% (5,000만~8,800만)"], ["35", "35% (8,800만 초과)"]]],
      ["thresholdMet", "카드 25% 최저사용금액 충족", "select", [["yes", "충족(초과분 30% 공제)"], ["no", "미충족(문턱 채우는 중)"]]],
    ],
    groups: [],
    example: { settings: { salary: 48000000, monthlyRent: 650000, months: 12, marginalRate: "15", thresholdMet: "yes" } },
    checks: [
      "총급여 4,800만 원·월세 65만 원(12개월 780만 원)은 17% 세액공제율이 적용되어 세액공제액이 1,326,000원입니다.",
      "같은 780만 원을 현금영수증 소득공제(30% × 한계세율 15%)로 받으면 예상 세금 감소액은 351,000원으로 월세 세액공제가 975,000원 더 유리합니다.",
      "총급여가 8,000만 원을 초과해 월세 세액공제 대상이 아닐 때는 세액공제가 0원이므로 현금영수증 소득공제를 신청합니다.",
    ],
  },
  "pension-savings-irp-tax-credit": {
    title: "연금저축·IRP 세액공제 한도·환급 계산표",
    outcome: "연금저축(연 600만 원 한도)과 퇴직연금 IRP(합산 900만 원 한도) 납입액에 따른 지방소득세 포함 세액공제액(16.5%·13.2%)을 계산합니다.",
    instruction: "올해 연간 총급여액과 연금저축·IRP 계좌에 납입했거나 연말까지 추가 납입할 금액을 입력해 공제 한도와 세액공제액을 확인하세요.",
    fields: [
      ["salary", "연간 총급여액(원)", "number"],
      ["pension", "연금저축 연간 납입액(원)", "number"],
      ["irp", "퇴직연금 IRP 연간 납입액(원)", "number"],
    ],
    groups: [],
    example: { settings: { salary: 52000000, pension: 6000000, irp: 3000000 } },
    checks: [
      "총급여 5,200만 원(5,500만 원 이하)에서 연금저축 600만 원 + IRP 300만 원을 납입하면 합산 900만 원 전체에 16.5%가 적용되어 총 1,485,000원이 공제됩니다.",
      "연금저축에 700만 원을 넣어도 단독 한도 600만 원만 인정되므로 나머지 300만 원 한도는 IRP 계좌로 채워야 합니다.",
      "합산 900만 원을 초과해 납입한 금액은 올해 세액공제를 받지 않는 대신 향후 인출 시 과세 제외 원금으로 분류됩니다.",
    ],
  },
  "budget-ratio-guide": {
    title: "고정비 반영 50/30/20 월 예산 배분 계산표",
    outcome: "월 실수령 소득을 필수 생활비·선택 소비·저축 비율로 나누고, 이미 확정된 고정비를 뺀 잔여 필수 변동비와 1주일 소비 한도를 계산합니다.",
    instruction: "월 실수령 소득과 확정 고정비(주거·관리·통신·보험)를 넣으세요. 주거비 비중이 높다면 60/20/20 비율로 바꿔 비교해 보세요.",
    fields: [
      ["income", "월 실수령 소득(원)", "number"],
      ["fixedNeed", "확정 필수 고정비 합계(원)", "number"],
      ["needRatio", "필수 생활비 비율(%)", "number"],
      ["wantRatio", "선택 소비 비율(%)", "number"],
      ["saveRatio", "저축·상환 비율(%)", "number"],
    ],
    groups: [],
    example: { settings: { income: 3000000, fixedNeed: 950000, needRatio: 50, wantRatio: 30, saveRatio: 20 } },
    checks: [
      "월 300만 원 소득의 50/30/20 배분은 필수 150만 원, 선택 90만 원, 저축 60만 원입니다.",
      "필수 150만 원에서 확정 고정비 95만 원을 빼면 식비·생필품·교통에 쓸 수 있는 잔여 필수 변동비는 55만 원입니다.",
      "잔여 필수 변동비(55만 원)와 선택 소비(90만 원)를 합한 145만 원의 1주일 권장 사용 한도는 338,333원입니다.",
    ],
  },
  "emergency-fund-basics": {
    title: "필수 생활비 기반 비상금 목표·월 적립 계산표",
    outcome: "선택 소비를 뺀 월 필수 생활비 기준으로 1개월·목표 개월·6개월 비상금 규모를 구하고 목표 기간 안 월 적립액을 계산합니다.",
    instruction: "소득이 일시 중단되어도 지출해야 하는 주거·공과금, 기본 식비·생필품, 필수 교통·통신·보험료만 입력해 비상금 목표를 세우세요.",
    fields: [
      ["housing", "월 주거·관리·공과금(원)", "number"],
      ["foodBasic", "월 기본 식비·생필품(원)", "number"],
      ["fixedOther", "월 필수 교통·통신·보험(원)", "number"],
      ["targetMonths", "목표 비상금 개월 수(1~24)", "number"],
      ["currentSaved", "현재 모아 둔 비상금(원)", "number"],
      ["buildMonths", "목표 달성 적립 개월 수(1~60)", "number"],
    ],
    groups: [],
    example: { settings: { housing: 650000, foodBasic: 550000, fixedOther: 300000, targetMonths: 3, currentSaved: 1500000, buildMonths: 10 } },
    checks: [
      "월 필수 생활비 합계는 1,500,000원이며 3개월 목표 비상금은 4,500,000원입니다.",
      "현재 비상금 잔액 1,500,000원을 빼면 추가 필요액은 3,000,000원입니다.",
      "10개월 동안 목표를 달성하려면 매달 300,000원씩 별도 비상금 통장으로 이체하면 됩니다.",
    ],
  },
  "card-spending-threshold": {
    title: "카드 전월 실적 채우기 손익분기 계산표",
    outcome: "실적 제외 항목을 뺀 실제 실적 인정액과 부족액을 확인하고, 실적을 채우려 추가 지출할 때의 순이익·순손실을 판정합니다.",
    instruction: "카드 앱의 총 결제액이 아니라 전월 실적 인정 금액을 기준으로 입력하세요. 원래 살 예정이던 생필품 앞당김 금액과 비교해 손익분기를 계산합니다.",
    fields: [
      ["threshold", "전월 실적 기준 금액(원)", "number"],
      ["recognized", "현재 실적 인정 사용액(원)", "number"],
      ["excluded", "무이자·공과금 등 실적 제외액(원)", "number"],
      ["benefit", "실적 달성 시 다음 달 예상 혜택(원)", "number"],
      ["planned", "앞당겨 결제 가능한 필수 지출(원)", "number"],
    ],
    groups: [],
    example: { settings: { threshold: 300000, recognized: 250000, excluded: 60000, benefit: 15000, planned: 20000 } },
    checks: [
      "총 결제액은 310,000원이지만 실적 제외액 60,000원을 빼면 실제 인정액은 250,000원으로 기준(300,000원)까지 50,000원이 부족합니다.",
      "원래 살 생필품 20,000원을 앞당겨 결제해도 비계획 지출 30,000원을 더 써야 실적이 채워집니다.",
      "다음 달 예상 혜택(15,000원)에서 비계획 추가 지출(30,000원)을 빼면 −15,000원 순손실이므로 무리하게 실적을 채우지 않는 편이 낫습니다.",
    ],
  },
};

const PUBLIC_ALL_CALCULATORS_V229139 = Object.freeze({
  ...PUBLIC_WORKSHEETS_V229106,
  ...PUBLIC_MINI_CALCULATORS_V229139,
});

// V22.9.139: 34편의 비워크시트 글에도 주제별 맞춤 대표 버튼(연관 계산표 글 + 주제 가이드)을 배정한다.
const PUBLIC_ARTICLE_CTA_MAP_V229139 = Object.freeze({
  "budget-ratio-guide": [["50/30/20 예산 바로 계산하기", "#inline-worksheet"], ["연간 비정기 지출 적립표", "/sinking-fund-annual-expenses"]],
  "fixed-cost-checklist": [["구독 해지·갱신 계산표", "/subscription-cleanup"], ["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"]],
  "card-spending-threshold": [["전월 실적 손익 바로 계산하기", "#inline-worksheet"], ["연말정산 카드 전환 계산표", "/payment-method-switch-nov-dec"]],
  "accountbook-habit": [["월 마감 잔액 대조표", "/monthly-closing-routine"], ["카카오톡 한 줄 기록 방법", "/kakao-guide"]],
  "payday-budget-cycle": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "expense-category-rules": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["월 마감 잔액 대조표", "/monthly-closing-routine"]],
  "emergency-fund-basics": [["비상금·월 적립액 바로 계산하기", "#inline-worksheet"], ["연간 비정기 지출 적립표", "/sinking-fund-annual-expenses"]],
  "weekly-report-reading": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["리포트 읽는 법 안내", "/report-guide"]],
  "family-roles-accountbook": [["공동 생활비 4가지 분담표", "/shared-living-cost-rules"], ["공동 가계부 운영 안내", "/group-accountbook"]],
  "household-spending-statistics": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["1인 가구 생활비 기준", "/single-household-living-cost"]],
  "single-household-living-cost": [["1인 가구 연말정산 공제", "/single-household-year-end-tax"], ["월세 세액공제 비교 계산표", "/rent-tax-credit-records"]],
  "food-cost-benchmark": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["주간 리포트 점검 기준", "/weekly-report-reading"]],
  "utility-bills-seasonality": [["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"], ["아파트 관리비 고지서 분석", "/apartment-maintenance-fee"]],
  "inflation-budget-update": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["식비·외식비 통계 비교", "/food-cost-benchmark"]],
  "card-income-deduction-basics": [["11~12월 카드 전환 계산표", "/payment-method-switch-nov-dec"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "year-end-tax-expense-check": [["연말정산 시기별 준비 일정", "/year-end-tax-timeline-checklist"], ["11~12월 카드 전환 계산표", "/payment-method-switch-nov-dec"]],
  "rent-tax-credit-records": [["월세·현금영수증 공제 바로 계산하기", "#inline-worksheet"], ["주거비 소득·세액공제 비교", "/housing-deductions-overview"]],
  "apartment-maintenance-fee": [["계절별 공과금 예산 세우기", "/utility-bills-seasonality"], ["고정비 점검 체크리스트", "/fixed-cost-checklist"]],
  "mobile-plan-cost-review": [["구독 해지·갱신 계산표", "/subscription-cleanup"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "debt-repayment-order": [["연말정산 환급금 배분 계획", "/tax-refund-money-plan"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "savings-rate-tracking": [["연금저축·IRP 환급 계산표", "/pension-savings-irp-tax-credit"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "first-job-budget": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["비상금 목표·적립 계산표", "/emergency-fund-basics"]],
  "car-ownership-cost": [["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"], ["고정비 점검 체크리스트", "/fixed-cost-checklist"]],
  "childcare-cost-planning": [["의료·교육·기부금 공제 정리", "/medical-education-donation-deductions"], ["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"]],
  "couple-account-structure": [["공동 생활비 4가지 분담표", "/shared-living-cost-rules"], ["맞벌이 부부 공제 몰아주기", "/dual-income-deduction-allocation"]],
  "expense-review-questions": [["월 마감 잔액 대조표", "/monthly-closing-routine"], ["주간 리포트 점검 기준", "/weekly-report-reading"]],
  "year-end-tax-timeline-checklist": [["11~12월 카드 전환 계산표", "/payment-method-switch-nov-dec"], ["연금저축·IRP 환급 계산표", "/pension-savings-irp-tax-credit"]],
  "payment-method-switch-nov-dec": [["11~12월 카드 전환 바로 계산하기", "#inline-worksheet"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "medical-education-donation-deductions": [["맞벌이 부부 공제 배분", "/dual-income-deduction-allocation"], ["연말정산 지출 증빙 점검", "/year-end-tax-expense-check"]],
  "dual-income-deduction-allocation": [["부부 공동·각자 통장 구조", "/couple-account-structure"], ["11~12월 카드 전환 계산표", "/payment-method-switch-nov-dec"]],
  "pension-savings-irp-tax-credit": [["연금저축·IRP 환급액 바로 계산하기", "#inline-worksheet"], ["연말정산 환급금 배분 계획", "/tax-refund-money-plan"]],
  "single-household-year-end-tax": [["월세 세액공제 비교 계산표", "/rent-tax-credit-records"], ["11~12월 카드 전환 계산표", "/payment-method-switch-nov-dec"]],
  "tax-refund-money-plan": [["비상금 목표·적립 계산표", "/emergency-fund-basics"], ["대출 상환 우선순위 정리", "/debt-repayment-order"]],
  "housing-deductions-overview": [["월세 세액공제 비교 계산표", "/rent-tax-credit-records"], ["연말정산 시기별 준비 일정", "/year-end-tax-timeline-checklist"]],
});

// V22.9.139: 40편의 생활비 글마다 본문 수치·가상 예제와 맞물리는 고유 인라인 SVG 데이터 차트를 제공한다.
const PUBLIC_ARTICLE_CHARTS_V229139 = Object.freeze({
  "budget-ratio-guide": ["월 300만 원 소득의 50/30/20 예산 배분 비교", [["필수 생활비(50%)", 150, "150만 원"], ["선택 소비(30%)", 90, "90만 원"], ["저축·상환(20%)", 60, "60만 원"]], "가상 사례: 월 실수령 300만 원 기준 영역별 배분 금액"],
  "fixed-cost-checklist": ["월 고정비 107만 원 구성 비중 예시", [["주거·관리비", 68, "68만 원"], ["보험·교통 정기권", 25, "25만 원"], ["통신·정기 구독", 14, "14만 원"]], "가상 사례: 매달 자동 출금되는 주요 고정비 세 묶음"],
  "subscription-cleanup": ["구독 해지 확인 전후 30일 결제 예정액 비교", [["해지 반영 전 30일", 99, "9,900원"], ["연간 구독 월 환산액", 100, "10,000원"], ["해지 확인 후 30일", 5, "0원"]], "가상 사례: 월 환산 비용과 실제 향후 30일 청구 예정액의 구분"],
  "card-spending-threshold": ["카드 전월 실적 30만 원 기준과 인정·부족액", [["전월 실적 기준", 300, "30만 원"], ["현재 실적 인정액", 250, "25만 원"], ["실적 부족액", 50, "5만 원"]], "가상 사례: 총 결제 31만 원 중 실적 제외 6만 원을 뺀 인정액 비교"],
  "shared-living-cost-rules": ["공동 생활비 120,001원 분담 방식별 A 부담액", [["소득 비율(3:2:1)", 60, "60,001원"], ["합의 비율(40%)", 48, "48,001원"], ["균등 분담(1/3)", 40, "40,001원"]], "가상 사례: 동일 총지출에서 분담 규칙에 따라 달라지는 1인 부담액"],
  "accountbook-habit": ["주간 점검 주기에 따른 월말 미분류 누락 건수", [["월말 몰아 적기", 18, "18건"], ["주 1회 10분 점검", 4, "4건"], ["당일 한 줄 기록", 1, "1건"]], "가상 사례: 기록 주기가 짧을수록 줄어드는 월말 확인 불명 지출"],
  "payday-budget-cycle": ["급여일(25일) 기준 한 달 자금 배분 흐름", [["즉시 이체(저축·고정비)", 165, "165만 원"], ["주간 변동 생활비(4주)", 110, "110만 원"], ["결산 완충 예비금", 25, "25만 원"]], "가상 사례: 급여 300만 원 입금 직후 통장별 역할 분리"],
  "expense-category-rules": ["분류 개수 축소 전후 식비·생활비 집계 명확도", [["식비(장보기·외식 통합)", 62, "62만 원"], ["주거·공과금", 58, "58만 원"], ["교통·기타 변동비", 34, "34만 원"]], "가상 사례: 7~9개 핵심 분류로 묶어 본 월간 지출 구조"],
  "emergency-fund-basics": ["월 필수 생활비 150만 원 기준 단계별 비상금 목표", [["1단계 완충금(1개월)", 150, "150만 원"], ["기본 목표(3개월)", 450, "450만 원"], ["안정권 목표(6개월)", 900, "900만 원"]], "가상 사례: 선택 소비를 제외한 필수 지출 기준 비상금 규모"],
  "weekly-report-reading": ["4주 예산 60만 원의 주간 누적 지출 속도 점검", [["2주 차 권장 누적(50%)", 30, "30만 원"], ["2주 차 실제 누적(63%)", 38, "38만 원"], ["남은 2주 가용 예산", 22, "22만 원"]], "가상 사례: 월 중반에 초과 속도를 발견해 남은 주간 한도를 조정하는 과정"],
  "family-roles-accountbook": ["2인 가구 공동·개인 계좌 월 자금 흐름", [["공동 생활비 계좌", 180, "180만 원"], ["공동 비상·예비비", 60, "60만 원"], ["개인 자율 용돈 합계", 80, "80만 원"]], "가상 사례: 공동 고정비와 개인 재량 지출을 분리한 가계 구조"],
  "cash-flow-table": ["관리 계좌(A·B) 월간 현금흐름과 기말잔액", [["현금 유입(급여·환불)", 305, "305만 원"], ["생활·저축 출금 합계", 190, "190만 원"], ["기말잔액(기초 100만 포함)", 215, "215만 원"]], "가상 사례: 내부 이체(20만 원) 중복을 제거한 실제 현금 증감"],
  "household-spending-statistics": ["가구 소비지출 주요 비목 비중 비교", [["음식·숙박 및 식료품", 28, "28%"], ["주거·수도·광열", 18, "18%"], ["교통·통신", 16, "16%"]], "공공 가계동향 통계의 주요 생활비 영역 비중 참고 예시"],
  "single-household-living-cost": ["1인 가구 월 지출 175만 원의 고정·변동 구성", [["주거·관리·공과금", 72, "72만 원"], ["식비·외식·카페", 56, "56만 원"], ["교통·통신·생활 기타", 47, "47만 원"]], "가상 사례: 1인 가구에서 주거비와 식비가 차지하는 핵심 비중"],
  "food-cost-benchmark": ["월 식비 64만 원의 세부 경로별 지출 분포", [["장보기·식재료", 26, "26만 원"], ["외식·배달 음식", 28, "28만 원"], ["카페·음료·간식", 10, "10만 원"]], "가상 사례: 세 경로로 나누어 본 한 달 식비 구조"],
  "utility-bills-seasonality": ["계절별 월 공과금(전기·가스·수도) 변동 폭", [["봄·가을 평달 평균", 8, "8만 원"], ["여름 냉방 성수기", 15, "15만 원"], ["겨울 난방 성수기", 22, "22만 원"]], "가상 사례: 연평균 정액 적립으로 계절 요금 급등을 흡수하는 기준"],
  "inflation-budget-update": ["물가 상승 반영 전후 필수 생활비 예산 조정", [["기존 식비·공과금 예산", 75, "75만 원"], ["최근 3개월 평균 실지출", 84, "84만 원"], ["조정 후 현실 예산", 85, "85만 원"]], "가상 사례: 최근 3개월 평균 실지출을 반영한 예산 재설정"],
  "card-income-deduction-basics": ["결제수단별 연말정산 소득공제율 비교", [["신용카드", 15, "15%"], ["체크카드·현금영수증", 30, "30%"], ["전통시장·대중교통", 40, "40%"]], "조세특례제한법 제126조의2 기준 총급여 25% 초과분 공제율"],
  "year-end-tax-expense-check": ["연말정산 주요 공제 항목별 사전 점검 기준", [["카드 소득공제 문턱", 25, "총급여 25%"], ["의료비 세액공제 문턱", 3, "총급여 3%"], ["교육비 세액공제율", 15, "15%"]], "소득세법 및 조세특례제한법 기준 주요 지출 공제 문턱과 비율"],
  "rent-tax-credit-records": ["연 월세 780만 원의 세액공제 vs 현금영수증 비교", [["월세 세액공제(17%)", 133, "132.6만 원"], ["월세 세액공제(15%)", 117, "117.0만 원"], ["현금영수증(30%×세율15%)", 35, "35.1만 원"]], "가상 사례: 총급여 구간별 월세 세액공제액과 소득공제 세금 감소액"],
  "apartment-maintenance-fee": ["아파트 관리비 고지서 24만 원의 세 영역 분리", [["공용관리비", 9, "9만 원"], ["세대 전기·수도·난방", 12, "12만 원"], ["장기수선충당금·기타", 3, "3만 원"]], "가상 사례: 총액이 아닌 세대 사용량 항목으로 계절 변동을 읽는 법"],
  "mobile-plan-cost-review": ["통신비 고지서 9만 8천 원의 실제 구성 분해", [["순수 통신 요금제", 45, "4.5만 원"], ["단말기 할부원금·이자", 35, "3.5만 원"], ["소액결제·부가서비스", 18, "1.8만 원"]], "가상 사례: 통신 요금과 단말기 할부·소액결제를 분리한 명세서"],
  "sinking-fund-annual-expenses": ["연간 비정기 지출 120만 원의 기적립·잔여 배분", [["기적립 완료 금액", 30, "30만 원"], ["남은 3회 회차별 적립", 30, "회당 30만 원"], ["잔여 필요 총액", 90, "90만 원"]], "가상 사례: 납부일 전 가능한 3회 입금일에 맞춘 균등 적립"],
  "debt-repayment-order": ["대출 금리별 연간 이자 부담 비교(원금 1,000만 원당)", [["고금리 카드론·현금서비스", 140, "연 140만 원"], ["일반 신용대출", 65, "연 65만 원"], ["정책·주거 담보대출", 38, "연 38만 원"]], "가상 사례: 동일 원금에서 금리 차이에 따른 연간 이자 비용"],
  "savings-rate-tracking": ["월 실수령 300만 원에서 저축 정의별 저축률 차이", [["순수 장기 저축·투자만", 20, "20% (60만 원)"], ["단기 여행·경조사 적립 포함", 28, "28% (84만 원)"], ["대출 원금 상환 포함", 33, "33% (99만 원)"], ], "가상 사례: 곧 쓸 적립금을 장기 저축과 분리해야 실제 자산 증가율이 보임"],
  "first-job-budget": ["첫 급여 250만 원의 선저축·생활비 배분 예시", [["비상금·청약·적금 선저축", 75, "75만 원(30%)"], ["주거·통신·교통 고정비", 85, "85만 원(34%)"], ["식비·생활·여가 변동비", 90, "90만 원(36%)"]], "가상 사례: 신용카드 한도 대신 체크카드 예산으로 시작하는 첫 급여 구조"],
  "car-ownership-cost": ["자동차 유지비 월 환산 58만 원의 숨은 비용 구조", [["유류비·통행료·주차", 26, "26만 원"], ["자동차보험·자동차세 월환산", 14, "14만 원"], ["정비·타이어·감가 예비비", 18, "18만 원"]], "가상 사례: 주유비 외에 연간 세금·보험·정비비를 월 단위로 환산한 실제 비용"],
  "childcare-cost-planning": ["자녀 교육·양육비 월 65만 원의 고정·비정기 분리", [["정기 보육·학원 고정비", 42, "42만 원"], ["교재·준비물·체험학습", 13, "13만 원"], ["방학·학기초 적립 예비비", 10, "10만 원"]], "가상 사례: 학기 초·방학 목돈을 매달 예비비로 나누어 준비하는 구조"],
  "couple-account-structure": ["맞벌이 부부 월 550만 원의 공동·개별 배분 예시", [["공동 주거·식비·생활비", 240, "240만 원"], ["공동 저축·비상금·예비비", 220, "220만 원"], ["부부 각자 용돈 합계", 90, "90만 원"]], "가상 사례: 생활비와 저축 규칙을 먼저 맞춘 뒤 각자 용돈을 분리하는 방식"],
  "roommate-shared-ledger": ["월 9만 원 공과금의 중도 입주(11일) 두 분담 방식 비교", [["A 거주자(날짜별 분담)", 60, "60,000원"], ["A 거주자(거주 인일 비례)", 54, "54,000원"], ["B 거주자(거주 인일 비례)", 36, "36,000원"]], "가상 사례: 단독 거주 구간과 공동 거주 구간을 나누는 두 합의 기준"],
  "monthly-closing-routine": ["월 마감 대조 전후 장부 잔액 보정(기초 50만 원)", [["대조 전 장부 잔액", 32, "32만 원"], ["중복 제거(+8만)·누락 반영(-12만)", 4, "차이 -4만 원"], ["대조 후 실제 확정 잔액", 28, "28만 원"]], "가상 사례: 중복 입력과 자동이체 누락을 원거래 ID로 바로잡은 마감 결과"],
  "expense-review-questions": ["월말 결산 5문항 점검으로 찾은 조정 가능 지출", [["미사용 정기 구독 정리", 3, "월 2.8만 원"], ["실적 채우기용 비계획 쇼핑", 6, "월 6.0만 원"], ["배달·야식 빈도 조정", 9, "월 9.0만 원"]], "가상 사례: 총액 자책 대신 구체적 질문으로 다음 달 행동 규칙을 정하는 과정"],
  "year-end-tax-timeline-checklist": ["연말정산 준비 시기별 핵심 점검 비중", [["10~11월(25% 문턱·카드 전환)", 45, "지출 조정기"], ["12월(연금·IRP·기부금 마감)", 35, "납입 마감기"], ["다음 해 1~2월(간소화·누락 서류)", 20, "서류 제출기"]], "12월 31일 이전 결제·납입으로만 바꿀 수 있는 항목과 1월 서류 확인의 구분"],
  "payment-method-switch-nov-dec": ["11~12월 300만 원 지출의 결제수단별 총 소득공제액", [["1~10월 누적 공제액", 77, "76.5만 원"], ["11~12월 신용카드 유지(15%)", 122, "121.5만 원"], ["11~12월 체크·현금 전환(30%)", 167, "166.5만 원"]], "가상 사례: 총급여 4,800만 원(25% 문턱 초과 후) 남은 두 달 결제수단 전환 비교"],
  "medical-education-donation-deductions": ["의료비 세액공제 총급여 3% 문턱 계산 예시", [["총급여 5,000만 원의 3% 문턱", 150, "150만 원"], ["연간 의료비 순지출(실손 차감 후)", 250, "250만 원"], ["문턱 초과 공제 대상액", 100, "100만 원"]], "가상 사례: 실손보험금 수령액을 뺀 순수 본인 부담 의료비 기준"],
  "dual-income-deduction-allocation": ["맞벌이 부부 카드·의료비 몰아주기 문턱 비교", [["배우자 A(총급여 6,000만) 25% 문턱", 150, "1,500만 원"], ["배우자 B(총급여 3,600만) 25% 문턱", 90, "900만 원"], ["배우자 B 의료비 3% 문턱", 11, "108만 원"]], "가상 사례: 소득 문턱이 낮은 배우자와 한계세율이 높은 배우자의 유불리 비교"],
  "pension-savings-irp-tax-credit": ["연금저축 600만·IRP 300만 납입 시 총급여별 세액공제", [["연금저축 600만(5,500만 이하 16.5%)", 99, "99.0만 원"], ["연금저축+IRP 900만(5,500만 이하 16.5%)", 149, "148.5만 원"], ["연금저축+IRP 900만(5,500만 초과 13.2%)", 119, "118.8만 원"]], "소득세법 제59조의3 기준 지방소득세 포함 세액공제 한도 비교"],
  "single-household-year-end-tax": ["1인 가구 직장인(총급여 4,200만) 주요 공제 효과 비교", [["월세 세액공제(연 720만×17%)", 122, "122.4만 원"], ["연금저축 세액공제(연 300만×16.5%)", 50, "49.5만 원"], ["체크·현금영수증 소득공제 세금감소", 27, "27.0만 원"]], "가상 사례: 부양가족 공제가 없는 1인 가구의 주거·연금·카드 공제 비중"],
  "tax-refund-money-plan": ["연말정산 환급금 120만 원의 3단계 배분 예시", [["1순위 고금리 부채·연체 정리", 40, "40만 원"], ["2순위 연간 비정기 지출 예비비", 50, "50만 원"], ["3순위 비상금·연금저축 재투자", 30, "30만 원"]], "가상 사례: 환급금을 생활비 통장에 섞지 않고 목적별로 즉시 분리하는 계획"],
  "housing-deductions-overview": ["무주택 근로자 주거비 공제 한도·방식 비교", [["월세 세액공제(연 대상 한도)", 100, "1,000만 원"], ["전세원리금 소득공제(연 공제 한도)", 40, "400만 원"], ["주택청약저축 소득공제(연 납입 한도)", 30, "300만 원"]], "조세특례제한법 및 소득세법 기준 무주택 가구 주거 관련 공제 한도"],
});

function renderArticleDataChartV229139(slug) {
  const spec = PUBLIC_ARTICLE_CHARTS_V229139[slug];
  if (!spec) return "";
  const [title, bars, caption] = spec;
  const max = Math.max(1, ...bars.map((b) => Number(b[1]) || 1));
  const colors = ["#1d4ed8", "#0284c7", "#0d9488", "#4f46e5"];
  const height = 42 + bars.length * 42;
  const rowsSvg = bars.map(([label, val, display], idx) => {
    const y = 34 + idx * 42;
    const width = Math.max(16, Math.round((Number(val) / max) * 290));
    const color = colors[idx % colors.length];
    return `<g transform="translate(0,${y})"><text x="12" y="20" fill="#1e293b" font-size="13" font-weight="600">${escapeHtml(label)}</text><rect x="215" y="4" width="295" height="22" rx="6" fill="#e8effa"/><rect x="215" y="4" width="${width}" height="22" rx="6" fill="${color}"/><text x="520" y="20" fill="#172033" font-size="13" font-weight="700">${escapeHtml(display)}</text></g>`;
  }).join("");
  return `<figure class="pubDataChart" role="group" aria-label="${escapeHtml(title)}"><svg class="pubChartSvg" viewBox="0 0 630 ${height}" role="img" aria-label="${escapeHtml(title)}"><rect x="0" y="0" width="630" height="${height}" rx="14" fill="#f8fafd"/><text x="12" y="22" fill="#1d4ed8" font-size="12.5" font-weight="700">${escapeHtml(title)}</text>${rowsSvg}</svg><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

// V22.9.107 D-4~D-6: 계산표 자산 주소는 1년 캐시(immutable)라 계산표 화면(worksheet-runtime.js)이 바뀌면 여기 판을 올린다.
// 바로 앞 판 주소는 다음 판까지 같은 내용을 낸다(글을 5분 캐시로 받은 브라우저가 옛 주소를 누를 수 있다). 두 판 전 주소는 404 다.
const PUBLIC_WORKSHEET_ASSET_VERSION_V229107 = "v229107";
const PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107 = Object.freeze(["v229106"]);
function publicWorksheetPathV229106(slug, version = PUBLIC_WORKSHEET_ASSET_VERSION_V229107) { return `/assets/living-worksheet-${version}-${slug}.html`; }

function enrichPublicWorksheetsV229106(catalog) {
  const optionLabel = (column, value) => column[2] === "select" ? column[3].find((option) => option[0] === value)?.[1] || value : String(value ?? "");
  for (const [slug, ctas] of Object.entries(PUBLIC_ARTICLE_CTA_MAP_V229139)) {
    const page = catalog[slug];
    if (!page) continue;
    page.primary = ctas[0];
    page.secondary = ctas[1];
  }
  for (const slug of Object.keys(PUBLIC_MINI_CALCULATORS_V229139)) {
    const page = catalog[slug];
    if (!page) continue;
    page.miniCalculator = true;
  }
  for (const [slug, spec] of Object.entries(PUBLIC_WORKSHEETS_V229106)) {
    const page = catalog[slug]; if (!page) continue;
    const result = worksheetComputeV229106(slug, spec.example);
    page.updated = "2026-11-07";
    page.worksheet = true;
    page.primary = ["입력값을 바꿔 계산하기", publicWorksheetPathV229106(slug)];
    page.secondary = ["계산표 파일 저장", publicWorksheetPathV229106(slug) + "?download=1"];
    // V22.9.107 D-3: 글의 원래 절(서사)을 먼저 두고, 예제 원본 표·검산·계산표 열기는 글 끝에 둔다. V106 은 예제 표 4~5절이 본문 앞에 와
    // 첫 화면이 길고 서사보다 원본 데이터가 먼저 나왔다. 절 수는 같다(검사의 addedSections = 2 + 묶음 수 + 조건 표 1).
    page.sections = [
      { title: "이 글에서 완성할 결과", paragraphs: [spec.outcome] },
      ...page.sections,
      ...(spec.fields.length ? [{ title: "예제의 계산 조건", table: { caption: "예제의 계산 조건", headers: ["조건", "입력값"], rows: spec.fields.map((c) => [c[1], optionLabel(c, spec.example.settings[c[0]])]) } }] : []),
      ...spec.groups.map((group) => ({ title: group.label + " 예제", table: { caption: group.label + " 원본(가상 데이터)", headers: group.columns.map((c) => c[1]), rows: spec.example[group.key].map((row) => group.columns.map((c) => optionLabel(c, row[c[0]]))) } })),
      { title: "예제 검산과 계산표 열기", paragraphs: [spec.instruction, ...result.notes], table: result.tables[0], bullets: spec.checks, note: "운영팀이 작성한 편집용 가상 예제입니다. 실제 고객 사례나 제품의 자동 처리 기능이 아닙니다. 별도 계산표는 브라우저에서만 작동하며 입력값을 서버로 보내지 않습니다.", links: [page.primary, page.secondary] },
    ];
  }
  const links = Object.entries(PUBLIC_WORKSHEETS_V229106).map(([slug, spec]) => [spec.title, `/${slug}`]);
  catalog.home.sections.splice(1, 0, { title: "직접 계산하며 읽는 생활비 자료", paragraphs: ["공동 비용의 분담, 계좌 범위에 따른 잔액, 납부일까지의 적립과 월 마감을 가상 원본으로 확인하고 자신의 조건으로 바꿔 볼 수 있습니다."], links });
  // V22.9.118 P-8: 첫 화면 수정일을 낮추지 않는다(첫 화면 안내 표를 고친 판의 날짜가 더 늦으면 그 날짜를 둔다).
  if (!(String(catalog.home.updated || "") > "2026-11-07")) catalog.home.updated = "2026-11-07";
}

// @build:exports-start
export {
  PUBLIC_ALL_CALCULATORS_V229139, PUBLIC_ARTICLE_CHARTS_V229139, PUBLIC_ARTICLE_CTA_MAP_V229139,
  PUBLIC_MINI_CALCULATORS_V229139, PUBLIC_WORKSHEETS_V229106,
  PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107, PUBLIC_WORKSHEET_ASSET_VERSION_V229107,
  enrichPublicWorksheetsV229106, publicWorksheetPathV229106, renderArticleDataChartV229139,
};
// @build:exports-end
