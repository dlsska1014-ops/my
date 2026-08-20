// V22.8.76: 카카오 되묻기 정리 · 예산 명령 보정 · /skill 인증 관측
//
// 이 검사는 순서를 지켜야 한다. /skill 인증 카운터는 모듈 수준에 쌓이므로
// "거부만 있고 통과가 없는" 상태를 보려면 통과 요청보다 먼저 재야 한다.
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { detectKakaoAmbiguity } from "../src/index.js";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";
let checks = 0;

function ok(value, message) {
  checks++;
  if (!value) throw new Error(`FAIL: ${message}`);
}

function eq(actual, expected, message) {
  ok(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

const fixture = await createV2265QaFixture();

const skill = (env, utterance, headers = {}) => app.fetch(new Request(`${ORIGIN}/skill`, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify({
    userRequest: { utterance, user: { id: "kakao_login:2265", properties: {} } },
    action: { params: {}, detailParams: {} },
    bot: { id: "bot" },
    intent: { id: "i", name: "폴백블록" },
  }),
}), env, {});

const health = async (env) => (await (await app.fetch(new Request(`${ORIGIN}/health`), env, {})).json()).skill_caller_auth;

// ---------------------------------------------------------------------------
// 1. /skill 인증 — 카운터는 "거부만 쌓인" 상태부터 재야 한다
// ---------------------------------------------------------------------------
const secretEnv = { ...fixture.env, KAKAO_SKILL_SECRET: "s3cret-value" };

const denied = await skill(secretEnv, "안녕");
eq(denied.status, 403, "비밀값이 있으면 헤더 없는 호출은 막힌다");
const deniedBody = await denied.text();
ok(!deniedBody.includes("s3cret-value"), "거부 응답에 비밀값이 새지 않는다");

const wrong = await skill(secretEnv, "안녕", { "x-kakao-skill-secret": "wrong" });
eq(wrong.status, 403, "틀린 비밀값도 막힌다");

const beforeAccept = await health(secretEnv);
eq(beforeAccept.mode, "enforce", "비밀값만 넣으면 기본은 차단 모드다");
ok(beforeAccept.denied >= 2, "거부가 세어진다");
eq(beforeAccept.accepted, 0, "아직 통과한 호출이 없다");
// 이것이 이번 판의 핵심이다. 헤더를 안 넣고 켜면 모든 대화가 조용히 실패하는데,
// 운영자는 "설정됨"만 보고 정상이라고 오해했다. 이제 이 신호가 잡아낸다.
eq(beforeAccept.header_missing_suspected, true, "통과 없이 거부만 쌓이면 헤더 누락으로 표시한다");

for (const [label, headers] of [
  ["x-kakao-skill-secret", { "x-kakao-skill-secret": "s3cret-value" }],
  ["x-api-key", { "x-api-key": "s3cret-value" }],
  ["Bearer", { authorization: "Bearer s3cret-value" }],
  ["앞뒤 공백", { "x-kakao-skill-secret": "  s3cret-value  " }],
]) {
  const pass = await skill(secretEnv, "안녕", headers);
  eq(pass.status, 200, `${label} 헤더는 통과한다`);
}

const afterAccept = await health(secretEnv);
ok(afterAccept.accepted >= 4, "통과가 세어진다");
eq(afterAccept.header_missing_suspected, false, "한 번이라도 통과하면 헤더 누락 표시가 내려간다");
ok(afterAccept.last_accepted_at && afterAccept.last_denied_at, "마지막 통과·거부 시각이 남는다");

// observe 모드: 헤더를 맞추는 동안 카카오톡이 멈추지 않게 하는 탈출구
const observeEnv = { ...fixture.env, KAKAO_SKILL_SECRET: "s3cret-value", KAKAO_SKILL_AUTH_MODE: "observe" };
const observed = await skill(observeEnv, "안녕");
eq(observed.status, 200, "observe 모드에서는 헤더가 없어도 막지 않는다");
eq((await health(observeEnv)).mode, "observe", "observe 모드가 상태에 드러난다");
const observeStats = await health(observeEnv);
ok(observeStats.denied > afterAccept.denied, "observe 모드에서도 실패는 계속 세어진다");

// 알 수 없는 값은 안전한 쪽(차단)으로 떨어져야 한다
const typoEnv = { ...fixture.env, KAKAO_SKILL_SECRET: "s3cret-value", KAKAO_SKILL_AUTH_MODE: "observ" };
eq((await skill(typoEnv, "안녕")).status, 403, "모드 값을 잘못 적으면 열리지 않고 막힌다");

// 비밀값이 없으면 예전 그대로 열려 있어야 한다 (배포만으로 채널이 막히지 않는다)
eq((await skill(fixture.env, "안녕")).status, 200, "비밀값이 없으면 인증 없이 동작한다");
eq((await health(fixture.env)).mode, "off", "비밀값이 없으면 인증이 꺼진 것으로 보고한다");

ok(source.includes("KAKAO_SKILL_AUTH_MODE"), "인증 모드 설정 이름이 소스에 있다");
ok(source.includes("skill_caller_auth: kakaoSkillAuthSnapshot(env)"), "인증 상태가 상태 응답에 실려 나간다");

// ---------------------------------------------------------------------------
// 2. 되묻기 정리 — 분류 이름 + 금액은 되묻지 않고 지출로 기록한다
// ---------------------------------------------------------------------------
// 되묻는 기준이 21개 단어 목록이라 "카페 4500"은 묻고 "커피 4500"은 안 물었다.
// 사용자가 규칙을 알 수 없으므로 전부 지출로 통일했다.
for (const utterance of ["주유 5만원", "카페 4500", "커피 4500", "외식 2만원", "택시 12000", "식비 30만원", "장보기 3만원"]) {
  eq(detectKakaoAmbiguity(utterance), null, `"${utterance}"는 더 이상 되묻지 않는다`);
}
ok(!source.includes("category_amount"), "분류+금액 되묻기 분기가 남아 있지 않다");
ok(!source.includes("을 어떻게 처리할까요?"), "분류+금액 되묻기 문구가 남아 있지 않다");

// 진짜로 모호한 말은 계속 되물어야 한다 — 금액이 없어 무엇을 할지 알 수 없다.
for (const [utterance, type] of [["예산", "budget_action"], ["가계부", "household_action"], ["초대", "invite_action"], ["이름변경", "name_target"]]) {
  eq(detectKakaoAmbiguity(utterance)?.type, type, `"${utterance}"는 여전히 되묻는다`);
}

const say = async (utterance) => {
  const response = await skill(fixture.env, utterance);
  const body = JSON.parse(await response.text());
  return String(body?.template?.outputs?.[0]?.simpleText?.text || "");
};
await say("안녕");
ok((await say("2")).includes("선택했어요"), "가계부를 선택할 수 있다");

for (const [utterance, category] of [["주유 5만원", "주유/충전"], ["카페 4500", "카페/간식"], ["커피 4500", "카페/간식"], ["외식 2만원", "외식"]]) {
  const before = fixture.db.transactions.length;
  const reply = await say(utterance);
  const added = fixture.db.transactions.slice(before);
  eq(added.length, 1, `"${utterance}"가 지출 한 건으로 기록된다`);
  eq(added[0].type, "expense", `"${utterance}"는 지출로 저장된다`);
  eq(added[0].category, category, `"${utterance}"의 분류가 유지된다`);
  ok(reply.includes("지출 저장했어요"), `"${utterance}"에 저장 안내가 온다`);
}

// ---------------------------------------------------------------------------
// 3. 예산 명령 — "예산"이라고 말했는데 지출이 남던 결함
// ---------------------------------------------------------------------------
const budgetSnapshot = () => JSON.stringify(fixture.db.accountbook_budgets || []);

for (const [utterance, label] of [
  ["식비 예산 30만원", "설정·저장·등록을 빼고 말해도"],
  ["교통 예산 10만원", "다른 분류에서도"],
  ["식비 예산설정 30만원", "기존 표기도 그대로"],
]) {
  const beforeTx = fixture.db.transactions.length;
  const beforeBudget = budgetSnapshot();
  const reply = await say(utterance);
  eq(fixture.db.transactions.length, beforeTx, `"${utterance}"가 지출로 기록되지 않는다`);
  ok(budgetSnapshot() !== beforeBudget || reply.includes("예산을 설정했어요"), `${label} 예산으로 저장된다`);
  ok(reply.includes("예산을 설정했어요"), `"${utterance}"에 예산 안내가 온다`);
}

// 앱이 도움말에 직접 안내하는 문장인데 한 번도 동작하지 않았다.
// 명령 파서가 내놓은 "__total"을 분류 해석이 다시 정규화하면서 밑줄이 지워져
// "total"이 되고, 그러면 등록된 분류를 찾지 못했다.
for (const utterance of ["전체 예산설정 300만원", "전체 예산 300만원", "월 전체 예산설정 300만원", "총액 예산설정 300만원"]) {
  const reply = await say(utterance);
  ok(reply.includes("전체 월 예산을 설정했어요"), `"${utterance}"가 전체 예산으로 저장된다`);
}

// 꼬리에 다른 말이 붙으면 예산 명령이 아니라 지출이다.
const beforeMixed = fixture.db.transactions.length;
const mixed = await say("회사 예산 회의 5000");
eq(fixture.db.transactions.length - beforeMixed, 1, "\"회사 예산 회의 5000\"은 지출로 남는다");
ok(mixed.includes("지출 저장했어요"), "금액 말고 다른 말이 붙으면 예산 명령으로 가로채지 않는다");

// 금액이 없는 예산 관련 말은 조회·안내로 남아야 한다.
ok((await say("남은 예산")).includes("예산 현황"), "\"남은 예산\"은 조회 그대로다");
ok((await say("식비 예산 얼마야")).includes("확인할까요"), "금액이 없으면 예산 명령으로 보지 않는다");

ok(source.includes('if (String(value || "") === "__total") return "__total";'), "전체 예산 표기가 두 번 정규화돼도 무너지지 않는다");

// ---------------------------------------------------------------------------
// 4. 카카오 재전송 — 응답이 늦으면 같은 발화가 다시 온다
// ---------------------------------------------------------------------------
// 중복 방지는 "저장이 끝난 뒤"에 걸리므로 처리 중인 동안 문이 열려 있었다.
// 카카오의 타임아웃 재전송이 그 창으로 들어와 같은 기록이 두 번 남았다.
{
  const before = fixture.db.transactions.length;
  await say("재전송시험A 7701");
  await say("재전송시험A 7701");
  eq(fixture.db.transactions.length - before, 1, "순차 재전송은 한 건만 남긴다");
}
for (const [label, times] of [["동시 2회", 2], ["동시 3회", 3]]) {
  const before = fixture.db.transactions.length;
  const utterance = `재전송시험${times} 770${times}`;
  await Promise.all(Array.from({ length: times }, () => say(utterance)));
  eq(fixture.db.transactions.length - before, 1, `${label} 재전송도 한 건만 남긴다`);
}

// 처리 중 표시가 내려가지 않으면, 저장에 실패한 요청이 잠긴 채로 남아
// 사용자가 다시 보내도 아무것도 저장되지 않는다(V22.8.69 에서 고쳤던 결함).
{
  const failing = { ...fixture.env };
  const originalFetch = globalThis.fetch;
  let broke = false;
  globalThis.fetch = async (...args) => {
    const target = String(args[0]?.url || args[0] || "");
    const method = String(args[1]?.method || "GET");
    if (!broke && target.includes("/rest/v1/transactions") && method === "POST") {
      broke = true;
      throw new Error("network down");
    }
    return originalFetch(...args);
  };
  try {
    await skill(failing, "실패후재시도 8801");
  } finally {
    globalThis.fetch = originalFetch;
  }
  ok(broke, "첫 시도에 저장 실패를 실제로 주입했다");
  const before = fixture.db.transactions.length;
  const retry = await say("실패후재시도 8801");
  eq(fixture.db.transactions.length - before, 1, "저장에 실패한 요청은 잠기지 않고 다시 보내면 저장된다");
  ok(retry.includes("지출 저장했어요"), "재시도에 저장 안내가 온다");
}

// 인식하지 못한 말은 몇 번을 보내도 같은 안내가 와야 한다.
const unknownFirst = await say("ㅁㄴㅇㄹ");
const unknownSecond = await say("ㅁㄴㅇㄹ");
ok(!unknownSecond.includes("방금 같은 내용"), "저장되지 않은 말은 중복으로 잠기지 않는다");
eq(unknownSecond.slice(0, 20), unknownFirst.slice(0, 20), "같은 안내가 그대로 온다");

// ---------------------------------------------------------------------------
// 5. 저장에 실패했을 때 적은 내용이 사라지지 않는가
// ---------------------------------------------------------------------------
// 저장이 실패하면 데이터는 안전하지만(0건) 적어 둔 금액·메모가 전부 사라져
// 처음부터 다시 써야 했다. 주소로 돌려보내면 메모가 주소창과 방문 기록에
// 남으므로 브라우저 안(sessionStorage)에만 둔다.
{
  const householdId = "house-home";
  const month = new Date().toISOString().slice(0, 7);
  const originalFetch = globalThis.fetch;
  let broke = false;
  globalThis.fetch = async (...args) => {
    const target = String(args[0]?.url || args[0] || "");
    const method = String(args[1]?.method || "GET");
    if (!broke && target.includes("/rest/v1/transactions") && method === "POST") {
      broke = true;
      throw new Error("ECONNRESET");
    }
    return originalFetch(...args);
  };
  let failed;
  try {
    failed = await app.fetch(new Request(`${ORIGIN}/admin/transactions`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: fixture.cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" },
      body: new URLSearchParams({
        household_id: householdId,
        month,
        return_to: `/app?month=${month}&household_id=${householdId}`,
        type: "expense",
        amount: "8800",
        memo: "저장중끊김",
        category: "식비",
        transaction_date: `${month}-05`,
        user_id: "user-bin",
      }).toString(),
    }), fixture.env, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
  ok(broke, "저장 도중 끊김을 실제로 주입했다");
  eq(fixture.db.transactions.filter((row) => row.memo === "저장중끊김").length, 0, "저장에 실패하면 기록이 남지 않는다");
  // 주소의 공백은 "+" 로 인코딩된다. decodeURIComponent 는 그것을 되돌리지 않으므로
  // 먼저 바꿔 두지 않으면 멀쩡한 문구를 못 찾는다.
  const location = decodeURIComponent(String(failed.headers.get("location") || "").replace(/\+/g, "%20"));
  ok(location.startsWith("/app?"), "실패해도 사용자가 있던 화면으로 돌아온다");
  ok(location.includes("저장하지 못했습니다"), "실패 사유가 함께 전달된다");
  ok(location.includes("quick=1"), "입력 시트가 다시 열리도록 표시된다");
  ok(!/amount=8800|memo=/.test(location), "적어 둔 내용이 주소에 실려 기록에 남지 않는다");

  const backHtml = await (await app.fetch(new Request(`${ORIGIN}${failed.headers.get("location")}`, {
    headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" },
  }), fixture.env, {})).text();
  ok(backHtml.includes("저장하지 못했습니다"), "돌아온 화면에 실패 안내가 보인다");
}

ok(source.includes('var DRAFT_KEY = "abQuickInputDraft";'), "입력 초안을 브라우저 안에 둔다");
ok(source.includes("rememberDraft(form);"), "제출 직전에 초안을 남긴다");
// V22.8.78 에서 규칙이 바뀌었다. 예전에는 "실패가 아니면 버린다"였는데, 그러면
// 적다가 새로고침한 경우까지 버려진다. 이제 "성공했을 때만" 버린다.
ok(source.includes('if (params.get("msg")) { forgetDraft(); return; }'), "저장에 성공했을 때만 초안을 버린다");
ok(source.includes("if (restoreDraft()) {"), "실패로 돌아왔거나 적다가 떠났으면 초안을 되살린다");
ok(source.includes("forgetDraft();\n    var draft = null;"), "되살린 초안은 곧바로 지운다");

ok(source.includes("AB_KAKAO_INFLIGHT"), "처리 중 표시가 소스에 있다");
ok(source.includes("clearKakaoInFlight(repeat.key);"), "처리가 끝나면 표시를 내린다");
eq(source.split("clearKakaoInFlight(repeat.key);").length - 1, 2, "성공과 오류 양쪽에서 표시를 내린다");

await fixture.cleanup?.();
console.log(`PASS: V22.8.76 kakao intent and skill auth (${checks} checks)`);
