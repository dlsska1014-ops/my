// V22.9.75 — 2026-10-14 전체 점검(docs/codex/AUDIT_FINDINGS_V22_9_44.md)에서 2026-10-21 에도 재현된 웹 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 점검 때 만든 재현 스크립트를 오늘 코드에 다시 돌리니 아래 결함이 그대로였다(재현: D-web-domain/t2-future·s3-reserve-plans·
// t7-format·t5-budget-edge·money/m4-goals·lifecycle/l1b-stale-pages, C-3 은 주소에 ?msg=constructor).
//   D-3  미래 날짜 기록(지정일 전에 반영한 고정지출 등)까지 더해 홈이 "지난달 1~3일보다 170,000원 더"라고 했다(실제는 덜).
//   D-23 /reserve-plans "이번 달 나갈 정기지출"이 오늘 기준 다음 납부일로 걸러 12월을 봐도 0원이었다.
//   C-3  ?msg=constructor 가 /app·/my/members 등에 "function Object() { [native code] }"를 보였다.
//   D-15 옛 음수 지출(환불을 음수로 적은 행)이 "--12,000원"으로 보였다.
//   D-14 줄임 금액이 "10천", "10000만", "10020억"으로 보였다.
//   D-13 이전 값이 0원이면 증감률이 "+100%"였다.
//   D-12 종합 리포트 사용률을 160%에서 자르고, 예산이 없으면 지출 전부를 '초과'로, 홈 대표 숫자를 수입−지출로 보였다.
//   D-22 마감월이 지난 목표가 "남은 1개월", 넘치게 모은 목표 때문에 전체 진행률이 100%였다.
//   D-24 지운·나간 가계부를 기억한(ab_hh) 채 열면 다른 가계부가 있어도 '가계부 시작' 화면(또는 /menu 404)이 나왔다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처에 재현과 같은 기록·예산·목표·쿠키를 넣고 실제 화면·JSON 을 받아 문구와 숫자를 확인한다. 고친 뒤에도
// 예전처럼 맞아야 하는 쪽(지난 기간 기록이 있는 비교, 그 달에 없는 항목, 직접 적은 남의 가계부 ID 404 등)도 함께 본다.
import { counter, fixture, withClock, page, api, putSetting } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.75 2026-10-14 점검 재현 결함(웹) 검사");
const HH = "house-home";
const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const after = (text, marker, length = 160) => { const i = text.indexOf(marker); return i < 0 ? "" : text.slice(i, i + length); };
const tx = (id, date, type, amount, category, memo, payment = "국민카드") => ({ id, household_id: HH, user_id: "user-bin", transaction_date: date, type, amount, category, memo, payment_method: payment, source: "web", raw_text: memo, created_at: `${date}T03:00:00.000Z` });
const onlyRows = (fx, rows) => { fx.db.transactions = fx.db.transactions.filter((r) => r.household_id !== HH).concat(rows); };
const onlyBudgets = (fx, rows) => { fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((b) => b.household_id !== HH).concat(rows.map((b, i) => ({ id: `qa-b-${i}`, household_id: HH, created_at: "2026-10-01T00:00:00.000Z", ...b }))); };
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// ── D-3 홈 지난달 비교는 오늘까지의 기록만 견준다 ──
await withClock("2026-10-03", () => fixture(async (fx) => {
  onlyRows(fx, [
    tx("f-1", "2026-09-02", "expense", 30000, "식비", "9월 점심"),
    tx("f-2", "2026-10-02", "expense", 20000, "식비", "10월 점심"),
    // 지정일(25일) 전에 반영한 관리비처럼 미래 날짜로 미리 적힌 지출.
    tx("f-3", "2026-10-25", "expense", 180000, "주거/관리", "관리비", "계좌이체"),
  ]);
  const home = strip((await page(fx, `/app?month=2026-10&household_id=${HH}`)).html);
  t.ok(home.includes("지난달 1~3일보다 10,000원 덜 썼어요."), `D-3 홈은 10월 1~3일 20,000원을 9월 1~3일 30,000원과 견준다 (${(home.match(/지난달 1~3일[^.]*\./) || [""])[0]})`);
  t.ok(!home.includes("170,000원 더 썼어요"), "D-3 아직 나가지 않은 25일 관리비를 '더 썼어요'에 넣지 않는다");
  t.ok(home.includes("지출 200,000원"), "D-3 이번 달 등록 지출 합계(미래 날짜 포함)는 그대로 보인다");
  const reports = strip((await page(fx, `/reports?month=2026-10&household_id=${HH}`)).html);
  t.ok(reports.includes("지난달 같은 기간(1~3일)보다 10,000원 덜 썼어요"), "D-3 생활비 리포트와 같은 결론이다");
}));

