// 홈 단순화(작업 지시서 7단계 — 사용자 2026-11-21 "모두 이번주 부터" 의 둘째 판, 운영자 결정 D-7 = 예(2026-10-29: 저장한 홈 구성은 그대로, 새 기본값만)).
//  U-13 ‘이번 달 요약’ 카드: 지출·수입·앞으로 나갈 돈(이번 달이고 정기 지출 항목이 있을 때) + 지난달 비교 한 줄 + ‘리포트 보기’ 가 리포트 카드 넷과
//       옛 homeMetrics(수입 대비 사용·들어온 돈·나간 돈)를 대신한다. 홈 구성을 저장하지 않은 사람(깨진 값 포함)의 새 기본값은 리포트 카드 넷 꺼짐,
//       저장한 사람은 저장한 값 그대로(켠 카드는 요약 카드 아래). ‘홈 구성’ 링크는 한 화면에 하나. 캘린더 큰 단추 → 최근 내역 머리의 링크.
//  U-12 거래 행: 아이콘 | 제목 / ‘분류 · 결제수단 · 지출자’ 한 줄 | 금액. 날짜는 머리(‘오늘’·‘어제’·‘7월 9일 목요일’ + 그날 합계)가 말하고 행 안에서는
//       읽기 프로그램에만 ‘7월 9일 · ’ 로 읽힌다(1년 캐시 V5 묶음이 줄 글자의 둘째 조각을 분류로 읽는 자리를 지킨다). 지출자는 구성원이 둘 이상이거나
//       그 행의 지출자가 지금 구성원이 아닐 때만. 홈 최근 내역도 날짜 머리 묶음이다(10줄 그대로).
//  U-14 홈의 챌린지: 진행 중·시작 전은 밝은 면 카드(homeChallenge — 셸의 검은 카드 규칙보다 센 홈 규칙), 끝난 뒤 사흘은 한 줄(성공·끝·끝났어요),
//       그 뒤에는 홈에 없다. 분석·리포트 화면의 챌린지는 그대로다(D-5 전).
//  자산: 홈 스타일시트(mobile-home) 한 장만 주소를 v229137 로 올렸다. 옛 주소 v229136 은 옛 바이트 그대로 내려간다(V22.9.136 화면이 쓴다).
// 브라우저로만 잴 수 있는 것(행 56px·홈 길이·카드 높이·대비·어두운 테마)은 증거 폴더의 측정 도구가 본다. 방 전용 보기에서 새 링크(요약 카드의 ‘홈 구성’·
// ‘리포트 보기’, 최근 내역의 ‘캘린더’)의 표시는 validate-v229136-spacing-color B-1 이 홈의 모든 링크를 갈라 본다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음). 판 이름 글자는 적지 않는다. 바탕 코드(이 판 앞)에서는 대부분이 실패한다.
import { createHash } from "node:crypto";
import { app, BASE, counter, failure, fixture, intercept, page, post, withClock } from "./lib-audit-v22934.mjs";

// 바탕 코드에서도 검사마다 따로 실패하도록 이름으로 가져오지 않는다(없는 이름을 가져오면 파일 전체가 한 번에 멈춘다).
const sections = await import("../src/modules/my/home-sections.js");
const challengeModule = await import("../src/modules/my/report-challenge.js");

const { ok, eq, done } = counter("홈 단순화(이번 달 요약 카드·한 줄 거래 행과 날짜 머리·홈의 챌린지·홈 스타일시트 주소) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const checkAsync = async (fn, label) => { try { await fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const sha = (text) => createHash("sha256").update(text).digest("hex");

const H = "household_id=house-home";
const HOME = `/app?month=2026-07&${H}`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const count = (text, needle) => String(text).split(needle).length - 1;
const summaryOf = (html) => (String(html).match(/<section class="homeSummary"[\s\S]*?<\/section>/) || [""])[0];
const cell = (label, value) => `<div><dt>${label}</dt><dd><b data-ab-num-unit="원">${value}</b><small>원</small></dd></div>`;
const heads = (html) => [...String(html).matchAll(/<h3 class="txDayHead"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/h3>/g)].map((m) => `${m[1]}|${m[2]}`);
const groupsOf = (html) => [...String(html).matchAll(/<section class="txDayGroup">[\s\S]*?<\/section>/g)].map((m) => m[0]);
const rowsOf = (html) => [...String(html).matchAll(/<article class="v8-tx" id="tx-([^"]+)"[\s\S]*?<span class="v8-tx-meta">([\s\S]*?)<\/span>/g)]
  .map((m) => ({ id: m[1], html: m[2], text: m[2].replace(/<[^>]+>/g, "") }));
// 화면에 보이는 글: 읽기 프로그램 전용 글(srOnly)과 태그·속성을 뺀다.
const visibleText = (html) => String(html).replace(/<i class="srOnly">[\s\S]*?<\/i>/g, "").replace(/<[^>]+>/g, " ");
const ISO = /\d{4}-\d{2}-\d{2}/;
const dateLabel = (ymd) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const reportsOf = (html) => [...String(html).matchAll(/<article class="homeReport"><div class="homeReportTop"><span>([^<]*)<\/span>/g)].map((m) => (/^(?:최근 7일|마지막 7일|이번 달)$/.test(m[1]) ? "최근 7일" : m[1]));
const FOUR = "어디에 썼나,최근 7일,예산 항목,앞으로 나갈 돈";
const tx = (id, date, type, amount, category, memo, payment, user = "user-bin") => ({ id, household_id: "house-home", user_id: user, transaction_date: date, type, amount, category, memo, payment_method: payment, source: "web", created_at: `${date}T03:00:00.000Z` });
const putSetting = (fx, key, value) => {
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== key);
  fx.db.accountbook_settings.push({ id: `setting-${key}`, key, value: typeof value === "string" ? value : JSON.stringify(value), created_at: "2026-07-01T00:00:00.000Z" });
};
const LAYOUT_KEY = "home-layout:v1:house-home:user-bin";
const CHALLENGE_KEY = "report_challenge:house-home";
async function asset(fx, path) {
  const response = await app.fetch(new Request(`${BASE}${path}`), fx.env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, etag: response.headers.get("etag") || "", cache: response.headers.get("cache-control") || "", text: await response.text() };
}

// ── A. U-13 이번 달 요약 카드 ─────────────────────────────────────────────────
const DEFAULT_SUMMARY = '<section class="homeSummary" aria-labelledby="homeSummaryTitle"><div class="homeSummaryHead"><h2 id="homeSummaryTitle">이번 달 요약</h2>'
  + '<a class="homeSummaryEdit" href="/home-layout?month=2026-07&amp;household_id=house-home">홈 구성</a></div><dl>'
  + cell("지출", "248,600") + cell("수입", "3,380,000") + cell("앞으로 나갈 돈", "650,000")
  + '</dl><p class="homeMomLine spendFlat">지난달 1~15일 기록이 없어 비교하지 않아요.</p>'
  + '<a class="homeSummaryGo" href="/reports?month=2026-07&amp;household_id=house-home">리포트 보기</a></section>';

