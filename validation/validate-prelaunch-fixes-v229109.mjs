// V22.9.109 출시 전 결함 수정(Gemini 핵심 앱 검토 대조 V108:G-1·G-2(a)·G-4·G-7) 검사.
//  1. 카드 사용액 매칭(computeCardUsageMap): 이름 일치 > 이름 포함 > 발급사 순, 같은 단계는 긴 이름, 동률은 목록 앞 카드(G-4)
//  2. 상단 통합 검색(/u/api/tx/search)이 홈·기록 탭 필터와 같은 낱말 규칙(낱말 AND·금액 완전 일치·지출자 이름)을 쓴다(G-1·G-7)
//  3. 메뉴 설명 ‘한 줄·여러 줄 입력 예시’ 낡은 문구 제거(G-2(a))
// 판 이름 글자는 적지 않는다(‘판 번호 정본’ 검사). 오프라인: 픽스처 + app.fetch, DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";
import { computeCardUsageMap } from "../src/modules/features/payment-methods-page.js";
import { filterNeedleTokens, filterRowMatchesToken } from "../src/modules/domain/transactions-core.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.109 출시 전 결함 수정(카드 매칭 우선순위·상단 검색 낱말 규칙·메뉴 문구) 검사 통과");
// 객체·배열은 JSON 으로 비교한다(counter 의 eq 는 strictEqual).
const deq = (actual, expected, label) => eq(JSON.stringify(actual), JSON.stringify(expected), label);

// ── 1. 카드 매칭 우선순위(G-4) ────────────────────────────────────────────────
const card = (id, name, issuer, kind = "credit_card") => ({ id, kind, name, issuer });
const deep = card("deep", "신한카드 Deep Dream", "신한카드");
const life = card("life", "신한카드 Mr.Life", "신한카드");
const kbShort = card("kb-short", "국민카드", "국민카드");
const kbLong = card("kb-long", "국민카드 톡톡", "국민카드");
const savings = { id: "sav", kind: "savings", name: "신한카드 적금", issuer: "신한카드" };
const row = (payment_method, amount = 1000, type = "expense") => ({ type, amount, payment_method });
const counts = (cards, rows) => Object.fromEntries(Object.entries(computeCardUsageMap(cards, rows)).map(([id, u]) => [id, u.count]));

deq(counts([deep, life], [row("신한카드 Mr.Life")]), { deep: 0, life: 1 }, "이름으로 정확히 맞은 카드가 발급사로만 맞은 더 긴 이름의 카드를 이긴다");
deq(counts([life, deep], [row("신한카드 Mr.Life")]), { life: 1, deep: 0 }, "목록 순서를 바꿔도 이름 일치가 이긴다");
deq(counts([deep, life], [row("신한카드 Deep Dream 할부")]), { deep: 1, life: 0 }, "이름 포함이 발급사 일치를 이긴다");
deq(counts([life, deep], [row("신한카드 Deep Dream 할부")]), { life: 0, deep: 1 }, "이름 포함 우선은 목록 순서와 무관하다");
deq(counts([deep, life], [row("신한카드")]), { deep: 1, life: 0 }, "발급사로만 맞아 동률이면 목록 앞 카드가 가져간다");
deq(counts([life, deep], [row("신한카드")]), { life: 1, deep: 0 }, "동률의 목록 앞 카드는 순서를 바꾸면 바뀐다(예전 규칙은 긴 이름·뒤 카드)");
deq(counts([kbShort, kbLong], [row("국민카드 톡톡 결제")]), { "kb-short": 0, "kb-long": 1 }, "같은 단계(이름 포함)에서는 더 긴 이름이 이긴다");
deq(counts([kbLong, kbShort], [row("국민카드 톡톡 결제")]), { "kb-long": 1, "kb-short": 0 }, "같은 단계의 긴 이름 우선은 순서와 무관하다");
deq(counts([kbShort, kbLong], [row("국민카드")]), { "kb-short": 1, "kb-long": 0 }, "이름 일치(국민카드)가 발급사 일치(국민카드 톡톡)를 이긴다");
deq(counts([deep, life], [row("신한")]), { deep: 0, life: 0 }, "발급사 일치는 ‘카드’ 낱말이 있어야 한다");
deq(counts([deep, life], [row("국민카드 5000")]), { deep: 0, life: 0 }, "다른 발급사는 어디에도 안 맞는다");
deq(counts([deep, life], [row("신한카드 Mr.Life", 5000, "income")]), { deep: 0, life: 0 }, "수입 행은 세지 않는다");
deq(counts([deep, life], [row("", 5000)]), { deep: 0, life: 0 }, "결제수단이 비면 세지 않는다");
deq(counts([deep, savings], [row("신한카드 적금")]), { deep: 1 }, "카드가 아닌 자산(예금·적금)은 표에 없고 카드 쪽 발급사 일치로 간다");
deq(counts([deep, life], [row("신한카드 MR.LIFE")]), { deep: 1, life: 0 }, "대소문자가 다르면 이름 일치가 아니다(normalizeText 는 소문자화하지 않음, 기존 동작) → 발급사 동률이라 목록 앞 카드");
deq(counts([deep, life], [row("신한카드 Mr.Life"), row("신한카드 Deep Dream"), row("신한카드")]), { deep: 2, life: 1 }, "한 달 기록이 섞여 있어도 카드마다 제 몫으로 간다");
deq(computeCardUsageMap([deep, life], [row("신한카드 Mr.Life", 3000), row("신한카드 Mr.Life", 4000), row("신한카드", 1000)]), { deep: { count: 1, amount: 1000 }, life: { count: 2, amount: 7000 } }, "건수·금액이 카드별로 모인다");
deq(computeCardUsageMap([], [row("신한카드")]), {}, "카드가 없으면 빈 표");
const pmSrc = read("src/modules/features/payment-methods-page.js");
ok(!pmSrc.includes("bestLen =") && !pmSrc.includes("let bestLen"), "예전 ‘이름 길이만 비교’ 규칙(bestLen 변수)이 코드에 없다(주석의 설명 글자는 제외)");
ok(pmSrc.includes("function cardUsageMatchScore(") && pmSrc.includes("if (score > bestScore)"), "단계 점수 + 동률은 앞 카드(엄격 비교)");