// ── D-23 '이번 달 나갈 정기지출'은 보고 있는 달 기준 ──
await withClock("2026-10-26", () => fixture(async (fx) => {
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([
    { id: "r-phone", name: "통신비", amount: 55000, type: "expense", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "통신" },
    { id: "r-tax", name: "자동차세", amount: 240000, type: "expense", recurrence: "semiannual", due_months: [6, 12], due_day: 16, category: "세금/수수료" },
    { id: "r-allow", name: "직무수당", amount: 300000, type: "income", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 20, category: "급여" },
  ]));
  const metric = async (month) => after(strip((await page(fx, `/reserve-plans?month=${month}&household_id=${HH}`)).html), "이번 달 나갈 정기지출", 110);
  const dec = await metric("2026-12");
  t.ok(dec.startsWith("이번 달 나갈 정기지출 295,000원") && dec.includes("2건 · 자동차세, 통신비"), `D-23 12월을 보면 12월에 돌아오는 자동차세·통신비를 센다 (${dec})`);
  t.ok(dec.includes("이번 달 정기수입 +300,000원"), "D-23 그 달에 들어올 정기수입도 그 달 기준이다");
  const jan = await metric("2027-01");
  t.ok(jan.startsWith("이번 달 나갈 정기지출 55,000원") && jan.includes("1건 · 통신비"), `D-23 다음 해 1월도 그 달 기준이다 (${jan})`);
  const oct = await metric("2026-10");
  t.ok(oct.startsWith("이번 달 나갈 정기지출 55,000원"), `D-23 이번 달은 납부일(25일)이 지나도 그 달 항목으로 센다 (${oct})`);
  t.ok(!oct.includes("자동차세"), "D-23 그 달에 돌아오지 않는 반기 항목은 넣지 않는다");
}));

// ── C-3 주소의 msg·err 는 표에 적은 코드만 문구로 바꾼다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  for (const path of [
    `/app?household_id=${HH}&msg=constructor`, `/my/members?household_id=${HH}&msg=constructor`, `/my/settings?household_id=${HH}&msg=toString`,
    `/reports?household_id=${HH}&err=constructor`, `/reports?household_id=${HH}&msg=hasOwnProperty`, `/my/analysis?household_id=${HH}&view=report&err=constructor`,
    `/reserve-plans?household_id=${HH}&msg=constructor`, `/my/households?household_id=${HH}&msg=valueOf`, `/budgets?household_id=${HH}&err=__proto__`,
  ]) {
    const res = await page(fx, path);
    const visible = res.html.replace(/<script[\s\S]*?<\/script>/g, " ");
    t.ok(res.status === 200 && !/native code|function [A-Za-z]+\(\) \{|\[object Object\]/.test(visible), `C-3 ${path} 에 객체의 함수 본문이나 [object Object] 가 보이지 않는다`);
  }
  const known = strip((await page(fx, `/app?household_id=${HH}&msg=member_alias_updated`)).html);
  t.ok(known.includes("참여자 이름을 수정했습니다."), "C-3 표에 있는 코드는 예전처럼 안내 문구로 바뀐다");
  const analysisInherited = strip((await page(fx, `/my/analysis?household_id=${HH}&view=report&err=constructor`)).html);
  t.ok(analysisInherited.includes("요청을 처리하지 못했습니다."), "C-3 분석 화면의 ?err=constructor 는 표에 없는 코드처럼 일반 안내를 보인다");
  const analysisKnown = strip((await page(fx, `/my/analysis?household_id=${HH}&view=report&err=challenge_invalid`)).html);
  t.ok(analysisKnown.includes("챌린지 이름과 목표 일수(1~20일)를 확인해 주세요."), "C-3 분석 화면의 표에 있는 오류 코드는 예전 문구 그대로다");
}));

