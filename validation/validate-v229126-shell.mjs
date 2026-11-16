// V22.9.126 결함 수정 판 — 화면 후처리·공개 화면·라우터·가져오기 읽기 묶음(shell) 검사.
//   FC-2  사용자 메모·분류의 ‘프리미엄’ 이 화면에서 ‘스마트 도구’ 로 바뀌던 것(web/html-postprocess.js normalizeUserFacingUi)
//   FC-3  www 주소의 308 이 `//example.org/x` 를 다른 사이트로 보내던 것(public/site-config.js canonicalRedirectResponse)
//   FC-5  예산 읽기가 잠깐 실패하면 홈·소비 분석이 ‘예산 미설정’ 이라고 하던 것(my/mobile-home.js·my/insight-page.js)
//   FC-6  가져오기 금액 칸 ‘12.000원’ 을 12원으로 읽던 것(import/flexible-import-parser.js parseImportAmountCell)
//   FC-7  구성원 빠른 입력의 지출자 고르기(서버는 본인으로 저장)(my/mobile-home.js)
//   FC-14 납부·입금 일정 금액에 상한이 없던 것(settings/reserve-plans.js)
//   FC-17 로그인 없이 보이는 스킬 호출자 확인 건수·시각과 요청 제한 값(worker/router.js)
//   FC-18 옛 내부용 안내 화면의 검색 제외(X-Robots-Tag) — 고칠 것 없이 지금 머리가 있음을 고정한다
//   FC-23 공개 /start-guide 의 공유 이미지(og:image)
// 장면마다 고치기 전 결함이 생기던 조건을 그대로 만들고(사용자 글·예산 GET 500·구성원 세션·큰 금액·거부된 /skill 호출) 고친 동작을 확인한다.
// 네트워크를 쓰지 않는다(메모리 픽스처 + app.fetch). 시계는 장면마다 고정한다.
// 실행: node validation/validate-v229126-shell.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, intercept, failure, withClock, page, post, formFields } from "./lib-audit-v22934.mjs";
import { parseFlexibleImportRecords, addReservePlan, updateReservePlan } from "../src/index.js";

const t = counter("v229126 shell (FC-2·3·5·6·7·14·17·18·23)");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const count = (text, needle) => text.split(needle).length - 1;
const HOME = "house-home";
const Q = `month=2026-07&household_id=${HOME}`;

