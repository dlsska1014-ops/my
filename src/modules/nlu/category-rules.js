// @build:imports-start
import { cleanInputMemo, inferInputCategory } from "../client/shared-input-nlu.js";
import { detectType, normalizeText } from "./amount-parser.js";
// @build:imports-end

const CATEGORY_RULES = [
  // 수입 5(+기타수입 폴백) — recommendCategory 에는 "용돈"이 없었다. 갈래가 나뉜 게 아니라
  // 그냥 빠진 것이라 되살린다.
  { name: "급여", type: "income", weight: 100, words: ["급여","월급","상여","상여금","보너스","성과급","수당","연봉","알바비","일당"] },
  { name: "용돈", type: "income", weight: 92, words: ["용돈","축하금","받은돈"] },
  { name: "환급", type: "income", weight: 90, words: ["환급","캐시백","환불","돌려받","돌려","정산받","반환"] },
  { name: "이자배당", type: "income", weight: 88, words: ["이자","배당","예금이자","주식배당"] },
  { name: "부업/매출", type: "income", weight: 70, words: ["부업","부수입","매출","판매","수익","원고료","강의료"] },

  // 지출 32 — 30개 체계 + DEFAULT_CATEGORIES 에 이미 있는데 규칙이 없어 손으로만
  // 넣을 수 있던 둘(저축/투자·대출/이자)을 채웠다. 없으면 "적금 50만"이 기타지출로 간다.
  //
  // 무게는 "겹칠 때 누가 이기는가"다. 좁은 분류가 넓은 분류보다 높다 —
  // "쿠팡이츠"는 쇼핑(쿠팡)이 아니라 배달이어야 하고, "자동차보험"은 차량관리가
  // 아니라 보험이어야 한다.
  //
  // V22.9.76 감사 A-10: except 는 그 규칙의 낱말을 덮으면 무효로 만드는 말이다(스마트폰의 "마트", 농협카드의 "농협").
  // 다른 규칙의 더 긴 낱말이 덮는 경우(수술의 "술")는 inferCategory 가 따로 거른다 — except 에 적지 않는다.
  // V22.9.80 T-16: 낱말 속 분류 낱말이 남아 가스레인지·전기밥솥이 공과금, 주식회사가 저축/투자, 시장조사가 장보기, 아이유가 육아/자녀,
  // 카페인이 카페/간식이었다. 물건·회사·사람 이름인 말을 except 에 더했다(같은 무리의 수도권·수도꼭지·부탄가스·아이언·카페트 등도 함께).
  // 전기밥솥은 공과금을 막고 나면 ‘밥’으로 외식이 되므로 밥솥도 막는다. 결제수단 말 ‘카페이’(카카오페이)도 카페/간식을 정하지 않는다
  // ("점심 9000 카페이"는 외식).
  // 진짜 낱말(가스비·전기요금·전기세·도시가스·주식·시장·전통시장·아이 장난감·카페)은 except 에 들지 않아 예전처럼 분류한다. 전기자동차는
  // 전기차와 같이 주유/충전의 낱말이다(더 긴 낱말이라 공과금의 ‘전기’를 덮는다).
  { name: "주거/월세", type: "expense", weight: 100, words: ["월세","전세","전월세","임대료","집세","주택","원룸","부동산"] },
  { name: "관리비", type: "expense", weight: 99, words: ["관리비","아파트관리"] },
  { name: "대출/이자", type: "expense", weight: 98, words: ["대출","대출이자","원리금","상환","할부이자"] },
  { name: "저축/투자", type: "expense", weight: 97, words: ["저축","적금","예금","투자","주식","펀드","연금","청약"], except: ["주식회사"] },
  { name: "공과금", type: "expense", weight: 96, words: ["공과금","전기","전기세","가스","가스비","수도","수도세","도시가스"], except: ["가스레인지","가스렌지","가스버너","가스라이터","부탄가스","전기밥솥","전기장판","전기포트","전기레인지","전기매트","전기히터","전기난로","전기면도기","전기자전거","전기주전자","전기담요","전기그릴","전기오븐","전기톱","전기드릴","전기용품","전기제품","수도권","수도꼭지"] },
  { name: "통신비", type: "expense", weight: 95, words: ["통신","통신비","핸드폰","휴대폰","휴대전화","인터넷","와이파이","알뜰폰","유플러스","lg유플러스"], exact: ["kt","skt"] },
  { name: "보험", type: "expense", weight: 94, words: ["보험","보험료","실비","암보험","화재보험","자동차보험"] },
  { name: "약국", type: "expense", weight: 92, words: ["약국","약값","의약품","처방","영양제"] },
  { name: "의료/병원", type: "expense", weight: 90, words: ["병원","의원","치과","안과","내과","피부과","한의원","소아과","진료","검진","의료","렌즈","콘택트","수술"] },
  { name: "차량관리", type: "expense", weight: 89, words: ["세차","정비","엔진오일","타이어","주차","주차비","하이패스","톨비","카센터","대리운전"] },
  { name: "주유/충전", type: "expense", weight: 88, words: ["주유","휘발유","경유","기름","충전소","전기차충전","전기차","전기자동차"], exact: ["ev"] },
  { name: "택시", type: "expense", weight: 87, words: ["택시","카카오t","타다"] },
  { name: "교통", type: "expense", weight: 86, words: ["교통","버스","지하철","기차","ktx","srt","티머니","캐시비"] },
  { name: "구독", type: "expense", weight: 85, words: ["구독","넷플릭스","유튜브","유튜브고급","멤버십","멜론","디즈니","쿠팡와우","스포티파이","왓챠","티빙","웨이브","애플뮤직","클라우드"] },
  { name: "배달", type: "expense", weight: 84, words: ["배달","배민","요기요","쿠팡이츠"] },
  { name: "편의점", type: "expense", weight: 83, words: ["편의점","gs25","세븐일레븐","이마트24"], exact: ["cu"] },
  { name: "장보기", type: "expense", weight: 82, words: ["마트","이마트","홈플러스","롯데마트","코스트코","트레이더스","시장","농협","장보기","슈퍼","마켓","식료품","식자재","식재료","쌀","시리얼","반찬","김자반"], except: ["스마트","농협카드","농협체크","농협은행","농협계좌","농협통장","농협페이","시장조사"] },
  { name: "카페/간식", type: "expense", weight: 80, words: ["커피","카페","스타벅스","스벅","이디야","투썸","메가커피","컴포즈","빽다방","간식","빵","디저트","베이커리","과자","아이스크림","마시멜로우","초콜릿","젤리","아메리카노","라떼"], except: ["카페인","카페트","카페이"] },
  { name: "외식", type: "expense", weight: 78, words: ["외식","식당","점심","저녁","아침","밥","식사","김밥","라면","치킨","피자","햄버거","버거","맥도날드","국밥","분식","고기","회식","음식","술","맥주","소주","와인","쌀국수"], except: ["기술","예술","마술","무술","학술","술래","밥솥"] },
  { name: "육아/자녀", type: "expense", weight: 76, words: ["육아","어린이집","유치원","기저귀","분유","장난감","아이","키즈","학습지","어린이","아동","유아","아기","이유식"], except: ["아이패드","아이폰","아이맥","아이템","아이디","아이돌","아이스","아이섀도","아이라이너","아이크림","아이브로우","아이코스","아이허브","아이유","아이언","아이마스크","아이라인"] },
  { name: "교육/학습", type: "expense", weight: 75, words: ["교육","학원","수업","수강","강의","교재","학교","인강","문제집","자격증","등록금","공부"] },
  { name: "도서", type: "expense", weight: 74, words: ["책","도서","서점","교보","알라딘","예스24","서적"], except: ["책상"] },
  { name: "생활용품", type: "expense", weight: 72, words: ["생활용품","다이소","문구","세제","휴지","샴푸","풋샴푸","린스","비누","치약","칫솔","청소","주방","소모품","건전지","수납","온열안대","안대","식기"], except: ["청소년"] },
  { name: "의류/잡화", type: "expense", weight: 71, words: ["옷","의류","신발","가방","잡화","패션"] },
  { name: "미용", type: "expense", weight: 70, words: ["미용","미용실","헤어","커트","염색","네일","피부관리","마사지","화장품","올리브영"] },
  { name: "쇼핑", type: "expense", weight: 68, words: ["쇼핑","쿠팡","네이버쇼핑","11번가","g마켓","옥션","무신사","구매","샀","주문","택배"] },
  { name: "운동", type: "expense", weight: 66, words: ["헬스","운동","필라테스","요가","골프","수영"] },
  { name: "여행", type: "expense", weight: 65, words: ["여행","호텔","숙박","항공","리조트","펜션","캠핑"] },
  { name: "문화/여가", type: "expense", weight: 64, words: ["영화","공연","전시","게임","노래방","취미","놀이","콘서트","미술"], except: ["에이전시"] },
  { name: "경조사/선물", type: "expense", weight: 63, words: ["축의금","부의금","조의금","경조사","선물","생일","명절","용돈드림","화환"] },
  { name: "반려동물", type: "expense", weight: 62, words: ["강아지","고양이","반려","사료","동물병원","애견","애묘","배변패드","펫"], except: ["카펫"] },
  { name: "세금/수수료", type: "expense", weight: 58, words: ["세금","자동차세","재산세","종부세","부가세","수수료","과태료","벌금"] },
];

