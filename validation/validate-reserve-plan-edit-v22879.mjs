import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.96-HOME-TAB-STOPS"'), "runtime exposes the V22.8.79 release");

// ---------------------------------------------------------------------------
// 정적 계약
// ---------------------------------------------------------------------------

// 1. 수정 라우트와 핸들러가 새로 생겼다.
ok(source.includes('if (url.pathname === "/admin/reserve-plan/update" && request.method === "POST") {'), "the update route is registered");
ok(source.includes("async function handleReservePlanUpdate(request, env) {"), "the update handler exists");
ok(source.includes("async function updateReservePlan(env, householdId = \"\", id = \"\", data = {}) {"), "the update helper exists");

// 2. 저장 키 형식은 바꾸지 않는다(금지 사항).
ok(source.includes('return `reserve_plans:${String(householdId || "default").trim() || "default"}`;'), "the reserve_plans settings key format is unchanged");
ok(source.includes("await saveReservePlans(env, householdId, next);"), "the update writes through the same save path");

// 3. 기존 라우트와 권한 판정은 유지된다.
for (const route of ["/admin/reserve-plan/create", "/admin/reserve-plan/delete"]) {
  ok(source.includes(`"${route}"`), `${route} is preserved`);
}
ok(source.includes("이 정기지출 항목을 삭제할까요? 이미 기록된 거래는 삭제되지 않습니다."), "the delete confirmation copy is unchanged");
ok(source.includes('if (!["owner", "admin"].includes(role)) return redirectResponse(`${back}&err=${encodeURIComponent("정기 항목 수정 권한이 없습니다.")}`);'), "the update handler keeps the owner/admin gate");

// 4. 데이터 모델은 파생 추가만 한다(하위호환).
ok(source.includes('const type = String(item.type || "") === "income" ? "income" : "expense";'), "type defaults to expense for legacy items");
ok(source.includes("const isRecurring = item.is_recurring === undefined || item.is_recurring === null"), "is_recurring is derived when missing");
ok(source.includes('? recurrence === "monthly"'), "is_recurring derives from the recurrence");

// 5. 폼에 수입/지출 라디오와 매월 반복 체크박스가 있다.
ok(source.includes('function reservePlanTypeRadios('), "the type radio helper exists");
ok(source.includes('<input type="checkbox" name="is_recurring" value="1"/>'), "the add form has the repeat checkbox");
ok(source.includes('function renderReservePlanEditForm(plan = {}) {'), "the prefilled edit form exists");

// 6. 두 핸들러 모두 폼 값을 실제로 전달한다(배선 누락 방지).
eq((source.match(/type: String\(form\.get\("type"\) \|\| "expense"\),/g) || []).length, 2, "both create and update forward the type field");
eq((source.match(/is_recurring: form\.get\("is_recurring"\) === "1",/g) || []).length, 2, "both create and update forward the repeat flag");

// 7. 집계에 부호가 반영된다.
ok(source.includes("const monthlyIncomeTotal = statuses.filter(isIncome).reduce"), "income is aggregated separately");
ok(source.includes("const monthlyNetTotal = monthlyIncomeTotal - monthlyReserveTotal;"), "a net figure is derived");
ok(source.includes("const monthDueNet = monthDueIncome - monthDueExpense;"), "the month-due figure nets income against expense");

// 8. 페이지 이름이 바뀌었다.
ok(source.includes("<title>정기 수입·지출</title>"), "the page title is renamed");
ok(source.includes("<h1>정기 수입·지출</h1>"), "the page heading is renamed");

// ---------------------------------------------------------------------------
// 실제 왕복
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const req = (path, init = {}) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  ...init,
  headers: { cookie: fixture.cookie, ...(init.headers || {}) },
}), fixture.env, {});
const form = (data) => ({ method: "POST", body: new URLSearchParams(data), headers: { "content-type": "application/x-www-form-urlencoded" } });
const page = async () => (await req("/reserve-plans?month=2026-08&household_id=house-home")).text();