// ── FC-2 사용자 글은 어떤 낱말이 들어 있어도 그대로 보인다 ─────────────────────────────
// 고치기 전 장면(final-check premium-probe): 메모 ‘유튜브 프리미엄’ 이 ‘유튜브 스마트 도구’ 로, 분류 ‘프리미엄’ 이 ‘스마트 도구’ 로 보였고,
// 그 글이 있는 달에는 /smart-tools·/my/analysis 의 ‘월말 예상 지출’ 이 ‘약 117만’ 처럼 바뀌었다.
const USER_TEXT_ROWS = [
  { id: "v126-ut-1", amount: 14900, category: "구독", memo: "유튜브 프리미엄", date: "2026-07-06" },
  { id: "v126-ut-2", amount: 52000, category: "프리미엄", memo: "프리미엄 아울렛 신발", date: "2026-07-07" },
  { id: "v126-ut-3", amount: 3000, category: "기타", memo: "오늘 쓴 돈 ☀️ 메모", date: "2026-07-10" },
  { id: "v126-ut-4", amount: 4000, category: "기타", memo: "🌱 시작가이드 처음이라면 여기부터", date: "2026-07-11" },
  { id: "v126-ut-5", amount: 5000, category: "기타", memo: "/my/premium 나간 돈 💸 메모", date: "2026-07-12" },
];
// 같은 금액·날짜인데 낱말만 다른 기록(비교용). 분류 ‘프리미엄’ 자리는 같은 성격의 다른 이름이다.
const NEUTRAL_ROWS = USER_TEXT_ROWS.map((row, i) => ({ ...row, category: row.category === "프리미엄" ? "쇼핑" : row.category, memo: `비교 기록 ${i + 1}` }));
function addRows(fx, rows) {
  const stamp = "2026-07-06T03:00:00.000Z";
  for (const row of rows) fx.db.transactions.push({ id: row.id, household_id: HOME, user_id: "user-bin", transaction_date: row.date, type: "expense", amount: row.amount, category: row.category, memo: row.memo, payment_method: "신용카드", source: "web", raw_text: `${row.memo} ${row.amount}`, created_at: stamp, updated_at: stamp });
}
const FC2_PAGES = [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/my/analysis?${Q}`, `/smart-tools?${Q}`, `/budgets?${Q}`];
async function renderSet(rows) {
  return withClock("2026-07-20", () => fixture(async (fx) => {
    addRows(fx, rows);
    const out = {};
    for (const path of FC2_PAGES) out[path] = await page(fx, path);
    out.edit = await page(fx, `/transactions/edit?id=v126-ut-2&return_to=${encodeURIComponent(`/app?${Q}`)}`);
    return out;
  }));
}
{
  const withWords = await renderSet(USER_TEXT_ROWS);
  const neutral = await renderSet(NEUTRAL_ROWS);
  for (const path of FC2_PAGES) {
    const html = withWords[path].html;
    t.eq(withWords[path].status, 200, `FC-2 ${path} 가 열린다`);
    t.ok(!html.includes("유튜브 스마트 도구") && !html.includes("스마트 도구 아울렛 신발") && !html.includes("/smart-tools 나간 돈"), `FC-2 ${path}: 메모의 ‘프리미엄’·주소 글이 바뀌지 않는다(고치기 전 결함 글이 없다)`);
    t.eq(count(html, "스마트 도구"), count(neutral[path].html, "스마트 도구"), `FC-2 ${path}: ‘스마트 도구’ 글자 수가 낱말 없는 같은 화면과 같다(사용자 글에서 늘지 않는다)`);
  }
  for (const path of [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/my/analysis?${Q}`]) {
    const html = withWords[path].html;
    t.ok(html.includes("유튜브 프리미엄") && html.includes("프리미엄 아울렛 신발"), `FC-2 ${path}: 메모 ‘유튜브 프리미엄’·‘프리미엄 아울렛 신발’ 이 그대로 보인다`);
  }
  // /smart-tools 는 큰 지출만 보이므로 52,000원 기록(메모·분류)이 나온다.
  t.ok(withWords[`/smart-tools?${Q}`].html.includes("<b>프리미엄 아울렛 신발</b><span>2026-07-07 · 프리미엄 · "), "FC-2 /smart-tools: 큰 지출의 메모·분류 ‘프리미엄’ 이 그대로 보인다");
  const tx = withWords[`/app?tab=transactions&${Q}`].html;
  t.ok(tx.includes('<option value="프리미엄">프리미엄</option>') && tx.includes('<option value="프리미엄">'), "FC-2 거래내역의 분류 고르기·목록 값도 ‘프리미엄’ 그대로다");
  t.ok(withWords.edit.status === 200 && withWords.edit.html.includes('value="프리미엄 아울렛 신발"') && withWords.edit.html.includes('value="프리미엄"') && !withWords.edit.html.includes('value="스마트 도구'), "FC-2 기록 수정 화면의 폼 값(메모·분류)도 원문 그대로다");
  const home = withWords[`/app?${Q}`].html;
  for (const memo of ["오늘 쓴 돈 ☀️ 메모", "🌱 시작가이드 처음이라면 여기부터", "/my/premium 나간 돈 💸 메모"]) t.ok(home.includes(memo), `FC-2 홈: 메모 ‘${memo}’ 가 그대로 보인다(그림 글자·주소를 빼지 않는다)`);
  t.ok(home.includes("<span>들어온 돈</span>") && home.includes("<span>나간 돈</span>") && !home.includes("<span>들어온 돈 💰</span>") && !home.includes("<span>나간 돈 💸</span>"), "FC-2 홈 카드 이름의 그림 글자는 예전처럼 뺀다(템플릿 마크업만)");
  t.ok(withWords[`/my/analysis?${Q}`].html.includes('"프리미엄","신용카드","프리미엄 아울렛 신발"'), "FC-2 소비 분석 자료(window.__INSIGHT__)의 분류·메모도 원문이다");
  // 그런 기록이 있을 때와 없을 때 ‘월말 예상 지출’ 표기가 같다(고치기 전에는 있는 달만 ‘약 117만’).
  const outlookCell = (html) => (html.match(/<span>월말 예상 지출<\/span><b>[^<]*<\/b>/) || [""])[0];
  const cockpitCell = (html) => (html.match(/<span>월말 예상 지출[^<]*<\/span><b>[^<]*<\/b>/) || [""])[0];
  const smartWith = outlookCell(withWords[`/smart-tools?${Q}`].html);
  t.ok(/<b>[\d,]+원<\/b>$/.test(smartWith), `FC-2 /smart-tools 의 월말 예상 지출은 원 단위 숫자다(${smartWith})`);
  t.eq(smartWith, outlookCell(neutral[`/smart-tools?${Q}`].html), "FC-2 /smart-tools 월말 예상 지출 표기가 낱말 있는 달·없는 달 같다");
  const cockpitWith = cockpitCell(withWords[`/my/analysis?${Q}`].html);
  t.ok(!!cockpitWith && !cockpitWith.includes("약 "), `FC-2 /my/analysis 한눈에 보기의 월말 예상 지출에 ‘약’ 이 붙지 않는다(${cockpitWith})`);
  t.eq(cockpitWith, cockpitCell(neutral[`/my/analysis?${Q}`].html), "FC-2 /my/analysis 월말 예상 지출 표기가 낱말 있는 달·없는 달 같다");
  const smartNeutral = neutral[`/smart-tools?${Q}`].html;
  t.ok(!smartNeutral.includes('class="metricBasis"') && !withWords[`/smart-tools?${Q}`].html.includes('class="metricBasis"'), "FC-2 /smart-tools 에 사용자 글로만 들어가던 기준 줄이 어느 쪽에도 없다");
}
// 남겨 둔 치환은 템플릿 마크업에만 걸린다: 가져오기 안내는 예전처럼 JSON 을 적고, 같은 글을 담은 사용자 메모는 바뀌지 않는다.
await withClock("2026-07-20", () => fixture(async (fx) => {
  addRows(fx, [{ id: "v126-ut-csv", amount: 1000, category: "기타", memo: "CSV·TSV·TXT·엑셀의 여러 시트 정리", date: "2026-07-13" }]);
  const backup = (await page(fx, `/my/backup?${Q}`)).html;
  t.ok(backup.includes("<p>CSV·TSV·TXT·JSON·엑셀의 여러 시트") && backup.includes('class="fileStatus">CSV·TSV·TXT·JSON은 서버에서 바로 읽습니다.'), "FC-2 /my/backup 가져오기 안내 두 줄은 예전과 같다(JSON 포함)");
  const home = (await page(fx, `/app?${Q}`)).html;
  t.ok(home.includes("CSV·TSV·TXT·엑셀의 여러 시트 정리"), "FC-2 같은 글을 담은 사용자 메모는 바뀌지 않는다");
  const guide = await page(fx, "/subscription-cleanup", { cookie: "" });
  t.ok(guide.status === 200 && guide.html.includes("유료 전환되도록"), "FC-2 ‘유료 전환’ 이 든 공개 안내 글은 그대로다");
}));
{
  const source = read("src/modules/web/html-postprocess.js");
  const body = source.slice(source.indexOf("function normalizeUserFacingUi("), source.indexOf("function normalizeUserFacingUi(") + 20000);
  t.ok(!/\/[^/\n]*프리미엄[^/\n]*\/g?/.test(body) && !body.includes("유료 전환") && !body.includes('replace("🌱 시작가이드"') && !body.includes('replaceAll("오늘 쓴 돈 ☀️"') && !body.includes("/\\/my\\/premium/g"), "FC-2 문서 전체에 걸던 ‘프리미엄’·‘유료 전환’·그림 글자·주소 치환이 남아 있지 않다");
}

