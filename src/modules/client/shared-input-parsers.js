// @build:imports-start
import { foldInputWidth, normalizeInputText } from "./shared-input-nlu.js";
// @build:imports-end

export function parseMobileAmountText(text = "") {
  const amount = moneyTokenSpans(text)[0]?.amount || 0; return amount <= 2000000000 ? amount : 0;
}

// The same self-contained scanner is serialized into the immutable client asset.
// V22.9.34 감사 D1·N2: 날짜(10/3, 10.3, 7-15)는 뒤에 숫자가 와도 날짜로 뺀다. 예전에는 "10/3 52000 마트"가
// 10원·3원·52,000원 세 건이 됐다. 시각(19:40), 괄호 속 카드 끝자리((1234)), 가린 카드번호(1234-****),
// "끝자리 1234", 카드 문자의 누적·잔액·한도 금액도 금액 후보에서 뺀다.
// V22.9.79 A-16: 전각 숫자·부호(“４５００”, “１２，０００원”)를 반각으로 읽는다(글자 수가 같아 위치는 그대로다). “1+1 우유 3000”의 1+1
// (덤 행사 표기)은 부호가 붙은 금액이 아니라 수량이라 후보에서 빼고(예전에는 문장 전체를 금액 없음으로 거절), “생수 2 박스”·
// “쌀 10 kg”처럼 숫자 뒤에 띄어 쓴 수량 단위가 오면 그 숫자는 금액이 아니다.
// V22.9.93 Q-38: ‘커피 5000점심 9000’ 의 5000 은 다음 항목에 붙은 금액이다(9,000원 한 건, 메모 ‘커피 5000점심’ 이 됐다). 가격 꼴(네 자리 이상, 00 으로 끝남) 뒤에 일상 품목과
// 다음 숫자가 이어질 때만 금액으로 읽는다(아래 Q-91). 위 수량 단위(‘맥주 1000밀리 5000’)는 그 앞에서 걸러진다.
// V22.9.93 Q-41: 금액 바로 뒤 쉼표를 자릿수로 여겨 ‘점심 9000원, 국민카드’ 의 금액을 건너뛰었다(웹 금액 칸이 비어 저장되지 않았다). 뒤가 숫자일 때만 자릿수다.
// V22.9.93 Q-66: 붙여 쓴 값(‘커피 4500점심 9000’)을 두 건으로 읽으면서 수량도 값이 됐다(‘우유 1000미리 2800’·‘주유 50000어치 49000’·‘환전 1000달러 130만원’ 이 두 건). 단위 표에 넣어 수량으로 뺀다.
// V22.9.93 Q-52: 앞 낱말의 글자를 수로 읽어 금액이 조용히 틀렸다. ‘월세 백만원’ 300만·‘식사 만원’ 4만·‘친구 만원’ 9만·‘카카오페이 천원’ 2천·‘구두 만원’ 92만·‘이사 백만원’ 2,400만·‘만두 천원’ 1만2천.
// 띄어 쓴 단위 앞의 글자는 낱말 하나를 이루는 한 자리 수일 때만 수다(‘이 만원’·‘오 천원’). 낱말 속 글자(월세·식사), 수가 둘 이어진 말(오이·구두·이사), 수가 아닌 글자가 낀 말(나사·아이)은 낱말이고
// 금액은 단위부터다. 앞말에 단위가 있으면(‘이십 만원’·‘십이 만원’) 만·억 앞의 수만 잇는다(‘만두 천원’·‘만두 만원’은 낱말). 붙여 쓴 꼴에서 수가 이어진 말은 뜻이 갈려(오이천원·삼사만원) 금액으로 읽지 않는다.
// 낱말 속에 붙은 한 자리(‘커피오천원’)는 예전처럼 읽되, 고유어 수(세·두·네)와 자주 쓰는 낱말의 끝 글자(식사만원·친구만원)는 수가 아니다. 낱말에 붙은 단위는 예전처럼 금액으로 읽지 않아 다시 묻는다.
// 값이 뒤따르는 ‘백’(가방)·‘천’(옷감)은 낱말이다(‘명품 백 300만원’ 이 100원 + 300만원 두 건, ‘구두 백 3만원’ 이 92,030,000원이었다). ‘이삼 만원’ 처럼 범위를 말한 꼴은 값을 정할 수 없어 읽지 않는다.
// 단위 뒤에 숫자가 바로 오는 꼴(‘만5천원’·‘천5백원’)도 한 금액이다(‘택시 만5천원’ 이 5,000원, 메모 ‘택시 만’ 이었다).
// 슬래시 날짜 뒤에 띄어 쓴 단위가 와도 날짜다(‘7/3 만원’ 은 저장되지 않았다). 점 꼴은 날짜와 소수가 갈린다. 달력에 있는 날(‘10.31 만원’ 103,100원·‘7.3 천원’ 7,300원·‘1.25 만원’)은 짐작하지 않고 되묻고,
// 점 아래 한 자리 + 만·억(‘1.5 만원’)과 달력에 없는 수(‘2.55 만원’)와 붙여 쓴 단위(‘7.3천원’)는 소수다. 하이픈은 범위이기도 해서(‘3-4 만원’) 예전처럼 저장하지 않는다.
// 금액 묶음이 날짜·시각에 겹치면 묶음 전체를 버렸다(‘마트 2만 7월 3일 점심 5000’ 의 2만이 메모로 남아 한 건만 저장됐다). 겹친 쪽만 잘라 낸다.
// ‘3만5’·‘5천5’ 는 3만5천·5천5백이다(30,005원이 됐다). 띄어 쓴 뒤의 작은 수가 목록 번호이거나 뒤에 말이 이어지면(‘1만 2. 떡볶이’) 금액이 아니고, ‘5만 삼성카드’ 의 ‘삼’ 도 뒷말의 글자다. 단위 없는 수 글자 둘 이상도 뒷말이다(‘5만 오이’ 50,052원·‘3만 이사’ 30,024원이 됐다).
// 부호는 금액으로 확정된 말 앞에서만 본다(‘커피 4000 + 구두 5만원’ 의 ‘구두’ 가 부호 뒤 금액으로 보여 전체가 저장되지 않았다).
// V22.9.93 Q-66: 다른 금액이 있으면 ‘짜리’·‘어치’ 가 붙은 금액은 값이 아니다(‘상품권 10000원짜리 9000’ 이 두 건이었다). 혼자 있으면(‘주유 5만원어치’) 금액이다.
// V22.9.93 Q-74: 금액 뒤 낱말의 첫 글자를 단위로 읽어 ‘커피 5000 만두 3000’ 의 5,000원이 메모로 사라졌고 ‘5000 백반’·‘3만 만두’ 는 저장되지 않았다. 낱말이 이어지면 단위가 아니다. 조사·끝맺음이 이어지면(‘3만 오천이요’) 금액이라 되돌리지 않는다.
// V22.9.93 Q-75: ‘5000 월세’·‘4000 분식’ 도 첫 글자를 날짜·시각 단위로 읽어 같았다. 2020~2039 는 연도로 둔다(‘2026 월급 300만원’). 표에 있는 일상 품목과 요일 말만 풀어 준다. 뒤에 낱말이 이어지기만 하면 풀었더니 ‘토익 800 시험’·‘BMW 520 시승 3만원’·‘1990 년생 모임 3만원’ 의 번호가 없던 기록이 됐다.
// V22.9.93 Q-77: 떨어진 ‘원’ 뒤에 낱말이 이어지면 낱말의 첫 글자다(‘30000 원피스’ 의 메모가 ‘피스’ 였다).
// V22.9.93 Q-78: Q-66 이 ‘주유 5만원어치 커피 4000’·‘커피 4000 주유 5만원어치’ 의 금액을 말없이 없앴다. 다음 금액이 그 값일 때만 뺀다: 다음 금액까지 낱말이 없거나(‘상품권 10000원짜리 9000’), 앞에 낱말이 없고 사이 낱말이 하나이고 말이 다음 금액에서 끝날 때다(‘만원짜리 상품권 9000’·‘3만원짜리 옷 2만원에 샀어’). 사이 낱말이 둘이거나(‘5만원어치 주유 커피 4000’) 다음 금액 뒤에 낱말이 있으면(‘5000원짜리 라면 4000원 김밥’) 다른 물건이다. 마지막 금액과, 다음 금액도 어치·짜리인 금액은 남긴다. 띄어 쓴 ‘30000 어치’ 도 금액이다.
// V22.9.93 Q-81: 원 없는 금액 뒤의 끝맺음은 금액으로 읽지 않는다(‘택시 5000이요’·‘택시 오천쯤’ 은 예전처럼 저장하지 않고 다시 묻는다). 두 번 넓혀 봤지만 ‘전세 3억에 이사비 80만원’·‘개당 1000에 3개 3000원’ 에 없는 기록이 생기고, ‘커피 4000이요 택시 8000이요’ 의 앞 금액이 사라지고, ‘제 키는 170입니다’·‘비밀번호 1234요’ 가 기록이 됐다. 글로는 가릴 수 없다. 이음말은 ‘이랑’ 까지 받는다(‘커피 4000이랑 택시 8000’).
// 숫자로 쓴 단위 뒤의 ‘이’ 는 2 가 아니라 조사다(‘택시 3만이 나왔어’·‘택시 3만이랑 커피 4000’ 이 30,002원이 됐다).
// 숫자 앞에 부호가 있으면 뒤가 어떤 말이든 계산식이나 범위라 줄 전체를 다시 묻는다(‘커피 4000+500에 샷추가’·‘아파트 101-302호 관리비 15만원’ 의 앞 수가 저장되면 안 된다). 영문 모델명의 ‘-’ 는 부호가 아니다(‘E-300에 주유 5만원’). 한글 수는 금액으로 확정된 뒤에 본다(‘커피 4000 + 구두 5만원’).
// Q-38 의 붙여 쓴 가격은 뒤 낱말이 일상 품목일 때만 읽는다(‘커피 5000점심 9000’). 그 밖의 낱말은 말을 잇는 말이나 단위라(‘정가 10000인데 7000원’·‘택시 5000환불 3000’·‘환전 1000파운드 180만원’·‘1200호실 3만원’) 앞 수가 값이 아니다.
// V22.9.93 Q-82: Q-52 가 ‘천’ 을 옷감으로 읽어 ‘버스 천 500원’ 이 500원이 됐다(메모 ‘버스 천’). 낱말 속이 아닌 ‘천’ 뒤의 세 자리 아래 수는 이어서 1,500원이다. 네 자리부터는 값이 따로다(‘커튼 천 5000원’). 수량 단위가 이어지는 ‘천’·‘백’ 은 수량이다(‘명함 천 장 3만원’·‘고양이 백 마리 사료 3만원’). 뒤의 세 자리 수에 수량 단위가 이어져도 잇지 않는다(‘종이 천 500 매 3000원’). 천 미만의 수가 뒤따르는데 잇지 못하면(‘버스 천 5백 냈어’·‘버스 천 500원에 탔어’·‘라면 백 5십 샀어’·‘보증금 천 5백만’) 옷감으로 읽어 앞 금액을 없애지 않고 줄 전체를 다시 묻는다.
// V22.9.93 Q-93: 앞 금액이 조용히 사라지거나 틀리는 꼴을 다시 묻는다(운영에도 있었다). 한글 수 + 원 뒤의 끝맺음(‘커피 오천원이고 택시 3만원’ 의 5,000원이 메모가 됐다), 억 뒤의 끝수(‘차 1억 2천’ 이 100,002,000원이 됐다, 뜻은 1억 2천만이다), 번호의 앞부분(‘5500-1번 버스 2800원’·‘123-45번지’).
// V22.9.93 Q-96 (독립 검토 6회차): 수량 표를 넓혀 ‘소주 4000 테라 5000’·‘맥주 5000 코인 노래방 3000’·‘회비 30000 미리 냄’ 의 금액이 말없이 사라졌다. 일상어이기도 한 단위(softCount)는 수량으로 뺄 수 없다. 혼자면 금액이고(운영과 같다) 다른 금액이 있으면 어느 쪽인지 몰라 줄 전체를 다시 묻는다(‘우유 500 미리 1800원’).
// Q-97: Q-74 가 ‘택시 3만 오천나옴’ 의 뒤 수를 낱말로 봐서 30,000원이 됐다. 뒤 말에 ‘오천’ 처럼 수 + 단위가 있으면 다시 묻는다(‘2000 천일염’ 은 낱말이다).
// Q-98: 단위 뒤의 숫자 + 단위를 한 덩이로 읽는 것은 뒤 단위가 작을 때뿐이다(‘만5천’·‘천5백’·‘십5만’). ‘커튼 천3만원’ 이 10,030,000원, ‘에코백3만원’ 이 저장 안 됨이었다. 낱말 속 단위는 낱말이고(‘인천5백원’), 낱말 밖 단위 뒤에 숫자가 붙으면(‘택시 만5000원’, 운영은 5,000원) 다시 묻는다.
// Q-99·Q-109·Q-116: 표 낱말(Q-75)로 풀어 준 수는 줄 맨 앞에 혼자이고 뒤에 낱말 하나뿐이고 네 자리 이상에 00 으로 끝날 때만 금액이다(‘5000 월세’). 그 밖은 운영처럼 뺀다(‘오피스텔 1204 월세 50만원’ 이 501,204원 두 건이었고 ‘1204 월세 냈음’ 이 기록이 됐다). 다른 금액과 함께 있는 00 끝 수는 번호인지 값인지 몰라 다시 묻는다(‘커피 4000 월세 5000’ 은 운영이 앞 금액을 잃었고, ‘상가 1000 월세 100만원’ 은 유령 기록이 된다). 단위 글자로 시작하는 낱말도 표(unitNoun)의 일상 품목만 낱말로 본다(‘2000 천일염’). 표에 없으면 운영처럼 읽는다(‘버스 1100 천호역 1500원’·‘토익 900 만점 목표 학원 30만원’ 의 앞 수가 기록이 됐다). 세 자리 수는 풀지 않고(‘100 백화점 쿠폰’), 뒤에 다른 금액이 있으면 앞 수가 00 이나 단위로 끝나고 표 낱말 바로 뒤가 금액일 때만 값이다(‘커피 5000 만두 3000’). 그 밖은 번호다(‘신발 250 백화점에서 5만원’·‘아파트 1500 백화점 근처 관리비 15만원’ 이 두 건이었다).
// Q-101: 문장 부호로 끝나도 ‘천’ 뒤의 작은 수다(‘버스 천 500.’ 의 1,000원이 사라졌다). 낱말을 잘라 낸 뒤 ‘백 5000원’ 이 남으면 다시 묻는다(‘종이 백 5000원’ 이 5,100원이었다).
// Q-108 (독립 검토 7회차): 점·하이픈 꼴 수 뒤의 ‘원…’ 낱말은 운영처럼 다시 묻는다(‘1.5 원룸 월세 50만원’ 이 1월 5일이 됐다). 슬래시 꼴만 날짜다(‘7/3 원피스 3만원’). Q-110·Q-117: 붙여 쓴 가격은 ‘낱말 + 00 끝 가격 + 표의 품목 + 금액’ 으로 줄이 끝날 때만 읽고(‘커피 5000점심 9000’), ‘이랑’ 앞 금액은 ‘낱말 + 금액 + 이랑 + 낱말 + 금액’ 으로 줄이 끝날 때만 읽는다(‘커피 4000이랑 택시 8000’). 그 밖은 운영처럼 뒤 금액만 읽는다(‘5500버스 2800원’ 이 8,300원 두 건이었고 ‘쿠폰 1000이랑 같이 썼어 커피 4000’ 의 쿠폰이 기록이 됐다). 앞 낱말과 ‘랑’·‘하고’ 는 Q-118: 붙여 쓴 가격의 앞 낱말은 일상 품목 표로 본다(‘편의점 1500커피 3000’ 의 1500 은 상품 이름이다). 할인·쿠폰 같은 앞 낱말의 수는 값이 아니고 술·음료 뒤의 수는 용량일 수 있다(‘쿠폰 3000 만두 5000’·‘맥주 1000 만두 8000’). ‘랑’·‘하고’ 앞 금액은 운영 그대로 읽는다(‘어제 커피 4000하고 택시 8000’). Q-119: 뒤 말을 잘라 단위 금액을 살린 뒤에 다른 금액이 있으면 앞 수가 원금·단가일 수 있어 다시 묻는다(‘대출 1억 이자 30만원’·‘커피 4천 2잔 8천’·‘회비 3만 4명 12만원’). ‘1차 5만 2차 3만’ 과 ‘7월 3일’ 은 뒤가 값이다. Q-111: 단위 글자 뒤의 숫자에 금액 끝이 이어질 때만 다시 묻는다(‘만1세 예방접종 3만원’·‘백1호 월세 30만원’ 은 운영처럼 뒤 금액이다).
// Q-103: 어치 금액 바로 뒤 금액에 낱말이 이어지면 다시 묻는다(‘주유 5만원어치 3000원 세차’ 의 앞 금액이 사라졌다). 원 끝맺음 되묻기는 단위가 있는 수만 본다(‘한강공원인데 치킨 2만원’ 이 저장되지 않았다). 끝수가 떨어져 있고 낱말이 이어지면 다시 묻는다(‘택시 3만 5 현금’).
function moneyTokenSpans(text = "") {
  const digitWord = /하나|다섯|여섯|일곱|여덟|아홉|[일이삼사오육칠팔구영공한두세네둘셋넷]/g;
  const endingAfter = /^(?:짜리|어치|씩|랑|하고|으로|로|에|을|를|은|는|이|가|만|도|이요|요|임|입니다|이에요|예요|정도|쯤|가량|넘게|이상|이하|밖에|뿐|만큼|이나|나)(?=\s|$)/;
  const priceNoun = /^(?:월(?:세|급|회비|정액|요일)|분(?:식|유)|시(?:장|계|금치|리얼|외|내)|일(?:식|본|반|기장|회용|당|요일|주일)|명(?:함|품|절|란|태))/;
  const countWord = /^\s*(?:구|개|명|알|정|봉|봉지|묶음|대|벌|컵|매|팩|세트|마리|병|권|장|켤레|인분|인치|기가|케이스|박스|상자|캔|잔|판|줄|포|통|근|포기|송이|쌍|다발|봉투|포대|롤|조각|접시|그릇|개입|리터|킬로|그램|밀리|시간|퍼센트|kg|g|ml)(?=\s|$)/i;
  const unitNoun = /^(?:만두|만둣국|만화|만년필|백반|백숙|백미|백화점|백설기|백팩|백신|백김치|천일염|천안|천도복숭아|천혜향|십자수)/;
  const laterMoney = /\d{3,}|\d[\d,.]*\s*[십백천만억원]|[일이삼사오육칠팔구십백천만억]\s*원|[일이삼사오육칠팔구][천만억]/;
  const nextPrice = /^[가-힣A-Za-z]*\s+(?:\d[\d,.]*|[일이삼사오육칠팔구십백천만억]+)[십백천만억원]*(?:\s|$)/;
  const notPriceHead = /(?:할인|정가|원가|정상가|판매가|쿠폰|포인트|적립|상품권|마일리지|캐시백|세일|잔액|한도|맥주|생맥|소주|콜라|사이다|우유|막걸리|와인)\s*$/;
  const softCount = /^\s*(?:미리|피스|달러|유로|위안|포인트|마일리지|마일|키로|미터|센치|센티|프로|메가|테라|코인|칼로리)(?=\s|$)/;
  const source = String(text || "").replace(/[０-９，．：／－＋％（）]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/[₩￦]/g, "원");
  if (/\d+,\d{1,2}(?!\d)/.test(source)) return [];
  const unsure = [], rescued = [];
  const excluded = [...source.matchAll(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b|\b20\d{6}\b|\b20\d{2}[./-]\d{1,2}[./-]\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b(?![억만천백십원])|\b\d{1,2}[.-]\d{1,2}\b(?![억만천백십원]|\s+(?:[억만천백십]+(?:\s|$|원)|원(?!\d)))|\b\d{1,2}:\d{2}(?::\d{2})?\b|\(\s*\d{2,4}\s*\)|\d{2,4}(?:[-\s]?[*＊xX]{2,})+(?:[-\s]?\d{2,4})?|[*＊xX]{2,}[-\s]?\d{2,4}|(?:끝자리|끝번호|뒷자리|뒷번호)\s*\d{2,4}|(?:누적|잔액|잔고|남은\s*한도|한도)\s*:?\s*[\d,]+\s*원?|\d+(?:\.\d+)?\s*(?:%|퍼센트|명|시|분|일|월|년|번)|\b\d\s?\+\s?\d\b/g)].filter(m => {
    const free = /^(?!20[23]\d\s)\d{3,}\s+\S$/.test(m[0]) && priceNoun.test(source.slice(m.index + m[0].length - 1));
    if (free && !/^(?:[월일]요일|일주일\s*전)\s*(?:[,;\n]|$)/.test(source.slice(m.index + m[0].length - 1))) rescued.push(m.index + m[0].search(/\s/));
    return !free;
  }).map(m => [m.index, m.index + m[0].length]);
  const pattern = /(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|[일이삼사오육칠팔구십백천만억]*(?:억\d+(?=[십백천만])|만\d+(?=[십백천])|천\d+(?=[십백])|백\d+(?=십)|십\d+(?=[만억]))|[일이삼사오육칠팔구영공한두세네다섯여섯일곱여덟아홉하나둘셋넷십백천만억]+)(?:\s*[십백천만억]\s*(?:\d+(?:\.\d+)?|[일이삼사오육칠팔구영공십백천만억]+)?)*\s*원?/g;
  const result = [];
  let skipTo = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index < skipTo) continue;
    let start = match.index, end = start + match[0].trimEnd().length;
    const overlap = excluded.find(([a, b]) => start < b && end > a);
    if (overlap) {
      const after = source.slice(overlap[1], end), kept = source.slice(start, overlap[0]).trimEnd();
      if (overlap[0] <= start && /^\s+[십백천만억]/.test(after)) start = overlap[1] + after.search(/\S/);
      else if (overlap[0] > start && /[십백천만억원]$/.test(kept)) {
        if (laterMoney.test(source.slice(overlap[1])) && !/^\d{1,2}월\s*\d{1,2}일/.test(source.slice(overlap[0]))) return [];
        end = start + kept.length;
      }
      else continue;
      if (excluded.some(([a, b]) => start < b && end > a)) continue;
    }
    if (/^\d/.test(source.slice(start, end)) && /(?:^|[^A-Za-z])[+\-\u2212\uFE63\uFF0D\uFF0B]\s*(?:원\s*)?$/.test(source.slice(0, start))) return [];
    if (/^[일이삼사오육칠팔구십백천만억]*[십백천만억]$/.test(source.slice(start, end)) && /^\d[\d,]*(?:[\s.]|$|원|[십백천만억])/.test(source.slice(end)) && !/[가-힣A-Za-z\d,.]/.test(source[start - 1] || "")) return [];
    if (/[A-Za-z\d,.]/.test(source[start - 1] || "") || /[A-Za-z\d]/.test(source[end] || "") || /^(?:,,|,\d|\.\d)/.test(source.slice(end))) continue;
    if (/^\d[\d,]*$/.test(source.slice(start, end)) && /^-\d/.test(source.slice(end))) return [];
    let raw = source.slice(start, end).trim();
    if (/^(?:0?[1-9]|1[0-2])\.(?:[1-9]\s+[십백천]|(?:0[1-9]|[12]\d|3[01])\s+[십백천만억])/.test(raw)) continue;
    const inWord = /[가-힣]/.test(source[start - 1] || "");
    if (inWord && /^[십백천만억]\d/.test(raw)) { start += 1; raw = raw.slice(1); }
    const spaced = /^([가-힣]+)\s+(?=[십백천만억])/.exec(raw);
    if (spaced) {
      const word = spaced[1], rest = raw.slice(spaced[0].length), hasUnit = /[십백천만억]/.test(word);
      if (/^(?:일이|이삼|삼사|사오|오육|육칠|칠팔|팔구)$/.test(word)) continue;
      const number = /^[십백천만억]*$/.test(word.replace(digitWord, "")) && (hasUnit ? /[십백천만억]$/.test(word) || (/^[만억]/.test(rest) && !/[만억]/.test(word) && !/^(?:천사|백일)$/.test(word)) : !inWord && word.match(digitWord).length === 1);
      if (!number) { start += spaced[0].length; raw = rest; }
    } else {
      const head = /^[^\d\s십백천만억]+(?=[십백천만억])/.exec(raw)?.[0] || "";
      const digits = head.match(digitWord) || [], last = digits[digits.length - 1] || "";
      if (head && head !== last) {
        if (!inWord || !last || !head.endsWith(last)) continue;
        start += head.length - last.length;
        raw = raw.slice(head.length - last.length);
      }
      if (head && inWord) {
        const stem = source.slice(0, start).trim().split(/\s+/).pop() || "";
        if (/^(?:한|두|세|네|둘|셋|넷)/.test(raw) || /(?:식사|회사|이사|감사|복사|공사|행사|나사|의사|약사|기사|교사|페이|아이|나이|놀이|종이|오이|길이|생일|과일|오일|메일|세일|휴일|친구|가구|문구|완구|축구|야구|농구|교육|체육|제육|수육|인삼|홍삼|오디오|비디오|라디오|수영)$/.test(stem + last)) {
          start += last.length;
          raw = raw.slice(last.length);
        }
      }
    }
    if (/^[백천]\s+\d+[십백]/.test(raw)) return [];
    const bagWord = /^[백천]\s+(?=\d.*[만억])/.exec(raw);
    if (bagWord) { start += bagWord[0].length; raw = raw.slice(bagWord[0].length); }
    if (/^[백천]\s+\d/.test(raw) && !countWord.test(source.slice(end))) return [];
    if (/^[백천]$/.test(raw) && /^\s*(?:\d|[일이삼사오육칠팔구십백천만억]+\s*원)/.test(source.slice(end))) {
      const hundreds = raw === "천" && !inWord ? /^\s*(?:\d{3}(?:\s*원)?|\d{1,2}\s*원)(?=\s|$)/.exec(source.slice(end)) : null;
      if (!hundreds || countWord.test(source.slice(end + hundreds[0].length))) {
        const small = /^\s*(?:\d{1,3}(?![\d천만억]|[,.]\d)|\d[십백]|[일이삼사오육칠팔구십백]+\s*원)/.exec(source.slice(end));
        if (small && !inWord && !countWord.test(source.slice(end + small[0].length))) return [];
        continue;
      }
      end += hundreds[0].length;
      raw = source.slice(start, end);
      skipTo = end;
    }
    const looseTail = /^(.*[십백천만억])\s+(?:(\d{1,2}(?:[./]\d{1,2})?|[일이삼사오육칠팔구영공])|[일이삼사오육칠팔구영공]{2,})$/.exec(raw);
    if (looseTail && (!looseTail[2] || /^(?:[.)]|\s*[가-힣])/.test(source.slice(end)))) {
      if (looseTail[2] && /^\d/.test(looseTail[2]) && /^\s+[가-힣]/.test(source.slice(end)) && !countWord.test(source.slice(end))) return [];
      if (!/^[백천]$/.test(looseTail[1]) && laterMoney.test(source.slice(end)) && !/^차\s/.test(source.slice(end))) return [];
      raw = looseTail[1];
      end = start + raw.length;
      if (/^[백천]$/.test(raw)) continue;
    }
    const nounAfter = /^(\d{3,}|\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?[십백천만억]+)\s+([일이삼사오육칠팔구영공십백천만억]+)$/.exec(raw);
    if (nounAfter && /[가-힣]/.test(source[end] || "") && !endingAfter.test(source.slice(end)) && !endingAfter.test(raw.slice(-1) + source.slice(end)) && (!/^[십백천만억]/.test(nounAfter[2]) || (!/^\d{3}$/.test(nounAfter[1]) && unitNoun.test(source.slice(end - nounAfter[2].length)) && (!laterMoney.test(source.slice(end)) || (/(?:00|[십백천만억])$/.test(nounAfter[1]) && nextPrice.test(source.slice(end)) && !notPriceHead.test(source.slice(0, start))))))) {
      if (/[일이삼사오육칠팔구][십백천만억]/.test(nounAfter[2])) return [];
      raw = nounAfter[1];
      end = start + raw.length;
    }
    const wonWord = /^(.*\S)\s+원$/.exec(raw);
    if (wonWord && /[가-힣]/.test(source[end] || "") && !endingAfter.test(source.slice(end))) { raw = wonWord[1]; end = start + raw.length; }
    if (/\d/.test(raw) && /[십백천만억]이$/.test(raw) && /^랑\s/.test(source.slice(end))) { raw = raw.slice(0, -1); end -= 1; }
    // Words such as 만두 and 천원샵 are not Korean money expressions.
    if (!/\d/.test(raw) && !/원$|[십백천만억]$/.test(raw)) continue;
    if (!/\d/.test(raw) && /[가-힣]/.test(source[end] || "") && !/^(?:짜리|어치|씩|랑|하고|으로|에|을|를|은|는|이|가|만|도)(?=\s|$)/.test(source.slice(end))) {
      if (/[십백천만억]\s*원$/.test(raw) && /^(?:이고요?|이며|이요|요|과|와|쯤|정도|가량|입니다|임|이에요|예요|에요|이라서?|인데|이었고|이었어|이네|이구|이지만|이면)(?=\s|$)/.test(source.slice(end))) return [];
      continue;
    }
    // Unitless quantities and product model numbers must not create extra transactions.
    if (/^(?:\d+|[백천](?:\s+\d{1,3})?)$/.test(raw) && (countWord.test(source.slice(end)) || /(?:아이폰|갤럭시|모델)\s*$/.test(source.slice(0, start)))) continue;
    if (/^(?:\d+|[백천](?:\s+\d{1,3})?)$/.test(raw) && softCount.test(source.slice(end))) unsure.push(start);
    if (/[가-힣]/.test(source[start-1] || "") && /^[일이삼사오육칠팔구영공한두세네십백천만억]/.test(raw)) {
      const stem = source.slice(0,start).trim().split(/\s+/).pop() || "";
      const amountStem = /^(?:수입|지출|입금|결제|급여|월급|판매|용돈|세뱃돈|수당|이자|캐시백|월세수입)$/;
      if (!amountStem.test(stem) && !( /원/.test(raw) && /^[일이삼사오육칠팔구한두세네]/.test(raw))) continue;
    }
    if (/^\d{1,3}$/.test(raw) && /[가-힣]/.test(source[start-1] || "")) continue;
    const itemHead = /^\s*(?!오늘|어제|그제|그저께)[가-힣A-Za-z]+\s*$/.test(source.slice(0, start)) && !notPriceHead.test(source.slice(0, start));
    const gluedPrice = /^\d[\d,]*00$/.test(raw) && raw.replace(/,/g, "").length >= 4 && /^\s*(?:아침|점심|저녁|야식|간식|커피|택시|지하철|주유|주차|배달|치킨|피자|담배)(?:값|비)?\s*$/.test(source.slice(0, start)) && /^(?:아침|점심|저녁|야식|간식|커피|택시|지하철|주유|주차|마트|편의점|배달|치킨|피자|맥주|담배)(?:값|비)?\s*\d[\d,]*\s*원?\s*$/.test(source.slice(end));
    const linkedPrice = itemHead && /^(?:\d[\d,]*\d00|\d+(?:\.\d+)?[천만억])$/.test(raw) && /^이랑\s+[가-힣A-Za-z]+\s+\d[\d,]*\s*원?\s*$/.test(source.slice(end));
    if (!gluedPrice && !linkedPrice && !/원/.test(raw) && /[가-힣]/.test(source[end] || "") && !/^(?:랑|하고)(?=\s)/.test(source.slice(end))) continue;
    if (!/[\d]/.test(raw) && !/[십백천만억]/.test(raw)) continue;
    if (!gluedPrice && !linkedPrice && !/[원십백천만억]/.test(raw) && /[가-힣A-Za-z]/.test(source[end] || "") && !/^(?:랑|하고)(?=\s)/.test(source.slice(end))) continue;
    if (/[+\-\u2212\uFE63\uFF0D\uFF0B]\s*(?:원\s*)?$/.test(source.slice(0, start))) return [];
    const shortened = /^[\d.,]+([억만천])\s*\d$/.exec(raw)?.[1];
    const body = (raw.replace(/(\d[십백천만억])이$/, "$1") + ({ 억: "천만", 만: "천", 천: "백" }[shortened] || "")).replace(/[\s,원]/g, "").replace(/하나|한/g, "일").replace(/둘|두/g, "이").replace(/셋|세/g, "삼").replace(/넷|네/g, "사").replace(/다섯/g, "오").replace(/여섯/g, "육").replace(/일곱/g, "칠").replace(/여덟/g, "팔").replace(/아홉/g, "구");
    const digit = {영:0,공:0,일:1,이:2,삼:3,사:4,오:5,육:6,칠:7,팔:8,구:9};
    const tokens = body.match(/\d+(?:\.\d+)?|[영공일이삼사오육칠팔구]|[십백천만억]/g) || [];
    const places = Math.max(0, ...tokens.map(token => (token.split(".")[1] || "").length));
    const scale = 10n ** BigInt(places);
    const units = value => {
      const [whole, fraction = ""] = String(value).split(".");
      return BigInt(whole || "0") * scale + BigInt(fraction.padEnd(places, "0") || "0");
    };
    let sum = 0n, section = 0n, number = "", sectionSpecified = false, lastBig = "";
    for (const token of tokens) {
      if (/^[\d.]+$/.test(token)) number += token;
      else if (token in digit) number += digit[token];
      else if (token === "만" || token === "억") {
        const specified = sectionSpecified || number !== "";
        section += units(number || "0");
        sum += (specified ? section : scale) * (token === "억" ? 100000000n : 10000n);
        section = 0n; number = ""; sectionSpecified = false; lastBig = token;
      }
      else { section += units(number || "1") * ({십:10n,백:100n,천:1000n}[token]); number = ""; sectionSpecified = true; }
    }
    const total = sum + section + units(number || "0");
    if (total % scale !== 0n || (lastBig === "억" && (section || number))) return [];
    const amount = Number(total / scale);
    if (Number.isSafeInteger(amount) && amount > 0) result.push({start, end: start + raw.length, raw, amount});
  }
  const priceTail = (span) => /^\s*(?:짜리|어치)(?:를|을|는|은|가|이|로)?(?=\s|$)/.exec(source.slice(span.end));
  const priceEnd = /^\s*(?:에|으로|로|주고)?\s*(?:샀\S*|삼|구입\S*|구매\S*|결제\S*|냈\S*|줬\S*|지불\S*)?\s*$/;
  const wordsIn = (from, to) => source.slice(from, to).split(/\s+/).filter((word) => /[가-힣A-Za-z]/.test(word)).length;
  const freed = (span) => rescued.some((at) => span.start < at && at <= span.end);
  if (result.length > 1 && result.some((span) => unsure.includes(span.start) || (freed(span) && span.amount % 100 === 0))) return [];
  const spans = result.filter((span) => !freed(span) || (result.length === 1 && span.amount >= 1000 && span.amount % 100 === 0 && !/\S/.test(source.slice(0, span.start)) && /^\s*\S+\s*$/.test(source.slice(span.end))));
  let lostPrice = false;
  const kept = spans.filter((span, i) => {
    const tail = priceTail(span), next = spans[i + 1];
    if (!tail || !next || priceTail(next)) return true;
    const between = wordsIn(span.end + tail[0].length, next.start);
    if (!between && !priceEnd.test(source.slice(next.end))) lostPrice = true;
    return between > 1 || (between === 1 && (wordsIn(i ? spans[i - 1].end : 0, span.start) > 0 || !priceEnd.test(source.slice(next.end))));
  });
  return lostPrice ? [] : kept;
}