await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  let calls = 0;
  const stop = intercept(({ url }) => { if (url.pathname.includes("/rest/v1/")) calls += 1; return null; });
  let home;
  try { home = (await page(fx, HOME)).html; } finally { stop(); }
  const summary = summaryOf(home);
  check(() => eq(count(home, '<section class="homeSummary" aria-labelledby="homeSummaryTitle">'), 1, "A-1 홈 구성을 저장하지 않은 사람의 홈에 ‘이번 달 요약’ 카드가 한 장 있다"), "summary once");
  check(() => eq(summary, DEFAULT_SUMMARY, "A-1 요약 카드: 머리(이번 달 요약 · 홈 구성) · 지출·수입·앞으로 나갈 돈(부호 없이, ‘원’ 은 작게) · 지난달 비교 한 줄 · 리포트 보기"), "summary markup");
  check(() => ok(!home.includes('class="homeReports"') && reportsOf(home).length === 0, "A-1 새 기본값: 리포트 카드 넷이 꺼져 있다(‘이번 달 리포트’ 묶음 없음)"), "reports off by default");
  check(() => ok(!/class="homeMetrics/.test(home) && !/class="homeUsage/.test(home) && !home.includes("수입 대비 사용") && !home.includes("<span>들어온 돈</span>") && !home.includes("<span>나간 돈</span>"),
    "A-1 옛 homeMetrics(수입 대비 사용 게이지·들어온 돈·나간 돈 칸)는 홈에 없다"), "old metrics gone");
  check(() => ok(home.indexOf('class="homeSummary"') > 0 && home.indexOf('class="homeSummary"') < home.indexOf('<section id="feed"'), "A-1 요약 카드는 최근 내역보다 위에 있다"), "summary above feed");
  check(() => eq(count(home, ">홈 구성</a>"), 1, "A-1 ‘홈 구성’ 링크는 화면에 하나(요약 카드 머리)"), "one layout link");
  check(() => ok(!/data-ab-num=/.test(summary) && count(summary, 'data-ab-num-unit="원"') === 3, "A-2 요약 금액 칸 셋은 금액 가리기가 찾는 표시(data-ab-num-unit)를 달고, 숫자 움직임 표시(data-ab-num)는 달지 않는다"), "num unit marks");
  check(() => ok(calls > 0 && calls <= 9, `A-3 요약 카드는 새 조회 없이 그린다 — 홈 첫 화면의 데이터 요청 ${calls}회 ≤ 9`), "request budget");
  const iphone = (await page(fx, HOME, { headers: { "user-agent": IPHONE } })).html;
  check(() => ok(Buffer.byteLength(iphone) <= 35 * 1024, `A-3 홈 HTML(아이폰) ${Buffer.byteLength(iphone)} B ≤ 35 KiB`), "home bytes");

  // A-4. 지난 달: ‘N월 요약’, 앞으로 나갈 돈 칸은 없다(이번 달에만).
  const june = summaryOf((await page(fx, `/app?month=2026-06&${H}`)).html);
  check(() => ok(june.includes('<h2 id="homeSummaryTitle">6월 요약</h2>') && june.includes(cell("지출", "0")) && june.includes(cell("수입", "0")) && !june.includes("<dt>앞으로 나갈 돈</dt>")
    && june.includes('<a class="homeSummaryGo" href="/reports?month=2026-06&amp;household_id=house-home">리포트 보기</a>'), "A-4 지난 달 홈: 머리는 ‘6월 요약’, 앞으로 나갈 돈 칸 없음, 리포트 보기는 그 달"), "past month summary");

  // A-5. 캘린더: 큰 단추 대신 최근 내역 머리의 링크(같은 주소). 캘린더를 연 홈에는 링크가 없고 캘린더가 요약 카드 아래에 그려진다.
  check(() => ok(home.includes('<section id="feed" class="panel"><h2>최근 내역</h2><a class="homeFeedCalendar" href="/app?month=2026-07&amp;household_id=house-home&amp;view=calendar#calendar">캘린더</a>')
    && count(home, 'class="homeFeedCalendar"') === 1 && !home.includes("homeCalendarToggle"), "A-5 캘린더로 가는 길은 ‘최근 내역’ 머리의 링크 하나다(옛 큰 단추 없음)"), "calendar link");
  const calendar = (await page(fx, `${HOME}&view=calendar`)).html;
  check(() => ok(!calendar.includes('class="homeFeedCalendar"') && calendar.includes('class="panel homeCalendar"') && calendar.indexOf('class="homeSummary"') < calendar.indexOf('class="panel homeCalendar"'),
    "A-5 캘린더를 연 홈: 링크 없이 캘린더가 요약 카드 아래에 있다"), "calendar view");

  // A-6. 홈 구성 화면의 안내.
  const layoutPage = (await page(fx, `/home-layout?month=2026-07&${H}`)).html;
  check(() => ok(layoutPage.includes("처음에는 모두 꺼져 있고, 켠 카드는 홈의 ‘이번 달 요약’ 아래에 보입니다.") && !layoutPage.includes("체크를 끄면 그 카드가 홈에서 사라집니다."), "A-6 홈 구성 화면: 리포트 카드는 처음에 모두 꺼져 있고 켠 카드가 요약 아래에 보인다고 알린다"), "layout page hint");

  // A-7. 홈 구성 저장(폼): 네 장을 켜고 저장하면 요약 카드 아래에 예전 순서로 보이고 ‘홈 구성’ 은 리포트 머리 하나로 옮긴다.
  const formOf = (on) => {
    const form = new URLSearchParams({ month: "2026-07", household_id: "house-home" });
    for (const id of ["where", "pace", "budget", "reserve"]) form.append("reports_order", id);
    for (const id of on) form.append("reports_on", id);
    return form;
  };
  const savedAll = await post(fx, "/home-layout/save", formOf(["where", "pace", "budget", "reserve"]));
  const allOn = (await page(fx, HOME)).html;
  check(() => ok(savedAll.status === 303 && reportsOf(allOn).join(",") === FOUR, `A-7 홈 구성에서 네 장을 켜고 저장하면 네 장이 예전 순서로 보인다(${savedAll.status} · ${reportsOf(allOn).join(",")})`), "saved all on");
  check(() => ok(count(allOn, '<section class="homeSummary"') === 1 && allOn.indexOf('class="homeSummary"') < allOn.indexOf('class="homeReports"'), "A-7 켠 카드는 요약 카드 아래에 있다(요약 카드는 늘 한 장)"), "cards below summary");
  check(() => ok(count(allOn, ">홈 구성</a>") === 1 && allOn.includes('class="homeReportsEdit"') && !allOn.includes('class="homeSummaryEdit"'), "A-7 카드를 켠 홈의 ‘홈 구성’ 은 리포트 머리 하나다(요약 머리에는 두지 않는다)"), "edit link moves");
  await post(fx, "/home-layout/save", formOf(["pace"]));
  const oneOn = (await page(fx, HOME)).html;
  check(() => eq(reportsOf(oneOn).join(","), "최근 7일", "A-7 한 장만 켜고 저장하면 그 카드만 보인다"), "saved one on");
  await post(fx, "/home-layout/save", formOf([]));
  const noneOn = (await page(fx, HOME)).html;
  check(() => ok(!noneOn.includes('class="homeReports"') && noneOn.includes('class="homeSummaryEdit"'), "A-7 모두 끄고 저장하면 기본값과 같다(‘홈 구성’ 은 요약 머리)"), "saved none on");
})), "A 요약 카드 장면");