// ── FC-3 www 정본 308 은 정본 호스트 안에 머문다 ───────────────────────────────────
await fixture(async (fx) => {
  const call = async (raw, env = fx.env) => {
    const response = await app.fetch(new Request(raw, { redirect: "manual" }), env, ctx);
    return { status: response.status, location: response.headers.get("location") || "" };
  };
  // 고치기 전 만들던 방식: 경로 글을 정본 주소에 이어 붙여 다시 읽으면 `//example.org/x` 는 다른 호스트다.
  t.eq(new URL("//example.org/x", BASE).host, "example.org", "FC-3 결함 원리: 경로 `//example.org/x` 를 주소로 다시 읽으면 다른 사이트가 된다");
  const shapes = [
    ["https://www.malhaebook.com//example.org/x", "https://malhaebook.com//example.org/x"],
    [String.raw`https://www.malhaebook.com/\example.org/x`, "https://malhaebook.com//example.org/x"],
    ["https://www.malhaebook.com/%5Cexample.org/x", "https://malhaebook.com/%5Cexample.org/x"],
    ["https://www.malhaebook.com/..//example.org/x?a=1", "https://malhaebook.com//example.org/x?a=1"],
    ["http://www.malhaebook.com//example.org/x", "https://malhaebook.com//example.org/x"],
    ["https://www.malhaebook.com///example.org", "https://malhaebook.com///example.org"],
    ["http://malhaebook.com//example.org/x?b=2", "https://malhaebook.com//example.org/x?b=2"],
  ];
  for (const [raw, expected] of shapes) {
    const r = await call(raw);
    t.eq(r.status, 308, `FC-3 ${raw} 는 308 이다`);
    t.eq(r.location, expected, `FC-3 ${raw} → 정본 호스트 안의 같은 경로(${r.location})`);
    t.eq(new URL(r.location).host, "malhaebook.com", `FC-3 ${raw} 의 목적지 호스트는 정본이다`);
  }
  // CANONICAL_REDIRECT=1 로 옮기는 다른 호스트도 같은 규칙이다.
  const other = await call("https://legacy.example.net//example.org/x", { ...fx.env, CANONICAL_REDIRECT: "1" });
  t.ok(other.status === 308 && new URL(other.location).host === "malhaebook.com" && other.location === "https://malhaebook.com//example.org/x", `FC-3 다른 호스트를 옮길 때도 정본 안에 머문다(${other.location})`);
  // 정상 경로·쿼리·http→https 는 예전과 같다.
  for (const [raw, expected] of [
    ["https://www.malhaebook.com/budget-guide?x=1", "https://malhaebook.com/budget-guide?x=1"],
    ["https://www.malhaebook.com/guides?q=%EA%B0%80%EA%B3%84%EB%B6%80&a=1&a=2", "https://malhaebook.com/guides?q=%EA%B0%80%EA%B3%84%EB%B6%80&a=1&a=2"],
    ["http://www.malhaebook.com/guides?a=1", "https://malhaebook.com/guides?a=1"],
    ["http://malhaebook.com/faq?Q=A", "https://malhaebook.com/faq?Q=A"],
    ["https://www.malhaebook.com/", "https://malhaebook.com/"],
    ["https://www.malhaebook.com/my?month=2026-10&return_to=%2Fapp%3Fview%3Dcalendar", "https://malhaebook.com/my?month=2026-10&return_to=%2Fapp%3Fview%3Dcalendar"],
  ]) t.eq((await call(raw)).location, expected, `FC-3 정상 주소 ${raw} 는 예전과 같은 곳으로 간다`);
  const apex = await call("https://malhaebook.com//example.org/x");
  t.ok(apex.status !== 308 && !apex.location.startsWith("https://example.org"), `FC-3 정본(https) 자체는 옮기지 않는다(${apex.status})`);
});

