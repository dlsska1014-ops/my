-- V22.8.0 자산 목록 + 월별 순자산 이력 원자 저장
-- 기존 schema_v22_7_0_auth_atomicity.sql 적용 후 실행합니다.
begin;

create or replace function public.accountbook_mutate_payment_assets_v2280(
  p_household_id uuid,
  p_action text,
  p_asset jsonb default '{}'::jsonb,
  p_asset_id text default null,
  p_snapshot_month text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assets_key text := 'payment_assets:' || p_household_id::text;
  v_history_key text := 'asset_history:' || p_household_id::text;
  v_assets jsonb := '[]'::jsonb;
  v_history jsonb := '{}'::jsonb;
  v_asset jsonb := coalesce(p_asset, '{}'::jsonb);
  v_id text := coalesce(nullif(trim(p_asset_id), ''), nullif(trim(v_asset->>'id'), ''));
  v_name_key text;
  v_month text := coalesce(nullif(trim(p_snapshot_month), ''), to_char(timezone('Asia/Seoul', now()), 'YYYY-MM'));
  v_asset_total numeric := 0;
  v_liability_total numeric := 0;
  v_exists boolean := false;
begin
  if p_household_id is null or not exists (
    select 1 from public.households where id = p_household_id
  ) then
    raise exception 'household_not_found';
  end if;

  if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'asset_snapshot_month_invalid';
  end if;
  if p_action not in ('create', 'update', 'delete') then
    raise exception 'asset_action_invalid';
  end if;

  -- 같은 가계부의 자산 목록과 이력을 하나의 트랜잭션으로 직렬화합니다.
  perform pg_advisory_xact_lock(hashtextextended(v_assets_key, 0));

  begin
    select value::jsonb
      into v_assets
      from public.accountbook_settings
     where key = v_assets_key
     for update;
  exception when others then
    raise exception 'asset_storage_invalid';
  end;
  v_assets := coalesce(v_assets, '[]'::jsonb);
  if jsonb_typeof(v_assets) <> 'array' then
    raise exception 'asset_storage_invalid';
  end if;
  if jsonb_array_length(v_assets) > 200 then
    raise exception 'asset_limit_exceeded';
  end if;

  if p_action in ('create', 'update') then
    if jsonb_typeof(v_asset) <> 'object' then
      raise exception 'asset_invalid';
    end if;
    if v_id is null or v_id !~ '^[A-Za-z0-9_:-]{1,120}$' then
      raise exception 'asset_id_invalid';
    end if;
    if length(trim(coalesce(v_asset->>'name', ''))) not between 1 and 80 then
      raise exception 'asset_name_invalid';
    end if;
    if coalesce(v_asset->>'kind', '') not in (
      'bank_account', 'cash', 'easy_pay', 'savings', 'investment', 'crypto',
      'pension', 'real_estate', 'car', 'asset', 'loan', 'credit_card', 'check_card'
    ) then
      raise exception 'asset_kind_invalid';
    end if;
    if length(coalesce(v_asset->>'issuer', '')) > 80 or length(coalesce(v_asset->>'memo', '')) > 120 then
      raise exception 'asset_text_too_long';
    end if;
    if length(regexp_replace(coalesce(v_asset->>'name', ''), '[^0-9]', '', 'g')) >= 12
       or length(regexp_replace(coalesce(v_asset->>'issuer', ''), '[^0-9]', '', 'g')) >= 12
       or length(regexp_replace(coalesce(v_asset->>'memo', ''), '[^0-9]', '', 'g')) >= 12 then
      raise exception 'asset_sensitive_or_invalid';
    end if;
    if coalesce(v_asset->>'balance', '0') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'asset_balance_invalid';
    end if;
    if coalesce(v_asset->>'balance', '0')::numeric > 9000000000000 then
      raise exception 'asset_balance_invalid';
    end if;

    v_asset := v_asset
      || jsonb_build_object(
        'id', v_id,
        'household_id', p_household_id::text,
        'balance', round(coalesce(v_asset->>'balance', '0')::numeric),
        'include_in_asset', case
          when coalesce(v_asset->>'kind', '') in (
            'bank_account', 'cash', 'easy_pay', 'savings', 'investment', 'crypto',
            'pension', 'real_estate', 'car', 'asset'
          ) then coalesce(v_asset->>'include_in_asset', 'true') = 'true'
          else false
        end
      );
    v_name_key := lower(regexp_replace(trim(v_asset->>'name'), '\s+', '', 'g'));
  end if;

  if p_action = 'create' then
    if jsonb_array_length(v_assets) >= 200 then
      raise exception 'asset_limit_exceeded';
    end if;
    select exists (
      select 1
        from jsonb_array_elements(v_assets) item
       where item->>'id' = v_id
          or lower(regexp_replace(trim(coalesce(item->>'name', '')), '\s+', '', 'g')) = v_name_key
    ) into v_exists;
    if v_exists then
      raise exception 'asset_name_duplicate';
    end if;
    v_assets := v_assets || jsonb_build_array(v_asset);
  elsif p_action = 'update' then
    select exists (
      select 1 from jsonb_array_elements(v_assets) item where item->>'id' = v_id
    ) into v_exists;
    if not v_exists then
      raise exception 'asset_not_found';
    end if;
    select exists (
      select 1
        from jsonb_array_elements(v_assets) item
       where item->>'id' <> v_id
         and lower(regexp_replace(trim(coalesce(item->>'name', '')), '\s+', '', 'g')) = v_name_key
    ) into v_exists;
    if v_exists then
      raise exception 'asset_name_duplicate';
    end if;
    select coalesce(jsonb_agg(case when item->>'id' = v_id then v_asset else item end), '[]'::jsonb)
      into v_assets
      from jsonb_array_elements(v_assets) item;
  else
    if v_id is null or v_id !~ '^[A-Za-z0-9_:-]{1,120}$' then
      raise exception 'asset_id_invalid';
    end if;
    select exists (
      select 1 from jsonb_array_elements(v_assets) item where item->>'id' = v_id
    ) into v_exists;
    if not v_exists then
      raise exception 'asset_not_found';
    end if;
    select coalesce(jsonb_agg(item), '[]'::jsonb)
      into v_assets
      from jsonb_array_elements(v_assets) item
     where item->>'id' <> v_id;
  end if;

  select
    coalesce(sum(
      case
        when item->>'kind' in (
          'bank_account', 'cash', 'easy_pay', 'savings', 'investment', 'crypto',
          'pension', 'real_estate', 'car', 'asset'
        ) and coalesce(item->>'include_in_asset', 'true') <> 'false'
        then case when coalesce(item->>'balance', '0') ~ '^[0-9]+([.][0-9]+)?$'
          then least(9000000000000::numeric, round((item->>'balance')::numeric)) else 0 end
        else 0
      end
    ), 0),
    coalesce(sum(
      case
        when item->>'kind' = 'loan'
        then case when coalesce(item->>'balance', '0') ~ '^[0-9]+([.][0-9]+)?$'
          then least(9000000000000::numeric, round((item->>'balance')::numeric)) else 0 end
        else 0
      end
    ), 0)
    into v_asset_total, v_liability_total
    from jsonb_array_elements(v_assets) item;

  begin
    select value::jsonb
      into v_history
      from public.accountbook_settings
     where key = v_history_key
     for update;
  exception when others then
    raise exception 'asset_history_invalid';
  end;
  v_history := coalesce(v_history, '{}'::jsonb);
  if jsonb_typeof(v_history) <> 'object' then
    raise exception 'asset_history_invalid';
  end if;

  v_history := jsonb_set(
    v_history,
    array[v_month],
    jsonb_build_object(
      'asset_total', v_asset_total,
      'liability_total', v_liability_total,
      'net_worth', v_asset_total - v_liability_total,
      'saved_at', timezone('utc', now())
    ),
    true
  );

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into v_history
    from (
      select key, value
        from jsonb_each(v_history)
       where key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
       order by key desc
       limit 24
    ) entry;

  insert into public.accountbook_settings(key, value)
  values(v_assets_key, v_assets::text)
  on conflict(key) do update set value = excluded.value;

  insert into public.accountbook_settings(key, value)
  values(v_history_key, v_history::text)
  on conflict(key) do update set value = excluded.value;

  return jsonb_build_object(
    'assets', v_assets,
    'history', v_history,
    'history_recorded', true
  );
end;
$$;

revoke all on function public.accountbook_mutate_payment_assets_v2280(uuid,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.accountbook_mutate_payment_assets_v2280(uuid,text,jsonb,text,text) to service_role;

commit;
