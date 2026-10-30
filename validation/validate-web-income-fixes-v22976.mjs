// V22.9.76 — 웹 화면이 수입을 지출처럼 다루던 결함과, 화면끼리 숫자·문구가 어긋나던 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// '수당'을 정기 수입으로 등록한 사용자가 알림센터에서 "수당 납부 4일 전 · 월 준비"를 본 사건(V22.9.76) 뒤에
// 웹 화면을 수입 기록·수입 정기 항목을 넣고 실제로 그려 보니 같은 종류의 결함이 더 나왔다.
//   1. /my/settings 정기 항목 폼이 분류 칸에 "정기지출"을 미리 채워, 구분만 수입으로 바꾼 정기 수입이 매달
//      분류 "정기지출"인 수입으로 기록됐다.
//   2. 홈이 지난달 기록이 0건이어도 "지난달 1~N일보다 (이번 달 지출 전부)원 더 썼어요"라고 했다. 리포트는 같은
//      경우 "기록이 없어 비교하지 않아요"라고 한다.
//   3. 분류를 비운 정기 수입 계획이 "세금/수수료"로 저장됐다.
//   4. 정기 항목 화면의 고정 항목 구역이 수입 행에도 "지출자"·"고정지출"을 쓰고, 설명은 "매월 자동 반영"과
//      "버튼 한 번으로 넣는 항목"을 함께 말했다.
//   6. "분류가 필요한 거래 1건" 알림을 누르면 미분류 수입까지 2건이 나왔다.
//   8. 리포트가 "비교하지 않아요"라고 한 바로 아래에 0원과 견준 "+N원", "…보다 N원 늘었어요"를 적었다.
//   9. 수입 행에 결제수단 "미입력"을 붙이고, 결제수단 칩을 월급 통장에서 고르고, 빠른 입력은 수입을 골라도
//      "지출자 선택"·"결제수단"이라고 했다.
//   + 홈 "이 속도면 …원이 남습니다"가 미래 날짜 지출까지 지난 날수로 나눠 예산 알림의 관측 예상과 달랐다.
//   + 카카오 정기 알림이 기한 당일 "0일 후"라고 했다.
// 기존 검사는 소스 문자열을 확인했을 뿐 이 상황을 그려 본 적이 없다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처에 수입 기록·수입 정기 항목·미래 날짜 지출을 넣고, 브라우저가 보내는 폼 값(formFields)을 그대로
// 보내 저장된 행을 확인하고, 화면·JSON·자산을 실제로 받아 문구와 숫자를 확인한다. 화면끼리 같아야 하는 숫자는
// 한쪽에서 읽은 값으로 다른 쪽 문장을 만들어 견준다.
import {
  app, BASE, ctx, counter, fixture, formFields, withClock, page, post, api, skill, putSetting, settingValue,
} from "./lib-audit-v22934.mjs";

