// V22.9.79 웹 화면 결함 묶음 검사 (V78 S-3 · V44 D-16·F-3·F-6·F-7·F-9).
//   S-3  지난·과거 달 홈의 ‘쓰는 속도’가 오늘로 끝나는 7일 창을 써서 지출이 있어도 ‘0원 · 직전 7일과 같은 속도입니다’였다.
//        지난 달은 그 달 말일로 끝나는 마지막 4주, 아직 오지 않은 달은 ‘관측 전’으로 말한다(이번 달은 그대로).
//   D-16 홈 ‘주별’ 탭이 요일별 합계였다 → 그 달의 주별(일~토) 합계.
//   F-3  수정 폼(전체 화면·홈 상세·일별 시트)의 분류·결제수단 칸에 제안 목록이 없었다.
//   F-6  구성원에게 보이는 ‘예산 설정’ 링크가 403 이었고, 403 안내가 다른 화면(참여자·단톡방) 이야기를 했다.
//   F-7  거래 검색 결과를 눌러도 홈의 기록(.v8-tx)으로 이동·강조하지 않았다.
//   F-9  가입 서버 오류 뒤 입력할 폼이 화면 아래 멀리 있었다(이름 칸 되살리기는 V22.9.76 에서 고침).
// 서버가 그린 마크업·데이터 계약은 app.fetch 로 보고, 클라이언트 스크립트는 실제로 내려가는 자산/함수 원문을 vm 안의 가짜 DOM 에서 돌린다.
// 레이아웃·스크롤 느낌·실제 입력 목록 표시는 실제 브라우저에서만 확인된다(보고서의 ‘실제 확인 필요’ 참고).
// 모든 검사를 끝까지 돌려 실패 목록을 한꺼번에 낸다(고치기 전 코드에서 몇 개가 실패하는지 세기 위해).
// 사용: node validation/validate-web-ui-v22979.mjs [pace|weekly|edit|member|search|signup]
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { BASE, app, ctx, fixture, intercept, failure, page, post, withClock } from "./lib-audit-v22934.mjs";

const only = process.argv[2] || "";
const run = (name) => !only || only === name;
let checks = 0;
const failed = [];
const ok = (value, label) => { checks += 1; if (!value) failed.push(label); };
const eq = (actual, expected, label) => { checks += 1; if (actual !== expected) failed.push(`${label} (기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)})`); };
async function scenario(name, task) {
  try { await task(); } catch (error) { checks += 1; failed.push(`${name}: 예외 ${String(error?.stack || error).split("\n").slice(0, 3).join(" | ")}`); }
}

const HH = "house-home";
const hh = `household_id=${HH}`;
const decode = (text) => String(text || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html) => decode(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const expense = (id, date, amount, extra = {}) => ({ id, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: `기록 ${id}`, payment_method: "현금", source: "web", raw_text: "", ...extra });

// ── 홈 카드·탭 도우미 ───────────────────────────────────────────────────────────
async function home(fx, month, extra = "", cookie = fx.cookie) {
  const response = await page(fx, `/app?month=${month}&${hh}${extra}`, { cookie });
  const card = (response.html.match(/<article class="homeReport"><div class="homeReportTop"><span>쓰는 속도<\/span>[\s\S]*?<\/article>/) || [""])[0];
  return {
    status: response.status, html: response.html, card,
    value: (card.match(/<b>([^<]*)<\/b>/) || [])[1] || "",
    note: (card.match(/<small>([^<]*)<\/small>/) || [])[1] || "",
    label: (card.match(/aria-label="([^"]*)"/) || [])[1] || "",
    bars: [...card.matchAll(/<i\b([^>]*)>/g)].map((m) => (/isBlank/.test(m[1]) ? "blank" : (m[1].match(/height:(\d+)%/) || [])[1] + "%")),
  };
}
const weeklyCells = (html) => [...html.matchAll(/<div class="weekdayCell weekCell( peak)?"[\s\S]*?<\/div><\/div>/g)].map((m) => ({
  peak: !!m[1],
  title: (m[0].match(/<b[^>]*>([^<]*)<\/b>/) || [])[1] || "",
  count: (m[0].match(/<span[^>]*>(\d+)건<\/span>/) || [])[1] || "",
  range: (m[0].match(/<small[^>]*>([^<]*)<\/small>/) || [])[1] || "",
  amount: (m[0].match(/<strong[^>]*>([^<]*)<\/strong>/) || [])[1] || "",
}));

// ── 가짜 브라우저 조각 ──────────────────────────────────────────────────────────
function stubElement(tag = "div") {
  const element = {
    tagName: String(tag).toUpperCase(), innerHTML: "", textContent: "", className: "", hidden: false, value: "", href: "", type: "", open: false,
    attrs: new Map(), listeners: Object.create(null), children: [], parentElement: null, calls: [],
    setAttribute(key, value) { this.attrs.set(key, String(value)); }, getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; },
    removeAttribute(key) { this.attrs.delete(key); }, hasAttribute(key) { return this.attrs.has(key); },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    classList: { added: [], add(name) { this.added.push(name); }, remove() {} },
    closest() { return null; }, focus(options) { this.calls.push(["focus", options]); }, select() {}, scrollIntoView(options) { this.calls.push(["scrollIntoView", options]); },
    querySelectorAll() { return []; },
  };
  const children = new Map();
  element.querySelector = (selector) => { if (!children.has(selector)) children.set(selector, stubElement("div")); return children.get(selector); };
  return element;
}
// 가짜 브라우저의 비동기 요청(app.fetch)이 끝나길 조건으로 기다린다. 고정 횟수만 기다리면 느린 실행에서 결과가 오기 전에 읽는다.
const until = async (done, ms = 8000) => { const end = Date.now() + ms; while (!done() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 5)); };