// ── 2. 상단 통합 검색 = 홈 필터 낱말 규칙(G-1·G-7) ────────────────────────────
deq(filterNeedleTokens("  검사점심   12000 "), ["검사점심", "12000"], "낱말은 띄어쓰기로 나누고 양끝 공백은 뺀다");
deq(filterNeedleTokens("A B"), ["a", "b"], "낱말은 소문자");
eq(filterNeedleTokens("1 2 3 4 5 6 7 8 9 10").length, 8, "낱말은 최대 8개");
deq(filterNeedleTokens(""), [], "빈 검색어는 낱말 없음");
deq(filterNeedleTokens("점심s택시"), ["점심s택시"], "글자 s 는 구분자가 아니다(정규식 이스케이프 회귀)");
ok(filterRowMatchesToken({ memo: "점심", amount: 12000 }, "12000"), "숫자 낱말은 금액 완전 일치");
ok(!filterRowMatchesToken({ memo: "회식", amount: 112000 }, "12000"), "금액 부분 일치는 안 된다(112,000원 ≠ 12000)");
ok(filterRowMatchesToken({ memo: "커피", amount: 4500 }, "4,500") && filterRowMatchesToken({ memo: "커피", amount: 4500 }, "4500원"), "‘4,500’·‘4500원’ 도 금액 4,500 에 맞는다");
ok(!filterRowMatchesToken({ memo: "커피", amount: 4500 }, "d"), "숫자가 아닌 낱말은 금액에 대지 않는다(정규식 이스케이프 회귀)");
ok(filterRowMatchesToken({ memo: "택시", amount: 8000, spender_name: "WIFI♥" }, "wifi"), "지출자 이름에도 맞는다(소문자)");
ok(!filterRowMatchesToken({ memo: "택시", amount: 8000 }, "커피"), "없는 낱말은 안 맞는다");
const apiSrc = read("src/modules/api/user-api.js");
ok(!apiSrc.includes("q.replace(/[^0-9]/g, \"\")"), "상단 검색에 ‘숫자 이어 붙이기 OR’ 가 없다(G-7)");
ok(apiSrc.includes("filterNeedleTokens(q)") && apiSrc.includes("filterRowMatchesToken(t, token)"), "상단 검색이 공유 낱말 규칙을 쓴다");
eq(read("src/modules/my/mobile-home.js").split("function filterNeedleTokens").length - 1, 0, "홈 필터에는 낱말 규칙 정의가 따로 없다");
const coreSrc = read("src/modules/domain/transactions-core.js");
eq(coreSrc.split("function filterNeedleTokens").length - 1, 1, "낱말 규칙 정의는 transactions-core 한 곳");
ok(coreSrc.includes("split(/\\s+/)") && coreSrc.includes("/^\\d+$/.test(digits)"), "낱말 규칙의 정규식 이스케이프가 맞다");