// V22.9.34 감사 D2: "부모님 용돈 30만원", "조카 세뱃돈", "용돈 드림"처럼 주는 대상이나 주는 말이 붙은 용돈·세뱃돈은
// 지출이다. 아무 말 없는 "용돈 30000"은 V22.9.30 결정대로 수입으로 둔다. 받는 말은 먼저 보므로 "엄마한테 용돈 받음"은
// 수입이다. 수수료·중개료·배송비는 "판매 수수료"여도 지출이다.
// V22.9.76 카카오 감사 1: "부모님께 용돈 30만원"·"엄마에게 용돈"·"아이한테 용돈"처럼 주는 대상 뒤에 조사가 붙거나
// "용돈 보내드림"이면 수입으로 저장됐고, "이자 납부 30만원"·"이자 출금"도 수입이었다. 문장에 "지출"이라고 적은
// "부모님께 용돈 30만원 지출"마저 수입이었다. 이제 사용자가 적은 구분 낱말(수입·지출) 하나를 가장 먼저 따르고,
// 주는 대상+조사(께·에게·한테, "께서·한테서"는 받는 말이라 제외)·보내드림·드렸·이자 납부/출금/냄/이체는 지출이다.
// 세 번째 인자 { detail: true } 를 주면 { type, ambiguous } 를 돌려준다. 수입 낱말로 수입이 됐는데 쓰는 말(결제·구매·
// 샀·썼·냈·납부·출금·송금)도 함께 있거나 수입·지출을 둘 다 적었으면 ambiguous 다 — 카카오 기록은 저장하지 않고
// 수입인지 지출인지 묻는다. 화면 빠른입력은 두 인자로 불러 문자열을 받는다. 본문이 화면 자산에 그대로 실리므로
// 이 함수는 밖의 함수를 부르지 않는다.
// V22.9.76 리드: "엄마가 용돈 줬어"처럼 가족이 주는 쪽(이·가·께서)이면 받은 돈이라 수입이다. 예전에는 "용돈 줬"만 보고 지출이었다.
// "내가 용돈 줬어"·"엄마한테 용돈 줬어"는 그대로 지출이다. 화면 자산에도 실리므로 뒤돌아보기(lookbehind) 정규식은 쓰지 않는다.
// 같은 날 리드 조정: "수당 지급 30만원"·"급여 지급"·"보너스 지급"은 받는 쪽에서 흔히 쓰는 말이라 '지급'은 묻는 조건에서 뺐다
// (용돈·세뱃돈 지급은 위의 주는 말로 지출이다).
function transactionTypeFromText(text = "", rules = [], options = {}) {
  const raw = String(text || "").trim();
  const saysIncome = /(?:^|\s)수입(?=\s|\d|$)/.test(raw), saysExpense = /(?:^|\s)지출(?=\s|\d|$)/.test(raw);
  const result = (type, ambiguous = false) => (options && options.detail ? { type, ambiguous: ambiguous || (saysIncome && saysExpense) } : type);
  if (saysIncome !== saysExpense) return result(saysIncome ? "income" : "expense");
  if (/(?:^|\s)환불\s*(?:수수료|배송비)/.test(raw)) return result("expense");
  if (/(?:^|\s)환불(?:\s*(?:완료|됨|금|처리|입금))?(?=\s|\d|$)|(?:^|\s)반품(?=\s|\d|$)|환급|돌려받/.test(raw)) return result("income");
  if (/(?:적금|예금|저축|투자)\s*(?:입금|이체|납입|송금)/.test(raw)) return result("expense");
  const receives = /(?:받음|받았|들어옴|들어온)|(?:돈|급여|월급|용돈|수당|정산금|대금)\s*(?:받은|받기)|받은\s*(?:돈|급여|월급|용돈|수당|정산금|대금)|(?:부모님|엄마|아빠|어머니|아버지|어머님|아버님|할머니|할아버지|이모|고모|삼촌|큰아빠|작은아빠|큰엄마|작은엄마|형|누나|언니|오빠|동생|친척|장모님|장인어른|시어머니|시아버지|남편|아내|와이프|신랑)\s*(?:이|가|께서)\s+(?:용돈|세뱃돈)\s*(?:을|를)?\s*(?:주셨|줬|줌|준|주었|보내\s*주셨|보내\s*줬|보내\s*줌)/.test(raw);
  const gives = /(?:용돈|세뱃돈)\s*(?:을|를)?\s*(?:지급|송금|이체|줌|줬|준|주었|드림|드렸|드린|드려|보냄|보냈|보내\s*드)|(?:부모님|엄마|아빠|어머니|아버지|어머님|아버님|장모님|장인어른|장인|시어머니|시아버지|할머니|할아버지|조카|아이|애들|아들|딸|자녀|손주|손자|손녀|동생|남편|아내|와이프|배우자)(?:께|에게|한테)?(?!서)\s*(?:용돈|세뱃돈)/.test(raw);
  if (gives && !receives) return result("expense");
  if (receives) return result("income");
  if (/(?:대출|카드|할부|연체)\s*이자|무이자|(?:^|\s)이자\s*(?:을|를)?\s*(?:납부|출금|냄|냈|낸|이체|납입|상환)/.test(raw)) return result("expense");
  if (/(?:수수료|중개료|배송비)/.test(raw)) return result("expense");
  let incomeWord = /(?:^|\s)(?:수입|입금|급여|월급|매출|판매|중고\s*판매|세뱃돈|상여|보너스|배당|이자수입|이자|용돈수입|용돈|수당|캐시백|월세수입)(?=\s|\d|[일이삼사오육칠팔구십백천만억]|$)/.test(raw);
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (incomeWord) break;
    if (rule.type !== "income") continue;
    if ((rule.words || []).some(word => new RegExp("(?:^|\\s)" + String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s|\\d|$)").test(raw))) incomeWord = true;
  }
  if (incomeWord) return result("income", /(?:결제|구매|샀|썼|씀|냈|냄|납부|출금|송금)/.test(raw));
  return result("expense");
}

// 함수 본문은 그대로 브라우저 자산에 실리므로 설명은 여기 둔다. 마지막의 요일 표현(QA B04)은 명시 날짜보다
// 뒤에 본다. 주는 월요일에 시작하고, 주 단위 말이 없으면 오늘을 포함해 가장 가까운 지난 그 요일이다.
// V22.9.78(V77 N-12, 운영자 결정 2026-10-23): 주 없이 ‘지난·저번 금요일’로 쓰면 오늘을 뺀 바로 앞의 그 요일이다
// (금요일에 쓴 ‘지난 금요일’은 7일 전). 요일만 쓴 ‘금요일’은 예전처럼 오늘을 포함한다.
// 카카오 resolveWeekdayPhrase 와 같은 규칙이며 validate-qa-fixes-v22933·validate-nlu-weekday-v22978 이 둘을 대조한다.
// V22.9.34 감사 N6·D8·D4: 엊그제·그끄저께, "일주일/이틀/한 달 전" 같은 말, "지난달 말일", "작년 12월 25일"을 읽는다.
// 연도 없는 "12월 25일"·"12/25"는 올해 날짜가 오늘보다 반년(183일) 넘게 뒤면 작년으로 본다(1월에 적는 지난 연말 기록).
// 반년 안쪽의 앞날은 예전처럼 올해다.
// 서버 extractDate 도 이 함수를 먼저 쓰므로 웹과 카카오가 같은 날로 읽는다.
// V22.9.76 감사 A-12: 달 없이 일만 쓴 날("31일 송년회")이 오늘보다 뒤면, 이번 달의 그날과 그날이 있었던 가장 가까운 지난달의
// 그날 중 오늘에 더 가까운 날로 본다(같으면 지난달). 2027-01-01 의 "31일"은 2026-12-31(예전에는 2027-01-31 앞날),
// 10월 2일의 "30일"은 9월 30일, 10월 20일의 "25일 월세"는 미리 적는 10월 25일이다. 오늘까지의 날은 예전처럼 이번 달이다.
// V22.9.81: ‘지지난달·저저번달 25일/말일’은 두 달 전이다(예전에는 안의 ‘지난달’을 읽어 지난달, 메모는 ‘지 커피’). 요일 앞의
// ‘지지난주·저저번주’는 월요일에 시작하는 두 주 전의 그 요일, 주 없이 쓴 ‘지지난·저저번’은 ‘지난 금요일’(오늘을 뺀 바로 앞) 한 주 더 앞,
// ‘지난번’은 ‘지난’, ‘이번 금요일’은 ‘이번주 금요일’, ‘다음·오는(돌아오는·다가오는) 금요일’은 오늘을 뺀 바로 다음 그 요일이다
// (예전에는 넷 다 ‘금요일’로 보아 가장 가까운 지난 금요일). 앞날이 되면 ‘내일’·‘다음주 금요일’처럼 그 날 그대로다(미리 적는 기록).
// V22.9.93 Q-52: ‘일’ 이나 슬래시가 있으면 뒤에 띄어 쓴 단위가 와도 날짜다(‘6월 3일 만원’ 을 ‘3일’ 로 읽어 이번 달이 되고, ‘6월3일 만원’ 은 저장되지 않고, ‘7/3 만원’ 은 오늘이 됐다).
// 뒷말이 단위 글자로 시작할 뿐이면 날짜다(‘7.3 백화점 5만원’ 이 오늘이 됐다). ‘₩4000’ 은 입구에서 ‘원4000’ 이 되므로 뒤에 숫자가 오는 ‘원’ 은 단위가 아니다(‘6. 3 ₩4000’ 이 이번 달 3일이 됐다). Q-100: 뒤에 글자가 오는 ‘원’ 도 낱말이다(‘7/3 원피스 3만원’ 의 날짜가 사라졌다).
function quickInputDate(text = "", today = "") {
  const parts = (today || new Date(Date.now() + 32400000).toISOString().slice(0, 10)).split("-").map(Number);
  const now = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const valid = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return y >= 2000 && y <= 2099 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : ""; };
  const monthStart = (offset) => new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
  const lastDay = (dt) => new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const raw = String(text || "");
  let m = raw.match(/(?:^|\s)(그끄저께|그끄제|엊그저께|엊그제|그저께|그제|어젯밤|엊저녁|어제|전날|오늘|금일|지금|방금|내일|모레)(?=(?:아침|점심|저녁|밤|새벽|오전|오후)?(?:\s|$))/);
  if (m) { now.setUTCDate(now.getUTCDate() + ({그끄저께:-3,그끄제:-3,엊그저께:-2,엊그제:-2,그저께:-2,그제:-2,어젯밤:-1,엊저녁:-1,어제:-1,전날:-1,내일:1,모레:2}[m[1]] || 0)); return now.toISOString().slice(0, 10); }
  m = raw.match(/(?:^|\s)(하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*(전|후)(?=\s|$)/);
  if (m) { now.setUTCDate(now.getUTCDate() + ({하루:1,이틀:2,사흘:3,나흘:4,닷새:5,엿새:6,이레:7,열흘:10,보름:15}[m[1]]) * (m[2] === "전" ? -1 : 1)); return valid(now.getUTCFullYear(),now.getUTCMonth()+1,now.getUTCDate()); }
  m = raw.match(/(?:^|\s)(\d{1,2}|한|두|세|네|일|이|삼|사)\s*(일|주일|주|달|개월)\s*(전|후)(?=\s|$)/);
  if (m) {
    const count = /^\d+$/.test(m[1]) ? Number(m[1]) : {한:1,두:2,세:3,네:4,일:1,이:2,삼:3,사:4}[m[1]];
    const sign = m[3] === "전" ? -1 : 1;
    if (m[2] === "달" || m[2] === "개월") { const dt = monthStart(count * sign); return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, Math.min(parts[2], lastDay(dt))); }
    now.setUTCDate(now.getUTCDate() + count * (m[2] === "일" ? 1 : 7) * sign);
    return valid(now.getUTCFullYear(),now.getUTCMonth()+1,now.getUTCDate());
  }
  m = raw.match(/(?:(지지난\s*달|저저번\s*달|지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*)?말일/);
  if (m) { const dt = monthStart(/지지난|저저번/.test(m[0]) ? -2 : /지난|저번/.test(m[0]) ? -1 : /다음|담달/.test(m[0]) ? 1 : 0); return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, lastDay(dt)); }
  m = raw.match(/(?:지지난\s*달|저저번\s*달|지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*(\d{1,2})\s*일?/);
  if (m) { const dt = monthStart(/지지난|저저번/.test(m[0]) ? -2 : /지난|저번/.test(m[0]) ? -1 : /다음|담달/.test(m[0]) ? 1 : 0); return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, Number(m[1])); }
  m = raw.match(/(?:^|\s)(20\d{2})(\d{2})(\d{2})(?=\s|$)/);
  if (m) return valid(Number(m[1]),Number(m[2]),Number(m[3]));
  m = raw.match(/(?:^|\s)(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = raw.match(/(?:^|\s)(재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*(\d{1,2})\s*(?:월\s*|[./])(\d{1,2})\s*일?(?=\s|$|[.,!?])/);
  if (m) return valid(parts[0] + ({재작년:-2,작년:-1,지난해:-1,올해:0,금년:0,내년:1,다음해:1}[m[1].replace(/\s+/g, "")] || 0), Number(m[2]), Number(m[3]));
  m = raw.match(/(?:^|\s)(?!\d{1,2}(?:\s*월\s*|[.-])\d{1,2}\s+[억만천백십]+(?:\s|$|원))(\d{1,2})\s*(?:월\s*|[./-])(\d{1,2})\s*일?(?=\s|$|[.,!?])(?!\s*원(?![\d가-힣]))/);
  if (m) {
    const thisYear = valid(parts[0], Number(m[1]), Number(m[2]));
    if (thisYear && (Date.UTC(parts[0], Number(m[1]) - 1, Number(m[2])) - Date.UTC(parts[0], parts[1] - 1, parts[2])) / 86400000 > 183) return valid(parts[0] - 1, Number(m[1]), Number(m[2]));
    return thisYear;
  }
  m = raw.match(/(?:^|\s)(\d{1,2})일(?=\s|$)/);
  if (m) {
    const todayIso = now.toISOString().slice(0, 10);
    const current = valid(parts[0], parts[1], Number(m[1]));
    if (current && current <= todayIso) return current;
    let past = "";
    for (let back = 1; back <= 2 && !past; back += 1) {
      const monthIndex = parts[1] - 1 - back;
      past = valid(parts[0] + Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12 + 1, Number(m[1]));
    }
    if (!current || !past) return current || past;
    return Date.parse(todayIso) - Date.parse(past) <= Date.parse(current) - Date.parse(todayIso) ? past : current;
  }
  m = raw.match(/(?:(지지난\s*주|저저번\s*주|지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주|지지난번|지지난|저저번|지난번|지난|저번|이번|다음|(?:돌아|다가)?오는)\s*)?([월화수목금토일])요일/);
  if (!m) return "";
  const monday = (index) => (index + 6) % 7;
  const target = monday("일월화수목금토".indexOf(m[2])), current = monday(now.getUTCDay());
  const word = String(m[1] || "").replace(/\s+/g, "");
  const scope = word === "지난번" ? "지난" : word === "지지난번" ? "지지난" : /오는$/.test(word) ? "오는" : word;
  const back = (current - target + 7) % 7 || 7;
  const offset = scope === "이번주" || scope === "금주" || scope === "이번" ? target - current
    : scope === "다음주" || scope === "내주" ? target - current + 7
      : scope === "다음" || scope === "오는" ? (target - current + 7) % 7 || 7
        : scope === "지난" || scope === "저번" ? -back
          : scope === "지지난" || scope === "저저번" ? -back - 7
            : scope === "지지난주" || scope === "저저번주" ? target - current - 14
              : scope ? target - current - 7
                : -((current - target + 7) % 7);
  now.setUTCDate(now.getUTCDate() + offset);
  return valid(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

// V22.9.93 Q-46: ‘콜라 1.5L 2500’·‘주차 1.5시간 3000’ 의 소수를 날짜로 보고 ‘달력에 없는 날짜’ 라며 저장을 막았다. 바로 뒤에 단위가 붙으면 날짜 말이 아니다.
function explicitDateIntent(text = "") {
  const raw = String(text || "");
  if (/(?:^|\s)(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*(?:전|후)(?=\s|$)/.test(raw)) return true;
  if (/(?:^|\s)(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*(?:전|후)(?=\s|$)/.test(raw)) return true;
  if (/[월화수목금토일]요일/.test(raw)) return true;
  if (/말일/.test(raw)) return true;
  if (/(?:^|\s)(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*\d{1,2}\s*(?:월|[./-])/.test(raw)) return true;
  return /(?:^|\s)(?:그끄저께|그끄제|엊그저께|엊그제|그저께|그제|어젯밤|엊저녁|어제|전날|오늘|금일|지금|방금|내일|모레)(?=(?:아침|점심|저녁|밤|새벽|오전|오후)?(?:\s|$))|(?:지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*\d{1,2}|(?:^|\s)20\d{2}(?:[.\-/년]\s*\d{1,2}|\d{4}(?=\s|$))|(?:^|\s)\d{1,2}\s*월\s*\d{1,2}|(?:^|\s)(?!\d{1,2}[.-]\d{1,2}\s+[억만천백십]+(?:\s|$|원))\d{1,2}[./-]\d{1,2}(?!\d|\s*원(?!\d)|[억만천백십]|[A-Za-z]|인치|리터|인분|단계|시간|킬로|키로|그램|미터|센티|마리|[평배도근병잔개줄판통](?=\s|$))|(?:^|\s)\d{1,2}일(?=\s|$)/.test(raw);
}

// Commas may have uneven groups while a digit is edited in an already formatted field.
// Only currency wrappers and digit separators are normalized; invalid source text stays intact.
function quickAmountFieldState(field, normalize = false) {
  const raw = String(field?.value || "");
  const match = raw.match(/^\s*(?:[₩￦]\s*)?(\d+(?:,\d+)*)(?:\s*원)?\s*$/);
  const value = match ? Number(match[1].replace(/,/g, "")) : 0;
  const valid = !!match && Number.isSafeInteger(value) && value > 0 && value <= 2000000000;
  if (normalize && field) {
    if (valid) {
      const start = field.selectionStart, end = field.selectionEnd;
      const digits = position => raw.slice(0, position).replace(/\D/g, "").length;
      const formatted = value.toLocaleString("ko-KR");
      const position = count => {
        if (!count) return 0;
        let seen = 0;
        for (let i = 0; i < formatted.length; i++) if (/\d/.test(formatted[i]) && ++seen === count) return i + 1;
        return formatted.length;
      };
      if (raw !== formatted) {
        field.value = formatted;
        if (document.activeElement === field && start != null && end != null) {
          try { field.setSelectionRange(position(digits(start)), position(digits(end))); } catch (_error) {}
        }
      }
    }
    field.setCustomValidity?.(valid ? "" : "1원부터 20억원까지 정수 금액을 입력해 주세요.");
    field.setAttribute("aria-invalid", valid ? "false" : "true");
  }
  return { valid, value: valid ? value : 0 };
}

// V22.9.93 Q-26: 한 줄에 금액이 몇 건인지 센다. 카카오의 문장 구분(쉼표·세미콜론·가운뎃점·띄운 빗금)을 지우고 세므로 ‘빵 2600, 우산 4700’ 도 두 건이다.
function quickAmountCount(text = "") {
  return moneyTokenSpans(String(text || "").replace(/[,，;；·](?!\d)|\s\/\s/g, " ")).length;
}

// V22.9.34 감사 D15: 자정을 넘겨도 화면을 연 날을 오늘로 쓰지 않는다. 서버가 준 오늘 날짜를 기준으로 화면을 연 뒤
// 지난 날수만큼(KST 날짜 경계 기준) 옮긴다. 달력에서 고른 날짜로 연 폼은 그 날짜를 그대로 쓴다.
// V22.9.86 T-14(디자인 작업 지시서 3단계 §3-6): 미리보기 줄. 기록 저장은 금액과 내용이 모두 있을 때만 켜지고, 꺼진 이유는 이 줄이 말한다.
// - 금액 전: 예산이 있으면 "금액을 넣으면 저장 뒤 남는 예산을 미리 보여드려요", 없으면 서버 문장 그대로("예산을 설정하면 …").
//   서버 HTML 의 첫 문장(지금 남은 예산)은 JS 가 없어도 참이라 그대로 두고, JS 가 뜨면 조용히(aria-live 없이) 한 번 바꾼다.
//   홈 페이지 스크립트(mobile-home.js)의 첫 동기화도 preview(true) 로 부른다 — V22.9.85 까지는 그 호출이 뜨자마자 aria-live 를 붙였다.
// - 내용 전: "내용을 적으면 저장할 수 있어요". 꺼진 이유(금액·내용)는 분류 확인 문구(확인 중·실패)보다 먼저 말한다. 수입: 같은 달이면 "저장하면 이번 달 수입이 …원이 돼요"(data-income + 금액), 다른 달이면 옛 문장.
// - 지출: "저장하면 남는 예산 …원 · 하루 …원"(옛 "남은" → 지시서 "남는"). JS 가 없으면 단추는 늘 켜져 있고 금액 칸 required 가 막는다.
// V22.9.93 Q-26: 이 폼은 한 번에 한 건만 저장한다. 금액이 둘인 문장(‘커피 12000 점심 9000’)은 앞 금액 한 건으로 저장되고 뒤 금액이 메모에 남았다(카카오는 두 건).
// 둘 이상이면 저장을 막고 나눠 적게 한다. 금액이나 내용을 손으로 고치면 본 것으로 여겨 막지 않는다.
// 나눠 적으라고 했으니 Enter 로도 문장을 비우지 않고, 문장을 지우면 앞 금액만 읽어 채운 칸도 함께 비운다(지운 뒤 틀린 한 건이 저장되지 않게).
// 패널을 닫았다 열어 임시저장에서 되살린 문장도 다시 센다(이 길은 apply 를 지나지 않는다).
// V22.9.93 Q-28: 줄머리 목록 표식은 카카오(KAKAO_LIST_MARKER_PREFIX)처럼 먼저 뗀다. ‘1. 김밥 3200원’ 이 1원으로 읽혔다. 저장하는 원문은 친 그대로다.
function quickSmartInputController(config) {
  const byId = id => document.getElementById(id);
  const smart = byId("smartInput"), amount = byId("amountInput"), date = byId("txDate"), after = byId("quickAfter");
  const form = amount?.closest("form");
  const initialDate = date?.value || "";
  const baseMessage = after?.textContent || "저장 전 입력 내용을 확인하세요.";
  const submit = form?.querySelector('.quickSubmit button[type="submit"]'), memoField = byId("memoInput");
  let scope = {};
  try { const data=JSON.parse(after?.getAttribute("data-bsc") || "[]"); scope={month:form?.querySelector?.('input[name="month"]')?.value || "",today:String(data[0] || "").replace(/^(\d{4})(\d{2})(\d{2})$/,"$1-$2-$3"),basis:Array.isArray(data[1])?"category":data[1]===0?"total":"unknown",cats:Array.isArray(data[1])?data[1]:[]}; } catch (_) {}
  const loadedAt = Date.now(), serverToday = scope.today || initialDate;
  const todayNow = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serverToday)) return serverToday;
    const kstDay = ms => Math.floor((ms + 32400000) / 86400000);
    const shift = kstDay(Date.now()) - kstDay(loadedAt);
    if (!shift) return serverToday;
    const p = serverToday.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + shift)).toISOString().slice(0, 10);
  };
  const defaultDate = () => initialDate === serverToday ? todayNow() : initialDate;
  const manual = {amount:false,date:false,category:false,payment:false,memo:false,type:false};
  // V22.9.93 Q-39: 금액 칸·내용 칸을 먼저 고쳐 둔 뒤 금액 둘인 문장을 넣으면 경고 없이 저장됐다. 경고를 본 뒤에 고친 경우만 푼다.
  let invalidAmount = false, invalidDate = false, confirmType = false, manyAmounts = false, splitSettled = false, splitText = "";
  const splitNeeded = () => manyAmounts && !splitSettled;
  const readLine = typed => normalizeInputText(foldInputWidth(typed).replace(/^(?:\d{1,2}[.)]|[-•*])\s+/,""));
  const markers = Object.create(null);
  for (const key of Object.keys(manual)) {
    if (form && document.createElement && form.appendChild) {
      const input = document.createElement("input"); input.type="hidden"; input.name="quick_manual_"+key; input.value="0"; form.appendChild(input); markers[key]=input;
    }
  }
  const cleanNumber = () => quickAmountFieldState(amount).value;
  const validAmount = () => quickAmountFieldState(amount).valid;
  const validDate = () => /^20\d{2}-\d{2}-\d{2}$/.test(date?.value || "") && config.date(date.value,todayNow())===date.value;
  const setValidity = (field,bad,message) => { if (!field) return; field.setCustomValidity?.(bad?message:""); field.setAttribute("aria-invalid",bad?"true":"false"); };
  function preview(quiet) {
    if (!after) return;
    if (!quiet) after.setAttribute("aria-live","polite");
    if (submit) submit.disabled=splitNeeded()||!(cleanNumber() && validAmount() && String(memoField?.value || "").trim());
    if (splitNeeded()) { after.textContent="금액이 둘 이상이에요. 여기서는 한 번에 한 건만 저장돼요. 한 건씩 나눠 적어 주세요."; return; }
    if (confirmType && !manual.type) { after.textContent="결제·승인 취소 내역입니다. 수입 또는 지출을 직접 선택한 뒤 저장해 주세요."; return; }
    if (invalidAmount || invalidDate) { after.textContent=invalidAmount ? "금액이 분명하지 않습니다. 유효한 금액을 직접 입력하거나 문장을 고쳐 주세요." : "달력에 없는 날짜입니다. 유효한 날짜를 직접 선택하거나 문장을 고쳐 주세요."; return; }
    const value=cleanNumber();
    if (!value || !validAmount()) { after.textContent=after.getAttribute("data-has-budget")==="1" ? "금액을 넣으면 저장 뒤 남는 예산을 미리 보여드려요" : baseMessage; return; }
    if (!String(memoField?.value || "").trim()) { after.textContent="내용을 적으면 저장할 수 있어요"; return; }
    if (classificationPending) { after.textContent="현재 가계부의 분류를 확인하고 있습니다."; return; }
    if (classificationFailed) { after.textContent="분류 추천을 확인하지 못했습니다. 분류를 직접 입력하거나 저장 후 확인해 주세요."; return; }
    const income=!!document.querySelector("input[name=type][value=income]:checked");
    const money=value=>new Intl.NumberFormat("ko-KR").format(value)+"원";
    if (income) { const incomeAttr=after.getAttribute("data-income"), total=Number(incomeAttr); after.textContent=incomeAttr!==null && incomeAttr!=="" && total>=0 && validDate() && scope.month && date.value.slice(0,7)===scope.month ? "저장하면 이번 달 수입이 "+money(total+value)+"이 돼요" : "수입으로 저장합니다. 지출 예산을 차감하지 않습니다."; return; }
    const category=byId("catInput")?.value || "";
    if (!validDate() || !scope.month || date.value.slice(0,7)!==scope.month || scope.basis==="unknown") { after.textContent="기록의 분류·날짜를 확인하세요. 해당 월 예산 잔액은 저장 후 확인할 수 있습니다."; return; }
    if (scope.basis==="category" && !(scope.cats || []).includes(category)) { after.textContent="예산 밖 분류로 저장합니다. 설정한 분류 예산은 차감하지 않습니다."; return; }
    if (after.getAttribute("data-has-budget")!=="1") { after.textContent="기록을 저장한 뒤 예산을 설정할 수 있습니다."; return; }
    const remain=Math.max(0,Number(after.getAttribute("data-remaining") || 0)-value);
    after.textContent="저장하면 남는 예산 "+money(remain);
    if (scope.month===scope.today.slice(0,7)) { const parts=scope.today.split("-").map(Number);const days=new Date(Date.UTC(parts[0],parts[1],0)).getUTCDate()-parts[2]+1;if(days>0)after.textContent+=" · 하루 "+money(Math.floor(remain/days)); }
  }
  function complete() {
    preview(); config.sync?.();
    if (typeof Event === "function") document.dispatchEvent?.(new Event("ab:quick-update"));
  }
  function apply(clearInput, composing) {
    // V22.9.79: 입력은 카카오와 같은 순서로 읽는다 — 전각 숫자를 반각으로 바꾸고(A-16) 서버와 같은 정본 normalizeInputText 로 다듬은 문장에서
    // 금액·날짜·구분·결제수단·분류·메모를 찾는다("만 오천원"(A-07)은 이 단계에서 한 금액이 된다). 저장하는 원문(rawTextInput)은 친 그대로다.
    // 서버(parseTransaction)는 입구에서 한 번 다듬고 금액·날짜·구분 판정에서 한 번 더 다듬는다("(1234)삼만 오천원"은 첫 번째로 괄호가 지워진
    // 뒤에야 띄어 쓴 금액이 붙는다). 결제수단·분류·메모 판정 함수는 스스로 한 번 더 다듬으므로 그대로 text 를 주고, 금액·날짜·구분은 scan 을 준다.
    const typed=smart?.value.trim();
    if (!typed) {
      if (manyAmounts) { manyAmounts=false; if (!manual.amount) amount.value=""; if (!manual.memo&&memoField) memoField.value=""; if (byId("rawTextInput")) byId("rawTextInput").value=""; complete(); }
      return;
    }
    const text=readLine(typed), scan=normalizeInputText(text);
    const value=config.amount(scan), parsedDate=config.date(scan,todayNow());
    const type=config.type(scan), payment=config.payment(text), category=config.category(text,type);
    confirmType=/(?:결제|승인)\s*취소/.test(text) && !/(?:^|\s)(?:수입|지출)(?=\s|$)/.test(text);
    const token=moneyTokenSpans(scan)[0]?.raw || "";
    manyAmounts=quickAmountCount(scan)>1;
    if (typed!==splitText) { splitText=typed; splitSettled=false; }
    if (!manual.amount) { amount.value=value ? new Intl.NumberFormat("ko-KR").format(value) : ""; invalidAmount=!value; }
    else invalidAmount=!validAmount();
    if (!manual.date) { date.value=parsedDate || (explicitDateIntent(scan)?"":defaultDate()); invalidDate=explicitDateIntent(scan) && !parsedDate; }
    else invalidDate=!validDate();
    const radio=document.querySelector('input[name=type][value="'+type+'"]'); if (radio&&!manual.type) radio.checked=true;
    if (!manual.memo&&byId("memoInput")) byId("memoInput").value=config.memo(text,token,payment,category,type);
    if (!manual.payment&&byId("payInput")) byId("payInput").value=payment;
    if (!manual.category&&byId("catInput")) byId("catInput").value=category;
    if (byId("rawTextInput")) byId("rawTextInput").value=typed;
    setValidity(amount,invalidAmount,"유효한 금액을 입력하세요."); setValidity(date,invalidDate,"유효한 날짜를 선택하세요.");
    if (clearInput && !manyAmounts) smart.value="";
    // V22.9.90(독립 검토): 한글 조합 중(composing)에는 위에서 이 기기가 읽은 분류를 그대로 보이고, 가계부 분류 요청은 조합이 끝나 다시 읽을 때 보낸다
    // (자모마다 분류 칸을 비우고 요청을 다시 걸던 깜빡임을 없앤다). 조합이 끝나기 전에 저장하면 아래 submit 이 분류 칸을 비워 서버가 정한다(요청 중 저장과 같다).
    if (composing) deferCategory(); else resolveCategory();
    complete();
  }
  let classificationSequence=0, classificationTimer=0, classificationPending=false, classificationFailed=false, categoryDeferred=false;
  function deferCategory() {
    ++classificationSequence;
    clearTimeout(classificationTimer); classificationPending=false; classificationFailed=false;
    categoryDeferred=!manual.category;
  }
  function resolveCategory() {
    const sequence=++classificationSequence;
    clearTimeout(classificationTimer); classificationPending=false; classificationFailed=false; categoryDeferred=false;
    if (manual.category) return;
    const memo=byId("memoInput")?.value || "", raw=byId("rawTextInput")?.value || "";
    if (!memo && !raw) return;
    // V22.9.79 A-10: 문장에서 저절로 채운 메모는 분류에 다시 넣지 않는다. 메모는 결제수단 말을 지운 문장의 일부라 ‘농협체크’에서 남은 ‘농협’이
    // 서버가 막아 둔(except) 낱말을 되살려 "점심 9000 농협체크"를 장보기로 분류했다(카카오는 문장만 보아 외식). 직접 고친 메모는 넣는다.
    const hint=manual.memo || !raw ? memo : "";
    const income=!!document.querySelector("input[name=type][value=income]:checked");
    const household=form?.querySelector('input[name="household_id"]')?.value || "";
    if (!household || typeof fetch!=="function") { if(byId("catInput"))byId("catInput").value=config.category([normalizeInputText(foldInputWidth(raw)),hint].filter(Boolean).join(" "),income?"income":"expense"); return; }
    if(byId("catInput"))byId("catInput").value="";
    classificationPending=true;
    classificationTimer=setTimeout(async()=>{
      const controller=typeof AbortController==="function" ? new AbortController() : null;
      const timeout=controller?setTimeout(()=>controller.abort(),8000):0;
      try {
        const response=await fetch("/u/api/input-classification",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({household_id:household,type:income?"income":"expense",raw_text:raw,memo:hint}),signal:controller?.signal});
        if(!response.ok)throw new Error("classification_unavailable");
        const data=await response.json();
        if(!data.ok || data.household_id!==household || typeof data.category!=="string")throw new Error("classification_invalid");
        if(sequence===classificationSequence && !manual.category && byId("catInput"))byId("catInput").value=data.category;
      } catch(_error) { if(sequence===classificationSequence)classificationFailed=true; }
      finally { clearTimeout(timeout); if(sequence===classificationSequence){classificationPending=false;complete();} }
    },250);
  }
  let amountComposing = false;
  form?.addEventListener("ab:quick-restore", event => {
    const state = event.detail?.manual || {};
    for (const key of Object.keys(manual)) {
      manual[key] = state[key] === "1";
      if (markers[key]) markers[key].value = manual[key] ? "1" : "0";
    }
    const text = byId("rawTextInput")?.value || "";
    confirmType = /(?:결제|승인)\s*취소/.test(text) && !/(?:^|\s)(?:수입|지출)(?=\s|$)/.test(text);
    manyAmounts = quickAmountCount(normalizeInputText(readLine(text.trim()))) > 1;
    splitSettled = manual.amount || manual.memo; splitText = text.trim();
    invalidAmount = !quickAmountFieldState(amount, true).valid;
    invalidDate = !validDate();
    setValidity(date, invalidDate, "유효한 날짜를 선택하세요.");
    resolveCategory(); complete();
  });
  for (const [id,key] of [["amountInput","amount"],["txDate","date"],["catInput","category"],["payInput","payment"],["memoInput","memo"]]) {
    const field=byId(id); if (!field) continue;
    const changed=(event)=>{
      if (key === "amount" && (amountComposing || event?.isComposing)) return;
      if (key === "amount") invalidAmount = !quickAmountFieldState(amount, true).valid;
      if (!event?.detail?.abQuickDefault) {
        manual[key]=true; if(markers[key])markers[key].value="1";
        if(manyAmounts&&(key==="amount"||key==="memo"))splitSettled=true;
        if(key==="date")invalidDate=!validDate();
        if(key==="memo"||key==="category")resolveCategory();
      }
      setValidity(amount,invalidAmount,"1원부터 20억원까지 정수 금액을 입력해 주세요.");
      setValidity(date,invalidDate,"유효한 날짜를 선택하세요."); complete();
    };
    if (key === "amount") {
      field.addEventListener("compositionstart", () => { amountComposing = true; });
      field.addEventListener("compositionend", event => { amountComposing = false; changed(event); });
    }
    field.addEventListener("input",changed); field.addEventListener("change",changed);
  }
  document.querySelectorAll("input[name=type]").forEach(field=>{const changed=()=>{manual.type=true;if(markers.type)markers.type.value="1";resolveCategory();complete();};field.addEventListener("change",changed);field.addEventListener("click",changed);});
  form?.addEventListener("submit",event=>{if(amountComposing||splitNeeded()||(confirmType&&!manual.type)||invalidAmount||invalidDate||!validAmount()||!validDate()){event.preventDefault();invalidAmount=invalidAmount||!validAmount();invalidDate=invalidDate||!validDate();setValidity(amount,invalidAmount,"1원부터 20억원까지 정수 금액을 입력해 주세요.");complete();}else if(categoryDeferred&&!manual.category&&byId("catInput")){byId("catInput").value="";categoryDeferred=false;}});
  preview(true);
  return {apply,preview};
}
// @build:exports-start
export {
  explicitDateIntent, moneyTokenSpans, quickAmountCount, quickAmountFieldState, quickInputDate,
  quickSmartInputController, transactionTypeFromText,
};
// @build:exports-end