// A-8. 저장한 값 읽기: 저장한 적이 없거나 깨진 값이면 새 기본값(카드 꺼짐), reports 칸을 저장했으면 그 값 그대로.
check(() => {
  const normalize = sections.normalizeHomeLayout;
  const hiddenOf = (value) => normalize(value).reports.hidden.slice().sort().join(",");
  const ALL = "budget,pace,reserve,where";
  eq(typeof normalize, "function", "A-8 normalizeHomeLayout 이 있다");
  eq(hiddenOf(""), ALL, "A-8 저장한 값이 없으면 카드 넷이 꺼진 것이 기본이다");
  eq(hiddenOf("{bad"), ALL, "A-8 JSON 이 아닌 값은 저장하지 않은 것과 같다");
  eq(hiddenOf(JSON.stringify({ reports: ["where"] })), ALL, "A-8 reports 칸이 객체가 아니면(배열) 저장하지 않은 것과 같다");
  eq(hiddenOf(JSON.stringify({ reports: { order: ["where", "pace"] } })), ALL, "A-8 hidden 칸이 배열이 아니면 저장하지 않은 것과 같다");
  eq(hiddenOf(JSON.stringify({ shortcuts: { order: ["reports"], hidden: [] } })), ALL, "A-8 바로가기만 저장한 값의 리포트 카드도 새 기본값(꺼짐)이다");
  eq(hiddenOf(JSON.stringify({ reports: { order: ["where", "pace", "budget", "reserve"], hidden: [] } })), "", "A-8 넷을 켠 채 저장한 값(V22.9.136 까지 저장한 사람)은 그대로 넷 다 보인다");
  eq(hiddenOf(JSON.stringify({ reports: { order: [], hidden: ["pace"] } })), "pace", "A-8 저장한 hidden 그대로(순서 칸이 비어도)");
  eq(normalize("").shortcuts.hidden.length, 0, "A-8 바로가기의 기본값은 그대로(모두 보임)");
}, "A-8 normalizeHomeLayout");
await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  putSetting(fx, LAYOUT_KEY, "{bad");
  const broken = (await page(fx, HOME)).html;
  check(() => ok(!broken.includes('class="homeReports"') && broken.includes('class="homeSummaryEdit"'), "A-8 깨진 저장 값의 홈은 새 기본값과 같다"), "broken stored layout");
  putSetting(fx, LAYOUT_KEY, { reports: { order: ["reserve", "where", "pace", "budget"], hidden: ["budget"] } });
  const stored = (await page(fx, HOME)).html;
  check(() => eq(reportsOf(stored).join(","), "앞으로 나갈 돈,어디에 썼나,최근 7일", "A-8 예전에 저장한 순서·숨김은 그대로다"), "stored order kept");
  const member = (await page(fx, HOME, { cookie: await fx.cookieFor("user-wifi") })).html;
  check(() => ok(!member.includes('class="homeReports"'), "A-8 홈 구성은 사람마다다 — 저장하지 않은 다른 구성원은 새 기본값"), "per person");
})), "A-8 저장 값 장면");

// A-9. 금액 칸의 갈래: 음수 지출이 큰 달은 ‘돌아온 돈’, 정기 지출을 못 읽으면 ‘확인 불가’ 와 까닭, 정기 지출 항목이 없으면 칸 없음.
await checkAsync(() => withClock("2026-08-20", () => fixture(async (fx) => {
  fx.db.transactions.push(tx("neg-1", "2026-08-03", "expense", -12000, "식비", "옛 음수 환불", "국민카드"));
  const aug = `/app?month=2026-08&${H}`;
  const negative = summaryOf((await page(fx, aug)).html);
  check(() => ok(negative.includes(cell("돌아온 돈", "12,000")) && !negative.includes("<dt>지출</dt>") && negative.includes(cell("앞으로 나갈 돈", "650,000")), "A-9 그 달 지출 합이 0 보다 작으면 ‘지출’ 대신 ‘돌아온 돈’ 으로 그 크기를 적는다(부호 없이)"), "refund-only month");
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? failure() : null));
  let broken;
  try { broken = summaryOf((await page(fx, aug)).html); } finally { stop(); }
  check(() => ok(broken.includes("<div><dt>앞으로 나갈 돈</dt><dd><b>확인 불가</b></dd></div>") && broken.includes('<p class="homeMomLine">고정지출을 불러오지 못했어요</p>') && !broken.includes(cell("앞으로 나갈 돈", "0")),
    "A-9 고정지출을 못 읽으면 0원이 아니라 ‘확인 불가’ 와 무엇을 못 읽었는지 한 줄"), "upcoming unavailable");
  fx.db.accountbook_recurring = fx.db.accountbook_recurring.filter((row) => row.household_id !== "house-home");
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "reserve_plans:house-home");
  const none = summaryOf((await page(fx, aug)).html);
  check(() => ok(none && !none.includes("<dt>앞으로 나갈 돈</dt>") && none.includes(cell("수입", "0")), "A-9 정기 지출 항목이 하나도 없으면 ‘앞으로 나갈 돈’ 칸을 두지 않는다"), "no upcoming items");
})), "A-9 금액 칸 장면");

// A-10. 정기 규칙의 지출자가 지금 구성원이 아니면(예약 실행이 건너뛴다) 그 금액은 빼고 ‘지출자 확인 필요 N건’ 한 줄 — 리포트 카드와 같은 규칙(V22.9.126 FC-21).
await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.accountbook_recurring.find((row) => row.id === "recurring-rent").user_id = "user-gone";
  const gone = summaryOf((await page(fx, HOME)).html);
  check(() => ok(gone.includes(cell("앞으로 나갈 돈", "0")) && gone.includes('<p class="homeMomLine">앞으로 나갈 돈: 지출자 확인 필요 1건</p>'),
    "A-10 지출자가 구성원이 아닌 정기 규칙: 그 금액은 빼고 ‘앞으로 나갈 돈: 지출자 확인 필요 1건’ 한 줄"), "spender check note");
})), "A-10 지출자 확인 장면");

// A-11. ‘앞으로 나갈 돈’ 칸은 이번 달이고 정기 항목을 읽었을 때만이다(카드 함수만 따로 — 화면 길에서는 두 값이 늘 함께 바뀐다).
check(() => {
  const card = sections.renderHomeSummaryCard;
  const base = { householdId: "house-home", stats: { totals: { expense: 1000, income: 2000 } }, upcoming: { available: true, total: 650000, expenseItems: 1 } };
  ok(!card({ ...base, month: "2026-06", reserveLoaded: true, isCurrentMonth: false }).includes("<dt>앞으로 나갈 돈</dt>"), "A-11 지난 달 카드에는 정기 항목을 읽었다고 해도 ‘앞으로 나갈 돈’ 칸이 없다");
  ok(!card({ ...base, month: "2026-07", reserveLoaded: false, isCurrentMonth: true }).includes("<dt>앞으로 나갈 돈</dt>"), "A-11 정기 항목을 읽지 않은 이번 달 카드에도 그 칸이 없다");
  ok(card({ ...base, month: "2026-07", reserveLoaded: true, isCurrentMonth: true }).includes(cell("앞으로 나갈 돈", "650,000")), "A-11 이번 달이고 읽었으면 그 칸이 있다");
  ok(card({ ...base, month: "2026-07", isCurrentMonth: true }).includes('<a class="homeSummaryGo" href="/reports?month=2026-07&amp;household_id=house-home">리포트 보기</a>')
    && card({ ...base, month: "2026-07", isCurrentMonth: true, roomView: true }).includes('<a class="homeSummaryGo" href="/my/analysis?view=report&amp;month=2026-07&amp;household_id=house-home">리포트 보기</a>'),
  "A-11 ‘리포트 보기’ 는 /reports, 방 전용 보기에서는 그 세션이 여는 종합 리포트(/my/analysis?view=report)");
}, "A-11 renderHomeSummaryCard");

