// Compatibility test name retained for older validation runners.
// Completed smart tools remain free; incomplete meme/card-performance tools are hidden.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app, { parseMobileAmountText } from "./src/index.js";

assert.equal(parseMobileAmountText("커피 5천 현금"), 5000);
assert.equal(parseMobileAmountText("점심 12000 국민카드"), 12000);
assert.equal(parseMobileAmountText("월급 250만원"), 2500000);
assert.equal(parseMobileAmountText("장보기 1만 5천원"), 15000);

const healthResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/health"), {}, {});
const health = await healthResponse.json();
assert.equal(health.version, "V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY");

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
assert.match(source, /envFlagEnabled\(env\.MEME_CARDS_ENABLED, false\)/);
assert.match(source, /envFlagEnabled\(env\.CARD_PERFORMANCE_ENABLED, false\)/);
assert.match(source, /async function handleReceiptConfirmedSave/);
assert.match(source, /async function runAutomaticReports/);
assert.match(source, /function buildSettlementModel/);
assert.doesNotMatch(source, /결제하기|checkout_session|payment_required/);

for (const path of ["/meme-lab", "/meme-archive", "/share/meme?id=test", "/card-benefits"]) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`), {}, {});
  assert.equal(response.status, 404, `${path} stays hidden by default`);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
}

console.log(JSON.stringify({ ok: true, version: health.version, policy: "completed_tools_free_incomplete_tools_hidden" }));
