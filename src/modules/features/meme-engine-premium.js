// @build:imports-start
import { premiumBetaEnabled } from "../public/site-config.js";
import { dashboardQuery } from "../admin/transactions-households.js";
import { categoryExpenseMap } from "../domain/analytics.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function chooseMemeCard(a) {
  const key = detectMonthlyCardKey(a);
  return buildMemeCardFromKey(key, { ...a, scale: "monthly" });
}

function detectMonthlyCardKey(a) {
  if (a.expense === 0 && a.income === 0) return "NO_RECORDS";
  if (a.expense === 0) return "NO_SPEND_ZEN";
  if (a.income > 0 && a.burnForecast > a.income * 1.15) return "PAYCHECK_EVAPORATOR";
  if (a.riskScore >= 85) return "WALLET_SIREN";
  if (a.expenseDays <= 3 && a.expense > 0) return "FLASH_SPENDER";
  if (a.income > 0 && a.expense < a.income * 0.4 && a.noSpendDays >= 8) return "SAVING_SHIELD";
  if (a.fixedRate >= 62) return "FIXED_BOSS";
  if (a.maxDayRate >= 52) return "ONE_PUNCH";
  if (a.cafeCount >= 18 || a.cafeAmount >= 90000) return "CAFE_OVERLORD";
  if (a.cafeCount >= 8) return "LATTE_RABBIT";
  if (a.deliveryCount >= 8 || a.deliveryAmount >= 180000) return "DELIVERY_WIZARD";
  if (a.deliveryCount >= 4) return "LATE_NIGHT_KNIGHT";
  if (a.shoppingCount >= 9 || a.shoppingAmount >= 250000) return "ROCKET_CARTEL";
  if (a.shoppingAmount >= 120000) return "CART_OVERLOAD";
  if (a.subscriptionCount >= 5 || a.subscriptionAmount >= 80000) return "SUBSCRIPTION_GHOST";
  if (a.groceryAmount >= 350000) return "MART_RAIDER";
  if (a.vehicleAmount >= 250000) return "FUEL_DRAGON";
  if (a.medicalAmount >= 180000) return "HOSPITAL_SIDEQUEST";
  if (a.childAmount >= 250000) return "KID_BOSS_RAID";
  if (a.petAmount >= 120000) return "PET_BUTLER";
  if (a.beautyAmount >= 120000) return "BEAUTY_BUFF";
  if (a.cultureAmount >= 180000) return "DOPAMINE_TOUR";
  if (a.taxAmount >= 100000) return "TAX_NPC";
  if (a.missingAny >= 8) return "MYSTERY_SPENDER";
  if (a.missingAny >= 3) return "MISC_SWAMP";
  if (a.noSpendDays >= 12) return "SELF_CONTROL";
  if (a.weekendRate >= 48) return "WEEKEND_BURN";
  if (a.concentration >= 48) return "HYPER_FOCUS";
  if (a.foodAmount >= 300000) return "RICE_POWERED_HERO";
  return "STEADY_SQUIRREL";
}

function buildMemeCardFromKey(key, stats) {
  const variants = getMemeVariantPool();
  const core = getCoreCardPool()[key] || getCoreCardPool().STEADY_SQUIRREL;
  const variantIndex = hashString(`${key}|${stats.expense || 0}|${stats.noSpendDays || 0}|${stats.fixedRate || 0}|${stats.maxDayRate || 0}|${stats.deliveryCount || 0}|${stats.shoppingCount || 0}`) % variants.length;
  const variant = variants[variantIndex];
  const rarity = core.rarity || "R";
  const power = buildCardPower(stats, rarity, variantIndex);
  const title = `${core.title} ${variant.titleSuffix}`.trim();
  const line = formatTemplate(core.line, stats);
  const sub = formatTemplate(variant.sub || core.sub || "", stats);
  const share = formatTemplate(core.share || variant.share || "", stats);
  return {
    key,
    rarity,
    emoji: core.emoji + (variant.emojiAddon || ""),
    title,
    tagline: line,
    subline: sub,
    share,
    styleClass: `rarity-${rarity} ${variant.styleClass || "spark"}`,
    animation: variant.styleClass || "spark",
    power,
    label: core.label || "월간 대표 소비몬",
  };
}

