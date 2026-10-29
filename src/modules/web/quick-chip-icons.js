// @build:imports-start
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

// V22.9.85 (디자인 작업 지시서 T-09): 카테고리 판정의 정본. 지시서 §3-3 표를 categoryKeyRules() 하나에 둔다(판정 단어는 옛
// QUICK_CHIP_ICON_RULES 와 옛 categoryInitial() 의 단어를 합친 것). 서버(칩 이모지·칩 CSS)는 categoryKey() 를 부르고, 브라우저는 V5 자산
// (accountbookV5BundleJsAsset)이 .toString() 으로 같은 본문을 받는다(client/shared-input-nlu.js 와 같은 방식). 그래서 두 함수 안에서는
// 서로 말고 바깥 이름을 부르지 않고, 설명은 함수 밖인 여기에 둔다(함수 안 글자는 브라우저 바이트가 된다).
// - 표는 위에서 아래로 우선순위가 높아진다(뒤 규칙이 이긴다). 수입 거래(type "income")는 무조건 income, 어느 단어에도 안 맞으면 etc.
// - 사용자가 고른 분류 이름을 먼저 보고, 분류 이름이 어느 단어에도 안 맞을 때만 메모를 본다("식비" 로 고른 "카페 점심" 은 식비다).
// - 지출 거래(type "expense")는 수입 단어(월급·입금 …)로 income 이 되지 않는다. 종류를 모르는 칩(type "")에는 수입 단어도 쓴다.
// - 글자는 NFKC 로 맞춘다(풀어 쓴 한글 자모가 들어와도 같은 결과).
// - icon 은 Lucide 이름이다. tools/build-icons.mjs 의 CATEGORY_ICONS 와 같아야 한다(validate-design-uplift-v22985 가 맞춰 본다).
// - except 는 그 규칙의 단어를 찾기 전에 글에서 지우는 낱말이다. 지시서 표의 의료 단어 ‘약’ 하나가 ‘예약·약속·절약·계약’에도 맞아
//   ‘월세 계약금’이 의료(주거보다 아래 행)가 됐다. 옛 칩 표(V22.9.84)는 ‘약국’만 썼다. ‘감기약·약값·한약’은 그대로 의료다.
// 옛 categoryInitial() 은 이 표와 다른 정규식 표로 한 글자를 골랐다. 유일한 호출처(홈 타임라인)가 쓰이지 않는 죽은 코드여서 함께 지웠다.
function categoryKeyRules() {
  return [
    { key: "gift", label: "경조사·선물", icon: "gift", words: ["경조사", "축의금", "부의금", "선물", "생일"] },
    { key: "goods", label: "생활용품", icon: "sparkles", words: ["생활용품", "다이소", "세제", "휴지", "청소"] },
    { key: "baby", label: "육아", icon: "baby", words: ["육아", "어린이", "유아", "아기", "키즈", "장난감"] },
    { key: "culture", label: "문화·여가", icon: "ticket", words: ["문화", "영화", "여행", "공연", "취미", "운동", "게임"] },
    { key: "sub", label: "구독", icon: "tv", words: ["구독", "넷플릭스", "유튜브", "멤버십", "티빙", "웨이브"] },
    { key: "utility", label: "공과금·세금", icon: "zap", words: ["공과금", "통신", "전기", "가스", "수도", "요금", "인터넷", "보험", "세금", "재산세", "자동차세"] },
    { key: "housing", label: "주거", icon: "house", words: ["주거", "월세", "전세", "관리비", "임대"] },
    { key: "shopping", label: "쇼핑", icon: "package", words: ["쿠팡", "쇼핑", "의류", "택배", "주문", "온라인"] },
    { key: "transport", label: "교통", icon: "bus", words: ["교통", "택시", "버스", "지하철", "기차", "주유", "주차", "차량"] },
    { key: "medical", label: "의료", icon: "heart-pulse", words: ["의료", "병원", "약국", "약", "진료", "치과"], except: ["예약", "약속", "절약", "계약", "약정", "요약", "공약", "서약", "규약", "협약", "약혼", "약간"] },
    { key: "food", label: "식비", icon: "utensils", words: ["식비", "점심", "저녁", "아침", "식사", "외식", "식당", "배달", "분식", "밥"] },
    { key: "grocery", label: "장보기", icon: "shopping-cart", words: ["마트", "장보기", "시장", "식자재"] },
    { key: "cafe", label: "카페/간식", icon: "coffee", words: ["커피", "카페", "간식", "디저트", "빵"] },
    { key: "income", label: "수입", icon: "banknote", words: ["월급", "급여", "상여", "수입", "입금"] },
    { key: "etc", label: "기타", icon: "circle-ellipsis", words: [] }
  ];
}

