// @build:imports-start
import { detectType, normalizeText } from "./amount-parser.js";
import { AB_PAYMENT_WORD_END } from "./date-payment.js";
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
  { name: "주거/월세", type: "expense", weight: 100, words: ["월세","전세","전월세","임대료","집세","주택","원룸","부동산"] },
  { name: "관리비", type: "expense", weight: 99, words: ["관리비","아파트관리"] },
  { name: "대출/이자", type: "expense", weight: 98, words: ["대출","대출이자","원리금","상환","할부이자"] },
  { name: "저축/투자", type: "expense", weight: 97, words: ["저축","적금","예금","투자","주식","펀드","연금","청약"] },
  { name: "공과금", type: "expense", weight: 96, words: ["공과금","전기","전기세","가스","가스비","수도","수도세","도시가스"] },
  { name: "통신비", type: "expense", weight: 95, words: ["통신","통신비","핸드폰","휴대폰","휴대전화","인터넷","와이파이","알뜰폰","유플러스","lg유플러스"], exact: ["kt","skt"] },
  { name: "보험", type: "expense", weight: 94, words: ["보험","보험료","실비","암보험","화재보험","자동차보험"] },
  { name: "약국", type: "expense", weight: 92, words: ["약국","약값","의약품","처방","영양제"] },
  { name: "의료/병원", type: "expense", weight: 90, words: ["병원","의원","치과","안과","내과","피부과","한의원","소아과","진료","검진","의료","렌즈","콘택트","수술"] },
  { name: "차량관리", type: "expense", weight: 89, words: ["세차","정비","엔진오일","타이어","주차","주차비","하이패스","톨비","카센터","대리운전"] },
  { name: "주유/충전", type: "expense", weight: 88, words: ["주유","휘발유","경유","기름","충전소","전기차충전","전기차"], exact: ["ev"] },
  { name: "택시", type: "expense", weight: 87, words: ["택시","카카오t","타다"] },
  { name: "교통", type: "expense", weight: 86, words: ["교통","버스","지하철","기차","ktx","srt","티머니","캐시비"] },
  { name: "구독", type: "expense", weight: 85, words: ["구독","넷플릭스","유튜브","유튜브고급","멤버십","멜론","디즈니","쿠팡와우","스포티파이","왓챠","티빙","웨이브","애플뮤직","클라우드"] },
  { name: "배달", type: "expense", weight: 84, words: ["배달","배민","요기요","쿠팡이츠"] },
  { name: "편의점", type: "expense", weight: 83, words: ["편의점","gs25","세븐일레븐","이마트24"], exact: ["cu"] },
  { name: "장보기", type: "expense", weight: 82, words: ["마트","이마트","홈플러스","롯데마트","코스트코","트레이더스","시장","농협","장보기","슈퍼","마켓","식료품","식자재","식재료","쌀","시리얼","반찬","김자반"], except: ["스마트","농협카드","농협체크","농협은행","농협계좌","농협통장","농협페이"] },
  { name: "카페/간식", type: "expense", weight: 80, words: ["커피","카페","스타벅스","스벅","이디야","투썸","메가커피","컴포즈","빽다방","간식","빵","디저트","베이커리","과자","아이스크림","마시멜로우","초콜릿","젤리","아메리카노","라떼"] },
  { name: "외식", type: "expense", weight: 78, words: ["외식","식당","점심","저녁","아침","밥","식사","김밥","라면","치킨","피자","햄버거","버거","맥도날드","국밥","분식","고기","회식","음식","술","맥주","소주","와인","쌀국수"], except: ["기술","예술","마술","무술","학술","술래"] },
  { name: "육아/자녀", type: "expense", weight: 76, words: ["육아","어린이집","유치원","기저귀","분유","장난감","아이","키즈","학습지","어린이","아동","유아","아기","이유식"], except: ["아이패드","아이폰","아이맥","아이템","아이디","아이돌","아이스","아이섀도","아이라이너","아이크림","아이브로우","아이코스","아이허브"] },
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