const t = counter("V22.9.76 웹 수입·지출 문구와 화면 간 숫자 검사");
const HH = "house-home";
const MONTH = "2026-10";
const Q = `household_id=${HH}&month=${MONTH}`;
const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const won = (n) => `${new Intl.NumberFormat("ko-KR").format(n)}원`;
const BASE_ROW = { household_id: HH, user_id: "user-bin", source: "web" };
const tx = (id, date, type, amount, category, memo, payment = "") => ({ ...BASE_ROW, id, transaction_date: date, type, amount, category, memo, payment_method: payment, raw_text: `${memo} ${amount}`, created_at: `${date}T03:00:00.000Z` });
const budget = (id, category, amount) => ({ id, household_id: HH, month: MONTH, category, amount, created_at: `${MONTH}-01T00:00:00.000Z` });
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// ── 1. /my/settings 정기 항목: 분류를 미리 채우지 않고, 비우면 구분에 맞는 기본값 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  const html = (await page(fx, `/my/settings?${Q}`)).html;
  const add = formFields(html, "/my/recurring/save");
  t.ok(add.found, "1 설정 화면에 정기 항목 추가 폼이 있다");
  // 브라우저가 보내는 값 그대로: 사용자는 구분만 수입으로 바꾸고 내용·금액·날짜를 적는다.
  add.fields.set("type", "income");
  add.fields.set("memo", "수당");
  add.fields.set("amount", "300000");
  add.fields.set("day_of_month", "20");
  const saved = await post(fx, "/my/recurring/save", add.fields);
  t.ok(saved.location.includes("msg=recurring_saved"), `1 정기 수입을 저장한다 (${saved.decoded})`);
  const rule = fx.db.accountbook_recurring.find((row) => row.memo === "수당");
  t.eq(rule?.category, "기타수입", "1 분류를 고르지 않은 정기 수입은 '정기지출'이 아니라 '기타수입'으로 저장된다");
  t.ok(!/name="category"[^>]*value="정기지출"/.test(add.form), "1 추가 폼의 분류 칸에 '정기지출'을 미리 채우지 않는다");
  t.ok(/<datalist id="settingsIncomeCategoryList">[\s\S]*?<option value="급여">[\s\S]*?<option value="기타수입">/.test(html), "1 수입 분류 추천 목록(급여·기타수입)이 있다");
  t.ok(/<select name="type"[^>]*onchange="[^"]*settingsIncomeCategoryList/.test(add.form), "1 구분을 수입으로 바꾸면 분류 추천이 수입 목록으로 바뀐다");

  const expense = formFields(html, "/my/recurring/save");
  expense.fields.set("memo", "관리비");
  expense.fields.set("amount", "180000");
  await post(fx, "/my/recurring/save", expense.fields);
  t.eq(fx.db.accountbook_recurring.find((row) => row.memo === "관리비")?.category, "정기지출", "1 분류를 비운 정기 지출의 기본값은 예전과 같은 '정기지출'이다");

  // 반영하면 수입 기록의 분류가 '정기지출'이 아니다.
  fx.db.accountbook_recurring.forEach((row) => { if (row.id === "recurring-rent") row.last_applied_month = MONTH; });
  await post(fx, "/admin/recurring/apply", { household_id: HH, month: MONTH });
  const income = fx.db.transactions.find((row) => row.memo === "수당" && row.type === "income");
  t.eq(income?.category, "기타수입", "1 반영된 수당 수입 기록의 분류는 '기타수입'이다");
  const budgets = strip((await page(fx, `/budgets?${Q}`)).html);
  const actualIncome = budgets.slice(budgets.indexOf("실제 수입 분류"), budgets.indexOf("실제 수입 분류") + 120);
  t.ok(!actualIncome.includes("정기지출"), `1 예산 화면의 실제 수입 분류에 '정기지출'이 없다 (${actualIncome})`);
}));

// ── 2. 홈: 지난 기간 지출 기록이 없으면 비교하지 않는다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.transactions.push(tx("e-oct", "2026-10-12", "expense", 84000, "식비", "장보기", "국민카드"));
  const home = strip((await page(fx, `/app?${Q}`)).html);
  t.ok(home.includes("지난달 1~21일 기록이 없어 비교하지 않아요."), "2 지난달 같은 기간 기록이 없으면 홈은 비교하지 않는다고 말한다");
  t.ok(!home.includes("지난달 1~21일보다 84,000원 더 썼어요"), "2 0원과 견준 '더 썼어요'를 쓰지 않는다");
  const reports = strip((await page(fx, `/reports?${Q}`)).html);
  t.ok(reports.includes("기록이 없어 비교하지 않아요."), "2 같은 달 리포트도 비교하지 않는다고 말한다(두 화면이 같은 말)");
  // 지난달 기록이 있으면 예전처럼 비교한다.
  fx.db.transactions.push(tx("e-sep", "2026-09-10", "expense", 50000, "식비", "장보기", "국민카드"));
  const compared = strip((await page(fx, `/app?${Q}`)).html);
  t.ok(compared.includes("지난달 1~21일보다 34,000원 더 썼어요."), "2 지난달 같은 기간 기록이 있으면 차이를 말한다");
}));

