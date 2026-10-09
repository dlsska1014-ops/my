// @build:imports-start
import { appName } from "../public/site-config.js";
import { getCookie, htmlResponse, redirectResponse } from "../runtime/http.js";
import { safeAdminReturnPath, verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  attachSpenderNames, fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  canManageMyHousehold, canWriteMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "../my/access-control.js";
import { budgetSummary, fetchBudgets, optionalSupabase } from "../domain/budgets.js";
import {
  lastNDaysExpense, longestNoSpendStreak, makeMemeCard, memeAmountByRegex, memeCardFor,
  memeCountByRegex, todayExpense,
} from "../my/home-sections.js";
import { addQueryToUrl, renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { calculateStats, escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function memeCollectionFor(rows = [], stats = calculateStats([]), budget = null, month = currentMonthKst()) {
  const expense = Number(stats.totals.expense || 0);
  const income = Number(stats.totals.income || 0);
  const balance = income - expense;
  const top = stats.categories.find((c) => c.expense > 0) || { category: '기타', expense: 0 };
  const second = stats.categories.filter((c) => c.expense > 0)[1] || top;
  const todaySpent = todayExpense(rows);
  const weekSpent = lastNDaysExpense(rows, 7);
  const coffee = memeAmountByRegex(rows, /카페|커피|간식|스타벅스|스벅|메가|컴포즈/i);
  const coffeeCount = memeCountByRegex(rows, /카페|커피|간식|스타벅스|스벅|메가|컴포즈/i);
  const shopping = memeAmountByRegex(rows, /쇼핑|쿠팡|구매|의류|잡화|택배/i);
  const food = memeAmountByRegex(rows, /외식|배달|식비|점심|저녁|야식|치킨|피자|햄버거|분식/i);
  const transport = memeAmountByRegex(rows, /교통|택시|버스|지하철|주유|주차/i);
  const medical = memeAmountByRegex(rows, /병원|약국|치과|의료|검진|안과/i);
  const subscription = memeAmountByRegex(rows, /구독|넷플릭스|유튜브|티빙|디즈니|멜론|왓챠/i);
  const kids = memeAmountByRegex(rows, /육아|아이|어린이|문구|장난감|키즈|학원|교육|어린이집|유치원/i);
  const mart = memeAmountByRegex(rows, /마트|장보기|식재료|코스트코|이마트|홈플러스|편의점/i);
  const beauty = memeAmountByRegex(rows, /미용|화장품|헤어|네일|피부|옷|의류/i);
  const culture = memeAmountByRegex(rows, /영화|공연|게임|취미|도서|책|문화|여행|숙박/i);
  const lateNight = rows.filter((r) => r.type !== 'income' && /야식|치킨|피자|족발|라면|맥주|편의점/i.test(`${r.category || ''} ${r.memo || ''}`)).reduce((a, r) => a + Number(r.amount || 0), 0);
  const txCount = rows.length;
  const noSpendStreak = longestNoSpendStreak(rows, month);
  const today = formatDate(nowKstDate());
  const hasTodayExpense = rows.some((r) => r.type !== 'income' && r.transaction_date === today);
  const base = { expense, income, balance, topCategory: top.category, month };
  const cards = [];
  const push = (card) => { if (!card) return; if (!cards.some((x) => x.id === card.id)) cards.push(card); };

  if (!rows.length) {
    push(makeMemeCard({ id:'no-data', rarity:'N', level:'대기', emoji:'🫥', titles:['아직 소비 전', '지갑 워밍업 중'], lines:['기록이 아직 없어요. 첫 입력이 들어오면 소비몬이 깨어납니다.', '지출도 수입도 아직 안 보입니다. 소비몬은 대기실에서 컵라면 먹는 중.'] }, {}, base));
    return cards;
  }

  if (budget?.totalBudget && budget.diff > 150000) push(makeMemeCard({ id:'budget-nuked', rarity:'SSR', level:'예산폭주', theme:'doom', emoji:'💸', titles:['예산 순삭 마라토너', '월급 로그아웃 장인', '예산 파괴왕', '가계부가 기절한 날', '돈 삭제식 집행자'], lines:['예산보다 {diff}원 초과. 이번 달 소비 버튼에 터보가 달렸습니다.', '예산선이 보이자마자 점프해서 넘었습니다. 현재 {diff}원 앞서 나가는 중.', '예산을 지키랬더니 예산을 먹어버렸습니다. 초과 {diff}원.', '통장이 방금 소리 없이 로그아웃했습니다. 초과 {diff}원.', '이건 지출이 아니라 예산과의 공개 결투입니다. 현재 {diff}원 패널티.'], subtitles:['가계부 긴급회의 소집', '소비몬 분노 게이지 MAX', '월말 생존 난이도 상승'] }, { diff:numberWithCommas(budget.diff) }, base));
  else if (budget?.totalBudget && budget.diff > 0) push(makeMemeCard({ id:'budget-over', rarity:'SR', level:'초과', theme:'warning', emoji:'🚨', titles:['예산 탈주범', '가계부 경보 1호', '슬금슬금 초과러', '예산 울린 사람'], lines:['예산보다 {diff}원 더 썼어요. 지갑이 단체 채팅방에서 조용히 나갔습니다.', '이번 달 예산이 "저 먼저 갑니다" 하고 퇴근했습니다. 초과 {diff}원.', '예산은 계획이었고, 결제는 현실이었습니다. 초과 {diff}원.', '가계부가 조용히 한숨 쉬는 중입니다. 초과 {diff}원.'], subtitles:['아직 복구 가능', '월말 방어전 시작', '경고등 ON'] }, { diff:numberWithCommas(budget.diff) }, base));
  else if (budget?.totalBudget && budget.diff <= -100000) push(makeMemeCard({ id:'budget-safe', rarity:'R', level:'방어', theme:'shield', emoji:'🛡️', titles:['예산 수호자', '지갑 국밥충'], lines:['예산까지 {left}원 남았습니다. 오늘은 통장이 당신 편입니다.', '지출을 잘 버텼습니다. 남은 체력 {left}원. 지갑이 엄지척 중.'] }, { left:numberWithCommas(Math.abs(budget.diff)) }, base));

  if (!hasTodayExpense) push(makeMemeCard({ id:'today-nospend', rarity: noSpendStreak >= 3 ? 'SR' : 'R', level:'무지출', theme:'zen', emoji:'🧘', titles:['오늘은 참았다', '무지출 수도승', '카드 냉장보관 성공', '지갑 금식 성공', '결제 버튼과 거리두기'], lines:['오늘은 무지출입니다. 소비몬이 심심해서 벽만 보고 있습니다.', '오늘 카드 사용 0회. 지갑이 드디어 인간답게 살고 있습니다.', '오늘은 참았습니다. 앱이 오히려 사용자를 의심하는 중입니다.', '카드가 하루 종일 잠만 잤습니다. 아주 건강한 방치입니다.', '오늘 지갑은 퇴근도 안 하고 출근도 안 했습니다.'], subtitles:['절약력이 상승했습니다', '소비몬 배고픔', '통장 컨디션 회복'] }, {}, base));
  if (todaySpent >= 150000) push(makeMemeCard({ id:'today-boss', rarity:'SSR', level:'오늘플렉스', theme:'fire', emoji:'🔥', titles:['오늘만 사장님 후원회', '원데이 탕진 클럽', '지출 스프린터', '하루짜리 재벌 체험', '카드 긁는 ASMR 장인'], lines:['오늘 {todaySpent}원 사용. 하루 만에 이번 주 예능 분량을 뽑았습니다.', '오늘만 {todaySpent}원. 카드가 먼저 쓰러지고 사용자가 살아남았습니다.', '오늘 소비가 너무 화끈해서 영수증이 셀카 찍고 싶어 합니다. {todaySpent}원.', '오늘 결제음이 배경음악처럼 깔렸습니다. 총 {todaySpent}원.', '하루 지출이 너무 당당해서 가계부가 박수를 치다가 울었습니다. {todaySpent}원.'], subtitles:['오늘의 하이라이트', '소비몬 급성장', '지출 쇼츠 각'] }, { todaySpent:numberWithCommas(todaySpent) }, base));
  else if (todaySpent >= 70000) push(makeMemeCard({ id:'today-spicy', rarity:'SR', level:'화끈', theme:'spicy', emoji:'🌶️', titles:['하루 소비 드리프트', '오늘 지갑 흔들림 주의'], lines:['오늘 {todaySpent}원. 지갑이 미끄러지듯 휘청했습니다.', '오늘은 소비가 살짝 과했습니다. {todaySpent}원짜리 하루치 드라마 완성.'] }, { todaySpent:numberWithCommas(todaySpent) }, base));

  if (expense >= 1000000) push(makeMemeCard({ id:'monthly-boss', rarity:'SSR', level:'월간보스', theme:'boss', emoji:'👹', titles:['월간 소비 보스', '가계부 레이드 보스'], lines:['{month} 지출 {expenseText}원. 이번 달 최종보스는 {topCategory}입니다.', '월 지출 {expenseText}원 달성. 소비몬이 당신을 상위 랭커로 등록했습니다.'] }, { month, expenseText:numberWithCommas(expense), topCategory:top.category }, base));
  else if (expense <= 300000) push(makeMemeCard({ id:'monthly-calm', rarity:'R', level:'절약', theme:'green', emoji:'🌱', titles:['절약 고수', '잔액 지킴이'], lines:['이번 달 지출 {expenseText}원. 소비몬이 배고파서 풀만 뜯고 있습니다.', '지출이 얌전합니다. 가계부가 드디어 평화를 찾았습니다.'] }, { expenseText:numberWithCommas(expense) }, base));

  push(makeMemeCard({ id:'top-category', rarity:'R', level:'최다분류', theme:'gold', emoji:'👑', titles:['{topCategory} 최종보스', '{topCategory} 지배자'], lines:['이번 달 1위 분류는 {topCategory}. {topExpense}원으로 존재감이 미쳤습니다.', '{topCategory}가 {topExpense}원으로 1위. 다음 타깃은 {secondCategory}.'] }, { topCategory:top.category, topExpense:numberWithCommas(top.expense || 0), secondCategory:second.category }, base));

  if (coffee >= 30000 || coffeeCount >= 6) push(makeMemeCard({ id:'coffee', rarity:'SR', level:'카페인', theme:'coffee', emoji:'☕', titles:['카페 지분 보유자', '아아 없인 못 살아', '원두 교주', '카페인 연료차', '얼죽아 생존자'], lines:['커피/간식 {coffee}원. 원두가 당신 이름으로 적금 붓는 중입니다.', '이번 달 커피 {coffeeCount}잔급 기록. 바리스타가 얼굴 보고 주문 받습니다.', '카페비 {coffee}원. 거의 매장 VIP의 향기가 납니다.'] }, { coffee:numberWithCommas(coffee), coffeeCount }, base));

  if (shopping >= 100000) push(makeMemeCard({ id:'shopping', rarity:'SR', level:'택배', theme:'parcel', emoji:'📦', titles:['택배문 앞 NPC', '쿠팡 새벽의 전설', '결제완료 수집가'], lines:['쇼핑 {shopping}원. 문 앞 택배가 가족보다 먼저 인사합니다.', '이번 달 결제완료 버튼을 너무 사랑했습니다. 쇼핑 {shopping}원.', '택배 상자가 현관을 점령했습니다. 생활 반경이 점점 좁아지는 중.'] }, { shopping:numberWithCommas(shopping) }, base));

  if (food >= 200000) push(makeMemeCard({ id:'food', rarity:'SR', level:'식비', theme:'food', emoji:'🍜', titles:['배달앱 우수회원', '식비 로켓단', '냉장고 패싱러'], lines:['식비/외식 {food}원. 냉장고가 "나도 있는데"라고 속삭입니다.', '이번 달 입보다 앱이 더 바빴습니다. 식비 {food}원.', '배달앱이 당신을 놓치지 않으려 할인쿠폰을 뿌리고 있습니다.'] }, { food:numberWithCommas(food) }, base));

  if (transport >= 100000) push(makeMemeCard({ id:'transport', rarity:'R', level:'교통', theme:'taxi', emoji:'🚕', titles:['택시 친목왕', '도로 위의 후원자'], lines:['교통비 {transport}원. 기사님과 정서적 유대감이 생길 수준입니다.', '지하철보다 택시를 더 믿은 흔적이 보입니다. 교통비 {transport}원.'] }, { transport:numberWithCommas(transport) }, base));

  if (medical >= 50000) push(makeMemeCard({ id:'medical', rarity:'R', level:'의료', theme:'medical', emoji:'🩺', titles:['건강 챙김 챔피언', '병원 풀코스 달성'], lines:['병원/약국 {medical}원. 몸은 힘들어도 가계부는 정직합니다.', '건강은 챙겼지만 통장은 조금 울었습니다. 의료비 {medical}원.'] }, { medical:numberWithCommas(medical) }, base));

  if (subscription >= 30000) push(makeMemeCard({ id:'subscription', rarity:'R', level:'구독', theme:'stream', emoji:'📺', titles:['구독 생태계 핵심고객', '자동결제 방치러'], lines:['구독료 {subscription}원. 해지는 늘 내일의 나에게 맡깁니다.', '이번 달도 자동결제가 사용자를 이겼습니다. 구독료 {subscription}원.'] }, { subscription:numberWithCommas(subscription) }, base));

  if (txCount >= 45) push(makeMemeCard({ id:'tx-master', rarity:'SR', level:'기록왕', theme:'receipt', emoji:'🧾', titles:['영수증 수집가', '기록의 지배자'], lines:['이번 달 {txCount}건 기록. 소비는 몰라도 기록 성실함은 최상급입니다.', '기록 {txCount}건. 이제 영수증이 먼저 와서 자리 맡아둘 정도입니다.'] }, { txCount }, base));

  if (noSpendStreak >= 4) push(makeMemeCard({ id:'streak', rarity:'SR', level:'연속무지출', theme:'trophy', emoji:'🏆', titles:['무지출 연승러', '통장 다이어트 코치'], lines:['최장 무지출 {noSpendStreak}일. 소비몬이 당신을 싫어하기 시작했습니다.', '{noSpendStreak}일 연속 무지출. 통장이 살 빠지는 소리가 들립니다.'] }, { noSpendStreak }, base));

  if (income > 0 && expense > income) push(makeMemeCard({ id:'balance-burn', rarity:'SR', level:'잔액경보', theme:'melt', emoji:'🫠', titles:['통장 다이어트 성공', '잔액 실종 사건'], lines:['수입보다 지출이 많습니다. 잔액이 {balanceText}원 방향으로 사라지는 중.', '이번 달 밸런스가 살짝 아니라 꽤 흔들립니다. 현재 {balanceText}원.'] }, { balanceText:numberWithCommas(balance) }, base));
  else if (income > 0 && balance > 0) push(makeMemeCard({ id:'balance-good', rarity:'R', level:'흑자', theme:'cool', emoji:'😎', titles:['잔액 지키는 사람', '월말 생존자'], lines:['현재 잔액 {balanceText}원. 이번 달은 통장이 사용자 편입니다.', '수입이 지출을 이겼습니다. 흑자 {balanceText}원으로 여유를 챙겼어요.'] }, { balanceText:numberWithCommas(balance) }, base));

  if (kids >= 80000) push(makeMemeCard({ id:'kids', rarity:'SR', level:'육아', theme:'kids', emoji:'🧸', titles:['키즈 지갑 방앗간', '육아는 사랑과 결제', '장난감 경제부 장관'], lines:['육아/교육 {kids}원. 아이는 웃고 지갑은 체력훈련 중입니다.', '키즈 관련 {kids}원. 부모의 사랑은 카드 승인 문자로 증명됩니다.', '오늘도 작은 인간을 위해 큰 결제가 지나갔습니다. {kids}원.'], subtitles:['부모 지갑 체력전', '귀여움 비용 청구됨'] }, { kids:numberWithCommas(kids) }, base));
  if (mart >= 150000) push(makeMemeCard({ id:'mart', rarity:'R', level:'장보기', theme:'mart', emoji:'🛒', titles:['마트 카트 폭주족', '장보기 원정대', '냉장고 보급부대'], lines:['마트/장보기 {mart}원. 카트는 가벼웠는데 영수증은 무거웠습니다.', '식재료를 샀는데 결제액은 장비 풀세트입니다. {mart}원.', '냉장고 채우려다 통장이 비었습니다. 장보기 {mart}원.'], subtitles:['생활비 현실판', '카트에 담긴 월급 조각'] }, { mart:numberWithCommas(mart) }, base));
  if (beauty >= 80000) push(makeMemeCard({ id:'beauty', rarity:'R', level:'꾸밈', theme:'beauty', emoji:'💅', titles:['꾸밈비 스탯 강화', '외모 버프 결제완료', '거울 앞 투자자'], lines:['미용/의류 {beauty}원. 오늘의 나는 어제보다 비쌉니다.', '꾸밈비 {beauty}원. 지갑은 울지만 거울은 박수칩니다.', '외모 버프는 적용됐고 통장 디버프도 같이 왔습니다.'], subtitles:['자존감 상승 비용', '비주얼 투자 완료'] }, { beauty:numberWithCommas(beauty) }, base));
  if (culture >= 70000) push(makeMemeCard({ id:'culture', rarity:'R', level:'문화', theme:'neon', emoji:'🎮', titles:['현생 탈출 후원자', '문화생활 만렙 준비생', '취미 과금러'], lines:['문화/취미 {culture}원. 현실은 힘들지만 콘텐츠는 달콤했습니다.', '취미비 {culture}원. 행복을 샀으니 배송비는 정신승리입니다.', '이번 달도 현생 탈출 티켓을 끊었습니다. {culture}원.'], subtitles:['행복 회복 아이템', '정신건강 비용 처리'] }, { culture:numberWithCommas(culture) }, base));
  if (lateNight >= 40000) push(makeMemeCard({ id:'latenight', rarity:'SR', level:'야식', theme:'night', emoji:'🌙', titles:['야식 앞 무장해제', '밤 11시의 결제왕', '치킨 호출 마법사'], lines:['야식 {lateNight}원. 밤이 깊을수록 배달앱은 선명해집니다.', '늦은 밤 {lateNight}원. 위장은 웃고 지갑은 잠을 설쳤습니다.', '치킨은 죄가 없습니다. 결제한 손가락이 문제입니다. {lateNight}원.'], subtitles:['밤에는 이성이 약해짐', '배달앱 야간근무 성공'] }, { lateNight:numberWithCommas(lateNight) }, base));

  return cards.slice(0, 8);
}

function memeShareText(card, month = currentMonthKst()) {
  return `${card.emoji} ${card.title} [${card.rarity}]\n${card.line}\n\n${month} 지출 ${numberWithCommas(card.expense || 0)}원 · TOP ${card.topCategory || '기타'}\n${card.shareTag || '#소비몬 #가계부밈'}`;
}

function renderV81MemeCards(cards = [], month = currentMonthKst(), householdId = '') {
  return cards.map((c, idx) => `<article class="memeMini v8-meme-mini theme-${escapeHtml(c.theme || 'chaos')}"><div class="v8-meme-mini-top"><span class="rarity ${escapeHtml(String(c.rarity || 'R').toLowerCase())}">${escapeHtml(c.rarity || 'R')}</span><span class="level">${escapeHtml(c.level)}</span></div><div class="emoji">${escapeHtml(c.emoji)}</div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.line)}</p><small>${escapeHtml(c.subtitle || '소비몬 자동 판정')}</small><div class="memeMiniActions v8-meme-mini-actions"><button type="button" data-share="${escapeHtml(memeShareText(c, month))}" onclick="copyMemeText(this)">문구 복사</button><a href="/meme?month=${encodeURIComponent(month)}&card=${encodeURIComponent(c.id || idx)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ''}">공유 카드</a></div></article>`).join('');
}

function memeThemeCss(card = {}) {
  if (/SSR/.test(card.rarity || "")) return "linear-gradient(135deg,#312e81,#6d28d9,#ec4899)";
  if (/SR/.test(card.rarity || "")) return "linear-gradient(135deg,#7c2d12,#ea580c,#f59e0b)";
  const theme = String(card.theme || "");
  if (theme === "green" || theme === "zen" || theme === "shield") return "linear-gradient(135deg,#064e3b,#16a34a,#bbf7d0)";
  if (theme === "gold" || theme === "trophy") return "linear-gradient(135deg,#78350f,#f59e0b,#fef3c7)";
  if (theme === "coffee") return "linear-gradient(135deg,#3f2412,#92400e,#fbbf24)";
  if (theme === "parcel" || theme === "mart") return "linear-gradient(135deg,#1e3a8a,#2563eb,#93c5fd)";
  if (theme === "food" || theme === "night") return "linear-gradient(135deg,#581c87,#db2777,#f9a8d4)";
  if (theme === "stream" || theme === "neon") return "linear-gradient(135deg,#020617,#7c3aed,#22d3ee)";
  return "linear-gradient(135deg,#111827,#1d4ed8)";
}

function memeSvgColors(card = {}) {
  const theme = String(card.theme || "");
  if (/SSR/.test(card.rarity || "")) return ["#312e81", "#ec4899"];
  if (/SR/.test(card.rarity || "")) return ["#7c2d12", "#f59e0b"];
  if (["green","zen","shield"].includes(theme)) return ["#064e3b", "#22c55e"];
  if (["gold","trophy"].includes(theme)) return ["#78350f", "#f59e0b"];
  if (theme === "coffee") return ["#3f2412", "#f59e0b"];
  if (["parcel","mart"].includes(theme)) return ["#1e3a8a", "#60a5fa"];
  if (["food","night"].includes(theme)) return ["#581c87", "#f472b6"];
  if (["stream","neon"].includes(theme)) return ["#020617", "#22d3ee"];
  return ["#111827", "#2563eb"];
}

function wrapSvgText(text = "", max = 14) {
  const raw = String(text || "");
  const words = raw.includes(" ") ? raw.split(/\s+/) : raw.split("");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = raw.includes(" ") ? (line ? `${line} ${word}` : word) : `${line}${word}`;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= 4) break;
  }
  if (line && lines.length < 5) lines.push(line);
  return lines.slice(0, 5);
}

async function resolveMemeScope(request, env, url, { writeOnly = false, manageOnly = false } = {}) {
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const requestedId = String(url.searchParams.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  if (adminOk) {
    const households = await fetchAdminHouseholds(env);
    const selectedHousehold = (requestedId ? households.find((h) => String(h.id) === requestedId) : null) || households[0] || null;
    if (requestedId && !households.some((h) => String(h.id) === requestedId)) {
      return { response: htmlResponse("<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>접근할 수 없는 가계부</title><body><main style='max-width:640px;margin:40px auto;padding:20px;font-family:sans-serif'><h1>이 가계부에 접근할 수 없습니다.</h1><p>가계부 목록에서 이용 가능한 가계부를 다시 선택해 주세요.</p><p><a href='/my/households'>가계부 목록으로</a></p></main></body>", 403) };
    }
    return { response: null, adminOk: true, userId: "", user: null, month, households, selectedHousehold, role: "admin" };
  }
  const userId = await verifyUserSession(request, env);
  if (!userId) return { response: redirectResponse("/my") };
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, requestedId);
  if (access.restricted) return { response: myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month }) };
  if (requestedId && !access.memberships.some((h) => String(h.id) === requestedId)) {
    return { response: htmlResponse("<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>접근할 수 없는 가계부</title><body><main style='max-width:640px;margin:40px auto;padding:20px;font-family:sans-serif'><h1>이 가계부에 접근할 수 없습니다.</h1><p>다른 가계부의 데이터는 볼 수 없습니다. 내 가계부 목록에서 다시 선택해 주세요.</p><p><a href='/my/households'>가계부 목록으로</a></p></main></body>", 403) };
  }
  if (!access.selected) return { response: htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" })) };
  if (manageOnly && !canManageMyHousehold(access.selected.role)) {
    return { response: myAccessStatusResponse({ env, user, household: access.selected, role: access.selected.role, month, manageOnly: true }) };
  }
  if (writeOnly && !canWriteMyHousehold(access.selected.role)) {
    return { response: myAccessStatusResponse({ env, user, household: access.selected, role: access.selected.role, month, manageOnly: true }) };
  }
  return { response: null, adminOk: false, userId, user, month, households: access.households, selectedHousehold: access.selected, role: access.selected.role };
}

