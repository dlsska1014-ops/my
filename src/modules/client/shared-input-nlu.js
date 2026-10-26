// V22.9.79 (V44 A-07·A-10·A-16, V77 N-11·N-13): 웹 빠른 입력(홈 자산)과 카카오가 같은 함수로 같은 문장을 읽게 하는 공유 해석 함수.
//
// 예전에는 서버(nlu/*)와 홈 인라인 스크립트(my/mobile-home.js)·옛 화면(client/legacy-ui-runtime.js)이 결제수단·분류·메모 판정을
// 각각 들고 있어, 서버만 고친 결함(V22.9.76 A-10, V22.9.77 N-1)이 화면 미리 보기에는 그대로 남았다(N-11). 이 파일의 함수가 정본이고,
// 서버는 이 함수를 부르며 화면은 `.toString()` 으로 같은 본문을 받는다.
//
// 이 파일의 함수는 브라우저 자산에도 그대로 실리므로 다음을 지킨다(validate-client-serialization-v22932 가 지키는지 본다).
//   1) 밖의 이름은 이 파일의 다른 공유 함수와 shared-input-parsers.js 의 moneyTokenSpans 만 부른다. 상수는 함수 안에 둔다.
//   2) 뒤돌아보기(lookbehind) 정규식을 쓰지 않는다(옛 Safari 는 자산 전체를 못 읽는다). 앞 글자 조건은 앞 한 글자를 함께 잡아 돌려준다.
//   3) 정규식은 처음 부를 때 한 번만 만들어 함수 자신에 붙여 둔다(E-1: 문장 한 줄 해석의 new RegExp 횟수 상한).
// 함수 안의 설명은 브라우저 바이트가 되므로 이 머리말과 함수 위에 모아 둔다.

