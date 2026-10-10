// V22.9.38 생활비 리포트 검사.
// /reports 는 합계 네 칸과 상위 분류 표만 있는 "월 마감" 화면이었다. 이제 같은 기록을 월간·주간으로 읽고, 비교 기준을 한 가지만
// 써서 화면에 적으며, 고정비·구독·날짜별 지출·생활 패턴·카드별 사용액(실적 목표)을 보여 준다. 이 검사는 고정 시계(2026-07-15)와
// 메모리 픽스처로 월간·주간·지난달 화면의 숫자와 문구, 반복 지출·고정비 판정, 카드 실적 목표 저장 경로(권한·검증·잠금)와 공유 문구,
// DB 왕복 수를 본다. 어둡게/밝게 대비는 tools/screen-audit.mjs 로 따로 잰다.
import { readFileSync } from "node:fs";
import { counter, fixture, intercept, page, post, settingValue, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.38 생활비 리포트 검사 통과");
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const Q = "month=2026-07&household_id=house-home";
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const h2s = (html) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

// ── 1. 소스 ────────────────────────────────────────────────────────────────
{
  ok(source.includes('if (url.pathname === "/my/card-target/save" && request.method === "POST") {\n        return await handleCardTargetSave(request, env);'), "카드 실적 목표 저장 경로가 라우터에 있고 await 로 돌려준다");
  ok(source.includes('renderReportMonthNavigator({ path: "/reports", month, householdId: selected.id, extra: range === "week" ? { range: "week" } : {} })'), "월 이동 내비게이터가 주간 보기를 유지한다");
  ok(source.includes("function buildLivingReport(") && source.includes("function livingReportPeriod("), "리포트 모델과 기간·비교 기준 계산이 분리돼 있다");
  ok(!/낭비/.test(source.slice(source.indexOf("function buildLivingReport("), source.indexOf("function renderFreeReportsHtml("))) || source.includes("늘어난 금액이 곧 낭비라는 뜻은 아니에요"), "늘어난 지출을 낭비라고 부르지 않는다");
  ok(source.includes("카드사가 인정하는 실적과 다를 수 있으니"), "카드 사용액은 예상치임을 화면에 적는다");
  const gradients = source.match(/linear-gradient\(135deg,#111827,var\(--ab12-action,#1d4ed8\)\)/g) || [];
  ok(gradients.length >= 1, "리포트 머리 카드가 톤 토큰 그라데이션을 쓴다");
}

await withClock("2026-07-15", async () => {
  // ── 2. 월간(진행 중인 달) ───────────────────────────────────────────────
  await fixture(async (fx) => {
    let calls = 0;
    const restore = intercept(async () => { calls += 1; return null; });
    const res = await page(fx, `/reports?${Q}`);
    restore();
    eq(res.status, 200, "월간 리포트가 열린다");
    ok(calls <= 10, `월간 리포트의 DB 왕복이 10회 이하다 (${calls}회)`);
    const t = text(res.html);
    ok(res.html.includes("<h1>생활비 리포트</h1>"), "제목이 생활비 리포트다");
    eq(h2s(res.html).join("|"), "기간 요약|고정비와 구독|날짜별 지출|지출 상위 분류|생활 패턴|카드별 사용액과 실적 목표|자동 생성 설정|카카오톡에 공유할 문구", "절 제목이 정해진 순서대로 있고 분석 화면 제목과 겹치지 않는다");
    ok(t.includes("2026년 7월 · 오늘까지"), "진행 중인 달은 오늘까지임을 적는다");
    ok(t.includes("지출 248,600원 15일 동안"), "15일 동안의 지출 합계를 적는다");
    ok(t.includes("하루 평균 16,573원"), "하루 평균은 지난 날 수(15일)로 나눈다");
    ok(t.includes("지출한 날 3일") && t.includes("무지출 12일"), "지출한 날·무지출 날을 센다");
    ok(t.includes("지난달 같은 기간(1~15일) 기록이 없어 비교하지 않아요"), "비교 기록이 없으면 비교하지 않는다고 말한다");
    ok(t.includes("기준: 지난달 같은 기간(1~15일) 대비") && t.includes("비교 기준은 한 가지만 씁니다"), "비교 기준을 한 가지만 화면에 적는다");
    ok(res.html.includes('class="lrBadges"') && t.includes("무지출 12일") && t.includes("고정비 1건 등록"), "달성 배지가 보인다");
    ok(t.includes("매달 나가는 정기 항목 650,000원") && t.includes("월세") && t.includes("반영 전"), "정기 항목과 이번 달 반영 여부를 보여 준다");
    ok(t.includes("자동차보험") && t.includes("D-17"), "30일 안의 적립 계획을 D-일로 보여 준다");
    ok(t.includes("지출이 큰 날: 7/4(토) 148,000원 · 7/7(화) 72,000원 · 7/9(목) 28,600원"), "지출이 큰 날 세 개를 요일과 함께 적는다");
    ok(res.html.includes('<div class="tableWrap tableFit"><table><thead><tr><th>분류</th><th>금액</th><th>건수</th>') && t.includes("식비 148,000원 1건"), "상위 분류 표가 그대로 있다");
    ok(t.includes("주말 하루 평균 37,000원") && t.includes("평일 하루 평균 9,145원"), "주말·평일 하루 평균을 견준다");
    ok(t.includes("국민카드") && t.includes("148,000원") && res.html.includes('action="/my/card-target/save"'), "등록한 카드의 사용액과 실적 목표 폼이 있다");
    ok(t.includes("실적 목표가 없어요"), "목표가 없으면 없다고 말한다");
    const share = (res.html.match(/<textarea id="reportShare"[^>]*>([\s\S]*?)<\/textarea>/) || [, ""])[1];
    ok(share.includes("월간 생활비 리포트") && share.includes("기준: 지난달 같은 기간(1~15일) 대비") && share.includes("고정비 650,000원 (정기 항목 1건)"), "공유 문구에 기간·비교 기준·고정비가 있다");
    ok(!/NaN|undefined|Infinity/.test(res.html), "월간 화면에 NaN·undefined 가 없다");
  });

  // ── 3. 지난달·주간 ─────────────────────────────────────────────────────
  await fixture(async (fx) => {
    const past = text((await page(fx, "/reports?month=2026-06&household_id=house-home")).html);
    ok(past.includes("기준: 지난달 전체 대비") && past.includes("지난달 전체 기록이 없어 비교하지 않아요"), "끝난 달은 지난달 전체와 견준다");
    const week = await page(fx, `/reports?${Q}&range=week`);
    const wt = text(week.html);
    ok(wt.includes("7/13(월)부터 한 주") && wt.includes("기준: 지난주 같은 요일까지 대비"), "주간 기본값은 오늘이 든 주이고 지난주 같은 요일까지와 견준다");
    ok(wt.includes("지난주 같은 요일까지보다 72,000원 덜 썼어요 (−100%)"), "지난주 월~수(7/7 72,000원)와 견준다");
    ok(/<a href="[^"]*range=week&amp;week=2026-07-13" aria-current="true" class="">7\/13~7\/19 · 이번 주<\/a>/.test(week.html), "이번 주 칩이 선택돼 있다");
    ok(/reportMonthNav[\s\S]*href="\/reports\?month=2026-06&amp;household_id=house-home&amp;range=week"/.test(week.html), "월 이동 링크가 주간 보기를 유지한다");
    ok(week.html.includes('<input type="hidden" name="range" value="week"/>'), "월 이동 폼도 주간 보기를 유지한다");
    const closed = text((await page(fx, `/reports?${Q}&range=week&week=2026-07-06`)).html);
    ok(closed.includes("7/6(월)부터 한 주") && closed.includes("지난주 전체보다 47,400원 덜 썼어요 (−32%)"), "끝난 주는 지난주 7일 전체와 견준다(100,600원 vs 148,000원)");
    ok(closed.includes("주간 생활비 리포트") || (await page(fx, `/reports?${Q}&range=week&week=2026-07-06`)).html.includes("주간 생활비 리포트"), "주간 공유 문구는 주간이라고 적는다");
    const bogus = await page(fx, `/reports?${Q}&range=week&week=2026-13-99`);
    ok(bogus.status === 200 && text(bogus.html).includes("7/13(월)부터 한 주"), "잘못된 주 날짜는 오늘이 든 주로 본다");
  });

  // ── 4. 늘어난 지출·반복 지출 후보·구독·고정비 반영 ───────────────────────
  await fixture(async (fx) => {
    const row = (id, date, amount, memo, category, extra = {}) => fx.db.transactions.push({ id, household_id: "house-home", user_id: "user-bin", transaction_date: date, type: "expense", amount, category, memo, payment_method: "", source: "web", raw_text: memo, created_at: `${date}T03:00:00Z`, ...extra });
    row("tx-lr-1", "2026-07-10", 25000, "배민 치킨", "배달");
    row("tx-lr-2", "2026-06-10", 12000, "요기요 피자", "배달");
    row("tx-lr-3", "2026-05-03", 13500, "넷플릭스", "구독");
    row("tx-lr-4", "2026-06-03", 13500, "넷플릭스", "구독");
    row("tx-lr-5", "2026-07-03", 13500, "넷플릭스", "구독");
    row("tx-lr-6", "2026-07-05", 650000, "월세", "주거/관리");
    const t = text((await page(fx, `/reports?${Q}`)).html);
    ok(t.includes("배달 25,000원") && t.includes("+13,000원"), "생활 패턴이 배달 지출과 지난달 같은 기간 대비 증감을 적는다");
    ok(t.includes("장보기 지출이 지난달 같은 기간(1~15일)보다 148,000원 늘었어요") && t.includes("늘어난 금액이 곧 낭비라는 뜻은 아니에요"), "가장 많이 늘어난 항목(장보기 148,000원, 지난달 같은 기간 0원)을 짚되 낭비라고 하지 않는다");
    ok(t.includes("구독으로 보이는 지출 13,500원"), "구독으로 보이는 지출을 합산한다");
    ok(t.includes("넷플릭스") && /넷플릭스 \d개월 반복/.test(t), "최근 석 달에 반복된 지출을 후보로 보여 준다");
    ok(t.includes("반영 전"), "같은 메모·금액의 수동 기록만으로 정기 반영을 주장하지 않는다");
    fx.db.transactions.find((row) => row.id === "tx-lr-6").raw_text = "recurring:recurring-rent:2026-07";
    ok(text((await page(fx, `/reports?${Q}`)).html).includes("이번 달 반영"), "정기 규칙 식별자가 맞는 기록만 반영으로 표시한다");
    ok(t.includes("더 썼어요") && t.includes("(+"), "지난달 같은 기간보다 늘면 더 썼다고 적는다");
  });

  // ── 5. 카드 실적 목표 저장 ─────────────────────────────────────────────
  await fixture(async (fx) => {
    const key = "card_targets:house-home";
    const save = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", range: "month", week: "", asset_id: "asset-1", target: "300,000" });
    ok(save.status === 303 && save.location.includes("msg=card_target_saved"), "소유자가 실적 목표를 저장한다(쉼표 허용)");
    const stored = JSON.parse(settingValue(fx, key) || "{}");
    eq(stored["asset-1"]?.target, 300000, "목표가 설정에 저장된다");
    const t = text((await page(fx, `/reports?${Q}`)).html);
    ok(t.includes("목표 300,000원 중 49%") && t.includes("152,000원 남음(예상)"), "진행률과 남은 금액을 예상으로 적는다");
    ok(/aria-valuenow="49"/.test((await page(fx, `/reports?${Q}`)).html), "진행률이 접근성 값으로도 나간다");
    const week = text((await page(fx, `/reports?${Q}&range=week`)).html);
    ok(week.includes("월 실적 목표 300,000원") && !week.includes("남음(예상)"), "주간 보기는 월 목표만 적고 진행률은 월간에서 본다");
    const invalid = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "abc" });
    ok(invalid.location.includes("err=card_target_invalid"), "금액이 아니면 저장하지 않는다");
    const small = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "500" });
    ok(small.location.includes("err=card_target_invalid") && JSON.parse(settingValue(fx, key))["asset-1"].target === 300000, "1,000원 미만은 거절하고 기존 값을 지킨다");
    const missing = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-2", target: "100000" });
    ok(missing.location.includes("err=card_target_asset_missing"), "카드가 아닌 자산(급여통장)에는 목표를 두지 않는다");
    const reached = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "100000" });
    ok(reached.location.includes("msg=card_target_saved") && text((await page(fx, `/reports?${Q}`)).html).includes("국민카드 실적 목표 달성"), "목표에 닿으면 배지가 생긴다");
    const cleared = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "" });
    ok(cleared.location.includes("msg=card_target_cleared") && !("asset-1" in JSON.parse(settingValue(fx, key))), "비워서 보내면 목표를 지운다");
    // 조회 전용 참여자
    fx.db.users.push({ id: "user-view", kakao_user_key: "kakao_login:2267", nickname: "뷰어", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: "house-home", user_id: "user-view", role: "viewer", created_at: "2026-07-02T00:00:00.000Z" });
    const viewerCookie = await fx.cookieFor("user-view");
    const viewerPage = await page(fx, `/reports?${Q}`, { cookie: viewerCookie });
    ok(viewerPage.status === 200 && !viewerPage.html.includes('action="/my/card-target/save"') && text(viewerPage.html).includes("국민카드"), "조회 전용 참여자는 카드 사용액은 보되 목표 폼이 없다");
    const viewerSave = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "100000" }, { cookie: viewerCookie });
    ok(viewerSave.location.includes("err=card_target_write_not_allowed"), "조회 전용 참여자의 저장은 거절한다");
    // 읽기 실패는 빈 값으로 보지 않는다
    const existing = fx.db.accountbook_settings.find((row) => row.key === key);
    if (existing) existing.value = JSON.stringify({ "asset-1": { target: 250000 } }); else fx.db.accountbook_settings.push({ id: "ct-v22938", key, value: JSON.stringify({ "asset-1": { target: 250000 } }), created_at: "2026-07-01T00:00:00Z" });
    const restore = intercept(async ({ url }) => (url.pathname.includes("/rest/v1/accountbook_settings") && url.searchParams.get("key") === `eq.${key}` ? new Response("{}", { status: 503 }) : null));
    let failed;
    try { failed = await post(fx, "/my/card-target/save", { household_id: "house-home", month: "2026-07", asset_id: "asset-1", target: "400000" }); } finally { restore(); }
    ok(failed.location.includes("err=card_target_save_failed") && JSON.parse(settingValue(fx, key))["asset-1"].target === 250000, "설정을 읽지 못하면 저장하지 않고 기존 값을 지킨다");
  });

  // ── 6. 설정·기록 조회 장애 ─────────────────────────────────────────────
  await fixture(async (fx) => {
    const restore = intercept(async ({ url }) => (url.pathname.includes("/rest/v1/accountbook_settings") && String(url.searchParams.get("key") || "").startsWith("in.(") ? new Response("{}", { status: 503 }) : null));
    let res;
    try { res = await page(fx, `/reports?${Q}`); } finally { restore(); }
    ok(res.status === 200 && text(res.html).includes("카드·적립 계획 설정을 불러오지 못해"), "설정 조회가 실패해도 리포트는 열리고 그 사실을 알린다");
    ok(text(res.html).includes("지출 248,600원"), "기록 요약은 그대로 보인다");
  });
});

done();
