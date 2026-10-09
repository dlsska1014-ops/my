
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
    if (/[A-Za-z\d,]/.test(source[start - 1] || "") || /[A-Za-z\d,]/.test(source[end] || "")) continue;
    let raw = match[0].trim();
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
    let sum = 0, section = 0, number = "";
    for (const token of body.match(/\d+(?:\.\d+)?|[영공일이삼사오육칠팔구]|[십백천만억]/g) || []) {
      if (/^[\d.]+$/.test(token)) number += token;
      else if (token in digit) number += digit[token];
      else if (token === "만" || token === "억") { section += Number(number || 0); sum += (section || 1) * (token === "억" ? 100000000 : 10000); section = 0; number = ""; }
      else { section += Number(number || 1) * ({십:10,백:100,천:1000}[token]); number = ""; }
    }
    const amount = Math.round(sum + section + Number(number || 0));
    if (Number.isSafeInteger(amount) && amount > 0) result.push({start, end: start + raw.length, raw, amount});
  }
  return result;
}

// V22.9.34 감사 D2: "부모님 용돈 30만원", "조카 세뱃돈", "용돈 드림"처럼 주는 대상이나 주는 말이 붙은 용돈·세뱃돈은
// 지출이다. 아무 말 없는 "용돈 30000"은 V22.9.30 결정대로 수입으로 둔다. 받는 말은 먼저 보므로 "엄마한테 용돈 받음"은
// 수입이다. 수수료·중개료·배송비는 "판매 수수료"여도 지출이다.
function transactionTypeFromText(text = "") {
  const raw = String(text || "").trim();
  if (/(?:^|\s)환불\s*(?:수수료|배송비)/.test(raw)) return "expense";
  if (/(?:^|\s)환불(?=\s*\d|$)/.test(raw)) return "income";
  if (/(?:받음|받았|받은|들어옴|들어온|환급|환불받)/.test(raw)) return "income";
  if (/(?:대출|카드|할부|연체)\s*이자|무이자/.test(raw)) return "expense";
  if (/(?:수수료|중개료|배송비)/.test(raw)) return "expense";
  if (/(?:부모님|엄마|아빠|어머니|아버지|어머님|아버님|장모님|장인어른|장인|시어머니|시아버지|할머니|할아버지|조카|아이|애들|아들|딸|자녀|손주|손자|손녀|동생)\s*(?:용돈|세뱃돈)|(?:용돈|세뱃돈)\s*(?:줌|줬|준|주었|드림|드렸|드린|보냄|보냈)/.test(raw)) return "expense";
  if (/(?:^|\s)(?:수입|입금|급여|월급|매출|판매|중고\s*판매|세뱃돈|상여|보너스|배당|이자수입|이자|용돈수입|용돈|수당|캐시백|월세수입)(?=\s|\d|[일이삼사오육칠팔구십백천만억]|$)/.test(raw)) return "income";
  return "expense";
}

