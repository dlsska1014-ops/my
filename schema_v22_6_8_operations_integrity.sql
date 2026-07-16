-- V22.6.8 운영·데이터 무결성 마이그레이션
-- 1. OPERATIONS_DATA_INTEGRITY_AUDIT_V22_6_8.sql 결과를 먼저 확인합니다.
-- 2. 중복이 남아 있으면 이 스크립트는 고유 인덱스 생성 전에 중단됩니다.
-- 3. 기존 거래/설정 행은 수정하거나 삭제하지 않습니다.

begin;

do $$
begin
  if exists (
    select 1 from public.accountbook_settings
    group by key having count(*) > 1
  ) then
    raise exception 'accountbook_settings.key 중복이 남아 있습니다. V22.6.8 감사 SQL로 먼저 정리하세요.';
  end if;

  if exists (
    select 1
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
  ) then
    raise exception '영수증 확정 거래 중복이 남아 있습니다. V22.6.8 감사 SQL로 먼저 정리하세요.';
  end if;

  if exists (
    select 1 from public.transactions
    where source = 'recurring_auto'
      and nullif(btrim(coalesce(raw_text, '')), '') is not null
    group by household_id, raw_text having count(*) > 1
  ) then
    raise exception '정기거래 자동 적용 중복이 남아 있습니다. V22.6.8 감사 SQL로 먼저 정리하세요.';
  end if;

  if exists (
    select 1 from public.users
    where nullif(btrim(coalesce(kakao_user_key, '')), '') is not null
    group by kakao_user_key having count(*) > 1
  ) then
    raise exception 'users.kakao_user_key 중복이 남아 있습니다. 계정 통합 후 다시 적용하세요.';
  end if;

  if exists (
    select 1 from public.household_members
    group by household_id, user_id having count(*) > 1
  ) then
    raise exception 'household_members 중복 참여행이 남아 있습니다.';
  end if;

  if exists (
    select 1 from public.households
    where nullif(btrim(coalesce(invite_code, '')), '') is not null
    group by upper(btrim(invite_code)) having count(*) > 1
  ) then
    raise exception 'households.invite_code 중복이 남아 있습니다.';
  end if;
end $$;

create unique index if not exists accountbook_settings_key_unique_v2268
on public.accountbook_settings (key);

create unique index if not exists users_kakao_user_key_unique_v2268
on public.users (kakao_user_key)
where nullif(btrim(coalesce(kakao_user_key, '')), '') is not null;

create unique index if not exists household_members_household_user_unique_v2268
on public.household_members (household_id, user_id);

create unique index if not exists households_invite_code_unique_v2268
on public.households (upper(btrim(invite_code)))
where nullif(btrim(coalesce(invite_code, '')), '') is not null;

create unique index if not exists transactions_receipt_fingerprint_unique_v2268
on public.transactions (
  household_id,
  transaction_date,
  amount,
  (
    coalesce(
      nullif(regexp_replace(lower(btrim(coalesce(raw_text, ''))), '\s+', '', 'g'), ''),
      nullif(regexp_replace(lower(btrim(coalesce(memo, ''))), '\s+', '', 'g'), '')
    )
  )
)
where source in ('receipt_confirmed', 'receipt')
  and type = 'expense'
  and (
    nullif(btrim(coalesce(raw_text, '')), '') is not null
    or nullif(btrim(coalesce(memo, '')), '') is not null
  );

create unique index if not exists transactions_recurring_identity_unique_v2268
on public.transactions (household_id, raw_text)
where source = 'recurring_auto'
  and nullif(btrim(coalesce(raw_text, '')), '') is not null;

create table if not exists public.accountbook_operation_locks (
  operation_key text primary key,
  owner text not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.accountbook_operation_locks enable row level security;
revoke all on table public.accountbook_operation_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.accountbook_operation_locks to service_role;

create or replace function public.accountbook_claim_operation(
  p_key text,
  p_owner text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.accountbook_operation_locks%rowtype;
  v_seconds integer := least(3600, greatest(15, coalesce(p_lease_seconds, 600)));
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null
     or nullif(btrim(coalesce(p_owner, '')), '') is null then
    raise exception 'operation key and owner are required';
  end if;

  delete from public.accountbook_operation_locks
  where locked_until < v_now - interval '30 days';

  insert into public.accountbook_operation_locks(operation_key, owner, locked_until, updated_at)
  values (left(btrim(p_key), 180), left(btrim(p_owner), 180), v_now + make_interval(secs => v_seconds), v_now)
  on conflict (operation_key) do update
  set owner = excluded.owner,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  where public.accountbook_operation_locks.locked_until <= v_now
     or public.accountbook_operation_locks.owner = excluded.owner
  returning * into v_row;

  if not found then
    select * into v_row
    from public.accountbook_operation_locks
    where operation_key = left(btrim(p_key), 180);
  end if;

  return jsonb_build_object(
    'acquired', v_row.owner = left(btrim(p_owner), 180) and v_row.locked_until > v_now,
    'operation_key', v_row.operation_key,
    'owner', v_row.owner,
    'locked_until', v_row.locked_until
  );
end;
$$;

create or replace function public.accountbook_release_operation(p_key text, p_owner text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.accountbook_operation_locks
  set locked_until = clock_timestamp(), updated_at = clock_timestamp()
  where operation_key = left(btrim(coalesce(p_key, '')), 180)
    and owner = left(btrim(coalesce(p_owner, '')), 180);
  get diagnostics v_count = row_count;
  return jsonb_build_object('released', v_count = 1);
end;
$$;

revoke all on function public.accountbook_claim_operation(text, text, integer) from public, anon, authenticated;
revoke all on function public.accountbook_release_operation(text, text) from public, anon, authenticated;
grant execute on function public.accountbook_claim_operation(text, text, integer) to service_role;
grant execute on function public.accountbook_release_operation(text, text) to service_role;

commit;