await withClock("2026-07-15", () => fixture(async (fx) => {
  const db = fx.db;
  const base = { household_id: "house-home", type: "expense", category: "식비", payment_method: "국민카드", source: "my_web", raw_text: "", created_at: "2026-03-10T03:00:00.000Z" };
  db.transactions.push(
    { ...base, id: "tx-s-lunch", user_id: "user-bin", transaction_date: "2026-03-10", amount: 12000, memo: "검사점심" },
    { ...base, id: "tx-s-dinner", user_id: "user-wifi", transaction_date: "2026-03-11", amount: 112000, memo: "검사회식" },
    { ...base, id: "tx-s-coffee", user_id: "user-bin", transaction_date: "2026-03-12", amount: 4500, memo: "검사커피 라떼" },
    { ...base, id: "tx-s-taxi", user_id: "user-wifi", transaction_date: "2026-03-12", amount: 8000, memo: "검사택시", payment_method: "신한카드" },
  );
  const search = async (q, cookie = fx.cookie) => {
    const res = await app.fetch(new Request(`${BASE}/u/api/tx/search?q=${encodeURIComponent(q)}&household=house-home`, { headers: { ...(cookie ? { cookie } : {}), accept: "application/json" } }), fx.env, ctx);
    return { status: res.status, json: await res.json() };
  };
  const ids = (r) => r.json.results.map((x) => x.id).filter((id) => id.startsWith("tx-s-")).sort();
  let r = await search("검사점심 12000");
  eq(r.status, 200, "검색 200");
  deq(ids(r), ["tx-s-lunch"], "‘검사점심 12000’ 은 두 낱말이 모두 맞는 기록만(예전 숫자 OR 이면 112,000원 회식도 나왔다)");
  eq(r.json.count_is_total, true, "50건 미만이면 count_is_total");
  r = await search("12000");
  ok(ids(r).includes("tx-s-lunch") && !ids(r).includes("tx-s-dinner"), "‘12000’ 은 금액 12,000원만(112,000원 제외)");
  ok(r.json.results.every((x) => x.amount === 12000 || `${x.memo} ${x.category} ${x.payment_method}`.toLowerCase().includes("12000")), "숫자 낱말 결과는 모두 금액 일치이거나 글자에 그 숫자가 있다");
  r = await search("112000");
  deq(ids(r), ["tx-s-dinner"], "‘112000’ 은 112,000원 기록만");
  r = await search("검사커피 4500 검사택시 8000");
  deq(ids(r), [], "낱말 넷이 한 기록에 다 맞을 수 없으면 0건(예전엔 ‘45008000’ 으로 아무것도 못 찾았고 지금은 규칙대로 0건)");
  r = await search("라떼 검사커피");
  deq(ids(r), ["tx-s-coffee"], "낱말 순서는 상관없다");
  r = await search("4,500");
  ok(ids(r).includes("tx-s-coffee") && r.json.results.every((x) => x.amount === 4500 || `${x.memo}`.includes("4,500")), "‘4,500’ 은 금액 4,500원");
  r = await search("4500원");
  ok(ids(r).includes("tx-s-coffee"), "‘4500원’ 도 금액 4,500원");
  r = await search("검사택시 wifi");
  deq(ids(r), ["tx-s-taxi"], "지출자 이름 낱말(WIFI♥ 의 wifi)도 맞는다");
  r = await search("검사점심 wifi");
  deq(ids(r), [], "지출자가 다르면 0건");
  r = await search("검사");
  deq(ids(r), ["tx-s-coffee", "tx-s-dinner", "tx-s-lunch", "tx-s-taxi"], "한 낱말 부분 일치는 넷 다");
  r = await search("   ");
  eq(r.json.count, 0, "공백만이면 0건");
  r = await search("검사점심", "");
  eq(r.status, 401, "로그인 없으면 401");

  // ── 3. 메뉴 문구(G-2(a)) ───────────────────────────────────────────────────
  const menu = await page(fx, "/menu");
  eq(menu.status, 200, "/menu 200");
  ok(menu.html.includes("한 줄 입력 예시(한 번에 한 건)"), "메뉴의 스마트 입력 도움말 설명은 ‘한 줄 입력 예시(한 번에 한 건)’");
  ok(!menu.html.includes("여러 줄 입력 예시"), "‘여러 줄 입력 예시’ 약속이 메뉴에 없다");
}));
const menuSrc = read("src/modules/web/menu-and-guides.js");
ok(!menuSrc.includes("한 줄·여러 줄 입력 예시"), "메뉴 소스에 ‘한 줄·여러 줄 입력 예시’ 가 없다");
ok(menuSrc.includes("\"한 줄 입력 예시(한 번에 한 건)\""), "메뉴 소스의 새 설명");
const bundle = read("src/index.js");
ok(bundle.includes("한 줄 입력 예시(한 번에 한 건)") && !bundle.includes("한 줄·여러 줄 입력 예시"), "생성 번들도 같은 문구");
ok(bundle.includes("function cardUsageMatchScore(") && !bundle.includes("bestLen =") && !bundle.includes("let bestLen"), "생성 번들의 카드 매칭도 새 규칙");
ok(bundle.split("function filterNeedleTokens").length - 1 === 1 && bundle.includes("split(/\\s+/).filter(Boolean).slice(0, 8)"), "생성 번들의 낱말 규칙 정의는 하나이고 이스케이프가 맞다");
done();