// ─────────────────────────────────────────────────────────────────────────────
// S-3 쓰는 속도
// ─────────────────────────────────────────────────────────────────────────────
if (run("pace")) await scenario("pace", () => withClock("2026-10-25", () => fixture(async (fx) => {
  const seed = (rows) => { fx.db.transactions = fx.db.transactions.filter((row) => !String(row.id).startsWith("s3-")); fx.db.transactions.push(...rows); };
  // 7월(31일): 창은 4~10 · 11~17 · 18~24 · 25~31. 기본 픽스처의 지출은 7/4·7/7·7/9 뿐(248,600원).
  const july = (rows) => seed(rows.map(([day, amount], index) => expense(`s3-${index}`, `2026-07-${String(day).padStart(2, "0")}`, amount)));
  july([[12, 10000], [20, 30000], [27, 50000], [31, 20000]]);
  const up = await home(fx, "2026-07");
  eq(up.status, 200, "지난 달 홈이 열린다");
  eq(up.value, "70,000원", `지난 달의 큰 숫자는 그 달 마지막 7일(25~31일) 지출이다 (${up.value})`);
  eq(up.note, "마지막 7일이 직전 7일보다 ▲ 40,000원 많았어요", `직전 7일(18~24일 30,000원)과 견준 말이 과거형이다 (${up.note})`);
  eq(up.label, "마지막 4주 지출", "막대 설명이 ‘최근’이 아니라 ‘마지막’ 4주다");
  eq(up.bars.join(","), "100%,4%,12%,28%", `막대 넷이 모두 그려지고 비율이 그 달 자료다 (${up.bars.join(",")})`);
  ok(!up.note.includes("직전 7일과 같은 속도입니다") && up.value !== "0원", "지출이 있는 지난 달이 ‘0원 · 같은 속도’로 보이지 않는다");

  july([[12, 10000], [20, 30000], [27, 10000], [31, 20000]]);
  eq((await home(fx, "2026-07")).note, "마지막 7일과 직전 7일이 같았어요", "마지막 7일과 직전 7일이 같으면 그렇게 말한다");
  july([[12, 10000], [20, 30000], [31, 20000]]);
  const down = await home(fx, "2026-07");
  eq(down.value, "20,000원", "마지막 7일 20,000원");
  eq(down.note, "마지막 7일이 직전 7일보다 ▼ 10,000원 적었어요", `줄었으면 ▼ 와 ‘적었어요’ (${down.note})`);
  july([[4, 5000]]);
  const quiet = await home(fx, "2026-07");
  eq(quiet.value, "0원", "마지막 2주에 지출이 없으면 0원");
  eq(quiet.note, "마지막 2주에는 기록된 지출이 없어요", `그 달에 지출이 있어도 마지막 2주가 비면 그렇게 말한다 (${quiet.note})`);
  eq(quiet.bars[0], "100%", "앞쪽 창의 지출은 막대로 남는다");

  // 달 길이: 28일(창이 1일부터 시작)·29일(윤년 마지막 날 포함).
  seed([expense("s3-a", "2026-02-01", 1000), expense("s3-b", "2026-02-15", 2000), expense("s3-c", "2026-02-22", 5000)]);
  const feb = await home(fx, "2026-02");
  eq(feb.value, "5,000원", "28일 달의 마지막 창은 22~28일이다");
  eq(feb.bars.join(","), "20%,4%,40%,100%", `2월 1일부터의 창도 그려진다 (${feb.bars.join(",")})`);
  eq(feb.note, "마지막 7일이 직전 7일보다 ▲ 3,000원 많았어요", "28일 달의 직전 7일은 15~21일");
  await withClock("2028-03-10", () => fixture(async (leap) => {
    leap.db.transactions.push(expense("s3-l1", "2028-02-29", 7000), expense("s3-l2", "2028-02-22", 500));
    const l = await home(leap, "2028-02");
    eq(l.value, "7,000원", `윤년 2월 29일이 마지막 창(23~29일)에 든다 (${l.value})`);
    eq(l.note, "마지막 7일이 직전 7일보다 ▲ 6,500원 많았어요", `직전 7일은 16~22일 (${l.note})`);
  }));

  // 달이 바뀐 날: 11월 1일에는 10월이 지난 달이다.
  await withClock("2026-11-01", () => fixture(async (turn) => {
    turn.db.transactions.push(expense("s3-t1", "2026-10-31", 12000), expense("s3-t2", "2026-10-24", 2000));
    const t = await home(turn, "2026-10");
    eq(t.value, "12,000원", `11월 1일의 10월 홈은 10월 말일로 끝난다 (${t.value})`);
    eq(t.label, "마지막 4주 지출", "11월 1일의 10월은 지난 달이다");
    const now = await home(turn, "2026-11");
    eq(now.label, "최근 4주 지출", "11월 1일의 11월 홈은 이번 달 방식이다");
  }));

  // 아직 오지 않은 달.
  seed([expense("s3-f1", "2026-12-24", 100000)]);
  const future = await home(fx, "2026-12");
  eq(future.value, "관측 전", `아직 오지 않은 달은 0원이 아니라 ‘관측 전’ (${future.value})`);
  eq(future.note, "아직 시작하지 않은 달이에요", "그 달이 시작하지 않았다고 말한다");
  eq(future.bars.join(","), "blank,blank,blank,blank", "미리 적어 둔 지출이 있어도 막대는 비워 둔다");
  eq(future.bars.length, 4, "막대는 늘 네 개다");

  // 이번 달은 그대로.
  seed([expense("s3-n1", "2026-10-24", 40000), expense("s3-n2", "2026-10-20", 10000), expense("s3-n3", "2026-10-18", 5000)]);
  const now = await home(fx, "2026-10");
  eq(now.value, "50,000원", "이번 달의 큰 숫자는 오늘(10/25)로 끝나는 7일");
  eq(now.note, "직전 7일보다 ▲ 45,000원 더 쓰는 속도입니다", `이번 달 문구는 그대로다 (${now.note})`);
  eq(now.label, "최근 4주 지출", "이번 달 막대 설명은 그대로다");
  eq(now.bars[0], "blank", "이번 달 시작보다 앞선 창은 여전히 비운다");
})));