// ── 3. 정기 수입 계획의 기본 분류 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  putSetting(fx, `reserve_plans:${HH}`, "[]");
  const html = (await page(fx, `/reserve-plans?${Q}`)).html;
  const create = formFields(html, "/admin/reserve-plan/create");
  t.ok(create.found, "3 정기 수입·지출 추가 폼이 있다");
  create.fields.set("type", "income");
  create.fields.set("name", "수당");
  create.fields.set("amount", "300000");
  create.fields.set("recurrence", "monthly");
  create.fields.set("due_day", "25");
  const created = await post(fx, "/admin/reserve-plan/create", create.fields);
  t.ok(created.location.includes("msg=reserve_saved"), `3 정기 수입을 저장한다 (${created.decoded})`);
  const plans = () => JSON.parse(settingValue(fx, `reserve_plans:${HH}`) || "[]");
  t.eq(plans().find((p) => p.name === "수당")?.category, "기타수입", "3 분류를 비운 정기 수입 계획은 '세금/수수료'가 아니라 '기타수입'이다");
  const expenseForm = formFields(html, "/admin/reserve-plan/create");
  expenseForm.fields.set("name", "자동차세");
  expenseForm.fields.set("amount", "240000");
  expenseForm.fields.set("recurrence", "semiannual");
  expenseForm.fields.set("due_month_1", "6");
  expenseForm.fields.set("due_month_2", "12");
  expenseForm.fields.set("due_day", "16");
  await post(fx, "/admin/reserve-plan/create", expenseForm.fields);
  t.eq(plans().find((p) => p.name === "자동차세")?.category, "세금/수수료", "3 분류를 비운 지출 계획의 기본값은 예전과 같은 '세금/수수료'다");
  const reserve = strip((await page(fx, `/reserve-plans?${Q}`)).html);
  t.ok(reserve.includes("수당 수입") && !/수당 수입[^원]*세금\/수수료/.test(reserve), "3 정기 항목 화면의 수당 카드에 '세금/수수료'가 없다");

  // 수정: 지출 항목(기본 분류 그대로)을 수입으로 바꾸면 지출 기본 분류가 남지 않는다. 고른 분류는 그대로다.
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([{ id: "r-tax", name: "연말정산", amount: 500000, type: "expense", recurrence: "annual", due_months: [2], due_day: 10, category: "세금/수수료" }]));
  const edit = formFields((await page(fx, `/reserve-plans?${Q}`)).html, "/admin/reserve-plan/update");
  t.ok(edit.found && edit.fields.get("category") === "세금/수수료", "3 수정 폼은 지금 분류를 채워 보낸다");
  edit.fields.set("type", "income");
  await post(fx, "/admin/reserve-plan/update", edit.fields);
  t.eq(plans()[0]?.type, "income", "3 수정으로 수입이 된다");
  t.eq(plans()[0]?.category, "기타수입", "3 지출 기본 분류 그대로 수입으로 바꾸면 수입 기본 분류가 된다");
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([{ id: "r-ins", name: "보험 환급", amount: 80000, type: "expense", recurrence: "annual", due_months: [3], due_day: 10, category: "보험" }]));
  const chosen = formFields((await page(fx, `/reserve-plans?${Q}`)).html, "/admin/reserve-plan/update");
  chosen.fields.set("type", "income");
  await post(fx, "/admin/reserve-plan/update", chosen.fields);
  t.eq(plans()[0]?.category, "보험", "3 사용자가 고른 분류는 구분을 바꿔도 그대로 둔다");
  // 예전에 분류 없이 저장된 수입 항목도 읽을 때 '세금/수수료'로 채우지 않는다.
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([{ id: "r-old", name: "직무수당", amount: 300000, type: "income", recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25 }]));
  const legacy = strip((await page(fx, `/reserve-plans?${Q}`)).html);
  t.ok(legacy.includes("직무수당 수입") && legacy.includes("기타수입") && !legacy.includes("세금/수수료 다음"), "3 분류 없는 옛 수입 항목은 '기타수입'으로 읽는다");
}));

