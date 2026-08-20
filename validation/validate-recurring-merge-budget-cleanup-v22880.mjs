import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(/const APP_VERSION = "V\d+\.\d+\.\d+[-A-Z0-9]*"/.test(source), "runtime exposes the V22.8.80 release");

// ---------------------------------------------------------------------------
// 1. 고정지출을 정기 관리 화면으로 합침
// ---------------------------------------------------------------------------

// 라우트와 반영 RPC 는 그대로 둔다.
for (const route of ["/admin/recurring/save", "/admin/recurring/apply", "/admin/recurring/delete"]) {
  ok(source.includes(`"${route}"`), `${route} is preserved`);
}
ok(source.includes("accountbook_apply_recurring_v227"), "the apply RPC is unchanged");

// 정기 관리 페이지가 고정지출을 함께 읽는다.
ok(source.includes("fetchRecurring(env, householdId),"), "the reserve plans page loads recurring rows");
ok(source.includes('<section class="card" id="fixed">'), "the fixed-expense section lives on the reserve plans page");
ok(source.includes("매월 자동 반영되는 고정지출"), "the section is labelled");

// 지출자 선택은 기존 헬퍼를 재사용한다(활성 참여자만 고를 수 있어야 저장이 통과한다).
ok(source.includes('renderSpenderOptions(recurringMembers, "", "지출자 선택")'), "the spender picker reuses the shared helper");

// 홈에는 더 이상 고정지출 폼이 없다.
eq(source.includes('<section id="fixed" class="panel"><h2>고정지출</h2>'), false, "the home no longer carries the fixed-expense form");

