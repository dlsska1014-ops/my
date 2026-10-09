
const NAVER_CARD_SOURCE_NOTE = "네이버페이 카드 페이지 기준 요약(카드사/혜택 카테고리/노출 카드). 실제 혜택·한도·프로모션은 카드사 상품설명서와 약관 확인 필요.";
const NAVER_CARD_ISSUERS = ["롯데카드", "삼성카드", "신한카드", "우리카드", "하나카드", "현대카드", "현대백화점카드", "BC바로카드", "IBK기업은행카드", "KB국민카드", "NH농협카드"];
const NAVER_BENEFIT_CATEGORIES = ["주유·충전", "온라인", "쇼핑", "백화점", "대형마트", "편의점", "푸드", "카페·간식", "관리비", "대중교통", "문화·레저", "마일리지", "여행", "간편결제", "통신", "교육·육아", "건강", "전가맹점", "생활", "보험·상조", "렌탈"];
const CARD_BENEFIT_CATALOG = [
  {
    id: "naver_linefriends_shinhan",
    issuer: "신한카드",
    name: "네이버페이 라인프렌즈 신한카드",
    aliases: ["라인프렌즈 신한", "네이버 라인프렌즈", "네이버페이 신한", "라인프렌즈카드"],
    performance: { monthly_required: 0, label: "전월실적 제한 없음(네이버 노출 기준)" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "네이버에서 2% 적립, 기간 한정 추가 적립 노출. 프로모션은 변동 가능.",
    benefits: [
      { category: "온라인", keywords: ["네이버", "네이버페이", "스마트스토어", "브랜드스토어", "쇼핑"], rate: 0.02, unlimited: true, monthly_limit_label: "한도 제한 없음", label: "네이버 2% 적립" },
      { category: "간편결제", keywords: ["네이버페이", "Npay", "엔페이"], rate: 0.02, unlimited: true, monthly_limit_label: "기간 한정 추가 적립", label: "기간 한정 추가 적립" }
    ]
  },
  {
    id: "npay_biz_shinhan",
    issuer: "신한카드",
    name: "Npay biz 신한카드",
    aliases: ["엔페이 비즈", "Npay biz", "네이버페이 비즈", "신한 비즈"],
    performance: { monthly_required: 0, label: "전월실적 제한 없음(네이버 노출 기준)" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "Npay 온라인 간편결제 1.5% 적립 노출.",
    benefits: [
      { category: "간편결제", keywords: ["네이버페이", "Npay", "간편결제", "온라인"], rate: 0.015, unlimited: true, monthly_limit_label: "한도 제한 없음", label: "Npay 온라인 간편결제 1.5% 적립" }
    ]
  },
  {
    id: "naver_webtoon_samsung_id",
    issuer: "삼성카드",
    name: "네이버웹툰 삼성 iD 카드",
    aliases: ["네이버웹툰 삼성", "웹툰 삼성", "삼성 iD", "네이버웹툰카드"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "네이버 디지털 콘텐츠 50% 적립 노출. 상세 한도는 약관 확인 필요.",
    benefits: [
      { category: "문화·레저", keywords: ["네이버웹툰", "웹툰", "시리즈", "디지털콘텐츠", "콘텐츠"], rate: 0.5, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "네이버 디지털 콘텐츠 50% 적립" }
    ]
  },
  {
    id: "naver_hyundai_edition2",
    issuer: "현대카드",
    name: "네이버 현대카드 Edition2",
    aliases: ["네이버 현대", "현대 에디션2", "네이버현대", "네이버 현대카드"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "네이버페이 포인트 최대 7% 적립 노출. 상세 구간/한도는 약관 확인 필요.",
    benefits: [
      { category: "간편결제", keywords: ["네이버페이", "Npay", "스마트스토어", "브랜드스토어", "쇼핑"], rate: 0.07, monthly_limit: 0, monthly_limit_label: "최대 7%, 한도 약관 확인", label: "네이버페이 포인트 최대 7% 적립" }
    ]
  },
  {
    id: "naverpay_taptap_samsung",
    issuer: "삼성카드",
    name: "네이버페이 taptap 삼성카드",
    aliases: ["네이버페이 탭탭", "taptap", "탭탭 삼성", "네이버 taptap"],
    performance: { monthly_required: 300000, label: "전월 실적 30만원 이상" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "네이버페이 쓸 때마다 10% 적립 노출. 상세 월 한도는 약관 확인 필요.",
    benefits: [
      { category: "간편결제", keywords: ["네이버페이", "Npay", "간편결제", "페이"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "네이버페이 10% 적립" }
    ]
  },
  {
    id: "cu_npay_shinhan",
    issuer: "신한카드",
    name: "CU Npay카드",
    aliases: ["CU Npay", "CU 네이버페이", "씨유 엔페이", "CU카드"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "CU편의점 최대 20% 할인, 네이버페이 포인트 최대 5% 적립 노출.",
    benefits: [
      { category: "편의점", keywords: ["CU", "씨유", "편의점"], rate: 0.20, monthly_limit: 0, monthly_limit_label: "최대 20%, 한도 약관 확인", label: "CU편의점 최대 20% 할인" },
      { category: "간편결제", keywords: ["네이버페이", "Npay", "페이"], rate: 0.05, monthly_limit: 0, monthly_limit_label: "최대 5%, 한도 약관 확인", label: "네이버페이 포인트 최대 5% 적립" }
    ]
  },
  {
    id: "naverpay_shopping_loca_lotte",
    issuer: "롯데카드",
    name: "[롯데카드] 네이버페이 쇼핑엔로카",
    aliases: ["쇼핑엔로카", "네이버페이 로카", "롯데 로카", "LOCA"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "장기할부 최대 36개월, 네이버페이포인트 적립 노출. 적립률/한도는 약관 확인 필요.",
    benefits: [
      { category: "온라인", keywords: ["네이버", "네이버페이", "쇼핑", "온라인", "할부"], rate: 0, monthly_limit: 0, monthly_limit_label: "적립률 약관 확인", label: "네이버페이포인트 적립/장기할부" }
    ]
  },
  {
    id: "naverpay_money_hana_check",
    issuer: "하나카드",
    name: "네이버페이 머니 하나 체크카드",
    aliases: ["머니 하나", "하나 체크", "네이버페이 머니 하나", "하나카드 체크"],
    performance: { monthly_required: 0, label: "전월실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 카드 모아보기",
    notes: "온·오프라인 어디서나 1.2% 적립 노출.",
    benefits: [
      { category: "전가맹점", keywords: ["카드", "결제", "전가맹점", "오프라인", "온라인"], rate: 0.012, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "온·오프라인 1.2% 적립" }
    ]
  },
  {
    id: "kb_goodday",
    issuer: "KB국민카드",
    name: "KB국민 굿데이카드",
    aliases: ["굿데이", "국민 굿데이", "KB 굿데이"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "주유 리터당 60원, 통신/교통 10% 할인 노출.",
    benefits: [
      { category: "주유·충전", keywords: ["주유", "휘발유", "경유", "충전"], rate: 0, monthly_limit: 0, monthly_limit_label: "리터당 60원", label: "주유 리터당 60원" },
      { category: "통신", keywords: ["통신", "휴대폰", "핸드폰", "SKT", "KT", "LG유플러스"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "통신 10% 할인" },
      { category: "대중교통", keywords: ["교통", "버스", "지하철", "티머니", "캐시비"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "교통 10% 할인" }
    ]
  },
  {
    id: "woori_card_jungseok2",
    issuer: "우리카드",
    name: "카드의정석2",
    aliases: ["카드의정석", "정석2", "우리 정석"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "국내외 가맹점 1.2% 할인 노출.",
    benefits: [
      { category: "전가맹점", keywords: ["전가맹점", "국내", "해외", "결제"], rate: 0.012, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "국내외 가맹점 1.2% 할인" }
    ]
  },
  {
    id: "lotte_loca_likit",
    issuer: "롯데카드",
    name: "[롯데카드] LOCA LIKIT카드",
    aliases: ["LOCA LIKIT", "로카 라이킷", "라이킷", "롯데 라이킷"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "스타벅스 최대 60%, 교통/통신 10% 할인 노출.",
    benefits: [
      { category: "카페·간식", keywords: ["스타벅스", "스벅", "카페", "커피"], rate: 0.60, monthly_limit: 0, monthly_limit_label: "최대 60%, 한도 약관 확인", label: "스타벅스 최대 60% 할인" },
      { category: "대중교통", keywords: ["교통", "버스", "지하철"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "교통 10% 할인" },
      { category: "통신", keywords: ["통신", "휴대폰", "인터넷"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "통신 10% 할인" }
    ]
  },
  {
    id: "nh_allbareun_flex",
    issuer: "NH농협카드",
    name: "올바른FLEX카드",
    aliases: ["올바른 FLEX", "올바른플렉스", "농협 플렉스", "FLEX카드"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "스타벅스 50%, 구독서비스 20% 할인 노출.",
    benefits: [
      { category: "카페·간식", keywords: ["스타벅스", "스벅", "카페", "커피"], rate: 0.50, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "스타벅스 50% 할인" },
      { category: "문화·레저", keywords: ["구독", "넷플릭스", "유튜브", "디즈니", "멤버십"], rate: 0.20, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "구독서비스 20% 할인" }
    ]
  },
  {
    id: "hyundai_zero_up",
    issuer: "현대카드",
    name: "현대카드 ZERO Up",
    aliases: ["ZERO Up", "제로업", "현대 제로", "현대카드 제로"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "온라인몰, 대형마트, 주유, 이동통신요금 1.6% 할인 노출.",
    benefits: [
      { category: "온라인", keywords: ["온라인", "쇼핑", "쿠팡", "네이버쇼핑"], rate: 0.016, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "온라인몰 1.6% 할인" },
      { category: "대형마트", keywords: ["마트", "이마트", "홈플러스", "롯데마트", "코스트코"], rate: 0.016, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "대형마트 1.6% 할인" },
      { category: "주유·충전", keywords: ["주유", "휘발유", "경유", "충전"], rate: 0.016, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "주유 1.6% 할인" },
      { category: "통신", keywords: ["통신", "휴대폰", "인터넷"], rate: 0.016, unlimited: true, monthly_limit_label: "한도 약관 확인", label: "이동통신요금 1.6% 할인" }
    ]
  },
  {
    id: "shinhan_mr_life",
    issuer: "신한카드",
    name: "신한카드 Mr.Life",
    aliases: ["미스터라이프", "Mr.Life", "신한 미스터", "신한 Mr Life"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "공과금, 편의점, 마트 10% 할인 노출.",
    benefits: [
      { category: "관리비", keywords: ["공과금", "전기", "가스", "수도", "관리비"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "공과금 10% 할인" },
      { category: "편의점", keywords: ["편의점", "CU", "GS25", "세븐일레븐"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "편의점 10% 할인" },
      { category: "대형마트", keywords: ["마트", "이마트", "홈플러스", "롯데마트"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "마트 10% 할인" }
    ]
  },
  {
    id: "ibk_point_credit",
    issuer: "IBK기업은행카드",
    name: "IBK포인트(신용)",
    aliases: ["IBK포인트", "기업 포인트", "IBK 포인트", "기업은행 포인트"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "전가맹점 최대 3.3% 적립 노출.",
    benefits: [
      { category: "전가맹점", keywords: ["전가맹점", "결제", "카드"], rate: 0.033, monthly_limit: 0, monthly_limit_label: "최대 3.3%, 한도 약관 확인", label: "전가맹점 최대 3.3% 적립" }
    ]
  },
  {
    id: "samsung_taptap_digital",
    issuer: "삼성카드",
    name: "taptap DIGITAL",
    aliases: ["탭탭 디지털", "taptap DIGITAL", "삼성 디지털", "탭탭DIGITAL"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 20000,
    source: "네이버페이 인기카드 TOP10",
    notes: "월 최대 2만원, 간편결제 5% 할인 노출.",
    benefits: [
      { category: "간편결제", keywords: ["간편결제", "네이버페이", "카카오페이", "페이"], rate: 0.05, monthly_limit: 20000, monthly_limit_label: "월 최대 20,000원", label: "간편결제 5% 할인" }
    ]
  },
  {
    id: "hana_wonder_living",
    issuer: "하나카드",
    name: "원더카드 2.0 LIVING",
    aliases: ["원더카드", "원더 리빙", "하나 원더", "Wonder Living"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "아파트관리비, 병원, 약국 10% 청구할인 노출.",
    benefits: [
      { category: "관리비", keywords: ["관리비", "아파트관리비", "아파트"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "아파트관리비 10% 청구할인" },
      { category: "건강", keywords: ["병원", "의원", "약국", "진료", "약"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "병원/약국 10% 청구할인" }
    ]
  },
  {
    id: "bc_on_off",
    issuer: "BC바로카드",
    name: "BC 바로 ON&OFF 카드",
    aliases: ["ON&OFF", "온앤오프", "BC 온오프", "BC바로 온앤오프"],
    performance: { monthly_required: 0, label: "실적 조건 약관 확인" },
    total_monthly_limit: 0,
    source: "네이버페이 인기카드 TOP10",
    notes: "간편결제, 교통, 음식점, 카페 10% 할인 노출.",
    benefits: [
      { category: "간편결제", keywords: ["간편결제", "페이", "네이버페이", "카카오페이"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "간편결제 10% 할인" },
      { category: "대중교통", keywords: ["교통", "버스", "지하철"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "교통 10% 할인" },
      { category: "푸드", keywords: ["음식점", "식당", "외식", "점심", "저녁"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "음식점 10% 할인" },
      { category: "카페·간식", keywords: ["카페", "커피", "스타벅스", "디저트"], rate: 0.10, monthly_limit: 0, monthly_limit_label: "한도 약관 확인", label: "카페 10% 할인" }
    ]
  }
];

function allCardIssuers(){return [...new Set(CARD_BENEFIT_CATALOG.map(c=>c.issuer))].sort();}
function findCardBenefit(cardId){return CARD_BENEFIT_CATALOG.find(c=>c.id===cardId)||CARD_BENEFIT_CATALOG[0];}
function normalizeCardText(value=""){return normalizeText(String(value||"")).toLowerCase().replace(/\s+/g,"");}
function cardMatchesRow(card,row){const r=safeObject(row);const text=normalizeCardText(`${r.payment_method||""} ${r.memo||""} ${r.raw_text||""}`);const names=[card.name,card.issuer,...(card.aliases||[])].map(normalizeCardText).filter(Boolean);return names.some(n=>n&&text.includes(n));}
function benefitMatchesRow(benefit,row){const r=safeObject(row);const text=normalizeText(`${r.category||""} ${r.memo||""} ${r.raw_text||""} ${r.payment_method||""}`);if(benefit.category&&normalizeText(r.category||"")===normalizeText(benefit.category))return true;return safeArray(benefit.keywords).some(k=>text.toLowerCase().includes(String(k||"").toLowerCase()));}
function calculateCardBenefitUsage(card,rows=[]){const expenseRows=safeArray(rows).filter(r=>r.type!=="income");const matchedRows=expenseRows.filter(r=>cardMatchesRow(card,r));const usageAmount=matchedRows.reduce((a,r)=>a+Number(r.amount||0),0);const required=Number(card.performance?.monthly_required||0);const benefits=safeArray(card.benefits).map(b=>{const br=matchedRows.filter(r=>benefitMatchesRow(b,r));const spend=br.reduce((a,r)=>a+Number(r.amount||0),0);const rawEstimate=Math.round(spend*Number(b.rate||0));const limit=Number(b.monthly_limit||0);const estimated=b.unlimited?rawEstimate:limit>0?Math.min(limit,rawEstimate):rawEstimate;const remainingLimit=b.unlimited?null:limit>0?Math.max(0,limit-estimated):null;return {...b,spend,estimated,remaining_limit:remainingLimit,count:br.length};});const total=benefits.reduce((a,b)=>a+Number(b.estimated||0),0);const capped=card.total_monthly_limit?Math.min(Number(card.total_monthly_limit),total):total;return {card,matched_count:matchedRows.length,usage_amount:usageAmount,required_performance:required,remaining_performance:Math.max(0,required-usageAmount),performance_rate:required?Math.min(100,Math.round(usageAmount/required*100)):0,estimated_total:capped,remaining_total_limit:card.total_monthly_limit?Math.max(0,Number(card.total_monthly_limit)-capped):null,benefits,matchedRows};}
function renderCardOptions(selectedId="",issuer=""){return CARD_BENEFIT_CATALOG.filter(c=>!issuer||c.issuer===issuer).map(c=>`<option value="${escapeHtml(c.id)}" ${c.id===selectedId?"selected":""}>${escapeHtml(c.issuer)} · ${escapeHtml(c.name)}</option>`).join("");}
function renderIssuerOptions(selected=""){return [`<option value="">카드사 전체</option>`,...allCardIssuers().map(i=>`<option value="${escapeHtml(i)}" ${i===selected?"selected":""}>${escapeHtml(i)}</option>`)].join("");}
function formatBenefitLimit(value,label=""){if(label)return escapeHtml(label);if(value===null||value===undefined)return "약관 확인";const n=Number(value||0);if(!n)return "약관 확인";return `${numberWithCommas(n)}원`;}
function formatBenefitValue(value){if(value===null||value===undefined)return "약관 확인";return `${numberWithCommas(value||0)}원`;}
function renderBenefitRows(calc){const rows=safeArray(calc?.benefits);if(!rows.length)return `<tr><td colspan="6">혜택 기준정보가 없습니다.</td></tr>`;return rows.map(b=>`<tr><td><b>${escapeHtml(b.category||"")}</b><div class="small">${escapeHtml(b.label||"")}</div></td><td>${b.rate?`${Math.round(Number(b.rate||0)*1000)/10}%`:"약관 확인"}</td><td>${formatBenefitLimit(b.monthly_limit,b.monthly_limit_label)}</td><td>${numberWithCommas(b.spend||0)}원</td><td>${formatBenefitValue(b.estimated)}</td><td>${formatBenefitLimit(b.remaining_limit)}</td></tr>`).join("");}
function renderMatchedCardRows(rows=[]){const arr=safeArray(rows).slice(0,80);if(!arr.length)return `<tr><td colspan="7">이 카드로 추정되는 거래가 없습니다. 거래 입력 시 결제수단에 카드명을 남기면 더 정확해집니다.</td></tr>`;return arr.map(r=>`<tr><td>${escapeHtml(String(r.transaction_date||""))}</td><td>${r.type==="income"?"수입":"지출"}</td><td>${numberWithCommas(r.amount||0)}원</td><td>${escapeHtml(r.category||"")}</td><td>${escapeHtml(r.memo||r.raw_text||"")}</td><td>${escapeHtml(r.payment_method||"")}</td><td>${escapeHtml(r.id||"")}</td></tr>`).join("");}
async function buildCardBenefitsPayload(env, url, householdsArg = null) {
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = householdsArg || await fetchAdminHouseholds(env);
  const requestedHouseholdId = String(url.searchParams.get("household_id") || "").trim();
  const selected = selectRequestedScopedHousehold(households, requestedHouseholdId);
  const householdId = selected?.id || "";
  const issuer = String(url.searchParams.get("issuer") || "").trim();
  const selectedCardId = String(url.searchParams.get("card_id") || "").trim();
  const filtered = CARD_BENEFIT_CATALOG.filter((item) => !issuer || item.issuer === issuer);
  const card = filtered.find((item) => item.id === selectedCardId) || findCardBenefit(selectedCardId) || filtered[0] || CARD_BENEFIT_CATALOG[0];
  const rows = householdId ? await fetchAdminRows(env, { month, householdId, type: "all" }) : [];
  const calc = calculateCardBenefitUsage(card, rows);
  return { month, households, householdId, issuer, card, calc, catalog: CARD_BENEFIT_CATALOG };
}
async function handleCardBenefitsPage(request,env,url){const scoped=await getScopedHouseholdsForPage(request,env);if(scoped.scope==="none")return redirectResponse("/my");const {month,households,householdId,issuer,card,calc}=await buildCardBenefitsPayload(env,url,scoped.households);const householdOptions=households.map(h=>`<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}" ${h.id===householdId?"selected":""}>${escapeHtml(h.name)}</option>`).join("");const qs=new URLSearchParams();qs.set("month",month);if(householdId)qs.set("household_id",householdId);qs.set("card_id",card.id);return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>카드 혜택 자동조회</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#5b21b6));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.92}.filters{display:grid;grid-template-columns:1.1fr .9fr 1.5fr 150px;gap:8px;margin-top:14px}.filters select,.filters input,.filters button{height:44px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055);overflow:hidden}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.progress{height:14px;border-radius:999px;background:#e5e7eb;overflow:hidden}.bar{height:100%;background:#3182F6;border-radius:999px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.tableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;background:#fff;min-width:820px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.small{font-size:12px;color:#64748b;margin-top:3px}.pill{display:inline-flex;border-radius:999px;background:#ede9fe;color:#5b21b6;padding:5px 9px;font-weight:1000;font-size:12px;margin:2px}@media(max-width:820px){.wrap{padding:12px}.hero h1{font-size:24px}.filters{grid-template-columns:1fr}.card{padding:14px}}</style></head><body>${renderUnifiedNav("card-benefits",{month,householdId,householdName:(households.find((h)=>h.id===householdId)||{}).name})}<main class="wrap"><section class="hero"><h1>카드 혜택 자동조회</h1><p>네이버페이 카드 페이지 기준으로 정리한 카드사/혜택 요약을 드롭다운으로 선택하고, 이번 달 거래와 매칭해 실적/혜택 한도를 계산합니다.</p><form class="filters" method="get" action="/card-benefits"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><select name="issuer" onchange="this.form.submit()">${renderIssuerOptions(issuer)}</select><select name="card_id">${renderCardOptions(card.id,issuer)}</select><button type="submit">조회</button></form></section><section class="card"><h2>${escapeHtml(card.name)}</h2><p><span class="pill">${escapeHtml(card.issuer)}</span><span class="pill">${escapeHtml(card.performance?.label||"")}</span><span class="pill">통합 한도 ${numberWithCommas(card.total_monthly_limit||0)}원</span></p><p class="warnBox">${escapeHtml(card.notes||"카드 혜택 문서 기준정보는 운영 전 검수가 필요합니다.")}</p><div class="grid"><div class="metric"><span>이번 달 추정 사용액</span><b>${numberWithCommas(calc.usage_amount)}원</b></div><div class="metric"><span>실적 기준</span><b>${numberWithCommas(calc.required_performance)}원</b></div><div class="metric"><span>실적까지 남은 금액</span><b>${numberWithCommas(calc.remaining_performance)}원</b></div><div class="metric"><span>예상 혜택</span><b>${numberWithCommas(calc.estimated_total)}원</b></div><div class="metric"><span>남은 통합 한도</span><b>${formatBenefitValue(calc.remaining_total_limit)}</b></div><div class="metric"><span>매칭 거래</span><b>${numberWithCommas(calc.matched_count)}건</b></div></div><p class="note">실적 달성률 ${calc.performance_rate}%</p><div class="progress"><div class="bar" style="width:${Math.min(100,calc.performance_rate)}%"></div></div><p><a class="btn light" href="/payment-methods?${escapeHtml(qs.toString())}">결제수단 연결 안내</a></p><p class="note">${escapeHtml(NAVER_CARD_SOURCE_NOTE)}</p></section><section class="card"><h2>혜택 카테고리별 현황</h2><div class="tableWrap"><table><thead><tr><th>혜택</th><th>율</th><th>월 한도</th><th>매칭 지출</th><th>예상 혜택</th><th>남은 한도</th></tr></thead><tbody>${renderBenefitRows(calc)}</tbody></table></div></section><section class="card"><h2>카드 매칭 거래</h2><p class="note">거래의 결제수단/메모에 카드명 또는 별칭이 포함된 경우 매칭합니다. 다음 단계에서 결제수단 등록과 연결하면 더 정확해집니다.</p><div class="tableWrap"><table><thead><tr><th>거래일</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>결제수단</th><th>ID</th></tr></thead><tbody>${renderMatchedCardRows(calc.matchedRows)}</tbody></table></div></section></main></body></html>`);}
