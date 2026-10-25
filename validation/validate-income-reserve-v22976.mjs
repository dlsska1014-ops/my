// V22.9.76 — 정기 수입 항목을 지출처럼 안내하던 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자가 '수당'을 정기 수입으로 등록했는데 알림센터는 "수당 납부 4일 전 · 월 준비 300,000원"(경고 등급),
// 홈은 "수당 납부가 4일 남았습니다. 월 300,000원씩 준비하세요.", 리포트는 "30일 안에 나갈 적립 계획"에 수당을
// 적었다. V22.8.79 에서 정기 항목에 수입(type: "income")을 더할 때 정기 항목 화면과 카카오 요약만 고치고
// 나머지 화면은 지출 문구를 그대로 썼다. 기존 검사 2만여 개는 소스 문자열을 확인했을 뿐 수입 항목을 넣고
// 화면을 그려 본 적이 없어서 아무도 몰랐다.
//
// ── 어떻게 잡는가 ──
// 수입만·지출만·섞인 정기 항목으로 알림센터 JSON, 홈, 리포트, 정기 항목 화면, 카카오 답장을 실제로 만들고
// (1) 화면마다 기대 문구를 확인하고 (2) 모든 출력에서 수입 항목 이름 바로 뒤에 지출 낱말
// (납부·준비하세요·월 준비·준비 권장·나갈)이 붙는지 훑는다. 새 화면이 정기 항목을 보여 주면 (2)에 더한다.
import { counter, fixture, withClock, page, api, skill, putSetting } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.76 정기 수입 항목 문구·집계 검사");
const HH = "house-home";
const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const after = (text, marker, length = 160) => { const i = text.indexOf(marker); return i < 0 ? "" : text.slice(i, i + length); };
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const INCOME = { id: "r-allow", name: "직무수당", amount: 300000, type: "income", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "급여" };
const PHONE = { id: "r-phone", name: "통신비", amount: 55000, type: "expense", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "통신" };
const CAR_TAX = { id: "r-tax", name: "자동차세", amount: 240000, type: "expense", recurrence: "semiannual", due_months: [6, 12], due_day: 16, category: "세금/수수료" };
const EXPENSE_WORDS = ["납부", "준비하세요", "월 준비", "준비 권장", "나갈"];

async function surfaces(fx, plans, { kakao = true } = {}) {
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify(plans));
  const month = "2026-10";
  const notifications = (await api(fx, `/u/api/notifications?household_id=${HH}&month=${month}`)).data?.notifications || [];
  const home = strip((await page(fx, `/app?household_id=${HH}&month=${month}`)).html);
  const reports = strip((await page(fx, `/reports?household_id=${HH}&month=${month}`)).html);
  const reserveRaw = (await page(fx, `/reserve-plans?household_id=${HH}&month=${month}`)).html;
  let summary = "";
  if (kakao) {
    // 이번 달 기록이 하나도 없으면 이번달요약은 '아직 기록이 없어요' 안내만 낸다. 기록 한 건을 두고 묻는다.
    if (!fx.db.transactions.some((row) => row.id === "tx-oct-lunch")) {
      fx.db.transactions.push({ ...fx.db.transactions.find((row) => row.id === "tx-expense-1"), id: "tx-oct-lunch", transaction_date: "2026-10-20", amount: 12000, memo: "점심", category: "식비" });
    }
    await skill(fx, "오늘기록");
    await skill(fx, "2");
    summary = await skill(fx, "이번달요약");
  }
  return { notifications, home, reports, reserveRaw, reserve: strip(reserveRaw), summary };
}

// 모든 출력에서 수입 항목 이름 바로 뒤(40자)에 지출 낱말이 붙는지 훑는다.
function sweepIncomeWording(label, out, incomeName) {
  const texts = {
    notifications: out.notifications.map((n) => `${n.title} | ${n.body}`).join(" / "),
    home: out.home, reports: out.reports, reserve: out.reserve, summary: out.summary,
  };
  for (const [surface, text] of Object.entries(texts)) {
    let i = -1;
    while ((i = text.indexOf(incomeName, i + 1)) >= 0) {
      const tail = text.slice(i + incomeName.length, i + incomeName.length + 40);
      const hit = EXPENSE_WORDS.find((w) => tail.includes(w));
      t.ok(!hit, `[${label}] ${surface}: 수입 항목 '${incomeName}' 뒤에 지출 낱말 '${hit}'이 붙지 않는다 — …${text.slice(Math.max(0, i - 20), i + incomeName.length + 40)}…`);
    }
  }
}

