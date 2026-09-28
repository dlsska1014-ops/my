// V22.9.16 — 화면과 카카오 발화가 DB 를 몇 번, 몇 단계 줄줄이 기다리는지 잰다.
//
// 느린 화면과 "스킬 에러"의 뿌리는 같았다. 한 요청 안에서 Supabase 왕복이 거의 직렬로
// 이어져, 왕복이 100ms 면 홈은 1초, 카카오 수정은 2초 가까이 서버에서만 쓰였다. 카카오는
// 5초를 넘기면 끊는다. 이 검사는 "왕복 수"와 "직렬 깊이(가장 긴 의존 사슬)"를 재서 다시
// 늘어나면 실패시킨다. 값을 올려야 한다면 그 이유를 이 파일에 적는다.
//
// 깊이 재는 법: 모의 Supabase 가 호출마다 잠깐(12ms) 기다린다. 호출이 시작될 때 "그때까지
// 끝난 호출 중 가장 깊은 것 + 1" 을 그 호출의 깊이로 준다. 함께 던진 호출은 서로 끝나기
// 전에 시작하므로 같은 깊이가 된다. 그래서 CPU 시간이 아니라 의존 사슬만 잰다.

import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}

const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
const month = kstNow.toISOString().slice(0, 7);
const householdId = "house-home";
const base = "https://ttokttok-accountbook.com";
const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari";
const DELAY_MS = 12;

const fixture = await createV2265QaFixture();
const db = fixture.db;
for (let day = 1; day <= 12; day += 1) {
  db.transactions.push({ id: `depth-${day}`, household_id: householdId, user_id: day % 2 ? "user-bin" : "user-wifi", transaction_date: `${month}-${String(day).padStart(2, "0")}`, type: "expense", amount: 4000 + day * 700, category: ["식비", "교통", "카페/간식"][day % 3], memo: `기록 ${day}`, payment_method: "국민카드", source: "web", created_at: `${month}-${String(day).padStart(2, "0")}T09:00:00.000Z` });
}
db.accountbook_budgets.push({ id: "depth-total", household_id: householdId, month, category: "__total", amount: 1500000, created_at: `${month}-01T00:00:00.000Z` });

const fixtureFetch = globalThis.fetch;
let trace = null;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (trace && url.includes("mock.supabase.co")) {
    const depth = trace.maxCompleted + 1;
    trace.calls += 1;
    trace.maxDepth = Math.max(trace.maxDepth, depth);
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    const response = await fixtureFetch(input, init);
    trace.maxCompleted = Math.max(trace.maxCompleted, depth);
    return response;
  }
  return fixtureFetch(input, init);
};

async function measure(request) {
  trace = { calls: 0, maxDepth: 0, maxCompleted: 0 };
  const response = await app.fetch(request, fixture.env, { waitUntil() {}, passThroughOnException() {} });
  const text = await response.text();
  const result = { status: response.status, text, calls: trace.calls, depth: trace.maxDepth };
  trace = null;
  return result;
}

function page(path) {
  return measure(new Request(`${base}${path}`, { headers: { cookie: fixture.cookie, "user-agent": mobileUA } }));
}

