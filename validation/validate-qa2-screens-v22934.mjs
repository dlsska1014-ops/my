// V22.9.34 — 2차 점검 보고서의 화면 결함(B10·B11·U01·U02)과 감사 T3, 날짜 시트 수정 폼(B14)을 고정한다.
//   B10 거래내역 탭의 분류 직접 입력이 select 와 같은 이름이라 무시되던 것을 고친다(category_text 우선, 중복 값은 마지막 값).
//   B11 정산 완료 저장이 비율·인원수·품목별 조건을 잃던 것을 고친다(조건·부담액을 이력에 남기고 기록이 바뀌면 저장하지 않음).
//   U01 이번 달 무지출일·하루 평균은 오늘까지, 앞으로 올 달은 세지 않는다.
//   U02 달·가계부를 바꿔도 보던 탭·필터를 유지하고, 다른 달의 날짜(date)는 넘기지 않는다.
//   T3 추천 반복 거래를 받아들일 때 이번 달에 이미 적은 지출은 한 번 더 넣지 않는다.
//   B14 날짜 시트의 수정 폼은 저장된 메모 그대로와 원래 값(orig_*)을 싣는다.
import { BASE, api, app, counter, ctx, fixture, formFields, page, post, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.34 2차 점검 화면 검사 통과");
const text = (html) => String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ── B10 분류 필터 ────────────────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const tab = (query) => page(fx, `/app?month=2026-07&household_id=house-home&tab=transactions&${query}`);
    const shows = (html, memo) => text(html).includes(memo);
    const duplicate = await tab("category=&category=%EA%B5%90%ED%86%B5");
    ok(shows(duplicate.html, "주유") && !shows(duplicate.html, "주말 장보기"), "B10 예전 화면처럼 category 가 두 번 와도(빈 값·교통) 교통만 보인다");
    const typed = await tab("category=%EC%8B%9D%EB%B9%84&category_text=%EA%B5%90%ED%86%B5");
    ok(shows(typed.html, "주유") && !shows(typed.html, "주말 장보기"), "B10 select(식비)와 직접 입력(교통)이 함께 오면 직접 입력이 이긴다");
    const all = await tab("category=&category_text=");
    ok(shows(all.html, "주유") && shows(all.html, "주말 장보기"), "B10 둘 다 비면 전체를 보인다");
    ok(/<select name="category"/.test(all.html) && /<input name="category_text"/.test(all.html) && !/<input name="category" list=/.test(all.html), "B10 거래내역 탭의 직접 입력은 category_text 로 보낸다");
  });
});

// ── U02 달 이동 ──────────────────────────────────────────────
await withClock("2026-10-09", async () => {
  await fixture(async (fx) => {
    const res = await page(fx, "/app?month=2026-07&household_id=house-home&tab=transactions&type=expense&category=%EA%B5%90%ED%86%B5&date=2026-07-07");
    const header = res.html.match(/<form class="selectLine[^"]*" method="get" action="\/app">[\s\S]*?<\/form>/)?.[0] || "";
    ok(/name="tab" value="transactions"/.test(header) && /name="type" value="expense"/.test(header) && /name="category" value="교통"/.test(header), "U02 달·가계부 선택이 보던 탭과 필터를 함께 보낸다");
    ok(!/name="date"/.test(header), "U02 달을 바꿀 때 그 달에만 맞는 날짜(date)는 넘기지 않는다");
    const back = (res.html.match(/class="appMonthAwayGo" href="([^"]+)"/) || [])[1]?.replace(/&amp;/g, "&") || "";
    const params = new URL(back, BASE).searchParams;
    ok(params.get("month") === "2026-10" && params.get("tab") === "transactions" && !params.has("date") && params.get("category") === "교통", "U02 '이번 달로 이동'은 탭·필터를 유지하고 날짜를 뺀다");
  });
});

