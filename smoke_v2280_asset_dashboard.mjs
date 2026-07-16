import assert from "node:assert/strict";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

async function userCookie(userId, secret) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${expires}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString("base64url")}`)}`;
}

function settingValue(db, key, fallback) {
  const row = db.accountbook_settings.find((item) => item.key === key);
  if (!row) return structuredClone(fallback);
  try { return JSON.parse(row.value); } catch { return structuredClone(fallback); }
}

function saveSetting(db, key, value) {
  const row = db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = JSON.stringify(value);
  else db.accountbook_settings.push({ id: `qa-${key}`, key, value: JSON.stringify(value), created_at: new Date().toISOString() });
}

function totals(assets) {
  const assetKinds = new Set(["bank_account", "cash", "easy_pay", "savings", "investment", "crypto", "pension", "real_estate", "car", "asset"]);
  let assetTotal = 0;
  let liabilityTotal = 0;
  for (const item of assets) {
    const amount = Math.max(0, Math.round(Number(item.balance || 0)));
    if (assetKinds.has(item.kind) && item.include_in_asset !== false) assetTotal += amount;
    if (item.kind === "loan") liabilityTotal += amount;
  }
  return { assetTotal, liabilityTotal, netWorth: assetTotal - liabilityTotal };
}

const fixture = await createV2265QaFixture();
const fixtureFetch = globalThis.fetch;
const rpcCalls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "mock.supabase.co" && url.pathname.endsWith("/rpc/accountbook_mutate_payment_assets_v2280")) {
    const body = JSON.parse(String(init.body || "{}"));
    rpcCalls.push(structuredClone(body));
    const householdId = String(body.p_household_id || "");
    const assetsKey = `payment_assets:${householdId}`;
    const historyKey = `asset_history:${householdId}`;
    let assets = settingValue(fixture.db, assetsKey, []);
    if (body.p_action === "create") assets.push(body.p_asset);
    if (body.p_action === "update") assets = assets.map((item) => item.id === body.p_asset_id ? body.p_asset : item);
    if (body.p_action === "delete") assets = assets.filter((item) => item.id !== body.p_asset_id);
    const sum = totals(assets);
    const history = settingValue(fixture.db, historyKey, {});
    history[body.p_snapshot_month] = { asset_total: sum.assetTotal, liability_total: sum.liabilityTotal, net_worth: sum.netWorth, saved_at: new Date().toISOString() };
    saveSetting(fixture.db, assetsKey, assets);
    saveSetting(fixture.db, historyKey, history);
    return new Response(JSON.stringify({ assets, history, history_recorded: true }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return fixtureFetch(input, init);
};

const ownerCookie = fixture.cookie;
const memberCookie = await userCookie("user-wifi", fixture.env.USER_SESSION_SECRET);

async function get(path, cookie = ownerCookie) {
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie }, redirect: "manual" }), fixture.env, {});
}

async function post(path, values, cookie = ownerCookie, extraHeaders = {}) {
  const body = new URLSearchParams(values);
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://ttokttok-accountbook.com",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body,
    redirect: "manual",
  }), fixture.env, {});
}