function getCoreCardPool() {
  return {
    NO_RECORDS:{rarity:"N",emoji:"🫥",title:"기록 실종자",label:"월간 대표 카드",line:"이번 달 기록이 거의 없어요. 통장이 아니라 기억이 실종된 상태.",sub:"가계부가 비어 있으면 밈도 못 뽑아요.",share:"이번 달 나는 기록 실종자 떴다. 일단 쓰는 것부터 시작하자 ㅋㅋ"},
    NO_SPEND_ZEN:{rarity:"LEGEND",emoji:"🧘‍♂️💸",title:"지갑 봉인술사",line:"이번 달 무지출 모드. 욕망을 잡아두는 봉인진이 켜졌습니다.",sub:"편의점 앞에서도 흔들리지 않는 의지력.",share:"LEGEND 지갑 봉인술사 떴다. 오늘의 나는 욕망보다 강하다."},
    PAYCHECK_EVAPORATOR:{rarity:"SSR",emoji:"💨💰",title:"월급 증발술사",line:"월말 예상 지출이 수입을 추월 중. 월급이 들어왔는데 본 적이 없습니다.",sub:"월급: 나 왔다. 자동이체: 잘 가.",share:"SSR 월급 증발술사 떴다. 월급이 통장에 방문만 하고 퇴근함."},
    WALLET_SIREN:{rarity:"SSR",emoji:"🚨💸",title:"통장 비상벨",line:"위험 점수 {riskScore}점. 카드값이 조용히 웃고 있는 단계.",sub:"지금 웃는 건 나보다 카드사일 확률이 큽니다.",share:"통장 비상벨 떴다. 나 말고 카드사가 미소 짓는 중."},
    FIXED_BOSS:{rarity:"SSR",emoji:"🏰📉",title:"월급 입구컷 삼대장",line:"고정비 비중 {fixedRate}%. 월세·보험·구독이 입구에서 출석 체크 중.",sub:"나는 돈을 번 게 아니라 자동이체를 먹여 살림.",share:"SSR 월급 입구컷 삼대장 떴다. 월급날인데 왜 벌써 다음 월급날 기다림?"},
    ONE_PUNCH:{rarity:"SR",emoji:"💥🐲",title:"한방지출 드래곤",line:"하루 집중 지출 비중 {maxDayRate}%. 한 번에 크게 나가서 심장도 같이 흔들림.",sub:"그날의 결제 알림은 아직도 생생합니다.",share:"한방지출 드래곤 떴다. 그날 카드 알림 아직도 뇌리에 남아있음."},
    CAFE_OVERLORD:{rarity:"UR",emoji:"☕🐰",title:"카페인 대주주",line:"카페/간식 {cafeCount}회. 카페 사장님이 닉네임 외웠을 가능성 상승.",sub:"나는 커피를 마시는 게 아니라 카페 지분을 사는 중.",share:"UR 카페인 대주주 떴다. 아침마다 카페가 내 출근 체크 찍음."},
    DELIVERY_WIZARD:{rarity:"UR",emoji:"🍗🧙‍♂️",title:"배달 흑마법사",line:"배달/야식 {deliveryCount}회. 냉장고는 있는데 왜 자꾸 주문서가 열리지?",sub:"리뷰 이벤트는 합리화의 마지막 방패.",share:"UR 배달 흑마법사 떴다. 냉장고 열어보고 아무것도 없는 척함."},
    ROCKET_CARTEL:{rarity:"SSR",emoji:"📦🚀",title:"로켓배송 간부",line:"쇼핑 {shoppingCount}회. 필요해서 산 건 1개, 같이 산 건 기억 안 남.",sub:"배송 완료 알림이 오늘의 도파민.",share:"SSR 로켓배송 간부 떴다. 내일 온다는 말에 영혼을 팔았다."},
    SUBSCRIPTION_GHOST:{rarity:"SR",emoji:"👻📺",title:"구독 유령단",line:"구독이 조용히 지갑을 갉아먹는 중. 안 보는 서비스도 출근 중입니다.",sub:"무료체험은 끝났고, 내 통장도 끝났습니다.",share:"구독 유령단 떴다. 나는 안 보는데 돈은 성실히 나감."},
    MART_RAIDER:{rarity:"SR",emoji:"🛒🐗",title:"마트 습격 멧돼지",line:"장보기 금액이 큽니다. 카트는 가볍게 밀었는데 영수증은 무겁습니다.",sub:"분명 우유 사러 갔는데 왜 장바구니가 진화했지?",share:"마트 습격 멧돼지 떴다. 우유 사러 갔다가 식량 보급 작전 됨."},
    FUEL_DRAGON:{rarity:"SR",emoji:"⛽🐉",title:"기름값 드래곤",line:"교통/차량비가 크게 올라왔습니다. 이동할수록 지갑이 연소됩니다.",sub:"차는 달리고 내 잔액은 멈춰 섭니다.",share:"기름값 드래곤 떴다. 차는 굴러가는데 내 통장은 후진 중."},
    HOSPITAL_SIDEQUEST:{rarity:"R",emoji:"🏥🧪",title:"병원 사이드퀘스트",line:"의료비가 눈에 띕니다. 몸이 보낸 퀘스트를 클리어 중.",sub:"건강은 중요하지만 영수증은 매섭습니다.",share:"병원 사이드퀘스트 떴다. 몸은 회복 중인데 통장은 입원함."},
    KID_BOSS_RAID:{rarity:"SSR",emoji:"🧒👑",title:"육아 보스레이드",line:"육아/자녀 지출이 강력합니다. 귀여움은 무한인데 관련 비용은 레이드급.",sub:"작은 인간 하나가 예산표를 흔듭니다.",share:"육아 보스레이드 떴다. 귀여움은 무한, 부대비용은 레이드급."},
    PET_BUTLER:{rarity:"SR",emoji:"🐶👑",title:"반려동물 집사장",line:"반려동물 지출이 큽니다. 나는 집사고 그분은 VIP입니다.",sub:"내 간식보다 그분 간식이 고급일 가능성 있음.",share:"반려동물 집사장 떴다. 우리 집 진짜 주인은 내가 아니었다."},
    BEAUTY_BUFF:{rarity:"R",emoji:"💅✨",title:"외모 버프 장인",line:"미용/뷰티 지출이 보입니다. 오늘의 나는 어제보다 광이 납니다.",sub:"통장은 살짝 울지만 거울은 칭찬 중.",share:"외모 버프 장인 떴다. 잔액은 빠졌지만 자신감은 충전됨."},
    DOPAMINE_TOUR:{rarity:"SR",emoji:"🎡🎮",title:"도파민 투어리스트",line:"문화/여가 소비가 큽니다. 지갑이 놀러 갔다가 늦게 돌아옵니다.",sub:"추억은 남고 잔액은 떠났습니다.",share:"도파민 투어리스트 떴다. 나는 소비한 게 아니라 추억을 샀다."},
    TAX_NPC:{rarity:"R",emoji:"🧾🧍",title:"세금 NPC 조우",line:"세금/수수료 지출 발생. 피할 수 없는 NPC를 만났습니다.",sub:"선택지는 결제뿐입니다.",share:"세금 NPC 조우 떴다. 회피 버튼이 없네 ㅋㅋ"},
    MYSTERY_SPENDER:{rarity:"SR",emoji:"🕵️‍♂️💳",title:"영수증 기억상실범",line:"미분류/미입력 {missingAny}건. 이 돈이 어디 갔는지 사건 접수.",sub:"메모는 기타, 기억은 증발, 통장은 눈물.",share:"나 이번 달 영수증 기억상실범 떴다 ㅋㅋ 소비내역이 추리물 됨."},
    SELF_CONTROL:{rarity:"UR",emoji:"🛡️✨",title:"소비 참선 고수",line:"무지출일 {noSpendDays}일. 결제창 앞에서 마음을 비웠습니다.",sub:"배달앱 켰다가 닫는 속도가 누구보다 빠름.",share:"소비 참선 고수 떴다. 오늘의 나는 돈 안 쓴 사람이 아니라 욕망을 이긴 사람."},
    WEEKEND_BURN:{rarity:"SR",emoji:"🎉🔥",title:"주말 폭주 기관차",line:"주말 소비 비중 {weekendRate}%. 금요일 밤부터 지갑 브레이크가 해제됩니다.",sub:"주말은 짧고 소비는 길다.",share:"주말 폭주 기관차 떴다 ㅋㅋ 토요일에 내 지갑만 야근함."},
    HYPER_FOCUS:{rarity:"R",emoji:"🎯📦",title:"올인형 수집가",line:"한 카테고리 쏠림 {concentration}%. 이번 달 한 분야에 꽂혔습니다.",sub:"필요해서 샀다고 하기엔 너무 즐거워 보이는 소비.",share:"올인형 수집가 떴다. 이번 달의 나는 한 가지에 진심이었다."},
    RICE_POWERED_HERO:{rarity:"R",emoji:"🍚💪",title:"밥심 히어로",line:"식비가 꽤 큽니다. 밥은 먹고 살아야 하니까 일단 명분은 있습니다.",sub:"문제는 밥이 자꾸 맛있다는 것.",share:"밥심 히어로 떴다. 나는 먹은 게 아니라 생존 에너지를 충전했다."},
    FLASH_SPENDER:{rarity:"SR",emoji:"⚡💳",title:"3일컷 소비 번개",line:"소비일이 적은데 지출은 큽니다. 짧고 굵게 치고 빠진 타입.",sub:"가계부가 아니라 순간이동 결제 기록.",share:"3일컷 소비 번개 떴다. 며칠 안 썼는데 왜 잔액이 얇아졌지?"},
    SAVING_SHIELD:{rarity:"UR",emoji:"🛡️🐢",title:"저축 방패 거북이",line:"수입 대비 지출 방어 성공. 통장이 오랜만에 안심하는 중.",sub:"화려하진 않아도 제일 자랑하기 좋은 카드.",share:"UR 저축 방패 거북이 떴다. 이번 달 통장이 나한테 고맙대."},
    LATTE_RABBIT:{rarity:"SR",emoji:"☕🐇",title:"라떼 자동결제 토끼",line:"카페 앞을 지나가면 카드가 먼저 인사하는 단계.",sub:"오늘도 라떼가 나를 선택했다. 나는 죄가 없다.",share:"라떼 자동결제 토끼 떴다. 카페가 나를 부르면 가야지 뭐."},
    LATE_NIGHT_KNIGHT:{rarity:"SR",emoji:"🌙🍗",title:"야식 기사단",line:"밤이 깊으면 의지도 같이 퇴근합니다.",sub:"냉장고는 있었지만 마음의 준비가 없었습니다.",share:"야식 기사단 떴다. 밤 11시 이후의 나는 내가 아니다."},
    CART_OVERLOAD:{rarity:"SR",emoji:"🛒💥",title:"장바구니 폭주족",line:"장바구니가 가벼운 척하다가 결제창에서 본색을 드러냅니다.",sub:"필요한 건 하나였는데 추천상품이 너무 친절했음.",share:"장바구니 폭주족 떴다. 나는 쇼핑한 게 아니라 미래의 나에게 선물했다."},
    MISC_SWAMP:{rarity:"R",emoji:"🕳️🧾",title:"기타 늪지대 주민",line:"기타/미입력이 슬슬 늪이 되고 있습니다. 들어가면 기억이 흐려집니다.",sub:"그때의 나는 왜 이걸 샀을까?",share:"기타 늪지대 주민 떴다. 내 소비내역을 봤는데 추리소설 시작됨."},
    STEADY_SQUIRREL:{rarity:"R",emoji:"🐿️📒",title:"안정형 다람쥐",line:"이번 달 소비는 꽤 무난합니다. 큰 사고 없이 꾸준한 편.",sub:"자극적이진 않지만 이런 사람이 결국 오래 갑니다.",share:"안정형 다람쥐 떴다. 요란하진 않아도 꾸준한 소비 패턴 인정."},
  };
}