// ── FC-5 예산 읽기 실패: 그 칸만 ‘불러오지 못했어요’ ─────────────────────────────────
// 고치기 전(verify D p3): 예산 GET 500 이면 소비 분석은 ‘월 예산 미설정 … 남은 예산 설정 전 … 예산을 설정하면 …’,
// 홈은 ‘예산 미설정 · 예산 없음 · 예산 안 정한 지출 100,000원 … 예산을 설정하면 하루 기준이 생겨요’ 라고 했다.
{
  const NOV = "household_id=house-home&month=2026-11";
  const prepare = (fx, { budgets = true } = {}) => {
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HOME);
    fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HOME);
    if (budgets) {
      fx.db.accountbook_budgets.push({ id: "v126-b-total", household_id: HOME, month: "2026-11", category: "__total", amount: 600000, created_at: "2026-11-01T00:00:00.000Z" });
      fx.db.accountbook_budgets.push({ id: "v126-b-food", household_id: HOME, month: "2026-11", category: "식비", amount: 400000, created_at: "2026-11-01T00:00:00.000Z" });
    }
    for (const day of ["02", "06", "09", "13"]) fx.db.transactions.push({ id: `v126-nov-${day}`, household_id: HOME, user_id: "user-bin", transaction_date: `2026-11-${day}`, type: "expense", amount: 25000, category: "식비", memo: `장보기 ${day}`, payment_method: "신용카드", source: "web", raw_text: `장보기 25000`, created_at: `2026-11-${day}T03:00:00.000Z`, updated_at: `2026-11-${day}T03:00:00.000Z` });
  };
  const render = (mode) => withClock("2026-11-17", () => fixture(async (fx) => {
    prepare(fx, { budgets: mode !== "none" });
    let budgetGets = 0;
    const restore = mode === "fail" ? intercept(({ url, method }) => {
      if (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname === "/rest/v1/accountbook_budgets") { budgetGets += 1; return failure(500, "simulated budgets outage"); }
      return undefined;
    }) : () => {};
    try {
      const analysis = await page(fx, `/my/analysis?${NOV}`);
      const home = await page(fx, `/app?${NOV}`);
      return { analysis, home, budgetGets };
    } finally { restore(); }
  }));
  const normal = await render("ok"), failed = await render("fail"), none = await render("none");
  t.ok(failed.budgetGets >= 2, `FC-5 장면: 예산 GET 만 500 으로 실패시켰다(${failed.budgetGets}회)`);
  t.ok(normal.analysis.html.includes("월 400,000원 기준") && normal.analysis.html.includes("<span>남은 예산</span><b>300,000원</b>"), "FC-5 정상일 때 소비 분석은 예산 400,000원·남은 예산 300,000원");
  t.ok(normal.home.html.includes('data-ab-num="300000" data-ab-num-unit="원">300,000</b>'), "FC-5 정상일 때 홈 카드는 남은 300,000원");
  // 소비 분석: 같은 구성, 예산 세 칸의 글만 다르다.
  const fa = failed.analysis;
  t.eq(fa.status, 200, "FC-5 예산을 못 읽어도 소비 분석은 오류 화면이 아니다(200)");
  t.ok(fa.html.includes("<p>예산을 불러오지 못했어요</p>") && fa.html.includes("<span>남은 예산</span><b>확인 불가</b>") && fa.html.includes("<p>예산을 불러오지 못해 소비 속도는 안내하지 않았어요. 잠시 뒤 새로고침해 주세요.</p>"), "FC-5 소비 분석의 예산 칸은 ‘예산을 불러오지 못했어요’·‘확인 불가’·안내 문장");
  t.ok(!fa.html.includes("월 예산 미설정") && !fa.html.includes("<b>설정 전</b>") && !fa.html.includes("예산을 설정하면 현재 소비 속도"), "FC-5 소비 분석에 ‘미설정·설정 전·예산을 설정하면’ 이 없다(고치기 전 결함 글)");
  const backAnalysis = fa.html
    .replace("<p>예산을 불러오지 못했어요</p>", "<p>월 예산 미설정</p>")
    .replace("<span>남은 예산</span><b>확인 불가</b>", "<span>남은 예산</span><b>설정 전</b>")
    .replace("<p>예산을 불러오지 못해 소비 속도는 안내하지 않았어요. 잠시 뒤 새로고침해 주세요.</p>", "<p>예산을 설정하면 현재 소비 속도와 남은 하루 한도를 함께 안내합니다.</p>");
  t.eq(backAnalysis, none.analysis.html, "FC-5 소비 분석: 세 칸의 글을 되돌리면 예산이 정말 없는 달의 화면과 바이트가 같다(구성 그대로, R3)");
  t.ok(none.analysis.html.includes("<p>월 예산 미설정</p>") && none.analysis.html.includes("<span>남은 예산</span><b>설정 전</b>"), "FC-5 예산이 정말 없는 달은 예전처럼 ‘월 예산 미설정·설정 전’");
  // 홈: 예산 카드 칸만 다르다.
  const fh = failed.home;
  t.eq(fh.status, 200, "FC-5 예산을 못 읽어도 홈은 오류 화면이 아니다(200)");
  t.ok(fh.html.includes('<div class="homeBudgetAmount"><b>확인 불가</b></div>') && fh.html.includes('<div class="homeBudgetFoot"><span>예산을 불러오지 못했어요</span><span></span></div>'), "FC-5 홈 예산 카드는 ‘확인 불가’·‘예산을 불러오지 못했어요’");
  t.ok(!fh.html.includes("<b>예산 미설정</b>") && !fh.html.includes(">예산 없음<") && !fh.html.includes("예산 안 정한 지출 100,000원") && !fh.html.includes("예산을 설정하면 하루 기준이 생겨요"), "FC-5 홈에 ‘예산 미설정·예산 없음·예산 안 정한 지출·설정 안내’ 가 없다(고치기 전 결함 글)");
  const noneHome = none.home.html;
  const backHome = fh.html
    .replace('<div class="homeBudgetAmount"><b>확인 불가</b></div>', '<div class="homeBudgetAmount"><b>예산 미설정</b></div>')
    .replace('<div class="homeBudgetFoot"><span>예산을 불러오지 못했어요</span><span></span></div>', '<div class="homeBudgetFoot"><span>예산 없음</span><span>예산 안 정한 지출 100,000원</span></div>');
  const planStart = noneHome.indexOf('<div class="homeDailyPlan homeDailyPlanEmpty">');
  const planEnd = planStart < 0 ? -1 : noneHome.indexOf("</div>", planStart) + 6;
  t.ok(planStart > 0 && noneHome.includes("예산을 설정하면 하루 기준이 생겨요"), "FC-5 예산이 정말 없는 달의 홈은 예전처럼 설정 안내 링크가 있다");
  t.eq(backHome, noneHome.slice(0, planStart) + noneHome.slice(planEnd), "FC-5 홈: 카드 칸을 되돌리고 설정 안내 한 줄만 빼면 예산이 없는 달의 홈과 바이트가 같다");
}

