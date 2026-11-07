// @build:imports-start
import { worksheetComputeV229106 } from "./worksheet-calculations.js";
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

// V22.9.107 D-4~D-6: 계산표 자산 주소는 1년 캐시(immutable)라 계산표 화면(worksheet-runtime.js)이 바뀌면 여기 판을 올린다.
// 바로 앞 판 주소는 다음 판까지 같은 내용을 낸다(글을 5분 캐시로 받은 브라우저가 옛 주소를 누를 수 있다). 두 판 전 주소는 404 다.
const PUBLIC_WORKSHEET_ASSET_VERSION_V229107 = "v229107";
const PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107 = Object.freeze(["v229106"]);
function publicWorksheetPathV229106(slug, version = PUBLIC_WORKSHEET_ASSET_VERSION_V229107) { return `/assets/living-worksheet-${version}-${slug}.html`; }

function enrichPublicWorksheetsV229106(catalog) {
  const optionLabel = (column, value) => column[2] === "select" ? column[3].find((option) => option[0] === value)?.[1] || value : String(value ?? "");
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
  catalog.home.updated = "2026-11-07";
}

// @build:exports-start
export {
  PUBLIC_WORKSHEETS_V229106, PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107,
  PUBLIC_WORKSHEET_ASSET_VERSION_V229107, enrichPublicWorksheetsV229106, publicWorksheetPathV229106,
};
// @build:exports-end