function getMemeVariantPool() {
  return [
    { titleSuffix:"ㅋㅋ에디션", emojiAddon:"✨", styleClass:"spark", sub:"내 통장: '이쯤 되면 네가 나한테 미안해야 함'" },
    { titleSuffix:"밈실사판", emojiAddon:"🎬", styleClass:"wiggle", sub:"친구한테 보내면 '야 이거 너잖아' 소리 듣는 타입." },
    { titleSuffix:"도파민팩", emojiAddon:"🎉", styleClass:"bounce", sub:"한 번 보면 캡처각, 두 번 보면 단톡 소환각." },
    { titleSuffix:"자랑각", emojiAddon:"📸", styleClass:"spark", sub:"이 카드는 공유해야 완성됩니다. 혼자 보면 손해." },
    { titleSuffix:"짤생성기", emojiAddon:"🖼️", styleClass:"wiggle", sub:"멘트가 이미 반쯤 짤방. 저장해두고 놀리기 좋음." },
    { titleSuffix:"피식주의", emojiAddon:"🤣", styleClass:"bounce", sub:"본인은 슬픈데 남이 보면 좀 웃김." },
    { titleSuffix:"대유잼", emojiAddon:"🔥", styleClass:"spark", sub:"통계보다 드립이 먼저 보이는 희한한 카드." },
    { titleSuffix:"찐공유각", emojiAddon:"💬", styleClass:"wiggle", sub:"이거 단톡에 올리면 한 명쯤은 바로 시작합니다." },
    { titleSuffix:"통장오열팩", emojiAddon:"😭", styleClass:"bounce", sub:"카드는 웃긴데 잔액은 안 웃는 버전." },
    { titleSuffix:"월급생존기", emojiAddon:"🪖", styleClass:"spark", sub:"이번 달도 살아남는 게 목표인 사람들을 위한 카드." },
    { titleSuffix:"친구태그각", emojiAddon:"👀", styleClass:"wiggle", sub:"보자마자 떠오르는 친구가 있으면 이미 성공." },
    { titleSuffix:"레전드짤", emojiAddon:"🏆", styleClass:"spark", sub:"내 소비 패턴이 콘텐츠가 되는 순간." },
  ];
}