function inferCategory(text, type) {
  // 영문 키워드(cu·gs25·ktx·srt·ev·kt·skt)는 사람이 대문자로도 쓴다. 표의 낱말은
  // 소문자로 적어 두고 들어온 글도 소문자로 낮춰 비교한다 — 한글은 영향이 없다.
  const raw = normalizeText(text).toLowerCase();
  // V22.9.76 감사 A-10: 낱말 속 글자가 분류를 정하지 않게 한다. 걸린 낱말이 다른 규칙의 더 긴 낱말 안에 들어 있으면
  // 세지 않는다(동물병원 속 병원, 전기차 속 전기, 수술·미술 속 술, 이마트24 속 이마트). 규칙의 except 는 그 규칙의
  // 낱말을 덮으면 무효로 만드는 말이다(스마트폰의 마트, 농협카드의 농협, 아이패드의 아이). 같은 규칙 안에서 겹치는
  // 낱말(미용실·미용)과 서로 겹치지 않는 낱말은 예전처럼 무게를 더해 겨룬다("맥도날드 배달"은 배달). 한 낱말의 위치는
  // 앞에서 16곳까지만 본다. exact 낱말은 앞뒤가 글자·숫자가 아닐 때만 맞는다(큰 가져오기 칸에서도 낱말 배열을 만들지 않는다).
  const spans = [];
  const collect = (rule, word, exact) => {
    for (let at = raw.indexOf(word), seen = 0; at >= 0 && seen < 16; at = raw.indexOf(word, at + 1)) {
      const end = at + word.length;
      if (exact && !((at === 0 || !/[a-z0-9가-힣]/.test(raw[at - 1])) && (end === raw.length || !/[a-z0-9가-힣]/.test(raw[end])))) continue;
      spans.push({ start: at, end, rule, id: (exact ? "=" : "~") + word, gain: rule.weight + Math.min(word.length, 8), dead: false });
      seen += 1;
    }
  };
  for (const rule of CATEGORY_RULES) {
    if (rule.type !== type) continue;
    const first = spans.length;
    for (const word of rule.words) if (word) collect(rule, word, false);
    for (const word of rule.exact || []) if (word) collect(rule, word, true);
    if (spans.length === first) continue;
    for (const block of rule.except || []) {
      for (let at = block ? raw.indexOf(block) : -1, seen = 0; at >= 0 && seen < 16; at = raw.indexOf(block, at + 1), seen += 1) {
        for (let k = first; k < spans.length; k += 1) if (spans[k].start >= at && spans[k].end <= at + block.length) spans[k].dead = true;
      }
    }
  }
  if (spans.some((span) => span.rule !== spans[0].rule)) {
    // 시작 위치 순으로 훑으며, 앞선 위치들에서 가장 멀리 끝나는 낱말을 규칙이 다른 두 개까지 기억한다.
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    let reach = [];
    let group = [];
    const remember = (span) => {
      const same = reach.findIndex((item) => item.rule === span.rule);
      if (same < 0) reach.push(span); else if (span.end > reach[same].end) reach[same] = span;
      reach = reach.sort((a, b) => b.end - a.end).slice(0, 2);
    };
    for (const span of spans) {
      if (group.length && group[0].start !== span.start) { group.forEach(remember); group = []; }
      const outer = reach.find((item) => item.rule !== span.rule);
      if ((outer && outer.end >= span.end) || group.some((item) => item.rule !== span.rule && item.end > span.end)) span.dead = true;
      group.push(span);
    }
  }
  const scores = new Map();
  const counted = new Set();
  for (const span of spans) {
    if (span.dead || counted.has(span.rule.name + span.id)) continue;
    counted.add(span.rule.name + span.id);
    scores.set(span.rule, (scores.get(span.rule) || 0) + span.gain);
  }
  let best = null;
  for (const rule of CATEGORY_RULES) {
    const score = scores.get(rule) || 0;
    if (score > 0 && (!best || score > best.score)) best = { category: rule.name, score };
  }
  return best ? best.category : (type === "income" ? "기타수입" : "기타지출");
}

