import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };
const fixture = await createV2265QaFixture();

async function request(path, options = {}) {
  return await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    ...options,
    headers: { cookie: fixture.cookie, ...(options.headers || {}) },
    redirect: "manual",
  }), fixture.env, {});
}

async function getHtml(path) {
  const response = await request(path);
  eq(response.status, 200, `${path} renders`);
  return await response.text();
}

async function postForm(path, entries) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, value);
  return await request(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

try {
  let html = await getHtml("/my/households?month=2026-07&household_id=house-home&manage=house-home");
  ok(html.includes("1 이름·내 비밀번호") && html.includes("2 가계부 생성") && html.includes("3 초대"), "creation flow is explicit");
  ok(html.includes('name="display_name" value="Bin"'), "Kakao nickname pre-fills creator display name");
  ok(html.includes('name="access_code_confirm"'), "first creation requires password confirmation");
  ok(html.includes("가계부 영구 삭제") && html.includes('name="confirm_name"'), "owner has guarded household deletion");
  ok(html.includes("참여자·초대") && html.includes("단톡방 연결") && html.includes("백업·가져오기"), "per-household options cover core management");

  const returnTo = "/my/households?month=2026-07&household_id=house-home&manage=house-home#manage";
  let response = await postForm("/my/backup-login", [
    ["nickname", "Bin"], ["access_code", "secret65"], ["access_code_confirm", "secret65"], ["return_to", returnTo],
  ]);
  eq(response.status, 303, "personal password save redirects");
  ok(String(response.headers.get("location") || "").includes("/my/households?month=2026-07") && String(response.headers.get("location") || "").endsWith("#manage"), "security save returns to previous household route");

  response = await postForm("/my/backup-login", [
    ["nickname", "Bin"], ["access_code", "updated65"], ["access_code_confirm", "updated65"], ["return_to", returnTo],
  ]);
  eq(response.status, 303, "password replacement succeeds");
  const identitySetting = fixture.db.accountbook_settings.find((row) => row.key === "user_identity_links");
  const links = JSON.parse(identitySetting?.value || "{}");
  eq(Object.values(links).filter((item) => item.provider === "local_web" && item.user_id === "user-bin").length, 1, "password change leaves one active local identity");

  const beforeCreate = fixture.db.households.length;
  response = await postForm("/my/create", [
    ["household_name", "친구 제주여행"], ["display_name", "Bin"], ["access_code", "secret65"], ["month", "2026-07"],
  ]);
  eq(response.status, 303, "wrong password create returns safely");
  ok(String(response.headers.get("location") || "").includes("personal_password_invalid"), "wrong password explains cause");
  eq(fixture.db.households.length, beforeCreate, "wrong password performs no household write");

  response = await postForm("/my/create", [
    ["household_name", "친구 제주여행"], ["display_name", "Bin"], ["access_code", "updated65"], ["month", "2026-07"], ["template", "travel"],
  ]);
  eq(response.status, 303, "validated creation redirects");
  ok(String(response.headers.get("location") || "").includes("step=invite"), "new household continues to invitation stage");
  const created = fixture.db.households.find((row) => row.name === "친구 제주여행");
  ok(Boolean(created), "chosen household name is preserved");
  ok(fixture.db.household_members.some((row) => row.household_id === created.id && row.user_id === "user-bin" && row.role === "owner"), "creator becomes owner");

  html = await getHtml("/meeting-households?month=2026-07");
  ok(html.includes("이름·비밀번호 확인 후 만들기") && html.includes("template=travel"), "template opens guided creation instead of instant date naming");
  ok(!/<form[^>]+action="\/my\/create"[^>]*>[\s\S]*type="hidden"[^>]+household_name/i.test(html), "template cannot silently submit a hidden date name");

  html = await getHtml("/budgets?month=2026-07&household_id=house-home");
  ok(html.includes("실제 수입 · 기록 자동합계") && html.includes("3,380,000원"), "actual income is summarized from income records");
  ok(html.includes("예상 수입 · 종류별 합계") && html.includes("3,500,000원"), "planned income is summarized from itemized income types");
  ok(html.includes("지출 예산 · 분류별 합계") && html.includes("1,230,000원"), "expense budget is category sum");
  ok(html.includes("월 총액 직접입력 없음") && !html.includes("월 전체 예산 직접 설정 (선택)"), "new budget UI removes manual monthly total control");
  ok(html.includes('name="budget_return" value="budgets"'), "budget editor preserves its origin after save");

  response = await postForm("/my/budget-bulk/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["budget_return", "budgets"],
    ["income_name", "급여"], ["income_amount", "3300000"],
    ["income_name", "상여"], ["income_amount", "200000"],
    ["budget_category", "식비"], ["budget_amount", "750000"],
    ["budget_category", "교통"], ["budget_amount", "220000"],
    ["budget_category", "빈 항목"], ["budget_amount", "0"],
  ]);
  eq(response.status, 303, "itemized budget save redirects");
  ok(String(response.headers.get("location") || "").startsWith("/budgets?"), "budget save stays on budget page");
  const savedBudgets = fixture.db.accountbook_budgets.filter((row) => row.household_id === "house-home" && row.month === "2026-07");
  ok(savedBudgets.some((row) => row.category === "__income:급여" && Number(row.amount) === 3300000), "income type saved");
  ok(savedBudgets.some((row) => row.category === "식비" && Number(row.amount) === 750000), "expense category saved");
  ok(!savedBudgets.some((row) => row.category === "__total" || Number(row.amount) === 0), "legacy total and zero rows are cleared");

  response = await postForm("/my/household/delete", [
    ["household_id", "house-trip"], ["month", "2026-07"], ["confirm_name", "다른 이름"], ["access_code", "updated65"], ["understand_members", "1"],
  ]);
  ok(String(response.headers.get("location") || "").includes("household_delete_name_mismatch"), "delete name mismatch is explained");
  ok(fixture.db.households.some((row) => row.id === "house-trip"), "failed delete preserves household");

  response = await postForm("/my/household/delete", [
    ["household_id", "house-trip"], ["month", "2026-07"], ["confirm_name", "7월 제주여행"], ["access_code", "updated65"], ["understand_members", "1"],
  ]);
  eq(response.status, 303, "guarded delete completes");
  ok(!fixture.db.households.some((row) => row.id === "house-trip"), "household row removed");
  ok(!fixture.db.household_members.some((row) => row.household_id === "house-trip"), "deleted household memberships removed");
  ok(!fixture.db.transactions.some((row) => row.household_id === "house-trip"), "deleted household transactions removed");

  html = await getHtml("/smart-tools?month=2026-07&household_id=house-home");
  ok(html.includes("초기 서비스 · 모두 무료") && html.includes("영수증 스마트 기록") && !/checkout|결제하기|카드번호/.test(html), "smart tools are open without billing");

  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  ok(source.includes(".smartLine input{width:100%;min-width:0}"), "smart input mobile overflow guard is present");
  ok(source.includes('label: "메뉴"') && source.includes('["menu", "메뉴", "☰"'), "bottom navigation uses an honest menu label");
  ok(/<footer\\b/.test(source) || source.includes("/<footer\\b"), "footer insertion checks the real element");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2265_MOBILE_HOUSEHOLD_BUDGET_OK assertions=${assertions}`);
