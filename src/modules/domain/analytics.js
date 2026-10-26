// @build:imports-start
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import { monthSpendingOutlook } from "./spending-outlook.js";
import { chooseMemeCard } from "../features/meme-engine-premium.js";
import { isMissingCategory, isMissingPayment } from "../kakao/reply-texts.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { calculateStats, escapeHtml, numberWithCommas } from "./transactions-core.js";
// @build:imports-end

function addMonthsYm(month, delta) {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function calculateExtendedAnalytics({ month, allRows, prevRows, historyRows, yearRows, rowsBase }) {
  const current = calculateStats(allRows);
  const prev = calculateStats(prevRows);
  const expenseMoMRate = percentChange(current.totals.expense, prev.totals.expense);
  const monthlyTrend = [];
  for (let i = -11; i <= 0; i++) {
    const ym = addMonthsYm(month, i);
    const rs = historyRows.filter((r) => String(r.transaction_date || "").slice(0, 7) === ym);
    const st = calculateStats(rs);
    monthlyTrend.push({ month: ym, income: st.totals.income, expense: st.totals.expense, balance: st.totals.balance, count: rs.length });
  }
  const threeMonthTrend = monthlyTrend.slice(-3);
  const currentCat = categoryExpenseMap(allRows);
  const prevCat = categoryExpenseMap(prevRows);
  const names = new Set([...Object.keys(currentCat), ...Object.keys(prevCat)]);
  const categoryCompare = [...names].map((name) => {
    const currentExpense = currentCat[name] || 0;
    const prevExpense = prevCat[name] || 0;
    return { name, current: currentExpense, previous: prevExpense, diff: currentExpense - prevExpense, rate: percentChange(currentExpense, prevExpense) };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.current - a.current);
  const topNames = [...new Set(categoryCompare.filter((x) => x.current > 0 || x.previous > 0).slice(0, 8).map((x) => x.name))];
  const categoryTrend3 = topNames.map((name) => ({ name, months: threeMonthTrend.map((m) => ({ month: m.month, amount: categoryExpenseMap(historyRows.filter((r) => String(r.transaction_date || "").slice(0, 7) === m.month))[name] || 0 })) }));
  const yearMonths = [];
  for (let i = 1; i <= 12; i++) {
    const ym = `${month.slice(0, 4)}-${String(i).padStart(2, "0")}`;
    const rs = yearRows.filter((r) => String(r.transaction_date || "").slice(0, 7) === ym);
    const st = calculateStats(rs);
    yearMonths.push({ month: ym, income: st.totals.income, expense: st.totals.expense, balance: st.totals.balance, count: rs.length });
  }
  const weekdayStats = buildWeekdayStats(yearRows.length ? yearRows : historyRows);
  const topIncrease = categoryCompare.find((x) => x.diff > 0 && x.current > 0) || { name: "없음", diff: 0, rate: 0 };
  const topDecrease = categoryCompare.find((x) => x.diff < 0) || { name: "없음", diff: 0, rate: 0 };
  // 3개월 가운데 수입이든 지출이든 기록이 있는 달은 모두 분모에 넣는다. 지출 0원인 달도 기록이 있으면
  // 0원으로 센다(QA B03: [0, 0, 30000] 은 10,000원). 기록이 하나도 없는 달은 쓰기 전 기간이라 빼고,
  // 화면에는 몇 개월 평균인지 적는다.
  const recordedMonths = threeMonthTrend.filter((x) => x.count > 0);
  const avg3 = recordedMonths.length ? Math.round(recordedMonths.reduce((s, x) => s + x.expense, 0) / recordedMonths.length) : 0;
  const cleanupCount = rowsBase.filter((r) => isMissingCategory(r.category) || (r.type === "expense" && isMissingPayment(r.payment_method))).length;
  return { current, prev, expenseMoMRate, monthlyTrend, threeMonthTrend, categoryCompare, categoryTrend3, yearMonthSummary: yearMonths, weekdayStats, topIncrease, topDecrease, avg3Expense: avg3, avg3Months: recordedMonths.length, cleanupCount };
}

function categoryExpenseMap(rows) {
  const map = Object.create(null);
  for (const r of rows || []) {
    if (r.type === "income") continue;
    const k = r.category || "미분류";
    map[k] = (map[k] || 0) + Number(r.amount || 0);
  }
  return map;
}

function percentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatSignedPercent(v) {
  if (v > 0) return `+${v}%`;
  if (v < 0) return `${v}%`;
  return "0%";
}

// V22.9.76 감사 D-13: 이전 값이 0원이면 증감률을 만들지 않는다. percentChange 가 돌려주는 "+100%"는 없던 비교를
// 지어낸 숫자다. 분류는 "새로 생김", 전체 지출은 리포트와 같은 "비교 기록 없음"으로 쓴다.
function formatChangeRate(current, previous, emptyLabel = "새로 생김") {
  const prev = Number(previous || 0);
  const cur = Number(current || 0);
  if (!prev) return cur ? emptyLabel : "0%";
  return formatSignedPercent(percentChange(cur, prev));
}

// V22.9.79 감사 V44 D-13(남은 몫): 관리자 PC 분석·대시보드·주간 리포트도 이전 값이 0원이면 증감률(+100%)을 지어내지 않고
// 이전 값이 0원이었다고 말한다. 사용자 화면(formatChangeRate)과 같은 규칙이다.
function formatChangeAgainst(label, current, previous) {
  const prev = Number(previous || 0);
  const cur = Number(current || 0);
  if (!prev) return cur ? `${label} 비교 기록 없음` : `${label} 대비 0%`;
  return `${label} 대비 ${formatSignedPercent(percentChange(cur, prev))}`;
}

function deltaClass(v) {
  return v > 0 ? "deltaUp" : v < 0 ? "deltaDown" : "deltaFlat";
}

function buildWeekdayStats(rows) {
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const map = names.map((name) => ({ name, income: 0, expense: 0, count: 0 }));
  for (const r of rows || []) {
    const d = new Date(String(r.transaction_date || "").replace(/-/g, "/"));
    const idx = Number.isFinite(d.getTime()) ? d.getDay() : 0;
    const amount = Number(r.amount || 0);
    if (r.type === "income") map[idx].income += amount; else map[idx].expense += amount;
    map[idx].count += 1;
  }
  return map;
}

function renderStrategyCards(ext, a) {
  const cards = [
    // 분석 기간 기록이 한도를 넘어 일부만 읽었으면 먼저 알린다(QA B05).
    ...(ext.historyTruncated ? [{ cls: "danger", title: "분석 범위", value: "일부만 분석", desc: "기간 기록이 6,000건을 넘어 최신 6,000건으로 계산했습니다. 정확한 합계는 월별 화면과 CSV에서 확인하세요." }] : []),
    { cls: !Number(ext.prev?.totals?.expense || 0) ? "" : ext.expenseMoMRate > 20 ? "danger" : ext.expenseMoMRate > 5 ? "warn" : "good", title: "전월 대비 지출", value: formatChangeRate(ext.current?.totals?.expense, ext.prev?.totals?.expense, "비교 기록 없음"), desc: `전월 ${numberWithCommas(ext.prev.totals.expense)}원 → 이번 달 ${numberWithCommas(ext.current.totals.expense)}원` },
    { cls: ext.avg3Expense > 0 && ext.current.totals.expense > ext.avg3Expense * 1.2 ? "warn" : "good", title: "3개월 평균 대비", value: `${numberWithCommas(ext.avg3Expense)}원`, desc: `최근 3개월 중 기록이 있는 ${ext.avg3Months ?? 3}개월의 평균입니다(지출 0원인 달 포함). 이번 달 속도와 비교하세요.` },
    { cls: ext.cleanupCount > 0 ? "danger" : "good", title: "분석 신뢰도", value: `${ext.cleanupCount}건`, desc: "미정리 데이터가 적을수록 고급 분석이 정확해집니다." },
    { cls: ext.topIncrease.diff > 0 ? "warn" : "good", title: "최대 증가 항목", value: ext.topIncrease.name, desc: `${numberWithCommas(ext.topIncrease.diff)}원 증가 · ${formatChangeRate(ext.topIncrease.current, ext.topIncrease.previous)}` },
    { cls: a.weekendRate >= 45 ? "warn" : "good", title: "주말 소비", value: `${a.weekendRate}%`, desc: "주말 외식·여가성 소비 비중을 점검하세요." },
    { cls: a.basisDays === 0 ? "" : a.riskScore >= 70 ? "danger" : a.riskScore >= 45 ? "warn" : "good", title: "가계부 경보", value: a.basisDays === 0 ? "관측 전" : `${a.riskScore}점`, desc: "고정비, 쏠림, 미정리, 월말 예상치를 종합한 점수입니다." },
  ];
  return cards.map((c) => `<div class="insight ${c.cls}"><b>${escapeHtml(c.title)}</b><div style="font-size:24px;font-weight:950;letter-spacing:-.04em">${escapeHtml(c.value)}</div><div class="muted">${escapeHtml(c.desc)}</div></div>`).join("");
}

function renderMonthlyTrendMini(items) {
  if (!items.length) return `<div class="empty">데이터가 없습니다.</div>`;
  const max = Math.max(1, ...items.map((x) => x.expense));
  return `<div class="trendBars">${items.map((x) => `<div class="trendLine"><div class="trendLabel">${escapeHtml(x.month)}</div><div class="bar"><span style="width:${Math.round(x.expense / max * 100)}%"></span></div><div class="trendValue expense">${numberWithCommas(x.expense)}원</div></div>`).join("")}</div>`;
}

function renderMonthlyTrendTable(items) {
  if (!items.length) return `<div class="empty">데이터가 없습니다.</div>`;
  const max = Math.max(1, ...items.map((x) => x.expense));
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>월</th><th>지출 추이</th><th>수입</th><th>지출</th><th>잔액</th><th>건수</th></tr></thead><tbody>${items.map((x) => `<tr><td><b>${escapeHtml(x.month)}</b></td><td><div class="bar"><span style="width:${Math.round(x.expense / max * 100)}%"></span></div></td><td class="income">${numberWithCommas(x.income)}원</td><td class="expense">${numberWithCommas(x.expense)}원</td><td>${numberWithCommas(x.balance)}원</td><td>${x.count}건</td></tr>`).join("")}</tbody></table></div>`;
}

function renderCategoryCompareTable(items, compact) {
  if (!items.length) return `<div class="empty">비교할 데이터가 없습니다.</div>`;
  const rows = compact ? items.slice(0, 8) : items;
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>카테고리</th><th>이번 달</th><th>전월</th><th>차이</th><th>증감률</th></tr></thead><tbody>${rows.map((x) => `<tr><td><b>${escapeHtml(x.name)}</b></td><td class="expense">${numberWithCommas(x.current)}원</td><td>${numberWithCommas(x.previous)}원</td><td class="${deltaClass(x.diff)}">${x.diff >= 0 ? "+" : ""}${numberWithCommas(x.diff)}원</td><td class="${deltaClass(x.rate)}">${formatChangeRate(x.current, x.previous)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderCategoryTrendTable(items) {
  if (!items.length) return `<div class="empty">3개월 비교 데이터가 없습니다.</div>`;
  const months = items[0].months.map((m) => m.month);
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>카테고리</th>${months.map((m) => `<th>${escapeHtml(m)}</th>`).join("")}<th>흐름</th></tr></thead><tbody>${items.map((x) => { const max = Math.max(1, ...x.months.map((m) => m.amount)); return `<tr><td><b>${escapeHtml(x.name)}</b></td>${x.months.map((m) => `<td>${numberWithCommas(m.amount)}원</td>`).join("")}<td><div class="bar"><span style="width:${Math.round((x.months[x.months.length - 1].amount || 0) / max * 100)}%"></span></div></td></tr>`; }).join("")}</tbody></table></div>`;
}

function renderYearlyMonthSummary(items) {
  const available = items.filter((x) => x.count > 0 || x.income > 0 || x.expense > 0);
  if (!available.length) return `<div class="empty">올해 데이터가 없습니다.</div>`;
  return renderMonthlyTrendTable(available);
}

function renderWeekdayStats(items) {
  if (!items.length) return `<div class="empty">요일별 데이터가 없습니다.</div>`;
  const max = Math.max(1, ...items.map((x) => x.expense));
  return `<div class="trendBars">${items.map((x) => `<div class="trendLine"><div class="trendLabel">${escapeHtml(x.name)}요일</div><div class="bar"><span style="width:${Math.round(x.expense / max * 100)}%"></span></div><div class="trendValue">${numberWithCommas(x.expense)}원 · ${x.count}건</div></div>`).join("")}</div>`;
}

// Explicit calendar bounds for the D-3 server comparisons and budget pace.
// A complete empty array is an observed zero; missing data is never a zero.
function monthObservation(month, rows, { receipt = null, endDay = null } = {}) {
  const today = formatDate(nowKstDate());
  const valid = /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(month));
  const daysInMonth = valid ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;
  const sameMonth = valid && month === today.slice(0, 7);
  const pastMonth = valid && month < today.slice(0, 7);
  const days = endDay == null ? (pastMonth ? daysInMonth : sameMonth ? Number(today.slice(8, 10)) : 0) : Math.min(daysInMonth, endDay);
  const end = days ? `${month}-${String(days).padStart(2, "0")}` : "";
  const available = valid && Array.isArray(rows) && (!receipt || receipt.status === "complete") && rows.every(row => row && typeof row.transaction_date === "string" && row.transaction_date.length === 10 && isValidTransactionDateString(row.transaction_date) && row.amount != null && String(row.amount).trim() !== "" && Number.isFinite(Number(row.amount)));
  const status = !available ? "unavailable" : !days ? "before" : "complete";
  return { today, daysInMonth, sameMonth, pastMonth, days, end, status,
    rows: status === "complete" ? rows.filter(row => row.transaction_date >= `${month}-01` && row.transaction_date <= end) : null };
}

function monthlyObservedSpending(rows, month) {
  if (!Array.isArray(rows) || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(month))) throw new Error("analysis_observation_invalid");
  const today = formatDate(nowKstDate());
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const basisDays = month < today.slice(0, 7) ? daysInMonth : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;
  const basisEnd = basisDays ? `${month}-${String(basisDays).padStart(2, "0")}` : "";
  const observed = rows.filter((r) => r.type === "expense" && String(r.transaction_date || "") >= `${month}-01` && String(r.transaction_date || "") <= basisEnd);
  const observedExpense = observed.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const expenseDays = new Set(observed.filter((r) => Number(r.amount) > 0).map((r) => r.transaction_date)).size;
  return {
    observedExpense, basisDays, basisEnd, daysInMonth, hasObservation: basisDays > 0,
    avgExpense: basisDays ? Math.round(observedExpense / basisDays) : null,
    burnForecast: basisDays ? Math.round(observedExpense / basisDays * daysInMonth) : null,
    expenseDays, noSpendDays: basisDays - expenseDays,
  };
}

// V22.9.79 W-7: 월말 예상을 낼 수 없으면(기록 날짜·금액 오류, 영수증 불완전) 0원이 아니라 확인 불가로 적는다.
function renderObservedMoney(analysis, amount) {
  return analysis.basisDays === 0 ? "관측 전" : amount == null ? "확인 불가" : `${numberWithCommas(amount || 0)}원`;
}

// V22.9.79 V76 W-7: 월말 예상(burnForecast)은 monthSpendingOutlook(전체 분류)이다. 고정지출 규칙·정기지출 항목을 읽은 화면
// (/my/analysis?view=report·/smart-tools)은 그 결과(outlook)를 넘기고, 넘기지 않으면 기록만으로 계산한다(규칙·항목은 못 읽은 것으로
// 보아 partial — 그래도 이미 적힌 고정지출은 속도에서 빠진다). 밈·위험 점수도 이 값을 쓴다.
function calculateDashboardAnalysis(allRows, filteredRows, calendar, month, { outlook = null } = {}) {
  const stats = calculateStats(allRows);
  const expense = stats.totals.expense;
  const income = stats.totals.income;
  // V22.9.34 2차 점검 U01: 하루 평균·무지출일은 이번 달이면 오늘까지, 지난 달이면 그 달 전체, 앞으로 올 달이면
  // 0일을 기준으로 센다. 예전에는 이번 달도 아직 오지 않은 날까지 세어 무지출일이 부풀고 하루 평균이 낮아졌다.
  const observation = monthlyObservedSpending(allRows, month);
  const { basisDays, basisEnd, avgExpense, noSpendDays, expenseDays } = observation;
  const spendingOutlook = outlook || monthSpendingOutlook({ month, rows: allRows, recurring: null, plans: null });
  const burnForecast = basisDays && spendingOutlook.expected ? spendingOutlook.expected.total : null;
  const topCategory = stats.categories.find((c) => c.expense > 0) || { category: "없음", expense: 0 };
  const maxDay = calendar.reduce((a, d) => Number(d.expense || 0) > Number(a.expense || 0) ? d : a, { date: "", expense: 0 });
  const missingCategory = allRows.filter((r) => isMissingCategory(r.category)).length;
  const missingPayment = allRows.filter((r) => r.type === "expense" && isMissingPayment(r.payment_method)).length;
  const missingAny = allRows.filter((r) => isMissingCategory(r.category) || (r.type === "expense" && isMissingPayment(r.payment_method))).length;
  const fixedNames = ["주거/관리", "공과금/통신", "보험", "구독", "월세", "관리비"];
  const fixedExpense = allRows.filter((r) => r.type === "expense" && fixedNames.some((x) => String(r.category || r.memo || "").includes(x))).reduce((s, r) => s + Number(r.amount || 0), 0);
  const fixedRate = expense ? Math.round(fixedExpense / expense * 100) : 0;
  const concentration = expense ? Math.round(Number(topCategory.expense || 0) / expense * 100) : 0;
  const maxDayRate = expense ? Math.round(Number(maxDay.expense || 0) / expense * 100) : 0;
  const weekendExpense = allRows.filter((r) => { const d = new Date(String(r.transaction_date || "").replace(/-/g, "/")); return r.type === "expense" && (d.getDay() === 0 || d.getDay() === 6); }).reduce((s, r) => s + Number(r.amount || 0), 0);
  const weekendRate = expense ? Math.round(weekendExpense / expense * 100) : 0;
  const spendText = (r) => `${r.category || ""} ${r.memo || ""} ${r.raw_text || ""}`;
  const cafeRows = allRows.filter((r) => r.type === "expense" && /카페|간식|커피|스타벅스|스벅|투썸|이디야|빽다방|메가커피|컴포즈|디저트/.test(spendText(r)));
  const deliveryRows = allRows.filter((r) => r.type === "expense" && /배달|배민|요기요|쿠팡이츠|치킨|피자|야식|족발|닭발/.test(spendText(r)));
  const shoppingRows = allRows.filter((r) => r.type === "expense" && /쇼핑|쿠팡|네이버쇼핑|무신사|올리브영|택배|구매|주문|옷|의류|신발|가방|화장품/.test(spendText(r)));
  const subscriptionRows = allRows.filter((r) => r.type === "expense" && /구독|넷플릭스|유튜브|쿠팡와우|멜론|티빙|웨이브|디즈니|스포티파이|멤버십/.test(spendText(r)));
  const vehicleRows = allRows.filter((r) => r.type === "expense" && /교통|택시|버스|지하철|주유|기름|주차|하이패스|정비|세차|카센터/.test(spendText(r)));
  const groceryRows = allRows.filter((r) => r.type === "expense" && /마트|장보기|시장|코스트코|트레이더스|이마트|홈플러스|식자재|슈퍼/.test(spendText(r)));
  const medicalRows = allRows.filter((r) => r.type === "expense" && /병원|약국|치과|한의원|진료|검진|의료|약|처방/.test(spendText(r)));
  const childRows = allRows.filter((r) => r.type === "expense" && /육아|어린이집|유치원|기저귀|분유|장난감|아이|키즈|학원|학습지/.test(spendText(r)));
  const petRows = allRows.filter((r) => r.type === "expense" && /강아지|고양이|반려|사료|동물병원|배변패드|애견|애묘/.test(spendText(r)));
  const beautyRows = allRows.filter((r) => r.type === "expense" && /미용|미용실|헤어|커트|염색|네일|피부관리|화장품/.test(spendText(r)));
  const cultureRows = allRows.filter((r) => r.type === "expense" && /영화|공연|전시|여행|숙박|호텔|게임|취미|헬스|운동|캠핑|노래방/.test(spendText(r)));
  const foodRows = allRows.filter((r) => r.type === "expense" && /식비|점심|저녁|아침|밥|외식|식당|분식|국밥|고기|회식|술|맥주|소주/.test(spendText(r)));
  const taxRows = allRows.filter((r) => r.type === "expense" && /세금|수수료|과태료|벌금|자동차세|재산세|종부세/.test(spendText(r)));
  const sumAmount = (arr) => arr.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cafeCount = cafeRows.length;
  const cafeAmount = sumAmount(cafeRows);
  const deliveryCount = deliveryRows.length;
  const deliveryAmount = sumAmount(deliveryRows);
  const shoppingCount = shoppingRows.length;
  const shoppingAmount = sumAmount(shoppingRows);
  const subscriptionCount = subscriptionRows.length;
  const subscriptionAmount = sumAmount(subscriptionRows);
  const vehicleAmount = sumAmount(vehicleRows);
  const groceryAmount = sumAmount(groceryRows);
  const medicalAmount = sumAmount(medicalRows);
  const childAmount = sumAmount(childRows);
  const petAmount = sumAmount(petRows);
  const beautyAmount = sumAmount(beautyRows);
  const cultureAmount = sumAmount(cultureRows);
  const foodAmount = sumAmount(foodRows);
  const taxAmount = sumAmount(taxRows);
  const riskScore = basisDays ? Math.min(100, Math.round((fixedRate * 0.24) + (concentration * 0.22) + (maxDayRate * 0.18) + (weekendRate * 0.14) + (missingAny * 2.2) + (income > 0 && burnForecast > income ? 20 : 0))) : null;
  const analysisBase = { ...observation, stats, income, expense, avgExpense, noSpendDays, expenseDays, basisDays, basisEnd, topCategory, maxDay, missingCategory, missingPayment, missingAny, fixedExpense, fixedRate, concentration, maxDayRate, weekendExpense, weekendRate, cafeCount, cafeAmount, deliveryCount, deliveryAmount, shoppingCount, shoppingAmount, subscriptionCount, subscriptionAmount, vehicleAmount, groceryAmount, medicalAmount, childAmount, petAmount, beautyAmount, cultureAmount, foodAmount, taxAmount, burnForecast, spendingOutlook, riskScore };
  return { ...analysisBase, meme: chooseMemeCard(analysisBase) };
}

// V22.9.79 W-7: 부르는 곳이 없던 forecastMonthlyExpense(하루 평균 × 그 달 일수)를 지웠다. 월말 예상은 monthSpendingOutlook 하나다.
// @build:exports-start
export {
  addMonthsYm, calculateDashboardAnalysis, calculateExtendedAnalytics, categoryExpenseMap,
  deltaClass, formatChangeAgainst, formatSignedPercent, monthObservation, monthlyObservedSpending,
  percentChange, renderCategoryCompareTable, renderCategoryTrendTable, renderMonthlyTrendMini,
  renderMonthlyTrendTable, renderObservedMoney, renderStrategyCards, renderWeekdayStats,
  renderYearlyMonthSummary,
};
// @build:exports-end