// ── D-15 옛 음수 행은 부호를 한 번만 ──
await withClock("2026-10-20", () => fixture(async (fx) => {
  onlyRows(fx, [
    tx("n1", "2026-10-05", "expense", 9000, "카페/간식", "커피와 빵"),
    tx("n3", "2026-10-07", "expense", -12000, "식비", "옛 음수 환불"),
  ]);
  const feed = strip((await page(fx, `/app?month=2026-10&household_id=${HH}&tab=transactions&feed=all`)).html);
  t.ok(!/--\d/.test(feed), "D-15 거래 목록에 '--'가 없다");
  t.ok(feed.includes("옛 음수 환불 2026-10-07 · 식비 · 국민카드 지출자 Bin +12,000원"), `D-15 음수 지출 카드는 돌아온 돈 '+12,000원'이다 (${after(feed, "옛 음수 환불 2026-10-07", 70)})`);
  t.ok(feed.includes("10월 7일 (수) +12,000원"), `D-15 그날 합계도 '+12,000원'이다 (${after(feed, "10월 7일", 30)})`);
  t.ok(feed.includes("커피와 빵 2026-10-05 · 카페/간식 · 국민카드 지출자 Bin -9,000원"), "D-15 보통 지출은 예전처럼 '-9,000원'이다");
  const cal = (await page(fx, `/app?month=2026-10&household_id=${HH}&view=calendar`)).html;
  const cell = (day) => (cal.match(new RegExp(`data-ab-day="2026-10-${day}"[\\s\\S]*?</a>`)) || [""])[0];
  t.ok(cell("07").includes("<strong>+1만</strong>") && !/--/.test(cell("07")), `D-15 달력 칸도 부호를 한 번만 쓴다 (${strip(cell("07"))})`);
}));

// ── D-14 줄임 금액은 반올림해 다음 단위가 되면 다음 단위로 ──
await withClock("2026-10-20", () => fixture(async (fx) => {
  onlyRows(fx, [
    tx("s1", "2026-10-05", "expense", 9600, "카페/간식", "커피"),
    tx("s2", "2026-10-06", "expense", 99995000, "주거/관리", "중도금"),
    tx("s3", "2026-10-08", "expense", 1002000000000, "투자", "큰 금액"),
    tx("s4", "2026-10-09", "expense", 150000000, "주거/관리", "전세 일부"),
    tx("s5", "2026-10-10", "expense", 4200, "식비", "김밥"),
  ]);
  const cal = (await page(fx, `/app?month=2026-10&household_id=${HH}&view=calendar`)).html;
  const label = (day) => ((cal.match(new RegExp(`data-ab-day="2026-10-${day}"[\\s\\S]*?<strong>([^<]*)</strong>`)) || [])[1] || "");
  t.eq(label("05"), "-1만", "D-14 9,600원은 '10천'이 아니라 '1만'이다");
  t.eq(label("06"), "-1억", "D-14 99,995,000원은 '10000만'이 아니라 '1억'이다");
  t.eq(label("08"), "-1조", "D-14 1조 이상은 '10020억'이 아니라 '조'로 쓴다");
  t.eq(label("09"), "-1.5억", "D-14 1억 5천만은 예전처럼 '1.5억'이다");
  t.eq(label("10"), "-4천", "D-14 4,200원은 예전처럼 '4천'이다");
  t.ok(!/\d\d천|\d{5,}억|\d{5,}만/.test(strip(cal)), "D-14 화면 어디에도 단위를 넘긴 줄임 표기가 없다");
}));

