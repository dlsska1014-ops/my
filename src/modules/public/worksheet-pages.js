// @build:imports-start
import { SHARED_LIVING_PURCHASES, SUBSCRIPTION_CASE } from "./guide-content.js";
import { worksheetComputeV229106 } from "./worksheet-calculations.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

const SHARED_LIVING_PEOPLE = [{ name: "A", income: 4, use: 2, agreed: 4 }, { name: "B", income: 3, use: 1, agreed: 3 }, { name: "C", income: 3, use: 1, agreed: 3 }];

const SUBSCRIPTION_ROWS = SUBSCRIPTION_CASE.map(({ name, amount, cycle, next, cancel = "active", confirmed = "", until = "" }) => ({ name, amount, cycle, next, cancel, confirmed, until, refund: 0 }));

const GROUP_TREASURER_WORKSHEET = {
  title: "모임 회비와 개인 선결제 정산표",
  outcome: "공금에 남은 돈과 택시비를 먼저 낸 사람이 돌려받을 돈을 각각 계산합니다.",
  instruction: "이번 모임에서 실제로 걷은 회비와 공금으로 쓴 금액을 적으세요. 택시를 함께 탄 사람만 ‘탑승’으로 표시하세요. 계산한 뒤 결산 문구를 복사할 수 있습니다.",
  fields: [
    ["meal", "공금으로 결제한 식사비(원)", "number"],
    ["taxi", "개인 카드로 결제한 택시비(원)", "number"],
    ["payer", "택시비를 먼저 낸 사람", "text"],
  ],
  groups: [{ key: "members", label: "모임 참여자", max: 12, columns: [
    ["name", "이름", "text"], ["dues", "실제로 낸 회비(원)", "number"],
    ["rode", "택시 이용", "select", [["no", "미탑승"], ["yes", "탑승"]]],
  ] }],
  example: {
    settings: { meal: 90000, taxi: 18000, payer: "A" },
    members: ["A", "B", "C", "D"].map((name) => ({ name, dues: 30000, rode: ["A", "B"].includes(name) ? "yes" : "no" })),
  },
  checks: ["A와 B가 타면 B가 A에게 9,000원을 보냅니다. C도 탔다면 B와 C가 각각 6,000원을 보냅니다. 두 경우 모두 공금 잔액은 30,000원입니다."],
};