async function loadMemeCardForRequest(env, url, scope = null) {
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = scope?.households || await fetchAdminHouseholds(env);
  const requestedId = String(url.searchParams.get("household_id") || "").trim();
  const selectedHousehold = scope?.selectedHousehold || (requestedId ? households.find((h) => String(h.id) === requestedId) : null) || households[0] || null;
  const householdId = selectedHousehold?.id || "";
  const rows = selectedHousehold ? await fetchAdminRows(env, { month, householdId: selectedHousehold.id, type: "all" }) : [];
  const stats = calculateStats(rows);
  const budgets = await fetchBudgets(env, selectedHousehold?.id || "", month);
  const budget = budgetSummary(rows, budgets);
  const cards = memeCollectionFor(rows, stats, budget, month);
  const cardId = url.searchParams.get("card") || cards[0]?.id || "main";
  const card = cards.find((c) => c.id === cardId) || cards[0] || memeCardFor({ rows, stats, budget, month });
  return { month, households, householdId, selectedHousehold, rows, stats, budget, cards, card };
}

function renderMemeSvg(card, month) {
  const [c1, c2] = memeSvgColors(card);
  const titleLines = wrapSvgText(card.title || "소비몬", 9).slice(0, 3);
  const bodyLines = wrapSvgText(card.line || "", 18).slice(0, 5);
  const titleSvg = titleLines.map((line, i) => `<text x="60" y="${190 + i * 54}" font-size="46" font-weight="900" fill="#ffffff">${escapeHtml(line)}</text>`).join("");
  const bodySvg = bodyLines.map((line, i) => `<text x="60" y="${380 + i * 34}" font-size="25" font-weight="700" fill="#ffffff" opacity="0.92">${escapeHtml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#000000" flood-opacity="0.28"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="#0f172a"/>
  <rect x="54" y="54" width="972" height="1242" rx="72" fill="url(#bg)" filter="url(#shadow)"/>
  <circle cx="920" cy="170" r="170" fill="#ffffff" opacity="0.14"/>
  <circle cx="880" cy="1140" r="260" fill="#ffffff" opacity="0.08"/>
  <text x="60" y="132" font-size="28" font-weight="900" fill="#ffffff" opacity="0.92">소비몬 카드 · ${escapeHtml(card.rarity || "R")}</text>
  <text x="60" y="166" font-size="24" font-weight="700" fill="#ffffff" opacity="0.78">${escapeHtml(card.level || "밈")}</text>
  <text x="60" y="270" font-size="120" fill="#ffffff">${escapeHtml(card.emoji || "😶")}</text>
  ${titleSvg}
  ${bodySvg}
  <text x="60" y="1120" font-size="26" font-weight="900" fill="#ffffff" opacity="0.88">${escapeHtml(month)} · 지출 ${numberWithCommas(card.expense || 0)}원 · TOP ${escapeHtml(card.topCategory || "기타")}</text>
  <text x="60" y="1170" font-size="24" font-weight="800" fill="#ffffff" opacity="0.76">${escapeHtml(card.subtitle || "소비몬 자동 판정")}</text>
  <text x="60" y="1235" font-size="22" font-weight="800" fill="#ffffff" opacity="0.66">#소비몬 #가계부밈</text>
</svg>`;
}

async function handleMemeImage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, card } = await loadMemeCardForRequest(env, url, scope);
  const svg = renderMemeSvg(card, month);
  const filename = `sobimon-${month}-${String(card.id || "card").replace(/[^a-zA-Z0-9_-]/g, "")}.svg`;
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

