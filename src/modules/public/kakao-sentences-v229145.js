// @build:imports-start
import { KAKAO_SENTENCE_RESULTS_V229145 } from "./kakao-sentences-results-v229145.js";
// @build:imports-end
// V22.9.145(애드센스 마지막 신청 계획 B3, 사용자 2026-11-25 "빠르게 검토하고 수정해서 재검토"): 카카오톡 문장 사전(/kakao-sentences).
// 보낸 문장마다 실제로 저장되는 값을 갈래별 표로 싣는다. 결과(KAKAO_SENTENCE_RESULTS_V229145)는 손으로 쓰지 않는다 —
// validate-v229145-kakao-sentences 가 운영과 같은 코드(픽스처 + /skill)에 문장을 1:1 채팅·단톡방 두 길로 보내 만들고(--write), 평소에는
// 다시 보내 이 값과 대조한다. 두 길의 결과가 다른 문장은 싣지 않는다. 날을 가리키는 말은 기준 시각(아래)에 보냈다고 보고 계산한다.
// 설명 문장(note)은 표에 있는 예로만 말하고, 그 사실은 갈래의 facts 에 적어 검사가 대조한다 — 결과가 바뀌어 검사가 실패하면 결과를 다시 만들고 note·facts 를 함께 고친다.
// 결과가 어색해 뺀 후보(1:1·방 같음): ‘미용실 25000원 신한체크’(메모에 ‘신한’ 이 남음), ‘버스 1500원 교통카드’(결제수단 ‘카드’·메모 ‘버스 교통’),
// ‘배달 23000원 배민페이’(결제수단 없음·메모에 남음), ‘편의점 삼각김밥 1500원’(외식), ‘점심 12000원 15000원’(둘째 금액이 따로 기타지출 1건) — 추적표 V145:K-1.
const KAKAO_SENTENCE_REFERENCE_V229145 = Object.freeze({ date: "2026-11-20", label: "2026년 11월 20일(금) 낮 12시" });
// 갈래마다 note(설명)와 facts(그 설명이 말하는 사실)를 함께 둔다. fact = { text, 열쇠: 기대값 } — 열쇠는 asks(저장하지 않고 답만)·records(저장 건수)·
// dates(건마다 날짜)·type·amount·category·payment·memo·date(첫 건의 칸)·reply(답 첫 줄). validate-v229145-kakao-sentences 가 실제 결과와 대조한다.
// 표에 없는 문장(설명 속 예)은 note 에 그대로 적혀 있어야 하고, 검사가 1:1·단톡방으로 다시 보내 확인한다. note 를 고치면 facts 도 함께 고친다.
const KAKAO_SENTENCE_SMS_V229145 = Object.freeze([
  "[Web발신]\n삼성1234승인 홍*동\n45,000원 일시불\n11/19 19:22 교촌치킨\n누적532,000원",
  "[Web발신]\n신한카드(1234)승인 김*수 12,000원 일시불 11/20 12:30 스타벅스",
]);
const KAKAO_SENTENCE_GROUPS_V229145 = Object.freeze([
  { key: "amount", title: "금액을 쓰는 여러 방법",
    note: "쉼표를 넣거나 ‘만’·‘천’·‘백’ 단위를 섞어도 표처럼 같은 금액으로 읽습니다. ‘점심 1만2천원’은 12,000원, ‘커피 4.5천원’은 4,500원입니다. ‘커피 4500’처럼 ‘원’을 빼도 되고, ‘1500원 버스’처럼 금액이 앞에 와도 됩니다. ‘3만원’처럼 내용 없이 금액만 보내면 분류와 메모가 ‘기타지출’로 저장됩니다. ‘택시 7’처럼 단위 없는 한 자리 숫자는 저장하지 않고 다시 묻습니다(아래 ‘다시 묻는 문장’).",
    facts: [
      { text: "점심 12,000원", amount: 12000 }, { text: "점심 1만2천원", amount: 12000 }, { text: "커피 4.5천원", amount: 4500 }, { text: "커피 4천5백원", amount: 4500 },
      { text: "커피 4500", amount: 4500 }, { text: "1500원 버스", amount: 1500, memo: "버스" }, { text: "3만원", category: "기타지출", memo: "기타지출" }, { text: "택시 7", asks: true },
    ],
    sentences: ["점심 12000원", "점심 12,000원", "점심 1만2천원", "점심 만원", "커피 4500", "커피 4천5백원", "커피 4.5천원", "커피 오천원", "저녁 3만5천원", "택시 7천원", "간식 2,500원", "장보기 5만 2300원", "월세 80만원", "노트북 135만원", "1500원 버스", "주차 3000", "3만원"] },
  { key: "date", title: "날짜를 함께 보내기",
    note: "날짜를 적지 않으면 보낸 날로 저장합니다. ‘어제’·‘그저께’·‘2일 전’·‘지난주 금요일’ 같은 말과 ‘11월 3일’·‘11/3’·‘2026-11-01’ 같은 날짜를 읽습니다. ‘3일 저녁 25000원’처럼 날만 적으면 이번 달의 그날로 저장하고, ‘25일 저녁 25000원’처럼 그날이 아직 오지 않았으면 저장하지 않고 다시 묻습니다(아래 ‘다시 묻는 문장’). 표의 날짜는 기준 시각에 보냈다고 보고 계산한 값이라, 다른 날 보내면 그날을 기준으로 달라집니다.",
    facts: [
      { text: "점심 12000원", date: "2026-11-20" }, { text: "오늘 마트 52300원", date: "2026-11-20" }, { text: "어제 병원 15000원", date: "2026-11-19" },
      { text: "그저께 택시 12000원", date: "2026-11-18" }, { text: "2일 전 약국 8천원", date: "2026-11-18" }, { text: "지난주 금요일 회식 4만원", date: "2026-11-13" },
      { text: "11월 3일 택시 14500원", date: "2026-11-03" }, { text: "11/3 커피 4500원", date: "2026-11-03" }, { text: "2026-11-01 관리비 230000원", date: "2026-11-01" },
      { text: "3일 저녁 25000원", date: "2026-11-03" }, { text: "25일 저녁 25000원", asks: true },
    ],
    sentences: ["오늘 마트 52300원", "어제 병원 15000원", "그저께 택시 12000원", "그제 미용실 25000원", "2일 전 약국 8천원", "지난주 금요일 회식 4만원", "3일 저녁 25000원", "11월 3일 택시 14500원", "11/3 커피 4500원", "10월 31일 주유 6만원", "지난달 25일 월세 80만원", "2026-11-01 관리비 230000원", "어제 점심 김치찌개 11,000원 신한카드"] },
  { key: "payment", title: "결제수단을 함께 보내기",
    note: "표에 있는 카드 이름(국민·현대·우리·하나카드)과 간편결제(삼성페이·카카오페이·네이버페이·토스페이), 체크카드·현금·계좌이체는 문장 끝에 붙이면 메모와 따로 결제수단으로 저장합니다. ‘토스페이’는 ‘토스’로 저장됩니다. 결제수단을 적지 않으면 그 칸은 비워 둡니다. 표에 없는 이름은 결제수단으로 읽지 못하기도 합니다. ‘점심 12000원 쿠팡페이’는 결제수단 없이 메모 ‘점심 쿠팡페이’로 저장됩니다.",
    facts: [
      { text: "점심 12000원 국민카드", payment: "국민카드", memo: "점심" }, { text: "주유 7만원 현대카드", payment: "현대카드" }, { text: "서점 18000원 우리카드", payment: "우리카드" },
      { text: "빵 6500원 하나카드", payment: "하나카드" }, { text: "마트 3만원 삼성페이", payment: "삼성페이" }, { text: "택시 14500원 카카오페이", payment: "카카오페이" },
      { text: "편의점 6800원 네이버페이", payment: "네이버페이" }, { text: "약국 8천원 토스페이", payment: "토스" }, { text: "장보기 52300원 체크카드", payment: "체크카드" },
      { text: "커피 4500원 현금", payment: "현금", memo: "커피" }, { text: "월세 80만원 계좌이체", payment: "계좌이체" }, { text: "점심 12000원", payment: "" },
      { text: "점심 12000원 쿠팡페이", payment: "", memo: "점심 쿠팡페이" },
    ],
    sentences: ["점심 12000원 국민카드", "주유 7만원 현대카드", "서점 18000원 우리카드", "빵 6500원 하나카드", "장보기 52300원 체크카드", "커피 4500원 현금", "월세 80만원 계좌이체", "마트 3만원 삼성페이", "택시 14500원 카카오페이", "편의점 6800원 네이버페이", "약국 8천원 토스페이"] },
  { key: "category", title: "분류가 정해지는 말",
    note: "분류는 문장 속 낱말로 정합니다. ‘스타벅스 라떼’는 카페/간식, ‘KTX’는 교통, ‘넷플릭스’는 구독으로 저장되는 식입니다. 분류를 정할 낱말이 없으면 기타지출로 저장합니다. ‘식비 50만원’은 ‘식비’ 낱말만으로 분류를 정하지 않아 메모 ‘식비’의 기타지출 기록이 됩니다. 식비 예산을 정하려면 ‘식비 예산 50만원’처럼 ‘예산’을 넣어 보냅니다(아래 ‘기록 대신 다른 일을 하는 말’).",
    facts: [
      { text: "스타벅스 라떼 5500원", category: "카페/간식" }, { text: "KTX 59800원", category: "교통" }, { text: "넷플릭스 13500원", category: "구독" },
      { text: "3만원", category: "기타지출" }, { text: "식비 50만원", category: "기타지출", memo: "식비" }, { text: "식비 예산 50만원", reply: "✅ 2026-11 식비 예산을 설정했어요." },
    ],
    sentences: ["스타벅스 라떼 5500원", "배달 치킨 23000원", "버스 1500원", "지하철 1400원", "KTX 59800원", "주유 6만원", "약국 감기약 8000원", "병원 진료비 15000원", "핸드폰 요금 55000원", "넷플릭스 13500원", "관리비 230000원", "전기요금 42000원", "보험료 87000원", "학원비 30만원", "헬스장 6만원", "영화 15000원", "축의금 10만원", "다이소 생활용품 12000원", "옷 69000원", "식비 50만원"] },
  { key: "income", title: "수입 기록",
    note: "표의 ‘월급’·‘상여금’·‘용돈 … 받음’·‘판매’·‘이자’·‘캐시백’·‘환급’·‘환불’ 문장은 수입으로 저장됩니다. 같은 낱말이라도 ‘아이 용돈 3만원’·‘대출 이자 30만원’처럼 나가는 돈으로 읽히는 문장은 지출로 저장됩니다. ‘월급 250만원 들어옴’·‘용돈 10만원 받음’의 ‘들어옴’·‘받음’은 메모에서 빠집니다. 결제 취소로 돌려받은 돈은 ‘수입 결제 취소 36000원’처럼 앞에 ‘수입’을 붙이면 수입으로 저장됩니다(붙이지 않은 ‘결제 취소 15000원’은 아래 ‘다시 묻는 문장’).",
    facts: [
      { text: "월급 320만원", type: "income" }, { text: "상여금 100만원", type: "income" }, { text: "용돈 10만원 받음", type: "income", memo: "용돈" },
      { text: "중고거래 판매 3만원", type: "income" }, { text: "당근 판매 2만원", type: "income" }, { text: "이자 1200원", type: "income" },
      { text: "캐시백 3000원", type: "income" }, { text: "환급 5만원", type: "income" }, { text: "환불 2만원", type: "income" },
      { text: "월급 250만원 들어옴", type: "income", memo: "월급" }, { text: "아이 용돈 3만원", type: "expense" }, { text: "대출 이자 30만원", type: "expense" },
      { text: "수입 결제 취소 36000원", type: "income" }, { text: "결제 취소 15000원", asks: true },
    ],
    sentences: ["월급 320만원", "월급 250만원 들어옴", "상여금 100만원", "용돈 10만원 받음", "부업 수입 40만원", "중고거래 판매 3만원", "당근 판매 2만원", "이자 1200원", "캐시백 3000원", "환급 5만원", "환불 2만원", "수입 15만원", "수입 결제 취소 36000원"] },
  { key: "memo", title: "메모가 남는 문장",
    note: "이 갈래의 문장은 금액과 결제수단을 뺀 나머지 말이 그대로 메모로 남습니다. ‘3만원’·‘수입 15만원’처럼 남는 말이 없으면 분류 이름(‘기타지출’·‘기타수입’)이 메모가 됩니다. 누구에게, 어디에 쓴 돈인지 함께 적어 두면 나중에 찾기 쉽습니다. 분류도 문장 속 낱말로 정해서 ‘엄마 생일 케이크 35000원’은 카페/간식으로 저장됩니다.",
    facts: [
      { text: "엄마 생일 케이크 35000원", memo: "엄마 생일 케이크", category: "카페/간식" }, { text: "아이 태권도 학원비 15만원", memo: "아이 태권도 학원비" },
      { text: "회사 동료 결혼 축의금 10만원", memo: "회사 동료 결혼 축의금" }, { text: "주말 캠핑 장보기 8만원", memo: "주말 캠핑 장보기" },
      { text: "강아지 사료 4만5천원", memo: "강아지 사료" }, { text: "302호 관리비 230000원", memo: "302호 관리비" },
      { text: "넷플릭스 구독 13500원 현대카드", memo: "넷플릭스 구독", payment: "현대카드" }, { text: "3만원", memo: "기타지출" }, { text: "수입 15만원", memo: "기타수입" },
    ],
    sentences: ["엄마 생일 케이크 35000원", "아이 태권도 학원비 15만원", "회사 동료 결혼 축의금 10만원", "주말 캠핑 장보기 8만원", "강아지 사료 4만5천원", "302호 관리비 230000원", "넷플릭스 구독 13500원 현대카드"] },
  { key: "multi", title: "한 번에 여러 건 보내기", multi: true,
    note: "줄을 바꾸거나 쉼표로 나누면 한 메시지로 여러 건을 저장합니다. ‘점심 12000원 커피 4500원 택시 7천원’처럼 한 줄에 ‘내용 금액’을 이어 써도 나눠 읽습니다. 줄마다 ‘어제’·‘오늘’이나 ‘11/3’·‘11/5’처럼 달과 날을 적으면 줄마다 그날로 저장하고, ‘3일 커피 4000 ⏎ 5일 택시 8000’처럼 줄마다 날만 적은 여러 줄은 저장하지 않고 다시 묻습니다(아래 ‘다시 묻는 문장’). 표의 ⏎ 는 줄바꿈이고, 저장된 기록 칸의 / 는 기록 사이의 구분입니다.",
    facts: [
      { text: "점심 12000원\n커피 4500원", records: 2 }, { text: "택시 14500원, 커피 4500원", records: 2 }, { text: "점심 12000원 커피 4500원 택시 7천원", records: 3 },
      { text: "어제 점심 12000원\n오늘 커피 4500원", dates: ["2026-11-19", "2026-11-20"] }, { text: "11/3 커피 4000원\n11/5 택시 8000원", dates: ["2026-11-03", "2026-11-05"] },
      { text: "3일 커피 4000\n5일 택시 8000", asks: true },
    ],
    sentences: ["점심 12000원\n커피 4500원", "택시 14500원, 커피 4500원", "점심 12000원 커피 4500원 택시 7천원", "어제 점심 12000원\n오늘 커피 4500원", "11/3 커피 4000원\n11/5 택시 8000원", "마트 3만원\n주유 5만원\n약국 8천원"] },
  { key: "room", title: "단톡방에서 자주 쓰는 기록",
    note: "단톡방에서는 ‘@말해가계부 회비 3만원’처럼 봇을 불러 같은 문장을 보내면 그 방의 가계부에 표의 값 그대로 저장됩니다. 이 쪽의 모든 문장은 1:1 채팅과 단톡방에서 같은 값으로 저장된 것만 실었습니다.",
    facts: [{ text: "회비 3만원", amount: 30000, memo: "회비" }, { text: "공동 장보기 8만7천원", amount: 87000, memo: "공동 장보기" }],
    sentences: ["회비 3만원", "모임 저녁 12만원", "노래방 4만원", "카페 2차 21000원", "택시 18000원", "공동 장보기 8만7천원", "숙소 예약 24만원", "펜션 바베큐 장보기 6만원"] },
  { key: "sms", title: "카드 승인 문자를 붙여 넣기",
    note: "카드사 승인 문자를 그대로 붙여 넣으면 문자에 적힌 금액·날짜·가맹점과 카드사를 읽어 저장합니다. 가맹점은 메모로, 카드사는 결제수단으로 들어가고, ‘누적532,000원’ 같은 누적 금액 줄은 금액으로 읽지 않습니다. 아래 문자는 설명을 위해 만든 것이고, 표의 ⏎ 는 줄바꿈입니다.",
    facts: [
      { text: KAKAO_SENTENCE_SMS_V229145[0], amount: 45000, date: "2026-11-19", memo: "교촌치킨", payment: "삼성카드" },
      { text: KAKAO_SENTENCE_SMS_V229145[1], amount: 12000, date: "2026-11-20", memo: "스타벅스", payment: "신한카드" },
    ],
    sentences: [...KAKAO_SENTENCE_SMS_V229145] },
  { key: "ask", title: "다시 묻는 문장", reply: true,
    note: "표의 문장은 저장하지 않고 다시 묻습니다. 금액이 없거나(‘커피’) 읽기 어려운 금액(‘택시 1,5000원’·‘점심 -12000원’), 단위 없는 한 자리 숫자(‘택시 7’), 달력에 없는 날짜(‘2월 30일’·‘13월 5일’), 이번 달에 아직 오지 않은 날(‘25일’), 줄마다 날만 적은 여러 줄, 앞에 ‘수입’이 없는 결제 취소입니다. 오른쪽 칸은 1:1 채팅에서 봇이 보내는 답의 첫 줄이고, 단톡방 답의 첫 줄도 예시 앞의 ‘@말해가계부’ 말고는 같습니다.",
    facts: [
      { text: "커피", asks: true }, { text: "택시 1,5000원", asks: true }, { text: "점심 -12000원", asks: true }, { text: "택시 7", asks: true },
      { text: "2월 30일 점심 12000원", asks: true }, { text: "13월 5일 저녁 3만원", asks: true }, { text: "25일 저녁 25000원", asks: true },
      { text: "3일 커피 4000\n5일 택시 8000", asks: true }, { text: "결제 취소 15000원", asks: true },
    ],
    sentences: ["커피", "택시 7", "택시 1,5000원", "점심 -12000원", "2월 30일 점심 12000원", "13월 5일 저녁 3만원", "25일 저녁 25000원", "3일 커피 4000\n5일 택시 8000", "결제 취소 15000원"] },
  { key: "other", title: "기록 대신 다른 일을 하는 말", reply: true,
    note: "‘식비 예산 50만원’은 기록이 아니라 이번 달 식비 예산을 정하고, ‘예산’만 보내면 새로 정할지 지금 예산을 볼지 묻습니다. ‘이번 달 얼마 썼어’·‘오늘 기록’처럼 물으면 저장하지 않고 요약을 보여 줍니다. 오른쪽 칸은 봇이 보내는 답의 첫 줄입니다.",
    facts: [
      { text: "식비 예산 50만원", reply: "✅ 2026-11 식비 예산을 설정했어요." }, { text: "예산", reply: "예산을 새로 설정할까요, 현재 예산을 확인할까요?" },
      { text: "이번 달 얼마 썼어", asks: true }, { text: "오늘 기록", asks: true },
    ],
    sentences: ["식비 예산 50만원", "예산", "이번 달 얼마 썼어", "오늘 기록"] },
]);
const KAKAO_SENTENCE_RECORD_HEADERS_V229145 = Object.freeze(["보낸 문장", "구분", "금액", "분류", "결제수단", "메모", "날짜"]);
const KAKAO_SENTENCE_WEEKDAYS_V229145 = "일월화수목금토";

