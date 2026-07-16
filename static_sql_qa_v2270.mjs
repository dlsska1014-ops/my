import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("./schema_v22_7_0_auth_atomicity.sql", import.meta.url), "utf8");
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };

ok(/^\s*(?:--[^\n]*\n\s*)*begin\s*;/i.test(sql), "migration starts in a transaction");
ok(/commit\s*;\s*$/i.test(sql), "migration commits as one transaction");
ok((sql.match(/\$\$/g) || []).length % 2 === 0, "function dollar delimiters are balanced");
ok(!/\bdrop\s+table\b|\btruncate\b/i.test(sql), "migration has no destructive table reset");
ok(!/grant\s+execute[^;]+\s+to\s+(?:anon|authenticated|public)\s*;/i.test(sql), "security-definer functions are not granted to public roles");

const functionPattern = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns\s+jsonb([\s\S]*?)\$\$\s*;/gi;
const functions = [];
let match;
while ((match = functionPattern.exec(sql))) {
  const [, name, signature, definition] = match;
  const parameterNames = [...signature.matchAll(/\b(p_[a-z0-9_]+)\s+[a-z]/gi)].map((item) => item[1].toLowerCase());
  functions.push({ name, signature, definition, parameterNames });
}

ok(functions.length === 13, `expected 13 V22.7 functions, found ${functions.length}`);
const functionNames = new Set(functions.map((item) => item.name));
ok(functionNames.size === functions.length, "function names are unique");

for (const fn of functions) {
  ok(new Set(fn.parameterNames).size === fn.parameterNames.length, `${fn.name}: parameter names are unique`);
  ok(/security\s+definer/i.test(fn.definition), `${fn.name}: SECURITY DEFINER is explicit`);
  ok(/set\s+search_path\s*=\s*public/i.test(fn.definition), `${fn.name}: search_path is pinned`);
  const body = fn.definition.split("$$")[1] || "";
  const openingIf = (body.match(/^\s*if\b/gim) || []).length;
  const closingIf = (body.match(/\bend\s+if\s*;/gi) || []).length;
  ok(openingIf === closingIf, `${fn.name}: IF blocks are balanced (${openingIf}/${closingIf})`);
  const openingLoop = (body.match(/^\s*(?:for(?!\s+update\b)|foreach)\b/gim) || []).length;
  const closingLoop = (body.match(/\bend\s+loop\s*;/gi) || []).length;
  ok(openingLoop === closingLoop, `${fn.name}: LOOP blocks are balanced (${openingLoop}/${closingLoop})`);
  ok(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn.name}\\s*\\(`, "i").test(sql), `${fn.name}: public roles are revoked`);
  ok(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn.name}\\s*\\([^;]+\\)\\s+to\\s+service_role`, "i").test(sql), `${fn.name}: only service role receives execute`);
}

for (const table of [
  "accountbook_user_identities",
  "accountbook_user_security",
  "accountbook_admin_security",
  "accountbook_auth_attempts",
  "accountbook_transaction_audit",
]) {
  ok(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, "i").test(sql), `${table}: idempotent table creation`);
  ok(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql), `${table}: RLS enabled`);
  ok(new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i").test(sql), `${table}: client table grants revoked`);
}

const sourceV227Rpcs = new Set([...source.matchAll(/\/rpc\/(accountbook_[a-z0-9_]+_v227)(?![0-9])/g)].map((item) => item[1]));
for (const rpc of sourceV227Rpcs) ok(functionNames.has(rpc), `${rpc}: Worker RPC exists in migration`);
for (const required of [
  "accountbook_create_local_user_v227",
  "accountbook_set_local_identity_v227",
  "accountbook_link_kakao_identity_v227",
  "accountbook_purge_household_v227",
  "accountbook_replace_budget_plan_v227",
  "accountbook_apply_recurring_v227",
  "accountbook_merge_users_v227",
  "accountbook_update_transaction_v227",
  "accountbook_delete_transaction_v227",
  "accountbook_bulk_transactions_v227",
  "accountbook_import_transactions_v227",
  "accountbook_leave_household_v227",
]) ok(sourceV227Rpcs.has(required), `${required}: Worker calls the atomic RPC`);

ok(/import_household_scope_mismatch/.test(sql) && /import_spender_not_member/.test(sql), "import validates household and spender scope");
ok(/recurring_spender_required/.test(sql), "recurring apply rejects missing or inactive spenders");
ok(/transaction_audit[\s\S]*before_value[\s\S]*after_value/i.test(sql), "transaction changes keep before/after audit data");

const purgeFunction = functions.find((item) => item.name === "accountbook_purge_household_v227")?.definition || "";
for (const settingsScope of [
  "custom_categories:",
  "category_keywords:",
  "payment_assets:",
  "reserve_plans:",
  "member_aliases:",
  "transaction_edit_history:",
  "settlement_history:",
  "budgets:",
  "free_report_preference:",
  "free_report_snapshot:",
  "kakao_edit_v2254:",
  "kakao_cta_v215:",
  "kakao_selected_household_v2251:",
  "kakao_flow_v215:",
]) ok(purgeFunction.includes(settingsScope), `household purge removes ${settingsScope} settings`);
ok(/delete\s+from\s+public\.accountbook_settings[\s\S]*delete\s+from\s+public\.household_members/i.test(purgeFunction), "household settings are removed before member rows needed for scope cleanup");

console.log(`STATIC_SQL_V2270_OK functions=${functions.length} worker_rpcs=${sourceV227Rpcs.size} assertions=${assertions}`);