// ── B. U-12 한 줄 거래 행과 날짜 머리 ───────────────────────────────────────────
const EXPECTED_HEADS = ["오늘|-4,500원", "어제|-9,000원", "7월 13일 월요일|-3,000원", "7월 9일 목요일|-28,600원", "7월 7일 화요일|-72,000원", "7월 5일 일요일|+180,000원", "7월 4일 토요일|-148,000원", "7월 1일 수요일|+3,200,000원"];
await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.transactions.push(
    tx("p-today", "2026-07-15", "expense", 4500, "카페/간식", "오늘 커피", "카카오페이"),
    tx("p-yday", "2026-07-14", "expense", 9000, "식비", "어제 점심", "현금", "user-wifi"),
    tx("p-gone", "2026-07-13", "expense", 3000, "교통", "떠난 사람 버스", "교통카드", "user-gone"),
  );
  const byId = new Map(fx.db.transactions.map((row) => [String(row.id), row]));
  const names = { "user-bin": "Bin", "user-wifi": "WIFI♥", "user-gone": "이전 참여자" };
  const screens = { 홈: (await page(fx, HOME)).html, "거래내역 탭": (await page(fx, `${HOME}&tab=transactions`)).html };
  for (const [name, html] of Object.entries(screens)) {
    const rows = rowsOf(html);
    check(() => eq(heads(html).join(" / "), EXPECTED_HEADS.join(" / "), `B-1 ${name} 날짜 머리: 오늘·어제·‘M월 D일 요일’ + 그날 합계`), `${name} heads`);
    check(() => ok(rows.length === 8 && rows.every((row) => byId.has(row.id) && row.html.startsWith(`<i class="srOnly">${dateLabel(byId.get(row.id).transaction_date)} · </i>`)),
      `B-2 ${name} 행 ${rows.length}개의 둘째 줄은 읽기 프로그램 전용 날짜(‘7월 9일 · ’)로 시작한다`), `${name} sr date`);
    check(() => ok(rows.every((row) => row.text.split(" · ")[1] === byId.get(row.id).category), `B-2 ${name} 줄 글자를 ‘ · ’ 로 나눈 둘째 조각이 분류다(1년 캐시 V5 의 동그라미 아이콘이 읽는 자리)`), `${name} category slot`);
    check(() => { const hits = groupsOf(html).map(visibleText).filter((text) => ISO.test(text)); ok(groupsOf(html).length === 8 && hits.length === 0, `B-3 ${name} 날짜 묶음 ${groupsOf(html).length}개의 보이는 글에 ISO 날짜가 없다(${hits.length})`); }, `${name} no iso`);
    check(() => ok(rows.every((row) => {
      const source = byId.get(row.id);
      return row.html.endsWith(`<i class="srOnly">${source.type === "income" ? "수입자" : "지출자"} </i>${names[source.user_id]}`);
    }), `B-4 ${name} 구성원이 둘인 가계부: 행마다 줄 끝에 이름(읽기 프로그램에는 ‘지출자’·‘수입자’ 가 붙는다), 나간 사람은 ‘이전 참여자’`), `${name} spender shown`);
    check(() => ok(!html.includes('class="v8-spender"') && !/<h3 class="txDayHead"><span>[^<]*\([일월화수목금토]\)<\/span>/.test(html), `B-5 ${name} 옛 셋째 줄(.v8-spender)과 괄호 요일 머리가 없다`), `${name} old markup gone`);
  }
  // B-6. 혼자 쓰는 가계부: 지금 구성원의 행에는 이름을 쓰지 않고, 지금 구성원이 아닌 사람의 행에만 이름을 쓴다.
  const wifiMember = { ...fx.db.household_members.find((member) => member.household_id === "house-home" && member.user_id === "user-wifi") };
  fx.db.household_members = fx.db.household_members.filter((member) => !(member.household_id === "house-home" && member.user_id === "user-wifi"));
  for (const [name, path] of [["홈", HOME], ["거래내역 탭", `${HOME}&tab=transactions`]]) {
    const rows = rowsOf((await page(fx, path)).html);
    const mine = rows.filter((row) => byId.get(row.id).user_id === "user-bin");
    const others = rows.filter((row) => byId.get(row.id).user_id !== "user-bin");
    check(() => ok(mine.length === 5 && mine.every((row) => !/지출자|수입자/.test(row.html) && row.text.endsWith(byId.get(row.id).payment_method)), `B-6 ${name} 혼자 쓰는 가계부: 내 행 ${mine.length}개는 ‘분류 · 결제수단’ 에서 끝난다`), `${name} solo mine`);
    check(() => ok(others.length === 3 && others.every((row) => row.html.endsWith(`<i class="srOnly">지출자 </i>${names[byId.get(row.id).user_id]}`)), `B-6 ${name} 지금 구성원이 아닌 사람의 행 ${others.length}개에는 이름이 남는다(누구 기록인지)`), `${name} solo departed`);
  }
  // 승인 대기·차단된 사람은 구성원으로 세지 않는다 — 지출자로 고를 수 있는 사람만(빠른 입력의 지출자 선택지와 같은 기준 memberCanBeSpender).
  for (const role of ["pending", "blocked"]) {
    fx.db.household_members = fx.db.household_members.filter((member) => !(member.household_id === "house-home" && member.user_id === "user-wifi"));
    fx.db.household_members.push({ ...wifiMember, role });
    const rows = rowsOf((await page(fx, HOME)).html);
    const mine = rows.filter((row) => byId.get(row.id).user_id === "user-bin");
    const theirs = rows.filter((row) => byId.get(row.id).user_id === "user-wifi");
    check(() => ok(wifiMember.user_id === "user-wifi" && mine.length === 5 && mine.every((row) => !/지출자|수입자/.test(row.html) && row.text.endsWith(byId.get(row.id).payment_method))
      && theirs.length >= 1 && theirs.every((row) => row.html.endsWith("<i class=\"srOnly\">지출자 </i>WIFI♥")),
    `B-6 ${role} 인 사람을 더해도 혼자 쓰는 가계부다: 내 행 ${mine.length}개에 이름 없음, 그 사람의 행 ${theirs.length}개에는 이름`), `solo with ${role}`);
  }
})), "B 거래 행 장면");