// 함수 본문은 그대로 브라우저 자산에 실리므로 설명은 여기 둔다. 마지막의 요일 표현(QA B04)은 명시 날짜보다
// 뒤에 본다. 주는 월요일에 시작하고, 주 단위 말이 없으면 오늘을 포함해 가장 가까운 지난 그 요일이다.
// 카카오 resolveWeekdayPhrase 와 같은 규칙이며 validate-qa-fixes-v22933 이 둘을 대조한다.
// V22.9.34 감사 N6·D8·D4: 엊그제·그끄저께, "일주일/이틀/한 달 전" 같은 말, "지난달 말일", "작년 12월 25일"을 읽는다.
// 연도 없는 "12월 25일"·"12/25"는 올해 날짜가 오늘보다 반년(183일) 넘게 뒤면 작년으로 본다(1월에 적는 지난 연말 기록).
// 반년 안쪽의 앞날은 예전처럼 올해다.
// 서버 extractDate 도 이 함수를 먼저 쓰므로 웹과 카카오가 같은 날로 읽는다.
function quickInputDate(text = "", today = "") {
  const parts = (today || new Date(Date.now() + 32400000).toISOString().slice(0, 10)).split("-").map(Number);
  const now = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const valid = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return y >= 2000 && y <= 2099 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : ""; };
  const monthStart = (offset) => new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
  const lastDay = (dt) => new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const raw = String(text || "");
  let m = raw.match(/(?:^|\s)(그끄저께|그끄제|엊그제|그저께|그제|어제|전날|오늘|금일|지금|방금|내일|모레)(?=\s|$)/);
  if (m) { now.setUTCDate(now.getUTCDate() + ({그끄저께:-3,그끄제:-3,엊그제:-2,그저께:-2,그제:-2,어제:-1,전날:-1,내일:1,모레:2}[m[1]] || 0)); return now.toISOString().slice(0, 10); }
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
  m = raw.match(/(?:^|\s)(\d{1,2})\s*(?:월\s*|[./])(\d{1,2})\s*일?(?=\s|$|[.,!?])/);
  if (m) {
    const thisYear = valid(parts[0], Number(m[1]), Number(m[2]));
    if (thisYear && (Date.UTC(parts[0], Number(m[1]) - 1, Number(m[2])) - Date.UTC(parts[0], parts[1] - 1, parts[2])) / 86400000 > 183) return valid(parts[0] - 1, Number(m[1]), Number(m[2]));
    return thisYear;
  }
  m = raw.match(/(?:^|\s)(\d{1,2})일(?=\s|$)/);
  if (m) return valid(parts[0], parts[1], Number(m[1]));
  m = raw.match(/(?:(지난\s*주|저번\s*주|전주|이번\s*주|금주|다음\s*주|내주)\s*)?([월화수목금토일])요일/);
  if (!m) return "";
  const monday = (index) => (index + 6) % 7;
  const target = monday("일월화수목금토".indexOf(m[2])), current = monday(now.getUTCDay());
  const scope = String(m[1] || "").replace(/\s+/g, "");
  const offset = scope === "이번주" || scope === "금주" ? target - current
    : scope === "다음주" || scope === "내주" ? target - current + 7
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
  if (/(?:^|\s)(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)\s*\d{1,2}\s*(?:월|[./])/.test(raw)) return true;
  return /(?:^|\s)(?:그끄저께|그끄제|엊그제|그저께|그제|어제|전날|오늘|금일|지금|방금|내일|모레)(?=\s|$)|(?:지난\s*달|저번\s*달|이번\s*달|다음\s*달|이달|담달)\s*\d{1,2}|(?:^|\s)20\d{2}(?:[.\-/년]\s*\d{1,2}|\d{4}(?=\s|$))|(?:^|\s)\d{1,2}\s*월\s*\d{1,2}|(?:^|\s)\d{1,2}[./]\d{1,2}(?!\d|\s*[억만천백십원])|(?:^|\s)\d{1,2}일(?=\s|$)/.test(raw);
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
  let invalidAmount = false, invalidDate = false;
  const markers = Object.create(null);
  for (const key of ["amount","date"]) {
    if (form && document.createElement && form.appendChild) {
      const input = document.createElement("input"); input.type="hidden"; input.name="quick_manual_"+key; input.value="0"; form.appendChild(input); markers[key]=input;
    }
  }
  const cleanNumber = value => Number(String(value || "").replace(/,/g,""));
  const validAmount = () => cleanNumber(amount?.value)>0 && cleanNumber(amount?.value)<=2000000000;
  const validDate = () => /^20\d{2}-\d{2}-\d{2}$/.test(date?.value || "") && config.date(date.value,todayNow())===date.value;
  const setValidity = (field,bad,message) => { if (!field) return; field.setCustomValidity?.(bad?message:""); field.setAttribute("aria-invalid",bad?"true":"false"); };
  function preview() {
    if (!after) return;
    after.setAttribute("aria-live","polite");
    if (invalidAmount || invalidDate) { after.textContent=invalidAmount ? "금액이 분명하지 않습니다. 유효한 금액을 직접 입력하거나 문장을 고쳐 주세요." : "달력에 없는 날짜입니다. 유효한 날짜를 직접 선택하거나 문장을 고쳐 주세요."; return; }
    const value=cleanNumber(amount?.value);
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
  function apply(clearInput) {
    const text=smart?.value.trim(); if (!text) return;
    const value=config.amount(text), parsedDate=config.date(text,todayNow());
    const type=config.type(text), payment=config.payment(text), category=config.category(text,type);
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
    config.sync?.(); preview();
  }
  for (const [id,key] of [["amountInput","amount"],["txDate","date"],["catInput","category"],["payInput","payment"],["memoInput","memo"]]) {
    const field=byId(id); if (!field) continue;
    const changed=()=>{manual[key]=true;if(markers[key])markers[key].value="1";if(key==="amount")invalidAmount=!validAmount();if(key==="date")invalidDate=!validDate();setValidity(amount,invalidAmount,"유효한 금액을 입력하세요.");setValidity(date,invalidDate,"유효한 날짜를 선택하세요.");preview();};
    field.addEventListener("input",changed); field.addEventListener("change",changed);
  }
  document.querySelectorAll("input[name=type]").forEach(field=>field.addEventListener("change",()=>{manual.type=true;preview();}));
  form?.addEventListener("submit",event=>{if(invalidAmount||invalidDate||!validAmount()||!validDate()){event.preventDefault();invalidAmount=invalidAmount||!validAmount();invalidDate=invalidDate||!validDate();preview();}});
  return {apply,preview};
}
// @build:exports-start
export {
  explicitDateIntent, moneyTokenSpans, quickInputDate, quickSmartInputController,
  transactionTypeFromText,
};
// @build:exports-end