// V22.9.79 A-16: 전각 숫자(０-９)와 숫자 곁에 쓰는 전각 부호(， ． ： ／ － ＋ ％ （ ）)를 반각으로 바꾼다. 한 글자가 한 글자로 바뀌어
// 글자 위치는 그대로다. 예전에는 전각으로 쓴 금액(“커피 ４５００”)을 읽지 못했다. 글자·한글은 건드리지 않는다.
function foldInputWidth(text = "") {
  return String(text || "").replace(/[０-９，．：／－＋％（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

// V22.9.76 감사 A-07: 수 단위 뒤의 띄어쓰기("만 오천원", "삼만 오천원", "만 2천원", "사천 오백원")는 한 금액이다. 띄운 채 두면
// 앞뒤가 두 금액으로 읽혀 두 건(10,000원 + 기타지출 5,000원)으로 저장되거나 뒤의 금액이 사라졌다. 앞이 만·억·천·백으로
// 끝나고, 뒤가 그보다 작은 단위(천·백·십)의 수이며 ‘원’이 붙거나 문장이 끝날 때만 붙인다. 앞이 숫자 단위("3만 5천원")면
// 예전부터 한 금액으로 읽으므로 건드리지 않는다.
// V22.9.79 A-07(웹): 이 규칙은 서버 normalizeText 안에만 있어 웹 빠른 입력 미리 보기는 아직 두 금액("만" 10,000원 + "오천원")으로
// 읽었다. 서버와 화면이 이 한 함수를 함께 쓴다. 뒤가 숫자("만 2천원")면 앞도 숫자 단위("1만")로 바꿔야 한 금액("1만2천원")으로
// 읽히며, 앞의 수(koreanHeadValue)는 예전 서버 parseKoreanAmount 와 같은 방식으로 읽는다(“사십십만” 같은 엉터리 앞말도 예전과 같은 값).
// V22.9.80 T-17: 뒤가 ‘만’으로 끝나는 꼴(“삼억 오천만원” = 3억5천만, “삼천 오백만원” = 3천5백만, “삼억 5000만원”)과 ‘원’ 없이 결제수단이
// 뒤따르는 꼴(“택시 만 오천 현금”)도 한 금액이다. 예전에는 뒤를 천·백·십까지만 보고 ‘원’이나 문장 끝만 기다려 두 금액(3억 + 5천만원,
// 1만 + 5천)으로 나뉘어 두 건으로 저장됐다. 뒤가 ‘만’으로 끝나면 앞이 억이거나 앞의 끝 단위(천·백)가 뒤의 첫 단위보다 클 때만 붙인다
// (“만 오천만원”·“천 오천만원”은 예전처럼 둘). 뒤따르는 결제수단은 결제수단 판정(inputPaymentPatterns)이 그 자리에서 읽는 말만 본다
// (‘현금영수증’·‘카드 지갑’·‘토스트’ 앞에서는 붙이지 않는다). 정규식은 처음 부를 때 한 번만 만든다.
// V22.9.81 U-9: 앞이 십·백·천만 가진 수(“오십”·“삼백”·“천오백”, 단위 한 글자 “백”(가방)·“천”(옷감)은 빼고 “십”은 넣는다)이고 뒤가
// ‘만·억’으로 끝나며 그 머리가 앞의 가장 작은 단위보다 작으면 한 금액이다(“오십 오만원” = 55만, “삼백 오만원” = 305만, “오십 5만원” = 55만).
// 예전에는 앞이 만·억·천·백으로 끝날 때만 보아 “월세 오십 오만원”이 두 건(50원 + 50,000원)으로 저장됐다. 머리가 앞의 단위보다 크거나
// 같으면(“오십 오십만원”) 잇지 않고, 뒤가 ‘만·억’으로 끝나지 않으면(“커피 오십 오천”) 예전 그대로다. 이 묶음을 먼저 이어야
// “삼억 오십 오만원”이 아래 규칙으로 한 금액(3억55만)이 된다. 뒤따르는 말 조건(‘원’·문장 끝·결제수단)은 아래 규칙과 같다.
function joinSpacedKoreanAmount(text = "") {
  if (!joinSpacedKoreanAmount.pattern) {
    const after = "(?=\\s*원|\\s*$|\\s+(?:" + inputPaymentPatterns().methods.map((method) => method[0].source).join("|") + "))";
    joinSpacedKoreanAmount.smallHead = new RegExp("(^|\\s)(십|[일이삼사오육칠팔구십백천]+[십백천])\\s+([일이삼사오육칠팔구십백천]+|\\d{1,4})([만억])" + after, "gi");
    joinSpacedKoreanAmount.pattern = new RegExp("(^|\\s)([일이삼사오육칠팔구십백천]*[만억천백])\\s+((?:[일이삼사오육칠팔구]|\\d{1,3}|\\d{4}(?=만))?([천백십만])[일이삼사오육칠팔구십백]*만?)" + after, "gi");
  }
  const digit = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const simple = (part) => { let out = 0; for (const ch of part) if (digit[ch] !== undefined) out = out * 10 + digit[ch]; return out; };
  const below = (part) => {
    let total = 0, rest = part;
    for (const [name, value] of [["천", 1000], ["백", 100], ["십", 10]]) {
      const at = rest.indexOf(name);
      if (at >= 0) { total += (rest.slice(0, at) ? simple(rest.slice(0, at)) || 1 : 1) * value; rest = rest.slice(at + 1); }
    }
    return rest ? total + simple(rest) : total;
  };
  const joined = String(text || "").replace(joinSpacedKoreanAmount.smallHead,
    (all, lead, head, next, big) => {
      const nextValue = /^\d/.test(next) ? Number(next) : below(next);
      if (!(nextValue > 0 && nextValue < { 십: 10, 백: 100, 천: 1000 }[head.slice(-1)])) return all;
      return /^\d/.test(next) ? `${lead}${below(head) + nextValue}${big}` : `${lead}${head}${next}${big}`;
    });
  return joined.replace(joinSpacedKoreanAmount.pattern,
    (all, lead, head, tail, unit) => {
      const unitValue = { 억: 100000000, 만: 10000, 천: 1000, 백: 100 }[head.slice(-1)];
      const tailValue = { 만: 10000, 천: 1000, 백: 100, 십: 10 }[unit];
      const joinable = unit === "만" ? unitValue === 100000000 && tail.indexOf("만") === tail.length - 1
        : /만$/.test(tail) ? unitValue === 100000000 || (unitValue < 10000 && unitValue > tailValue)
        : unitValue > tailValue;
      if (!joinable) return all;
      if (!/^\d/.test(tail)) return `${lead}${head}${tail}`;
      let headValue = 0, rest = head;
      const eok = rest.split("억");
      if (eok.length > 1) { headValue += (eok[0] ? below(eok[0]) : 1) * 100000000; rest = eok.slice(1).join("억"); }
      const man = rest.split("만");
      if (man.length > 1) { headValue += (man[0] ? below(man[0]) : 1) * 10000; rest = man.slice(1).join("만"); }
      const coefficient = (headValue + below(rest)) / unitValue;
      return Number.isInteger(coefficient) && coefficient > 0 ? `${lead}${coefficient}${head.slice(-1)}${tail}` : all;
    });
}

// 거래 문장을 해석하기 전에 한 번 다듬는 정본(서버 normalizeText 의 본문). 전각 변환(foldInputWidth)은 포함하지 않는다 —
// normalizeText 는 이름·로그인 값 등 거래 문장이 아닌 곳에서도 쓰이므로 거래 문장 입구(parseTransaction·빠른 입력)에서 따로 부른다.
// V22.9.77 감사 A-15: ‘원정’(금 오만원정)은 금액 바로 뒤에서만 ‘원’이다. 예전에는 낱말 속까지 바꿔 "원정 경기"가 "원 경기"가 됐다.
// 금액 뒤에 말이 붙어 있으면("만원정도"·"만원정산") ‘원’ 뒤를 띄어 그 말의 ‘정’을 살린다(예전: "만원도"·"만원산").
// V22.9.34 감사 D1·N2: 시각(19:40)·괄호 속 카드 끝자리((1234))·가린 카드번호·카드 문자의 누적·잔액·한도
// 금액은 기호를 지우기 전에 뺀다. 지우고 나면 "19 40", " 1234 " 가 되어 금액으로 읽혔다.
function normalizeInputText(text) {
  function normalizeTextSymbols(value) {
    const chunks = [];
    for (let i = 0; i < value.length; i += 16384) {
      let part = value.slice(i, i + 16384).replace(/[~!@#$^&*_=\`|\\{}\[\]:;"'<>?()]+/g, " ").replace(/\s+/g, " ");
      if (chunks.length && chunks[chunks.length - 1].endsWith(" ") && part.startsWith(" ")) part = part.slice(1);
      if (part) chunks.push(part);
    }
    return chunks.join("").trim();
  }
  const prepared = String(text || "")
    .replace(/^@[\w가-힣_-]+\s*/, "")
    .replace(/^\/+/, "")
    .replace(/[，]/g, ",")
    .replace(/[₩￦]/g, "원")
    .replace(/([\d일이삼사오육칠팔구십백천만억])(\s*)원정(?![가-힣])/g, "$1$2원")
    .replace(/([\d일이삼사오육칠팔구십백천만억])(\s*)원정(?=[가-힣])/g, "$1$2원 정")
    .replace(/만 원/g, "만원")
    .replace(/천 원/g, "천원")
    .replace(/처넌/g, "천원")
    .replace(/처눤/g, "천원")
    .replace(/백 원/g, "백원")
    .replace(/십 원/g, "십원");
  return normalizeTextSymbols(joinSpacedKoreanAmount(prepared)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\(\s*\d{2,4}\s*\)/g, " ")
    .replace(/\d{2,4}(?:[-\s]?[*＊xX]{2,})+(?:[-\s]?\d{2,4})?/g, " ")
    .replace(/[*＊xX]{2,}[-\s]?\d{2,4}/g, " ")
    .replace(/(?:누적|잔액|잔고|남은\s*한도|한도)\s*:?\s*[\d,]+\s*원?/g, " ")
  );
}

// 결제수단 말에 쓰는 정규식 한 벌(찾기·메모에서 지우기가 같은 기준을 쓰게 한 곳에서 만든다).
// V22.9.77: 짧거나 다른 낱말 속에 흔한 결제수단 말(토스·현금·체크·신용·카드·삼페·카페이·네페)은 그 낱말에서 끝날 때만
// 결제수단이다. 예전에는 낱말 속에서도 읽어 "토스트 3000"이 결제수단 ‘토스’·메모 ‘트’로 저장됐다(현금영수증→현금,
// 체크인→체크카드, 신용점수→신용카드, 카드지갑→카드, 카페이용→카카오페이도 같은 결함). 뒤에 조사(로·으로·에 …)나
// 결제·결재·승인·했·줬·보냄 같은 말이 붙은 것("토스로", "카드결재", "현금줬어")은 예전처럼 읽는다. 카드사 이름이 붙은
// 카드(현대카드·KB국민카드)와 온전한 간편결제 이름(카카오페이·네이버페이·토스페이·토스뱅크 …)은 헷갈릴 낱말이 없어 예전처럼
// 어디에 있든 읽는다("현대카드제로", "카카오페이머니로").
// V22.9.79 N-13: 낱말 끝 조건은 붙여 쓴 낱말만 가려냈다. 띄어 쓴 ‘카드 지갑’·‘신용 회복’·‘현금 영수증’·‘체크 인’과 ‘교통카드 충전’의
// 카드(‘카드’ 뒤에 충전·발급·수수료 …)는 결제수단이 아니라 물건·서비스 이름이다. 예전에는 결제수단 ‘카드’로 읽고 메모에서도 ‘카드’를
// 지워 "교통카드 충전"의 메모가 "교통 충전", "카드 지갑"이 "지갑"이 됐다. 짧은 결제수단 말 바로 뒤(띄어서)에 그 말과 한 덩어리인
// 이름이 오면 결제수단으로도, 메모에서 지울 말로도 읽지 않는다. 그 밖의 문장은 예전과 같다("점심 카드 12000", "카드 점심 12000").
// 사이에 금액·날짜 말이 끼면 한 덩어리로 보지 않는다(예전 그대로). methods 의 찾는 순서와 낱말은 예전 결제수단 판정 그대로다
// (앞: 어디에 있든 읽는 온전한 이름, 뒤: 낱말 끝에서만 읽는 짧은 말). protect 는 메모에서 지우지 않을 낱말을 가리는 정규식이다 —
// 결제수단 판정(methods)이 읽지 않은 바로 그 낱말이며, 메모 다듬기가 금액 같은 것을 지우기 전에 한 번 가린다.
function inputPaymentPatterns() {
  if (inputPaymentPatterns.cache) return inputPaymentPatterns.cache;
  const end = "(?=$|[^가-힣]|(?:으로|로|에|이|가|을|를|은|는|도|만|와|과|의|랑|하고|결제|결재|계산|지불|지출|지급|구매|구입|납부|환불|사용|썼|씀|긁|찍|냄|냈|했|함|해|줌|줬|줘|드림|드렸|보냄|보냈|승인|취소|할부|일시불|송금|입금|출금))";
  const cardHeads = "지갑|케이스|홀더|단말기|리더기|수수료|연회비|재?발급|해지|갱신|분실|충전";
  const cardBody = "\\s+(?:" + cardHeads + ")";
  const creditBody = "\\s+(?:회복|점수|등급|조회|정보|평가|대출|불량|보증|카드\\s+(?:" + cardHeads + "))";
  const checkBody = "\\s+(?:(?:인|아웃|리스트)(?![가-힣])|카드\\s+(?:" + cardHeads + "))";
  const cashBody = "\\s+영수증";
  const pick = (anywhere, short) => new RegExp([anywhere, short].filter(Boolean).join("|"));
  const cardBrands = ["신한", "현대", "삼성", "국민", "KB", "우리", "롯데", "하나", "농협", "NH", "BC", "비씨", "카카오", "토스"];
  inputPaymentPatterns.cache = {
    end,
    methods: [
      ...cardBrands.map((brand) => [new RegExp(brand + "\\s*카드", "i"), ["KB", "NH", "BC"].includes(brand.toUpperCase()) ? brand.toUpperCase() + "카드" : brand + "카드"]),
      [pick("삼성\\s*페이", "삼페" + end), "삼성페이"],
      [pick("카카오\\s*페이", "카페이" + end), "카카오페이"],
      [pick("네이버\\s*페이", "네페" + end), "네이버페이"],
      [pick("애플\\s*페이"), "애플페이"],
      [pick("페이코"), "페이코"],
      [pick("제로\\s*페이"), "제로페이"],
      [pick("토스\\s*(?:페이|뱅크)", "토스" + end), "토스"],
      [pick("", "신용\\s*카드" + end + "(?!" + cardBody + ")|신용" + end + "(?!" + creditBody + ")"), "신용카드"],
      [pick("", "체크\\s*카드" + end + "(?!" + cardBody + ")|체크" + end + "(?!" + checkBody + ")"), "체크카드"],
      [pick("", "카드" + end + "(?!" + cardBody + ")"), "카드"],
      [pick("", "현금" + end + "(?!" + cashBody + ")"), "현금"],
      [/(계좌|이체|송금|자동이체|무통장)/, "계좌이체"],
    ],
    protect: [
      new RegExp("(?:신용\\s*카드|체크\\s*카드|카드)" + end + "(?=" + cardBody + ")", "g"),
      new RegExp("신용" + end + "(?=" + creditBody + ")", "g"),
      new RegExp("체크" + end + "(?=" + checkBody + ")", "g"),
      new RegExp("현금" + end + "(?=" + cashBody + ")", "g"),
    ],
    brand: /(?:신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오|토스)\s*$/i,
    after: new RegExp("^" + end),
  };
  return inputPaymentPatterns.cache;
}

// 정규화한 문장에서 결제수단을 찾는다. 서버 detectPaymentMethod 와 화면 빠른 입력이 같은 함수를 쓴다(V77 N-11).
function detectInputPayment(raw) {
  for (const [pattern, method] of inputPaymentPatterns().methods) if (pattern.test(raw)) return method;
  return "";
}

// V22.9.80 T-15: 가계부에 등록한 결제수단 이름(웹 빠른 입력은 결제수단 목록의 이름)이 정규화한 문장 raw 에 낱말로 있는지 본다. 예전에는
// 이름을 낱말 속에서도 찾아, 결제수단 ‘토스’를 등록하면 "토스트 3000"이 카카오·웹 모두 결제수단 토스로 저장됐다(웹은 목록에 늘 드는 기본
// 결제수단 이름 때문에 등록하지 않아도 그랬다 — ‘현금영수증’은 현금, ‘교통카드 충전’·‘카드 지갑’은 카드). 한글로 끝나는 이름 뒤에는 기본
// 결제수단 말의 V77 N-1 낱말 끝 규칙(inputPaymentPatterns().end)을 그대로 쓰고, 이름 바로 뒤에 붙은 카드·체크·통장·계좌·페이·뱅크
// (‘생활비통장’·‘신한카드’)는 그 결제수단을 가리키므로 예전처럼 맞는다. 영문·숫자로 끝나는 이름은 뒤에 영문·숫자만 이어지지 않으면 된다
// ("KB"는 "KBS"에 없고 "KB국민카드"에는 있다). N-13 의 결제수단이 아닌 말(‘카드 지갑’·‘교통카드 충전’·‘신용 회복’·‘현금 영수증’)이 이름의
// 끝이나 바로 뒤에 붙은 카드·체크이면 맞지 않는다. 기본 판정이 그 이름 그대로 읽는 말(카드·현금·토스·신한카드 …)은 기본 판정
// (detectInputPayment)에 맡긴다 — 웹 목록에서 먼저 찾으면 "라면 1500 현대 카드"가 카카오(현대카드)와 달리 ‘카드’였다. issuer 를 참으로
// 주면 등록 결제수단의 발급사 말(‘토스’ 발급 카드)로 보고 기본 판정이 읽는 말이어도 찾는다(낱말 끝 규칙은 같다).
function inputPaymentNameIn(raw, name, issuer) {
  const text = String(raw || ""), word = normalizeInputText(name);
  if (!word || (!issuer && detectInputPayment(word) === word)) return false;
  const pay = inputPaymentPatterns(), latin = /[A-Za-z0-9]$/.test(word);
  let guarded = null;
  for (let at = text.indexOf(word), seen = 0; at >= 0 && seen < 16; at = text.indexOf(word, at + 1), seen += 1) {
    const tail = at + word.length, rest = text.slice(tail), joined = /^(?:카드|체크|통장|계좌|페이|뱅크)/.test(rest);
    if (latin ? /^[A-Za-z0-9]/.test(rest) : !(joined || pay.after.test(rest))) continue;
    if (/(?:카드|신용|체크|현금)$/.test(word) || /^(?:카드|체크)/.test(rest)) {
      if (!guarded) {
        guarded = [];
        for (const pattern of pay.protect) text.replace(pattern, (all, ...args) => { guarded.push("s" + args[args.length - 2], "e" + (args[args.length - 2] + all.length)); return all; });
      }
      if (guarded.includes("e" + tail) || guarded.includes("s" + tail)) continue;
    }
    return true;
  }
  return false;
}

// 낱말 속 글자가 분류를 정하지 않게 한다(정규화·소문자로 바꾼 문장 raw, 규칙 목록 rules).
// V22.9.76 감사 A-10: 걸린 낱말이 다른 규칙의 더 긴 낱말 안에 들어 있으면 세지 않는다(동물병원 속 병원, 전기차 속 전기, 수술·미술
// 속 술, 이마트24 속 이마트). 규칙의 except 는 그 규칙의 낱말을 덮으면 무효로 만드는 말이다(스마트폰의 마트, 농협카드의 농협,
// 아이패드의 아이). 같은 규칙 안에서 겹치는 낱말(미용실·미용)과 서로 겹치지 않는 낱말은 예전처럼 무게를 더해 겨룬다("맥도날드
// 배달"은 배달). 한 낱말의 위치는 앞에서 16곳까지만 본다. exact 낱말은 앞뒤가 글자·숫자가 아닐 때만 맞는다(큰 가져오기 칸에서도
// 낱말 배열을 만들지 않는다). 영문 키워드(cu·gs25·ktx·srt·ev·kt·skt)는 사람이 대문자로도 쓰므로 표의 낱말은 소문자로 적고 들어온
// 글도 소문자로 낮춰 비교한다. V22.9.79 A-10(웹): 홈 빠른 입력과 옛 화면의 분류 추정은 이 규칙 대신 낱말이 들어 있기만 하면 점수를
// 더하는 옛 방식이라 저장 결과와 달랐다. 서버와 화면이 이 한 함수를 함께 쓴다. 겹치는 낱말은 시작 위치 순으로 훑으며, 앞선 위치들에서 가장
// 멀리 끝나는 낱말을 규칙이 다른 두 개까지 기억해 가려낸다.
function inferInputCategory(raw, type, rules) {
  const spans = [];
  // V22.9.79 감사 E-1: 낱말 수백 개를 글에서 찾는 indexOf 가 가져오기 카드 표 해석 시간의 약 3할이었다. 글에 없는 글자로 시작하는 낱말은
  // 찾아볼 필요가 없으므로(indexOf 는 첫 글자 단위가 글에 있어야 맞는다) 글의 글자 단위 표를 한 번 만들어 거른다. 결과는 같다.
  const present = new Set();
  for (let i = 0; i < raw.length; i++) present.add(raw.charCodeAt(i));
  const collect = (rule, word, exact) => {
    if (!present.has(word.charCodeAt(0))) return;
    for (let at = raw.indexOf(word), seen = 0; at >= 0 && seen < 16; at = raw.indexOf(word, at + 1)) {
      const end = at + word.length;
      if (exact && !((at === 0 || !/[a-z0-9가-힣]/.test(raw[at - 1])) && (end === raw.length || !/[a-z0-9가-힣]/.test(raw[end])))) continue;
      spans.push({ start: at, end, rule, id: (exact ? "=" : "~") + word, gain: rule.weight + Math.min(word.length, 8), dead: false });
      seen += 1;
    }
  };
  for (const rule of rules) {
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
  for (const rule of rules) {
    const score = scores.get(rule) || 0;
    if (score > 0 && (!best || score > best.score)) best = { category: rule.name, score };
  }
  return best ? best.category : (type === "income" ? "기타수입" : "기타지출");
}

// 메모 다듬기의 정본. 금액 → 고정 낱말(명령어·받은 말·날짜 말) → 결제수단 순서로 하나씩 지운다. 서버 cleanMemo 와 화면 빠른 입력이 같은 함수를
// 쓴다(V22.9.79: 화면 stripQuickMemo 는 결제수단 말을 낱말 속에서도 지우고 분류 이름도 지워 "토스트"가 "트", "교통카드 충전"이 "충전"이 됐다).
// V22.9.76 카카오 감사 17: "이자 받았어 3000원"의 메모가 "이자 어"였다. 긴 말끝부터 통째로 뺀다.
// V22.9.77: 카드 이름 앞에 붙은 카드사 이름("KB국민카드"의 KB, "NH농협카드"의 NH, "IBK기업카드"의 IBK기업,
// "국민체크카드"의 국민)과 띄어 쓴 영문 카드사 이름("KB 국민카드"의 KB)도 결제수단의 일부라 함께 지운다. 예전에는
// "커피 4500 KB국민카드"의 메모가 "커피 KB"였다. 결제수단 낱말은 낱말 끝에서만 지운다. 예전에는 "토스트"가 "트", "현금영수증"이
// "영수증"이 됐다. 카드사 이름이 붙은 카드와 온전한 간편결제 이름은 결제수단 찾기처럼 낱말 끝을 따지지 않고 지우고, 띄어 쓴 것
// ("현대 카드", "삼성 페이")도 통째로 지운다.
// V22.9.77 요일 앞의 ‘지난·저번·이번·다음’도 ‘주’ 없이 쓰면("지난 금요일") 함께 지운다. V22.9.34 감사 N6·D8: "일주일/이틀/한 달 전",
// 말일, 작년·올해 같은 날짜 말도 메모에서 뺀다. "N일 전"은 낱말 경계에서만 뺀다(예전에는 "1일 전기요금"이 "기요금"이 됐다).
// 조사·서술어는 낱말 "끝"에서만 떼어낸다. 위치를 가리지 않고 지우면 타이어교체→"타 어교체", 이발→"발", 가방→"방"처럼 내용이 파괴된다.
// 한 글자 조사(이·가·로·에·은·는·을·를)는 떼어내지 않는다(고양이→"고양", 목걸이→"목걸", 을지로→"을지"). 두 글자 조사만 떼어낸다.
// V22.9.77 감사 A-15: 붙여 쓴 말끝은 동사 꼴(썼어·샀어·했어 …)만 뗀다. 사용·결제·구매·납부·송금·이체는 앞말과 붙으면 한 낱말(공동구매·
// 간편결제·해외송금)이라 떼면 "공동구매"가 "공동"이 됐다. 금액을 뺀 뒤 홀로 남은 단위 ‘원’("점심 ₩12000"의 ₩)과 어림말 ‘정도’도 지운다.
// V22.9.79: 카드사 이름·요일 앞말의 “앞이 글자가 아닐 때만” 조건은 뒤돌아보기 대신 앞 한 글자(글자 아님)를 함께 잡았다가 바꿀 때 돌려준다
// (지우는 범위가 같아 결과가 같다).
function cleanInputMemo(raw, amountRaw, type, paymentMethod, category) {
  const patterns = cleanInputMemo.cache || (cleanInputMemo.cache = (() => {
    const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pay = inputPaymentPatterns();
    const commandWords = ["수입", "입금", "지출", "출금", "사용", "결제", "구매", "납부", "정산", "기록", "가계부"];
    const fixedWords = [
      ...commandWords,
      "받았어요", "받았어", "받았음", "받았다", "들어왔어요", "들어왔어", "들어왔음", "들어왔다", "들어옴", "들어온", "입금됨", "받음", "받았",
      "오늘", "금일", "어젯밤", "엊저녁", "어제", "전날", "엊그저께", "엊그제", "그끄저께", "그끄제", "그저께", "그제", "내일",
    ];
    const cardNames = "(?:KB|NH|IBK|SC|BC|BNK|DGB|KDB|KEB)\\s+|[A-Za-z]{1,6}[가-힣]{0,4}|신한|현대|삼성|국민|우리|롯데|하나|농협|비씨|카카오|토스|기업|씨티|수협|신협|우체국|새마을|케이뱅크|카카오뱅크|토스뱅크";
    const withNames = (core, flags) => new RegExp("(?:(^|[^A-Za-z가-힣])(?:" + cardNames + ")(?:" + core + ")|(?:" + core + "))", flags);
    return {
      escape, commandWords, cardNames, withNames,
      fixed: fixedWords.map((item) => new RegExp(commandWords.includes(item) ? "(^|\\s)" + escape(item) + "(?=\\s|\\d|$)" : escape(item), "g")),
      cardName: withNames("(?:신용카드|체크카드|카드)" + pay.end, "gi"),
      paymentWord: new RegExp("(?:현금|삼성페이|삼페|카카오페이|카페이|네이버페이|네페|애플페이|페이코|제로페이|토스페이|토스뱅크|토스|계좌이체|자동이체|무통장|체크|신용)" + pay.end, "g"),
      weekday: new RegExp("(?:(^|[^가-힣])(?:(?:지지난|저저번|지난|저번|이번|다음|오는|돌아오는)\\s*주|전주|금주|내주|지지난|저저번|지난번|지난|저번|이번|다음|오는|돌아오는)\\s*[월화수목금토일]요일|[월화수목금토일]요일)", "g"),
      anywhere: /^(?:(?:신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오|토스)카드|삼성페이|카카오페이|네이버페이|애플페이|페이코|제로페이)$/i,
    };
  })());
  const keep = (all, before) => (before || "") + " ";
  // 결제수단 판정이 읽지 않은 낱말(‘교통카드 충전’·‘카드 지갑’의 카드)은 금액 같은 것을 지우기 전에, 판정한 그 문장에서 한 번 가려 둔다.
  // 가린 낱말의 첫 글자 뒤에 눈에 안 보이는 표식(U+E000)을 끼워 아래 결제수단 지우기가 읽지 못하게 하고 끝에서 뺀다.
  const mark = String.fromCharCode(0xE000);
  const protect = inputPaymentPatterns();
  let memo = normalizeInputText(foldInputWidth(raw)).split(mark).join("");
  if (/카드|신용|체크|현금/.test(memo)) {
    for (const pattern of protect.protect) {
      memo = memo.replace(pattern, (all, ...rest) => {
        const offset = rest[rest.length - 2], whole = rest[rest.length - 1];
        // 카드사 이름이 붙은 카드(‘신한카드 지갑’)는 결제수단 판정이 카드사 이름으로 읽으므로 가리지 않는다.
        if (all === "카드" && protect.brand.test(whole.slice(0, offset))) return all;
        return all.replace(/신용|체크|현금|카드/g, (word) => word.charAt(0) + mark + word.slice(1));
      });
    }
  }
  if (amountRaw) memo = memo.replace(new RegExp(patterns.escape(amountRaw), "g"), " ");
  for (const pattern of patterns.fixed) memo = memo.replace(pattern, " ");
  if (paymentMethod) {
    const pay = inputPaymentPatterns();
    const token = patterns.escape(paymentMethod);
    if (patterns.commandWords.includes(paymentMethod)) memo = memo.replace(new RegExp("(^|\\s)" + token + "(?=\\s|\\d|$)", "g"), " ");
    else if (patterns.anywhere.test(paymentMethod)) {
      const core = token.replace(/(카드|페이)$/, "\\s*$1");
      memo = /카드$/.test(paymentMethod) ? memo.replace(patterns.withNames(core, "gi"), keep) : memo.replace(new RegExp(core, "gi"), " ");
    } else {
      const core = token + pay.end;
      memo = /카드$/.test(paymentMethod) ? memo.replace(patterns.withNames(core, "gi"), keep) : memo.replace(new RegExp(core, "gi"), " ");
    }
  }

  memo = memo
    .replace(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?/g, " ")
    .replace(patterns.weekday, keep)
    .replace(/(?:지난|저번)\s*달\s*\d{1,2}일?/g, " ")
    .replace(/(?:이번\s*달|이달)\s*\d{1,2}일?/g, " ")
    .replace(/(?:다음\s*달|담달)\s*\d{1,2}일?/g, " ")
    .replace(/(?:^|\s)(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*[전후](?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*[전후](?=\s|$)/g, " ")
    .replace(/(?:(?:지난|저번|이번|다음)\s*달|이달|담달)?\s*말일/g, " ")
    .replace(/(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*(?=\d{1,2}\s*(?:월|[./]))/g, " ")
    .replace(/\d{1,2}\s*월\s*\d{1,2}일?/g, " ")
    .replace(/\d{1,2}[.\/]\d{1,2}/g, " ")
    .replace(/(?:^|\s)\d{1,2}일(?:\s|$)/g, " ")
    .replace(patterns.cardName, keep)
    .replace(patterns.paymentWord, " ")
    .replace(/([가-힣A-Za-z0-9]{2,})(에서|으로|에게|한테)(?=\s|$)/g, "$1 ")
    .replace(/([가-힣]{2,})(썼어|썼다|썻어|썼음|냈어|냈음|샀어|샀음|했어|했다)(?=\s|$)/g, "$1 ")
    .replace(/(?:^|\s)(에서|으로|에게|한테|로|에|을|를|은|는|이|가|썼어|썼다|썻어|썼음|냄|냈어|냈음|샀어|샀음|삼|했어|함|했다|사용|결제|구매|납부|송금|이체)(?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:원|정도)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(mark).join("");

  if (!memo) memo = category || (type === "income" ? "기타수입" : "기타지출");
  return memo.slice(0, 160);
}
// @build:exports-start
export {
  cleanInputMemo, detectInputPayment, foldInputWidth, inferInputCategory, inputPaymentNameIn,
  inputPaymentPatterns, joinSpacedKoreanAmount, normalizeInputText,
};
// @build:exports-end
