import assert from "node:assert/strict";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const fixture = await createV2265QaFixture();

async function get(path, cookie = fixture.cookie) {
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }), fixture.env, {});
}

async function post(path, values, cookie = fixture.cookie) {
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://ttokttok-accountbook.com",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
    redirect: "manual",
  }), fixture.env, {});
}

try {
  let response = await get("/health", "");
  eq(response.status, 200, "health endpoint stays available");
  const health = await response.json();
  eq(health.version, "V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY", "release version is exposed");

  response = await get("/payment-methods?month=2026-07&household_id=house-home");
  eq(response.status, 200, "asset page opens");
  let html = await response.text();
  for (const token of ["abPageAssets", "assetKindField", "primaryKinds", "kindMore", "assetCoreGrid", "assetOptional", "privacyDisclosure", "assetFormAction"]) {
    ok(html.includes(token), `asset page includes ${token}`);
  }
  ok(html.includes("필수 입력은 이름과 금액 두 가지뿐입니다"), "asset form explains the short path");
  ok(!html.includes("💛"), "legacy yellow-heart logo is removed from the asset page");
  ok(html.includes("v2281GuidedUiUxStyle"), "shared design system is injected");
  ok(html.includes("v2281GuidedUiUxRuntime"), "shared interaction runtime is injected");

  response = await get("/payment-methods?month=2026-07&household_id=house-trip");
  html = await response.text();
  ok(html.includes("아직 등록된 자산이 없어요"), "asset empty state keeps a clear heading");
  ok(html.includes("첫 자산 등록"), "asset empty state offers one primary action");
  ok(html.includes("compactPresets"), "asset empty state limits quick examples");

  response = await get("/reserve-plans?month=2026-07&household_id=house-home");
  eq(response.status, 200, "reserve page opens");
  html = await response.text();
  for (const token of ["abPageReserve", "reserveAdd", "reservePrimaryGrid", "reserveSchedule", "reserveOptional", "reserveOptionalGrid", "reserveSubmit"]) {
    ok(html.includes(token), `reserve page includes ${token}`);
  }
  ok(html.includes("언제, 얼마가 나가는지만 먼저 입력하세요"), "reserve form leads with the minimum required decision");
  ok(html.includes("정기지출 저장"), "reserve primary action is explicit");

  response = await get("/budgets?month=2026-07&household_id=house-home");
  eq(response.status, 200, "budget page opens");
  html = await response.text();
  for (const token of ["abPageBudgets", "calculationHelp", "계산 기준 보기", "incomeBudgetSuggestions", "expenseBudgetSuggestions", "planColumn"]) {
    ok(html.includes(token), `budget page includes ${token}`);
  }
  ok(!html.includes(">홈으로 돌아가기<"), "unexplained budget footer home link is removed");
  ok(!html.includes(">정기지출·분류 키워드 설정<"), "unexplained budget footer settings link is removed");
  ok(html.includes("이번 달 계획 입력"), "budget editor has a task-focused title");
  ok(html.includes("이번 달 계획 저장"), "budget editor has a task-focused action");

  response = await get("/menu?month=2026-07&household_id=house-home");
  eq(response.status, 200, "menu page opens");
  html = await response.text();
  for (const text of ["처음 사용 순서", "매일 쓰는 기능", "계획과 자산", "가계부 관리", "개인 설정과 도움말"]) {
    ok(html.includes(text), `menu renders ${text}`);
  }
  ok(html.includes("advancedGroup"), "secondary tools are collapsed");
  ok(!html.includes("오늘 바로 쓰기"), "old duplicated menu grouping is removed");

  response = await get("/start-guide?month=2026-07&household_id=house-home");
  eq(response.status, 200, "start guide opens");
  html = await response.text();
  ok(html.includes("처음 3단계"), "start guide is reduced to three essential steps");
  ok(html.includes("첫 기록 남기기"), "start guide prioritizes first record");
  ok(html.includes("저장 결과 확인"), "start guide closes the first-use feedback loop");
  ok(!html.includes("첫 기록까지 5단계"), "old five-step gate is removed");
  ok(html.includes("함께 쓰기·예산 등 추가 설정"), "advanced setup remains available on demand");

  response = await get("/my", "");
  eq(response.status, 200, "public login page stays available");
  html = await response.text();
  ok(html.includes("abV2281"), "global UI system also covers login");
  ok(html.includes("focus-visible"), "keyboard focus treatment is present");
  ok(html.includes("prefers-reduced-motion"), "reduced-motion preference is respected");
  ok(/aria-label=/.test(html), "form controls receive accessible names");

  response = await post("/my/backup-login", {
    login_name: "Bin",
    access_code: "secret77",
    access_code_confirm: "secret77",
    return_to: "/my/households",
  });
  eq(response.status, 409, "missing auth migration returns a controlled backup-login response");
  html = await response.text();
  ok(html.includes("인증 마이그레이션 적용 상태를 확인하세요"), "backup-login failure stays user-readable instead of throwing");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2281_GUIDED_UIUX_OK checks=${checks}`);