// ─────────────────────────────────────────────────────────────────────────────
// D-16 주별 탭
// ─────────────────────────────────────────────────────────────────────────────
if (run("weekly")) await scenario("weekly", () => withClock("2026-10-25", () => fixture(async (fx) => {
  const weekly = await home(fx, "2026-07", "&trend=weekly");
  const cells = weeklyCells(weekly.html);
  eq(weekly.status, 200, "주별 탭이 열린다");
  eq((weekly.html.match(/class="homeTrendOn"[^>]*>([^<]*)</) || [])[1], "주별", "주별 탭이 선택돼 있다");
  eq(cells.map((c) => c.title).join(","), "1주차,2주차,3주차,4주차,5주차", `7월은 다섯 주다 (${cells.map((c) => c.title).join(",")})`);
  eq(cells.map((c) => c.range).join(","), "1~4일,5~11일,12~18일,19~25일,26~31일", "첫 주·마지막 주는 잘린 날짜 범위를 적는다");
  eq(cells.map((c) => c.amount).join(","), "15만,10만,·,·,·", `주마다 그 주의 지출을 더한다 (${cells.map((c) => c.amount).join(",")})`);
  eq(cells.map((c) => c.count).join(","), "1,2,,,", "건수는 있는 주에만 적는다");
  eq(cells.map((c) => (c.peak ? "peak" : "-")).join(","), "peak,-,-,-,-", "가장 많이 쓴 주 하나만 강조한다");
  ok(!weekly.html.includes("weekdayTrendGrid"), "홈 주별 탭에 요일별 격자가 없다");
  ok(!/<b[^>]*>(일|월|화|수|목|금|토)<\/b>/.test(weekly.html.slice(weekly.html.indexOf("homeTrendPanel"), weekly.html.indexOf("homeTrendPanel") + 6000)), "주별 탭 칸의 제목이 요일 이름이 아니다");
  ok(Buffer.byteLength(weekly.html) <= 47104, `주별 탭 홈이 HTML 예산 안이다 (${Buffer.byteLength(weekly.html)}B)`);
  ok(weekly.html.includes("aria-label=\"7월 주별 지출\""), "주별 격자에 이름이 있다");

  // 한 달이 여섯 주에 걸치는 경우(2026-08: 1일이 토요일)와 딱 네 주인 경우(2026-02: 1일이 일요일).
  fx.db.transactions.push(expense("wk-1", "2026-08-01", 3000), expense("wk-2", "2026-08-31", 4000), expense("wk-3", "2026-08-15", 9000), { ...expense("wk-4", "2026-08-15", 777000), type: "income" });
  const aug = weeklyCells((await home(fx, "2026-08", "&trend=weekly")).html);
  eq(aug.map((c) => c.range).join(","), "1일,2~8일,9~15일,16~22일,23~29일,30~31일", `8월은 여섯 주, 첫 주는 하루 (${aug.map((c) => c.range).join(",")})`);
  eq(aug.map((c) => c.amount).join(","), "3천,·,9천,·,·,4천", `수입은 더하지 않는다 (${aug.map((c) => c.amount).join(",")})`);
  const feb = weeklyCells((await home(fx, "2026-02", "&trend=weekly")).html);
  eq(feb.map((c) => c.range).join(","), "1~7일,8~14일,15~21일,22~28일", "2월은 네 주(모두 온전한 주)");

  // 함수 단위: 달 밖 날짜·깨진 날짜·수입은 건너뛰고, 달을 못 읽으면 이번 달로 그린다.
  const analysis = await import("../src/modules/my/analysis-page.js");
  const renderWeeklyTrend = analysis.renderWeeklyTrend || (() => "");
  eq(typeof analysis.renderWeeklyTrend, "function", "renderWeeklyTrend 가 있다");
  const unit = weeklyCells(renderWeeklyTrend([
    { type: "expense", transaction_date: "2026-07-05", amount: 1000 }, { type: "expense", transaction_date: "2026-06-30", amount: 5000 },
    { type: "expense", transaction_date: "2026-08-01", amount: 5000 }, { type: "expense", transaction_date: "2026-07-xx", amount: 5000 },
    { type: "income", transaction_date: "2026-07-05", amount: 5000 }, { type: "expense", transaction_date: "", amount: 5000 },
  ], "2026-07"));
  eq(unit.map((c) => c.amount).join(","), "·,1천,·,·,·", `달 밖·깨진 날짜·수입은 더하지 않는다 (${unit.map((c) => c.amount).join(",")})`);
  ok(renderWeeklyTrend([], "not-a-month").includes("주별 지출"), "달을 못 읽어도 깨지지 않는다");

  // 요일별 추이는 종합 리포트에 그대로 있다.
  const report = await page(fx, `/my/analysis?month=2026-07&${hh}&view=report`);
  eq((report.html.match(/<div class="weekdayCell[^"]*"/g) || []).length, 7, "종합 리포트의 요일별 추이는 그대로 일곱 칸이다");
})));

// ─────────────────────────────────────────────────────────────────────────────
// F-3 수정 폼의 제안 목록 (전체 화면 · 홈 상세 · 일별 시트)
// ─────────────────────────────────────────────────────────────────────────────
if (run("edit")) await scenario("edit", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const optionValues = (html, id) => [...((html.match(new RegExp(`<datalist id="${id}">([\\s\\S]*?)</datalist>`)) || [, ""])[1]).matchAll(/<option value="([^"]*)"><\/option>/g)].map((m) => decode(m[1]));
  const input = (html, name) => (html.match(new RegExp(`<input name="${name}"[^>]*>`)) || [""])[0];
  fx.db.transactions.find((row) => row.id === "tx-expense-2").category = "동네병원\"<b>";
  fx.db.transactions.find((row) => row.id === "tx-expense-2").payment_method = "동네카드";
  fx.db.transactions.push(expense("e-2nd", "2026-07-07", 5000, { category: "교통", payment_method: "현금" }));

  // 전체 화면
  const full = await page(fx, `/transactions/edit?id=tx-expense-2&${hh}`);
  eq(full.status, 200, "전체 수정 화면이 열린다");
  ok(/list="categoryList"/.test(input(full.html, "category")), "전체 화면의 분류 칸이 제안 목록을 가리킨다");
  ok(/list="paymentList"/.test(input(full.html, "payment_method")), "전체 화면의 결제수단 칸이 제안 목록을 가리킨다");
  eq((full.html.match(/<datalist id="categoryList">/g) || []).length, 1, "분류 목록 id 는 하나다");
  eq((full.html.match(/<datalist id="paymentList">/g) || []).length, 1, "결제수단 목록 id 는 하나다");
  const categories = optionValues(full.html, "categoryList");
  const payments = optionValues(full.html, "paymentList");
  ok(categories.includes("식비") && categories.includes("카페/간식"), "분류 제안에 기본 분류가 있다");
  ok(categories.includes("동네병원\"<b>"), "분류 제안에 이 기록의 현재 분류가 들어 있다(특수문자는 이스케이프)");
  ok(!full.html.includes("<option value=\"동네병원\"<b>\">"), "제안 값이 속성을 깨지 않는다");
  ok(payments.includes("국민카드") && payments.includes("현금") && payments.includes("동네카드"), "결제수단 제안에 기본 목록과 현재 값이 있다");
  eq(new Set(categories).size, categories.length, "분류 제안에 중복이 없다");

  // 홈 안의 조각: 홈이 이미 그린 목록을 가리키고, 조각에는 목록을 싣지 않는다(홈에 같은 id 가 겹치지 않게).
  const fragment = await page(fx, `/transactions/edit?id=tx-expense-2&${hh}&fragment=1`);
  ok(fragment.html.startsWith("<form"), "조각은 그대로 폼으로 시작한다");
  ok(/list="categoryList"/.test(input(fragment.html, "category")) && /list="paymentList"/.test(input(fragment.html, "payment_method")), "조각의 두 칸도 제안 목록을 가리킨다");
  ok(!fragment.html.includes("<datalist"), "조각에는 목록을 싣지 않는다(홈의 목록을 쓴다)");
  const homePage = await page(fx, `/app?month=2026-07&${hh}`);
  eq((homePage.html.match(/<datalist id="categoryList">/g) || []).length, 1, "홈에는 분류 목록이 하나 있다(조각이 가리킬 대상)");
  eq((homePage.html.match(/<datalist id="paymentList">/g) || []).length, 1, "홈에는 결제수단 목록이 하나 있다");
  ok(homePage.html.includes("data-ab-edit-src=\"/transactions/edit?"), "홈의 기록 카드가 조각을 지연 로드한다");
  ok(optionValues(homePage.html, "categoryList").includes("식비") && optionValues(homePage.html, "paymentList").includes("현금"), "홈 목록에 기본 값이 있다");

  // 충돌 안내 화면(수정 폼을 다시 그린다)
  const row = fx.db.transactions.find((r) => r.id === "tx-expense-1");
  const conflict = await post(fx, "/admin/update", {
    id: row.id, household_id: HH, month: "2026-07", return_to: `/app?month=2026-07&${hh}`, type: "expense", transaction_date: row.transaction_date, amount: "120000",
    category: row.category, memo: row.memo, payment_method: row.payment_method, user_id: row.user_id,
    orig_type: "expense", orig_transaction_date: row.transaction_date, orig_amount: "100000", orig_category: row.category, orig_memo: row.memo, orig_payment_method: row.payment_method, orig_user_id: row.user_id,
  });
  eq(conflict.status, 409, "다른 곳에서 먼저 바뀐 기록은 충돌 화면을 낸다");
  ok(/list="categoryList"/.test(input(conflict.text, "category")) && conflict.text.includes("<datalist id=\"categoryList\">") && conflict.text.includes("<datalist id=\"paymentList\">"), "충돌 화면의 수정 폼도 제안 목록을 가진다");

  // 일별 시트: 서버가 목록을 싣고, 클라이언트가 시트 안에 한 번만 만든다.
  const member = await fx.cookieFor("user-wifi");
  const apiAs = async (cookie) => (await app.fetch(new Request(`${BASE}/u/api/day-transactions?date=2026-07-07&${hh}`, { headers: { cookie, accept: "application/json" } }), fx.env, ctx)).json();
  const ownerDay = { categories: [], payments: [], ...(await apiAs(fx.cookie)) };
  ok(Array.isArray(ownerDay.categories) && ownerDay.categories.includes("식비") && ownerDay.categories.includes("동네병원\"<b>"), "일별 API 가 기본 분류와 그날 기록의 분류를 싣는다");
  ok(Array.isArray(ownerDay.payments) && ownerDay.payments.includes("국민카드") && ownerDay.payments.includes("동네카드"), "일별 API 가 기본 결제수단과 그날 기록의 결제수단을 싣는다");
  eq(new Set(ownerDay.categories).size, ownerDay.categories.length, "분류 목록에 중복이 없다");
  const memberDay = { categories: [], ...(await apiAs(member)) };
  ok(Array.isArray(memberDay.categories) && memberDay.categories.length > 10, "구성원(쓰기 가능)에게도 목록이 간다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "viewer";
  const viewerDay = await apiAs(member);
  eq(JSON.stringify([viewerDay.categories, viewerDay.payments]), "[[],[]]", "수정 폼을 쓸 수 없는 조회 전용에게는 목록을 보내지 않는다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "member";

  const source = readFileSync(new URL("../src/modules/client/v5-bundle-mains.js", import.meta.url), "utf8");
  const start = source.indexOf("function accountbookDayDetailClientMain() {");
  ok(start > 0, "일별 시트 클라이언트 함수가 있다");
  const dayMain = source.slice(start, source.indexOf("\n}\n", start) + 2);
  const sheet = async (fetchPayload) => {
    const document = { readyState: "complete", body: stubElement("body"), activeElement: null, createElement: (tag) => stubElement(tag), querySelector: () => null, listeners: Object.create(null), addEventListener(type, handler) { this.listeners[type] = handler; } };
    const context = vm.createContext({
      document, location: { search: "", pathname: "/app", hash: "" }, window: { history: {}, confirm: () => true }, URLSearchParams, AbortController, setTimeout, clearTimeout,
      fetch: async (url) => fetchPayload(url),
    });
    vm.runInContext(`(${dayMain})()`, context);
    const trigger = stubElement("a");
    trigger.setAttribute("data-ab-day", "2026-07-07"); trigger.setAttribute("data-ab-household-id", HH); trigger.setAttribute("href", "#");
    document.listeners.click({ target: { closest: () => trigger }, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {} });
    // ensure() 가 만든 시트(overlay)의 목록 칸을 찾는다. 기록이 그려질 때까지 기다린다.
    const overlay = document.body.children[0];
    await until(() => overlay.querySelector("[data-ab-day-list]").innerHTML.includes("abDayDetailItem"));
    return overlay.querySelector("[data-ab-day-list]").innerHTML;
  };
  const realFetch = async (url) => { const response = await app.fetch(new Request(`${BASE}${url}`, { headers: { cookie: fx.cookie, accept: "application/json" } }), fx.env, ctx); return { ok: response.ok, status: response.status, json: () => response.json() }; };
  const html = await sheet(realFetch);
  ok(/<input name="category" list="abDayCategoryList" value="/.test(html), "시트의 분류 칸이 목록을 가리킨다");
  ok(/<input name="payment_method" list="abDayPaymentList" value="/.test(html), "시트의 결제수단 칸이 목록을 가리킨다");
  eq((html.match(/<datalist id="abDayCategoryList">/g) || []).length, 1, "시트 분류 목록은 한 번만 만든다(기록이 여럿이어도)");
  eq((html.match(/<datalist id="abDayPaymentList">/g) || []).length, 1, "시트 결제수단 목록은 한 번만 만든다");
  ok(html.includes("<option value=\"카페/간식\"></option>") && html.includes("<option value=\"국민카드\"></option>"), "시트 목록에 기본 값이 있다");
  ok(html.includes("<option value=\"동네병원&quot;&lt;b&gt;\"></option>") && !html.includes("동네병원\"<b>"), "시트 목록 값은 이스케이프된다");
  const oldServer = await sheet(async (url) => { const response = await realFetch(url); const json = await response.json(); delete json.categories; delete json.payments; return { ok: true, status: 200, json: async () => json }; });
  ok(!oldServer.includes("list=\"abDay") && !oldServer.includes("<datalist"), "목록이 없는 응답이면 예전처럼 목록 없이 그린다(깨지지 않는다)");
  ok(oldServer.includes("name=\"category\""), "목록이 없어도 수정 칸은 그려진다");
})));

// ─────────────────────────────────────────────────────────────────────────────
// F-6 구성원이 누를 수 없는 링크와 403 안내
// ─────────────────────────────────────────────────────────────────────────────
if (run("member")) await scenario("member", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const member = await fx.cookieFor("user-wifi");
  const get = (path, cookie) => page(fx, path, { cookie });
  const settingsLinks = (html) => [...html.matchAll(/href="(\/my\/settings[^"]*)"/g)].map((m) => m[1]);
  const adminTagged = (html, key) => new RegExp(`<a data-key="${key}" class="[^"]*abNavAdminOnly`).test(html);
  const q = `month=2026-07&${hh}`;

  // 소비 분석(머리말)
  const ownerInsight = await get(`/my/analysis?${q}`, fx.cookie);
  const memberInsight = await get(`/my/analysis?${q}`, member);
  ok(ownerInsight.html.includes(`<a href="/my/settings?`) && ownerInsight.html.includes(">예산 설정</a>"), "소유자의 소비 분석 머리말에는 ‘예산 설정’이 있다");
  eq(memberInsight.status, 200, "구성원의 소비 분석이 열린다");
  eq(settingsLinks(memberInsight.html).length, 0, `구성원의 소비 분석에는 /my/settings 링크가 없다 (${settingsLinks(memberInsight.html).join(" ")})`);
  ok(/<a href="\/budgets\?[^"]*">예산 보기<\/a>/.test(memberInsight.html), "대신 볼 수 있는 예산 화면으로 잇는다");
  // 예산 화면
  const ownerBudgets = await get(`/budgets?${q}`, fx.cookie);
  const memberBudgets = await get(`/budgets?${q}`, member);
  eq(memberBudgets.status, 200, "구성원은 예산 화면을 볼 수 있다");
  eq(settingsLinks(memberBudgets.html).length, 0, `구성원의 예산 화면에 /my/settings 링크가 없다 (${settingsLinks(memberBudgets.html).join(" ")})`);
  const tabsOf = (html) => (html.match(/<nav class="abMoneyPlanTabs[^"]*"[\s\S]*?<\/nav>/) || [""])[0];
  eq((tabsOf(memberBudgets.html).match(/<a /g) || []).length, 2, "구성원의 예산·정기 탭은 둘이다");
  ok(tabsOf(memberBudgets.html).includes("isTwo"), "두 칸 배치 표식이 붙는다");
  eq((tabsOf(ownerBudgets.html).match(/<a /g) || []).length, 3, "소유자의 탭은 셋이다");
  ok(settingsLinks(ownerBudgets.html).length >= 1 && tabsOf(ownerBudgets.html).includes("/my/settings?"), "소유자의 예산 화면에는 설정 링크가 그대로 있다");
  ok(adminTagged(memberBudgets.html, "members") && adminTagged(memberBudgets.html, "groups"), "구성원의 예산 화면 내비는 참여자·단톡방에 ‘관리자 전용’을 붙인다");
  ok(!adminTagged(ownerBudgets.html, "members"), "소유자 내비에는 붙지 않는다");
  // 정기 수입·지출
  const memberReserve = await get(`/reserve-plans?${q}`, member);
  eq(memberReserve.status, 200, "구성원은 정기 수입·지출을 볼 수 있다");
  eq(settingsLinks(memberReserve.html).length, 0, "구성원의 정기 수입·지출 화면에 /my/settings 링크가 없다");
  eq((tabsOf(memberReserve.html).match(/<a /g) || []).length, 2, "정기 수입·지출의 탭도 둘이다");
  ok(adminTagged(memberReserve.html, "members"), "정기 수입·지출 내비도 ‘관리자 전용’을 붙인다");
  // 가계부 전환·옵션
  const grid = (html) => (html.match(/<div class="optionGrid">([\s\S]*?)<\/div>/) || [, ""])[1];
  const ownerHouseholds = await get(`/my/households?${hh}&month=2026-07`, fx.cookie);
  const memberHouseholds = await get(`/my/households?${hh}&month=2026-07`, member);
  ok(grid(ownerHouseholds.html).includes("/my/members?") && grid(ownerHouseholds.html).includes("/my/settings?") && grid(ownerHouseholds.html).includes("/my/groups?"), "소유자의 가계부 옵션에는 참여자·수입예산·단톡방이 있다");
  const memberGrid = grid(memberHouseholds.html);
  ok(memberGrid.length > 0, "구성원의 가계부 옵션 칸이 그려진다");
  ok(!memberGrid.includes("/my/members?") && !memberGrid.includes("/my/settings?") && !memberGrid.includes("/my/groups?"), "구성원의 가계부 옵션에는 403 이 나는 링크가 없다");
  ok(memberGrid.includes("/budgets?") && memberGrid.includes("/my/backup?") && memberGrid.includes("/app?"), "구성원에게는 열 수 있는 옵션만 남는다");
  ok(adminTagged(memberHouseholds.html, "members") && !adminTagged(ownerHouseholds.html, "members"), "가계부 전환·옵션 화면의 내비도 구성원에게만 ‘관리자 전용’을 붙인다");

  // 403 안내: 화면마다 자기 이야기를 한다.
  const settings403 = await get(`/my/settings?${q}`, member);
  eq(settings403.status, 403, "구성원의 /my/settings 는 403");
  const settingsText = text(settings403.html);
  ok(settingsText.includes("예산") && settingsText.includes("정기지출") && settingsText.includes("소유자 또는 관리자"), "수입·예산 화면의 403 안내는 예산·정기지출 이야기를 한다");
  ok(!settingsText.includes("참여자·초대 및 단톡방 연결 정보"), "다른 화면(참여자·단톡방) 이야기를 하지 않는다");
  ok(/<a class="btn" href="\/budgets\?month=2026-07&amp;household_id=house-home">예산 현황 보기<\/a>/.test(settings403.html), "지금 열 수 있는 예산 현황으로 가는 단추가 있다");
  const members403 = await get(`/my/members?${q}`, member);
  eq(members403.status, 403, "구성원의 /my/members 는 403");
  ok(text(members403.html).includes("참여자 목록과 초대코드") && !text(members403.html).includes("예산 현황 보기"), "참여자 화면의 403 안내는 참여자·초대 이야기를 한다");
  const groups403 = await get(`/my/groups?${q}`, member);
  eq(groups403.status, 403, "구성원의 /my/groups 는 403");
  ok(text(groups403.html).includes("단톡방 연결은 소유자 또는 관리자만") && !text(groups403.html).includes("참여자 목록과 초대코드"), "단톡방 화면의 403 안내는 단톡방 이야기를 한다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "viewer";
  const viewer403 = await get(`/my/settings?${q}`, member);
  eq(viewer403.status, 403, "조회 전용의 /my/settings 는 403");
  ok(text(viewer403.html).includes("관리자 권한이 필요한 화면") && text(viewer403.html).includes("예산 현황 보기"), "조회 전용도 같은 안내와 예산 현황 단추를 본다");
  const viewerInsight = await get(`/my/analysis?${q}`, member);
  ok(/>예산 보기<\/a>/.test(viewerInsight.html) && settingsLinks(viewerInsight.html).length === 0, "조회 전용의 소비 분석에도 403 링크가 없다");

  // 함수 단위: 이름 없는 안내(기본), 기록 권한 안내, 승인 대기는 그대로.
  const access = await import("../src/modules/my/access-control.js");
  const env = fx.env;
  const generic = text(access.renderMyAccessStatusHtml({ env, household: { id: HH, name: "우리집" }, role: "member", month: "2026-07", manageOnly: true }));
  ok(generic.includes("이 화면은 소유자 또는 관리자만 열 수 있습니다") && !generic.includes("참여자·초대 및 단톡방"), "화면 이름이 없으면 일반 안내를 한다");
  const pending = text(access.renderMyAccessStatusHtml({ env, household: { id: HH }, role: "pending", month: "2026-07", manageOnly: true, screen: "settings" }));
  ok(pending.includes("참여 승인 대기 중") && !pending.includes("예산 현황 보기"), "승인 대기는 예전 안내 그대로다");
})));

// ─────────────────────────────────────────────────────────────────────────────
// F-7 검색 결과 → 홈 기록 이동·강조
// ─────────────────────────────────────────────────────────────────────────────
if (run("search")) await scenario("search", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const asset = await (await app.fetch(new Request(`${BASE}/assets/accountbook-search-v22979.js`), fx.env, ctx)).text();
  const bundlePath = ((await page(fx, `/app?month=2026-07&${hh}`)).html.match(/\/assets\/accountbook-v5-v\d+\.js/) || [""])[0];
  const bundle = await (await app.fetch(new Request(`${BASE}${bundlePath}`), fx.env, ctx)).text();
  ok(asset.includes(".v8-tx") && bundle.includes(".txRow,.txItem,.timelineItem,.v8-tx"), "검색 스크립트(단독 자산·묶음 자산) 모두 홈 기록 카드(.v8-tx)를 찾는다");

  // 실제 검색 결과의 링크가 닿는 홈 화면을 그려서, 거기 있는 기록 카드를 가짜 문서에 올린다.
  const browser = (search, nodes, readyState = "complete") => {
    const windowListeners = [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const overlay = stubElement("div");
    const input = stubElement("input");
    const results = stubElement("div");
    const timers = [];
    const document = {
      body: stubElement("body"), activeElement: null, readyState,
      getElementById: (id) => (id === "abV5Search" ? overlay : id === "abV5SearchInput" ? input : id === "abV5SearchResults" ? results : byId.get(id) || null),
      querySelectorAll: (selector) => nodes.filter((node) => selector.split(",").some((part) => node.classes.has(part.trim().replace(/^\./, "")))),
      querySelector: () => null, createElement: (tag) => stubElement(tag), addEventListener() {},
    };
    const context = vm.createContext({
      document, location: { search, pathname: "/app" }, URLSearchParams, window: { addEventListener: (type, handler) => windowListeners.push({ type, handler }) },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      fetch: async (url) => { const response = await app.fetch(new Request(`${BASE}${url}`, { headers: { cookie: fx.cookie, accept: "application/json" } }), fx.env, ctx); return { ok: response.ok, status: response.status, json: () => response.json() }; },
    });
    vm.runInContext(asset, context);
    return { overlay, input, results, timers, context, windowListeners };
  };
  const cardsOf = (html) => [...html.matchAll(/<article class="v8-tx" id="(tx-[^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => {
    const node = stubElement("article");
    node.id = m[1]; node.classes = new Set(["v8-tx"]); node.textContent = decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    return node;
  });

  // 검색을 실제로 돌려 결과 링크를 얻는다.
  const searcher = browser(`?${hh}`, []);
  searcher.input.value = "장보기";
  searcher.input.listeners.input();
  searcher.timers.at(-1).fn();
  await until(() => searcher.results.children.some((child) => child.className === "abV5SearchRow"));
  const row = searcher.results.children.find((child) => child.className === "abV5SearchRow");
  ok(!!row, "검색 결과 행이 만들어진다");
  const href = row?.children?.[0]?.href || "";
  ok(href.startsWith("/app?month=2026-07") && href.includes("&date=2026-07-04") && href.includes("&abid=tx-expense-1") && href.includes("&feed=all") && href.endsWith("#feed"), `검색 결과 링크가 기록 번호와 전체 보기를 담는다 (${href})`);

  // 그 링크로 간 홈 화면에 그 기록 카드가 있고, 스크립트가 그 카드로 이동·강조한다.
  const landing = await page(fx, href.replace(/#feed$/, ""));
  eq(landing.status, 200, "검색 링크가 가리키는 홈이 열린다");
  const cards = cardsOf(landing.html);
  ok(cards.some((card) => card.id === "tx-tx-expense-1"), "그 홈 화면에 기록 카드(.v8-tx)가 있다");
  const search = href.slice(href.indexOf("?"), href.indexOf("#"));
  const landed = browser(search, cards);
  const target = cards.find((card) => card.id === "tx-tx-expense-1");
  ok(target.calls.some(([name]) => name === "scrollIntoView"), "기록 카드로 스크롤한다");
  ok(target.classList.added.includes("abV5Focus"), "기록 카드를 강조한다");
  eq(cards.filter((card) => card !== target && card.classList.added.length).length, 0, "다른 카드는 강조하지 않는다");

  // 번호가 없는 옛 링크(메모·금액만)도 .v8-tx 카드를 찾는다. 같은 메모·금액이 둘이어도 번호가 있으면 정확한 카드로 간다.
  const twin = stubElement("article"); twin.id = "tx-twin"; twin.classes = new Set(["v8-tx"]); twin.textContent = target.textContent;
  const legacyCards = cardsOf(landing.html);
  const legacyTarget = legacyCards.find((card) => card.id === "tx-tx-expense-1");
  browser("?month=2026-07&abfm=" + encodeURIComponent("주말 장보기") + "&abfa=148000", legacyCards);
  ok(legacyTarget.classList.added.includes("abV5Focus"), "번호 없는 옛 링크(메모·금액)로도 기록 카드를 찾는다");
  const exactFirst = [twin, ...cardsOf(landing.html)];
  const exactTarget = exactFirst.find((card) => card.id === "tx-tx-expense-1");
  browser("?abid=tx-expense-1&abfm=" + encodeURIComponent("주말 장보기") + "&abfa=148000", exactFirst);
  ok(exactTarget.classList.added.includes("abV5Focus") && !twin.classList.added.length, "같은 메모·금액이 먼저 있어도 기록 번호가 맞는 카드로 간다");
  const none = cardsOf(landing.html);
  browser("?abfm=" + encodeURIComponent("없는 메모") + "&abfa=1", none);
  ok(none.every((card) => !card.classList.added.length), "맞는 기록이 없으면 아무것도 강조하지 않는다");
  // 화면 구성이 끝나기 전에 돌면(readyState 가 complete 가 아니면) 줄이 밀리므로 load 뒤 한 번 더 가운데로 맞춘다.
  const early = cardsOf(landing.html);
  const earlyTarget = early.find((card) => card.id === "tx-tx-expense-1");
  const earlyBrowser = browser(search, early, "loading");
  const reveals = () => earlyTarget.calls.filter(([name]) => name === "scrollIntoView").length;
  eq(reveals(), 1, "화면이 아직 그려지는 중이어도 먼저 한 번 이동한다");
  const onLoad = earlyBrowser.windowListeners.find((entry) => entry.type === "load");
  ok(!!onLoad, "그려지는 중이면 load 뒤에 다시 맞추도록 걸어 둔다");
  if (onLoad) { onLoad.handler(); earlyBrowser.timers.filter((timer) => timer.ms === 80).forEach((timer) => timer.fn()); }
  eq(reveals(), 2, "load 뒤에 한 번 더 가운데로 맞춘다");
  const doneBrowser = browser(search, cardsOf(landing.html), "complete");
  ok(!doneBrowser.windowListeners.some((entry) => entry.type === "load"), "이미 다 그려졌으면 load 를 기다리지 않는다");

  // 그날 기록이 열 건을 넘어도 링크가 전체 보기라 그 기록이 화면에 있다.
  const base = fx.db.transactions.find((r) => r.id === "tx-expense-1");
  for (let index = 0; index < 14; index += 1) fx.db.transactions.push({ ...base, id: `s7-${index}`, memo: `같은날 ${index}`, amount: 1000 + index, user_id: "user-bin" });
  const crowded = await page(fx, `/app?month=2026-07&${hh}&date=2026-07-04&abid=tx-expense-1&feed=all`);
  const crowdedDefault = await page(fx, `/app?month=2026-07&${hh}&date=2026-07-04`);
  ok(cardsOf(crowded.html).some((card) => card.id === "tx-tx-expense-1"), "그날 기록이 많아도 전체 보기에서는 검색한 기록이 있다");
  ok(cardsOf(crowded.html).length >= 15 && cardsOf(crowdedDefault.html).length === 10, "기본 보기는 열 건에서 잘리고 전체 보기는 모두 보인다");
})));

// ─────────────────────────────────────────────────────────────────────────────
// F-9 가입 오류 뒤 입력할 폼
// ─────────────────────────────────────────────────────────────────────────────
if (run("signup")) await scenario("signup", () => fixture(async (fx) => {
  const signup = (values) => post(fx, "/my/local-signup", values, { cookie: "" });
  const card = (html) => (html.match(/<details class="card signupCard" id="signup-start"[\s\S]*?<\/details>/) || [""])[0];
  const intro = (html) => (html.match(/<div class="authIntroHead">[\s\S]*?<div class="loginMethods">/) || [""])[0];
  const jump = (html) => (html.match(/<script id="authErrorJumpRuntime">([\s\S]*?)<\/script>/) || [, ""])[1];
  const typed = { login_name: "새가족", display_name: "엄마", invite_code: "ab12cd", access_code: "short", access_code_confirm: "short" };

  const bad = await signup(typed);
  eq(bad.status, 400, "짧은 비밀번호는 400 으로 폼을 다시 그린다");
  const signupCard = card(bad.text);
  ok(signupCard.includes("<div class=\"error\">새 비밀번호는 8자리 이상 입력하세요.</div>"), "오류 문구가 가입 카드 안에 있다");
  ok(signupCard.indexOf("class=\"error\"") < signupCard.indexOf("<form method=\"post\" action=\"/my/local-signup\">"), "오류 문구가 가입 폼 바로 위에 있다");
  ok(!intro(bad.text).includes("class=\"error\""), "가입 오류를 ‘기존 계정 로그인’ 소개 영역에 두지 않는다");
  ok(bad.text.includes("class=\"authErrorSummary\" href=\"#signupName\""), "맨 위 오류 요약 링크는 그대로 있다(스크립트 없이도 칸으로 간다)");
  ok(signupCard.includes("value=\"새가족\"") && signupCard.includes("value=\"엄마\"") && signupCard.includes("value=\"AB12CD\""), "적은 이름·표시 이름·초대 코드는 그대로 남는다(V22.9.76)");
  ok(!bad.text.includes("access_code\" value") && !/type="password"[^>]*value=/.test(bad.text), "비밀번호 칸은 비어 있다");
  const script = jump(bad.text);
  ok(script.includes("[\"signupName\",\"signupDisplay\",\"signupPassword\",\"signupPasswordConfirm\"]"), "점프 스크립트가 가입 칸 순서를 안다");

  // 서버 오류(5xx)로 실패해도 같다.
  const restore = intercept(({ url, method }) => (method === "POST" && url.pathname.endsWith("/rpc/accountbook_create_local_user_v227") ? failure(503) : null));
  const down = await signup({ ...typed, login_name: "서버오류가족", access_code: "long-enough-pass", access_code_confirm: "long-enough-pass" });
  restore();
  ok(down.status >= 500, `서버 오류는 5xx 로 답한다 (${down.status})`);
  ok(card(down.text).includes("class=\"error\"") && !intro(down.text).includes("class=\"error\"") && jump(down.text).includes("signupPassword"), "서버 오류 뒤에도 오류는 가입 카드 안, 점프 스크립트가 있다");
  ok(card(down.text).includes("value=\"서버오류가족\"") && card(down.text).includes("value=\"엄마\""), "서버 오류 뒤에도 이름 칸이 남는다");

  // 로그인 오류는 소개 영역에 그대로 두고 로그인 칸으로 보낸다. 오류가 없는 처음 화면에는 스크립트가 없다.
  const login = await post(fx, "/my/local-login", { login_name: "없는사람", access_code: "wrong-pass-123" }, { cookie: "" });
  ok(login.status >= 400, `틀린 로그인은 오류다 (${login.status})`);
  ok(intro(login.text).includes("class=\"error\"") && !card(login.text).includes("class=\"error\""), "로그인 오류는 소개 영역에 그대로 있다");
  ok(jump(login.text).includes("[\"loginName\",\"loginPassword\"]"), "로그인 오류는 로그인 칸으로 보낸다");
  const plain = await page(fx, "/my", { cookie: "" });
  ok(!plain.html.includes("authErrorJumpRuntime"), "오류가 없는 처음 화면에는 점프 스크립트가 없다");

  // 스크립트: 채워진 이름 칸은 건너뛰고 첫 빈 칸(비밀번호)으로 스크롤·초점. 접힌 패널은 연다.
  const panel = stubElement("details"); panel.tagName = "DETAILS"; panel.open = false;
  const field = (id, value) => { const el = stubElement("input"); el.id = id; el.value = value; el.parentElement = panel; return el; };
  const fields = new Map([["signupName", field("signupName", "새가족")], ["signupDisplay", field("signupDisplay", "엄마")], ["signupPassword", field("signupPassword", "")], ["signupPasswordConfirm", field("signupPasswordConfirm", "")]]);
  vm.runInContext(script, vm.createContext({ document: { getElementById: (id) => fields.get(id) || null } }));
  ok(fields.get("signupPassword").calls.some(([name]) => name === "scrollIntoView") && fields.get("signupPassword").calls.some(([name]) => name === "focus"), "첫 빈 칸(비밀번호)으로 스크롤하고 초점을 준다");
  ok(!fields.get("signupName").calls.length && !fields.get("signupDisplay").calls.length, "채워진 이름 칸은 건너뛴다");
  eq(panel.open, true, "접혀 있던 패널을 연다");
  const allFilled = new Map([["a", field("a", "x")], ["b", field("b", "y")]]);
  vm.runInContext(script.replace(/\)\(\[[^\]]*\]\);?\s*$/, ')(["a","b"]);'), vm.createContext({ document: { getElementById: (id) => allFilled.get(id) || null } }));
  ok(allFilled.get("a").calls.some(([name]) => name === "focus"), "모두 채워져 있으면 첫 칸으로 간다");
}));

if (failed.length) {
  console.error(`FAIL: V22.9.79 웹 화면 결함 검사 — ${failed.length} 항목 실패 (확인 ${checks}개 중)`);
  for (const message of failed) console.error(` - ${message}`);
  process.exit(1);
}
console.log(`V22.9.79 웹 화면 결함 검사 통과 (${checks} checks)`);