async function fetchSavedMemeCards(env, householdId = "", month = "") {
  const buildParams = (mode = "stats") => {
    const params = new URLSearchParams();
    const selects = {
      stats: "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,like_count,share_count,view_count,public_like_count,last_viewed_at,created_at",
      metrics: "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,like_count,share_count,created_at",
      basic: "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,created_at",
    };
    params.set("select", selects[mode] || selects.basic);
    if (householdId) params.set("household_id", `eq.${householdId}`);
    if (month) params.set("month", `eq.${month}`);
    params.set("order", "created_at.desc");
    params.set("limit", "120");
    return params;
  };
  let rows = [];
  try {
    rows = await supabase(env, `/rest/v1/accountbook_meme_cards?${buildParams("stats").toString()}`, { method: "GET" });
  } catch (err) {
    try {
      rows = await supabase(env, `/rest/v1/accountbook_meme_cards?${buildParams("metrics").toString()}`, { method: "GET" });
    } catch (err2) {
      rows = await optionalSupabase(env, `/rest/v1/accountbook_meme_cards?${buildParams("basic").toString()}`, { method: "GET" }, []);
    }
  }
  return (rows || []).map((r) => ({
    ...r,
    like_count: Number(r.like_count || 0),
    share_count: Number(r.share_count || 0),
    view_count: Number(r.view_count || 0),
    public_like_count: Number(r.public_like_count || 0),
  }));
}

