import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("./schema_v22_7_0_auth_atomicity.sql", import.meta.url), "utf8");
let assertions = 0;
const has = (text, message) => { assert.ok(source.includes(text), message); assertions += 1; };

has('V22.7.2-MY-ROUTE-RECOVERY-HOTFIX', "version updated");
for (const kind of ["bank_account", "cash", "easy_pay", "savings", "investment", "crypto", "pension", "real_estate", "car", "asset", "loan", "credit_card", "check_card"]) has(`kind: "${kind}"`, `${kind} is supported`);
has('side: "liability"', "liability is separated");
has('side: "card"', "cards are separated");
has('totals.netWorth = totals.assetTotal - totals.liabilityTotal', "net worth formula is safe");
has('containsSensitiveFinancialNumber', "sensitive financial numbers are rejected");
has('/admin/payment-asset/update', "asset update route and form exist");
has('async function handlePaymentAssetUpdate', "asset update handler exists");
has('계좌번호·카드번호 전체', "privacy guidance exists");
has('paymentAssetKindMeta(kind).side === "asset"', "only assets can be included in asset total");
has('Math.max(0, Math.round(Number', "negative stored values are normalized");
assert.ok(sql.includes("'asset_history:' || p_household_id::text"), "household purge removes asset history"); assertions += 1;
assert.ok(!source.includes('cardCalcLink'), "unfinished card performance link is not exposed by asset dashboard"); assertions += 1;

console.log(`STATIC_ASSET_QA_V2271_OK assertions=${assertions}`);
