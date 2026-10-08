
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
  const avg3 = Math.round(threeMonthTrend.reduce((s, x) => s + x.expense, 0) / Math.max(1, threeMonthTrend.filter((x) => x.expense > 0).length || 3));
  const cleanupCount = rowsBase.filter((r) => isMissingCategory(r.category) || (r.type === "expense" && isMissingPayment(r.payment_method))).length;
  return { current, prev, expenseMoMRate, monthlyTrend, threeMonthTrend, categoryCompare, categoryTrend3, yearMonthSummary: yearMonths, weekdayStats, topIncrease, topDecrease, avg3Expense: avg3, cleanupCount };
}

function categoryExpenseMap(rows) {
  const map = {};
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
    { cls: ext.expenseMoMRate > 20 ? "danger" : ext.expenseMoMRate > 5 ? "warn" : "good", title: "전월 대비 지출", value: formatSignedPercent(ext.expenseMoMRate), desc: `전월 ${numberWithCommas(ext.prev.totals.expense)}원 → 이번 달 ${numberWithCommas(ext.current.totals.expense)}원` },
    { cls: ext.avg3Expense > 0 && ext.current.totals.expense > ext.avg3Expense * 1.2 ? "warn" : "good", title: "3개월 평균 대비", value: `${numberWithCommas(ext.avg3Expense)}원`, desc: `최근 3개월 평균과 이번 달 속도를 비교하세요.` },
    { cls: ext.cleanupCount > 0 ? "danger" : "good", title: "분석 신뢰도", value: `${ext.cleanupCount}건`, desc: "미정리 데이터가 적을수록 고급 분석이 정확해집니다." },
    { cls: ext.topIncrease.diff > 0 ? "warn" : "good", title: "최대 증가 항목", value: ext.topIncrease.name, desc: `${numberWithCommas(ext.topIncrease.diff)}원 증가 · ${formatSignedPercent(ext.topIncrease.rate)}` },
    { cls: a.weekendRate >= 45 ? "warn" : "good", title: "주말 소비", value: `${a.weekendRate}%`, desc: "주말 외식·여가성 소비 비중을 점검하세요." },
    { cls: a.riskScore >= 70 ? "danger" : a.riskScore >= 45 ? "warn" : "good", title: "가계부 경보", value: `${a.riskScore}점`, desc: "고정비, 쏠림, 미정리, 월말 예상치를 종합한 점수입니다." },
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
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>카테고리</th><th>이번 달</th><th>전월</th><th>차이</th><th>증감률</th></tr></thead><tbody>${rows.map((x) => `<tr><td><b>${escapeHtml(x.name)}</b></td><td class="expense">${numberWithCommas(x.current)}원</td><td>${numberWithCommas(x.previous)}원</td><td class="${deltaClass(x.diff)}">${x.diff >= 0 ? "+" : ""}${numberWithCommas(x.diff)}원</td><td class="${deltaClass(x.rate)}">${formatSignedPercent(x.rate)}</td></tr>`).join("")}</tbody></table></div>`;
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

function calculateDashboardAnalysis(allRows, filteredRows, calendar, month) {
  const stats = calculateStats(allRows);
  const expense = stats.totals.expense;
  const income = stats.totals.income;
  const days = Math.max(1, calendar.length || 30);
  const avgExpense = Math.round(expense / days);
  const noSpendDays = calendar.filter((d) => Number(d.expense || 0) === 0).length;
  const expenseDays = calendar.filter((d) => Number(d.expense || 0) > 0).length;
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
  const burnForecast = forecastMonthlyExpense(expense, month);
  const riskScore = Math.min(100, Math.round((fixedRate * 0.24) + (concentration * 0.22) + (maxDayRate * 0.18) + (weekendRate * 0.14) + (missingAny * 2.2) + (income > 0 && burnForecast > income ? 20 : 0)));
  const analysisBase = { stats, income, expense, avgExpense, noSpendDays, expenseDays, topCategory, maxDay, missingCategory, missingPayment, missingAny, fixedExpense, fixedRate, concentration, maxDayRate, weekendExpense, weekendRate, cafeCount, cafeAmount, deliveryCount, deliveryAmount, shoppingCount, shoppingAmount, subscriptionCount, subscriptionAmount, vehicleAmount, groceryAmount, medicalAmount, childAmount, petAmount, beautyAmount, cultureAmount, foodAmount, taxAmount, burnForecast, riskScore };
  return { ...analysisBase, meme: chooseMemeCard(analysisBase) };
}

function forecastMonthlyExpense(currentExpense, month) {
  const today = nowKstDate();
  const currentMonth = currentMonthKst();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const elapsed = month === currentMonth ? Math.max(1, today.getDate()) : daysInMonth;
  return Math.round(currentExpense / elapsed * daysInMonth);
}