function categoryKey(category, type, memo) {
  if (type === "income") return "income";
  var rules = categoryKey.rules || (categoryKey.rules = categoryKeyRules());
  function pick(value) {
    var text = value == null ? "" : String(value);
    if (text && text.normalize) text = text.normalize("NFKC");
    if (!text) return "";
    for (var i = rules.length - 1; i >= 0; i -= 1) {
      if (type === "expense" && rules[i].key === "income") continue;
      var seen = text;
      for (var k = 0; rules[i].except && k < rules[i].except.length; k += 1) seen = seen.split(rules[i].except[k]).join(" ");
      for (var j = 0; j < rules[i].words.length; j += 1) {
        if (seen.indexOf(rules[i].words[j]) !== -1) return rules[i].key;
      }
    }
    return "";
  }
  return pick(category) || pick(memo) || "etc";
}

// V22.8.61: 빠른 입력 칩이 글자만 나열되어 무엇을 고르는지 한눈에 들어오지 않았다.
// 홈 HTML은 35KB·44KB 예산을 지켜야 하므로 칩마다 아이콘 마크업을 넣지 않고,
// 칩이 이미 들고 있는 data-cat·data-memo·data-pay-only 속성만으로 CSS에서 그린다.
// V22.9.85 T-09: 판정 단어는 categoryKeyRules() 하나에서 나온다. 여기에는 키마다 칩 이모지만 둔다(지금은 칩에서 숨긴 값 — 아래 V22.9.14).
const QUICK_CHIP_KEY_EMOJI = {
  gift: "🎁", goods: "🧻", baby: "🧸", culture: "🎬", sub: "📺", utility: "🧾", housing: "🏠",
  shopping: "📦", transport: "🚌", medical: "🏥", food: "🍚", grocery: "🛒", cafe: "☕", income: "💰",
};
const QUICK_CHIP_DEFAULT_ICON = "🏷️";

// 결제수단 칩도 같은 표를 쓰고 기본값만 카드로 둔다.
const QUICK_PAYMENT_ICON_RULES = [
  { icon: "🎟️", words: ["포인트", "마일리지", "상품권", "쿠폰"] },
  { icon: "🏦", words: ["계좌", "이체", "송금", "무통장"] },
  { icon: "📱", words: ["페이", "토스", "제로페이"] },
  { icon: "💵", words: ["현금"] },
];
const QUICK_PAYMENT_DEFAULT_ICON = "💳";

// 칩 하나의 이모지. 분류 이름을 먼저, 그다음 칩 라벨(메모)을 본다 — categoryKey 와 같은 판정이다.
function resolveQuickChipIcon(label = "", category = "") {
  return QUICK_CHIP_KEY_EMOJI[categoryKey(category, "", label)] || QUICK_CHIP_DEFAULT_ICON;
}

// 결제수단은 분류가 아니므로 자기 표를 쓴다. 우선순위가 높은 뒤쪽부터 확인한다.
function resolveQuickPaymentIcon(paymentMethod = "") {
  const text = normalizeText(paymentMethod || "");
  for (let index = QUICK_PAYMENT_ICON_RULES.length - 1; index >= 0; index -= 1) {
    if (QUICK_PAYMENT_ICON_RULES[index].words.some((word) => text.includes(word))) return QUICK_PAYMENT_ICON_RULES[index].icon;
  }
  return QUICK_PAYMENT_DEFAULT_ICON;
}

function quickChipIconCss() {
  // V22.9.85 T-09: 메모 규칙을 먼저, 분류 규칙을 뒤에 둔다. 같은 특이도에서는 뒤 규칙이 이기므로 분류 이름이 맞으면 메모보다 앞서고,
  // 한 속성 안에서는 표의 뒤쪽 규칙이 이긴다 — categoryKey 와 같은 판정이다.
  // except 낱말(예약·계약 …)을 품은 단어(약)에는 :not() 을 붙인다. ‘감기약 예약’처럼 둘 다 있는 글은 CSS 가 빼지만, 칩 아이콘은
  // 아래 :before{display:none} 으로 그리지 않으므로 화면에는 차이가 없다.
  const keyRules = categoryKeyRules().filter((rule) => rule.words.length && QUICK_CHIP_KEY_EMOJI[rule.key]);
  const rulesFor = (attr) => keyRules
    .map(({ key, words, except = [] }) => `${words.map((word) => `body.abV22812Shell .chipRow button[${attr}*="${word}"]${except.filter((other) => other.includes(word)).map((other) => `:not([${attr}*="${other}"])`).join("")}`).join(",")}{--ab-chip-icon:"${QUICK_CHIP_KEY_EMOJI[key]}"}`)
    .join("\n");
  const chipRules = `${rulesFor("data-memo")}\n${rulesFor("data-cat")}`;
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
export {
  categoryKey, categoryKeyRules, quickChipIconCss, resolveQuickChipIcon, resolveQuickPaymentIcon,
};
// @build:exports-end