// ── D-13 이전 값이 0원이면 '+100%'라고 하지 않는다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  onlyRows(fx, [
    tx("c1", "2026-09-10", "expense", 45000, "식비", "9월 장보기"),
    tx("c2", "2026-10-10", "expense", 50000, "식비", "10월 장보기"),
    tx("c3", "2026-10-11", "expense", 30000, "여행", "기차표"),
  ]);
  // 분류 변화 표와 전략 카드는 종합 리포트(view=report)에 있다.
  const html = strip((await page(fx, `/my/analysis?month=2026-10&household_id=${HH}&view=report`)).html);
  t.ok(!html.includes("+100%"), "D-13 분석 화면에 0원과 견준 '+100%'가 없다");
  t.ok(/여행 30,000원 0원 \+30,000원 새로 생김/.test(html), `D-13 지난달에 없던 분류는 '새로 생김'이다 (${after(html, "여행 30,000원", 40)})`);
  t.ok(/식비 50,000원 45,000원 \+5,000원 \+11%/.test(html), "D-13 지난달에 있던 분류는 예전처럼 증감률이다");
  t.ok(after(html, "전월 대비 지출", 30).includes("+78%"), `D-13 지난달 기록이 있으면 전체 증감률은 예전처럼 보인다 (${after(html, "전월 대비 지출", 30)})`);
  t.ok(html.includes("30,000원 증가 · 새로 생김"), "D-13 '최대 증가 항목' 카드도 같은 말이다");
  onlyRows(fx, [tx("c4", "2026-10-10", "expense", 50000, "식비", "10월 장보기")]);
  const first = strip((await page(fx, `/my/analysis?month=2026-10&household_id=${HH}&view=report`)).html);
  t.ok(after(first, "전월 대비 지출", 40).includes("비교 기록 없음"), `D-13 지난달 기록이 없으면 '전월 대비 지출'은 비교 기록 없음이다 (${after(first, "전월 대비 지출", 40)})`);
}));

// ── D-12 예산 경계 표시 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  onlyRows(fx, [
    tx("b1", "2026-10-05", "expense", 507000, "식비", "모임 식사"),
    tx("b2", "2026-10-01", "income", 3000000, "급여", "10월 월급", "급여통장"),
  ]);
  onlyBudgets(fx, [{ month: "2026-10", category: "식비", amount: 100000 }]);
  const report = strip((await page(fx, `/my/analysis?month=2026-10&household_id=${HH}&view=report`)).html);
  t.ok(after(report, "예산 사용 게이지", 200).includes("예산 사용률 507%"), `D-12 종합 리포트 사용률을 160%에서 자르지 않는다 (${after(report, "예산 사용 게이지", 140)})`);
  const home = strip((await page(fx, `/app?month=2026-10&household_id=${HH}`)).html);
  t.ok(home.includes("예산 사용률 507%"), "D-12 홈과 같은 사용률이다");
  onlyBudgets(fx, []);
  const noBudget = strip((await page(fx, `/my/analysis?month=2026-10&household_id=${HH}&view=report`)).html);
  const gauge = after(noBudget, "예산 사용 게이지", 200);
  t.ok(gauge.includes("잔여 예산 미설정") && gauge.includes("초과 미설정") && !gauge.includes("초과 507,000원"), `D-12 예산이 없으면 지출 전부를 '초과'로 적지 않는다 (${gauge.slice(0, 120)})`);
  const homeNoBudget = strip((await page(fx, `/app?month=2026-10&household_id=${HH}`)).html);
  const p0 = after(homeNoBudget, "이번 달 쓸 수 있는 돈", 80);
  t.ok(p0.includes("예산 미설정") && !p0.includes("2,493,000"), `D-12 예산이 없으면 홈 대표 숫자에 수입−지출을 쓰지 않는다 (${p0})`);
}));

