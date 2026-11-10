// V22.9.116 출시 전 P1 두 건 검사(출시 연기로 늘어난 주, 사용자 11-10 "결함 개선 진행하자").
//  1. 카카오 ‘방금’ 대상(V110 카카오 점검 P1, 11-07·11-08 운영 재확인): 마지막 저장 뒤에 내 다른 기록을 고쳤으면 ‘방금 거 지워줘’·
//     ‘방금 거 5000원으로’·번호 없는 ‘지출자 변경’ 이 어느 쪽도 고르지 않고 두 기록을 날짜·번호와 함께 묻는다(직접 대화·방 모두).
//     고친 기록이 마지막 저장 기록이거나 고친 뒤에 새로 저장했으면 예전처럼 그 기록이다. 바뀐 시각(updated_at)은 운영 DB 의
//     set_transactions_updated_at 트리거가 적으므로 픽스처에서는 수정 요청 뒤에 같은 일을 흉내 낸다.
//  2. 무지출일 한 셈(V110 #8): 소비 분석 칩(브라우저 스크립트)·관리자 PC 분석·관리자 대시보드가 생활비 리포트·종합 리포트와 같은 규칙
//     (가계부를 시작한 날 = 만든 날, 그 기간에 더 앞선 기록이 있으면 그 날부터; 직접 적은 기록이 없으면 세지 않음)이다. 분류·결제수단·
//     사람·금액·검색으로 좁힌 소비 분석에서는 칩을 보이지 않는다. 운영 덤프(2026-11-10 13:44) 32장면 골든: 고치기 전 어긋남 8 → 뒤 0
//     (review-artifacts/v116-prelaunch-p1-2026-11-10/, 숫자만).
// 판 이름 글자는 적지 않는다(‘판 번호 정본’ 검사). 오프라인: 픽스처 + app.fetch, DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { app, BASE, counter, intercept, page, post, skill, withClock } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { insightBrowser } from "./lib-insight-browser.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.116 출시 전 P1(카카오 ‘방금’ 대상·무지출일 한 셈) 검사 통과");