// 1) 수입 항목만 있는 가계부 — 사용자가 겪은 상황 그대로.
await withClock("2026-10-21", () => fixture(async (fx) => {
  const out = await surfaces(fx, [INCOME]);
  const n = out.notifications.find((x) => String(x.title).startsWith("직무수당"));
  t.ok(n, "알림센터에 직무수당 알림이 있다");
  t.eq(n.title, "직무수당 입금 4일 전", "수입 항목 알림 제목은 '입금 N일 전'이다");
  t.eq(n.body, "300,000원 · 2026-10-25 들어올 예정", "수입 항목 알림 본문에 '월 준비'를 쓰지 않는다");
  t.eq(n.level, "info", "수입 항목 알림은 경고(warn) 등급이 아니다");
  t.ok(out.home.includes("직무수당 300,000원이 4일 후 들어올 예정이에요."), "홈 안내 문장은 들어올 돈으로 말한다");
  t.ok(!out.home.includes("직무수당 납부"), "홈에 '직무수당 납부'가 없다");
  t.ok(out.home.includes("수입 1건 · 매월 300,000원 들어와요"), "홈 정기 카드는 수입 건수와 월 환산을 적는다");
  t.ok(out.home.includes("입금 예정 1건") && !out.home.includes("준비 알림 1건"), "홈 정기 카드는 '준비 알림'이 아니라 '입금 예정'을 센다");
  const outCard = after(out.home, "앞으로 나갈 돈");
  // V22.9.78 W-5: 카드는 반영 대기 고정지출(픽스처의 월세 650,000원)도 센다. 수입 항목은 합계에도 건수에도 없다.
  t.ok(outCard.startsWith("앞으로 나갈 돈 정기지출 650,000원 이번 달 남은 고정지출 1건 "), `'앞으로 나갈 돈' 카드에 수입 항목을 세지 않는다 (${outCard.slice(0, 90)})`);
  t.ok(!out.reports.includes("30일 안에 나갈 적립 계획"), "리포트의 '30일 안에 나갈 적립 계획'에 수입 항목을 넣지 않는다");
  t.ok(out.reserveRaw.includes("<title>정기 수입·지출</title>"), "정기 항목 화면 제목이 메뉴 이름과 같다");
  t.ok(/<body[^>]*class="[^"]*abPageReserve/.test(out.reserveRaw), "제목을 바꿔도 화면 꾸밈(abPageReserve)이 그대로 붙는다");
  t.ok(out.reserveRaw.includes("<span>준비 알림</span><b>0건</b>") && out.reserve.includes("입금 예정 1건"), "정기 항목 화면의 '준비 알림'은 지출만 세고 수입은 '입금 예정'으로 따로 센다");
  t.ok(out.reserve.includes("이번 달 나갈 항목 없음"), "'이번 달 나갈 정기지출' 아래에 수입 항목 이름을 적지 않는다");
  t.ok(out.reserve.includes("다가오는 납부·입금"), "정기 항목 목록 제목이 수입도 포함한다");
  t.ok(out.summary.includes("직무수당: 4일 후 300,000원 들어올 예정"), "카카오 이번달요약의 정기 알림은 들어올 돈으로 말한다");
  sweepIncomeWording("수입만", out, "직무수당");
}));

// 2) 지출 항목만 — 예전 문구와 알림 등급이 그대로인지(회귀 방지).
await withClock("2026-10-21", () => fixture(async (fx) => {
  const out = await surfaces(fx, [PHONE, CAR_TAX], { kakao: false });
  const phone = out.notifications.find((x) => String(x.title).startsWith("통신비"));
  t.eq(phone?.title, "통신비 납부 4일 전", "지출 항목 알림 제목은 그대로 '납부 N일 전'이다");
  t.eq(phone?.body, "55,000원 · 2026-10-25 예정 · 월 준비 55,000원", "지출 항목 알림 본문은 그대로 월 준비액을 적는다");
  t.eq(phone?.level, "warn", "7일 안의 지출 항목은 경고 등급이다");
  const tax = out.notifications.find((x) => String(x.title).startsWith("자동차세"));
  t.eq(tax?.title, "자동차세 납부 56일 전", "반기 지출 항목 알림");
  t.eq(tax?.level, "info", "7일보다 먼 지출 항목은 안내 등급이다");
  t.ok(out.home.includes("통신비 납부가 4일 남았습니다. 월 55,000원씩 준비하세요."), "홈 안내 문장은 가장 가까운 지출 기한을 말한다");
  t.ok(out.home.includes("2건 · 매월 95,000원 준비") && out.home.includes("준비 알림 2건"), "지출만 있는 가계부의 홈 정기 카드 문구는 예전과 같다");
  // V22.9.78 W-5: 이번 달 남은 지출의 합계다(대기 월세 650,000 + 25일 통신비 55,000, 12월 자동차세 제외).
  t.ok(after(out.home, "앞으로 나갈 돈").startsWith("앞으로 나갈 돈 정기지출 705,000원 이번 달 남은 고정지출 1건 · 정기지출 1건 "), "'앞으로 나갈 돈' 카드는 이번 달 남은 지출 항목을 센다");
  t.ok(out.reports.includes("30일 안에 나갈 적립 계획") && after(out.reports, "30일 안에 나갈 적립 계획").includes("통신비"), "리포트는 30일 안의 지출 항목을 적는다");
  t.ok(out.reserveRaw.includes("<span>준비 알림</span><b>2건</b>"), "정기 항목 화면의 준비 알림은 지출 항목 수다");
}));