const kakaoKey = "kakao_login:2265";
function kakao(utterance) {
  const body = { userRequest: { utterance, user: { id: kakaoKey, type: "botUserKey", properties: { botUserKey: kakaoKey } } }, bot: { id: "bot" }, action: { name: "fallback", params: {} } };
  return measure(new Request(`${base}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

// ---------------------------------------------------------------------------
// 1. 화면. 첫 요청은 통합 계정 캐시가 비어 사용자 행을 한 번 더 읽는다 — 운영에서도 아이솔레이트가
//    막 뜬 첫 요청이 그렇다. 두 번째부터가 평소 상태이므로 홈을 한 번 데운 뒤 잰다.
// ---------------------------------------------------------------------------
await page(`/app?month=${month}&household_id=${householdId}`);

// 상한은 V22.9.16 에서 잰 값 그대로다(V22.9.15 는 홈 11회/10단계, 예산 11회/12단계, 설정
// 9회/11단계였다). 늘리려면 왜 왕복이 하나 더 필요한지 여기 적는다.
const screens = [
  ["홈", `/app?month=${month}&household_id=${householdId}`, { calls: 8, depth: 3 }],
  ["예산", `/budgets?month=${month}&household_id=${householdId}`, { calls: 9, depth: 3 }],
  ["설정", `/my/settings?household_id=${householdId}`, { calls: 8, depth: 3 }],
  ["정기", `/reserve-plans?household_id=${householdId}`, { calls: 9, depth: 3 }],
  ["리포트", `/reports?month=${month}&household_id=${householdId}`, { calls: 10, depth: 4 }],
  ["소비 분석", `/my/analysis?month=${month}&household_id=${householdId}`, { calls: 8, depth: 4 }],
  ["전체 메뉴", `/menu?month=${month}&household_id=${householdId}`, { calls: 4, depth: 3 }],
];
console.log("화면              상태   왕복  깊이   (상한: 왕복/깊이)");
for (const [label, path, limit] of screens) {
  const result = await page(path);
  console.log(`${label.padEnd(14, " ")} ${String(result.status).padStart(4)} ${String(result.calls).padStart(5)} ${String(result.depth).padStart(5)}    (${limit.calls}/${limit.depth})`);
  ok(result.status === 200, `${label} 화면이 열린다 (${result.status})`);
  ok(result.calls <= limit.calls, `${label} DB 왕복이 ${limit.calls}회 이하다 (${result.calls}회)`);
  ok(result.depth <= limit.depth, `${label} 직렬 깊이가 ${limit.depth}단계 이하다 (${result.depth}단계)`);
}

// 홈의 렌더 결과가 예전과 같은 자리를 그린다 — 왕복을 줄이며 데이터를 빠뜨리지 않았는지.
const home = await page(`/app?month=${month}&household_id=${householdId}`);
ok(home.text.includes("homeDailyPlan"), "홈에 하루 환산 블록이 있다(예산·거래를 받았다)");
ok(home.text.includes("기록 1") || home.text.includes("기록 12"), "홈 최근 내역에 이번 달 거래가 있다");
ok(home.text.includes("WIFI♥") || home.text.includes("Bin"), "홈이 구성원 이름을 붙인다(구성원·사용자 행을 받았다)");

// 리포트는 같은 달 거래를 두 번 읽지 않는다.
{
  trace = { calls: 0, maxDepth: 0, maxCompleted: 0 };
  const seen = new Map();
  const counting = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("mock.supabase.co")) seen.set(url, (seen.get(url) || 0) + 1);
    return counting(input, init);
  };
  await app.fetch(new Request(`${base}/reports?month=${month}&household_id=${householdId}`, { headers: { cookie: fixture.cookie, "user-agent": mobileUA } }), fixture.env, { waitUntil() {}, passThroughOnException() {} });
  globalThis.fetch = counting;
  trace = null;
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([url]) => url);
  ok(duplicated.length === 0, `리포트가 같은 질의를 두 번 던지지 않는다 (${duplicated.join(", ")})`);
}

// ---------------------------------------------------------------------------
// 2. 카카오. 기록 한 건이 가장 흔한 발화다. 수정은 가장 무겁다.
// ---------------------------------------------------------------------------
await kakao("가계부"); // 가계부 선택 흐름 시작
const chosen = await kakao("우리집 생활비");
ok(/선택했어요/.test(chosen.text), "카카오에서 가계부를 골랐다");
// 상한은 V22.9.16 에서 잰 값이다(V22.9.15 는 기록 14회/12단계, 수정 21회/18단계).
const kakaoCases = [
  ["기록", "커피 4500", { calls: 12, depth: 6 }, /저장했어요/],
  ["요약", "이번달 요약", { calls: 11, depth: 7 }, /요약/],
  ["이해 실패", "ㅁㄴㅇㄹ", { calls: 6, depth: 3 }, /이해하지 못했어요/],
  ["수정", "수정 01번 금액 6만원", { calls: 17, depth: 11 }, /변경했어요/],
];
console.log("\n카카오            상태   왕복  깊이   (상한: 왕복/깊이)");
for (const [label, utterance, limit, expected] of kakaoCases) {
  const result = await kakao(utterance);
  const text = (() => { try { return JSON.parse(result.text).template?.outputs?.[0]?.simpleText?.text || ""; } catch { return ""; } })();
  console.log(`${label.padEnd(14, " ")} ${String(result.status).padStart(4)} ${String(result.calls).padStart(5)} ${String(result.depth).padStart(5)}    (${limit.calls}/${limit.depth})`);
  ok(expected.test(text), `카카오 ${label} 응답이 맞다 (${text.slice(0, 60)})`);
  ok(result.calls <= limit.calls, `카카오 ${label} DB 왕복이 ${limit.calls}회 이하다 (${result.calls}회)`);
  ok(result.depth <= limit.depth, `카카오 ${label} 직렬 깊이가 ${limit.depth}단계 이하다 (${result.depth}단계)`);
}

// 흐름을 한 번 탄 뒤에는 발화마다 빈 흐름 상태를 다시 지우지 않는다(불필요한 쓰기 0).
{
  const writes = [];
  const counting = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("mock.supabase.co") && String(init.method || "GET") !== "GET" && url.includes("accountbook_settings")) writes.push(String(init.body || ""));
    return counting(input, init);
  };
  await kakao("이번달 요약");
  globalThis.fetch = counting;
  const flowClears = writes.filter((body) => body.includes("kakao_flow_v215") && body.includes('"{}"'));
  ok(flowClears.length === 0, `요약 발화가 빈 흐름 상태를 다시 지우지 않는다 (${flowClears.length}회)`);
}

// ---------------------------------------------------------------------------
// 3. 외래키 포함 조회가 거절돼도 두 단계 조회로 돌아가 같은 화면을 그린다.
// ---------------------------------------------------------------------------
{
  const support = globalThis.__AB_POSTGREST_EMBED_SUPPORT;
  ok(support && support.household_members_households === true && support.household_members_users === true, "픽스처에서는 포함 조회가 쓰인다");
  db.__embed_unsupported = true;
  const fallback = await page(`/app?month=${month}&household_id=${householdId}`);
  ok(fallback.status === 200, `포함 조회가 거절돼도 홈이 열린다 (${fallback.status})`);
  ok(fallback.text.includes("homeDailyPlan") && (fallback.text.includes("WIFI♥") || fallback.text.includes("Bin")), "두 단계 조회로도 같은 데이터를 그린다");
  ok(support.household_members_households === false && support.household_members_users === false, "거절을 기억해 다음 요청부터는 바로 두 단계로 간다");
  const again = await page(`/app?month=${month}&household_id=${householdId}`);
  ok(again.status === 200 && again.calls <= 11, `두 단계 조회 경로의 왕복도 예전 수준(11회) 안이다 (${again.calls}회)`);
  db.__embed_unsupported = false;
  support.household_members_households = true;
  support.household_members_users = true;
}

// ---------------------------------------------------------------------------
// 4. /health 가 스킬 응답 시간 요약을 싣는다.
// ---------------------------------------------------------------------------
{
  const health = await measure(new Request(`${base}/health`));
  const json = JSON.parse(health.text);
  ok(json.skill_latency && typeof json.skill_latency.p95_ms === "number", "/health 에 skill_latency.p95_ms 가 있다");
  ok(json.skill_latency.count >= kakaoCases.length, `skill_latency.count 가 이 검사에서 보낸 발화를 센다 (${json.skill_latency.count})`);
  ok(json.skill_latency.slow_over_ms === 4000, "느린 기준은 4초다(카카오 제한 5초 앞)");
}

fixture.restore();
console.log(`\nPASS: V22.9.16 serial depth (${checks} checks)`);