// ── FC-6 가져오기 금액 ‘12.000원’ 은 12원이 아니다 ─────────────────────────────────
{
  // 고치기 전 식: 소수점 뒤 0 의 개수를 보지 않아 ‘12.000’ 이 12 였다.
  t.ok(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test("12.000") && Number("12.000") === 12, "FC-6 결함 원리: 옛 식은 ‘12.000’ 을 받아 12 로 읽었다");
  const parse = (amount) => parseFlexibleImportRecords(`날짜,금액,내용\n2026-07-01,"${amount}",커피`, HOME, "user-bin", {});
  for (const amount of ["12.000원", "12.000", "5.000", "₩12.000", "1,000.000", "12.0000"]) {
    const r = parse(amount);
    t.ok(r.rows.length === 0 && r.rejected.length === 1 && r.rejected[0].reason_code === "invalid_amount", `FC-6 ‘${amount}’ 은 금액으로 확정하지 않고 ‘금액 형식을 해석하지 못함’ 으로 둔다(${r.rows.map((x) => x.amount).join(",") || r.rejected[0]?.reason_code})`);
  }
  for (const [amount, expected] of [["12000.00", 12000], ["12,000.00", 12000], ["12000.0", 12000], ["12,000원", 12000], ["12000", 12000], ["₩12,000", 12000]]) {
    const r = parse(amount);
    t.ok(r.rows.length === 1 && r.rows[0].amount === expected && r.rejected.length === 0, `FC-6 ‘${amount}’ 은 예전처럼 ${expected}원(${r.rows[0]?.amount})`);
  }
  const tsv = parseFlexibleImportRecords("날짜\t금액\t내용\n2026-07-01\t12.000원\t점심\n2026-07-02\t8000.00\t커피", HOME, "user-bin", {});
  t.ok(tsv.rows.length === 1 && tsv.rows[0].amount === 8000 && tsv.rejected.length === 1 && tsv.rejected[0].row_number === 2, "FC-6 TSV 도 같다(‘12.000원’ 줄만 되묻고 ‘8000.00’ 은 8000원)");
}