async function incrementMemeMetric(env, id, field, householdId = "") {
  if (!id || !["like_count", "share_count", "view_count", "public_like_count"].includes(field)) throw new Error("invalid metric");
  const householdFilter = householdId ? `&household_id=eq.${encodeURIComponent(householdId)}` : "";
  const rows = await supabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(id)}${householdFilter}&select=id,${field}&limit=1`, { method: "GET" });
  const row = rows?.[0];
  if (!row) throw new Error("meme card not found");
  const next = {};
  next[field] = Number(row[field] || 0) + 1;
  if (field === "view_count") next.last_viewed_at = new Date().toISOString();
  await supabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(id)}${householdFilter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(next),
  });
}

async function safeIncrementMemeMetric(env, id, field) {
  try {
    await incrementMemeMetric(env, id, field);
    return true;
  } catch (err) {
    return false;
  }
}

async function handleMemeReact(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const type = String(form.get("type") || "like").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", "/meme-archive");
  const field = type === "share" ? "share_count" : "like_count";
  try {
    const row = await loadSavedMemeCardById(env, id);
    if (!row?.household_id) return redirectResponse(addQueryToUrl(returnTo, { err: "카드의 가계부 범위를 확인할 수 없습니다." }));
    const scopeUrl = new URL("https://local/meme-archive");
    scopeUrl.searchParams.set("month", validMonth(row.month) || currentMonthKst());
    scopeUrl.searchParams.set("household_id", row.household_id);
    const scope = await resolveMemeScope(request, env, scopeUrl);
    if (scope.response) return scope.response;
    await incrementMemeMetric(env, id, field, scope.selectedHousehold.id);
    return redirectResponse(addQueryToUrl(returnTo, { msg: type === "share" ? "meme_shared" : "meme_liked" }));
  } catch (err) {
    return redirectResponse(addQueryToUrl(returnTo, { err: "반응 저장 실패: 저장 구조 확인 실행 필요" }));
  }
}

async function handleMemeSave(request, env) {
  const form = await request.formData();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const cardId = String(form.get("card_id") || "main").trim() || "main";
  const url = new URL("https://local/meme");
  url.searchParams.set("month", month);
  url.searchParams.set("card", cardId);
  if (householdId) url.searchParams.set("household_id", householdId);
  const scope = await resolveMemeScope(request, env, url, { writeOnly: true });
  if (scope.response) return scope.response;
  const scopedHouseholdId = scope.selectedHousehold?.id || "";
  const { card } = await loadMemeCardForRequest(env, url, scope);
  const row = {
    household_id: scopedHouseholdId || null,
    month,
    card_id: String(card.id || cardId).slice(0, 80),
    rarity: String(card.rarity || "R").slice(0, 10),
    level: String(card.level || "밈").slice(0, 40),
    theme: String(card.theme || "chaos").slice(0, 40),
    emoji: String(card.emoji || "😶").slice(0, 20),
    title: String(card.title || "소비몬").slice(0, 120),
    line: String(card.line || "").slice(0, 500),
    subtitle: String(card.subtitle || "").slice(0, 200),
    share_text: memeShareText(card, month).slice(0, 900),
    like_count: 0,
    share_count: 0,
  };
  try {
    await supabase(env, "/rest/v1/accountbook_meme_cards", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    return redirectResponse(`/meme-archive?month=${encodeURIComponent(month)}${scopedHouseholdId ? `&household_id=${encodeURIComponent(scopedHouseholdId)}` : ""}&msg=meme_saved`);
  } catch (err) {
    return redirectResponse(`/meme-archive?month=${encodeURIComponent(month)}${scopedHouseholdId ? `&household_id=${encodeURIComponent(scopedHouseholdId)}` : ""}&err=${encodeURIComponent("밈카드 저장 실패: 저장 구조 확인 실행 필요")}`);
  }
}

async function handleMemeDelete(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", "/meme-archive");
  if (!id) return redirectResponse(addQueryToUrl(returnTo, { err: "삭제할 카드 ID가 없습니다." }));
  try {
    const row = await loadSavedMemeCardById(env, id);
    if (!row?.household_id) return redirectResponse(addQueryToUrl(returnTo, { err: "카드의 가계부 범위를 확인할 수 없습니다." }));
    const scopeUrl = new URL("https://local/meme-archive");
    scopeUrl.searchParams.set("month", validMonth(row.month) || currentMonthKst());
    scopeUrl.searchParams.set("household_id", row.household_id);
    const scope = await resolveMemeScope(request, env, scopeUrl, { manageOnly: true });
    if (scope.response) return scope.response;
    await supabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(id)}&household_id=eq.${encodeURIComponent(scope.selectedHousehold.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return redirectResponse(addQueryToUrl(returnTo, { msg: "meme_deleted" }));
  } catch (err) {
    return redirectResponse(addQueryToUrl(returnTo, { err: "밈카드 삭제 실패" }));
  }
}

async function handleMemeRankPage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, households, selectedHousehold } = scope;
  const cards = (await fetchSavedMemeCards(env, selectedHousehold?.id || "", month))
    .sort((a, b) => (Number(b.share_count || 0) + Number(b.like_count || 0) * 2) - (Number(a.share_count || 0) + Number(a.like_count || 0) * 2));
  const currentPath = `/meme-rank?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}`;
  const top = cards[0];
  const rows = cards.length ? cards.slice(0, 30).map((c, idx) => `<article class="rankCard"><div class="rankNo">#${idx + 1}</div><div class="emoji">${escapeHtml(c.emoji || "😶")}</div><div><h2>${escapeHtml(c.title || "소비몬")}</h2><p>${escapeHtml(c.line || "")}</p><small>${escapeHtml(c.rarity || "R")} · ${escapeHtml(c.level || "밈")} · 👍 ${numberWithCommas(c.like_count || 0)} · 공유 ${numberWithCommas(c.share_count || 0)}</small></div><div class="actions"><form method="post" action="/admin/meme/react"><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><input type="hidden" name="type" value="like"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><button type="submit">👍</button></form><form method="post" action="/admin/meme/react"><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><input type="hidden" name="type" value="share"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><button type="submit">공유+1</button></form><a href="/meme?month=${encodeURIComponent(c.month || month)}&card=${encodeURIComponent(c.card_id || "main")}${c.household_id ? `&household_id=${encodeURIComponent(c.household_id)}` : ""}">열기</a></div></article>`).join("") : `<section class="empty"><h2>랭킹을 만들 저장 카드가 없습니다.</h2><p>먼저 /meme에서 도감 저장을 해주세요.</p></section>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>밈카드 랭킹</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1000px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.top a,.top button{color:#111827;text-decoration:none;background:#fff;border:1px solid #d1d5db;padding:10px 12px;border-radius:14px;font-weight:900}.hero{background:linear-gradient(135deg,#4c1d95,#db2777,#f59e0b);border-radius:28px;padding:20px;margin:16px 0;box-shadow:0 18px 40px rgba(0,0,0,.24);color:#fff}.hero h1{font-size:34px;margin:0}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.filters select,.filters input{height:42px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;font:inherit;background:#fff;color:#111827}.rankList{display:grid;gap:12px}.rankCard{display:grid;grid-template-columns:52px 58px 1fr auto;gap:12px;align-items:center;background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:14px;color:#111827;box-shadow:0 10px 24px rgba(15,23,42,.05)}.rankNo{font-size:22px;font-weight:1000}.emoji{font-size:42px}.rankCard h2{margin:0}.rankCard p{margin:5px 0;line-height:1.45}.rankCard small{color:#64748b;font-weight:900}.actions{display:grid;grid-template-columns:1fr;gap:7px;min-width:82px}.actions a,.actions button{height:34px;border:0;border-radius:12px;background:#fff;color:#111827;text-decoration:none;font-weight:1000;display:flex;align-items:center;justify-content:center;width:100%}.actions form{margin:0}.empty{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;color:#111827}@media(max-width:680px){.rankCard{grid-template-columns:44px 48px 1fr}.actions{grid-column:1/-1;grid-template-columns:1fr 1fr 1fr}}</style></head><body>${renderUnifiedNav("meme-rank", { month, householdId: selectedHousehold?.id || "" })}<main class="wrap"><div class="top"><div><h1>밈카드 랭킹</h1><p>좋아요와 공유 횟수로 이번 달 인기 소비몬을 정렬합니다.</p></div><nav><a href="/meme-archive?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">도감</a> <a href="/meme-lab?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">카드 만들기</a> <a href="/meme-stats?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">통계</a> <a href="/app?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}#meme">앱</a></nav></div><section class="hero"><h1>${top ? `${escapeHtml(top.emoji || "🏆")} 1위 ${escapeHtml(top.title || "소비몬")}` : "🏆 아직 랭킹 없음"}</h1><p>${top ? escapeHtml(top.line || "") : "저장한 밈카드에 좋아요와 공유를 누르면 랭킹이 생성됩니다."}</p></section><form class="filters" method="get" action="/meme-rank"><select name="household_id">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selectedHousehold?.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form><section class="rankList" style="margin-top:16px">${rows}</section></main></body></html>`);
}

