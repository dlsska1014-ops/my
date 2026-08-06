-- V22.8.71 household purge completeness
-- Review and run manually in Supabase SQL Editor before deploying the Worker.
-- This file changes only the existing atomic purge RPC. It does not execute a purge.

begin;

create or replace function public.accountbook_purge_household_v227(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transactions integer := 0;
  v_members integer := 0;
  v_households integer := 0;
begin
  perform 1 from public.households where id = p_household_id for update;
  if not found then raise exception 'household_not_found'; end if;

  if to_regclass('public.accountbook_budgets') is not null then
    execute 'delete from public.accountbook_budgets where household_id = $1' using p_household_id;
  end if;
  if to_regclass('public.accountbook_recurring') is not null then
    execute 'delete from public.accountbook_recurring where household_id = $1' using p_household_id;
  end if;
  if to_regclass('public.accountbook_categories') is not null then
    execute 'delete from public.accountbook_categories where household_id = $1' using p_household_id;
  end if;
  if to_regclass('public.accountbook_meme_cards') is not null then
    execute 'delete from public.accountbook_meme_cards where household_id = $1' using p_household_id;
  end if;

  delete from public.accountbook_transaction_audit where household_id = p_household_id;
  delete from public.accountbook_settings
  where key in (
    'custom_categories:' || p_household_id::text,
    'category_keywords:' || p_household_id::text,
    'payment_assets:' || p_household_id::text,
    'asset_history:' || p_household_id::text,
    'reserve_plans:' || p_household_id::text,
    'member_aliases:' || p_household_id::text,
    'transaction_edit_history:' || p_household_id::text,
    'settlement_history:' || p_household_id::text,
    'free_report_preference:' || p_household_id::text,
    'report_challenge:' || p_household_id::text,
    'goals:v5:' || p_household_id::text
  )
  or left(key, char_length('budgets:' || p_household_id::text || ':'))
       = 'budgets:' || p_household_id::text || ':'
  or left(key, char_length('favorites:v5:' || p_household_id::text || ':'))
       = 'favorites:v5:' || p_household_id::text || ':'
  or left(key, char_length('free_report_snapshot:' || p_household_id::text || ':'))
       = 'free_report_snapshot:' || p_household_id::text || ':'
  or left(key, char_length('kakao_edit_v2254:' || p_household_id::text || ':'))
       = 'kakao_edit_v2254:' || p_household_id::text || ':'
  or (
    left(key, char_length('kakao_cta_v215:')) = 'kakao_cta_v215:'
    and strpos(key, ':' || p_household_id::text || ':') > 0
  )
  or (
    left(key, char_length('kakao_selected_household_v2251:')) = 'kakao_selected_household_v2251:'
    and btrim(coalesce(value, '')) = p_household_id::text
  )
  or exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and left(key, char_length('kakao_flow_v215:' || hm.user_id::text || ':'))
          = 'kakao_flow_v215:' || hm.user_id::text || ':'
  );

  delete from public.transactions where household_id = p_household_id;
  get diagnostics v_transactions = row_count;
  delete from public.household_members where household_id = p_household_id;
  get diagnostics v_members = row_count;
  delete from public.households where id = p_household_id;
  get diagnostics v_households = row_count;

  return jsonb_build_object(
    'deleted', v_households = 1,
    'transactions', v_transactions,
    'members', v_members
  );
end;
$$;

revoke all on function public.accountbook_purge_household_v227(uuid) from public, anon, authenticated;
grant execute on function public.accountbook_purge_household_v227(uuid) to service_role;

commit;

-- Non-mutating post-check: exactly one function must be visible.
select count(*) as purge_rpc_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'accountbook_purge_household_v227'
  and pg_get_function_identity_arguments(p.oid) = 'p_household_id uuid';