// 3) 수입·지출이 섞인 가계부 — 지출 기한이 먼저, 수입은 따로.
await withClock("2026-10-21", () => fixture(async (fx) => {
  const out = await surfaces(fx, [INCOME, PHONE, CAR_TAX]);
  t.ok(out.notifications.some((x) => x.title === "직무수당 입금 4일 전" && x.level === "info"), "섞인 경우에도 수입 항목은 입금 알림이다");
  t.ok(out.notifications.some((x) => x.title === "통신비 납부 4일 전" && x.level === "warn"), "섞인 경우 지출 항목은 납부 알림이다");
  t.ok(out.home.includes("통신비 납부가 4일 남았습니다."), "홈 안내 문장은 같은 날이어도 지출 기한을 먼저 말한다");
  t.ok(out.home.includes("지출 2건 · 매월 95,000원 준비 · 수입 1건"), "홈 정기 카드는 지출과 수입을 나눠 센다");
  t.ok(out.home.includes("준비 알림 2건 · 입금 예정 1건"), "홈 정기 카드의 알림 건수도 나눠 센다");
  t.ok(after(out.home, "앞으로 나갈 돈").startsWith("앞으로 나갈 돈 정기지출 705,000원 이번 달 남은 고정지출 1건 · 정기지출 1건 "), "'앞으로 나갈 돈' 카드는 수입 항목을 빼고 센다");
  const list = after(out.reports, "30일 안에 나갈 적립 계획", 200);
  t.ok(list.includes("통신비") && !list.includes("직무수당"), `리포트의 나갈 적립 계획에 수입 항목이 없다 (${list.slice(0, 120)})`);
  t.ok(out.summary.includes("통신비: 4일 후 55,000원") && out.summary.includes("준비 권장: 월 55,000원"), "카카오 요약은 지출 항목에 준비 권장액을 적는다");
  sweepIncomeWording("섞임", out, "직무수당");
}));

// 4) 기한 당일 — "0일 전"이 아니라 "오늘".
await withClock("2026-10-25", () => fixture(async (fx) => {
  const out = await surfaces(fx, [INCOME, PHONE], { kakao: false });
  t.ok(out.notifications.some((x) => x.title === "직무수당 입금 오늘"), "당일 수입 알림은 '입금 오늘'이다");
  t.ok(out.notifications.some((x) => x.title === "통신비 납부 오늘"), "당일 지출 알림은 '납부 오늘'이다");
  t.ok(out.home.includes("오늘은 통신비 납부일입니다. 55,000원이 나갈 예정이에요."), "홈 안내 문장은 당일 납부를 '오늘'로 말한다");
}));

// 5) 지난달 화면 — 정기 항목을 불러오지 않은 달에 '등록 없음'이라고 단정하지 않는다.
await withClock("2026-10-21", () => fixture(async (fx) => {
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([PHONE]));
  const past = strip((await page(fx, `/app?household_id=${HH}&month=2026-07`)).html);
  const card = after(past, "앞으로 나갈 돈");
  t.ok(card.includes("이번 달 기준") && !card.includes("등록 없음"), `지난달 홈의 '앞으로 나갈 돈' 카드는 '등록 없음'이라고 하지 않는다 (${card.slice(0, 90)})`);
}));

// 6) 카카오 정기 항목 안내(감사 A-11) — 안내의 예시를 보내면 오늘 지출로 저장되던 문구를 바꿨다.
await withClock("2026-10-21", () => fixture(async (fx) => {
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  for (const utterance of ["알림", "자동차세", "준비금"]) {
    const before = fx.db.transactions.length;
    const reply = await skill(fx, utterance);
    t.eq(fx.db.transactions.length, before, `'${utterance}'은 기록을 만들지 않는다`);
    t.ok(reply.includes("웹 > 예산 > 정기 수입·지출") && reply.includes("수당·월세처럼 정해진 날 들어오는 돈"), `'${utterance}' 안내는 등록 위치와 수입 항목을 말한다`);
    t.ok(!reply.includes("입력 예시") && !reply.includes("120만원 8월"), `'${utterance}' 안내에 정기 항목으로 오해할 입력 예시가 없다`);
  }
}));

t.done();
