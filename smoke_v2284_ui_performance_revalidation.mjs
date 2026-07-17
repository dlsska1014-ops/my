import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const fixture = await createV2265QaFixture();
const source = readFileSync("src/index.js", "utf8");

async function get(path) {
  const response = await app.fetch(new Request("https://ttokttok-accountbook.com" + path, {
    headers: { cookie: fixture.cookie },
    redirect: "manual"
  }), fixture.env, {});
  eq(response.status, 200, path + " renders");
  return response.text();
}

function inlineScripts(html) {
  return Array.from(String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi), match => match[1]).filter(script => script.trim());
}

function scriptsCompile(html, label) {
  const scripts = inlineScripts(html);
  ok(scripts.length > 0, label + " includes its browser runtime");
  scripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), label + " inline script " + (index + 1) + " compiles");
    checks += 1;
  });
}

try {
  const healthResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/health"), fixture.env, {});
  eq(healthResponse.status, 200, "health remains available");
  const health = await healthResponse.json();
  eq(health.version, "V22.8.6-RECEIPT-SCREEN-OPTIMIZATION", "health exposes V22.8.4");

  const appHtml = await get("/app?month=2026-07&household_id=house-home");
  ok(appHtml.includes('id="v2284UiRevalidationStyle"'), "route-aware V22.8.4 UI layer is present");
  ok(appHtml.includes("abMobileAppSurface"), "mobile home receives its scoped surface class");
  ok(appHtml.includes("button.homeTx"), "timeline uses compact semantic transaction rows");
  ok(appHtml.includes("background:#fff!important"), "home uses readable white information surfaces");
  ok(!appHtml.includes("mobileUiUxClientMain()"), "serialized response does not duplicate the full smart-input runtime");
  scriptsCompile(appHtml, "app");

  const receiptHtml = await get("/receipts?month=2026-07&household_id=house-home");
  ok(receiptHtml.includes("abPageReceipts"), "receipt UI receives its scoped neutral design");
  ok(receiptHtml.includes('id="receiptCaptureRuntime"'), "receipt parser uses the safe serialized runtime");
  ok(receiptHtml.includes("function loadTesseract"), "receipt OCR has a lazy loader");
  ok(!receiptHtml.includes('<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js">'), "OCR is not downloaded on page entry");
  scriptsCompile(receiptHtml, "receipt");

  const backupHtml = await get("/my/backup?month=2026-07&household_id=house-home");
  ok(backupHtml.includes("abPageBackup"), "backup UI receives its scoped readable design");
  ok(backupHtml.includes('id="myBackupImportRuntime"'), "backup import uses the safe serialized runtime");
  ok(backupHtml.includes("function loadXlsx"), "Excel conversion has a lazy loader");
  ok(!backupHtml.includes('<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js">'), "SheetJS is not downloaded on page entry");
  scriptsCompile(backupHtml, "backup");

  const keywordHtml = await get("/keyword-guide?month=2026-07&household_id=house-home");
  ok(keywordHtml.includes("abPageKeywords"), "keyword editor receives its scoped compact design");
  ok(keywordHtml.includes('id="keywordFilterInput"'), "keyword and category search is available");
  ok(keywordHtml.includes('<details class="kwBox"'), "keyword categories use collapsible groups");
  ok(keywordHtml.includes('class="kwRemove"'), "keyword deletion has a dedicated low-emphasis control");
  ok(keywordHtml.includes("변경사항 저장"), "bulk action has a clear result-oriented label");
  scriptsCompile(keywordHtml, "keyword editor");

  ok(source.includes("function mobileShellUiClientMain"), "lightweight navigation runtime exists");
  ok(source.includes("function v2284UiStyleFor"), "route-aware CSS payload filtering exists");
  ok(source.includes("function receiptCaptureClientMain"), "receipt client is maintained as a real function");
  ok(source.includes("function myBackupImportClientMain"), "backup client is maintained as a real function");
  ok(/const \[members, rawRows, calendar, budgets\] = await Promise\.all/.test(source), "app data groups are fetched concurrently");
  ok(/const \[user, access\] = await Promise\.all/.test(source), "user and access checks are fetched concurrently");

  console.log("SMOKE_V2284_UI_PERFORMANCE_REVALIDATION_OK checks=" + checks);
} finally {
  fixture.restore();
}