try {
  let response = await get("/payment-methods?month=2026-07&household_id=house-home");
  eq(response.status, 200, "owner opens the asset dashboard");
  let html = await response.text();
  for (const text of ["현재 순자산", "자산 구성", "순자산 추이", "입출금·현금", "카드·결제수단", "미등록 결제수단"]) ok(html.includes(text), `dashboard renders ${text}`);
  ok(html.includes("5,200,000원"), "bank balance contributes to net worth");
  ok(html.includes("148,000원"), "registered credit-card usage is matched from transactions");
  ok(!html.includes("/card-benefits?"), "unfinished card-performance link remains hidden");
  ok(html.includes('action="/admin/payment-asset/update"'), "owner receives edit controls");

  response = await get("/payment-methods?month=2026-07&household_id=house-home", memberCookie);
  eq(response.status, 200, "member can read shared household assets");
  html = await response.text();
  ok(!html.includes('action="/admin/payment-asset/update"'), "member does not receive edit controls");
  ok(html.includes("해당 가계부 참여자에게 공유됩니다"), "member sees the sharing-scope notice");

  const initialLength = settingValue(fixture.db, "payment_assets:house-home", []).length;
  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "cash", name: "권한없는 현금", balance: "1000", include_in_asset: "on" }, memberCookie);
  eq(response.status, 303, "member write is redirected");
  eq(settingValue(fixture.db, "payment_assets:house-home", []).length, initialLength, "member write changes no assets");

  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "savings", name: "비상금 통장", issuer: "토스뱅크", balance: "3000000", include_in_asset: "on", memo: "가족 비상금" });
  eq(response.status, 303, "owner creates an asset");
  ok(String(response.headers.get("location") || "").includes("msg=payment_asset_saved"), "create returns a readable success code");
  eq(rpcCalls.at(-1)?.p_action, "create", "create uses the V22.8 atomic RPC");
  eq(rpcCalls.at(-1)?.p_snapshot_month, "2026-07", "create records the current KST month");
  let assets = settingValue(fixture.db, "payment_assets:house-home", []);
  const emergency = assets.find((item) => item.name === "비상금 통장");
  ok(emergency, "created asset is persisted");
  let history = settingValue(fixture.db, "asset_history:house-home", {});
  eq(history["2026-07"].net_worth, 8200000, "asset and history commit together");

  const callsBeforeDuplicate = rpcCalls.length;
  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "cash", name: " 비상금통장 ", balance: "1", include_in_asset: "on" });
  eq(response.status, 303, "duplicate display name returns to the dashboard");
  const duplicateLocation = String(response.headers.get("location") || "");
  const duplicateError = new URL(duplicateLocation, "https://ttokttok-accountbook.com").searchParams.get("err") || "";
  ok(duplicateError.includes("같은 이름"), `duplicate explains why it was not saved (${duplicateError})`);
  eq(rpcCalls.length, callsBeforeDuplicate, "duplicate is rejected before mutation");

  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "bank_account", name: "계좌 1234-5678-9012", balance: "1000", include_in_asset: "on" });
  ok(decodeURIComponent(String(response.headers.get("location") || "")).includes("계좌번호"), "full financial number is rejected with guidance");
  eq(rpcCalls.length, callsBeforeDuplicate, "sensitive-number rejection does not mutate data");

  response = await post("/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id: emergency.id, mode: "balance", balance: "3500000" });
  eq(response.status, 303, "quick balance update succeeds without metadata fields");
  assets = settingValue(fixture.db, "payment_assets:house-home", []);
  const updatedEmergency = assets.find((item) => item.id === emergency.id);
  eq(updatedEmergency.name, "비상금 통장", "quick balance update preserves the name");
  eq(updatedEmergency.kind, "savings", "quick balance update preserves the kind");
  eq(updatedEmergency.balance, 3500000, "quick balance update changes only the balance");

  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "loan", name: "주택 대출", issuer: "KB국민", balance: "1200000", memo: "남은 원금" });
  eq(response.status, 303, "liability is created");
  history = settingValue(fixture.db, "asset_history:house-home", {});
  eq(history["2026-07"].asset_total, 8700000, "asset total excludes cards and includes savings");
  eq(history["2026-07"].liability_total, 1200000, "loan is recorded as a liability");
  eq(history["2026-07"].net_worth, 7500000, "loan is subtracted from net worth");

  response = await post("/admin/payment-asset/create", { household_id: "house-home", month: "2026-07", kind: "credit_card", name: "현대카드", issuer: "현대", balance: "0" });
  eq(response.status, 303, "second credit card is registered");
  response = await get("/payment-methods?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes("220,000원"), "credit-card usage totals multiple registered cards");
  ok(html.includes("미결제 신용카드 반영 시 약 7,280,000원"), "pending estimate subtracts credit-card usage once");
  ok(html.includes("현대카드 연결"), "transaction method is connected to the registered asset");

  const callsBeforeCsrf = rpcCalls.length;
  response = await post("/admin/payment-asset/update", { household_id: "house-home", month: "2026-07", id: emergency.id, mode: "balance", balance: "999999" }, ownerCookie, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
  eq(response.status, 403, "cross-site asset mutation is blocked");
  eq(rpcCalls.length, callsBeforeCsrf, "blocked CSRF request never reaches the RPC");

  response = await app.fetch(new Request("https://ttokttok-accountbook.com/admin/payment-asset/update", {
    method: "POST",
    headers: { cookie: ownerCookie, origin: "null", referer: "kakao://inapp", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ household_id: "house-home", month: "2026-07", id: emergency.id, mode: "balance", balance: "3600000" }),
    redirect: "manual",
  }), fixture.env, {});
  eq(response.status, 303, "authenticated Kakao WebView balance update succeeds");

  const loan = settingValue(fixture.db, "payment_assets:house-home", []).find((item) => item.name === "주택 대출");
  response = await post("/admin/payment-asset/delete", { household_id: "house-home", month: "2026-07", id: loan.id });
  eq(response.status, 303, "owner deletes a liability");
  ok(!settingValue(fixture.db, "payment_assets:house-home", []).some((item) => item.id === loan.id), "deleted liability is removed");

  response = await get("/payment-methods?month=2026-07&household_id=house-trip");
  html = await response.text();
  ok(!html.includes(emergency.id) && !html.includes("3,600,000원"), "assets do not leak across households");
  ok(html.includes("아직 등록된 자산이 없어요"), "empty household receives onboarding");
  eq(rpcCalls.filter((call) => call.p_household_id === "house-trip").length, 0, "read-only household switch performs no mutation");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2280_ASSET_DASHBOARD_OK checks=${checks} rpc_calls=${rpcCalls.length}`);