// ── 1. 카카오 ‘방금’ 대상 ─────────────────────────────────────────────────────
const DAY = "2026-07-15";
const clearGuards = () => { for (const key of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[key]?.clear(); };
const ROOM_KEY = "room-owner-v229116", ROOM = "room-v229116";
async function roomSay(fx, utterance) {
  const headers = { "content-type": "application/json", "user-agent": "validate-v229116", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET };
  const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, intent: { id: "synthetic-fallback", name: "폴백 블록" }, userRequest: { utterance, user: { id: ROOM_KEY, type: "botUserKey", properties: { botUserKey: ROOM_KEY } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } } };
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), fx.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  const data = await response.json();
  return String(data?.template?.outputs?.map((o) => o?.simpleText?.text || o?.textCard?.description || "").join("\n") || JSON.stringify(data));
}
// 운영 DB 트리거(set_transactions_updated_at: 고칠 때마다 updated_at = now())를 흉내 낸다. 시각은 운영 PostgREST 꼴(마이크로초 +00:00)이다.
function updatedAtTrigger(fx, times) {
  return intercept(async ({ url, method, init, forward }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    const rpc = url.pathname.endsWith("/rest/v1/rpc/accountbook_update_transaction_v227");
    const patch = method === "PATCH" && url.pathname.endsWith("/rest/v1/transactions");
    if (!rpc && !patch) return null;
    const response = await forward();
    if (!response.ok) return response;
    const ids = rpc ? [String(JSON.parse(String(init.body || "{}")).p_transaction_id || "")] : [String(url.searchParams.get("id") || "").replace(/^eq\./, "")];
    for (const id of ids) { const row = fx.db.transactions.find((item) => String(item.id) === id); if (row) row.updated_at = times.shift() || "2026-07-15T02:59:59.999999+00:00"; }
    return response;
  });
}
const byMemo = (fx, memo) => fx.db.transactions.find((row) => String(row.memo || row.raw_text || "").includes(memo)) || null;
// 저장 직후 운영처럼 created_at = updated_at 을 같은 값으로 적는다(INSERT 의 DEFAULT now() 두 칸).
const stamp = (memo, createdAt, updatedAt = createdAt) => (fx) => { const row = byMemo(fx, memo); if (row) { row.created_at = createdAt; if (updatedAt !== null) row.updated_at = updatedAt; else delete row.updated_at; } return ""; };
async function kakao(path, steps, { trigger = true, touchedQueries = null } = {}) {
  return withClock(DAY, async () => {
    const fx = await createV2265QaFixture();
    const saved = globalThis.fetch;
    const restores = [];
    try {
      fx.env.SKILL_RATE_LIMIT = "10000";
      // 방 경로만 Secret 을 켠다(직접 대화 도우미 skill() 은 Secret 머리를 보내지 않는다 — 켜면 호출 확인 실패 답이 된다).
      if (path === "방") fx.env.KAKAO_SKILL_SECRET = "validate-v229116-secret";
      clearGuards();
      if (path === "직접") { await skill(fx, "오늘기록"); await skill(fx, "2"); }
      if (trigger) restores.push(updatedAtTrigger(fx, ["2026-07-15T01:10:00.250000+00:00", "2026-07-15T01:11:00.5+00:00", "2026-07-15T01:12:00+00:00"]));
      if (touchedQueries) restores.push(intercept(async ({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/rest/v1/transactions") && url.searchParams.get("order") === "updated_at.desc") touchedQueries.count += 1; return null; }));
      const replies = [];
      for (const step of steps) {
        clearGuards();
        if (typeof step === "function") { replies.push(await step(fx)); continue; }
        replies.push(path === "방" ? await roomSay(fx, step) : await skill(fx, step));
      }
      return { fx, replies, reply: replies.at(-1) || "" };
    } finally {
      for (const restore of restores.reverse()) restore();
      globalThis.fetch = saved;
      fx.restore();
    }
  });
}
const AMBIGUOUS = "마지막에 저장한 뒤에 다른 기록을 고쳐서 ‘방금’이 어느 기록인지 정하지 못했어요. 아무것도 바꾸지 않았어요.";
const T1 = "2026-07-15T01:00:00+00:00", T2 = "2026-07-15T01:05:00.000+00:00";

for (const path of ["직접", "방"]) {
  // 1-1 V110 그대로: 두 건 저장 → 먼저 저장한 01번을 번호로 고침 → ‘방금 …’ 은 어느 쪽도 고르지 않는다.
  for (const command of ["방금 거 지워줘", "방금 거 5000원으로", "방금 삭제", "지출자 변경"]) {
    const { fx, replies, reply } = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1), stamp("점검밥", T2), "수정 01번 금액 2000", command]);
    ok(replies[4].includes("2,000원") && byMemo(fx, "점검커피")?.amount === 2000, `1-1 ${path} ‘수정 01번 금액 2000’ 은 01번(점검커피)을 고친다`);
    ok(reply.includes(AMBIGUOUS), `1-1 ${path} 고친 뒤 ‘${command}’ 은 대상을 정하지 않았다고 말한다`);
    ok(reply.includes("마지막에 고친 기록: 01번 - 점검커피") && reply.includes("마지막에 저장한 기록: 02번 - 점검밥"), `1-1 ${path} ‘${command}’ 은 고친 기록과 저장한 기록을 번호와 함께 보인다`);
    ok(reply.includes("예: 수정 01번 금액 13000 / 삭제 01번"), `1-1 ${path} ‘${command}’ 의 예시는 고친 기록의 번호다`);
    eq(fx.db.transactions.filter((row) => /점검(커피|밥)/.test(String(row.memo || row.raw_text || ""))).length, 2, `1-1 ${path} ‘${command}’ 은 아무 기록도 지우지 않는다`);
    eq(byMemo(fx, "점검커피")?.amount, 2000, `1-1 ${path} ‘${command}’ 뒤 고친 기록 금액 그대로`);
    eq(byMemo(fx, "점검밥")?.amount, 1000, `1-1 ${path} ‘${command}’ 뒤 저장한 기록 금액 그대로(예전에는 이 기록이 지워지거나 바뀌었다)`);
  }
  // 1-2 되묻는 답이 시킨 번호 명령은 그대로 그 기록을 지운다.
  {
    const { fx } = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1), stamp("점검밥", T2), "수정 01번 금액 2000", "방금 거 지워줘", "삭제 01번"]);
    ok(!byMemo(fx, "점검커피") && byMemo(fx, "점검밥")?.amount === 1000, `1-2 ${path} 되물은 뒤 ‘삭제 01번’ 은 고친 기록만 지운다`);
  }
  // 1-3 마지막에 저장한 기록을 고쳤으면 ‘방금’ 은 그 기록이다(되묻지 않는다).
  {
    const touchedQueries = { count: 0 };
    const { fx, reply } = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1), stamp("점검밥", T2), "수정 02번 금액 2000", "방금 거 지워줘"], { touchedQueries });
    ok(!reply.includes("정하지 못했어요") && !byMemo(fx, "점검밥") && byMemo(fx, "점검커피")?.amount === 1500, `1-3 ${path} 마지막 저장 기록을 고친 뒤 ‘방금 거 지워줘’ 는 그 기록을 지운다`);
    eq(touchedQueries.count, 1, `1-3 ${path} ‘방금’ 한 번에 마지막으로 바뀐 기록 조회는 한 번이다`);
  }
  // 1-4 고친 뒤에 새로 저장했으면 ‘방금’ 은 새로 저장한 기록이다.
  {
    const { fx, reply } = await kakao(path, ["점검커피 1500", stamp("점검커피", T1), "수정 01번 금액 2000", "점검밥 1000", stamp("점검밥", "2026-07-15T01:20:00.000001+00:00"), "방금 거 지워줘"]);
    ok(!reply.includes("정하지 못했어요") && !byMemo(fx, "점검밥") && byMemo(fx, "점검커피")?.amount === 2000, `1-4 ${path} 고친 뒤 새로 저장한 기록이 ‘방금’ 이다`);
  }
  // 1-5 바뀐 시각이 없는 줄(예전 픽스처·검사)은 예전처럼 마지막 저장 기록이다.
  {
    const { fx } = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1, null), stamp("점검밥", T2, null), "수정 01번 금액 2000", "방금 거 지워줘"], { trigger: false });
    ok(!byMemo(fx, "점검밥") && byMemo(fx, "점검커피")?.amount === 2000, `1-5 ${path} 바뀐 시각이 없으면 예전처럼 마지막 저장 기록을 지운다`);
  }
  // 1-6 시각은 마이크로초까지, 소수 자릿수가 달라도 같은 순간이면 ‘뒤’ 가 아니다.
  {
    const later = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1, "2026-07-15T01:05:00.000001+00:00"), stamp("점검밥", "2026-07-15T01:05:00+00:00"), "방금 거 지워줘"]);
    ok(later.reply.includes(AMBIGUOUS) && byMemo(later.fx, "점검밥"), `1-6 ${path} 1마이크로초 뒤에 바뀐 다른 기록이 있으면 묻는다`);
    const same = await kakao(path, ["점검커피 1500", "점검밥 1000", stamp("점검커피", T1, "2026-07-15T01:05:00.000000+00:00"), stamp("점검밥", "2026-07-15T01:05:00+00:00"), "방금 거 지워줘"]);
    ok(!same.reply.includes("정하지 못했어요") && !byMemo(same.fx, "점검밥"), `1-6 ${path} 같은 순간(자릿수만 다름)은 뒤가 아니라 마지막 저장 기록을 지운다`);
  }
  // 1-7 한 말로 여러 건 저장한 뒤 다른 기록을 고쳤으면 고친 기록과 그 여러 건을 모두 보인다.
  {
    const { fx, reply } = await kakao(path, ["점검커피 1500", stamp("점검커피", T1), "점검점심 9000 점검저녁 12000", stamp("점검점심", T2), stamp("점검저녁", T2), "수정 01번 금액 2000", "방금 삭제"]);
    ok(reply.includes(AMBIGUOUS) && reply.includes("마지막에 고친 기록: 01번 - 점검커피") && reply.includes("마지막에 한 번에 저장한 기록 2건:") && reply.includes("점검점심") && reply.includes("점검저녁"), `1-7 ${path} 여러 건 저장 뒤 다른 기록을 고쳤으면 모두 보이고 묻는다`);
    eq(fx.db.transactions.filter((row) => /점검(커피|점심|저녁)/.test(String(row.memo || row.raw_text || ""))).length, 3, `1-7 ${path} 아무 기록도 지우지 않는다`);
  }
}
// 1-8 다른 날 기록을 고쳤으면 날짜를 붙여 보이고, 예시 명령(날짜 + 번호)이 그대로 그 기록을 지운다(직접 대화).
{
  const { fx, reply } = await kakao("직접", ["어제 점검택시 3000", "점검밥 1000", stamp("점검택시", T1), stamp("점검밥", T2), "어제 수정 01번 금액 2000", "방금 거 지워줘"]);
  ok(byMemo(fx, "점검택시")?.transaction_date === "2026-07-14" && byMemo(fx, "점검택시")?.amount === 2000, "1-8 ‘어제 수정 01번 금액 2000’ 은 어제 기록을 고친다");
  ok(reply.includes(AMBIGUOUS) && reply.includes("마지막에 고친 기록: 7월 14일 01번 - 점검택시") && reply.includes("마지막에 저장한 기록: 01번 - 점검밥"), "1-8 다른 날 고친 기록에는 날짜를 붙인다");
  ok(reply.includes("예: 7월 14일 수정 01번 금액 13000 / 7월 14일 삭제 01번"), "1-8 예시도 그 날짜와 번호다");
  const { fx: fx2 } = await kakao("직접", ["어제 점검택시 3000", "점검밥 1000", stamp("점검택시", T1), stamp("점검밥", T2), "어제 수정 01번 금액 2000", "방금 거 지워줘", "7월 14일 삭제 01번"]);
  ok(!byMemo(fx2, "점검택시") && byMemo(fx2, "점검밥")?.amount === 1000, "1-8 예시 명령 ‘7월 14일 삭제 01번’ 은 고친 기록만 지운다");
}
// 1-9 소스: 해석기 한 곳이 세 길(삭제·값 고치기·지출자 변경)을 맡고, 바뀐 순서 조회는 저장 순서 조회와 같은 단계에서 돈다.
{
  const flow = read("src/modules/kakao/edit-flow-v4.js");
  const session = read("src/modules/kakao/edit-session-v4.js");
  eq(flow.split("resolveKakaoEditTargetRowV4(env, ctx,").length - 1, 3, "1-9 ‘방금’ 해석기를 부르는 곳은 삭제·고치기·지출자 변경 셋이다");
  ok(/Promise\.all\(\[\s*getRecentKakaoOwnedTransactionsV2254\(env, household\.id, user\.id, kakaoUserKey, 1\),\s*getRecentKakaoOwnedTransactionsV2254\(env, household\.id, user\.id, kakaoUserKey, 1, \{ touched: true \}\),\s*\]\)/.test(flow), "1-9 저장 순서·바뀐 순서 두 조회를 같은 단계(Promise.all)에서 읽는다");
  ok(session.includes('params.set("order", touched ? "updated_at.desc" : "created_at.desc");') && session.includes("`${KAKAO_TX_SELECT_V4},updated_at`"), "1-9 바뀐 순서 조회는 updated_at 내림차순이고 그 칸을 받는다");
  const bundle = read("src/index.js");
  ok(bundle.includes("function kakaoEditTouchedAmbiguousTextV229116(") && bundle.includes("function kakaoChangedAfterV229116("), "1-9 생성 번들에도 새 해석이 있다");
}