// B-7. 행 그리기 함수: 날짜 모양이 아닌 값은 ‘날짜 없음’, 지출자 규칙을 넘기지 않으면 예전처럼 늘 쓴다.
check(() => {
  const render = sections.renderV8TxDayGroups;
  eq(typeof render, "function", "B-7 renderV8TxDayGroups 가 있다");
  const row = { id: "odd", household_id: "h", user_id: "u1", transaction_date: "2026/07/09", type: "expense", amount: 1000, category: "식비", memo: "이상한 날짜", payment_method: "현금", __spenderMembers: [{ user_id: "u1", name: "가" }] };
  const html = render([row], "/app?month=2026-07", null, [], false, [row]);
  ok(html.includes('<h3 class="txDayHead"><span>날짜 없음</span>') && html.includes('<i class="srOnly">날짜 없음 · </i>식비 · 현금') && !html.includes("2026/07/09"), "B-7 날짜 모양이 아닌 값은 머리·행 모두 ‘날짜 없음’ 이다(받은 글자를 그대로 쓰지 않는다)");
  ok(/ · <i class="srOnly">지출자 <\/i>[^<]+<\/span>/.test(html), "B-7 지출자 규칙(showSpender)을 넘기지 않으면 이름을 늘 쓴다(예전 동작)");
  const hidden = render([row], "/app?month=2026-07", null, [], false, [row], { showSpender: () => false });
  ok(!/지출자/.test(hidden) && hidden.includes("식비 · 현금</span>"), "B-7 showSpender 가 거짓이면 이름 조각을 빼고 결제수단에서 끝난다");
}, "B-7 renderV8TxDayGroups");

// B-8. 최근 내역은 10줄 그대로(날짜 머리 묶음으로 바뀌어도).
await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  for (let i = 0; i < 16; i += 1) fx.db.transactions.push(tx(`many-${i}`, `2026-07-${String(10 + (i % 5)).padStart(2, "0")}`, "expense", 1000 + i, "식비", `점심${i}`, "현금"));
  const home = (await page(fx, HOME)).html;
  check(() => ok(count(home, '<article class="v8-tx"') === 10 && home.includes("&amp;feed=all#feed\">전체 21건 조회</a>"), `B-8 최근 내역은 10줄이고 나머지는 ‘전체 N건 조회’ 로 (${count(home, '<article class="v8-tx"')}줄)`), "feed limit");
})), "B-8 최근 내역 줄 수");

// ── C. U-14 홈의 챌린지(기본 챌린지 = 그 달 1~4일) ──────────────────────────────
const MANAGE = '<a href="/my/analysis?view=report&month=2026-07&household_id=house-home#reportChallenge">';
const homeAt = (ymd, task) => withClock(ymd, () => fixture(task));
await checkAsync(() => homeAt("2026-07-03", async (fx) => {
  const home = (await page(fx, HOME)).html;
  const card = (home.match(/<section class="reportChallenge homeChallenge" id="reportChallenge">[\s\S]*?<\/section>/) || [""])[0];
  check(() => ok(card.includes('<span class="reportChallengeBadge"><i aria-hidden="true"></i> 무지출 일수</span><h2>무지출 데이 4일</h2>') && card.includes('data-ab-challenge-slots="1:수:s,2:목:s,3:금:t,4:토:f" data-ab-challenge-full')
    && card.includes("<strong>무지출 2/4일 · 기간 3/4일차</strong>") && card.includes('<a class="reportChallengeManage" href="/my/analysis?view=report&month=2026-07&household_id=house-home#reportChallenge">날짜·목표 설정</a>'),
    "C-1 기간 안(7/3): 홈 카드(homeChallenge)에 배지·제목·날짜 칸·진행 글·설정 링크"), "active card");
  check(() => ok(count(home, 'id="reportChallenge"') === 1 && !home.includes("homeChallengeDone") && home.indexOf('id="reportChallenge"') < home.indexOf('class="homeSummary"'), "C-1 챌린지 자리는 하나이고 요약 카드 위에 있다"), "active once");
  for (const path of [`/my/analysis?month=2026-07&${H}`, `/my/analysis?view=report&month=2026-07&${H}`]) {
    const analysis = (await page(fx, path)).html;
    check(() => ok(analysis.includes('<section class="reportChallenge" id="reportChallenge"') && !analysis.includes("homeChallenge"), `C-6 ${path.split("&")[0]} 의 챌린지는 예전 카드 그대로다(홈 표시 없음)`), `analysis ${path}`);
  }
}), "C-1 기간 안");
const DONE_DEFAULT = (link) => `<p class="homeChallengeDone" id="reportChallenge"><span>무지출 데이 4일 챌린지 끝 · 3/4일</span> · ${MANAGE}${link}</a></p>`;
for (const day of ["2026-07-05", "2026-07-07"]) {
  await checkAsync(() => homeAt(day, async (fx) => {
    const home = (await page(fx, HOME)).html;
    check(() => ok(home.includes(DONE_DEFAULT("새 챌린지")) && count(home, 'id="reportChallenge"') === 1 && !home.includes("homeChallenge\""), `C-2 끝난 뒤 ${day === "2026-07-05" ? "첫날" : "사흘째"}(${day.slice(5)}): 한 줄 ‘무지출 데이 4일 챌린지 끝 · 3/4일 · 새 챌린지’(소유자)`), `done owner ${day}`);
    if (day === "2026-07-05") {
      const member = (await page(fx, HOME, { cookie: await fx.cookieFor("user-wifi") })).html;
      check(() => ok(member.includes(DONE_DEFAULT("챌린지 자세히")), "C-2 구성원의 한 줄 링크는 ‘챌린지 자세히’(같은 주소)"), "done member");
    }
  }), `C-2 ${day}`);
}
await checkAsync(() => homeAt("2026-07-08", async (fx) => {
  const home = (await page(fx, HOME)).html;
  check(() => ok(!home.includes('id="reportChallenge"') && !home.includes("homeChallengeDone"), "C-3 끝난 지 나흘(7/8)부터 홈에 챌린지가 없다"), "gone after 3 days");
  const report = (await page(fx, `/my/analysis?view=report&month=2026-07&${H}`)).html;
  check(() => ok(report.includes('<section class="reportChallenge" id="reportChallenge"'), "C-3 지난 챌린지는 종합 리포트에 그대로 있다"), "report keeps it");
}), "C-3 7/8");
const SAVED = { schema_version: 2, type: "no_spend_days", enabled: true, target_days: 2, target_amount: null, category: null, title: "무지출 데이", start_date: "2026-07-01", target_date: "2026-07-02" };
await checkAsync(() => homeAt("2026-07-04", async (fx) => {
  putSetting(fx, CHALLENGE_KEY, SAVED);
  const home = (await page(fx, HOME)).html;
  check(() => ok(home.includes('<p class="homeChallengeDone" id="reportChallenge" data-ab-celebrate="challenge" data-ab-celebrate-key="house-home:2026-07-01:2026-07-02:no_spend_days:2:0::0" data-ab-celebrate-count="2"><span>무지출 데이 2일 챌린지 성공 ✓</span> · '),
    "C-4 저장한 챌린지를 이루고 끝난 뒤(7/4): 한 줄 ‘챌린지 성공 ✓’ 에 축하 표시(예전 카드와 같은 키 — 한 번만 터진다)"), "saved success");
}), "C-4 성공");
await checkAsync(() => homeAt("2026-07-03", async (fx) => {
  putSetting(fx, CHALLENGE_KEY, { ...SAVED, target_days: 4, target_date: "2026-07-07", enabled: false });
  const home = (await page(fx, HOME)).html;
  check(() => ok(!home.includes('id="reportChallenge"'), "C-5 ‘챌린지 표시’ 를 끈 챌린지는 기간 안에도 홈에 없다"), "disabled");
}), "C-5 꺼짐");
await checkAsync(() => homeAt("2026-07-15", async (fx) => {
  putSetting(fx, CHALLENGE_KEY, { ...SAVED, target_days: 3, start_date: "2026-07-20", target_date: "2026-07-23" });
  const home = (await page(fx, HOME)).html;
  check(() => ok(/<section class="reportChallenge homeChallenge" id="reportChallenge">[\s\S]*?<strong>무지출 0\/3일 · 기간 시작 전<\/strong>/.test(home), "C-5 시작 전 챌린지는 홈 카드로 보인다(기간 시작 전)"), "scheduled");
}), "C-5 시작 전");
check(() => {
  const renderHome = challengeModule.renderHomeChallenge;
  eq(typeof renderHome, "function", "C-7 renderHomeChallenge 가 있다");
  const ended = { enabled: true, phase: "ended", title: "무지출 데이", targetDays: 4, progress: 1, recording: false, startDate: "2026-07-01", targetDate: "2026-07-04", month: "2026-07" };
  eq(renderHome(ended, { householdId: "h", today: "2026-07-04" }), "", "C-7 목표일 당일에 ‘끝남’ 으로 온 값은 한 줄을 그리지 않는다(다음 날부터 사흘)");
  ok(renderHome(ended, { householdId: "h", today: "2026-07-06" }).includes("<span>무지출 데이 4일 챌린지가 끝났어요</span>"), "C-7 직접 적은 기록이 없으면 성공·날 수를 말하지 않는다");
  eq(renderHome(ended, { householdId: "h", today: "날짜 아님" }), "", "C-7 오늘 값이 날짜가 아니면 그리지 않는다");
  eq(renderHome(null, { householdId: "h" }), "", "C-7 챌린지 값이 없으면 그리지 않는다");
}, "C-7 renderHomeChallenge");