// 개편 전 규칙이 만들던 넓은 이름들. 이미 저장된 기록에 남아 있으므로 화면에서
// 사라지면 안 되고, 새로 만들어지지도 않아야 한다. 어느 갈래로 나뉘었는지 적어 둔다.
const LEGACY_CATEGORY_SPLITS = Object.freeze({
  "식비": ["외식", "배달", "편의점"],
  "교통/차량": ["교통", "택시", "주유/충전", "차량관리"],
  "주거/관리": ["주거/월세", "관리비"],
  "공과금/통신": ["공과금", "통신비"],
  "의료/건강": ["의료/병원", "약국"],
});

// V22.9.6: 같은 질문에 같은 답을 하게 만드는 정본.
//
// 이 앱은 "무엇으로 분류할까"와 "수입인가 지출인가"를 **세 곳에서 따로** 판단하고
// 있었다. 세 곳의 규칙이 서로 달랐다는 것을 세어서 확인했다:
//
//   서버 CATEGORY_RULES        분류 23개 · 키워드 280개   ← 가장 많이 자란 쪽
//   홈 인라인 quickRules       분류 15개 · 키워드 141개
//   mobileUiUxClientMain       분류 11개 · 키워드  79개
//
// 그래서 "한의원 30000" 을 카카오톡으로 보내면 의료/건강, 홈 빠른입력에 치면
// 기타지출이었다. 같은 앱이 같은 문장에 다른 답을 했다. 홈에만 있던 "부수입" 은
// 서버가 모르는 분류라 저장하면 이름이 그대로 굳었다.
//
// 규칙을 늘린 사람이 잘못한 게 아니다 — 늘릴 곳이 셋인 구조가 문제였다. 정본을
// 하나 두고 클라이언트는 그것을 **읽기만** 한다. 아래 자산이 그 전달 통로다.
const AB_TYPE_HINTS = Object.freeze({
  income: "수입|입금|급여|월급|상여|보너스|용돈\\s*받|받았|환급\\s*받|환불(?!\\s*수수료)|이자|배당|매출|정산\\s*받|돌려받|들어왔|들어옴|입금됨",
  expense: "지출|사용|결제|구매|썼|썻|샀|냈|납부|출금|자동이체|송금|카드|현금|삼성페이|카카오페이|토스|계좌이체|빠져나감|빠져나갔|나감",
  incomeCategory: "급여|월급|상여|보너스|수당|용돈|환급|캐시백|이자|배당|정산금|부업|알바비|매출",
});

