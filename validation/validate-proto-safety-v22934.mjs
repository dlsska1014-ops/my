// V22.9.34 — 사용자가 정한 이름이 객체 키가 되어 Object.prototype 을 바꾸던 결함(감사 SIM-10, 2차 점검 C01)을 고정한다.
//   1) 정적 검사: src/modules 에서 빈 객체({})로 만든 맵을 계산된 키로 읽고 쓰는 곳이 없어야 한다(원형 없는 객체를 쓴다).
//   2) 분류·결제수단·메모가 __proto__·constructor 같은 이름이어도 화면·카카오를 거친 뒤 Object.prototype 이 그대로다.
//   3) 그런 이름의 분류도 소계가 0원·NaN 이 되지 않는다(C01, SIM-11).
//   4) 새로 저장하는 분류·결제수단 이름으로 __proto__·constructor·prototype 은 받지 않는다.
//   5) 요청 앞뒤에서 원형 오염을 지우고 운영 이벤트로 남긴다.
//   6) 한 가계부의 입력이 같은 인스턴스의 다른 가계부 기록(분류·금액)으로 번지지 않는다(감사 재현 t09).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as acorn from "../tools/vendor/acorn.mjs";
import { budgetSummary } from "../src/index.js";
import { counter, fixture, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.34 원형 오염 방지 검사 통과");
const polluted = () => { const keys = []; for (const key in Object.prototype) keys.push(key); return keys; };
const scrubEvents = () => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === "prototype_pollution_scrubbed");

// ── 1) 정적 검사 ────────────────────────────────────────────
{
  const root = new URL("../src/modules/", import.meta.url);
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".js")) files.push(path);
    }
  })(root.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "Program"]);
  const visit = (node, fn, stack = []) => {
    if (!node || typeof node.type !== "string") return;
    fn(node, stack);
    const next = FUNCTIONS.has(node.type) ? [...stack, node] : stack;
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => child && typeof child.type === "string" && visit(child, fn, next));
      else if (value && typeof value.type === "string") visit(value, fn, next);
    }
  };
  const offenders = [];
  for (const file of files) {
    const ast = acorn.parse(readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module", locations: true });
    const decls = [];
    visit(ast, (node, stack) => {
      if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init?.type === "ObjectExpression" && node.init.properties.length === 0) decls.push({ name: node.id.name, fn: stack[stack.length - 1], line: node.loc.start.line });
    });
    visit(ast, (node, stack) => {
      if (node.type !== "MemberExpression" || !node.computed || node.object.type !== "Identifier") return;
      if (node.property.type === "Literal" || (node.property.type === "TemplateLiteral" && node.property.expressions.length === 0)) return;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const decl = decls.find((d) => d.name === node.object.name && d.fn === stack[i]);
        if (decl) { offenders.push(`${relative(root.pathname.replace(/^\/([A-Za-z]:)/, "$1"), file).replace(/\\/g, "/")}:${decl.line} ${decl.name}`); break; }
      }
    });
  }
  eq([...new Set(offenders)].join(", "), "", "SIM-10 빈 객체 맵을 계산된 키로 쓰는 곳이 없다(Object.create(null) 사용)");
}

const PROTO_NAMES = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];

// ── 2)·3) 저장된 이상한 이름을 그려도 원형이 그대로다 ─────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    PROTO_NAMES.forEach((name, index) => {
      fx.db.transactions.push({ id: `proto-${index}`, household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-10", type: index === 0 ? "income" : "expense", amount: 1000, category: name, memo: name, payment_method: name, source: "web_admin", created_at: "2026-07-10T00:00:00Z" });
      fx.db.accountbook_budgets.push({ id: `proto-budget-${index}`, household_id: "house-home", month: "2026-07", category: name, amount: 50000, created_at: "2026-07-01T00:00:00Z" });
    });
    const eventsBefore = scrubEvents().length;
    for (const path of [
      "/app?month=2026-07&household_id=house-home",
      "/app?month=2026-07&household_id=house-home&tab=transactions",
      "/my/analysis?month=2026-07&household_id=house-home",
      "/my/analysis?month=2026-07&household_id=house-home&view=report",
      "/budgets?month=2026-07&household_id=house-home",
      "/payment-methods?month=2026-07&household_id=house-home",
      "/settlement-summary?month=2026-07&household_id=house-home",
      "/annual?year=2026&household_id=house-home",
    ]) {
      const res = await page(fx, path);
      ok(res.status === 200 && polluted().length === 0, `SIM-10 ${path} 을 그린 뒤 Object.prototype 이 그대로다`);
    }
    await skill(fx, "안녕");
    await skill(fx, "2");
    await skill(fx, "7월 요약");
    await skill(fx, "이번달 예산");
    eq(polluted().join(","), "", "SIM-10 카카오 요약·예산 답장 뒤에도 Object.prototype 이 그대로다");
    eq(scrubEvents().length, eventsBefore, "SIM-10 화면과 카카오 처리 중 원형 오염이 한 번도 생기지 않았다(정리 이벤트 없음)");

    const analysis = (await page(fx, "/my/analysis?month=2026-07&household_id=house-home")).html;
    ok(!/NaN/.test(analysis), "C01 분석 화면에 NaN 이 없다");
    const summary = budgetSummary(fx.db.transactions.filter((row) => row.household_id === "house-home" && row.transaction_date.startsWith("2026-07")), fx.db.accountbook_budgets.filter((row) => row.household_id === "house-home" && row.month === "2026-07"));
    const constructorAlert = (summary.categoryAlerts || []).find((item) => item.category === "constructor");
    ok(constructorAlert && Number(constructorAlert.spent) === 1000 && Number.isFinite(Number(constructorAlert.rate)), "SIM-11 'constructor' 분류 예산도 사용액 1,000원과 사용률을 바르게 계산한다");
  });
});

