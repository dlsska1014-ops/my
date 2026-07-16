import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const sql = await readFile(new URL("./schema_v22_8_0_asset_dashboard_complete.sql", import.meta.url), "utf8");
const baseSql = await readFile(new URL("./schema_v22_7_0_auth_atomicity.sql", import.meta.url), "utf8");
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

ok(/^\s*(?:--[^\n]*\n\s*)*begin\s*;/i.test(sql), "migration begins in a transaction");
ok(/commit\s*;\s*$/i.test(sql), "migration commits");
ok((sql.match(/\$\$/g) || []).length === 2, "function dollar delimiters are balanced");
ok(!/\bdrop\s+table\b|\btruncate\b/i.test(sql), "migration does not reset data");
ok(/create\s+or\s+replace\s+function\s+public\.accountbook_mutate_payment_assets_v2280/i.test(sql), "V22.8 RPC exists");
ok(/security\s+definer/i.test(sql), "RPC is security definer");
ok(/set\s+search_path\s*=\s*public,\s*pg_temp/i.test(sql), "RPC search path is pinned");
ok(/pg_advisory_xact_lock/i.test(sql), "per-household mutation is serialized");
ok((sql.match(/for\s+update/gi) || []).length >= 2, "asset and history rows are locked");
ok(sql.includes("'payment_assets:' || p_household_id::text"), "asset key is household scoped");
ok(sql.includes("'asset_history:' || p_household_id::text"), "history key is household scoped");
ok(/p_action\s+not\s+in\s*\('create',\s*'update',\s*'delete'\)/i.test(sql), "actions are allowlisted");
ok(/asset_limit_exceeded/.test(sql), "asset count is bounded");
ok(/asset_name_duplicate/.test(sql), "duplicate display names are rejected");
ok(/asset_not_found/.test(sql), "stale update and delete are rejected");
ok(/asset_sensitive_or_invalid/.test(sql), "financial-number privacy guard is repeated in SQL");
ok(/9000000000000/.test(sql), "asset amounts are bounded");
ok(/include_in_asset[\s\S]*else\s+false/i.test(sql), "cards and liabilities cannot enter asset total");
ok(/v_asset_total\s*-\s*v_liability_total/.test(sql), "net worth subtracts liabilities");
ok(/limit\s+24/i.test(sql), "history retention is capped at 24 months");
ok(/'assets',\s*v_assets[\s\S]*'history',\s*v_history[\s\S]*'history_recorded',\s*true/i.test(sql), "one RPC returns the committed assets and history");
ok(/revoke\s+all[\s\S]*from\s+public,\s*anon,\s*authenticated/i.test(sql), "public execution is revoked");
ok(/grant\s+execute[\s\S]*to\s+service_role/i.test(sql), "only service role receives execution");
ok(!/grant\s+execute[^;]+to\s+(?:anon|authenticated|public)\s*;/i.test(sql), "client roles receive no RPC grant");

const v2280Call = source.indexOf("/rpc/accountbook_mutate_payment_assets_v2280");
const v2271Call = source.indexOf("/rpc/accountbook_mutate_payment_assets_v2271");
ok(v2280Call >= 0, "Worker calls the V22.8 RPC");
ok(v2271Call > v2280Call, "legacy fallback runs only after V22.8 RPC");
ok(source.includes("recordAssetSnapshotBestEffort"), "legacy deployments keep a best-effort snapshot fallback");
ok(source.includes("creditCardUsageTotal"), "pending net-worth estimate excludes check-card usage");
ok(source.includes("findPaymentAssetForMethod"), "payment-method aliases can connect to registered assets");
ok(source.includes("balance_updated_at"), "balance freshness is separate from metadata edits");
ok(source.includes("같은 이름의 자산·결제수단"), "duplicate guidance is user-readable");
ok(source.includes("계좌번호·카드번호 전체, 비밀번호, 인증번호"), "shared-asset privacy warning is visible");
ok(baseSql.includes("'asset_history:' || p_household_id::text"), "household purge removes asset history");

console.log(`STATIC_ASSET_SQL_QA_V2280_OK checks=${checks}`);