function buildCardPower(stats, rarity, variantIndex) {
  const rarityBase = { N:180, R:260, SR:420, SSR:650, UR:880, LEGEND:1200, C:120, B:180, A:260, S:420, SS:620, SSS:900 };
  return Math.round((rarityBase[rarity] || 200) + (stats.expense || 0) / 10000 + (stats.noSpendDays || 0) * 12 + (stats.cafeCount || 0) * 9 + (stats.deliveryCount || 0) * 11 + (stats.shoppingCount || 0) * 8 + variantIndex * 7);
}

function formatTemplate(tpl, data) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => String(data[k] ?? "0"));
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function buildCollectionState({ month, allRows, calendar, analysis }) {
  const dailyCards = [];
  let noSpendStreak = 0;
  for (const d of calendar) {
    const exp = Number(d.expense || 0);
    const count = Number(d.count || 0);
    if (exp === 0 && count > 0) {
      noSpendStreak += 1;
      dailyCards.push(buildDailyNoSpendCard(d.date, noSpendStreak, count));
    } else if (exp === 0 && count === 0) {
      noSpendStreak = 0;
      dailyCards.push(buildDailyNoRecordCard(d.date));
    } else {
      noSpendStreak = 0;
      dailyCards.push(buildDailySpendCard(d.date, exp, count, allRows.filter(r => r.transaction_date === d.date)));
    }
  }
  const monthlyCard = chooseMemeCard(analysis);
  const topShare = dailyCards.filter(c=>c.grade !== "NORECORD").sort((a,b)=>cardGradeScore(b.rarity)-cardGradeScore(a.rarity)).slice(0,6);
  return {
    month,
    monthlyCard,
    dailyCards,
    topShare,
    noSpendBest: Math.max(0, ...dailyCards.filter(c => c.kind==="no_spend").map(c => c.streak || 0)),
    totalCards: dailyCards.length + 1,
    shareWall: buildShareWall(monthlyCard, dailyCards),
  };
}

function cardGradeScore(r) { return ({ N:1, C:2, B:3, A:4, S:5, SS:6, SSS:7, R:3, SR:5, SSR:6, UR:7, LEGEND:8, NORECORD:0 }[r] || 0); }

function buildDailyNoSpendCard(date, streak, count) {
  const rarity = streak >= 7 ? "SSS" : streak >= 5 ? "SS" : streak >= 4 ? "S" : streak >= 3 ? "A" : streak >= 2 ? "B" : "C";
  const names = { C:"무소비 새싹", B:"절약 병아리", A:"결제 참기 장인", S:"지갑 봉인 기사", SS:"욕망 봉쇄 마법사", SSS:"무소비 전설러" };
  const lines = {
    C:"첫 무소비 성공. 편의점 앞에서 한 번 이겼습니다.",
    B:"연속 무소비 2일차. 배달앱이 '왜 안 와?' 하는 중.",
    A:"연속 무소비 3일차. 결제창 앞에서 인격이 성장했습니다.",
    S:"연속 무소비 4일차. 통장이 오랜만에 숨을 쉽니다.",
    SS:"연속 무소비 5일차+. 친구들한테 자랑해도 되는 구간.",
    SSS:"무소비 신기록. 카드사 알림도 요즘 외로워합니다."
  };
  return { kind:"no_spend", date, rarity, styleClass:`rarity-${rarity} spark`, emoji:"🧘‍♀️✨", title:names[rarity], line:lines[rarity], sub:`연속 ${streak}일째 · 기록 ${count}건`, share:`${date} ${names[rarity]} 떴다. ${streak}일째 돈 안 쓴 사람 여기 있습니다.`, streak };
}

function buildDailyNoRecordCard(date) {
  return { kind:"no_record", grade:"NORECORD", rarity:"N", styleClass:"rarity-N wiggle", emoji:"🫥", title:"기록 없음", line:"이 날은 소비가 없던 건지, 기록을 놓친 건지 확인 필요.", sub:"무지출과 기록없음은 다릅니다.", share:`${date}는 아직 기록이 없어요. 도감 채우려면 입력부터!` };
}