const CLEAN_MEMO_COMMAND_WORDS = ["수입", "입금", "지출", "출금", "사용", "결제", "구매", "납부", "정산", "기록", "가계부"];
const CLEAN_MEMO_FIXED_WORDS = [
  ...CLEAN_MEMO_COMMAND_WORDS,
  // V22.9.76 카카오 감사 17: "이자 받았어 3000원"의 메모가 "이자 어"였다. 긴 말끝부터 통째로 뺀다.
  "받았어요", "받았어", "받았음", "받았다", "들어왔어요", "들어왔어", "들어왔음", "들어왔다", "들어옴", "들어온", "입금됨", "받음", "받았",
  "오늘", "금일", "어젯밤", "엊저녁", "어제", "전날", "엊그저께", "엊그제", "그끄저께", "그끄제", "그저께", "그제", "내일",
];
// V22.9.77: 카드 이름 앞에 붙은 카드사 이름("KB국민카드"의 KB, "NH농협카드"의 NH, "IBK기업카드"의 IBK기업,
// "국민체크카드"의 국민)과 띄어 쓴 영문 카드사 이름("KB 국민카드"의 KB)도 결제수단의 일부라 함께 지운다. 예전에는
// "커피 4500 KB국민카드"의 메모가 "커피 KB"였다. 결제수단 낱말은 낱말 끝에서만 지운다(AB_PAYMENT_WORD_END).
// 예전에는 "토스트"가 "트", "현금영수증"이 "영수증"이 됐다.
const CLEAN_MEMO_CARD_NAME_PREFIX = "(?:(?<![A-Za-z가-힣])(?:(?:KB|NH|IBK|SC|BC|BNK|DGB|KDB|KEB)\\s+|[A-Za-z]{1,6}[가-힣]{0,4}|신한|현대|삼성|국민|우리|롯데|하나|농협|비씨|카카오|토스|기업|씨티|수협|신협|우체국|새마을|케이뱅크|카카오뱅크|토스뱅크))?";
// 카드사 이름이 붙은 카드와 온전한 간편결제 이름은 결제수단 찾기(date-payment.js)처럼 낱말 끝을 따지지 않고 지우고, 띄어
// 쓴 것("현대 카드", "삼성 페이")도 통째로 지운다. 예전에는 메모에 ‘현대’, ‘삼성 페이’가 남았다.
const CLEAN_MEMO_PAYMENT_ANYWHERE = /^(?:(?:신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오|토스)카드|삼성페이|카카오페이|네이버페이|애플페이|페이코|제로페이)$/i;
// V22.9.77 감사 E-1(남은 것): 메모 다듬기의 고정 낱말 정규식은 처음 부를 때 한 번만 만든다. 예전에는 부를 때마다 낱말 수
// (37개)만큼 RegExp 를 새로 만들어 자연어 가져오기 한 줄에 50개 남짓이 들었다. 낱말 순서와 하나씩 차례로 지우는 방식은
// 예전 그대로라 결과가 같다(전역 정규식은 replace 가 처음부터 다시 찾는다). 금액·결제수단처럼 문장마다 다른 말만 그때 만든다.
// date-payment.js 와 서로 가져오는 모듈이라, 그 모듈의 상수(AB_PAYMENT_WORD_END)를 쓰는 정규식은 처음 부를 때 만든다.
let CLEAN_MEMO_PATTERNS = null;
function cleanMemoPatterns() {
  if (CLEAN_MEMO_PATTERNS) return CLEAN_MEMO_PATTERNS;
  CLEAN_MEMO_PATTERNS = {
    fixed: CLEAN_MEMO_FIXED_WORDS.map((item) => new RegExp(CLEAN_MEMO_COMMAND_WORDS.includes(item) ? "(^|\\s)" + escapeRegExp(item) + "(?=\\s|\\d|$)" : escapeRegExp(item), "g")),
    cardName: new RegExp(`${CLEAN_MEMO_CARD_NAME_PREFIX}(?:신용카드|체크카드|카드)${AB_PAYMENT_WORD_END}`, "gi"),
    paymentWord: new RegExp(`(?:현금|삼성페이|삼페|카카오페이|카페이|네이버페이|네페|애플페이|페이코|제로페이|토스페이|토스뱅크|토스|계좌이체|자동이체|무통장|체크|신용)${AB_PAYMENT_WORD_END}`, "g"),
  };
  return CLEAN_MEMO_PATTERNS;
}

