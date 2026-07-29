import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

const sql = readFileSync(new URL("../01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql", import.meta.url), "utf8");
const normalized = sql.toLowerCase().replace(/\s+/g, " ");

ok(sql.includes("V22.8.46-MEMBER-ROLE-SCHEMA-ALIGNMENT"), "migration has the release marker");
ok(normalized.includes("begin;"), "migration starts a transaction");
ok(normalized.includes("set local lock_timeout = '5s'"), "migration has a bounded lock timeout");
ok(normalized.includes("lock table public.household_members in share row exclusive mode"), "migration blocks concurrent role writes while replacing the constraint");
ok(normalized.includes("to_regclass('public.household_members')"), "migration fails clearly when the table is missing");
ok(normalized.includes("a.attname = 'role'"), "migration discovers the real role column type");
ok(normalized.includes("'owner', 'admin', 'member', 'viewer', 'pending', 'blocked'"), "migration preserves the complete Worker role contract");
ok(normalized.includes("unexpected existing role values"), "migration fails closed on unknown stored roles");
ok(normalized.includes("v_type_kind = 'e'"), "migration handles an enum-backed role column");
ok(normalized.includes("alter type %i.%i add value if not exists %l"), "enum migration adds admin idempotently");
ok(normalized.includes("v_type_name in ('text', 'varchar', 'bpchar', 'citext')"), "migration handles supported text-backed role columns");
ok(normalized.includes("from pg_constraint c"), "migration inspects the actual table constraints");
ok(normalized.includes("unexpected role constraint"), "migration refuses to drop an unrecognized role constraint");
ok(normalized.includes("drop constraint %i"), "migration removes only discovered role-list constraints");
ok(normalized.includes("add constraint household_members_role_allowed_v22846"), "migration creates a versioned canonical role constraint");
ok(normalized.includes("not valid") && normalized.includes("validate constraint household_members_role_allowed_v22846"), "migration validates existing rows before commit");
ok(normalized.includes("commit;") && normalized.includes("notify pgrst, 'reload schema'"), "migration commits before reloading the PostgREST schema cache");
ok(normalized.includes("e.enumlabel = 'admin'"), "postcheck verifies an enum admin label");
ok(normalized.includes("readiness_ok"), "postcheck returns one explicit readiness result");
ok(!/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.household_members\b/i.test(sql), "migration never rewrites participant rows");

console.log(`member_role_schema_v22846: ${checks} checks passed`);