// ── 2. 무지출일 한 셈 ────────────────────────────────────────────────────────
// 가계부 house-home 을 2026-11-06 12:00 KST 에 만든 것으로 바꾸고, 11월 기록을 넣는다(오늘 11-10).
//   11-05 지출(만든 날보다 앞선 기록) · 11-06 지출 · 11-07 정기 자동 지출 · 11-08 수입만 · 11-09 지출 · 11-12 지출(미래)
//   시작한 날 = 11-05 → 11-05~11-10 6일 중 지출 있는 날 05·06·07·09 = 4 → 무지출 2일(08·10). 예전 칩은 11-01 부터 10 − 4 = 6일.
//   10월: 10-20 지출 한 건(만든 날보다 앞선 기록) → 10-20~10-31 12일 − 1 = 11일(예전 칩 31 − 1 = 30일).
//   9월: 정기 자동 기록만 → 세지 않는다(리포트 ‘직접 적은 기록 없음’·종합 ‘-’·칩 없음, 예전 칩 29일).
const NOW = "2026-11-10";
const tx = (id, date, type, amount, extra = {}) => ({ id, household_id: "house-home", user_id: "user-bin", transaction_date: date, type, amount, category: type === "income" ? "부수입" : "식비", memo: `무지출검사 ${id}`, payment_method: "국민카드", source: "web", raw_text: `무지출검사 ${id}`, created_at: "2026-11-06T03:30:00.000Z", ...extra });
const auto = { source: "recurring_auto", raw_text: "recurring:rule-v229116:2026-11", category: "주거/관리", memo: "월세" };
const NOSPEND_ROWS = [
  tx("n1", "2026-11-05", "expense", 5000), tx("n2", "2026-11-06", "expense", 7000), tx("n3", "2026-11-07", "expense", 650000, auto),
  tx("n4", "2026-11-08", "income", 10000), tx("n5", "2026-11-09", "expense", 2000), tx("n6", "2026-11-12", "expense", 9000),
  tx("o1", "2026-10-20", "expense", 4000),
  tx("s1", "2026-09-10", "expense", 650000, { ...auto, raw_text: "recurring:rule-v229116:2026-09" }),
];
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const ADMIN_PASSWORD = "nospend-v229116-admin";
async function nospendFixture(task, { createdAt = "2026-11-06T03:00:00.000Z" } = {}) {
  return withClock(NOW, async () => {
    const fx = await createV2265QaFixture();
    try {
      fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
      fx.env.ADMIN_SESSION_SECRET = "nospend-v229116-admin-session";
      const home = fx.db.households.find((h) => h.id === "house-home");
      if (createdAt) home.created_at = createdAt; else delete home.created_at;
      fx.db.transactions = NOSPEND_ROWS.map((row) => ({ ...row }));
      fx.db.accountbook_recurring = [];
      return await task(fx);
    } finally {
      fx.restore();
    }
  });
}
const reportValue = (html) => { const m = /· 무지출 ([\d,]+)일|· (직접 적은 기록 없음)/.exec(strip(html)); return !m ? "없음" : m[1] ? m[1] : "null"; };
const tileValue = (html) => { const m = /무지출일\s*(-|[\d,]+일)/.exec(strip(html)); return !m ? "없음" : m[1] === "-" ? "null" : m[1].replace("일", ""); };
let insightScript = "";
async function chip(fx, month, search = "") {
  if (!insightScript) insightScript = await (await app.fetch(new Request(`${BASE}/my/analysis/app.js`), fx.env, { waitUntil() {} })).text();
  const res = await page(fx, `/my/analysis?household_id=house-home&month=${month}`);
  const m = /<script>window\.__INSIGHT__=(\{[\s\S]*?\});<\/script>/.exec(res.html);
  const payload = m ? JSON.parse(m[1]) : null;
  const browser = insightBrowser(insightScript, payload || {}, search);
  browser.flush();
  const text = browser.get("insights").textContent;
  const c = /무지출 (\d+)일 \((\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)/.exec(text);
  return { payload, value: c ? c[1] : "숨김", from: c ? c[2] : "", to: c ? c[3] : "", text };
}

await nospendFixture(async (fx) => {
  // 2-1 같은 달은 생활비 리포트·종합 리포트·소비 분석 칩이 같은 숫자다.
  for (const [month, expected, from, to] of [["2026-11", "2", "2026-11-05", "2026-11-10"], ["2026-10", "11", "2026-10-20", "2026-10-31"]]) {
    const report = reportValue((await page(fx, `/reports?household_id=house-home&month=${month}`)).html);
    const tile = tileValue((await page(fx, `/my/analysis?view=report&household_id=house-home&month=${month}`)).html);
    const c = await chip(fx, month);
    eq(report, expected, `2-1 ${month} 생활비 리포트 무지출 ${expected}일`);
    eq(tile, expected, `2-1 ${month} 종합 리포트 무지출 ${expected}일`);
    eq(c.value, expected, `2-1 ${month} 소비 분석 칩도 무지출 ${expected}일(예전에는 1일부터 셌다)`);
    eq(`${c.from}~${c.to}`, `${from}~${to}`, `2-1 ${month} 칩의 기간은 시작한 날(${from})부터 ${to}까지다`);
  }
  // 2-2 직접 적은 기록이 없는 달(정기 자동 기록만)은 세지 않는다 — 세 화면 모두.
  {
    eq(reportValue((await page(fx, "/reports?household_id=house-home&month=2026-09")).html), "null", "2-2 9월 생활비 리포트는 ‘직접 적은 기록 없음’");
    eq(tileValue((await page(fx, "/my/analysis?view=report&household_id=house-home&month=2026-09")).html), "null", "2-2 9월 종합 리포트는 ‘-’");
    eq((await chip(fx, "2026-09")).value, "숨김", "2-2 9월 소비 분석은 무지출 칩을 보이지 않는다(예전에는 29일)");
  }
  // 2-3 좁힌 화면은 칩이 없고, 수입·지출 함께(t=all)·다른 기간 꼴(최근 7일)은 같은 규칙으로 센다.
  for (const search of ["?c=%EC%8B%9D%EB%B9%84", "?pm=%EA%B5%AD%EB%AF%BC%EC%B9%B4%EB%93%9C", "?w=Bin", "?min=1000", "?max=900000", "?q=%EB%AC%B4%EC%A7%80%EC%B6%9C"]) {
    const c = await chip(fx, "2026-11", search);
    eq(c.value, "숨김", `2-3 좁힌 소비 분석(${decodeURIComponent(search)})은 무지출 칩을 보이지 않는다`);
  }
  eq((await chip(fx, "2026-11", "?t=all")).value, "2", "2-3 수입·지출 함께 보기(t=all)도 같은 무지출 2일");
  {
    const d7 = await chip(fx, "2026-11", "?p=d7");
    eq(`${d7.value}|${d7.from}`, "2|2026-11-05", "2-3 최근 7일(11-04~11-10)도 시작한 날 11-05 부터 세어 2일");
  }
  // 2-4 칩 자료: 가계부를 만든 날과 정기 자동 기록 표시(8번째 칸 1, 나머지는 칸 없음).
  {
    const { payload } = await chip(fx, "2026-11");
    eq(payload?.started, "2026-11-06", "2-4 칩 자료에 가계부를 만든 날(KST)이 있다");
    const autoRows = (payload?.rows || []).filter((row) => row.length === 8);
    eq(autoRows.length, 2, "2-4 정기 자동 기록 두 건만 8번째 칸이 있다");
    ok(autoRows.every((row) => row[7] === 1) && (payload?.rows || []).filter((row) => row.length === 7).length === NOSPEND_ROWS.length - 2, "2-4 8번째 칸은 1 이고 나머지 줄은 예전처럼 7칸이다");
  }
  // 2-5 관리자 PC 분석(/analysis)·관리자 대시보드(/admin-view)도 같은 셈이다(예전에는 1일부터 6일).
  {
    const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/admin-view" }, { cookie: "" });
    const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
    ok(admin.length > "ab_admin=".length, "2-5 관리자 세션을 받는다");
    const pc = await page(fx, "/analysis?household_id=house-home&month=2026-11", { cookie: `${admin}; ${fx.cookie}` });
    eq(pc.status, 200, "2-5 관리자 PC 분석이 열린다");
    eq(tileValue(pc.html), "2", "2-5 관리자 PC 분석의 무지출일도 2일");
    const dash = await page(fx, "/admin-view?household_id=house-home&month=2026-11", { cookie: admin });
    eq(dash.status, 200, "2-5 관리자 대시보드가 열린다");
    eq(tileValue(dash.html), "2", "2-5 관리자 대시보드의 무지출일도 2일");
  }
});
// 2-6 만든 날을 모르는 가계부는 세 화면 모두 기간 첫날부터 센다(예전 동작, 같은 숫자).
await nospendFixture(async (fx) => {
  eq(reportValue((await page(fx, "/reports?household_id=house-home&month=2026-11")).html), "6", "2-6 만든 날을 모르면 생활비 리포트는 1일부터 6일");
  eq(tileValue((await page(fx, "/my/analysis?view=report&household_id=house-home&month=2026-11")).html), "6", "2-6 종합 리포트도 6일");
  const c = await chip(fx, "2026-11");
  eq(`${c.value}|${c.from}`, "6|2026-11-01", "2-6 칩도 1일부터 6일");
  eq(c.payload?.started, "", "2-6 만든 날을 모르면 칩 자료의 시작한 날은 빈 값");
}, { createdAt: "" });
// 2-7 소스: 칩은 예전 셈(기간 첫날부터 날짜 수 − 지출일)을 쓰지 않고, 관리자 화면 두 곳은 시작한 날을 넘긴다.
{
  const client = read("src/modules/client/insight-main.js");
  ok(!client.includes("var noSpend = days - Object.keys(byDay)") && client.includes("function noSpendDaysIn(start, end)") && client.includes("!rowFilterActive()"), "2-7 소비 분석 칩은 새 셈(noSpendDaysIn)이고 좁힌 화면에서 숨는다");
  ok(read("src/modules/admin/pc-analysis-calendar.js").includes("calculateDashboardAnalysis(rows, rows, calendar, month, { startedOn: householdStartYmd(selected, rows) })"), "2-7 관리자 PC 분석은 시작한 날을 넘긴다");
  ok(read("src/modules/admin/dashboard-page.js").includes("calculateDashboardAnalysis(allRows, rows, calendar, month, { startedOn: householdStartYmd(selectedHousehold, allRows) })"), "2-7 관리자 대시보드는 시작한 날을 넘긴다");
  ok(read("src/modules/my/insight-page.js").includes("started: householdStartYmd(selected),") && read("src/modules/my/insight-page.js").includes("...(isRecurringSourceRow(r) ? [1] : []),"), "2-7 소비 분석 자료에 시작한 날과 정기 자동 기록 표시를 싣는다");
  const served = insightScript;
  ok(served.includes("function noSpendDaysIn(start, end)") && !served.includes("var noSpend = days - Object.keys(byDay)"), "2-7 내려보내는 소비 분석 스크립트(/my/analysis/app.js)도 새 셈이다");
}
done();
