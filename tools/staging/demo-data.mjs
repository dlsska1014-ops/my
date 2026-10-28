// V22.9.83: 테스트 서버(미리보기) 예시 데이터. 실제 사용자·운영 DB 와 무관한 가상의 가계부를
// "지금 달" 기준으로 만든다. QA 픽스처(validation/qa-fixture.mjs)의 메모리 표를 그대로 쓰고
// 행만 바꾼다 — 표 모양을 따로 흉내 내지 않으므로 앱이 픽스처로 그리는 화면과 같다.
// 난수는 고정 씨앗을 써서 열 때마다 같은 숫자가 나온다(전후 비교 화면이 흔들리지 않게).

const DAY_MS = 86400000;

export function kstParts(now = Date.now()) {
  const d = new Date(now + 9 * 3600000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function kstMonth(offset = 0, now = Date.now()) {
  const { year, month } = kstParts(now);
  const m = new Date(Date.UTC(year, month - 1 + offset, 1));
  return m.toISOString().slice(0, 7);
}

function daysIn(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [분류, 메모 후보, 금액 범위(원), 한 달 건수, 결제수단 후보]
const EXPENSE_PATTERNS = [
  ["식비", ["마트 장보기", "이마트", "홈플러스", "동네 마트"], [32000, 128000], 5, ["국민카드", "현대카드"]],
  ["외식", ["점심", "저녁 외식", "김밥", "국밥"], [9000, 46000], 6, ["카카오페이", "국민카드"]],
  ["카페/간식", ["커피", "스타벅스", "빵집", "편의점 간식"], [3500, 14000], 7, ["카카오페이", "현대카드"]],
  ["배달", ["치킨", "피자", "배달 야식"], [18000, 32000], 2, ["카카오페이"]],
  ["교통", ["주유", "버스", "택시", "주차"], [1500, 78000], 5, ["현대카드", "카카오페이"]],
  ["생활용품", ["쿠팡", "다이소", "세제·휴지"], [6000, 54000], 3, ["국민카드"]],
  ["쇼핑", ["옷", "신발", "온라인 쇼핑"], [19000, 89000], 1, ["현대카드"]],
  ["의료/병원", ["병원", "약국"], [5000, 38000], 1, ["국민카드"]],
  ["문화/여가", ["영화", "책", "공연"], [12000, 45000], 1, ["카카오페이"]],
];

const MEMBERS = ["user-bin", "user-wifi"];

function addTransactions(rows, monthKey, upToDay, rand, seq) {
  const total = daysIn(monthKey);
  const lastDay = Math.min(total, upToDay);
  for (const [category, memos, [lo, hi], count, methods] of EXPENSE_PATTERNS) {
    for (let i = 0; i < count; i += 1) {
      const day = 1 + Math.floor(rand() * total);
      if (day > lastDay) continue;
      const amount = Math.round((lo + rand() * (hi - lo)) / 100) * 100;
      const memo = memos[Math.floor(rand() * memos.length)];
      const method = methods[Math.floor(rand() * methods.length)];
      seq.value += 1;
      rows.push({
        id: `demo-tx-${seq.value}`, household_id: "house-home", user_id: MEMBERS[Math.floor(rand() * MEMBERS.length)],
        transaction_date: `${monthKey}-${String(day).padStart(2, "0")}`, type: "expense", amount, category, memo,
        payment_method: method, source: rand() < 0.6 ? "kakao" : "web", raw_text: `${memo} ${amount}`,
      });
    }
  }
  const fixed = [
    [25, "income", 3200000, "급여", "월급", "급여통장", "user-bin"],
    [5, "expense", 650000, "주거/관리", "월세", "계좌이체", "user-bin"],
    [20, "expense", 89000, "통신", "통신비", "국민카드", "user-wifi"],
    [12, "expense", 17000, "문화/여가", "넷플릭스", "현대카드", "user-bin"],
  ];
  for (const [day, type, amount, category, memo, method, user] of fixed) {
    if (day > lastDay) continue;
    seq.value += 1;
    rows.push({
      id: `demo-tx-${seq.value}`, household_id: "house-home", user_id: user,
      transaction_date: `${monthKey}-${String(day).padStart(2, "0")}`, type, amount, category, memo,
      payment_method: method, source: "recurring_auto", raw_text: memo,
    });
  }
  if (rand() < 0.8 && 9 <= lastDay) {
    seq.value += 1;
    rows.push({
      id: `demo-tx-${seq.value}`, household_id: "house-home", user_id: "user-wifi", transaction_date: `${monthKey}-09`,
      type: "income", amount: 120000 + Math.round(rand() * 8) * 10000, category: "부수입", memo: "중고판매",
      payment_method: "카카오뱅크", source: "kakao", raw_text: "중고판매",
    });
  }
}

export function applyDemoData(db, now = Date.now()) {
  const today = kstParts(now).day;
  const months = [kstMonth(-2, now), kstMonth(-1, now), kstMonth(0, now)];
  const current = months[2];
  const previous = months[1];
  const rand = seeded(20261028);
  const seq = { value: 0 };
  const rows = [];
  addTransactions(rows, months[0], 31, rand, seq);
  addTransactions(rows, months[1], 31, rand, seq);
  addTransactions(rows, current, today, rand, seq);
  // 두 번째 가계부(모임·여행) — 정산 화면에 보일 거리.
  const tripDay = Math.max(1, Math.min(today, 3));
  for (const [user, memo, amount, category, method] of [
    ["user-bin", "숙소 예약", 215000, "여행", "국민카드"], ["user-wifi", "렌터카", 128000, "교통", "카카오페이"],
    ["user-bin", "흑돼지 저녁", 96000, "외식", "현대카드"], ["user-wifi", "카페", 23500, "카페/간식", "카카오페이"],
  ]) {
    seq.value += 1;
    rows.push({
      id: `demo-tx-${seq.value}`, household_id: "house-trip", user_id: user, transaction_date: `${current}-${String(tripDay).padStart(2, "0")}`,
      type: "expense", amount, category, memo, payment_method: method, source: "web", raw_text: `${memo} ${amount}`,
    });
  }
  db.transactions = rows.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  db.households = db.households.map((h) => (h.id === "house-trip" ? { ...h, name: "가족 여행" } : h));
  if (!db.household_members.some((m) => m.household_id === "house-trip" && m.user_id === "user-wifi")) {
    db.household_members.push({ household_id: "house-trip", user_id: "user-wifi", role: "member", created_at: db.household_members[0]?.created_at });
  }

  const createdAt = new Date(now - 90 * DAY_MS).toISOString();
  const plan = [
    ["__income:급여", 3200000], ["__income:부수입", 200000],
    ["식비", 600000], ["외식", 300000], ["카페/간식", 120000], ["배달", 80000], ["교통", 250000],
    ["생활용품", 120000], ["쇼핑", 150000], ["통신", 90000], ["주거/관리", 650000],
  ];
  db.accountbook_budgets = [previous, current].flatMap((month) => plan.map(([category, amount], i) => ({
    id: `demo-budget-${month}-${i}`, household_id: "house-home", month, category, amount, created_at: createdAt,
  })));

  db.accountbook_recurring = [
    ["recurring-rent", "expense", 650000, "주거/관리", "월세", "계좌이체", 5, "user-bin"],
    ["recurring-phone", "expense", 89000, "통신", "통신비", "국민카드", 20, "user-wifi"],
    ["recurring-ott", "expense", 17000, "문화/여가", "넷플릭스", "현대카드", 12, "user-bin"],
    ["recurring-salary", "income", 3200000, "급여", "월급", "급여통장", 25, "user-bin"],
  ].map(([id, type, amount, category, memo, method, day, user]) => ({
    id, household_id: "house-home", type, amount, category, memo, payment_method: method, day_of_month: day,
    user_id: user, is_active: true, last_applied_month: day <= today ? current : previous, created_at: createdAt,
  }));

  const nextMonths = [1, 2, 4, 7].map((offset) => Number(kstMonth(offset, now).slice(5, 7)));
  const reservePlans = [
    { id: "reserve-car", name: "자동차보험", amount: 1200000, due_months: [nextMonths[1]], recurrence: "annual" },
    { id: "reserve-tax", name: "재산세", amount: 320000, due_months: [nextMonths[0], nextMonths[3]], recurrence: "semiannual" },
    { id: "reserve-holiday", name: "명절 경비", amount: 400000, due_months: [nextMonths[2]], recurrence: "annual" },
  ];
  const assets = [
    { id: "asset-1", name: "국민카드", kind: "credit_card", balance: 0 },
    { id: "asset-2", name: "급여통장", kind: "bank_account", balance: 5200000 },
    { id: "asset-3", name: "카카오뱅크", kind: "bank_account", balance: 1830000 },
    { id: "asset-4", name: "현대카드", kind: "credit_card", balance: 0 },
  ];
  const settings = db.accountbook_settings.filter((s) => !["payment_assets:house-home", "reserve_plans:house-home"].includes(s.key));
  settings.push(
    { id: "demo-setting-assets", key: "payment_assets:house-home", value: JSON.stringify(assets), created_at: createdAt },
    { id: "demo-setting-reserve", key: "reserve_plans:house-home", value: JSON.stringify(reservePlans), created_at: createdAt },
  );
  db.accountbook_settings = settings;
  return { months, current, transactions: rows.length };
}