// ── 4. 정기 항목 화면의 고정 수입·지출 구역 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.accountbook_recurring.push(
    { id: "recurring-allow", household_id: HH, type: "income", amount: 300000, category: "급여", memo: "수당", payment_method: "급여통장", day_of_month: 25, user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00.000Z" },
    { id: "recurring-left", household_id: HH, type: "income", amount: 50000, category: "용돈수입", memo: "용돈", payment_method: "", day_of_month: 3, user_id: "user-left", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00.000Z" },
  );
  const html = (await page(fx, `/reserve-plans?${Q}`)).html;
  const text = strip(html);
  t.ok(text.includes("매달 자동 기록"), "4 구역 제목이 수입·지출을 가리지 않는다(V22.9.83 '매달 자동 기록', 예전 '매월 자동 반영되는 고정 수입·지출')");
  t.ok(!text.includes("버튼 한 번으로 이번 달 기록에 넣는"), "4 '자동 반영'과 어긋나는 '버튼 한 번으로 넣는 항목' 설명이 없다");
  t.ok(text.includes("지정일이 되면 그달 기록에 한 번 자동으로 들어가고") && text.includes("지정일 전에 넣으려면 아래 기록하기 단추를 누르세요"), "4 설명은 자동 반영(지정일)과 버튼(지금)을 한 문장으로 말한다");
  const card = (memo) => { const i = html.indexOf(`<b>${memo}</b>`); return i < 0 ? "" : html.slice(i, html.indexOf("</form></div>", html.indexOf("/admin/recurring/delete", i)) + 13); };
  const allowance = card("수당");
  t.ok(/<label>수입자<select name="user_id">/.test(allowance) && allowance.includes(">수입자 선택</option>"), "4 수입 행의 수정 폼은 '수입자'라고 한다");
  t.ok(allowance.includes("이 고정 수입 항목을 삭제할까요?"), "4 수입 행의 삭제 확인은 '고정 수입'이라고 한다");
  const rent = card("월세");
  t.ok(/<label>지출자<select name="user_id">/.test(rent) && rent.includes("이 고정지출 항목을 삭제할까요?"), "4 지출 행은 예전처럼 '지출자'·'고정지출'이다");
  t.ok(card("용돈").includes("수입자 확인 필요 · 수입자가 활성 참여자"), "4 수입 행의 참여자 확인 안내도 '수입자'라고 한다");
  t.ok(text.includes("자동 기록 항목 추가") && text.includes("이번 달분 지금 기록하기"), "4 추가·반영 버튼이 수입·지출을 가리지 않는다(V22.9.83 이름)");
  t.ok(/<select name="type" onchange="[^"]*수입자[^"]*"/.test(html) && html.includes("<span data-recurring-person>지출자</span>"), "4 추가 폼은 구분을 수입으로 바꾸면 사람 칸을 '수입자'로 바꾼다");
}));

// ── 6. 미분류 알림의 건수와 누르면 열리는 목록의 건수가 같다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.transactions.push(
    tx("u-inc", "2026-10-18", "income", 70000, "", "입금"),
    tx("u-exp", "2026-10-18", "expense", 9000, "", "뭔가", "국민카드"),
  );
  const notifications = (await api(fx, `/u/api/notifications?${Q}`)).data?.notifications || [];
  const uncat = notifications.find((n) => String(n.key).startsWith("uncat:"));
  t.ok(uncat, "6 미분류 지출 알림이 있다");
  const count = Number((String(uncat?.title).match(/(\d+)건/) || [])[1]);
  t.eq(count, 1, `6 알림은 미분류 지출만 센다 (${uncat?.title})`);
  const list = strip((await page(fx, String(uncat?.href || "").replace(/#.*$/, ""))).html);
  const shown = Number((list.match(/필터 적용 (\d+)건/) || [])[1]);
  t.eq(shown, count, `6 알림을 누르면 같은 건수의 목록이 열린다 (목록 ${shown}건)`);
  t.ok(!list.includes("입금 2026-10-18"), "6 열린 목록에 미분류 수입이 섞이지 않는다");
}));

// ── 8. 리포트: 지난 기간 기록이 없으면 항목별 증감과 '가장 늘어난 항목' 문장도 숨긴다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.transactions.push(
    tx("r1", "2026-10-12", "expense", 84000, "식비", "장보기", "국민카드"),
    tx("r2", "2026-10-20", "expense", 12000, "카페/간식", "커피", "국민카드"),
  );
  const empty = strip((await page(fx, `/reports?${Q}`)).html);
  t.ok(empty.includes("지난달 같은 기간(1~21일) 기록이 없어 비교하지 않아요."), "8 요약은 비교하지 않는다고 말한다");
  t.ok(!/[+−][\d,]+원 \(지난달 같은 기간\(1~21일\) 대비\)/.test(empty), "8 항목·카드 줄에 0원과 견준 증감(+N원 … 대비)이 없다");
  t.ok(!empty.includes("늘었어요"), "8 '…보다 N원 늘었어요' 문장이 없다");
  t.ok(!empty.includes("비교 기록 없음 (지난달"), "8 항목마다 '비교 기록 없음'을 되풀이하지 않는다");
  // 지난 기간 기록이 있으면 예전처럼 비교한다.
  fx.db.transactions.push(tx("r0", "2026-09-08", "expense", 30000, "식비", "장보기", "국민카드"));
  const compared = strip((await page(fx, `/reports?${Q}`)).html);
  t.ok(compared.includes("장보기 지출이 지난달 같은 기간(1~21일)보다 54,000원 늘었어요."), "8 지난 기간 기록이 있으면 가장 늘어난 항목을 말한다");
  t.ok(/국민카드 [\d,]+원 2건 · \+66,000원 \(지난달 같은 기간\(1~21일\) 대비\)/.test(compared), "8 지난 기간 기록이 있으면 카드별 증감을 적는다");
}));