// ── D-22 목표: 마감월이 지난 목표, 전체 진행률 ──
await withClock("2026-10-20", () => fixture(async (fx) => {
  const call = (body) => api(fx, "/u/api/goals", "POST", { household: HH, ...body });
  let res = await call({ action: "create", name: "여름휴가", target: "1000000", monthly: "100000", deadline: "2026-08" });
  const past = res.data.goals.find((g) => g.name === "여름휴가");
  t.eq(past.monthsLeft, null, "D-22 마감월이 지난 목표에 '남은 1개월'을 주지 않는다");
  t.eq(past.neededMonthly, null, "D-22 마감월이 지난 목표에 월 필요액을 만들지 않는다");
  t.ok(past.overdue === true && past.status === "behind", "D-22 마감이 지났다고 표시하고 상태는 '부족'이다");
  res = await call({ action: "create", name: "연말 선물", target: "300000", monthly: "100000", deadline: "2026-12" });
  t.eq(res.data.goals.find((g) => g.name === "연말 선물").monthsLeft, 3, "D-22 마감월이 남은 목표는 예전처럼 남은 달을 센다(10~12월)");
  res = await call({ action: "create", name: "비상금", target: "1000000", monthly: "0" });
  const emergency = res.data.goals.find((g) => g.name === "비상금");
  res = await call({ action: "fund", id: emergency.id, amount: "2000000" });
  t.eq(res.data.total_saved, 2000000, "D-22 모은 돈 합계는 그대로다");
  t.eq(res.data.overall_progress, 43, `D-22 넘치게 모은 목표는 목표액까지만 진행률에 센다 (1,000,000 / 2,300,000 → 43%, 실제 ${res.data.overall_progress}%)`);
}));

// ── D-24 지운 가계부를 기억한 채 열면 '가계부 시작' 대신 가계부 고르기 화면으로(첫 가계부로 대체하지 않는다, V22.9.17 기준선) ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.households = fx.db.households.filter((h) => h.id !== "house-trip");
  fx.db.household_members = fx.db.household_members.filter((m) => m.household_id !== "house-trip");
  for (const path of ["/reports", "/my/settings", "/my/analysis", "/smart-tools", "/menu", "/app"]) {
    const res = await page(fx, path, { cookie: `${fx.cookie}; ab_hh=house-trip` });
    t.ok(res.status === 303 && res.location === "/my/households?msg=household_memory_stale", `D-24 ${path}: 낡은 기억이면 가계부 고르기 화면으로 보낸다 (${res.status} ${res.location})`);
    t.ok(!res.html.includes(`household_id=${HH}`), `D-24 ${path}: 다른 가계부로 몰래 바꿔 그리지 않는다`);
    t.ok(/ab_hh=;[^,]*Max-Age=0/.test(res.setCookie), `D-24 ${path}: 낡은 기억을 지운다 (${res.setCookie.slice(0, 80)})`);
  }
  const picker = await page(fx, "/my/households?msg=household_memory_stale");
  t.ok(picker.status === 200 && picker.html.includes("더는 열 수 없어요") && picker.html.includes("우리집 생활비"), `D-24 고르기 화면이 이유를 알리고 내 가계부를 보여 준다 (${picker.status})`);
  const pickerWithStale = await page(fx, "/my/households", { cookie: `${fx.cookie}; ab_hh=house-trip` });
  t.ok(pickerWithStale.status === 200 && /ab_hh=;[^,]*Max-Age=0/.test(pickerWithStale.setCookie), "D-24 고르기 화면 자체는 다시 보내지 않고 기억만 지운다");
  const explicit = await page(fx, "/app?household_id=house-trip");
  t.eq(explicit.status, 404, "D-24 주소에 직접 적은 없는 가계부 ID 는 예전처럼 찾을 수 없음(404)이다");
  const remembered = await page(fx, "/reports", { cookie: `${fx.cookie}; ab_hh=${HH}` });
  t.ok(remembered.status === 200 && !/ab_hh=;/.test(remembered.setCookie), "D-24 열 수 있는 기억은 지우지 않는다");
}));

t.done();