// ── U01 무지출일 기준 ───────────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const spendDays = new Set(fx.db.transactions.filter((row) => row.household_id === "house-home" && row.type === "expense" && row.transaction_date >= "2026-07-01" && row.transaction_date <= "2026-07-15").map((row) => row.transaction_date));
    const expectedToDate = 15 - spendDays.size;
    const current = await page(fx, "/my/analysis?month=2026-07&household_id=house-home&view=report");
    ok(current.html.includes("2026-07-01 ~ 2026-07-15 오늘까지 기준"), "U01 이번 달은 오늘까지를 기준으로 밝힌다");
    ok(new RegExp(`오늘까지 무지출일</span><b>${expectedToDate}일</b>`).test(current.html), `U01 이번 달 무지출일은 오늘까지 센다(${expectedToDate}일)`);
    const past = await page(fx, "/my/analysis?month=2026-06&household_id=house-home&view=report");
    ok(past.html.includes("2026-06-01 ~ 2026-06-30 월 전체 기준"), "U01 지난 달은 월 전체를 기준으로 센다");
    const future = await page(fx, "/my/analysis?month=2026-08&household_id=house-home&view=report");
    ok(future.html.includes("아직 오지 않은 달이라 세지 않습니다") && /무지출일<\/span><b>-<\/b>/.test(future.html), "SIM-15 앞으로 올 달은 무지출일을 세지 않는다");
  });
});

// ── T3 추천 반복 거래 ───────────────────────────────────────
await withClock("2026-10-09", async () => {
  await fixture(async (fx) => {
    fx.env.CRON_SECRET = "cron-secret-qa";
    for (const month of ["2026-08", "2026-09", "2026-10"]) fx.db.transactions.push({ id: `tx-nf-${month}`, household_id: "house-home", user_id: "user-bin", transaction_date: `${month}-03`, type: "expense", amount: 13500, category: "구독", memo: "넷플릭스", payment_method: "현대카드", source: "web_admin", created_at: `${month}-03T00:00:00Z` });
    const confirmed = await post(fx, "/my/recurring/from-candidate", { household_id: "house-home", month: "2026-10", confirmed: "yes", memo: "넷플릭스", amount: "13500", category: "구독", payment_method: "현대카드", day_of_month: "3" });
    const rule = fx.db.accountbook_recurring.find((row) => row.memo === "넷플릭스");
    ok(/recurring_registered/.test(confirmed.decoded) && rule?.last_applied_month === "2026-10", "T3 이번 달에 이미 적은 지출이면 규칙을 이번 달 반영된 것으로 만든다");
    await app.fetch(new Request(`${BASE}/cron/recurring/apply?today=2026-10-09`, { method: "POST", headers: { "x-cron-secret": "cron-secret-qa" } }), fx.env, ctx);
    eq(fx.db.transactions.filter((row) => row.memo === "넷플릭스" && row.transaction_date.startsWith("2026-10")).length, 1, "T3 자동 반영이 이번 달 넷플릭스를 한 번 더 넣지 않는다");
    const manual = await post(fx, "/my/recurring/save", { household_id: "house-home", month: "2026-10", type: "expense", memo: "주말 장보기", amount: "148000", category: "식비", day_of_month: "4" });
    const manualRule = fx.db.accountbook_recurring.find((row) => row.memo === "주말 장보기");
    ok(/recurring_saved/.test(manual.decoded) && manualRule && manualRule.last_applied_month !== "2026-10", "T3 이번 달에 같은 기록이 없으면 새 규칙은 이번 달에도 반영할 수 있게 둔다");
  });
});

