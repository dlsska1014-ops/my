import assert from "node:assert/strict";
import app, { buildSettlementModel } from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

async function signedSessionCookie(userId, secret) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${expires}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString("base64url")}`)}`;
}

const fixture = await createV2265QaFixture();
fixture.env.CRON_SECRET = "cron-v2267";

async function request(path, options = {}) {
  const cookie = options.cookie === undefined ? fixture.cookie : options.cookie;
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    ...options,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
  }), fixture.env, {});
}

async function html(path) {
  const response = await request(path);
  eq(response.status, 200, `${path} renders`);
  return response.text();
}

async function post(path, entries, options = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, String(value));
  return request(path, { ...options, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(options.headers || {}) }, body });
}

try {
  const health = await (await request("/health")).json();
  eq(health.version, "V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX", "health exposes stabilization version");
  eq(health.mode, "release-candidate-security-spender-privacy-hotfix", "health exposes stabilization mode");

  const hiddenGetRoutes = [
    "/share", "/share/meme?id=legacy", "/share/meme-image?id=legacy",
    "/meme", "/meme-image", "/meme-lab", "/meme-archive", "/meme-rank", "/meme-stats",
    "/meme-card-content", "/meme-card-plan", "/meme-cards", "/meme-content-center", "/meme-library", "/meme-publish-center",
    "/meme-motion-guide", "/nanobanana-prompts", "/meme-animation-guide", "/meme-review-check", "/meme-safety-check", "/meme-policy-check",
    "/meme-share-kit", "/meme-kakao-share-kit", "/meme-share-copy", "/meme-card-catalog.json", "/card-benefits",
  ];
  for (const path of hiddenGetRoutes) {
    const response = await request(path);
    eq(response.status, 404, `${path} is hidden by default`);
    ok(/noindex/i.test(response.headers.get("x-robots-tag") || ""), `${path} is excluded from indexing`);
  }
  const productionFlags = { ...fixture.env, MEME_CARDS_ENABLED: "1", CARD_PERFORMANCE_ENABLED: "1" };
  for (const path of ["/meme-lab", "/card-benefits"]) {
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie: fixture.cookie } }), productionFlags, {});
    eq(response.status, 404, `${path} stays hidden when a legacy feature flag remains enabled without the QA lock`);
  }
  for (const path of ["/admin/meme/save", "/admin/meme/delete", "/admin/meme/react", "/share/meme/like", "/share/meme/share"]) {
    const response = await post(path, [["id", "legacy"]]);
    eq(response.status, 404, `${path} write endpoint is hidden before authorization or mutation`);
  }
  eq(fixture.db.accountbook_meme_cards.length, 0, "hidden meme writes leave storage untouched");

  let body = await html("/menu?month=2026-07&household_id=house-home");
  for (const label of ["무료 스마트 도구", "영수증 기록", "자동 리포트", "고급 정산", "자산·결제수단"]) ok(body.includes(label), `menu keeps ${label}`);
  for (const hidden of ["카드 혜택", "소비 카드", "소비 도감", "href=\"/card-benefits", "href=\"/meme"]) ok(!body.includes(hidden), `menu hides ${hidden}`);

  body = await html("/smart-tools?month=2026-07&household_id=house-home");
  for (const label of ["영수증 스마트 기록", "반복 거래 자동화", "고급 정산", "주간·월간 리포트", "스마트 예산·미션", "가족별 비교 분석"]) ok(body.includes(label), `smart tools keep ${label}`);
  for (const hidden of ["카드 혜택 계산", "소비 카드·보관함", "href=\"/card-benefits", "href=\"/meme"]) ok(!body.includes(hidden), `smart tools hide ${hidden}`);
  ok(body.includes("준비가 끝나지 않은 기능은 메뉴와 직접 경로에서 숨깁니다"), "smart tools explain the stabilization policy");
  body = await html("/my/premium?month=2026-07&household_id=house-home");
  ok(body.includes("스마트 생활 도구") && body.includes("현재 공개된 기능은 결제나 구독 등급 없이 모두 무료"), "legacy premium URL renders the same free smart-tools experience");
  ok(!body.includes("결제하기") && !body.includes("잠금 해제"), "legacy premium URL has no paywall action");

  const skillPayload = { userRequest: { utterance: "밈", user: { id: "qa-meme", type: "botUserKey", properties: { botUserKey: "qa-meme", nickname: "QA" } } } };
  const skillResponse = await request("/skill", { method: "POST", cookie: "", headers: { "content-type": "application/json" }, body: JSON.stringify(skillPayload) });
  eq(skillResponse.status, 200, "hidden meme command returns a safe Kakao response");
  const skillText = String((await skillResponse.json())?.template?.outputs?.[0]?.simpleText?.text || "");
  ok(skillText.includes("완성도 점검 중") && skillText.includes("이번 달 요약"), "Kakao command guides the user to an available feature");
  ok(!skillText.includes("/meme"), "Kakao command does not expose a hidden route");

  body = await html("/receipts?month=2026-07&household_id=house-home");
  ok(body.includes("이미지는 서버에 업로드하지 않고") && body.includes("직접 확인해야만 저장"), "receipt page explains privacy and explicit confirmation");
  const receiptStart = fixture.db.transactions.length;
  await post("/my/receipt/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", "2026-07-15"],
    ["merchant", "미확인마트"], ["amount", "9900"],
  ]);
  eq(fixture.db.transactions.length, receiptStart, "unconfirmed receipt performs no write");
  await post("/my/receipt/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", "2026-02-30"],
    ["merchant", "잘못된날짜"], ["amount", "9900"], ["confirmed", "yes"],
  ]);
  eq(fixture.db.transactions.length, receiptStart, "invalid receipt date performs no write");

  let response = await post("/my/receipt/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", "2026-07-15"],
    ["merchant", "스타마트"], ["amount", "35400"], ["category", "장보기"], ["payment_method", "국민카드"],
    ["receipt_text", "스타마트\n2026-07-15\n합계 35,400원\n국민카드"], ["confirmed", "yes"],
  ]);
  eq(response.status, 303, "confirmed receipt redirects");
  eq(fixture.db.transactions.length, receiptStart + 1, "confirmed receipt creates one transaction");
  const savedReceipt = fixture.db.transactions.at(-1);
  ok(savedReceipt.source === "receipt_confirmed" && savedReceipt.household_id === "house-home" && savedReceipt.user_id === "user-bin", "receipt is scoped to the signed-in member and household");

  const wifiCookie = await signedSessionCookie("user-wifi", fixture.env.USER_SESSION_SECRET);
  response = await post("/my/receipt/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", "2026-07-15"],
    ["merchant", "스타마트"], ["amount", "35400"], ["category", "장보기"], ["payment_method", "국민카드"],
    ["receipt_text", "스타마트\n2026-07-15\n합계 35,400원\n국민카드"], ["confirmed", "yes"],
  ], { cookie: wifiCookie });
  eq(fixture.db.transactions.length, receiptStart + 1, "same household receipt is deduplicated across members");
  ok(String(response.headers.get("location") || "").includes("duplicate_receipt"), "cross-member duplicate explains why it was skipped");

  const homeMembership = fixture.db.household_members.find((row) => row.household_id === "house-home" && row.user_id === "user-bin");
  homeMembership.role = "viewer";
  await post("/my/receipt/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["transaction_date", "2026-07-16"],
    ["merchant", "조회전용"], ["amount", "12000"], ["confirmed", "yes"],
  ]);
  eq(fixture.db.transactions.length, receiptStart + 1, "viewer cannot save a receipt");
  homeMembership.role = "owner";

  fixture.db.transactions.push(
    { id: "repeat-may", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-05-12", type: "expense", amount: 14900, category: "구독", memo: "넷플릭스", payment_method: "국민카드", source: "web", raw_text: "" },
    { id: "repeat-jun", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-06-12", type: "expense", amount: 14900, category: "구독", memo: "넷플릭스", payment_method: "국민카드", source: "web", raw_text: "" },
  );
  body = await html("/smart-tools?month=2026-07&household_id=house-home");
  ok(body.includes("넷플릭스") && body.includes("확정하고 자동 등록"), "repeating transaction candidate requires an explicit confirmation action");
  const recurringStart = fixture.db.accountbook_recurring.length;
  await post("/my/recurring/from-candidate", [
    ["household_id", "house-home"], ["month", "2026-07"], ["memo", "넷플릭스"], ["amount", "14900"],
    ["category", "구독"], ["payment_method", "국민카드"], ["day_of_month", "12"],
  ]);
  eq(fixture.db.accountbook_recurring.length, recurringStart, "candidate without confirmation performs no write");
  await post("/my/recurring/from-candidate", [
    ["household_id", "house-home"], ["month", "2026-07"], ["memo", "넷플릭스"], ["amount", "14900"],
    ["category", "구독"], ["payment_method", "국민카드"], ["day_of_month", "12"], ["confirmed", "yes"],
  ]);
  eq(fixture.db.accountbook_recurring.length, recurringStart + 1, "confirmed candidate creates one rule");
  await post("/my/recurring/from-candidate", [
    ["household_id", "house-home"], ["month", "2026-07"], ["memo", "넷플릭스"], ["amount", "14900"],
    ["category", "구독"], ["payment_method", "국민카드"], ["day_of_month", "12"], ["confirmed", "yes"],
  ]);
  eq(fixture.db.accountbook_recurring.length, recurringStart + 1, "same recurring candidate is idempotent");

  const txBeforeCron = fixture.db.transactions.length;
  response = await request("/cron/recurring/apply?key=cron-v2267&month=2026-07&today=2026-07-15", { cookie: "" });
  eq(response.status, 200, "recurring cron succeeds");
  const recurringCron = await response.json();
  ok(recurringCron.applied >= 2 && recurringCron.failed === 0, "due repeating rules are applied successfully");
  const txAfterFirstCron = fixture.db.transactions.length;
  ok(txAfterFirstCron >= txBeforeCron + 2, "cron creates due transactions");
  response = await request("/cron/recurring/apply?key=cron-v2267&month=2026-07&today=2026-07-15", { cookie: "" });
  eq(response.status, 200, "second recurring cron succeeds");
  eq(fixture.db.transactions.length, txAfterFirstCron, "second recurring cron creates no duplicate transactions");

  const expenseRows = fixture.db.transactions.filter((row) => row.household_id === "house-home" && row.type !== "income" && String(row.transaction_date).startsWith("2026-07"));
  const members = fixture.db.household_members.filter((row) => row.household_id === "house-home");
  for (const [mode, options] of [
    ["equal", {}],
    ["ratio", { weights: { "user-bin": 2, "user-wifi": 1 } }],
    ["headcount", { weights: { "user-bin": 1, "user-wifi": 3 } }],
    ["item", { itemParticipants: Object.fromEntries(expenseRows.map((row, index) => [row.id, index % 2 ? ["user-bin"] : ["user-bin", "user-wifi"]])) }],
  ]) {
    const model = buildSettlementModel(expenseRows, members, { mode, ...options });
    eq(model.people.reduce((sum, person) => sum + person.share, 0), model.totalExpense, `${mode} settlement allocates every won`);
    eq(model.people.reduce((sum, person) => sum + person.balance, 0), 0, `${mode} settlement balances to zero`);
    ok(model.transfers.every((transfer) => transfer.amount > 0), `${mode} settlement emits only positive transfers`);
    body = await html(`/settlement-summary?month=2026-07&household_id=house-home&mode=${mode}`);
    ok(body.includes("고급 정산") && body.includes("송금 횟수를 줄인 제안"), `${mode} settlement UI renders`);
  }
  const settlementSettingsBefore = fixture.db.accountbook_settings.filter((row) => row.key === "settlement_history:house-home").length;
  await post("/my/settlement/save", [["household_id", "house-home"], ["month", "2026-07"], ["mode", "broken"], ["confirmed", "yes"]]);
  eq(fixture.db.accountbook_settings.filter((row) => row.key === "settlement_history:house-home").length, settlementSettingsBefore, "invalid settlement mode performs no write");
  await post("/my/settlement/save", [["household_id", "house-home"], ["month", "2026-07"], ["mode", "equal"], ["note", "7월 정산"], ["confirmed", "yes"]]);
  const settlementRow = fixture.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home");
  ok(settlementRow && JSON.parse(settlementRow.value).length === 1, "confirmed settlement completion persists once");
  await post("/my/settlement/save", [["household_id", "house-home"], ["month", "2026-07"], ["mode", "equal"], ["note", "7월 정산"], ["confirmed", "yes"]]);
  const settlementRowAfterRetry = fixture.db.accountbook_settings.find((row) => row.key === "settlement_history:house-home");
  eq(JSON.parse(settlementRowAfterRetry.value).length, 1, "immediate settlement resubmission is idempotent");

  homeMembership.role = "viewer";
  const settingsCountBeforeViewer = fixture.db.accountbook_settings.length;
  await post("/my/report-preference/save", [["household_id", "house-home"], ["month", "2026-07"], ["enabled", "1"], ["weekly", "1"]]);
  eq(fixture.db.accountbook_settings.length, settingsCountBeforeViewer, "viewer cannot change automatic report settings");
  await post("/my/settlement/save", [["household_id", "house-home"], ["month", "2026-07"], ["mode", "equal"], ["confirmed", "yes"]]);
  eq(JSON.parse(settlementRow.value).length, 1, "viewer cannot complete a settlement");
  homeMembership.role = "owner";

  await post("/my/report-preference/save", [["household_id", "house-home"], ["month", "2026-07"], ["enabled", "1"], ["weekly", "1"], ["monthly", "1"]]);
  let preferenceRow = fixture.db.accountbook_settings.find((row) => row.key === "free_report_preference:house-home");
  ok(preferenceRow && JSON.parse(preferenceRow.value).enabled, "owner can enable automatic reports");
  const validPreference = preferenceRow.value;
  preferenceRow.value = JSON.stringify({ ...JSON.parse(validPreference), household_id: "house-trip" });
  response = await request("/cron/reports/generate?key=cron-v2267&force=1&today=2026-07-15", { cookie: "" });
  eq(response.status, 200, "report cron safely handles an invalid scoped preference");
  const invalidCron = await response.json();
  eq(invalidCron.invalid, 1, "scope-mismatched report preference is rejected");
  ok(!fixture.db.accountbook_settings.some((row) => String(row.key).startsWith("free_report_snapshot:house-trip:")), "tampered preference cannot read or write another household report");

  preferenceRow.value = validPreference;
  response = await request("/cron/reports/generate?key=cron-v2267&force=1&today=2026-07-15", { cookie: "" });
  eq(response.status, 200, "valid report cron succeeds");
  const reportCron = await response.json();
  ok(reportCron.generated >= 2 && reportCron.failed === 0, "weekly and monthly snapshots are generated");
  const monthlySetting = fixture.db.accountbook_settings.find((row) => row.key === "free_report_snapshot:house-home:monthly:2026-07");
  const monthlyReport = JSON.parse(monthlySetting.value);
  eq(monthlyReport.household_id, "house-home", "report snapshot keeps its household scope");
  ok(monthlyReport.biggest?.memo !== "숙소 예약", "report snapshot excludes another household's transactions");
  body = await html("/reports?month=2026-07&household_id=house-home");
  ok(body.includes("인쇄·PDF 저장") && body.includes("카카오톡에 공유할 문구") && body.includes("자동 리포트 생성 사용"), "report page keeps export, sharing, and automation controls");

  const source = await (await import("node:fs/promises")).readFile(new URL("./src/index.js", import.meta.url), "utf8");
  ok(source.includes("incompleteFeatureQaEnabled(env)") && source.includes("envFlagEnabled(env.MEME_CARDS_ENABLED, false)"), "meme routes require the dedicated QA lock and default closed");
  ok(source.includes("incompleteFeatureQaEnabled(env)") && source.includes("envFlagEnabled(env.CARD_PERFORMANCE_ENABLED, false)"), "card-performance routes require the dedicated QA lock and default closed");
  ok(source.includes('status: "미완성숨김"') && source.includes('["미완성 기능 숨김"'), "release diagnostics record the hidden policy");
  ok(source.includes("await runAutomaticReports(env)") && source.includes("await runRecurringAutoApply(env)"), "scheduled stabilizers remain wired");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2267_STABILIZATION_HIDDEN_INCOMPLETE_OK assertions=${assertions}`);