// ── FC-7 구성원에게는 빠른 입력의 지출자 고르기를 그리지 않는다 ──────────────────────────
await withClock("2026-07-20", () => fixture(async (fx) => {
  const member = await fx.cookieFor("user-wifi");
  const memberHome = await page(fx, `/app?${Q}`, { cookie: member });
  const ownerHome = await page(fx, `/app?${Q}`);
  const memberForm = formFields(memberHome.html, "/admin/transactions");
  const ownerForm = formFields(ownerHome.html, "/admin/transactions");
  t.ok(memberForm.found && !/<select name="user_id"/.test(memberForm.form) && !memberForm.fields.has("user_id"), "FC-7 구성원 홈의 빠른 입력에 지출자 고르기가 없다");
  t.ok(memberForm.form.includes('<div><input name="payment_method" list="paymentList" id="payInput"'), "FC-7 구성원 폼의 결제수단 칸은 한 줄로 남는다");
  t.ok(ownerForm.found && /<select name="user_id"[^>]*>/.test(ownerForm.form) && ownerForm.form.includes("WIFI♥ (구성원)") && ownerForm.fields.has("user_id"), "FC-7 소유자 홈은 예전처럼 지출자를 고른다");
  t.ok(ownerForm.form.includes('<div class="grid2"><select name="user_id"'), "FC-7 소유자 폼 모양은 예전 그대로(grid2)");
  // 서버는 그대로다: 구성원이 다른 지출자를 보내도 본인으로 저장한다(고치기 전에는 화면이 그 선택을 받는 것처럼 보였다).
  const fields = memberForm.fields;
  fields.set("amount", "7700"); fields.set("memo", "구성원 기록 v126"); fields.set("user_id", "user-bin"); fields.set("type", "expense");
  const saved = await post(fx, "/admin/transactions", fields, { cookie: member });
  const row = fx.db.transactions.find((item) => item.memo === "구성원 기록 v126");
  t.ok(saved.status === 303 && row && row.user_id === "user-wifi", `FC-7 서버는 구성원 기록을 본인으로 저장한다(바뀌지 않음, ${saved.status} ${row?.user_id})`);
}));