async function handleMemeArchivePage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, households, selectedHousehold } = scope;
  const cards = await fetchSavedMemeCards(env, selectedHousehold?.id || "", month);
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const currentPath = `/meme-archive?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}`;
  const cardHtml = cards.length ? cards.map((c) => `<article class="savedCard theme-${escapeHtml(c.theme || "chaos")}"><div class="badgeRow"><span>${escapeHtml(c.rarity || "R")}</span><span>${escapeHtml(c.level || "밈")}</span></div><div class="emoji">${escapeHtml(c.emoji || "😶")}</div><h2>${escapeHtml(c.title || "소비몬")}</h2><p>${escapeHtml(c.line || "")}</p><small>${escapeHtml(c.subtitle || "")}</small><div class="metrics"><span>👍 ${numberWithCommas(c.like_count || 0)}</span><span>공유 ${numberWithCommas(c.share_count || 0)}</span></div><div class="actions"><button type="button" data-share="${escapeHtml(c.share_text || "")}" onclick="copyArchive(this)">복사</button><button type="button" data-public="/share/meme?id=${encodeURIComponent(c.id)}" onclick="copyPublicLink(this)">공개링크</button><form method="post" action="/admin/meme/react"><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><input type="hidden" name="type" value="like"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><button type="submit">좋아요</button></form><form method="post" action="/admin/meme/react"><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><input type="hidden" name="type" value="share"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><button type="submit">공유+1</button></form><a href="/share/meme?id=${encodeURIComponent(c.id)}">공개보기</a><a href="/meme?month=${encodeURIComponent(c.month || month)}&card=${encodeURIComponent(c.card_id || "main")}${c.household_id ? `&household_id=${encodeURIComponent(c.household_id)}` : ""}">공유 카드</a><form method="post" action="/admin/meme/delete" onsubmit="return confirm('저장한 소비 카드를 삭제할까요?')"><input type="hidden" name="id" value="${escapeHtml(c.id)}"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><button type="submit">삭제</button></form></div></article>`).join("") : `<section class="empty"><h2>아직 저장한 소비 카드가 없습니다.</h2><p>소비 카드 만들기에서 마음에 드는 카드를 연 뒤 “보관함에 저장”을 눌러보세요.</p><p>저장이 계속 실패하면 가계부 관리자에게 저장 구조 확인을 요청해 주세요.</p></section>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>소비 카드 보관함</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{width:100%;max-width:1100px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.top a,.top button{color:#111827;text-decoration:none;background:#fff;border:1px solid #d1d5db;padding:10px 12px;border-radius:14px;font-weight:900}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.filters select,.filters input{height:42px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;font:inherit;background:#fff;color:#111827}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:16px}.savedCard{border-radius:24px;padding:16px;min-height:330px;background:linear-gradient(135deg,#111827,#7c3aed,#ec4899);color:#fff;box-shadow:0 18px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden}.savedCard:after{content:"";position:absolute;right:-36px;top:-36px;width:130px;height:130px;border-radius:999px;background:rgba(255,255,255,.16)}.badgeRow{display:flex;gap:8px;position:relative;z-index:1}.badgeRow span,.metrics span{font-size:12px;border-radius:999px;background:rgba(255,255,255,.18);padding:6px 9px;font-weight:1000}.emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif!important;font-size:44px;position:relative;z-index:1}.wrap .savedCard h2{margin:0;font-size:22px;line-height:1.1;position:relative;z-index:1;color:#fff!important}.savedCard p{line-height:1.45;font-weight:800;position:relative;z-index:1}.savedCard small{opacity:.82;font-weight:900;position:relative;z-index:1}.metrics{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto;position:relative;z-index:1}.actions a,.actions button{height:38px;border:0;border-radius:13px;background:#fff;color:#111827;text-decoration:none;font-weight:1000;display:flex;align-items:center;justify-content:center;width:100%;font-size:12px}.actions form{margin:0}.grid>.empty{grid-column:1/-1;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin-top:0;color:#111827}.empty h2{font-size:22px;line-height:1.35;word-break:keep-all}.empty p{line-height:1.6;word-break:keep-all}.notice{border-radius:14px;padding:12px;margin-top:12px;font-weight:900}.ok{background:#dcfce7;color:#166534}.err{background:#fee2e2;color:#991b1b}@media(max-width:420px){.wrap{padding:12px}.grid{grid-template-columns:minmax(0,1fr)}.top h1{font-size:26px}}</style></head><body>${renderUnifiedNav("meme-archive", { month, householdId: selectedHousehold?.id || "" })}<main class="wrap"><div class="top"><div><h1>소비 카드 보관함</h1><p>저장한 소비 카드를 다시 보고 공유할 수 있습니다.</p></div><nav><a href="/app?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}#meme">앱</a> <a href="/meme-lab?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">카드 만들기</a> <a href="/meme-rank?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">랭킹</a> <a href="/meme-stats?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">통계</a></nav></div>${msg ? `<div class="notice ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="notice err">${escapeHtml(err)}</div>` : ""}<form class="filters" method="get" action="/meme-archive"><select name="household_id">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selectedHousehold?.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form><section class="grid">${cardHtml}</section></main><script>function copyArchive(btn){var text=btn.getAttribute('data-share')||'';if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){btn.textContent='복사됨';});}else{prompt('복사하세요',text);}}function copyPublicLink(btn){var path=btn.getAttribute('data-public')||'';var link=location.origin+path;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(function(){btn.textContent='링크복사됨';});}else{prompt('공개 링크',link);}}</script></body></html>`);
}