// ── D. 홈 스타일시트(1년 캐시 자산) ───────────────────────────────────────────
const NEW_HOME_CSS = "/assets/mobile-home-v229137.css";
const OLD_HOME_CSS = "/assets/mobile-home-v229136.css";
const OLD_HOME_SHA = "f3be8c9ab992c1cb1a01ed99806b1ec598c02feb5d66e0ec37af22a51a48e1dc";
const compareSpec = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
function specificity(selector) {
  let a = 0, b = 0, c = 0;
  let s = ` ${selector} `;
  s = s.replace(/\[[^\]]*\]/g, () => { b += 1; return " "; });
  for (let round = 0; round < 4 && /:(is|not|has|where)\(/.test(s); round += 1) {
    s = s.replace(/:(is|not|has|where)\(([^()]*)\)/g, (_, name, inner) => {
      if (name !== "where") {
        const best = inner.split(",").map((part) => specificity(part.trim())).reduce((x, y) => (compareSpec(x, y) >= 0 ? x : y), [0, 0, 0]);
        a += best[0]; b += best[1]; c += best[2];
      }
      return " ";
    });
  }
  s = s.replace(/#[\w-]+/g, () => { a += 1; return " "; });
  s = s.replace(/::[\w-]+/g, () => { c += 1; return " "; });
  s = s.replace(/:[\w-]+/g, () => { b += 1; return " "; });
  s = s.replace(/\.[\w-]+/g, () => { b += 1; return " "; });
  for (const _ of s.matchAll(/[a-zA-Z][\w-]*/g)) c += 1;
  return [a, b, c];
}
const splitSelectors = (text) => { const parts = []; let depth = 0, cur = ""; for (const ch of text) { if (ch === "(") depth += 1; if (ch === ")") depth -= 1; if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) parts.push(cur.trim()); return parts; };
const rulesOf = (css) => [...String(css).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: splitSelectors(m[1].trim()), body: m[2] }));
const PROPS = ["color", "background", "background-color", "background-image", "border", "border-color", "outline-color", "box-shadow"];
const importantProps = (body) => PROPS.filter((p) => new RegExp(`(?:^|;)\\s*${p}\\s*:[^;]*!important`).test(body));
// 셸 자산에서 챌린지 카드에 닿는 중요 표시 규칙(2026-11-21 의 24개) → 홈 카드에서 그 규칙을 이기는 홈 규칙, 또는 홈 카드에 그 요소가 없는 까닭.
// 셸에 새 규칙이 생기면 이 표가 실패한다 — 홈 카드가 다시 검게 칠해지지 않는지 사람이 한 번 본다.
const SHELL_TO_HOME = {
  "body.abV22812Shell .reportChallenge": ["html body.abV22812Shell .reportChallenge.homeChallenge", ["color", "background", "border"]],
  "body.abV22812Shell :is(.reportChallenge,.homeNotice)": ["html body.abV22812Shell .reportChallenge.homeChallenge", ["background", "border"]],
  "body.abV22812Shell .reportChallengeBadge": ["html body.abV22812Shell .homeChallenge .reportChallengeBadge", ["color", "background"]],
  "body.abV22812Shell .reportChallenge h2": ["html body.abV22812Shell .homeChallenge h2", ["color"]],
  "body.abV22812Shell .reportChallengeMain>strong": ["html body.abV22812Shell .homeChallenge .reportChallengeMain>strong", ["color"]],
  "body.abV22812Shell .reportChallengeManage": ["html body.abV22812Shell .homeChallenge .reportChallengeManage", ["color"]],
  "body.abV22812Shell .reportChallengeDays li>b": ["html body.abV22812Shell .homeChallenge .reportChallengeDays li>b", ["color"]],
  "body.abV22812Shell .reportChallengePercent>b": ["html body.abV22812Shell .homeChallenge .reportChallengePercent>b", ["color"]],
  "body.abV22812Shell .reportChallenge :is(a,summary,input,button):focus-visible": ["html body.abV22812Shell .homeChallenge :is(a,summary,input,button):focus-visible", ["outline-color"]],
  "body.abV22812Shell .reportChallenge p": "홈 카드에는 설명 문단이 없다(home 갈래)",
  "body.abV22812Shell .reportChallengeDates": "기간 글자는 설명 문단 안에만 있다",
  "body.abV22812Shell .reportChallengeFormStatus": "설정 폼 상태는 분석 화면에만 있다",
  "body.abV22812Shell .reportChallengeFormStatus.isError": "설정 폼 상태는 분석 화면에만 있다",
  "body.abV22812Shell .reportChallengeDays li>span": "홈 카드의 요일 글자는 숨긴다(display:none)",
  "body.abV22812Shell .reportChallengeDays .is-success>i": "날짜 칸 전체 모드(data-ab-challenge-full)는 <i> 를 만들지 않는다",
  "body.abV22812Shell .reportChallengeDays .is-spent>i": "날짜 칸 전체 모드(data-ab-challenge-full)는 <i> 를 만들지 않는다",
  "body.abV22812Shell .reportChallengeDays .is-today>i": "날짜 칸 전체 모드(data-ab-challenge-full)는 <i> 를 만들지 않는다",
  "body.abV22812Shell .reportChallengeLegend": "홈 카드의 범례는 숨긴다(display:none)",
  "body.abV22812Shell .reportChallengeLegend .is-success": "홈 카드의 범례는 숨긴다(display:none)",
  "body.abV22812Shell .reportChallengeLegend .is-spent": "홈 카드의 범례는 숨긴다(display:none)",
  "body.abV22812Shell .reportChallengeLegend .is-today": "홈 카드의 범례는 숨긴다(display:none)",
  "body.abV22812Shell .reportChallengePercent>span": "홈 카드의 달성률 설명은 숨긴다(display:none)",
  "body.abV22812Shell .reportChallenge :is(label,label>span,summary)": "홈 카드에는 폼 라벨·접기가 없다",
  "body.abV22812Shell .reportChallenge summary": "홈 카드에는 접기가 없다",
};
await checkAsync(() => withClock("2026-07-03", () => fixture(async (fx) => {
  const home = (await page(fx, HOME)).html;
  const homeCssPath = (home.match(/\/assets\/mobile-home-v\d+\.css/g) || []).join(",");
  const shellPath = (home.match(/\/assets\/accountbook-shell-v\d+\.css/) || [""])[0];
  check(() => eq(homeCssPath, NEW_HOME_CSS, "D-1 홈은 새 홈 스타일시트 주소 하나만 부른다"), "home css address");
  const fresh = await asset(fx, NEW_HOME_CSS);
  const old = await asset(fx, OLD_HOME_CSS);
  check(() => ok(fresh.status === 200 && fresh.etag === '"mobile-home-v229137-css"' && /max-age=31536000/.test(fresh.cache) && /immutable/.test(fresh.cache), `D-1 새 주소: 200 · ETag · 1년 캐시(${fresh.status} ${fresh.etag} ${fresh.cache})`), "new asset served");
  check(() => ok(old.status === 200 && sha(old.text) === OLD_HOME_SHA && !old.text.includes(".homeSummary{") && !old.text.includes("homeChallenge"), "D-2 옛 주소 v229136 은 옛 바이트 그대로(V22.9.136 화면이 쓴다)"), "old asset kept");
  const css = fresh.text;
  // 이 판이 더한 블록: 머리 주석부터 마지막 규칙(끝난 챌린지 한 줄의 링크)까지. 홈 자산은 이 상수 뒤에 다른 조각을 잇는다.
  const blockStart = css.indexOf("/* V22.9.137 홈 단순화");
  const lastRule = blockStart < 0 ? -1 : css.indexOf("html body .homeChallengeDone a{", blockStart);
  const block = lastRule < 0 ? "" : css.slice(blockStart, css.indexOf("}", lastRule) + 1);
  for (const [needle, label] of [
    ["html body .txDayGroup .v8-tx{padding:6px 4px 4px}", "행 위 6px·아래 4px(누르는 칸 44px 와 아랫줄 1px 을 더해 56px)"],
    ["html body .txDayGroup .v8-tx-main>div>b,html body .txDayGroup .v8-tx-main>div>.v8-tx-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}", "제목과 둘째 줄은 한 줄씩, 넘치면 말줄임"],
    ["html body .txDayGroup>.txDayHead{padding:8px 4px 4px;font-size:14px;line-height:20px;color:var(--ab12-muted,#5f6b7a)}", "날짜 머리는 작은 흐린 글자"],
    ['html[data-ab-resolved-theme="dark"] body.abV22812Shell .txDayGroup>.txDayHead>span{color:var(--ab12-muted)!important}', "어두운 테마에서도 날짜 머리 글자는 흐린 색"],
    ["html body #feed>.homeFeedCalendar{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;min-height:44px;", "캘린더 링크는 최근 내역 머리 오른쪽, 누르는 칸 44px"],
    ["html body .homeSummary{margin:12px 0;padding:16px;border:1px solid var(--ab12-line,#e8edf4);border-radius:20px;background:var(--ab12-surface,#fff);color:var(--ab12-text,#191f28)}", "요약 카드는 밝은 면(토큰 — 어두운 테마도 같은 규칙)"],
    ["html body .homeSummary dd b{font-size:18px;font-weight:800;color:inherit}", "요약 금액은 본문색(부호·색 없이)"],
    ["html body .homeSummaryEdit{display:inline-flex;align-items:center;min-height:44px;", "‘홈 구성’ 누르는 칸 44px"],
    ["html body .homeSummaryGo{display:inline-flex;align-items:center;gap:8px;min-height:44px;", "‘리포트 보기’ 누르는 칸 44px"],
    ["html body.abV22812Shell .reportChallenge.homeChallenge{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin:12px 0;padding:12px 16px;border:1px solid var(--ab12-line,#e8edf4)!important;background:var(--ab12-surface,#fff)!important;color:var(--ab12-text,#191f28)!important}", "홈 챌린지는 밝은 면 카드"],
    ["html body.abV22812Shell .homeChallenge .reportChallengeManage{grid-column:3;grid-row:3;justify-self:end;min-height:44px;", "챌린지 설정 링크 누르는 칸 44px"],
    ["html body .homeChallengeDone{display:flex;", "끝난 챌린지 한 줄"],
    ["html body .homeChallengeDone a{display:inline-flex;align-items:center;min-height:44px;", "한 줄의 링크 누르는 칸 44px"],
  ]) check(() => ok(block.includes(needle), `D-3 새 홈 스타일시트: ${label}`), `css ${label}`);
  check(() => {
    const SPACE = /(?<![-\w])((?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g;
    const odd = [...block.matchAll(SPACE)].filter((m) => [...m[2].matchAll(/(-?\d*\.?\d+)px\b/g)].some((n) => { const v = Math.abs(Number(n[1])); return v >= 2.5 && (!Number.isInteger(v) || v % 2 === 1); }));
    ok(block.length > 3000 && odd.length === 0, `D-4 이 판이 더한 홈 규칙의 간격은 짝수 px 뿐이다(${odd.map((m) => m[0]).join(" / ") || "홀수 없음"})`);
  }, "even spacing");
  // D-5. 셸 자산(홈보다 뒤에 걸린다)의 검은 카드 규칙이 홈 카드에서 지는지: 같은 속성을 중요 표시로 덮는 홈 규칙의 우선순위가 더 높다.
  const shell = (await asset(fx, shellPath)).text;
  const shellParts = new Map();
  for (const rule of rulesOf(shell)) {
    const props = importantProps(rule.body);
    if (!props.length) continue;
    for (const part of rule.selectors) if (/reportChallenge|homeChallenge/.test(part)) shellParts.set(part, [...new Set([...(shellParts.get(part) || []), ...props])]);
  }
  check(() => eq([...shellParts.keys()].sort().join(" | "), Object.keys(SHELL_TO_HOME).sort().join(" | "), `D-5 셸에서 챌린지 카드에 닿는 중요 표시 규칙 ${shellParts.size}개가 표의 것과 같다`), "shell rule census");
  const homeRules = rulesOf(css);
  for (const [shellPart, target] of Object.entries(SHELL_TO_HOME)) {
    if (typeof target === "string") continue;
    const [homeSelector, props] = target;
    check(() => {
      const homeProps = new Set(homeRules.filter((rule) => rule.selectors.includes(homeSelector)).flatMap((rule) => importantProps(rule.body)));
      const missing = props.filter((p) => !homeProps.has(p));
      const wins = compareSpec(specificity(homeSelector), specificity(shellPart)) > 0;
      ok(missing.length === 0 && wins, `D-5 ${shellPart} → ${homeSelector}: 중요 표시 ${props.join("·")} (${missing.join(",") || "모두"}), 우선순위 ${specificity(homeSelector).join(",")} > ${specificity(shellPart).join(",")}`);
    }, `cascade ${shellPart}`);
  }
  // D-6. 어두운 테마의 날짜 머리: 셸의 ‘.panel 안의 글자는 color:inherit!important’ 규칙이 날짜 글자를 제목색으로 만든다 — 그보다 센 홈 규칙이 흐린 색을 준다.
  check(() => {
    const homeSelector = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell .txDayGroup>.txDayHead>span';
    const mine = homeRules.filter((rule) => rule.selectors.includes(homeSelector) && /(?:^|;)\s*color\s*:\s*var\(--ab12-muted\)\s*!important/.test(rule.body));
    const inheritParts = rulesOf(shell).filter((rule) => /color\s*:\s*inherit\s*!important/.test(rule.body)).flatMap((rule) => rule.selectors)
      .filter((part) => part.includes('[data-ab-resolved-theme="dark"]') && /\.panel[,)]/.test(part) && /[(,]span[,)]/.test(part));
    const top = inheritParts.map(specificity).reduce((x, y) => (compareSpec(x, y) >= 0 ? x : y), [0, 0, 0]);
    ok(mine.length === 1 && inheritParts.length >= 1 && compareSpec(specificity(homeSelector), top) > 0,
      `D-6 어두운 테마의 날짜 머리 글자는 흐린 색: 셸의 inherit 규칙 ${inheritParts.length}개 가운데 가장 센 ${top.join(",")} < 홈 규칙 ${specificity(homeSelector).join(",")}`);
  }, "dark day head");
})), "D 스타일시트 장면");

// ── E. 방 전용 보기(V22.9.130)의 홈 ─────────────────────────────────────────────
// 요약 카드의 링크 ‘리포트 보기’ 는 /reports 인데 방 전용 세션은 그 주소를 열 수 없다(허용 목록 밖 — 흐린 링크가 된다). 그 세션에서는 종합 리포트로 보낸다.
// 도움 함수는 validate-v229136-spacing-color 의 방 전용 보기 장면을 줄여 옮겼다.
const SECRET = "validate-v229137-home-simplify-secret";
const ROOM_DAY = "2026-11-21";
const hex66 = (label) => createHash("sha256").update(`v229137-${label}`).digest("hex") + "ab";
const ROOM = hex66("room"), U1 = hex66("user-1"), U2 = hex66("user-2"), U_ALIAS = hex66("alias");
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}
async function say(fx, utterance, user) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
}
class Jar {
  constructor() { this.items = new Map(); }
  take(lines) {
    for (const line of lines) {
      const [pair, ...attrs] = line.split(";").map((item) => item.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      const maxAge = attrs.find((item) => /^max-age=/i.test(item));
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.items.delete(name); else this.items.set(name, value);
    }
  }
  header() { return [...this.items].map(([name, value]) => `${name}=${value}`).join("; "); }
  scope() { const raw = this.items.get("ab_user") || ""; const token = raw ? decodeURIComponent(raw) : ""; return token ? (token.slice(0, token.lastIndexOf(".")).split("|")[3] || "").replace(/^r:/, "") : ""; }
}
// 브라우저의 화면 이동 한 번(따라가지 않는다).
async function go(fx, path, jar) {
  const jobs = [];
  const line = jar.header();
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: { "user-agent": PC, accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-site": "none", ...(line ? { cookie: line } : {}) } }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  jar.take(typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []);
  return { status: response.status, html: await response.text() };
}
await checkAsync(() => withClock(ROOM_DAY, () => fixture(async (fx) => {
  resetIsolateState();
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  Object.assign(fx.env, KAKAO_ENV);
  delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
  delete fx.env.KAKAO_ROOM_QUIET_LOGIN;
  await say(fx, "별빛국수 12000원", U1);
  await say(fx, "달빛라떼 4500원", U2);
  const u1 = fx.db.users.find((user) => user.kakao_user_key === U1);
  const household = fx.db.households.find((row) => row.name === "이 방의 공동 가계부" && fx.db.household_members.some((m) => m.user_id === u1?.id && m.household_id === row.id && m.role === "owner"));
  if (!u1 || !household) throw new Error("room fixture not ready");
  const hh = String(household.id);
  const links = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "user_identity_links")?.value || "{}");
  links[`skill_identity:${U_ALIAS}`] = { user_id: "user-wifi", source: "skill", linked_at: `${ROOM_DAY}T01:00:00Z` };
  const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
  if (row) row.value = JSON.stringify(links); else fx.db.accountbook_settings.push({ key: "user_identity_links", value: JSON.stringify(links) });
  fx.db.household_members.push({ household_id: household.id, user_id: "user-wifi", role: "member", created_at: `${ROOM_DAY}T01:00:00Z` });
  resetIsolateState();
  const jar = new Jar();
  await go(fx, `/my?botUserKey=${U_ALIAS}&appUserId=1801267359&botGroupKey=${ROOM}`, jar);
  if (jar.scope() !== hh) throw new Error(`no room view session (${jar.scope() || "none"})`);
  const home = await go(fx, `/app?household_id=${hh}`, jar);
  const link = (summaryOf(home.html).match(/<a class="homeSummaryGo"[^>]*>/) || [""])[0];
  const target = `/my/analysis?view=report&month=2026-11&household_id=${encodeURIComponent(hh)}`;
  check(() => ok(home.status === 200 && home.html.includes('id="abRoomViewBand"') && link.includes(` href="${target.replace(/&/g, "&amp;")}"`) && !/data-ab-rv-off|aria-disabled/.test(link),
    `E-1 방 전용 보기 홈의 ‘리포트 보기’ 는 종합 리포트(그 세션이 여는 주소)로 가고 흐리지 않는다(${link.slice(0, 160)})`), "room view report link");
  const report = await go(fx, target, jar);
  const reportTitle = (report.html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1];
  check(() => ok(report.status === 200 && report.html.includes('id="abRoomViewBand"') && reportTitle === "말해가계부 · 분석", `E-1 그 주소가 방 전용 세션으로 열린다 — 띠가 붙은 소비 분석 화면의 종합 리포트 보기(${report.status} · ${reportTitle})`), "room view report opens");
})), "E 방 전용 보기 장면");

if (failures.length) {
  console.error(`홈 단순화 검사 실패 ${failures.length}건:`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
done();