const PUBLIC_WORKSHEETS_V229106 = {
  "shared-living-cost-rules": {
    title: "공동 생활비 네 가지 분담 계산표",
    outcome: "각 지출에 참여한 사람을 먼저 정한 뒤 그 안에서 균등·소득·이용량·합의 비율을 비교합니다.",
    instruction: "참여자 이름은 쉼표 없이 적고 각 지출의 참여자는 A,B,C처럼 적습니다. 본문의 전체 금액 동일 분배를 재현하려면 모든 지출에 전체 참여자를 선택합니다. 품목별 분배를 재현하려면 그 품목을 함께 쓴 사람만 선택한 뒤 균등 결과를 봅니다. 소득·이용량·합의 칸은 선택한 사람 사이의 비율이며, 인원수 기준은 해당 인원수를 비율로 입력할 수 있습니다. 같은 참여자의 지출을 합친 뒤 원 단위로 배분합니다.",
    fields: [],
    groups: [
      { key: "people", label: "참여자와 비율", max: 12, columns: [["name", "이름", "text"], ["income", "소득 비율", "number"], ["use", "이용량 비율", "number"], ["agreed", "합의 비율", "number"]] },
      { key: "transactions", label: "원본 지출", columns: [["item", "품목", "text"], ["payer", "결제자", "text"], ["amount", "금액(원)", "number"], ["participants", "참여자(쉼표로 구분)", "text"]] },
    ],
    // V22.9.140 독립 검토: 기본값은 본문 비교표(동일·비율·인원수 분배 = 모든 지출을 세 사람이 나눔)를 그대로 재현하는 입력이다.
    // 장보기를 B·C 만 나눈 입력은 균등 분담이 본문의 품목별 줄과 같아 ‘본문 품목별’ 예제로 둔다(기본값이면 같은 화면의 비교표와 검산 표가 어긋났다).
    example: { settings: {}, people: SHARED_LIVING_PEOPLE, transactions: SHARED_LIVING_PURCHASES.map((row) => ({ ...row, participants: "A,B,C" })) },
    exampleLabel: "본문 비교표 · 모든 지출을 세 사람이 나눔",
    otherExamples: [
      { label: "본문 품목별 · 장보기는 B와 C", input: { settings: {}, people: SHARED_LIVING_PEOPLE, transactions: SHARED_LIVING_PURCHASES } },
      { label: "12만 1원 · 남는 1원 나누기", input: { settings: {}, people: [{ name: "A", income: 3, use: 1, agreed: 40 }, { name: "B", income: 2, use: 2, agreed: 35 }, { name: "C", income: 1, use: 3, agreed: 25 }], transactions: [{ payer: "A", amount: 60001, participants: "A,B,C" }, { payer: "B", amount: 40000, participants: "A,B,C" }, { payer: "C", amount: 20000, participants: "A,B,C" }] } },
    ],
    checks: ["이 예제는 본문 비교표처럼 모든 지출을 세 사람이 나눈 경우입니다(장보기도 A,B,C). 균등 분담은 동일 분배와 같이 B가 A에게 90,000원을 보내고, 소득 비율 4:3:3은 비율 분배(B가 A에게 66,000원·C에게 12,000원), 이용량 비율 2:1:1은 인원수 분배(B가 A와 C에게 30,000원씩)와 같습니다.", "장보기 참여자를 본문 사례처럼 B,C로 바꾸면(예제 ‘본문 품목별’) 균등 분담이 본문의 품목별 결과와 같아집니다. B가 A에게 110,000원, C가 A에게 20,000원을 보냅니다.", "참여자가 없거나 비율의 합이 0이면 완료 결과 대신 수정 안내가 나옵니다."],
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
    example: { settings: { basis: "2026-11-05" }, subscriptions: SUBSCRIPTION_ROWS },
    exampleLabel: "본문의 구독 여섯 건 · 영상 서비스 E 해지",
    otherExamples: [
      { label: "갱신 해지와 이용 종료일 비교", input: { settings: { basis: "2026-11-05" }, subscriptions: [{ name: "A 월 구독", amount: 9900, cycle: "monthly", next: "2026-11-20", cancel: "confirmed", confirmed: "2026-11-05", until: "2026-11-19", refund: 0 }, { name: "B 연 구독", amount: 120000, cycle: "annual", next: "2027-09-01", cancel: "confirmed", confirmed: "2026-11-05", until: "2027-08-31", refund: 0 }, { name: "C 이미 해지", amount: 6900, cycle: "monthly", next: "2026-10-25", cancel: "confirmed", confirmed: "2026-10-25", until: "2026-11-09", refund: 0 }] } },
      { label: "E와 연간 학습 앱 F의 갱신 해지", input: { settings: { basis: "2026-11-05" }, subscriptions: SUBSCRIPTION_ROWS.map((row) => row.name === "학습 앱 F" ? { ...row, cancel: "confirmed", confirmed: "2026-11-05", until: "2027-08-31" } : row) } },
    ],
    checks: ["11월 5일부터 12월 4일까지 예정액은 36,100원입니다. E의 해지를 반영하면 A·B·C의 26,600원이 남습니다.", "E를 ‘해지 요청’으로 바꿔 보세요. 청구가 확정적으로 취소되기 전에는 9,500원이 다시 예정액에 포함됩니다.", "‘E와 연간 학습 앱 F의 갱신 해지’를 고르면 갱신이 끝난 뒤 유지할 구독은 월 환산 31,600원입니다. F의 결제일은 내년 9월이어서 이번 30일의 예정액은 여전히 26,600원입니다."],
  },
};