async function loadSavedMemeCardById(env, id) {
  const clean = String(id || "").trim();
  if (!clean) return null;
  const fullSelect = "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,like_count,share_count,view_count,public_like_count,last_viewed_at,created_at";
  const metricSelect = "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,like_count,share_count,created_at";
  const basicSelect = "id,household_id,month,card_id,rarity,level,theme,emoji,title,line,subtitle,share_text,created_at";
  let rows = [];
  try {
    rows = await supabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(clean)}&select=${encodeURIComponent(fullSelect)}&limit=1`, { method: "GET" });
  } catch (err) {
    try {
      rows = await supabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(clean)}&select=${encodeURIComponent(metricSelect)}&limit=1`, { method: "GET" });
    } catch (err2) {
      rows = await optionalSupabase(env, `/rest/v1/accountbook_meme_cards?id=eq.${encodeURIComponent(clean)}&select=${encodeURIComponent(basicSelect)}&limit=1`, { method: "GET" }, []);
    }
  }
  return rows?.[0] || null;
}

function publicMemeCardFromRow(row = {}) {
  return {
    id: row.card_id || row.id || "shared",
    saved_id: row.id || "",
    household_id: row.household_id || "",
    month: row.month || currentMonthKst(),
    rarity: row.rarity || "R",
    level: row.level || "밈",
    theme: row.theme || "chaos",
    emoji: row.emoji || "😶",
    title: row.title || "소비몬",
    line: row.line || "",
    subtitle: row.subtitle || "공유된 소비몬 카드",
    share_text: row.share_text || "",
    expense: 0,
    topCategory: "공유",
    like_count: Number(row.like_count || 0),
    share_count: Number(row.share_count || 0),
    view_count: Number(row.view_count || 0),
    public_like_count: Number(row.public_like_count || 0),
  };
}

function publicShareUrl(request, id) {
  const u = new URL(request.url);
  return `${u.origin}/share/meme?id=${encodeURIComponent(id || "")}`;
}

async function handlePublicMemeImage(request, env, url) {
  const row = await loadSavedMemeCardById(env, url.searchParams.get("id"));
  if (!row) return htmlResponse("<!doctype html><meta charset='utf-8'><body>공유 카드를 찾지 못했습니다.</body>", 404);
  const card = publicMemeCardFromRow(row);
  const svg = renderMemeSvg(card, card.month);
  const filename = `sobimon-share-${String(row.id || "card").replace(/[^a-zA-Z0-9_-]/g, "")}.svg`;
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function publicMemeCookieName(prefix, id) {
  const clean = String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "card";
  return `sobimon_${prefix}_${clean}`;
}

function publicMemeSetCookie(name, maxAge = 2592000) {
  return `${name}=1; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
}

async function handlePublicMemeLike(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const cookieName = publicMemeCookieName("liked", id);
  const already = getCookie(request, cookieName);
  if (!id) return redirectResponse("/share/meme");
  if (already) return redirectResponse(`/share/meme?id=${encodeURIComponent(id)}&liked=already`);
  await safeIncrementMemeMetric(env, id, "public_like_count");
  await safeIncrementMemeMetric(env, id, "like_count");
  return redirectResponse(`/share/meme?id=${encodeURIComponent(id)}&liked=1`, {
    "set-cookie": publicMemeSetCookie(cookieName, 60 * 60 * 24 * 30),
  });
}

async function handlePublicMemeShareCount(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  if (id) await safeIncrementMemeMetric(env, id, "share_count");
  return redirectResponse(`/share/meme?id=${encodeURIComponent(id)}&shared=1`);
}

async function handlePublicMemeSharePage(request, env, url) {
  const row = await loadSavedMemeCardById(env, url.searchParams.get("id"));
  if (!row) {
    return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>소비몬 카드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:520px;margin:0 auto;padding:30px}.box{background:rgba(255,255,255,.08);border-radius:24px;padding:20px}</style></head><body><main class="wrap"><section class="box"><h1>공유 카드를 찾지 못했습니다.</h1><p>카드가 삭제되었거나 링크가 잘못되었을 수 있습니다.</p></section></main></body></html>`, 404);
  }
  const viewCookie = publicMemeCookieName("viewed", row.id);
  const alreadyViewed = !!getCookie(request, viewCookie);
  const viewed = !alreadyViewed && await safeIncrementMemeMetric(env, row.id, "view_count");
  const likedState = url.searchParams.get("liked") || "";
  const sharedState = url.searchParams.get("shared") || "";
  const alreadyLiked = !!getCookie(request, publicMemeCookieName("liked", row.id));
  const card = publicMemeCardFromRow(row);
  if (viewed) card.view_count += 1;
  const theme = memeThemeCss(card);
  const shareText = card.share_text || memeShareText(card, card.month);
  const publicUrl = publicShareUrl(request, row.id);
  const imageUrl = `/share/meme-image?id=${encodeURIComponent(row.id)}`;
  const kakaoJsKey = String("" || "");
  const notice = likedState === "1" ? `<div class="notice">좋아요가 반영됐습니다.</div>` : likedState === "already" ? `<div class="notice">이미 이 카드에 좋아요를 눌렀습니다.</div>` : sharedState === "1" ? `<div class="notice">공유 횟수를 반영했습니다.</div>` : "";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta property="og:title" content="${escapeHtml(card.emoji)} ${escapeHtml(card.title)}"/><meta property="og:description" content="${escapeHtml(card.line)}"/><title>${escapeHtml(card.title)} · 소비몬 공유</title>${kakaoJsKey ? `<script src="https://developers.kakao.com/sdk/js/kakao.min.js"></script>` : ""}<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:520px;margin:0 auto;padding:18px}.card{min-height:560px;border-radius:34px;padding:28px;color:#fff;background:${theme};box-shadow:0 28px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}.card:after{content:"";position:absolute;right:-60px;top:-60px;width:230px;height:230px;border-radius:999px;background:rgba(255,255,255,.14)}.emoji{font-size:82px}.pillRow{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}.pill{display:inline-flex;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);padding:8px 13px;border-radius:999px;font-weight:1000}.rarity{background:#fff;color:#111827}.card h1{font-size:36px;line-height:1.05;margin:14px 0;position:relative;z-index:1}.card p{font-size:20px;line-height:1.45;font-weight:850;position:relative;z-index:1}.meta{font-weight:900;opacity:.88;position:relative;z-index:1}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;position:relative;z-index:1}.metric{border-radius:16px;background:rgba(255,255,255,.16);padding:10px;text-align:center;font-weight:1000}.metric span{display:block;font-size:11px;opacity:.82}.actions{display:grid;gap:10px;margin-top:14px}.actions a,.actions button{height:48px;border:0;border-radius:16px;background:#fff;color:#111827;font-weight:1000;text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:15px;width:100%}.actions form{margin:0}.notice{background:#dcfce7;color:#166534;border-radius:16px;padding:12px;margin:12px 0;font-weight:1000}.hint{font-size:13px;line-height:1.6;color:#475569;margin-top:10px}</style></head><body><main class="wrap">${notice}<section class="card"><div><div class="pillRow"><span class="pill rarity">${escapeHtml(card.rarity || "R")}</span><span class="pill">${escapeHtml(card.level || "밈")}</span></div><div class="emoji">${escapeHtml(card.emoji || "😶")}</div><h1>${escapeHtml(card.title || "소비몬")}</h1><p>${escapeHtml(card.line || "")}</p><div class="meta">${escapeHtml(card.month || "")} · 공개 공유 카드</div><div class="metrics"><div class="metric"><span>조회</span>${numberWithCommas(card.view_count || 0)}</div><div class="metric"><span>좋아요</span>${numberWithCommas(card.public_like_count || card.like_count || 0)}</div><div class="metric"><span>공유</span>${numberWithCommas(card.share_count || 0)}</div></div></div></section><div class="actions"><form method="post" action="/share/meme/like"><input type="hidden" name="id" value="${escapeHtml(row.id)}"/><button type="submit">${alreadyLiked ? "👍 좋아요 완료" : "👍 좋아요"}</button></form><button type="button" onclick="kakaoSdkShare()">카카오 공유 공유</button><button type="button" onclick="nativeShare()">기본 공유</button><button type="button" onclick="copyShare()">문구 복사</button><form method="post" action="/share/meme/share"><input type="hidden" name="id" value="${escapeHtml(row.id)}"/><button type="submit">공유 횟수 반영</button></form><button type="button" onclick="downloadPng()">PNG 다운로드</button><a href="${escapeHtml(imageUrl)}">SVG 저장</a></div><p class="hint">공유키가 설정되어 있으면 카카오 공유 공유를 우선 사용합니다. 미설정이면 기본 공유/복사로 자동 대체됩니다.</p></main><script>const SHARE_TEXT=${JSON.stringify(shareText)};const PUBLIC_URL=${JSON.stringify(publicUrl)};const IMAGE_URL=${JSON.stringify(imageUrl)};const 공유키=${JSON.stringify(kakaoJsKey)};const CARD_TITLE=${JSON.stringify(card.title || "소비몬")};async function markShared(){try{var f=new FormData();f.append("id",${JSON.stringify(row.id)});await fetch("/share/meme/share",{method:"POST",body:f});}catch(e){}}function copyShare(){var text=SHARE_TEXT+"\\n"+PUBLIC_URL;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){alert("공유 문구와 링크를 복사했어요.");});}else{prompt("복사하세요",text);}}async function nativeShare(){await markShared();var data={title:CARD_TITLE,text:SHARE_TEXT,url:PUBLIC_URL};if(navigator.share){try{await navigator.share(data);return;}catch(e){}}copyShare();}async function kakaoSdkShare(){await markShared();try{if(공유키&&window.Kakao){if(!Kakao.isInitialized())Kakao.init(공유키);if(Kakao.Share&&Kakao.Share.sendDefault){Kakao.Share.sendDefault({objectType:"text",text:SHARE_TEXT,link:{mobileWebUrl:PUBLIC_URL,webUrl:PUBLIC_URL},buttonTitle:"소비몬 카드 보기"});return;}}}catch(e){console.warn(e);}nativeShare();}async function downloadPng(){try{var res=await fetch(IMAGE_URL);var svg=await res.text();var blob=new Blob([svg],{type:"image/svg+xml"});var url=URL.createObjectURL(blob);var img=new Image();img.onload=function(){var canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;var ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(function(png){var a=document.createElement("a");a.href=URL.createObjectURL(png);a.download="sobimon-card.png";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1500);},"image/png");};img.onerror=function(){URL.revokeObjectURL(url);location.href=IMAGE_URL;};img.src=url;}catch(e){alert("PNG 변환이 어려워 SVG 파일로 저장합니다.");location.href=IMAGE_URL;}}</script></body></html>`;
  return htmlResponse(html, 200, viewed ? { "set-cookie": publicMemeSetCookie(viewCookie, 60 * 60 * 6) } : {});
}