function buildDailySpendCard(date, exp, count, rows) {
  const text = rows.map(r => `${r.category || ""} ${r.memo || ""} ${r.raw_text || ""}`).join(" ");
  let key = "DAY_STEADY";
  if (/배달|요기요|쿠팡이츠|배민|야식|치킨|피자|족발|닭발/.test(text)) key = "DAY_DELIVERY";
  else if (/카페|커피|스타벅스|투썸|이디야|메가|컴포즈|빽다방/.test(text)) key = "DAY_CAFE";
  else if (/쇼핑|쿠팡|올리브영|무신사|다이소|택배|주문/.test(text)) key = "DAY_SHOP";
  else if (/마트|장보기|이마트|홈플러스|코스트코|시장/.test(text)) key = "DAY_GROCERY";
  else if (/주유|택시|주차|교통|하이패스/.test(text)) key = "DAY_VEHICLE";
  else if (/병원|약국|치과|진료/.test(text)) key = "DAY_MEDICAL";
  else if (exp >= 100000) key = "DAY_BIGSPEND";
  const map = {
    DAY_DELIVERY:{rarity: exp >= 30000 ? "S":"A", emoji:"🍗🛵", title:"야식 소환사", line:"냉장고는 있는데 주문서가 열렸습니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 야식 소환사 떴다. 내 통장보다 치킨이 날 더 이해함.`},
    DAY_CAFE:{rarity: exp >= 10000 ? "A":"B", emoji:"☕🐹", title:"라떼 자동결제단", line:"카페 앞을 지나가면 카드가 먼저 인사합니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 라떼 자동결제단 떴다 ㅋㅋ 카페가 날 선택했다.`},
    DAY_BIGSPEND:{rarity:"S", emoji:"💥📦", title:"하루 한방 보스", line:"오늘은 가볍게 스쳐간 결제가 아니었습니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 하루 한방 보스 떴다. 카드 알림이 아직도 귀에서 울림.`},
    DAY_SHOP:{rarity:"A", emoji:"📦🛒", title:"장바구니 연구원", line:"필요한 것만 산다고 했는데 왜 박스가 늘어나죠?", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 장바구니 연구원 떴다. 필요해서 눌렀는데 왜 이렇게 많이 왔지.`},
    DAY_GROCERY:{rarity:"B", emoji:"🛒🥬", title:"마트 원정대", line:"우유 하나 사러 갔다가 식량 보급 작전이 됐습니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 마트 원정대 떴다. 카트는 작은데 영수증은 장편소설.`},
    DAY_VEHICLE:{rarity:"B", emoji:"⛽🚕", title:"이동비 연소자", line:"이동할수록 지갑이 연료처럼 타고 있습니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 이동비 연소자 떴다. 나는 이동했고 잔액은 정지했다.`},
    DAY_MEDICAL:{rarity:"B", emoji:"🏥🩹", title:"건강 회복 퀘스트", line:"몸은 회복 중인데 통장은 잠깐 누웠습니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 건강 회복 퀘스트 떴다. 건강은 중요하고 영수증은 매섭다.`},
    DAY_STEADY:{rarity:"B", emoji:"🧾🙂", title:"무난 소비러", line:"큰 폭발 없이 소소하게 지나간 하루 소비 패턴입니다.", sub:`${numberWithCommas(exp)}원 · ${count}건`, share:`${date} 무난 소비러 떴다. 요란하진 않지만 분명히 썼다.`},
  };
  return { kind:"spend", date, styleClass:`rarity-${map[key].rarity} bounce`, ...map[key] };
}

function buildShareWall(monthlyCard, dailyCards) {
  const rare = dailyCards.filter(c => cardGradeScore(c.rarity) >= 5).length;
  const quotes = [
    `이번 달 내 소비몬: ${monthlyCard.title}. 진심 이건 공유각.`,
    monthlyCard.share,
    `이번 달 고급 카드 ${rare}장 획득. 도감 채우는 맛이 생깁니다.`,
    `친구가 이 카드 보고 웃으면 바로 가계부 유입 성공.`,
    `카드가 웃기면 기록도 더 자주 하게 됩니다.`,
    `한 달 도감이 쌓일수록 내 소비 캐릭터성이 선명해져요.`
  ];
  return quotes.map((q, i) => ({ text:q, cls:i%3===0?"blue":i%3===1?"pink":"" }));
}

function isPremiumUnlocked(env) {
  return premiumBetaEnabled(env);
}

function buildPremiumState({ env, month, allRows, analysis, extended }) {
  const unlocked = isPremiumUnlocked(env);
  const expense = Number(analysis.expense || 0);
  const income = Number(analysis.income || 0);
  const forecast = Number(analysis.burnForecast || 0);
  const savingPotential = estimateSavingPotential({ analysis, extended });
  const missions = buildPremiumMissions({ allRows, analysis, extended });
  const budgets = buildSmartBudgets(allRows || [], expense);
  const premiumScore = Math.max(0, Math.min(100, Math.round(100 - Number(analysis.riskScore || 0) * 0.55 + Math.min(20, Number(analysis.noSpendDays || 0)))));
  return {
    month,
    unlocked,
    planName: "성장 리포트",
    premiumScore,
    savingPotential,
    missions,
    budgets,
    report: {
      forecast,
      income,
      overIncome: income > 0 && forecast > income,
      forecastGap: income > 0 ? forecast - income : 0,
      riskScore: analysis.riskScore || 0,
      fixedRate: analysis.fixedRate || 0,
      concentration: analysis.concentration || 0,
      noSpendDays: analysis.noSpendDays || 0,
    },
    availableFeatures: [
      "가족별 소비 비교 리포트",
      "월간 PDF/이미지 리포트",
      "카테고리별 예산 자동 추천",
      "AI 절약 미션",
      "자동 주간·월간 리포트",
    ],
  };
}

function estimateSavingPotential({ analysis, extended }) {
  let value = 0;
  if ((analysis.fixedRate || 0) >= 45) value += Math.round((analysis.fixedExpense || 0) * 0.08);
  if ((analysis.cafeCount || 0) >= 8) value += Math.min(50000, (analysis.cafeCount || 0) * 2500);
  if ((analysis.weekendRate || 0) >= 40) value += Math.round((analysis.weekendExpense || 0) * 0.12);
  if (extended?.topIncrease?.diff > 0) value += Math.round(extended.topIncrease.diff * 0.15);
  return Math.max(0, value);
}

function buildPremiumMissions({ allRows, analysis, extended }) {
  const missions = [];
  if ((analysis.cafeCount || 0) >= 5) missions.push({ title: "카페요정 2회 방어", reward: "예상 절약 9,000원", desc: "이번 주 카페 2번만 집커피/회사커피로 바꿔보기." });
  if ((analysis.weekendRate || 0) >= 35) missions.push({ title: "주말 지갑 브레이크", reward: "주말 소비 -10%", desc: "토/일 중 하루는 무지출 또는 1만원 이하 챌린지." });
  if ((analysis.fixedRate || 0) >= 45) missions.push({ title: "자동이체 검문소", reward: "고정비 구조 점검", desc: "구독/보험/통신비 중 하나만 해지·다운그레이드 후보 찾기." });
  if ((analysis.missingAny || 0) > 0) missions.push({ title: "미분류 퇴치 퀘스트", reward: "분석 정확도 상승", desc: `미분류/수단 미입력 ${analysis.missingAny}건 정리하기.` });
  if (extended?.topIncrease?.diff > 0) missions.push({ title: `${extended.topIncrease.name} 급증 제동`, reward: `${numberWithCommas(Math.round(extended.topIncrease.diff * 0.15))}원 방어 목표`, desc: "전월 대비 가장 늘어난 항목을 다음 주 15%만 줄여보기." });
  missions.push({ title: "기록 연속성 높이기", reward: "분석 정확도 상승", desc: "하루 1회 이상 기록해 빠진 지출과 분석 공백을 줄여보세요." });
  return missions.slice(0, 6);
}

function buildSmartBudgets(rows, totalExpense) {
  const cats = categoryExpenseMap(rows || []);
  const items = Object.entries(cats).map(([name, amount]) => {
    const cutRate = amount > totalExpense * 0.35 ? 0.88 : amount > totalExpense * 0.2 ? 0.92 : 0.96;
    return { name, current: amount, suggested: Math.round(amount * cutRate), diff: Math.round(amount * (1 - cutRate)) };
  }).sort((a, b) => b.diff - a.diff || b.current - a.current);
  return items.slice(0, 8);
}

function renderInlinePremiumTeaser(state) {
  return `<section class="premiumHero"><h3>✨ 무료 스마트 도구</h3><p>이번 달 절약 후보 <b>${numberWithCommas(state.savingPotential)}원</b> · 관리 점수 <b>${state.premiumScore}점</b></p><div class="premiumCta"><a class="dark" href="/smart-tools?month=${encodeURIComponent(state.month)}">스마트 도구 보기</a><span>월말 예측</span><span>반복지출 탐지</span><span>스마트 예산 추천</span></div></section>`;
}

function renderPremiumTab(state) {
  return `<section class="premiumHero"><span class="premiumRibbon">모두 무료</span><h3>✨ 지출을 기록하는 데서 끝내지 않고, 다음 행동까지 알려드립니다</h3><p>월말 예상, 반복지출, 이상지출, 예산 추천을 현재 기록에서 계산합니다. 별도 결제나 구독 등급이 없습니다.</p><div class="premiumCta"><span>관리 점수 ${state.premiumScore}점</span><span>절약 후보 ${numberWithCommas(state.savingPotential)}원</span><span>월말 예상 ${numberWithCommas(state.report.forecast)}원</span><a class="dark" href="/smart-tools?month=${encodeURIComponent(state.month)}">전체 무료 도구</a></div></section><section class="premiumGrid"><div class="premiumCard"><span class="premiumRibbon">월말 예측</span><div class="premiumTitle">예상 지출</div><div class="premiumValue">${numberWithCommas(state.report.forecast)}원</div><div class="premiumDesc">현재 속도를 기준으로 월말 지출을 미리 확인합니다.</div></div><div class="premiumCard"><span class="premiumRibbon">절약 분석</span><div class="premiumTitle">줄일 수 있는 후보</div><div class="premiumValue">${numberWithCommas(state.savingPotential)}원</div><div class="premiumDesc">고정비, 카페, 주말 소비, 급증 항목을 기준으로 계산합니다.</div></div><div class="premiumCard"><span class="premiumRibbon">위험 점검</span><div class="premiumTitle">소비 위험 점수</div><div class="premiumValue">${numberWithCommas(state.report.riskScore)}점</div><div class="premiumDesc">예산·지출 집중도·고정비 비중을 함께 살펴봅니다.</div></div></section><section class="layout2"><div class="card"><h3>🎯 스마트 절약 미션</h3><div class="premiumGrid">${state.missions.map((m)=>`<div class="premiumMission"><div class="missionTop"><b>${escapeHtml(m.title)}</b><span class="missionBadge">${escapeHtml(m.reward)}</span></div><div class="premiumDesc">${escapeHtml(m.desc)}</div></div>`).join("")}</div></div><div class="card"><h3>📊 스마트 예산 추천</h3>${renderPremiumBudgetTable(state.budgets)}</div></section>`;
}

function renderPremiumBudgetTable(items) {
  if (!items.length) return `<div class="empty">예산 추천을 위한 지출 데이터가 없습니다.</div>`;
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>카테고리</th><th>현재</th><th>추천 예산</th><th>절약 후보</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${escapeHtml(x.name)}</b></td><td class="expense">${numberWithCommas(x.current)}원</td><td>${numberWithCommas(x.suggested)}원</td><td class="income">${numberWithCommas(x.diff)}원</td></tr>`).join("")}</tbody></table></div>`;
}

function buildAffiliateState({ env, month, allRows, analysis, extended, origin }) {
  const catMap = categoryExpenseMap(allRows || []);
  const totalExpense = Number(analysis.expense || 0);
  const cards = [
    {
      key: "analysis",
      emoji: "🧠",
      title: "이번 달 소비 점검",
      desc: "월말 예상, 고정비 압박, 소비몬 카드를 같이 보며 이번 달 흐름을 확인합니다.",
      reason: `현재 위험점수 ${analysis.riskScore || 0}점 · 먼저 확인하면 좋은 관리 포인트`,
      score: 90 + Number(analysis.riskScore || 0),
      href: affiliateLink(env, "TIP_ANALYSIS_URL"),
      label: "분석",
    },
    {
      key: "subscription",
      emoji: "🔁",
      title: "구독비 점검",
      desc: "넷플릭스·유튜브·쿠팡와우처럼 자동으로 새는 돈을 한 번씩 확인합니다.",
      reason: `고정비 비중 ${analysis.fixedRate || 0}% · 자동이체/구독 점검 추천`,
      score: Number(analysis.fixedRate || 0) * 2 + Number(catMap["구독"] || 0) / 10000,
      href: affiliateLink(env, "TIP_SUBSCRIPTION_URL"),
      label: "고정비",
    },
    {
      key: "card",
      emoji: "💳",
      title: "결제수단 정리",
      desc: "카드·현금·계좌이체가 섞여 있으면 결제수단부터 정리하면 분석이 훨씬 좋아집니다.",
      reason: `이번 달 지출 ${numberWithCommas(totalExpense)}원 · 결제수단 기준 점검`,
      score: totalExpense / 10000,
      href: affiliateLink(env, "TIP_PAYMENT_URL"),
      label: "정리",
    },
    {
      key: "mart",
      emoji: "🛒",
      title: "장보기 루틴 점검",
      desc: "마트·식료품·생활용품 지출이 많을 때는 주간 장보기 예산을 먼저 잡아봅니다.",
      reason: `장보기/생활용품 ${numberWithCommas((catMap["장보기"] || 0) + (catMap["생활용품"] || 0))}원`,
      score: ((catMap["장보기"] || 0) + (catMap["생활용품"] || 0)) / 10000,
      href: affiliateLink(env, "TIP_MART_URL"),
      label: "생활비",
    },
    {
      key: "cafe",
      emoji: "☕",
      title: "카페 지출 체크",
      desc: "카페 기록이 많을 때는 횟수와 금액을 나눠서 보는 것만으로도 줄일 포인트가 보입니다.",
      reason: `카페/간식 ${analysis.cafeCount || 0}회 · 카페인 대주주 방어용`,
      score: Number(analysis.cafeCount || 0) * 12 + Number(catMap["카페/간식"] || 0) / 10000,
      href: affiliateLink(env, "TIP_CAFE_URL"),
      label: "패턴",
    },
    {
      key: "delivery",
      emoji: "🍗",
      title: "외식/배달 흐름",
      desc: "식비가 커질 때는 평일/주말, 점심/저녁 패턴을 나눠 보면 원인이 잘 보입니다.",
      reason: `식비/배달 ${numberWithCommas((catMap["식비"] || 0) + (catMap["배달/외식"] || 0))}원`,
      score: ((catMap["식비"] || 0) + (catMap["배달/외식"] || 0)) / 10000,
      href: affiliateLink(env, "TIP_FOOD_URL"),
      label: "식비",
    },
    {
      key: "insurance",
      emoji: "🛡️",
      title: "보험/고정비 확인",
      desc: "매달 반복되는 금액은 한 번 정리해두면 다음 달 예측이 훨씬 정확해집니다.",
      reason: `보험/고정비 ${numberWithCommas((catMap["보험"] || 0) + (analysis.fixedExpense || 0))}원`,
      score: (catMap["보험"] || 0) / 10000 + Number(analysis.fixedRate || 0),
      href: affiliateLink(env, "TIP_FIXED_URL"),
      label: "고정비",
    },
    {
      key: "saving",
      emoji: "🐷",
      title: "무지출 챌린지",
      desc: "무지출일이 쌓이면 소비몬 카드가 더 재미있어지고, 월말 잔액도 방어됩니다.",
      reason: `무지출일 ${analysis.noSpendDays || 0}일 · 이번 달 방어력 체크`,
      score: Number(analysis.noSpendDays || 0) * 8,
      href: affiliateLink(env, "TIP_SAVING_URL"),
      label: "절약",
    },
  ];
  const sorted = cards.sort((a, b) => b.score - a.score);
  return {
    month,
    origin,
    cards: sorted,
    topCards: sorted.slice(0, 3),
    disclosure: "이번 달 소비 패턴을 기준으로 우선순위를 정리한 생활비 관리 팁입니다.",
    envNames: ["TIP_ANALYSIS_URL","TIP_PAYMENT_URL","TIP_SUBSCRIPTION_URL","TIP_MART_URL","TIP_CAFE_URL","TIP_FOOD_URL","TIP_FIXED_URL","TIP_SAVING_URL"],
  };
}

function affiliateLink(env, name) {
  const value = String((env && env[name]) || "").trim();
  return value || "#";
}

function renderAffiliateCard(card) {
  const disabled = !card.href || card.href === "#";
  const href = disabled ? "#" : escapeHtml(card.href);
  return `<div class="affiliateCard"><span class="affiliateLabel">${escapeHtml(card.label || "팁")}</span><div style="font-size:34px;margin-top:8px">${escapeHtml(card.emoji || "💡")}</div><div class="affiliateTitle">${escapeHtml(card.title)}</div><div class="affiliateDesc">${escapeHtml(card.desc)}</div><div class="affiliateReason">${escapeHtml(card.reason)}</div><div class="affiliateAction"><small class="muted">우선순위 ${Math.round(card.score || 0)}</small><a class="${disabled ? "disabled" : ""}" href="${href}" target="_blank" rel="noopener">${disabled ? "확인 완료" : "자세히 보기"}</a></div></div>`;
}

function renderInlineAffiliateZone(state) {
  if (!state || !state.topCards) return "";
  return `<section class="card"><div class="sectionHead"><div><h3>💡 이번 달 생활비 팁</h3><p class="muted">소비 패턴에 따라 먼저 보면 좋은 관리 포인트를 정리했습니다.</p></div><a class="chip" href="${escapeHtml(dashboardQuery(state.month, "", { tab: "partners" }))}">전체 보기</a></div><div class="affiliateGrid">${state.topCards.map(renderAffiliateCard).join("")}</div><p class="adDisclosure">${escapeHtml(state.disclosure)}</p></section>`;
}

function renderAffiliateTab(state) {
  return `<section class="partnerHero"><h3>생활비 팁</h3><p class="muted">이번 달 기록을 기준으로 바로 확인하면 좋은 관리 포인트를 정리했습니다.</p></section><section class="card"><h3>이번 달 추천 관리 포인트</h3><div class="affiliateGrid">${state.cards.map(renderAffiliateCard).join("")}</div></section><section class="card"><h3>관리 순서</h3><div class="roadmapGrid"><div class="roadmapBox"><b>1. 미분류 정리</b><span>분류가 비어 있으면 분석이 흐려집니다. 정리센터에서 먼저 확인하세요.</span></div><div class="roadmapBox"><b>2. 결제수단 정리</b><span>카드, 현금, 계좌이체를 구분하면 월별 흐름이 더 잘 보입니다.</span></div><div class="roadmapBox"><b>3. 반복 지출 확인</b><span>관리비, 보험, 구독처럼 매달 나가는 항목을 따로 점검하세요.</span></div></div></section>`;
}

function renderCollectionTab(state, month, origin = "") {
  const monthly = state.monthlyCard;
  const monthlyShareUrl = buildCardShareUrl(origin, month, monthly, "monthly");
  const dailyTop = state.topShare.slice(0, 8).map((c) => renderDailyMiniCard(c, origin, month)).join("");
  const quotes = state.shareWall.map(q => `<div class="shareQuote ${q.cls || ""}">${escapeHtml(q.text)}</div>`).join("");
  return `<section class="packBanner"><b>🎁 이번 달 카드팩 개봉 완료</b><div>월간 대표카드 1장 + 일별 카드 ${state.dailyCards.length}장 · 자랑각 카드만 골라 공유하세요.</div></section><section class="card"><div class="sectionHead"><div><h3>🃏 소비몬 도감 · ${escapeHtml(month)}</h3><p class="muted">월별 대표 카드 1장 + 일별 카드 업그레이드 시스템. 무지출은 연속 일수에 따라 C→B→A→S→SS→SSS로 진화합니다.</p></div><div class="collectionMeta"><span class="metaChip">총 카드 ${state.totalCards}장</span><span class="metaChip">최고 무지출 연속 ${state.noSpendBest}일</span><span class="metaChip">대표 레어도 ${monthly.rarity}</span><span class="metaChip">v3.1 공유카드</span></div></div><div class="collectionGrid"><div class="lootCard ${monthly.styleClass}"><div><span class="rarity">${escapeHtml(monthly.label || "월간 대표 카드")} · ${escapeHtml(monthly.rarity)}</span><div class="cardEmoji">${escapeHtml(monthly.emoji)}</div><div class="cardName">${escapeHtml(monthly.title)}</div><div class="cardLine">${escapeHtml(monthly.tagline)}</div><div class="cardSub">${escapeHtml(monthly.subline || "")}</div><div class="cardBackHint">카드를 누르면 친구한테 보여줄 공유 페이지로 이동합니다.</div></div><div><div class="cardSub">전투력 ${numberWithCommas(monthly.power || 0)}</div><div class="cardShare">${escapeHtml(monthly.share)}</div><div class="shareActions"><a class="shareBtn light" href="${escapeHtml(monthlyShareUrl)}" target="_blank" rel="noopener">공유 카드 열기</a><a class="shareBtn light" href="${escapeHtml(monthlyShareUrl)}">카드만 보기</a></div></div></div><div class="card"><h3>🔥 이번 달 자랑각 카드</h3><p class="muted">레어도가 높거나 연속 무지출 카드가 뜨면 캡처해서 공유하기 좋습니다.</p><div class="lootRow">${dailyTop || "<div class='empty'>아직 일별 카드가 없습니다.</div>"}</div></div></div></section><section class="layout2"><div class="card"><h3>📅 일별 업그레이드 카드</h3><div class="collectionGrid">${state.dailyCards.slice().reverse().map((c) => renderDailyMiniCard(c, origin, month)).join("")}</div></div><div class="card"><h3>💬 공유 멘트 모아보기</h3><div class="shareWall">${quotes}</div><p class="muted">친구가 보고 피식하면 성공입니다. 이번 버전은 공유 전용 카드 페이지까지 열립니다.</p></div></section>`;
}

function renderDailyMiniCard(c, origin = "", month = "") {
  const href = buildCardShareUrl(origin, month, c, "daily");
  return `<div class="lootMini ${escapeHtml(c.styleClass || "rarity-R spark")}"><div><div class="dayBadge">${escapeHtml(c.date)} · ${escapeHtml(c.rarity || c.grade || "")}</div><div class="cardEmoji">${escapeHtml(c.emoji || "🃏")}</div><div class="cardName">${escapeHtml(c.title || "")}</div><div class="cardLine">${escapeHtml(c.line || c.tagline || "")}</div><div class="cardSub">${escapeHtml(c.sub || c.subline || "")}</div></div><div><div class="cardShare">${escapeHtml(c.share || "")}</div><a class="miniShare" href="${escapeHtml(href)}" target="_blank" rel="noopener">공유 카드</a></div></div>`;
}

function buildCardShareUrl(origin, month, card, type) {
  const qs = new URLSearchParams();
  qs.set("type", type || "monthly");
  qs.set("month", month || "");
  qs.set("date", card.date || "");
  qs.set("rarity", card.rarity || card.grade || "R");
  qs.set("emoji", card.emoji || "🃏");
  qs.set("title", card.title || "소비몬 카드");
  qs.set("line", card.line || card.tagline || "");
  qs.set("sub", card.sub || card.subline || "");
  qs.set("share", card.share || "");
  qs.set("power", String(card.power || 0));
  return `${origin || ""}/share?${qs.toString()}`;
}
// @build:exports-start
export {
  buildAffiliateState, buildPremiumState, chooseMemeCard, renderAffiliateTab,
  renderInlineAffiliateZone, renderInlinePremiumTeaser, renderPremiumTab,
};
// @build:exports-end
