import assert from "node:assert/strict";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import * as worker from "../src/index.js";

export { worker };
export const HOUSE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", USER = "11111111-1111-4111-8111-111111111111";
export const BASE = "https://malhaebook.com";
export const csv = "날짜,구분,금액,내용,결제수단\n2026-10-17,지출,12345,합성 수명주기,현금";
export const calls = (fx, name) => fx.db.__rpc_calls.filter(c => c.name === name);
export async function fixture(task) {
  const fx = await createV2265QaFixture();
  for (const [k, v] of Object.entries(fx.db)) if (Array.isArray(v)) fx.db[k] = JSON.parse(JSON.stringify(v).replaceAll("house-home", HOUSE).replaceAll("user-bin", USER).replaceAll("user-wifi", "22222222-2222-4222-8222-222222222222"));
  fx.cookie = await fx.cookieFor(USER);
  fx.env.ADMIN_SESSION_SECRET = "qa-lifecycle-admin";
  fx.env.ADMIN_API_TOKEN = "qa-lifecycle-api";
  fx.trace = [];
  const memory = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "mock.supabase.co", "business network is disabled");
    fx.trace.push({ path: url.pathname, method: init.method || "GET", data: init.body ? JSON.parse(init.body) : null });
    return memory(input, init);
  };
  try { return await task(fx); } finally { fx.restore(); }
}
export async function post(fx, fields, path = "/my/import", cookie = fx.cookie, target = worker) {
  const body = fields instanceof FormData || fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  const response = await target.default.fetch(new Request(BASE + path, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body }), fx.env, { waitUntil() {} });
  return { response, status: response.status, html: await response.text() };
}
export async function preview(fx, extra = {}) {
  const p = await post(fx, { household_id: HOUSE, month: "2026-10", csv_text: csv, skip_duplicates: "0", ...extra });
  assert.equal(p.status, 200, p.html.slice(0, 300));
  p.token = p.html.match(/name="import_token" value="([^"]+)"/)?.[1];
  p.payload = await worker.verifyMyImportPreviewToken(fx.env, p.token);
  assert.ok(p.payload?.ready?.length);
  return p;
}
export function commit(fx, p, target = worker) {
  const form = new URLSearchParams({ import_action: "commit", import_token: p.token });
  for (const r of p.payload.ready) form.append("selected_rows", String(r.row_number));
  return post(fx, form, "/my/import", fx.cookie, target);
}
export const state = (fx, p) => fx.db.accountbook_settings.find(r => r.key === p.payload.source_state_key)?.value;
export async function rpc(fx, name, data) {
  const response = await globalThis.fetch(`https://mock.supabase.co/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}
export async function adminLogin(fx) {
  fx.env.ADMIN_PASSWORD = "qa-admin-123"; fx.env.ADMIN_SESSION_SECRET = "qa-admin-session";
  const login = await post(fx, { password: fx.env.ADMIN_PASSWORD }, "/login", "");
  return login.response.headers.getSetCookie().join(";").match(/ab_admin=[^;]+/)?.[0] || "";
}
export async function adminJson(fx, cookie) {
  const response = await worker.default.fetch(new Request(BASE + "/admin/import/json", { method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ household_id: HOUSE, user_id: USER, raw_text: csv.replace("12345", "23456") }) }), fx.env, { waitUntil() {} });
  return { status: response.status, data: await response.json() };
}
export function adminPlan(fx, cookie) {
  const selected = [{ user_id: USER, type: "expense", transaction_date: "2026-10-17", amount: 34567, category: "식비", memo: "합성 관리자 적용", payment_method: "현금" }];
  const form = new FormData();
  for (const [k, v] of Object.entries({ household_id: HOUSE, month: "2026-10", admin_password: fx.env.ADMIN_PASSWORD, confirm_text: "가져오기 적용" })) form.set(k, v);
  form.set("plan_file", new File([JSON.stringify({ app: "kakao-accountbook", mode: "candidate_plan_only_no_db_write", selected })], "synthetic.json", { type: "application/json" }));
  return post(fx, form, "/backup/apply", cookie);
}
