-- V22.8.39 읽기 전용 사전 점검 및 적용 후 확인
-- 데이터를 추가·수정·삭제하지 않습니다.

-- 1) V22.6.8 적용을 막는 중복 데이터 점검
select check_name, issue_groups
from (
  select 'duplicate_accountbook_settings_key'::text as check_name, count(*)::bigint as issue_groups
  from (
    select key from public.accountbook_settings group by key having count(*) > 1
  ) q

  union all

  select 'duplicate_receipt_fingerprint', count(*)::bigint
  from (
    select household_id, transaction_date, amount,
      coalesce(
        nullif(regexp_replace(lower(btrim(coalesce(raw_text, ''))), '\s+', '', 'g'), ''),
        nullif(regexp_replace(lower(btrim(coalesce(memo, ''))), '\s+', '', 'g'), '')
      ) as fingerprint
    from public.transactions
    where source in ('receipt_confirmed', 'receipt')
      and type = 'expense'
      and (
        nullif(btrim(coalesce(raw_text, '')), '') is not null
        or nullif(btrim(coalesce(memo, '')), '') is not null
      )
    group by household_id, transaction_date, amount,
      coalesce(
        nullif(regexp_replace(lower(btrim(coalesce(raw_text, ''))), '\s+', '', 'g'), ''),
        nullif(regexp_replace(lower(btrim(coalesce(memo, ''))), '\s+', '', 'g'), '')
      )
    having count(*) > 1
  ) q

  union all

  select 'duplicate_recurring_identity', count(*)::bigint
  from (
    select household_id, raw_text
    from public.transactions
    where source = 'recurring_auto'
      and nullif(btrim(coalesce(raw_text, '')), '') is not null
    group by household_id, raw_text
    having count(*) > 1
  ) q

  union all

  select 'duplicate_kakao_user_key', count(*)::bigint
  from (
    select kakao_user_key
    from public.users
    where nullif(btrim(coalesce(kakao_user_key, '')), '') is not null
    group by kakao_user_key
    having count(*) > 1
  ) q

  union all

  select 'duplicate_household_member', count(*)::bigint
  from (
    select household_id, user_id
    from public.household_members
    group by household_id, user_id
    having count(*) > 1
  ) q

  union all

  select 'duplicate_invite_code', count(*)::bigint
  from (
    select upper(btrim(invite_code))
    from public.households
    where nullif(btrim(coalesce(invite_code, '')), '') is not null
    group by upper(btrim(invite_code))
    having count(*) > 1
  ) q
) checks
order by check_name;

-- 2) V22.8.39이 요구하는 핵심 RPC 존재 여부
with required(patch_file, rpc_name) as (
  values
    ('schema_v22_6_8_operations_integrity.sql', 'accountbook_claim_operation'),
    ('schema_v22_6_8_operations_integrity.sql', 'accountbook_release_operation'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_auth_attempt'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_create_local_user_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_set_local_identity_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_link_kakao_identity_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_purge_household_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_replace_budget_plan_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_apply_recurring_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_merge_users_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_update_transaction_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_delete_transaction_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_bulk_transactions_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_import_transactions_v227'),
    ('schema_v22_7_0_auth_atomicity.sql', 'accountbook_leave_household_v227')
)
select
  required.patch_file,
  required.rpc_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = required.rpc_name
  ) as required_core_rpc
from required
order by required.patch_file, required.rpc_name;

-- 3) 자산 원자성 RPC는 둘 중 하나만 있어도 정상입니다.
with alternatives(rpc_name) as (
  values
    ('accountbook_mutate_payment_assets_v2280'),
    ('accountbook_mutate_payment_assets_v2271')
)
select
  alternatives.rpc_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = alternatives.rpc_name
  ) as asset_rpc_exists
from alternatives
order by alternatives.rpc_name;

-- 4) readiness에 필요한 테이블 존재 여부
with required_tables(table_name) as (
  values
    ('transactions'),
    ('accountbook_user_identities'),
    ('accountbook_transaction_audit')
)
select
  table_name,
  to_regclass('public.' || table_name) is not null as readiness_table_exists
from required_tables
order by table_name;