// ── FC-14 납부·입금 일정 금액 상한 ───────────────────────────────────────────────
await withClock("2026-07-20", () => fixture(async (fx) => {
  const plans = () => JSON.parse(fx.db.accountbook_settings.find((row) => row.key === `reserve_plans:${HOME}`)?.value || "[]");
  const before = JSON.stringify(plans());
  const view = await page(fx, `/reserve-plans?${Q}`);
  const create = formFields(view.html, "/admin/reserve-plan/create");
  const update = formFields(view.html, "/admin/reserve-plan/update");
  t.ok(create.found && update.found && update.fields.get("id") === "reserve-1", "FC-14 납부·입금 일정 화면의 추가·수정 폼을 그대로 쓴다");
  for (const amount of ["999,999,999,999,999", "3000000000", "2000000001"]) {
    const fields = new URLSearchParams(create.fields); fields.set("name", `큰 금액 ${amount}`); fields.set("amount", amount);
    const r = await post(fx, "/admin/reserve-plan/create", fields);
    t.ok(r.status === 303 && r.decoded.includes("err=") && !r.decoded.includes("msg=reserve_saved"), `FC-14 추가 ${amount}원은 저장하지 않는다(${r.decoded.slice(0, 90)})`);
  }
  t.eq(JSON.stringify(plans()), before, "FC-14 상한을 넘는 추가 뒤에도 일정 목록이 그대로다");
  {
    const fields = new URLSearchParams(update.fields); fields.set("amount", "999999999999999");
    const r = await post(fx, "/admin/reserve-plan/update", fields);
    t.ok(r.status === 303 && r.decoded.includes("err=이름과 금액을 입력해주세요."), `FC-14 수정도 상한을 넘으면 같은 금액 오류다(${r.decoded.slice(0, 90)})`);
    t.eq(plans().find((p) => p.id === "reserve-1")?.amount, 1200000, "FC-14 거절된 수정은 기존 금액(1,200,000원)을 바꾸지 않는다");
  }
  {
    const fields = new URLSearchParams(create.fields); fields.set("name", "상한 금액"); fields.set("amount", "2000000000");
    const r = await post(fx, "/admin/reserve-plan/create", fields);
    t.ok(r.decoded.includes("msg=reserve_saved") && plans().some((p) => p.name === "상한 금액" && p.amount === 2000000000), "FC-14 상한과 같은 2,000,000,000원은 예전처럼 저장한다");
  }
  let message = "";
  try { await addReservePlan(fx.env, HOME, { name: "직접 호출", amount: 2000000001 }); } catch (err) { message = String(err?.message || err); }
  t.eq(message, "이름과 금액을 입력해주세요.", "FC-14 addReservePlan 은 상한을 넘는 금액을 같은 파일의 기존 금액 오류로 거절한다");
  message = "";
  try { await updateReservePlan(fx.env, HOME, "reserve-1", { name: "자동차보험", amount: 2000000001 }); } catch (err) { message = String(err?.message || err); }
  t.eq(message, "이름과 금액을 입력해주세요.", "FC-14 updateReservePlan 도 같다");
}));

// ── FC-17 공개 응답의 스킬 호출자 확인은 모드·설정 여부만 ─────────────────────────────
await fixture(async (fx) => {
  const secretEnv = { ...fx.env, KAKAO_SKILL_SECRET: "v126-skill-secret", ADMIN_SESSION_SECRET: "qa-v126-admin-session", ADMIN_API_TOKEN: "qa-v126-admin-token" };
  const json = async (path, env) => (await (await app.fetch(new Request(`${BASE}${path}`), env, ctx)).json());
  // 고치기 전 장면: 거부된 /skill 호출이 쌓인 뒤 공개 /health 가 건수·시각·헤더 누락 추정을 냈다.
  for (let i = 0; i < 2; i += 1) {
    const denied = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userRequest: { utterance: "안녕", user: { id: "kakao_login:2265", properties: {} } }, action: { params: {} }, bot: { id: "bot" }, intent: { id: "i", name: "블록" } }) }), secretEnv, ctx);
    t.eq(denied.status, 403, "FC-17 장면: 비밀값 없는 /skill 호출은 예전처럼 막힌다");
  }
  for (const path of ["/health", "/ready", "/kakao-new-bot-config.json"]) {
    const body = await json(path, secretEnv);
    t.deepEq(body.skill_caller_auth, { mode: "enforce", configured: true }, `FC-17 ${path} 의 skill_caller_auth 는 mode·configured 둘뿐이다`);
    t.eq(body.skill_caller_auth_configured, true, `FC-17 ${path} 의 설정 여부 칸은 그대로다`);
  }
  t.deepEq((await json("/health", { ...secretEnv, KAKAO_SKILL_AUTH_MODE: "observe" })).skill_caller_auth, { mode: "observe", configured: true }, "FC-17 observe 모드가 그대로 드러난다(배포 점검이 읽는 칸)");
  t.deepEq((await json("/health", fx.env)).skill_caller_auth, { mode: "off", configured: false }, "FC-17 비밀값이 없으면 off");
  const config = await json("/kakao-new-bot-config.json", { ...secretEnv, SKILL_RATE_LIMIT: "77", TRAFFIC_GUARD_LIMIT: "333" });
  t.ok(!("skill_rate_limit_per_user_per_minute" in config) && !("traffic_guard_limit_per_ip_per_minute" in config) && !JSON.stringify(config).includes("333") && !/"(?:accepted|denied|last_accepted_at|last_denied_at|header_missing_suspected)"/.test(JSON.stringify(config)), "FC-17 /kakao-new-bot-config.json 에 요청 제한 값과 호출 건수·시각이 없다");
  t.eq(Object.keys(config).join(","), "ok,version,mode,service,public_base_url,skill_url,skill_caller_auth_configured,skill_caller_auth,user_home,kakao_redirect_uri,privacy_url,terms_url,group_chatbot_routes,forbidden_public_patterns,skill_ip_guard,chat_first,quick_replies", "FC-17 나머지 설정 안내 칸은 순서까지 그대로다");
  const health = await json("/health", secretEnv);
  t.eq(Object.keys(health).join(","), "ok,alive,status,configured,app,version,mode,integrity,missing_count,skill_caller_auth_configured,skill_caller_auth,skill_latency,ready_endpoint,time", "FC-17 /health 의 칸 목록·순서는 그대로다");
});