// V22.9.139: 예산·비상금·카드 실적 글 3편에 본문 인라인 미니 계산기를 더해 계산 도구 글을 9편으로 늘린다.
// 세무 계산기 셋(카드 공제 전환·월세·연금저축 IRP)은 책임자 검토 없이 세무 범위를 넓히므로 넣지 않는다(사용자 11-22, 계획 결정 5).
const PUBLIC_MINI_CALCULATORS_V229139 = {
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
  "card-spending-threshold": [["전월 실적 손익 바로 계산하기", "#inline-worksheet"], ["연말정산 결제수단 전환 정리", "/payment-method-switch-nov-dec"]],
  "accountbook-habit": [["월 마감 잔액 대조표", "/monthly-closing-routine"], ["카카오톡 한 줄 기록 방법", "/kakao-guide"]],
  "payday-budget-cycle": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "expense-category-rules": [["영수증 한 장의 분류와 환불 대조하기", "#section-3"], ["월 마감 잔액 대조표", "/monthly-closing-routine"]],
  "emergency-fund-basics": [["비상금·월 적립액 바로 계산하기", "#inline-worksheet"], ["연간 비정기 지출 적립표", "/sinking-fund-annual-expenses"]],
  "weekly-report-reading": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["리포트 읽는 법 안내", "/report-guide"]],
  "family-roles-accountbook": [["공동 생활비 4가지 분담표", "/shared-living-cost-rules"], ["공동 가계부 운영 안내", "/group-accountbook"]],
  "household-spending-statistics": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["1인 가구 생활비 기준", "/single-household-living-cost"]],
  "single-household-living-cost": [["1인 가구 연말정산 공제", "/single-household-year-end-tax"], ["월세 세액공제 기록 정리", "/rent-tax-credit-records"]],
  "food-cost-benchmark": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["주간 리포트 점검 기준", "/weekly-report-reading"]],
  "utility-bills-seasonality": [["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"], ["아파트 관리비 고지서 분석", "/apartment-maintenance-fee"]],
  "inflation-budget-update": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["식비·외식비 통계 비교", "/food-cost-benchmark"]],
  "card-income-deduction-basics": [["11~12월 결제수단 전환 정리", "/payment-method-switch-nov-dec"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "year-end-tax-expense-check": [["연말정산 시기별 준비 일정", "/year-end-tax-timeline-checklist"], ["11~12월 결제수단 전환 정리", "/payment-method-switch-nov-dec"]],
  "rent-tax-credit-records": [["국세청·법령 원문으로 확인하기", "#sources"], ["주거비 소득·세액공제 비교", "/housing-deductions-overview"]],
  "apartment-maintenance-fee": [["계절별 공과금 예산 세우기", "/utility-bills-seasonality"], ["고정비 점검 체크리스트", "/fixed-cost-checklist"]],
  "mobile-plan-cost-review": [["구독 해지·갱신 계산표", "/subscription-cleanup"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "debt-repayment-order": [["연말정산 환급금 배분 계획", "/tax-refund-money-plan"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "savings-rate-tracking": [["연금저축·IRP 세액공제 정리", "/pension-savings-irp-tax-credit"], ["계좌 현금흐름 계산표", "/cash-flow-table"]],
  "first-job-budget": [["50/30/20 예산 배분 계산표", "/budget-ratio-guide"], ["비상금 목표·적립 계산표", "/emergency-fund-basics"]],
  "car-ownership-cost": [["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"], ["고정비 점검 체크리스트", "/fixed-cost-checklist"]],
  "childcare-cost-planning": [["의료·교육·기부금 공제 정리", "/medical-education-donation-deductions"], ["비정기 지출 적립 계산표", "/sinking-fund-annual-expenses"]],
  "couple-account-structure": [["공동 생활비 4가지 분담표", "/shared-living-cost-rules"], ["맞벌이 부부 공제 몰아주기", "/dual-income-deduction-allocation"]],
  "expense-review-questions": [["월 마감 잔액 대조표", "/monthly-closing-routine"], ["주간 리포트 점검 기준", "/weekly-report-reading"]],
  "year-end-tax-timeline-checklist": [["11~12월 결제수단 전환 정리", "/payment-method-switch-nov-dec"], ["연금저축·IRP 세액공제 정리", "/pension-savings-irp-tax-credit"]],
  "payment-method-switch-nov-dec": [["국세청·법령 원문으로 확인하기", "#sources"], ["카드 전월 실적 손익 계산표", "/card-spending-threshold"]],
  "medical-education-donation-deductions": [["맞벌이 부부 공제 배분", "/dual-income-deduction-allocation"], ["연말정산 지출 증빙 점검", "/year-end-tax-expense-check"]],
  "dual-income-deduction-allocation": [["부부 공동·각자 통장 구조", "/couple-account-structure"], ["11~12월 결제수단 전환 정리", "/payment-method-switch-nov-dec"]],
  "pension-savings-irp-tax-credit": [["국세청·법령 원문으로 확인하기", "#sources"], ["연말정산 환급금 배분 계획", "/tax-refund-money-plan"]],
  "single-household-year-end-tax": [["월세 세액공제 기록 정리", "/rent-tax-credit-records"], ["11~12월 결제수단 전환 정리", "/payment-method-switch-nov-dec"]],
  "tax-refund-money-plan": [["비상금 목표·적립 계산표", "/emergency-fund-basics"], ["대출 상환 우선순위 정리", "/debt-repayment-order"]],
  "housing-deductions-overview": [["월세 세액공제 기록 정리", "/rent-tax-credit-records"], ["연말정산 시기별 준비 일정", "/year-end-tax-timeline-checklist"]],
});

// V22.9.139: 차트는 본문 계산표 기본 예제와 같은 값을 보여 주는 글 세 편에만 둔다(사용자 11-22, 계획 7절 5 — 40편에 같은 꼴을 한꺼번에 넣지 않는다).
// 단위가 섞이거나 근거를 설명할 수 없는 비중은 그리지 않는다. 값은 검사(validate-adsense-master-v229139)가 계산표 예제와 대조한다.
const PUBLIC_ARTICLE_CHARTS_V229139 = Object.freeze({
  "budget-ratio-guide": ["월 300만 원 소득의 50/30/20 예산 배분 비교", [["필수 생활비(50%)", 150, "150만 원"], ["선택 소비(30%)", 90, "90만 원"], ["저축·상환(20%)", 60, "60만 원"]], "예시: 월 실수령 300만 원 기준 영역별 배분 금액(아래 계산표 기본 예제와 같은 값)"],
  "emergency-fund-basics": ["월 필수 생활비 150만 원 기준 단계별 비상금 목표", [["1개월분", 150, "150만 원"], ["3개월분(예제 목표)", 450, "450만 원"], ["6개월분", 900, "900만 원"]], "예시: 선택 소비를 뺀 월 필수 생활비 150만 원 기준(아래 계산표 기본 예제와 같은 값)"],
  "card-spending-threshold": ["카드 전월 실적 30만 원 기준과 인정·부족액", [["전월 실적 기준", 300, "30만 원"], ["현재 실적 인정액", 250, "25만 원"], ["실적 부족액", 50, "5만 원"]], "예시: 총 결제 31만 원 중 실적 제외 6만 원을 뺀 인정액(아래 계산표 기본 예제와 같은 값)"],
});

function renderArticleDataChartV229139(slug) {
  const spec = PUBLIC_ARTICLE_CHARTS_V229139[slug];
  if (!spec) return "";
  const [title, bars, caption] = spec;
  const max = Math.max(1, ...bars.map((b) => Math.max(0, Number(b[1]) || 0)));
  const colors = ["#1d4ed8", "#0284c7", "#0d9488", "#4f46e5"];
  const height = 42 + bars.length * 42;
  const rowsSvg = bars.map(([label, val, display], idx) => {
    const y = 34 + idx * 42;
    const ratio = Math.max(0, Number(val) || 0) / max;
    const width = ratio > 0 ? Math.max(4, Math.round(ratio * 290)) : 0; // 0원은 막대를 그리지 않는다(값 글자는 둔다).
    const color = colors[idx % colors.length];
    return `<g transform="translate(0,${y})"><text x="12" y="20" fill="#1e293b" font-size="13" font-weight="600">${escapeHtml(label)}</text><rect x="215" y="4" width="295" height="22" rx="6" fill="#e8effa"/><rect x="215" y="4" width="${width}" height="22" rx="6" fill="${color}"/><text x="520" y="20" fill="#172033" font-size="13" font-weight="700">${escapeHtml(display)}</text></g>`;
  }).join("");
  return `<figure class="pubDataChart" role="group" aria-label="${escapeHtml(title)}"><svg class="pubChartSvg" viewBox="0 0 630 ${height}" role="img" aria-label="${escapeHtml(title)}"><rect x="0" y="0" width="630" height="${height}" rx="14" fill="#f8fafd"/><text x="12" y="22" fill="#1d4ed8" font-size="12.5" font-weight="700">${escapeHtml(title)}</text>${rowsSvg}</svg><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

// V22.9.107 D-4~D-6: 계산표 자산 주소는 1년 캐시(immutable)라 계산표 화면(worksheet-runtime.js)이 바뀌면 여기 판을 올린다.
// V22.9.139: 계산 함수(worksheet-calculations.js)에 미니 계산기 셋이 더해져 계산표 쪽 바이트가 바뀌었으므로 v229139 로 올린다.
// 바로 앞 판 주소는 다음 판까지 같은 내용을 낸다(글을 5분 캐시로 받은 브라우저가 옛 주소를 누를 수 있다). 두 판 전 주소는 404 다.
const PUBLIC_WORKSHEET_ASSET_VERSION_V229107 = "v229140";
const PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107 = Object.freeze(["v229139"]);
function publicWorksheetPathV229106(slug, version = PUBLIC_WORKSHEET_ASSET_VERSION_V229107) { return `/assets/living-worksheet-${version}-${slug}.html`; }

// V22.9.140: 수정일은 본문이나 기본 예제·계산 결과가 실제로 바뀐 글에만 올린다. 계산표 여섯 글 중 넷(룸메이트·현금흐름·연간 목돈·월 마감)과
// 비상금 글은 본문·입력 예제·계산 결과가 V22.9.139 와 같아 그대로 둔다(머리 단추가 본문 계산표로 가는 것은 내용 수정이 아니다).
// 예산 비율(부족한 금액 줄)·카드 실적(손익 설명) 글은 입력 예제는 같지만 화면의 계산 결과가 바뀌어 올린다(독립 검토).
const PUBLIC_ARTICLE_REVISED_V229140 = Object.freeze({
  "shared-living-cost-rules": "2026-11-22", "subscription-cleanup": "2026-11-22", "expense-category-rules": "2026-11-22",
  "budget-ratio-guide": "2026-11-22", "card-spending-threshold": "2026-11-22",
});

function enrichPublicWorksheetsV229106(catalog) {
  const optionLabel = (column, value) => column[2] === "select" ? column[3].find((option) => option[0] === value)?.[1] || value : String(value ?? "");
  for (const [slug, ctas] of Object.entries(PUBLIC_ARTICLE_CTA_MAP_V229139)) {
    const page = catalog[slug];
    if (!page) continue;
    if (PUBLIC_ARTICLE_REVISED_V229140[slug]) page.updated = PUBLIC_ARTICLE_REVISED_V229140[slug];
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
    page.updated = PUBLIC_ARTICLE_REVISED_V229140[slug] || "2026-11-07";
    page.worksheet = true;
    page.primary = ["입력값을 바꿔 계산하기", "#inline-worksheet"];
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
  GROUP_TREASURER_WORKSHEET, PUBLIC_ALL_CALCULATORS_V229139, PUBLIC_ARTICLE_CHARTS_V229139,
  PUBLIC_ARTICLE_CTA_MAP_V229139, PUBLIC_MINI_CALCULATORS_V229139, PUBLIC_WORKSHEETS_V229106,
  PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107, PUBLIC_WORKSHEET_ASSET_VERSION_V229107,
  enrichPublicWorksheetsV229106, publicWorksheetPathV229106, renderArticleDataChartV229139,
};
// @build:exports-end
