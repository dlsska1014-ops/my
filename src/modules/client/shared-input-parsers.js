
export function parseMobileAmountText(text = "") {
  const amount = moneyTokenSpans(text)[0]?.amount || 0; return amount <= 2000000000 ? amount : 0;
}

// The same self-contained scanner is serialized into the immutable client asset.
// V22.9.34 감사 D1·N2: 날짜(10/3, 10.3, 7-15)는 뒤에 숫자가 와도 날짜로 뺀다. 예전에는 "10/3 52000 마트"가
// 10원·3원·52,000원 세 건이 됐다. 시각(19:40), 괄호 속 카드 끝자리((1234)), 가린 카드번호(1234-****),
// "끝자리 1234", 카드 문자의 누적·잔액·한도 금액도 금액 후보에서 뺀다.
function moneyTokenSpans(text = "") {
  const source = String(text || "").replace(/[₩￦]/g, "원");
  if (/\d+,\d{1,2}(?!\d)/.test(source)) return [];
  const excluded = [...source.matchAll(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b|\b20\d{6}\b|\b20\d{2}[./-]\d{1,2}[./-]\d{1,2}\b|\b\d{1,2}[./-]\d{1,2}\b(?!\s*[억만천백십원])|\b\d{1,2}:\d{2}(?::\d{2})?\b|\(\s*\d{2,4}\s*\)|\d{2,4}(?:[-\s]?[*＊xX]{2,})+(?:[-\s]?\d{2,4})?|[*＊xX]{2,}[-\s]?\d{2,4}|(?:끝자리|끝번호|뒷자리|뒷번호)\s*\d{2,4}|(?:누적|잔액|잔고|남은\s*한도|한도)\s*:?\s*[\d,]+\s*원?|\d+(?:\.\d+)?\s*(?:%|퍼센트|명|시|분|일|월|년|번)/g)].map(m => [m.index, m.index + m[0].length]);
  const pattern = /(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|[일이삼사오육칠팔구영공한두세네다섯여섯일곱여덟아홉하나둘셋넷십백천만억]+)(?:\s*[십백천만억]\s*(?:\d+(?:\.\d+)?|[일이삼사오육칠팔구영공십백천만억]+)?)*\s*원?/g;
  const result = [];
  for (const match of source.matchAll(pattern)) {
    const start = match.index, end = start + match[0].trimEnd().length;
    if (excluded.some(([a, b]) => start < b && end > a)) continue;
    if (/[+\-\u2212\uFE63\uFF0D\uFF0B]\s*(?:원\s*)?$/.test(source.slice(0, start))) return [];
    if (/[A-Za-z\d,.]/.test(source[start - 1] || "") || /[A-Za-z\d,]/.test(source[end] || "") || /^\.\d/.test(source.slice(end))) continue;
    let raw = match[0].trim();
    // Words such as 만두 and 천원샵 are not Korean money expressions.
    if (!/\d/.test(raw) && !/원$|[십백천만억]$/.test(raw)) continue;
    if (!/\d/.test(raw) && /[가-힣]/.test(source[end] || "") && !/^(?:짜리|어치|씩|랑|하고|으로|에|을|를|은|는|이|가|만|도)(?=\s|$)/.test(source.slice(end))) continue;
    // Unitless quantities and product model numbers must not create extra transactions.
    if (/^\d+$/.test(raw) && (/^\s*(?:구|개|알|정|봉|봉지|묶음|대|벌|컵|매|팩|세트|마리|병|권|장|켤레|인분|인치|기가|케이스)(?=\s|$)/.test(source.slice(end)) || /(?:아이폰|갤럭시|모델)\s*$/.test(source.slice(0, start)))) continue;
    if (/[가-힣]/.test(source[start-1] || "") && /^[일이삼사오육칠팔구영공한두세네십백천만억]/.test(raw)) {
      const stem = source.slice(0,start).trim().split(/\s+/).pop() || "";
      const amountStem = /^(?:수입|지출|입금|결제|급여|월급|판매|용돈|세뱃돈|수당|이자|캐시백|월세수입)$/;
      if (!amountStem.test(stem) && !( /원/.test(raw) && /^[일이삼사오육칠팔구한두세네]/.test(raw))) continue;
    }
    if (/^\d{1,3}$/.test(raw) && /[가-힣]/.test(source[start-1] || "")) continue;
    if (!/원/.test(raw) && /[가-힣]/.test(source[end] || "") && !/^(?:랑|하고)(?=\s)/.test(source.slice(end))) continue;
    if (!/[\d]/.test(raw) && !/[십백천만억]/.test(raw)) continue;
    if (!/[원십백천만억]/.test(raw) && /[가-힣A-Za-z]/.test(source[end] || "") && !/^(?:랑|하고)(?=\s)/.test(source.slice(end))) continue;
    const body = raw.replace(/[\s,원]/g, "").replace(/하나|한/g, "일").replace(/둘|두/g, "이").replace(/셋|세/g, "삼").replace(/넷|네/g, "사").replace(/다섯/g, "오").replace(/여섯/g, "육").replace(/일곱/g, "칠").replace(/여덟/g, "팔").replace(/아홉/g, "구");
    const digit = {영:0,공:0,일:1,이:2,삼:3,사:4,오:5,육:6,칠:7,팔:8,구:9};
    const tokens = body.match(/\d+(?:\.\d+)?|[영공일이삼사오육칠팔구]|[십백천만억]/g) || [];
    const places = Math.max(0, ...tokens.map(token => (token.split(".")[1] || "").length));
    const scale = 10n ** BigInt(places);
    const units = value => {
      const [whole, fraction = ""] = String(value).split(".");
      return BigInt(whole || "0") * scale + BigInt(fraction.padEnd(places, "0") || "0");
    };
    let sum = 0n, section = 0n, number = "", sectionSpecified = false;
    for (const token of tokens) {
      if (/^[\d.]+$/.test(token)) number += token;
      else if (token in digit) number += digit[token];
      else if (token === "만" || token === "억") {
        const specified = sectionSpecified || number !== "";
        section += units(number || "0");
        sum += (specified ? section : scale) * (token === "억" ? 100000000n : 10000n);
        section = 0n; number = ""; sectionSpecified = false;
      }
      else { section += units(number || "1") * ({십:10n,백:100n,천:1000n}[token]); number = ""; sectionSpecified = true; }
    }
    const total = sum + section + units(number || "0");
    if (total % scale !== 0n) return [];
    const amount = Number(total / scale);
    if (Number.isSafeInteger(amount) && amount > 0) result.push({start, end: start + raw.length, raw, amount});
  }
  return result;
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
  m = raw.match(/(?:(지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*)?말일/);
  if (m) { const dt = monthStart(/지난|저번/.test(m[0]) ? -1 : /다음|담달/.test(m[0]) ? 1 : 0); return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, lastDay(dt)); }
  m = raw.match(/(?:지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*(\d{1,2})\s*일?/);
  if (m) { const dt = monthStart(/지난|저번/.test(m[0]) ? -1 : /다음|담달/.test(m[0]) ? 1 : 0); return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, Number(m[1])); }
  m = raw.match(/(?:^|\s)(20\d{2})(\d{2})(\d{2})(?=\s|$)/);
  if (m) return valid(Number(m[1]),Number(m[2]),Number(m[3]));
  m = raw.match(/(?:^|\s)(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = raw.match(/(?:^|\s)(재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*(\d{1,2})\s*(?:월\s*|[./])(\d{1,2})\s*일?(?=\s|$|[.,!?])/);
  if (m) return valid(parts[0] + ({재작년:-2,작년:-1,지난해:-1,올해:0,금년:0,내년:1,다음해:1}[m[1].replace(/\s+/g, "")] || 0), Number(m[2]), Number(m[3]));
  m = raw.match(/(?:^|\s)(\d{1,2})\s*(?:월\s*|[./-])(\d{1,2})\s*일?(?=\s|$|[.,!?])(?!\s*[억만천백십원])/);
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
  m = raw.match(/(?:(지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주|지난|저번)\s*)?([월화수목금토일])요일/);
  if (!m) return "";
  const monday = (index) => (index + 6) % 7;
  const target = monday("일월화수목금토".indexOf(m[2])), current = monday(now.getUTCDay());
  const scope = String(m[1] || "").replace(/\s+/g, "");
  const offset = scope === "이번주" || scope === "금주" ? target - current
    : scope === "다음주" || scope === "내주" ? target - current + 7
      : scope === "지난" || scope === "저번" ? -((current - target + 7) % 7 || 7)
        : scope ? target - current - 7
          : -((current - target + 7) % 7);
  now.setUTCDate(now.getUTCDate() + offset);
  return valid(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

function explicitDateIntent(text = "") {
  const raw = String(text || "");
  if (/(?:^|\s)(?:\d{1,2}|한|두|세|네|일|이|삼|사)\s*(?:일|주일|주|달|개월)\s*(?:전|후)(?=\s|$)/.test(raw)) return true;
  if (/(?:^|\s)(?:하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*(?:전|후)(?=\s|$)/.test(raw)) return true;
  if (/[월화수목금토일]요일/.test(raw)) return true;
  if (/말일/.test(raw)) return true;
  if (/(?:^|\s)(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*\d{1,2}\s*(?:월|[./-])/.test(raw)) return true;
  return /(?:^|\s)(?:그끄저께|그끄제|엊그저께|엊그제|그저께|그제|어젯밤|엊저녁|어제|전날|오늘|금일|지금|방금|내일|모레)(?=(?:아침|점심|저녁|밤|새벽|오전|오후)?(?:\s|$))|(?:지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*\d{1,2}|(?:^|\s)20\d{2}(?:[.\-/년]\s*\d{1,2}|\d{4}(?=\s|$))|(?:^|\s)\d{1,2}\s*월\s*\d{1,2}|(?:^|\s)\d{1,2}[./-]\d{1,2}(?!\d|\s*[억만천백십원])|(?:^|\s)\d{1,2}일(?=\s|$)/.test(raw);
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

// V22.9.34 감사 D15: 자정을 넘겨도 화면을 연 날을 오늘로 쓰지 않는다. 서버가 준 오늘 날짜를 기준으로 화면을 연 뒤
// 지난 날수만큼(KST 날짜 경계 기준) 옮긴다. 달력에서 고른 날짜로 연 폼은 그 날짜를 그대로 쓴다.
function quickSmartInputController(config) {
  const byId = id => document.getElementById(id);
  const smart = byId("smartInput"), amount = byId("amountInput"), date = byId("txDate"), after = byId("quickAfter");
  const form = amount?.closest("form");
  const initialDate = date?.value || "";
  const baseMessage = after?.textContent || "저장 전 입력 내용을 확인하세요.";
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
  let invalidAmount = false, invalidDate = false, confirmType = false;
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
  function preview() {
    if (!after) return;
    after.setAttribute("aria-live","polite");
    if (confirmType && !manual.type) { after.textContent="결제·승인 취소 내역입니다. 수입 또는 지출을 직접 선택한 뒤 저장해 주세요."; return; }
    if (classificationPending) { after.textContent="현재 가계부의 분류를 확인하고 있습니다."; return; }
    if (classificationFailed) { after.textContent="분류 추천을 확인하지 못했습니다. 분류를 직접 입력하거나 저장 후 확인해 주세요."; return; }
    if (invalidAmount || invalidDate) { after.textContent=invalidAmount ? "금액이 분명하지 않습니다. 유효한 금액을 직접 입력하거나 문장을 고쳐 주세요." : "달력에 없는 날짜입니다. 유효한 날짜를 직접 선택하거나 문장을 고쳐 주세요."; return; }
    const value=cleanNumber();
    if (!value || !validAmount()) { after.textContent=baseMessage; return; }
    const income=!!document.querySelector("input[name=type][value=income]:checked");
    if (income) { after.textContent="수입으로 저장합니다. 지출 예산을 차감하지 않습니다."; return; }
    const category=byId("catInput")?.value || "";
    if (!validDate() || !scope.month || date.value.slice(0,7)!==scope.month || scope.basis==="unknown") { after.textContent="기록의 분류·날짜를 확인하세요. 해당 월 예산 잔액은 저장 후 확인할 수 있습니다."; return; }
    if (scope.basis==="category" && !(scope.cats || []).includes(category)) { after.textContent="예산 밖 분류로 저장합니다. 설정한 분류 예산은 차감하지 않습니다."; return; }
    if (after.getAttribute("data-has-budget")!=="1") { after.textContent="기록을 저장한 뒤 예산을 설정할 수 있습니다."; return; }
    const remain=Math.max(0,Number(after.getAttribute("data-remaining") || 0)-value);
    const money=value=>new Intl.NumberFormat("ko-KR").format(value)+"원";
    after.textContent="저장하면 남은 예산 "+money(remain);
    if (scope.month===scope.today.slice(0,7)) { const parts=scope.today.split("-").map(Number);const days=new Date(Date.UTC(parts[0],parts[1],0)).getUTCDate()-parts[2]+1;if(days>0)after.textContent+=" · 하루 "+money(Math.floor(remain/days)); }
  }
  function complete() {
    preview(); config.sync?.();
    if (typeof Event === "function") document.dispatchEvent?.(new Event("ab:quick-update"));
  }
  function apply(clearInput) {
    const text=smart?.value.trim(); if (!text) return;
    const value=config.amount(text), parsedDate=config.date(text,todayNow());
    const type=config.type(text), payment=config.payment(text), category=config.category(text,type);
    confirmType=/(?:결제|승인)\s*취소/.test(text) && !/(?:^|\s)(?:수입|지출)(?=\s|$)/.test(text);
    const token=moneyTokenSpans(text)[0]?.raw || "";
    if (!manual.amount) { amount.value=value ? new Intl.NumberFormat("ko-KR").format(value) : ""; invalidAmount=!value; }
    else invalidAmount=!validAmount();
    if (!manual.date) { date.value=parsedDate || (explicitDateIntent(text)?"":defaultDate()); invalidDate=explicitDateIntent(text) && !parsedDate; }
    else invalidDate=!validDate();
    const radio=document.querySelector('input[name=type][value="'+type+'"]'); if (radio&&!manual.type) radio.checked=true;
    if (!manual.memo&&byId("memoInput")) byId("memoInput").value=config.memo(text,token,payment,category);
    if (!manual.payment&&byId("payInput")) byId("payInput").value=payment;
    if (!manual.category&&byId("catInput")) byId("catInput").value=category;
    if (byId("rawTextInput")) byId("rawTextInput").value=text;
    setValidity(amount,invalidAmount,"유효한 금액을 입력하세요."); setValidity(date,invalidDate,"유효한 날짜를 선택하세요.");
    if (clearInput) smart.value="";
    resolveCategory(); complete();
  }
  let classificationSequence=0, classificationTimer=0, classificationPending=false, classificationFailed=false;
  function resolveCategory() {
    const sequence=++classificationSequence;
    clearTimeout(classificationTimer); classificationPending=false; classificationFailed=false;
    if (manual.category) return;
    const memo=byId("memoInput")?.value || "", raw=byId("rawTextInput")?.value || "";
    if (!memo && !raw) return;
    const income=!!document.querySelector("input[name=type][value=income]:checked");
    const household=form?.querySelector('input[name="household_id"]')?.value || "";
    if (!household || typeof fetch!=="function") { if(byId("catInput"))byId("catInput").value=config.category([raw,memo].filter(Boolean).join(" "),income?"income":"expense"); return; }
    if(byId("catInput"))byId("catInput").value="";
    classificationPending=true;
    classificationTimer=setTimeout(async()=>{
      const controller=typeof AbortController==="function" ? new AbortController() : null;
      const timeout=controller?setTimeout(()=>controller.abort(),8000):0;
      try {
        const response=await fetch("/u/api/input-classification",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({household_id:household,type:income?"income":"expense",raw_text:raw,memo}),signal:controller?.signal});
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
  form?.addEventListener("submit",event=>{if(amountComposing||(confirmType&&!manual.type)||invalidAmount||invalidDate||!validAmount()||!validDate()){event.preventDefault();invalidAmount=invalidAmount||!validAmount();invalidDate=invalidDate||!validDate();setValidity(amount,invalidAmount,"1원부터 20억원까지 정수 금액을 입력해 주세요.");complete();}});
  return {apply,preview};
}
// @build:exports-start
export {
  explicitDateIntent, moneyTokenSpans, quickAmountFieldState, quickInputDate,
  quickSmartInputController, transactionTypeFromText,
};
// @build:exports-end
