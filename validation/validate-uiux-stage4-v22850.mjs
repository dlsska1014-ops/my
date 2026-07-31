import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.63-APP-ICON-ASSETS"'), "stage 4 runtime version is explicit");
ok(source.includes('data-ab-quick-dock aria-label="빠른 실행"'), "desktop quick actions expose a named dock");
ok(source.includes('class="abGlobalAction abGlobalActionPrimary abGlobalActionQuick"'), "quick input is the dock primary action");
ok(source.includes('data-abv5-search-open'), "dock keeps transaction search");
ok(source.includes('data-ab-quick-open'), "dock opens the shared quick-input surface");
ok(source.includes('data-abv5-notif-open'), "dock keeps notifications");
ok(source.includes('data-ab-global-open="appearance"'), "dock keeps appearance settings");
ok(source.includes('.abGlobalActions[data-ab-quick-dock]{left:calc(50%'), "desktop dock is centered in the content region");
ok(source.includes('bottom:18px;transform:translateX(-50%)'), "desktop dock is fixed above the viewport edge");
ok(source.includes('body.abV22812Shell{padding-bottom:94px!important}'), "desktop content reserves room for the dock");
ok(source.includes('.abGlobalActionQuick{min-width:132px'), "desktop quick input receives extra prominence");
ok(source.includes('function accountbookSaveFeedbackClientMain'), "save feedback client exists");
ok(source.includes('document.querySelector("[data-ab-save-feedback]")'), "feedback client binds only when feedback markup exists");
ok(source.includes('data-ab-feedback-close'), "feedback can be dismissed explicitly");
ok(source.includes('kind === "success"') && source.includes('setTimeout(close, 5200)'), "success feedback closes automatically");
ok(source.includes('kind === "warning"') && source.includes('setTimeout(close, 9000)'), "warning feedback remains visible longer");
ok(source.includes('["msg", "err", "balert"]'), "transient feedback query parameters are cleaned after rendering");
ok(source.includes('class="abSaveFeedback ${feedbackKind === "error"'), "server renders one contextual feedback surface");
ok(source.includes('role="${feedbackKind === "error" ? "alert" : "status"}"'), "error feedback uses alert semantics and success uses status semantics");
ok(source.includes('aria-live="${feedbackKind === "error" ? "assertive" : "polite"}"'), "feedback urgency matches its kind");
ok(source.includes('.abSaveFeedback.isError'), "error feedback has dedicated styling");
ok(source.includes('.abSaveFeedback.isWarning'), "warning feedback has dedicated styling");
ok(source.includes('.abSaveFeedbackMark{display:grid') && source.includes('var(--pos)'), "success feedback uses the positive base style");
ok(source.includes('@media(max-width:899px){') && source.includes('bottom:calc(82px + env(safe-area-inset-bottom,0px))'), "mobile feedback is positioned above the bottom navigation");
ok(source.includes('function returnUrlForDate(date)'), "quick input can construct a date-specific return target");
ok(source.includes('&view=calendar&date=') && source.includes('&feed=all'), "return target preserves calendar date context");
ok(source.includes('function syncReturnTarget(date)'), "existing form return_to is synchronized before submission");
ok(source.includes('input[name="return_to"]'), "the existing hidden return target is reused");
ok(source.includes('form.addEventListener("submit"'), "return target is refreshed at submit time");
ok(source.includes('function transactionAddRedirectExtras'), "transaction create redirects use one shared stage 4 helper");
ok(source.includes('if (mode === "success") out.day_detail = "1"'), "successful quick saves reopen day detail");
ok(source.includes('else out.quick = "1"'), "failed quick saves reopen the input surface");
ok(source.includes('transactionAddRedirectExtras(form, { err: validationError }, "error")'), "validation failures use the quick reopen contract");
ok(source.includes('transactionAddRedirectExtras(form, balert ? { msg, balert } : { msg }, "success")'), "successful saves use the date detail return contract");
ok(source.includes('params.get("day_detail") !== "1"'), "day detail auto-open is guarded by a one-shot parameter");
ok(source.includes('params.delete("day_detail")'), "day detail one-shot parameter is cleaned after use");
ok(source.includes('params.delete("quick")'), "quick-input one-shot parameter is cleaned after use");
ok(source.includes('(${accountbookSaveFeedbackClientMain.toString()})();'), "save feedback client is included in the immutable V5 bundle");
ok(source.includes('별도 쓰기 API를 추가하지 않는다'), "existing transaction write contract remains explicit");
ok(!source.includes('/u/api/quick-input'), "stage 4 adds no parallel quick-input write API");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22862.css"'), "current release uses a fresh shell asset");
ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22862.js"'), "stage 4 uses a fresh navigation asset");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22861.js"'), "current release uses a fresh V5 asset");
ok(source.includes('"accountbook-shell-v22862-css"'), "current shell has a fresh immutable ETag");
ok(source.includes('"accountbook-nav-v22862-js"'), "stage 4 navigation has a fresh immutable ETag");
ok(source.includes('"accountbook-v5-v22861-js"'), "current V5 runtime has a fresh immutable ETag");

function form(values) { return new URLSearchParams(values); }
async function request(fixture, path, { cookie = fixture.cookie, method = "GET", body } = {}) {
  const headers = { accept: "text/html,application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/x-www-form-urlencoded";
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body.toString(),
  }), fixture.env, {});
  const text = await response.text();
  return { response, text };
}