// ── 4) 새 이름으로 __proto__ 를 받지 않는다 ─────────────────
await fixture(async (fx) => {
  const before = fx.db.transactions.length;
  for (const field of ["category", "payment_method"]) {
    await post(fx, "/admin/transactions", { household_id: "house-home", month: "2026-07", type: "expense", transaction_date: "2026-07-15", amount: "5000", memo: "점심", category: field === "category" ? "__proto__" : "식비", payment_method: field === "payment_method" ? "__proto__" : "", user_id: "user-bin", raw_text: "", quick_manual_amount: "1", quick_manual_date: "1" });
  }
  eq(fx.db.transactions.length, before, "SIM-10 분류·결제수단 이름이 __proto__ 인 기록은 저장하지 않는다");
});

// ── 5) 요청 앞뒤에서 원형 오염을 지운다 ─────────────────────
await fixture(async (fx) => {
  Object.prototype.qaPolluted = "x"; // eslint-disable-line no-extend-native
  const eventsBefore = scrubEvents().length;
  await page(fx, "/health");
  ok(!("qaPolluted" in {}) && polluted().length === 0, "SIM-10 다음 요청을 받으면 원형에 붙은 값을 지운다");
  ok(scrubEvents().length === eventsBefore + 1 && /qaPolluted/.test(scrubEvents().at(-1)?.detail || ""), "SIM-10 지운 키를 운영 이벤트로 남긴다");
});

// ── 6) 다른 가계부로 번지지 않는다(감사 재현 t09) ───────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const db = fx.db;
    db.users.push({ id: "user-x", kakao_user_key: "kakao_login:9999", nickname: "엑스", created_at: "2026-07-01T00:00:00.000Z" });
    db.households.push({ id: "house-x", name: "엑스네", invite_code: "XXXX9999", created_at: "2026-07-01T00:00:00.000Z" });
    db.household_members.push({ household_id: "house-x", user_id: "user-x", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
    const add = (fields) => post(fx, "/admin/transactions", { month: "2026-07", household_id: "house-home", transaction_date: "2026-07-15", raw_text: "", quick_manual_date: "1", quick_manual_amount: "1", user_id: "user-bin", payment_method: "", ...fields });
    await add({ type: "income", amount: "5000", category: "__proto__", memo: "용돈" });
    await add({ type: "expense", amount: "7000", category: "A전용분류", memo: "__proto__" });
    await page(fx, "/app?month=2026-07&household_id=house-home");
    eq(polluted().join(","), "", "t09 A 가계부의 입력과 화면 뒤에 Object.prototype 이 그대로다");
    await skill(fx, "7월 요약", { user: "kakao_login:9999" });
    await skill(fx, "1", { user: "kakao_login:9999" });
    await skill(fx, "점심 12000원 신한카드", { user: "kakao_login:9999" });
    await skill(fx, "수정 01번 메모 회사점심", { user: "kakao_login:9999" });
    const rows = db.transactions.filter((row) => row.household_id === "house-x");
    ok(rows.length === 1 && Number(rows[0].amount) === 12000 && rows[0].category !== "A전용분류", "t09 B 가계부 기록의 금액·분류가 A 의 입력으로 바뀌지 않는다");
  });
});

done();
