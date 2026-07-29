-- V22.8.46-MEMBER-ROLE-SCHEMA-ALIGNMENT
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- 기존 참여자 행은 수정하지 않고 household_members.role 허용값만 Worker 계약과 맞춥니다.

begin;
set local lock_timeout = '5s';
lock table public.household_members in share row exclusive mode;

do $migration$
declare
  v_attnum smallint;
  v_type_schema text;
  v_type_name text;
  v_type_kind "char";
  v_constraint record;
  v_definition text;
  v_invalid_roles text;
begin
  if to_regclass('public.household_members') is null then
    raise exception 'V22.8.46: public.household_members table is missing';
  end if;

  select a.attnum, type_ns.nspname, t.typname, t.typtype
    into v_attnum, v_type_schema, v_type_name, v_type_kind
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  join pg_namespace type_ns on type_ns.oid = t.typnamespace
  where a.attrelid = 'public.household_members'::regclass
    and a.attname = 'role'
    and a.attnum > 0
    and not a.attisdropped;

  if not found then
    raise exception 'V22.8.46: public.household_members.role column is missing';
  end if;

  select string_agg(role_value, ', ' order by role_value)
    into v_invalid_roles
  from (
    select distinct role::text as role_value
    from public.household_members
    where role is not null
      and role::text not in ('owner', 'admin', 'member', 'viewer', 'pending', 'blocked')
  ) invalid;

  if v_invalid_roles is not null then
    raise exception 'V22.8.46: unexpected existing role values: %', v_invalid_roles;
  end if;

  if v_type_kind = 'e' then
    execute format(
      'alter type %I.%I add value if not exists %L',
      v_type_schema,
      v_type_name,
      'admin'
    );
  elsif v_type_name in ('text', 'varchar', 'bpchar', 'citext') then
    for v_constraint in
      select c.conname, pg_get_constraintdef(c.oid, true) as definition
      from pg_constraint c
      where c.conrelid = 'public.household_members'::regclass
        and c.contype = 'c'
        and v_attnum = any(c.conkey)
    loop
      v_definition := lower(v_constraint.definition);
      if position('role' in v_definition) > 0
         and position('owner' in v_definition) > 0
         and position('member' in v_definition) > 0
         and position('pending' in v_definition) > 0 then
        execute format(
          'alter table public.household_members drop constraint %I',
          v_constraint.conname
        );
      elsif position('role' in v_definition) > 0 then
        raise exception 'V22.8.46: unexpected role constraint %: %', v_constraint.conname, v_constraint.definition;
      end if;
    end loop;

    alter table public.household_members
      add constraint household_members_role_allowed_v22846
      check (role::text in ('owner', 'admin', 'member', 'viewer', 'pending', 'blocked'))
      not valid;

    alter table public.household_members
      validate constraint household_members_role_allowed_v22846;
  else
    raise exception 'V22.8.46: unsupported role type %.% (kind=%)', v_type_schema, v_type_name, v_type_kind;
  end if;
end
$migration$;

commit;

notify pgrst, 'reload schema';

with role_column as (
  select t.typtype, type_ns.nspname as type_schema, t.typname as type_name, a.attnum
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  join pg_namespace type_ns on type_ns.oid = t.typnamespace
  where a.attrelid = 'public.household_members'::regclass
    and a.attname = 'role'
    and a.attnum > 0
    and not a.attisdropped
), role_state as (
  select
    case when rc.typtype = 'e' then 'enum' else 'check_constraint' end as storage_kind,
    case
      when rc.typtype = 'e' then exists (
        select 1 from pg_enum e
        join pg_type et on et.oid = e.enumtypid
        join pg_namespace ens on ens.oid = et.typnamespace
        where ens.nspname = rc.type_schema
          and et.typname = rc.type_name
          and e.enumlabel = 'admin'
      )
      else exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.household_members'::regclass
          and c.contype = 'c'
          and rc.attnum = any(c.conkey)
          and lower(pg_get_constraintdef(c.oid, true)) like '%admin%'
      )
    end as admin_allowed
  from role_column rc
), invalid_state as (
  select count(*)::integer as invalid_role_count
  from public.household_members
  where role is not null
    and role::text not in ('owner', 'admin', 'member', 'viewer', 'pending', 'blocked')
)
select
  'V22.8.46-MEMBER-ROLE-SCHEMA-ALIGNMENT' as version,
  role_state.storage_kind,
  role_state.admin_allowed,
  invalid_state.invalid_role_count,
  (role_state.admin_allowed and invalid_state.invalid_role_count = 0) as readiness_ok
from role_state
cross join invalid_state;