async function handleMemePublicStatsPage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, households, selectedHousehold } = scope;
  const cards = await fetchSavedMemeCards(env, selectedHousehold?.id || "", month);
  const totals = cards.reduce((a, c) => {
    a.views += Number(c.view_count || 0);
    a.publicLikes += Number(c.public_like_count || 0);
    a.likes += Number(c.like_count || 0);
    a.shares += Number(c.share_count || 0);
    return a;
  }, { views: 0, publicLikes: 0, likes: 0, shares: 0 });
  const ranked = [...cards].sort((a, b) => (Number(b.view_count || 0) + Number(b.public_like_count || 0) * 3 + Number(b.share_count || 0) * 2) - (Number(a.view_count || 0) + Number(a.public_like_count || 0) * 3 + Number(a.share_count || 0) * 2));
  const maxValue = Math.max(1, ...ranked.map((c) => Number(c.view_count || 0) + Number(c.public_like_count || 0) * 3 + Number(c.share_count || 0) * 2));
  const chartRows = ranked.length ? ranked.slice(0, 10).map((c, i) => {
    const score = Number(c.view_count || 0) + Number(c.public_like_count || 0) * 3 + Number(c.share_count || 0) * 2;
    const w = Math.max(4, Math.round(score / maxValue * 100));
    return `<div class="barRow"><div class="barLabel">#${i + 1} ${escapeHtml(c.emoji || "")} ${escapeHtml(c.title || "")}</div><div class="barTrack"><i style="--w:${w}%"></i></div><b>${numberWithCommas(score)}</b></div>`;
  }).join("") : `<p class="note">아직 차트로 볼 데이터가 없습니다.</p>`;
  const rows = ranked.length ? ranked.slice(0, 50).map((c, i) => `<tr><td>#${i + 1}</td><td>${escapeHtml(c.emoji || "")} ${escapeHtml(c.title || "")}</td><td>${escapeHtml(c.rarity || "R")}</td><td>${numberWithCommas(c.view_count || 0)}</td><td>${numberWithCommas(c.public_like_count || 0)}</td><td>${numberWithCommas(c.share_count || 0)}</td><td><a href="/share/meme?id=${encodeURIComponent(c.id)}">공개</a></td></tr>`).join("") : `<tr><td colspan="7">아직 공개 유입 데이터가 없습니다. /meme-archive에서 공개링크를 공유해보세요.</td></tr>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>공개 공유 통계</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{width:100%;max-width:1100px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.top a,.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900;padding:0 12px;border:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}.kpi,.chart{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.055)}.kpi span{display:block;color:#64748b;font-weight:900;font-size:12px}.kpi b{font-size:24px}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.filters select,.filters input{height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;font:inherit;background:#fff}table{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden;margin-top:14px}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:14px}a{color:#2563eb;font-weight:900}.note{color:#64748b;line-height:1.6}.barRow{display:grid;grid-template-columns:220px 1fr 70px;gap:10px;align-items:center;margin:10px 0}.barLabel{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900}.barTrack{height:16px;background:#e5e7eb;border-radius:999px;overflow:hidden}.barTrack i{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,#7c3aed,#ec4899,#f59e0b);border-radius:999px}.barRow b{text-align:right}@media(max-width:640px){.barRow{grid-template-columns:1fr}.barRow b{text-align:left}}</style></head><body>${renderUnifiedNav("meme-stats", { month, householdId: selectedHousehold?.id || "" })}<main class="wrap"><div class="top"><div><h1>공개 공유 통계</h1><p class="note">공개 링크 조회, 공개 좋아요, 공유 횟수를 한 화면에서 봅니다.</p></div><nav><a href="/meme-archive?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">도감</a> <a href="/meme-rank?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}">랭킹</a> <a href="/app?month=${encodeURIComponent(month)}${selectedHousehold?.id ? `&household_id=${encodeURIComponent(selectedHousehold.id)}` : ""}#meme">앱</a></nav></div><form class="filters" method="get" action="/meme-stats"><select name="household_id">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selectedHousehold?.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button class="btn" type="submit">조회</button></form><section class="cards"><div class="kpi"><span>공개 조회</span><b>${numberWithCommas(totals.views)}</b></div><div class="kpi"><span>공개 좋아요</span><b>${numberWithCommas(totals.publicLikes)}</b></div><div class="kpi"><span>관리자 좋아요 포함</span><b>${numberWithCommas(totals.likes)}</b></div><div class="kpi"><span>공유 횟수</span><b>${numberWithCommas(totals.shares)}</b></div></section><section class="chart"><h2>인기 카드 차트</h2><p class="note">점수 = 조회 1점 + 공개 좋아요 3점 + 공유 2점</p>${chartRows}</section><table><thead><tr><th>순위</th><th>카드</th><th>희귀도</th><th>조회</th><th>공개 좋아요</th><th>공유</th><th>링크</th></tr></thead><tbody>${rows}</tbody></table><p class="note">좋아요 중복 방지는 브라우저 쿠키 기준입니다. 조회 수는 같은 브라우저에서 6시간 중복 방지됩니다.</p></main></body></html>`);
}