// 하위호환: 픽스처의 자동차보험에는 type·is_recurring 이 없다.
let html = await page();
ok(html.includes(">지출</em>"), "a legacy item renders as an expense");
ok(/amtExpense">-/.test(html), "a legacy item carries the minus sign");
ok(html.includes("월 준비 권장액"), "the monthly preparation metric survives");

// 수정 폼이 실제 값으로 프리필된다.
const editForm = (html.match(/action="\/admin\/reserve-plan\/update"[\s\S]*?<\/form>/) || [""])[0];
ok(editForm, "the edit form renders on the card");
eq((editForm.match(/name="name" value="([^"]*)"/) || [])[1], "자동차보험", "the edit form prefills the name");
eq((editForm.match(/name="amount"[^>]*value="([^"]*)"/) || [])[1], "1200000", "the edit form prefills the amount");
const planId = (editForm.match(/name="id" value="([^"]*)"/) || [])[1];
ok(planId, "the edit form carries the plan id");

// 수정 왕복.
const updated = await req("/admin/reserve-plan/update", form({
  household_id: "house-home", month: "2026-08", id: planId, name: "자동차보험",
  amount: "1500000", type: "expense", recurrence: "annual", due_month_1: "9", due_day: "20",
  category: "보험", memo: "갱신",
}));
eq(updated.status, 303, "the update redirects");
ok(String(updated.headers.get("location")).includes("msg=reserve_updated"), "the update reports success");
html = await page();
ok(html.includes("1,500,000원"), "the edited amount is persisted");
eq(html.includes("1,200,000원"), false, "the old amount is gone");

// 권한 없는 사용자는 수정하지 못한다(구성원 role=member).
const memberCookie = await fixture.cookieFor("user-wifi");
const denied = await app.fetch(new Request("https://ttokttok-accountbook.com/admin/reserve-plan/update", {
  ...form({ household_id: "house-home", month: "2026-08", id: planId, name: "몰래수정", amount: "1", type: "expense", recurrence: "annual" }),
  headers: { cookie: memberCookie, "content-type": "application/x-www-form-urlencoded" },
}), fixture.env, {});
eq(denied.status, 303, "an unauthorised update still redirects");
ok(String(denied.headers.get("location")).includes("err="), "an unauthorised update is rejected");
html = await page();
eq(html.includes("몰래수정"), false, "the unauthorised edit did not persist");

// 수입 항목: + 부호, 매월 반복 배지, 순액.
const created = await req("/admin/reserve-plan/create", form({
  household_id: "house-home", month: "2026-08", name: "월세수입", amount: "600000",
  type: "income", is_recurring: "1", recurrence: "monthly", due_day: "5", category: "기타수입",
}));
eq(created.status, 303, "creating an income plan redirects");
html = await page();
ok(html.includes(">수입</em>"), "the income badge renders");
ok(html.includes(">매월 반복</em>"), "the repeat badge renders");
ok(/amtIncome">\+600,000원/.test(html), "income carries a plus sign");
ok(html.includes("순액"), "the net figure is shown once income exists");

// 없는 id 를 수정하려 하면 실패하고 데이터는 그대로다.
// 금액은 파서가 실제로 받아들이는 값을 쓴다 — 맨 세 자리("999")는 extractAmount 가
// 금액으로 보지 않아 이름·금액 검사에서 먼저 막히고, 그러면 이 경로를 못 재게 된다.
const missing = await req("/admin/reserve-plan/update", form({
  household_id: "house-home", month: "2026-08", id: "does-not-exist", name: "유령", amount: "999000", type: "expense", recurrence: "annual",
}));
eq(missing.status, 303, "an unknown id redirects");
const missingLocation = decodeURIComponent(String(missing.headers.get("location") || ""));
ok(missingLocation.includes("err="), "an unknown id reports an error");
ok(missingLocation.includes("수정할 항목을 찾지 못했습니다"), "the unknown id error names the real cause");
eq(missingLocation.includes("msg=reserve_updated"), false, "an unknown id never reports success");
html = await page();
eq(html.includes("유령"), false, "an unknown id creates nothing");
ok(html.includes("월세수입"), "existing plans survive a failed update");

// 금액이 비면 저장하지 않는다(추가 경로와 같은 판정).
const blankAmount = await req("/admin/reserve-plan/update", form({
  household_id: "house-home", month: "2026-08", id: planId, name: "자동차보험", amount: "", type: "expense", recurrence: "annual",
}));
ok(decodeURIComponent(String(blankAmount.headers.get("location") || "")).includes("이름과 금액"), "a blank amount is rejected");
html = await page();
ok(html.includes("1,500,000원"), "a rejected edit leaves the previous amount untouched");

console.log(`PASS: V22.8.79 reserve plan edit (${checks} checks)`);