function cleanMemo(raw, amountRaw, type, paymentMethod, category) {
  let memo = normalizeText(raw);
  const patterns = cleanMemoPatterns();
  // 금액 → 고정 낱말(명령어·받은 말·날짜 말) → 결제수단 순서로 하나씩 지운다(예전 순서 그대로).
  if (amountRaw) memo = memo.replace(new RegExp(escapeRegExp(amountRaw), "g"), " ");
  for (const pattern of patterns.fixed) memo = memo.replace(pattern, " ");
  if (paymentMethod) {
    const token = escapeRegExp(paymentMethod);
    const prefix = /카드$/.test(paymentMethod) ? CLEAN_MEMO_CARD_NAME_PREFIX : "";
    memo = CLEAN_MEMO_COMMAND_WORDS.includes(paymentMethod)
      ? memo.replace(new RegExp("(^|\\s)" + token + "(?=\\s|\\d|$)", "g"), " ")
      : CLEAN_MEMO_PAYMENT_ANYWHERE.test(paymentMethod)
        ? memo.replace(new RegExp(prefix + token.replace(/(카드|페이)$/, "\\s*$1"), "gi"), " ")
        : memo.replace(new RegExp(prefix + token + AB_PAYMENT_WORD_END, "gi"), " ");
  }

  memo = memo
    .replace(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?/g, " ")
    // V22.9.77: 요일 앞의 ‘지난·저번·이번·다음’도 ‘주’ 없이 쓰면("지난 금요일") 함께 지운다. 예전에는 "지난 금요일 회식"의
    // 메모가 "지난 회식"이었다. 날짜는 예전과 같다(날짜는 요일로 정하고, 이 줄은 메모만 다듬는다).
    .replace(/(?:(?<![가-힣])(?:(?:지지난|저저번|지난|저번|이번|다음|오는|돌아오는)\s*주|전주|금주|내주|지지난|저저번|지난번|지난|저번|이번|다음|오는|돌아오는)\s*)?[월화수목금토일]요일/g, " ")
    .replace(/(?:지난|저번)\s*달\s*\d{1,2}일?/g, " ")
    .replace(/(?:이번\s*달|이달)\s*\d{1,2}일?/g, " ")
    .replace(/(?:다음\s*달|담달)\s*\d{1,2}일?/g, " ")
    // V22.9.34 감사 N6·D8: "일주일/이틀/한 달 전", 말일, 작년·올해 같은 날짜 말도 메모에서 뺀다. "N일 전"은
    // 낱말 경계에서만 뺀다. 예전에는 "1일 전기요금"이 "기요금"이 됐다.
    .replace(/(?:^|\s)(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*[전후](?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*[전후](?=\s|$)/g, " ")
    .replace(/(?:(?:지난|저번|이번|다음)\s*달|이달|담달)?\s*말일/g, " ")
    .replace(/(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*(?=\d{1,2}\s*(?:월|[./]))/g, " ")
    .replace(/\d{1,2}\s*월\s*\d{1,2}일?/g, " ")
    .replace(/\d{1,2}[.\/]\d{1,2}/g, " ")
    .replace(/(?:^|\s)\d{1,2}일(?:\s|$)/g, " ")
    .replace(patterns.cardName, " ")
    .replace(patterns.paymentWord, " ")
    // 조사·서술어는 낱말 "끝"에서만 떼어낸다. 위치를 가리지 않고 지우면
    // 타이어교체→"타 어교체", 이발→"발", 가방→"방"처럼 내용이 파괴된다.
    // 한 글자 조사(이·가·로·에·은·는·을·를)는 떼어내지 않는다. 고양이→"고양",
    // 목걸이→"목걸", 을지로→"을지"처럼 멀쩡한 낱말의 끝 글자와 구분할 수 없다.
    // 두 글자 조사만 떼어낸다. "마트에서 12000"→"마트" 같은 주된 사례는 그대로 처리된다.
    .replace(/([가-힣A-Za-z0-9]{2,})(에서|으로|에게|한테)(?=\s|$)/g, "$1 ")
    // V22.9.77 감사 A-15: 붙여 쓴 말끝은 동사 꼴(썼어·샀어·했어 …)만 뗀다. 사용·결제·구매·납부·송금·이체는 앞말과 붙으면 한
    // 낱말(공동구매·간편결제·해외송금)이라 떼면 "공동구매"가 "공동"이 됐다. 띄어 쓴 토막은 아래 줄이 그대로 지운다.
    .replace(/([가-힣]{2,})(썼어|썼다|썻어|썼음|냈어|냈음|샀어|샀음|했어|했다)(?=\s|$)/g, "$1 ")
    // 홀로 남은 조사·서술어 토막만 따로 지운다.
    .replace(/(?:^|\s)(에서|으로|에게|한테|로|에|을|를|은|는|이|가|썼어|썼다|썻어|썼음|냄|냈어|냈음|샀어|샀음|삼|했어|함|했다|사용|결제|구매|납부|송금|이체)(?=\s|$)/g, " ")
    // V22.9.77 감사 A-15: 금액을 뺀 뒤 홀로 남은 단위 ‘원’("점심 ₩12000"의 ₩)과 어림말 ‘정도’("만원 정도")도 지운다.
    // 낱말 속 ‘원’·‘정도’(원정·공원·정도전)는 그대로다.
    .replace(/(?:^|\s)(?:원|정도)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!memo) memo = category || (type === "income" ? "기타수입" : "기타지출");
  return memo.slice(0, 160);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// @build:exports-start
export {
  AB_CATEGORY_RULES_ASSET_PATH, AB_CATEGORY_RULES_SCRIPT_TAG, CATEGORY_RULES,
  LEGACY_CATEGORY_SPLITS, abCategoryRulesJsAsset, cleanMemo, inferCategory, normalizeCategoryName,
};
// @build:exports-end