async function handleMemeSharePage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, householdId, card } = await loadMemeCardForRequest(env, url, scope);
  const share = memeShareText(card, month);
  const theme = memeThemeCss(card);
  const imageUrl = `/meme-image?month=${encodeURIComponent(month)}&card=${encodeURIComponent(card.id || "main")}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  const kakaoJsKey = String("" || "");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(card.title)} · 소비몬</title>${kakaoJsKey ? `<script src="https://developers.kakao.com/sdk/js/kakao.min.js"></script>` : ""}<style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:520px;margin:0 auto;padding:18px}.card{min-height:560px;border-radius:34px;padding:28px;color:#fff;background:${theme};box-shadow:0 28px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}.card:after{content:"";position:absolute;right:-60px;top:-60px;width:230px;height:230px;border-radius:999px;background:rgba(255,255,255,.14)}.emoji{font-size:82px}.pillRow{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}.pill{display:inline-flex;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);padding:8px 13px;border-radius:999px;font-weight:1000}.rarity{background:#fff;color:#111827}.card h1{font-size:36px;line-height:1.05;margin:14px 0;position:relative;z-index:1}.card p{font-size:20px;line-height:1.45;font-weight:850;position:relative;z-index:1}.meta{font-weight:900;opacity:.88;position:relative;z-index:1}.actions{display:grid;gap:10px;margin-top:14px}.actions a,.actions button{height:48px;border:0;border-radius:16px;background:#fff;color:#111827;font-weight:1000;text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:15px;width:100%}.actions form{margin:0}.hint{font-size:13px;line-height:1.6;color:#475569;margin-top:10px}@media print{.actions,.hint{display:none}.wrap{padding:0}.card{border-radius:0;box-shadow:none;min-height:100vh}}</style></head><body><main class="wrap"><section class="card"><div><div class="pillRow"><span class="pill rarity">${escapeHtml(card.rarity || "R")}</span><span class="pill">${escapeHtml(card.level)}</span></div><div class="emoji">${escapeHtml(card.emoji)}</div><h1>${escapeHtml(card.title)}</h1><p>${escapeHtml(card.line)}</p><div class="meta">${escapeHtml(month)} · 지출 ${numberWithCommas(card.expense || 0)}원 · TOP ${escapeHtml(card.topCategory || "기타")}</div></div></section><div class="actions"><button type="button" onclick="copyShare()">공유 문구 복사</button><button type="button" onclick="kakaoLikeShare()">카카오 공유 공유</button><button type="button" onclick="downloadPng()">PNG 다운로드</button><a href="${escapeHtml(imageUrl)}">SVG 저장</a><form method="post" action="/admin/meme/save"><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="card_id" value="${escapeHtml(card.id || "main")}"/><button type="submit">도감 저장</button></form><button type="button" onclick="window.print()">인쇄/저장</button><a href="/meme-lab?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}">카드 만들기</a><a href="/meme-archive?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}">도감</a><a href="/meme-rank?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}">랭킹</a><a href="/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}#meme">앱으로</a></div><p class="hint">공유키가 설정되어 있으면 카카오 공유 공유를 우선 사용합니다.</p></main><script>const SHARE_TEXT=${JSON.stringify(share)};const IMAGE_URL=${JSON.stringify(imageUrl)};const 공유키=${JSON.stringify(kakaoJsKey)};const CARD_TITLE=${JSON.stringify(card.title || "소비몬")};function copyShare(){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(SHARE_TEXT).then(function(){alert("공유 문구를 복사했어요.");});}else{prompt("복사하세요",SHARE_TEXT);}}async function kakaoLikeShare(){try{if(공유키&&window.Kakao){if(!Kakao.isInitialized())Kakao.init(공유키);if(Kakao.Share&&Kakao.Share.sendDefault){Kakao.Share.sendDefault({objectType:"text",text:SHARE_TEXT,link:{mobileWebUrl:location.href,webUrl:location.href},buttonTitle:"소비몬 카드 보기"});return;}}}catch(e){console.warn(e);}const data={title:CARD_TITLE,text:SHARE_TEXT,url:location.href};if(navigator.share){try{await navigator.share(data);return;}catch(e){}}copyShare();alert("카카오 공유 키가 없거나 공유창을 열 수 없어 문구를 복사했습니다.");}async function downloadPng(){try{var res=await fetch(IMAGE_URL);var svg=await res.text();var blob=new Blob([svg],{type:"image/svg+xml"});var url=URL.createObjectURL(blob);var img=new Image();img.onload=function(){var canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;canvas.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(function(png){var a=document.createElement("a");a.href=URL.createObjectURL(png);a.download="sobimon-card.png";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1500);},"image/png");};img.onerror=function(){URL.revokeObjectURL(url);location.href=IMAGE_URL;};img.src=url;}catch(e){alert("PNG 변환이 어려워 SVG 파일로 저장합니다.");location.href=IMAGE_URL;}}</script></body></html>`);
}

async function handleMemeLabPage(request, env, url) {
  const scope = await resolveMemeScope(request, env, url);
  if (scope.response) return scope.response;
  const { month, households, selectedHousehold } = scope;
  const householdId = selectedHousehold?.id || '';
  const members = selectedHousehold ? await fetchHouseholdMembers(env, selectedHousehold.id) : [];
  const rows = attachSpenderNames(await fetchAdminRows(env, { month, householdId: selectedHousehold?.id || '', type: 'all' }), members);
  const stats = calculateStats(rows);
  const budgets = await fetchBudgets(env, selectedHousehold?.id || '', month);
  const budget = budgetSummary(rows, budgets);
  const cards = memeCollectionFor(rows, stats, budget, month);
  const title = escapeHtml(appName(env));
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 소비 카드 만들기</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.wrap{width:100%;max-width:980px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.top a{color:#111827;text-decoration:none;background:#fff;border:1px solid #d1d5db;padding:10px 12px;border-radius:14px;font-weight:900}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}.card{min-width:0;border-radius:24px;padding:16px;min-height:250px;background:linear-gradient(135deg,#111827,#7c3aed,#ec4899);color:#fff;box-shadow:0 18px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden}.card:after{content:"";position:absolute;right:-30px;top:-30px;width:120px;height:120px;border-radius:999px;background:rgba(255,255,255,.18)}.row{display:flex;gap:8px;position:relative;z-index:1}.pill{font-size:12px;border-radius:999px;background:rgba(255,255,255,.18);padding:6px 9px;font-weight:1000}.emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif!important;font-size:44px;position:relative;z-index:1}.wrap .card h2{margin:0;font-size:22px;line-height:1.1;position:relative;z-index:1;color:#fff!important}.card p{line-height:1.45;font-weight:800;position:relative;z-index:1;word-break:keep-all}.card small{opacity:.82;font-weight:900;position:relative;z-index:1}.actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:auto;position:relative;z-index:1}.actions button,.actions a{min-width:0;height:38px;border:0;border-radius:13px;background:#fff;color:#111827;text-decoration:none;font-weight:1000;display:flex;align-items:center;justify-content:center}@media(max-width:420px){.wrap{padding:12px}.grid{grid-template-columns:1fr}.top>div{min-width:0}.top h1{font-size:26px}}</style></head><body>${renderUnifiedNav("meme-lab", { month, householdId: selectedHousehold?.id || "" })}<main class="wrap"><div class="top"><div><h1>소비 카드 만들기</h1><p>이번 달 소비 데이터를 가볍고 재미있는 카드로 정리합니다.</p></div><nav><a href="/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ''}#meme">가계부로</a></nav></div><section class="grid">${cards.map((c, idx) => `<article class="card"><div class="row"><span class="pill">${escapeHtml(c.rarity || 'R')}</span><span class="pill">${escapeHtml(c.level)}</span></div><div class="emoji">${escapeHtml(c.emoji)}</div><h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.line)}</p><small>${escapeHtml(c.subtitle || '')}</small><div class="actions"><button type="button" data-share="${escapeHtml(memeShareText(c, month))}" onclick="copyLab(this)">복사</button><a href="/meme?month=${encodeURIComponent(month)}&card=${encodeURIComponent(c.id || idx)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ''}">공유</a><a href="/meme-image?month=${encodeURIComponent(month)}&card=${encodeURIComponent(c.id || idx)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ''}">이미지</a></div></article>`).join('')}</section></main><script>function copyLab(btn){var text=btn.getAttribute('data-share')||'';if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){btn.textContent='복사됨';});}else{prompt('복사하세요',text);}}</script></body></html>`);
}
// @build:exports-start
export {
  handleMemeArchivePage, handleMemeDelete, handleMemeImage, handleMemeLabPage,
  handleMemePublicStatsPage, handleMemeRankPage, handleMemeReact, handleMemeSave,
  handleMemeSharePage, handlePublicMemeImage, handlePublicMemeLike, handlePublicMemeShareCount,
  handlePublicMemeSharePage, memeCollectionFor,
};
// @build:exports-end