// 1년 캐시되는 불변 자산. 홈 HTML 안에 규칙을 인라인으로 싣던 2,248 B 가 여기로
// 옮겨오고, 규칙이 자라도 홈 HTML 은 더 이상 무거워지지 않는다.
const AB_CATEGORY_RULES_ASSET_PATH = "/assets/ab-category-rules-v22976.js";
const AB_CATEGORY_RULES_SCRIPT_TAG = `<script src="${AB_CATEGORY_RULES_ASSET_PATH}"></script>`;
function abCategoryRulesJsAsset() {
  return `window.AB_CATEGORY_RULES=${JSON.stringify(CATEGORY_RULES)};window.AB_TYPE_HINTS=${JSON.stringify(AB_TYPE_HINTS)};`;
}

function normalizeCategoryName(value, type) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const inferred = inferCategory(raw, type || detectType(raw));
  if (!/^기타/.test(inferred)) return inferred;
  return raw.slice(0, 40);
}

// V22.9.79: 분류 판정의 본문은 화면 빠른 입력과 함께 쓰는 공유 함수(client/shared-input-nlu.js inferInputCategory)로 옮겼다(V44 A-10).
// 영문 키워드(cu·gs25·ktx·srt·ev·kt·skt)는 사람이 대문자로도 쓰므로 들어온 글도 소문자로 낮춰 비교한다 — 한글은 영향이 없다.
function inferCategory(text, type) {
  return inferInputCategory(normalizeText(text).toLowerCase(), type, CATEGORY_RULES);
}

// V22.9.79: 메모 다듬기의 본문은 화면 빠른 입력과 함께 쓰는 공유 함수(client/shared-input-nlu.js cleanInputMemo)로 옮겼다(V77 N-11·N-13).
function cleanMemo(raw, amountRaw, type, paymentMethod, category) {
  return cleanInputMemo(raw, amountRaw, type, paymentMethod, category);
}
// @build:exports-start
export {
  AB_CATEGORY_RULES_ASSET_PATH, AB_CATEGORY_RULES_SCRIPT_TAG, CATEGORY_RULES,
  LEGACY_CATEGORY_SPLITS, abCategoryRulesJsAsset, cleanMemo, inferCategory, normalizeCategoryName,
};
// @build:exports-end