// 돌아갈 곳이 사라진 /app#fixed 가 남아 있으면 안 된다.
eq(/\/app\?month=\$\{month\}&household_id=\$\{encodeURIComponent\(householdId\)\}#fixed/.test(source), false, "no handler returns to the removed home anchor");
eq(source.includes('safeAdminReturnPath(form.get("return_to") || "", "/app#fixed")'), false, "no handler falls back to /app#fixed");

// ---------------------------------------------------------------------------
// 2. 예산 settings JSON 폴백 제거
// ---------------------------------------------------------------------------

// 폴백 헬퍼가 모두 사라졌다(주석의 설명 한 줄은 남는다).
for (const fn of ["fetchSettingsBudgets", "fetchSettingsBudgetsStrict", "saveSettingsBudget",
                  "deleteSettingsBudget", "mergeBudgetRows", "cleanupSettingsBudgetAfterTableSave",
                  "normalizeBudgetRows", "budgetsSettingsKey"]) {
  eq(new RegExp(`^(async )?function ${fn}\\(`, "m").test(source), false, `${fn} is gone`);
}

// 예산은 표 한 곳에서만 읽는다.
ok(source.includes("async function fetchBudgets(env, householdId, month, options = {}) {"), "fetchBudgets still exists");
const fetchBudgetsBody = source.slice(source.indexOf("async function fetchBudgets("), source.indexOf("async function fetchBudgets(") + 1200);
eq(/accountbook_settings/.test(fetchBudgetsBody), false, "fetchBudgets no longer reads the settings store");
ok(/accountbook_budgets/.test(fetchBudgetsBody), "fetchBudgets reads the budgets table");

// 저장 실패가 조용히 넘어가지 않는다.
ok(source.includes('rememberOpsEvent({ kind: "budget_row_upsert_failed"'), "a failed upsert is recorded instead of silently falling back");
ok(source.includes('rememberOpsEvent({ kind: "budget_save_failed"'), "a failed budget save is recorded");
eq(source.includes("budget_saved_fallback_cleanup_deferred"), false, "the fallback-cleanup message is gone");

// 홈은 예산 키를 더 읽지 않는다.
ok(source.includes("const keys = [memberAliasSettingsKey(householdId), reportChallengeSettingsKey(householdId)];"), "the home settings bundle drops the budget key");
eq(source.includes("settingsRowsPromise"), false, "the home no longer threads settings budgets into fetchBudgets");

// SQL 은 그대로 남아 있어야 한다(되돌릴 때 근거가 된다).
ok(source.includes("accountbook_replace_budget_plan_v227"), "the bulk save RPC is untouched");

// ---------------------------------------------------------------------------
// 실제 왕복
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const req = (path, init = {}) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  ...init, headers: { cookie: fixture.cookie, ...(init.headers || {}) },
}), fixture.env, {});
const form = (data) => ({ method: "POST", body: new URLSearchParams(data), headers: { "content-type": "application/x-www-form-urlencoded" } });
const hh = "household_id=house-home";
const reservePage = async () => (await req(`/reserve-plans?month=2026-08&${hh}`)).text();
const budgetPage = async () => (await req(`/budgets?month=2026-08&${hh}`)).text();
const fixedSection = (html) => (html.match(/<section class="card[^"]*" id="fixed"[\s\S]*?<\/section>/) || [""])[0];

// 고정지출 추가 → 정기 관리 화면에 뜬다.
// 픽스처에 이미 "월세" 가 있으므로 겹치지 않는 이름을 쓴다.
const added = await req("/admin/recurring/save", form({
  household_id: "house-home", month: "2026-08", type: "expense", memo: "넷플릭스구독",
  amount: "17000", day_of_month: "9", category: "구독", user_id: "user-bin",
}));
eq(added.status, 303, "adding a fixed expense redirects");
const addedTo = decodeURIComponent(String(added.headers.get("location") || ""));
ok(addedTo.startsWith("/reserve-plans"), `the redirect lands on the reserve plans page (${addedTo.slice(0, 40)})`);
eq(/^\/app\b/.test(addedTo), false, "the redirect no longer goes to the home anchor");

let html = await reservePage();
const section = fixedSection(html);
ok(section, "the fixed-expense section renders");
ok(section.includes("넷플릭스구독"), "the saved fixed expense is listed");
ok(section.includes("17,000원"), "the amount is shown");
ok(section.includes("이번 달 아직 반영 안 됨"), "the apply state is shown");
ok(/fixedSum">[^<]*1건|fixedSum">[^<]*건/.test(section), "the section summarises the count");
ok(section.includes('action="/admin/recurring/apply"'), "the apply button is on the page");

// 삭제도 같은 화면에서 된다.
const planId = (section.match(/넷플릭스구독[\s\S]*?name="id" value="([^"]*)"/) || [])[1];
ok(planId, "the delete form carries the row id");
const deleted = await req("/admin/recurring/delete", form({ household_id: "house-home", month: "2026-08", id: planId }));
eq(deleted.status, 303, "deleting redirects");
ok(decodeURIComponent(String(deleted.headers.get("location") || "")).startsWith("/reserve-plans"), "delete returns to the reserve plans page");
html = await reservePage();
eq(fixedSection(html).includes("넷플릭스구독"), false, "the deleted fixed expense is gone");
ok(fixedSection(html).includes("월세"), "the other fixed expense survives");
// 삭제 결과만 본다. handleRecurringDelete 는 Prefer: return=representation 으로 지워진 행을
// 돌려받아야 성공으로 치는데 이 픽스처의 DELETE 목은 본문을 돌려주지 않는다(실제 PostgREST 는
// 돌려준다). 그래서 여기서는 리다이렉트 문구가 아니라 행이 실제로 사라졌는지로 판정한다.

// 홈에는 고정지출 폼이 없다.
const home = await (await req(`/app?month=2026-08&${hh}`)).text();
eq(home.includes("/admin/recurring/save"), false, "the home has no fixed-expense form");

// 예산은 폴백 없이도 저장·조회·삭제가 된다.
const bulk = await req("/my/budget-bulk/save", form({
  household_id: "house-home", month: "2026-08",
  income_name: "월급", income_amount: "3000000", budget_category: "식비", budget_amount: "500000",
}));
ok(String(bulk.headers.get("location")).includes("budget_saved"), "the bulk budget save succeeds");
let budgetHtml = await budgetPage();
ok(budgetHtml.includes("500,000"), "the category budget is stored and read back");
ok(budgetHtml.includes("3,000,000"), "the planned income is stored and read back");

const single = await req("/admin/budget/save", form({ household_id: "house-home", month: "2026-08", category: "교통", amount: "120000" }));
eq(single.status, 303, "the single budget save redirects");
ok(decodeURIComponent(String(single.headers.get("location"))).includes("budget_saved"), "the single budget save succeeds through the table");
budgetHtml = await budgetPage();
ok(budgetHtml.includes("120,000"), "the single budget is read back from the table");

const removed = await req("/admin/budget/delete", form({ household_id: "house-home", month: "2026-08", category: "교통" }));
ok(decodeURIComponent(String(removed.headers.get("location"))).includes("budget_deleted"), "the budget delete succeeds");
budgetHtml = await budgetPage();
eq(budgetHtml.includes("120,000"), false, "the deleted budget is gone");
ok(budgetHtml.includes("500,000"), "the other budget survives the delete");

console.log(`PASS: V22.8.79-1 recurring merge and budget fallback cleanup (${checks} checks)`);