// ── 9. 수입 행·결제수단 칩·빠른 입력 문구 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.transactions.push(
    tx("p1", "2026-10-01", "income", 3200000, "급여", "10월 월급", "급여통장"),
    tx("p2", "2026-10-10", "income", 200000, "부업/매출", "강의료", "급여통장"),
    tx("p3", "2026-10-18", "income", 50000, "용돈수입", "용돈 받음", ""),
    tx("p4", "2026-10-12", "expense", 84000, "식비", "장보기", "국민카드"),
    tx("p5", "2026-10-15", "expense", 6000, "카페/간식", "커피", ""),
  );
  const html = (await page(fx, `/app?${Q}&feed=all`)).html;
  const text = strip(html);
  t.ok(text.includes("용돈 받음 2026-10-18 · 용돈수입 수입자"), "9 결제수단 없는 수입 행에 '미입력'을 붙이지 않는다");
  t.ok(text.includes("커피 2026-10-15 · 카페/간식 · 미입력 지출자"), "9 결제수단 없는 지출 행은 예전처럼 '미입력'이다");
  t.ok(text.includes("10월 월급 2026-10-01 · 급여 · 급여통장 수입자"), "9 수입 행에 결제수단이 있으면 그대로 보여 준다");
  t.ok(html.includes('data-pay-only="국민카드"') && !html.includes('data-pay-only="급여통장"'), "9 결제수단 칩은 지출 기록에서만 고른다(월급 통장 제외)");

  // 빠른 입력: 수입을 고르면 사람·결제수단 칸 문구가 바뀐다. 실제로 내려가는 자산의 함수를 가짜 DOM 으로 돌린다.
  const src = (html.match(/<script id="mobileAppInlineRuntime" src="([^"]+)"/) || [])[1];
  t.ok(src, "9 홈이 빠른 입력 실행 자산을 싣는다");
  const asset = await (await app.fetch(new Request(`${BASE}${src}`), fx.env, ctx)).text();
  const fn = (asset.match(/function abQuickTypeLabels\(\)\{[\s\S]*?\}(?=function abQuickSyncMore\(\))/) || [])[0];
  t.ok(fn && /function abQuickSyncMore\(\)\{abQuickTypeLabels\(\);/.test(asset), "9 빠른 입력 요약 갱신이 구분 문구도 갱신한다");
  const run = (income) => {
    const option = { value: "", text: "지출자 선택" };
    const pay = { placeholder: "결제수단" };
    const doc = {
      querySelector: (sel) => sel === "#add input[name=type][value=income]:checked" ? (income ? {} : null) : sel === "#add select[name=user_id]" ? { options: [option] } : null,
      getElementById: (id) => id === "payInput" ? pay : null,
    };
    new Function("document", `${fn}\nabQuickTypeLabels();`)(doc);
    return { option: option.text, pay: pay.placeholder };
  };
  t.deepEq(run(true), { option: "수입자 선택", pay: "입금 계좌·수단" }, "9 수입을 고르면 '수입자 선택'·'입금 계좌·수단'으로 바뀐다");
  t.deepEq(run(false), { option: "지출자 선택", pay: "결제수단" }, "9 지출로 돌아오면 원래 문구다");
}));