const fixture = await createV2265QaFixture();
try {
  const before = fixture.db.transactions.length;
  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "stage 4 home renders");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "default home stays below the protected 35 KiB HTML budget");
  ok(home.text.includes('/assets/accountbook-shell-v22862.css'), "home loads the current shell");
  ok(home.text.includes('/assets/accountbook-nav-v22862.js'), "home loads the stage 4 navigation runtime");
  ok(home.text.includes('/assets/accountbook-v5-v22861.js'), "home loads the current V5 runtime");
  ok(!home.text.includes('data-ab-save-feedback'), "default home emits no false save feedback");
  eq(fixture.db.transactions.length, before, "rendering stage 4 home does not mutate transactions");

  const successPage = await request(fixture, "/app?month=2026-07&household_id=house-home&view=calendar&date=2026-07-04&feed=all&msg=added&day_detail=1#calendar");
  eq(successPage.response.status, 200, "success return page renders");
  ok(successPage.text.includes('data-ab-save-feedback'), "success return page contains feedback markup");
  ok(successPage.text.includes('data-ab-feedback-kind="success"'), "success feedback is classified correctly");
  ok(successPage.text.includes('기록을 저장했습니다'), "success feedback has a clear title");
  ok(successPage.text.includes('거래내역을 추가했습니다.'), "success feedback contains the mapped save message");
  ok(successPage.text.includes('data-ab-day="2026-07-04"'), "success page retains the selected calendar date");

  const errorPage = await request(fixture, "/app?month=2026-07&household_id=house-home&view=calendar&date=2026-07-18&feed=all&err=amount_required&quick=1#calendar");
  eq(errorPage.response.status, 200, "error return page renders");
  ok(errorPage.text.includes('data-ab-feedback-kind="error"'), "error feedback is classified correctly");
  ok(errorPage.text.includes('요청을 완료하지 못했습니다'), "error feedback has a clear title");
  ok(errorPage.text.includes('0원보다 큰 금액을 입력해 주세요.'), "error feedback explains the correction");
  ok(errorPage.text.includes('name="transaction_date"'), "error page keeps the existing quick-input date field");

  const shell = await request(fixture, "/assets/accountbook-shell-v22862.css");
  eq(shell.response.status, 200, "stage 4 shell is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22862-css"', "current shell ETag is correct");
  ok(shell.text.includes('[data-ab-quick-dock]'), "stage 4 shell contains dock styles");
  ok(shell.text.includes('.abSaveFeedback'), "stage 4 shell contains feedback styles");

  const nav = await request(fixture, "/assets/accountbook-nav-v22862.js");
  eq(nav.response.status, 200, "stage 4 navigation runtime is served");
  eq(nav.response.headers.get("etag"), '"accountbook-nav-v22862-js"', "stage 4 navigation ETag is correct");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22861.js");
  eq(v5.response.status, 200, "stage 4 V5 runtime is served");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22861-js"', "current V5 runtime ETag is correct");
  ok(v5.text.includes("accountbookSaveFeedbackClientMain") || v5.text.includes("data-ab-save-feedback"), "V5 runtime contains save feedback behavior");
  ok(v5.text.includes("returnUrlForDate"), "V5 runtime contains date return behavior");

  const saveDate = "2026-07-17";
  const returnTo = `/app?month=2026-07&household_id=house-home&view=calendar&date=${saveDate}&feed=all#calendar`;
  const save = await request(fixture, "/admin/transactions", {
    method: "POST",
    body: form({
      household_id: "house-home",
      month: "2026-07",
      type: "expense",
      transaction_date: saveDate,
      amount: "12,345",
      memo: "stage4-return-flow",
      category: "식비",
      payment_method: "현금",
      user_id: "user-bin",
      return_to: returnTo,
    }),
  });
  eq(save.response.status, 303, "quick-input save redirects");
  const saveLocation = String(save.response.headers.get("location") || "");
  ok(saveLocation.includes(`date=${saveDate}`), "successful save returns to the selected date");
  ok(saveLocation.includes("view=calendar"), "successful save returns to calendar context");
  ok(saveLocation.includes("msg=added"), "successful save reports completion");
  ok(saveLocation.includes("day_detail=1"), "successful save reopens day detail");
  ok(saveLocation.endsWith("#calendar"), "successful save retains the calendar anchor");
  eq(fixture.db.transactions.length, before + 1, "successful save writes exactly one transaction");
  const saved = fixture.db.transactions.find((row) => row.memo === "stage4-return-flow");
  eq(saved?.transaction_date, saveDate, "saved transaction keeps the selected date");
  eq(Number(saved?.amount), 12345, "saved transaction keeps the entered amount");

  const failDate = "2026-07-18";
  const failed = await request(fixture, "/admin/transactions", {
    method: "POST",
    body: form({
      household_id: "house-home",
      month: "2026-07",
      type: "expense",
      transaction_date: failDate,
      amount: "",
      memo: "stage4-invalid",
      category: "식비",
      payment_method: "현금",
      user_id: "user-bin",
      return_to: `/app?month=2026-07&household_id=house-home&view=calendar&date=${failDate}&feed=all#calendar`,
    }),
  });
  eq(failed.response.status, 303, "invalid quick input redirects safely");
  const failLocation = String(failed.response.headers.get("location") || "");
  ok(failLocation.includes(`date=${failDate}`), "failed save retains the selected date");
  ok(failLocation.includes("quick=1"), "failed save reopens quick input");
  ok(failLocation.includes("err="), "failed save reports the validation error");
  ok(!failLocation.includes("day_detail=1"), "failed save never opens day detail as if committed");
  eq(fixture.db.transactions.length, before + 1, "failed save creates no additional transaction");
} finally {
  fixture.restore();
}

console.log(`V22.8.50 UIUX stage 4 validation passed: ${checks} checks`);
