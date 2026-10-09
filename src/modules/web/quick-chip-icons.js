// @build:imports-start
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

// 이름이 "Emoji" 지만 돌려주는 것은 **한글 한 글자**다. 그 이름 때문에 홈 카테고리
// 비율 목록이 이 값을 아이콘인 줄 알고 이름 앞에 그대로 붙였고, 화면에는
// "식 식비" · "기 기타" · "기 카드값" 이 찍혔다. 마지막 것은 중복을 넘어 거짓이다
// (카드값은 어느 규칙에도 안 걸려 "기타"의 기 가 붙었다).
// 글자 자체는 잘못이 없다 — 동그란 배지 안에서는 이니셜로 잘 읽힌다. 잘못은 이름이
// 쓰임을 오해하게 만든 것이라, 쓰임을 그대로 말하는 이름으로 바꾼다.
function categoryInitial(category = "", type = "expense") {
  if (type === "income") return "수";
  const c = normalizeText(category || "");
  if (/식비|밥|점심|저녁|마트|장보기/.test(c)) return "식";
  if (/커피|카페|간식|디저트/.test(c)) return "카";
  if (/교통|택시|버스|지하철|주유|차량/.test(c)) return "교";
  if (/문화|영화|공연|취미/.test(c)) return "문";
  if (/보험|세금|재산세|자동차세/.test(c)) return "보";
  if (/쇼핑|쿠팡|온라인/.test(c)) return "쇼";
  if (/의료|병원|약/.test(c)) return "의";
  return "기";
}

// V22.8.61: 빠른 입력 칩이 글자만 나열되어 무엇을 고르는지 한눈에 들어오지 않았다.
// 홈 HTML은 35KB·44KB 예산을 지켜야 하므로 칩마다 아이콘 마크업을 넣지 않고,
// 칩이 이미 들고 있는 data-cat·data-memo·data-pay-only 속성만으로 CSS에서 그린다.
// 목록은 "우선순위 낮음 → 높음" 순서이며, CSS는 같은 특이도라 뒤 규칙이 이긴다.
const QUICK_CHIP_ICON_RULES = [
  { icon: "🎁", words: ["경조사", "축의금", "부의금", "선물", "생일"] },
  { icon: "🧻", words: ["생활용품", "다이소", "세제", "휴지", "청소"] },
  { icon: "🧸", words: ["육아", "어린이", "유아", "아기", "키즈", "장난감"] },
  { icon: "🎬", words: ["문화", "영화", "여행", "공연", "취미", "운동", "게임"] },
  { icon: "📺", words: ["구독", "넷플릭스", "유튜브", "멤버십", "티빙", "웨이브"] },
  { icon: "🧾", words: ["공과금", "통신", "전기", "가스", "수도", "요금", "인터넷"] },
  { icon: "🏠", words: ["주거", "월세", "전세", "관리비", "임대"] },
  { icon: "📦", words: ["쿠팡", "쇼핑", "의류", "택배", "주문"] },
  { icon: "🚌", words: ["교통", "택시", "버스", "지하철", "기차", "주유", "주차", "차량"] },
  { icon: "🏥", words: ["의료", "병원", "약국", "진료", "치과"] },
  { icon: "🍚", words: ["식비", "점심", "저녁", "아침", "식사", "외식", "식당", "배달", "분식"] },
  { icon: "🛒", words: ["마트", "장보기", "시장", "식자재"] },
  { icon: "☕", words: ["커피", "카페", "간식", "디저트", "빵"] },
  { icon: "💰", words: ["월급", "급여", "상여", "수입", "입금"] },
];
const QUICK_CHIP_DEFAULT_ICON = "🏷️";

// 결제수단 칩도 같은 표를 쓰고 기본값만 카드로 둔다.
const QUICK_PAYMENT_ICON_RULES = [
  { icon: "🎟️", words: ["포인트", "마일리지", "상품권", "쿠폰"] },
  { icon: "🏦", words: ["계좌", "이체", "송금", "무통장"] },
  { icon: "📱", words: ["페이", "토스", "제로페이"] },
  { icon: "💵", words: ["현금"] },
];
const QUICK_PAYMENT_DEFAULT_ICON = "💳";

// CSS와 같은 표를 쓰되 여기서는 우선순위가 높은 뒤쪽부터 확인한다.
function resolveQuickChipIcon(label = "", category = "", rules = QUICK_CHIP_ICON_RULES, fallback = QUICK_CHIP_DEFAULT_ICON) {
  const text = normalizeText(`${category || ""} ${label || ""}`);
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    if (rules[index].words.some((word) => text.includes(word))) return rules[index].icon;
  }
  return fallback;
}

function resolveQuickPaymentIcon(paymentMethod = "") {
  return resolveQuickChipIcon("", paymentMethod, QUICK_PAYMENT_ICON_RULES, QUICK_PAYMENT_DEFAULT_ICON);
}

function quickChipIconCss() {
  const chipRules = QUICK_CHIP_ICON_RULES
    .map(({ icon, words }) => `${words.map((word) => `body.abV22812Shell .chipRow button[data-cat*="${word}"],body.abV22812Shell .chipRow button[data-memo*="${word}"]`).join(",")}{--ab-chip-icon:"${icon}"}`)
    .join("\n");
  const paymentRules = QUICK_PAYMENT_ICON_RULES
    .map(({ icon, words }) => `${words.map((word) => `body.abV22812Shell .chipRow button[data-pay-only*="${word}"]`).join(",")}{--ab-chip-icon:"${icon}"}`)
    .join("\n");
  return [
    `body.abV22812Shell .chipRow button{display:inline-flex;align-items:center;gap:5px}`,
    // 이모지는 같은 font-size 라도 글자보다 크게 그려진다. 14px 로 두니 칩 글자(13px)
    // 보다 아이콘이 커 보여서 칩이 아이콘 덩어리처럼 읽혔다. 글자에 딸린 표식으로
    // 물러나도록 크기를 낮추고 살짝 흐리게 한다.
    // V22.9.14: 이모지를 뺀다.
    //
    // 칩 하나에 아이콘·라벨·횟수 셋이 46px 알약 안에서 경쟁하고 있었다. 이모지는
    // 11px·opacity .75 까지 줄였는데도(V22.9.0) 컬러 글리프라 진한 면 위에서 여전히
    // 가장 먼저 눈에 들어왔다 — 크기를 더 줄이면 읽을 수 없는 점이 될 뿐이다.
    //
    // 칩이 하는 일은 "눌러서 내용 채우기"이고 그 정보는 라벨이 이미 다 말한다
    // (트레이더스·쿠팡·커피). 셋 중 정보가 없는 하나를 뺐다.
    // 되돌리려면 아래 한 줄의 display 를 지우면 --ab-chip-icon 값이 그대로 살아난다.
    `body.abV22812Shell .chipRow button:before{display:none}`,
    `body.abV22812Shell .chipRow button[data-pay-only]{--ab-chip-icon:"${QUICK_PAYMENT_DEFAULT_ICON}"}`,
    chipRules,
    paymentRules,
  ].join("\n");
}
// @build:exports-start
export { categoryInitial, quickChipIconCss, resolveQuickChipIcon, resolveQuickPaymentIcon };
// @build:exports-end