// ── B11 정산 조건 ───────────────────────────────────────────
const settlementFixture = (task) => fixture(async (fx) => {
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== "house-home");
  fx.db.transactions.push({ id: "tx-a", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 3000, category: "식비", memo: "점심", payment_method: "", source: "web_admin", created_at: "2026-07-10T00:00:00Z" });
  return task(fx);
});
const complete = async (fx, query, note) => {
  const view = await page(fx, `/settlement-summary?month=2026-07&household_id=house-home&${query}`);
  const { found, fields } = formFields(view.html, "/my/settlement/save");
  fields.set("confirmed", "yes");
  fields.set("note", note);
  return { found, fields, saved: await post(fx, "/my/settlement/save", fields) };
};
const lastHistory = (fx) => JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home")?.value || "[]").at(-1) || {};
const sharesOf = (entry) => (entry.shares || []).map((share) => `${share.user_id}:${share.share}`).sort().join(",");
await withClock("2026-07-15", async () => {
  for (const [label, query, expected] of [
    ["비율 2:1", "mode=ratio&weight_user-bin=2&weight_user-wifi=1", "user-bin:2000,user-wifi:1000"],
    ["인원수 3:1", "mode=headcount&weight_user-bin=3&weight_user-wifi=1", "user-bin:2250,user-wifi:750"],
    ["품목별(Bin 만)", "mode=item&item_tx-a=user-bin", "user-bin:3000,user-wifi:0"],
  ]) {
    await settlementFixture(async (fx) => {
      const { found, saved } = await complete(fx, query, label);
      const entry = lastHistory(fx);
      ok(found && /msg=settlement_completed/.test(saved.decoded) && sharesOf(entry) === expected && entry.schema_version === 2, `B11 ${label}: 완료 이력에 미리보기와 같은 부담액을 남긴다(${sharesOf(entry)})`);
      ok(saved.decoded.includes(query.split("&")[1]), `B11 ${label}: 완료 뒤 화면도 같은 조건으로 돌아온다`);
      const after = await page(fx, saved.location);
      ok(/부담액<\/th>/.test(after.html) && /원 · /.test(text(after.html)), `B11 ${label}: 이력 표가 사람별 부담액을 보여 준다`);
    });
  }
  await settlementFixture(async (fx) => {
    const view = await page(fx, "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio&weight_user-bin=2&weight_user-wifi=1");
    const { fields } = formFields(view.html, "/my/settlement/save");
    fields.set("confirmed", "yes");
    fx.db.transactions.push({ id: "tx-b", household_id: "house-home", user_id: "user-wifi", transaction_date: "2026-07-11", type: "expense", amount: 50000, category: "식비", memo: "저녁", payment_method: "", source: "web_admin", created_at: "2026-07-11T00:00:00Z" });
    const saved = await post(fx, "/my/settlement/save", fields);
    ok(/err=settlement_changed/.test(saved.decoded) && !fx.db.accountbook_settings.some((row) => row.key === "settlement_history:house-home"), "B11 화면을 연 뒤 지출이 바뀌면 완료를 저장하지 않는다");
    const notice = await page(fx, saved.location);
    ok(notice.html.includes("화면을 연 뒤 이 달 지출 기록이 바뀌어 저장하지 않았습니다"), "B11 바뀐 이유를 알려 준다");
  });
});

// ── B14 날짜 시트 수정 폼 ───────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const target = fx.db.transactions.find((row) => row.id === "tx-expense-1");
    target.memo = "";
    target.raw_text = "마트 장보기 148000원";
    const day = await api(fx, `/u/api/day-transactions?date=${target.transaction_date}&household=house-home`);
    const item = (day.data?.items || []).find((row) => row.id === "tx-expense-1");
    ok(item && item.memo_raw === "" && item.memo === "마트 장보기 148000원", "B14 날짜 시트 데이터가 저장된 메모(memo_raw)를 따로 준다");
    const html = (await page(fx, "/app?month=2026-07&household_id=house-home")).html;
    const v5Path = (html.match(/\/assets\/accountbook-v5-v\d+\.js/) || [])[0];
    const v5 = await (await app.fetch(new Request(BASE + v5Path), {}, ctx)).text();
    ok(/name="orig_' \+ key/.test(v5) && /item\.memo_raw/.test(v5), "B14 날짜 시트 수정 폼이 원래 값(orig_*)과 저장된 메모를 싣는다");
  });
  await fixture(async (fx) => {
    fx.db.__honor_select = true;
    const full = await page(fx, "/transactions/edit?id=tx-expense-2&return_to=%2Fapp%3Fmonth%3D2026-07%26household_id%3Dhouse-home");
    ok(full.status === 200 && /기록 수정[\s\S]{0,80}주유/.test(full.html), "T1b 전체 페이지 수정 화면의 제목 설명도 기록 내용(주유)을 보여 준다");
  });
});

done();