// ── + 홈 '이 속도면'은 예산 알림·알림센터와 같은 관측 기준(오늘까지의 기록)이다 ──
await withClock("2026-10-21", () => fixture(async (fx) => {
  fx.db.transactions.push(
    tx("f1", "2026-10-12", "expense", 84000, "식비", "장보기", "국민카드"),
    // 미래 날짜로 미리 적은 지출(예: 모임 회비 예약, 지정일 전에 반영한 고정지출).
    tx("f2", "2026-10-28", "expense", 100000, "식비", "모임 회비", "국민카드"),
  );
  fx.db.accountbook_budgets.push(budget("b-food", "식비", 500000));
  const observation = (await api(fx, `/u/api/notifications?${Q}`)).data?.budget_observation || {};
  // V22.9.89 Z-8: 속도는 그대로 오늘까지의 84,000원으로 센다(남은 10일 40,000원). 다만 남은 날 예상은 미리 적은 100,000원보다 작지 않아
  // 월말 예상은 184,000원(= 그 달 등록액)이다. 예전 124,000원이면 홈이 ‘376,000원이 남아요’라 해 지금 남은 예산 316,000원보다 컸다.
  t.eq(observation.forecast, 184000, "+ 알림센터의 월말 예상: 속도(84,000원 기준 40,000원)보다 미리 적은 100,000원이 커서 184,000원");
  const home = strip((await page(fx, `/app?${Q}`)).html);
  // V22.9.79 V76 W-7: 홈 한 줄과 예산 알림의 이름이 ‘월말 예상’ 하나로 바뀌었다(숫자는 같은 monthSpendingOutlook).
  // V22.9.89 U-03: 홈 한 줄은 ‘이대로면 월말에 예산이 약 N만 원 남아요’(근사)다. 같은 월말 예상에서 나온다.
  t.ok(home.includes(`이대로면 월말에 예산이 약 ${Math.round((500000 - observation.forecast) / 10000)}만 원 남아요`), `+ 홈 월말 문장이 알림센터 예상과 같은 숫자다 (${(home.match(/이대로면 월말에 [^.]*?남아요/) || [""])[0]})`);
  t.ok(500000 - observation.forecast <= 316000, "+ 월말에 남을 예산이 지금 남은 예산(316,000원)보다 크지 않다");
  const alerts = strip((await page(fx, `/budget-alerts?${Q}`)).html);
  t.ok(alerts.includes(`월말 예상 지출 ${won(observation.forecast)}`), "+ 예산 알림 화면도 같은 월말 예상을 보여 준다");
  t.ok(home.includes("316,000") && home.includes("하루 28,727"), "+ 남은 예산·하루 금액은 예전처럼 미래 날짜 기록을 포함한 월 전체 기준이다");
}));

// ── + 카카오 정기 알림: 기한 당일은 '오늘' ──
await withClock("2026-10-25", () => fixture(async (fx) => {
  putSetting(fx, `reserve_plans:${HH}`, JSON.stringify([
    { id: "r-allow", name: "직무수당", amount: 300000, type: "income", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "급여" },
    { id: "r-phone", name: "통신비", amount: 55000, type: "expense", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "통신" },
  ]));
  fx.db.transactions.push(tx("k1", "2026-10-20", "expense", 12000, "식비", "점심", "국민카드"));
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  const summary = await skill(fx, "이번달요약");
  t.ok(summary.includes("직무수당: 오늘 300,000원 들어올 예정"), "+ 당일 수입 항목은 '오늘 … 들어올 예정'이다");
  t.ok(summary.includes("통신비: 오늘 55,000원"), "+ 당일 지출 항목도 '오늘'이다");
  t.ok(!summary.includes("0일 후"), "+ '0일 후'라고 하지 않는다");
}));

t.done();
