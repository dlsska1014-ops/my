-- V22.9.29: targeted recurring RPC repair. No table/schema/data changes.
-- Apply this SQL BEFORE deploying the V22.9.29 Worker.
-- Existing rows and last_applied_month are not rewritten.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

create or replace function public.accountbook_apply_recurring_v227(
  p_household_id uuid,
  p_month text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_invalid integer := 0;
begin
  if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'invalid_month'; end if;
  if to_regclass('public.accountbook_recurring') is null then raise exception 'accountbook_recurring_required'; end if;

  select count(*) into v_invalid
  from public.accountbook_recurring r
  left join public.household_members hm
    on hm.household_id = r.household_id and hm.user_id = r.user_id
  where r.household_id = p_household_id
    and coalesce(r.is_active, true)
    and coalesce(r.last_applied_month, '') <> p_month
    and (r.user_id is null or hm.user_id is null or hm.role in ('blocked', 'pending'));
  if v_invalid > 0 then raise exception 'recurring_spender_required'; end if;

  insert into public.transactions(
    household_id, user_id, type, amount, category, memo, payment_method,
    transaction_date, source, raw_text
  )
  select r.household_id,
         r.user_id,
         case when r.type = 'income' then 'income' else 'expense' end,
         r.amount,
         r.category,
         r.memo,
         r.payment_method,
         make_date(
           split_part(p_month, '-', 1)::integer,
           split_part(p_month, '-', 2)::integer,
           least(extract(day from (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day'))::integer, greatest(1, coalesce(r.day_of_month, 1)))
         ),
         'recurring_auto',
         'recurring:' || r.id::text || ':' || p_month
  from public.accountbook_recurring r
  where r.household_id = p_household_id
    and coalesce(r.is_active, true)
    and coalesce(r.last_applied_month, '') <> p_month
  on conflict do nothing;
  get diagnostics v_count = row_count;

  update public.accountbook_recurring
  set last_applied_month = p_month
  where household_id = p_household_id
    and coalesce(is_active, true)
    and coalesce(last_applied_month, '') <> p_month;

  return jsonb_build_object('inserted', v_count);
end;
$$;

commit;