function kakaoSentenceShownTextV229145(text) {
  return String(text).split("\n").join(" ⏎ ");
}
function kakaoSentenceDateLabelV229145(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const weekday = KAKAO_SENTENCE_WEEKDAYS_V229145[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${weekday})`;
}
function kakaoSentenceResultV229145(text) {
  return Object.hasOwn(KAKAO_SENTENCE_RESULTS_V229145, text) ? KAKAO_SENTENCE_RESULTS_V229145[text] : null;
}
// 표에 싣는 문장 = 결과가 갈래의 모양(답 갈래는 첫 답, 여러 건 갈래는 저장 한 건 이상, 나머지는 저장 꼭 한 건)과 맞는 문장.
// 결과 파일과 갈래 목록이 어긋나도 이 쪽은 그 문장만 빼고 그린다 — publicGuidePages 가 모든 공개 쪽의 내용을 한꺼번에 만들므로
// 여기서 예외를 던지면 첫 화면·/faq 까지 500 이 된다. 어긋남은 validate-v229145-kakao-sentences 가 결과 파일의 문장 = 갈래의 문장으로 잡는다.
function kakaoSentenceShownV229145(group) {
  return group.sentences.filter((text) => {
    const result = kakaoSentenceResultV229145(text);
    if (!result) return false;
    if (group.reply) return typeof result.reply === "string" && result.reply.length > 0;
    return Array.isArray(result.saved) && (group.multi ? result.saved.length >= 1 : result.saved.length === 1);
  });
}
// saved 의 한 건 = [구분(expense|income), 금액, 분류, 결제수단, 메모, 날짜(YYYY-MM-DD)]
function kakaoSentenceRecordCellsV229145([type, amount, category, payment, memo, date]) {
  return [type === "income" ? "수입" : "지출", `${Number(amount).toLocaleString("ko-KR")}원`, category || "-", payment || "-", memo || "-", kakaoSentenceDateLabelV229145(date)];
}
function kakaoSentenceTableV229145(group) {
  if (group.reply) {
    return { caption: `${group.title}: 보낸 문장과 봇의 첫 답`, headers: ["보낸 문장", "봇의 첫 답"],
      rows: kakaoSentenceShownV229145(group).map((text) => [kakaoSentenceShownTextV229145(text), kakaoSentenceResultV229145(text).reply]) };
  }
  if (group.multi) {
    return { caption: `${group.title}: 보낸 메시지와 저장된 기록`, headers: ["보낸 메시지", "저장된 기록"],
      rows: kakaoSentenceShownV229145(group).map((text) => [kakaoSentenceShownTextV229145(text), kakaoSentenceResultV229145(text).saved.map((record, index) => {
        const [kind, won, category, payment, memo, date] = kakaoSentenceRecordCellsV229145(record);
        return `${index + 1}) ${kind} ${won} · ${category} · ${payment === "-" ? "" : `${payment} · `}${memo} · ${date}`;
      }).join(" / ")]) };
  }
  return { caption: `${group.title}: 보낸 문장과 저장된 값`, headers: KAKAO_SENTENCE_RECORD_HEADERS_V229145,
    rows: kakaoSentenceShownV229145(group).map((text) => [kakaoSentenceShownTextV229145(text), ...kakaoSentenceRecordCellsV229145(kakaoSentenceResultV229145(text).saved[0])]) };
}
// 갈래마다 [실린 문장, 표]를 한 번만 만든다 — publicGuidePages 가 공개 쪽을 그릴 때마다 모든 쪽의 내용을 만들므로 다른 쪽을 그릴 때도 이 표가 다시 만들어졌다
// (공개 화면마다 약 0.3 ms). 결과 파일은 고정값이라 다시 써도 같다. 쪽마다 새 절·표 객체를 돌려주고 행 배열만 같이 쓴다(그리는 쪽은 행을 읽기만 한다).
let kakaoSentenceTablesCacheV229145 = null;
function kakaoSentenceTablesV229145() {
  if (!kakaoSentenceTablesCacheV229145) {
    kakaoSentenceTablesCacheV229145 = KAKAO_SENTENCE_GROUPS_V229145.map((group) => ({ group, shown: kakaoSentenceShownV229145(group).length, table: kakaoSentenceTableV229145(group) }));
  }
  return kakaoSentenceTablesCacheV229145;
}
function kakaoSentenceCountV229145() {
  return kakaoSentenceTablesV229145().reduce((sum, entry) => sum + entry.shown, 0);
}
function kakaoSentenceSectionsV229145() {
  const count = kakaoSentenceCountV229145();
  const head = { title: "이 표를 만든 방법", paragraphs: [
    `아래 ${count}개 문장의 결과는 예상해서 적은 값이 아닙니다. 말해가계부 카카오톡 봇과 같은 코드에 문장을 하나씩 보내, 실제로 저장된 값과 봇의 답을 옮겼습니다. 같은 문장을 1:1 채팅과 단톡방에 따로 보내 두 결과가 같은 문장만 실었습니다.`,
    `‘어제’처럼 날을 가리키는 말은 ${KAKAO_SENTENCE_REFERENCE_V229145.label}에 보냈다고 보고 계산했습니다. 표의 값과 설명 속 예의 결과는 서비스의 자동 검사가 같은 코드에 문장을 다시 보내 대조합니다.`,
    "표의 문장은 설명용입니다. 채팅에 그대로 보내면 실제로 기록되거나 예산이 바뀝니다. 잘못 저장했다면 카카오톡의 수정·삭제 명령이나 웹 가계부에서 고칠 수 있습니다(방법은 ‘카카오톡 가계부 입력 방법’ 안내).",
  ] };
  return [head, ...kakaoSentenceTablesV229145().filter((entry) => entry.shown > 0).map(({ group, table }) => ({ title: group.title, paragraphs: [group.note], table: { caption: table.caption, headers: table.headers, rows: table.rows } }))];
}
// @build:exports-start
export { kakaoSentenceCountV229145, kakaoSentenceSectionsV229145 };
// @build:exports-end