// ── FC-18 옛 내부용 안내 화면: 접근은 그대로, 검색 제외 머리(X-Robots-Tag) ───────────────────
// final-check 의 주소 훑기는 본문만 봐서 ‘noindex 없음’ 으로 적었다. 이 화면들은 공용 HTML 머리로 이미 noindex 를 보낸다 — 이 검사가 그 머리를 고정한다.
const LEGACY_INTERNAL_PAGES = [
  "/beta-checklist", "/beta-final-check", "/beta-ready", "/review-ready", "/user-beta-check", "/beta-start", "/onboarding", "/user-onboarding",
  "/kakao-review", "/review-check", "/openbuilder-report", "/kakao-openbuilder", "/openbuilder-check", "/openbuilder-guide", "/kakao-openbuilder-final",
  "/openbuilder-final", "/openbuilder-utterances", "/kakao-stability", "/qa-stability", "/real-user-qa", "/user-qa", "/classification-samples",
  "/input-sample-check", "/quick-input-qa", "/menu-polish", "/navigation-polish", "/simple-menu-guide", "/user-polish", "/user-polish-final", "/ux-final",
  "/brand-guide", "/brand-kit", "/review-copy",
];
await fixture(async (fx) => {
  const sitemap = await (await app.fetch(new Request(`${BASE}/sitemap.xml`), fx.env, ctx)).text();
  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
  const robotsTxt = await (await app.fetch(new Request(`${BASE}/robots.txt`), fx.env, ctx)).text();
  const missing = [];
  for (const path of LEGACY_INTERNAL_PAGES) {
    const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { accept: "text/html" } }), fx.env, ctx);
    const robots = String(response.headers.get("x-robots-tag") || "").replace(/\s+/g, "");
    await response.text();
    if (response.status !== 200 || robots !== "noindex,nofollow" || listed.has(path)) missing.push(`${path}:${response.status}:${robots}`);
  }
  t.eq(missing.join(" "), "", `FC-18 옛 내부용 화면 ${LEGACY_INTERNAL_PAGES.length}곳은 로그인 없이 그대로 열리고(200) X-Robots-Tag noindex,nofollow 이며 사이트맵에 없다`);
  t.ok(!LEGACY_INTERNAL_PAGES.some((path) => robotsTxt.includes(path)), "FC-18 robots.txt 는 이 화면들을 따로 적지 않는다(바꾸지 않음)");
  const guide = await app.fetch(new Request(`${BASE}/budget-guide`, { headers: { accept: "text/html" } }), fx.env, ctx);
  await guide.text();
  t.ok(listed.has("/budget-guide") && /^index/.test(String(guide.headers.get("x-robots-tag") || "")), "FC-18 사이트맵의 공개 글은 예전처럼 색인된다(머리가 모든 화면에 걸린 것이 아니다)");
});

// ── FC-23 공개 /start-guide 의 공유 이미지 ─────────────────────────────────────────
await fixture(async (fx) => {
  const publicGuide = await page(fx, "/start-guide", { cookie: "" });
  const head = publicGuide.html.slice(0, publicGuide.html.indexOf("</head>"));
  t.eq(publicGuide.status, 200, "FC-23 로그인 없는 /start-guide 가 열린다");
  t.eq(count(head, '<meta property="og:image" content="https://malhaebook.com/assets/og-malhaebook-'), 1, "FC-23 /start-guide 머리에 정본 주소의 og:image 가 한 번 있다");
  t.ok(head.includes('<meta property="og:image:width" content="1200"/>') && head.includes('<meta name="twitter:card" content="summary_large_image"/>'), "FC-23 다른 공개 화면과 같은 크기·카드 태그다");
  const home = await page(fx, "/", { cookie: "" });
  const tagOf = (html) => (html.match(/<meta property="og:image" content="[^"]+"\/>/) || [""])[0];
  t.ok(!!tagOf(head) && tagOf(head) === tagOf(home.html), "FC-23 /start-guide 의 이미지 주소가 공개 첫 화면과 같다");
});

t.done();
