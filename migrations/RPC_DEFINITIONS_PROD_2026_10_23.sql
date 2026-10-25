-- =====================================================================
-- RPC_DEFINITIONS_PROD_2026_10_23.sql  (V22.9.44 감사 G-13, V22.9.78)
-- =====================================================================
-- 무엇: 운영 Supabase 의 public 함수 3개 정의 사본. 2026-10-23 에 pg_get_functiondef 로 읽기만 해서 받았다.
--   accountbook_mutate_payment_assets_v2280, record_nlu_failure_sample, record_nlu_metric
--   운영자 결정(2026-10-23): "운영 함수 정의를 읽기 전용으로 확보한다. DDL 적용 없음."
--   ASIDE 가 받아 Aside 세션 artifacts/RPC_G13_definitions_2026-10-23.sql 로 남긴 내용을 그대로 옮겼다(아래 영문 머리말 포함).
--   줄 끝만 맞췄다: 원본의 CRLF 25줄을 LF 로 바꿨다. 글자는 같다.
--
-- ⚠️ 실행 금지(DO NOT RUN): 근거 자료다. 운영 DB 에 다시 실행하면 그 사이 바뀐 운영 함수를 이 사본으로 덮어쓸 수 있다.
--   운영 함수를 바꾸는 판은 새 마이그레이션 파일을 따로 만들고, 바꾼 뒤에 이 사본을 다시 받는다.
--   코드가 기대하는 이름·인자는 RPC_SIGNATURES_INFERRED.sql(추정)과 대조한다.
-- =====================================================================

-- 2026-10-23 Supabase public RPC definition capture
-- Read-only pg_get_functiondef SELECT result. Not executed as DDL.
-- This is evidence, not an instruction to apply or replace production functions.

-- public.accountbook_mutate_payment_assets_v2280(p_household_id uuid, p_action text, p_asset jsonb, p_asset_id text, p_snapshot_month text)
CREATE OR REPLACE FUNCTION public.accountbook_mutate_payment_assets_v2280(p_household_id uuid, p_action text, p_asset jsonb DEFAULT '{}'::jsonb, p_asset_id text DEFAULT NULL::text, p_snapshot_month text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    if coalesce(v_asset->>'balance', '0') !~ '^-?[0-9]+([.][0-9]+)?$' then
      raise exception 'asset_balance_invalid';
    end if;
    if abs(coalesce(v_asset->>'balance', '0')::numeric) > 9000000000000
       or (coalesce(v_asset->>'balance', '0')::numeric < 0
           and coalesce(v_asset->>'kind', '') not in ('loan', 'credit_card')) then
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
        then case when coalesce(item->>'balance', '0') ~ '^-?[0-9]+([.][0-9]+)?$'
          then least(9000000000000::numeric, abs(round((item->>'balance')::numeric))) else 0 end
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
$function$


-- public.record_nlu_failure_sample(p_sample_hash text, p_redacted_sample text, p_intent text, p_result text, p_reason text, p_version text)
CREATE OR REPLACE FUNCTION public.record_nlu_failure_sample(p_sample_hash text, p_redacted_sample text, p_intent text, p_result text, p_reason text, p_version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.nlu_failure_samples(sample_hash,redacted_sample,intent,result,reason,version,hit_count,first_seen,last_seen)
  values (left(coalesce(p_sample_hash,''),80),nullif(left(coalesce(p_redacted_sample,''),180),''),left(coalesce(p_intent,'UNKNOWN'),80),left(coalesce(p_result,'error'),20),left(coalesce(p_reason,''),120),left(coalesce(p_version,''),100),1,now(),now())
  on conflict (sample_hash)
  do update set
    redacted_sample = coalesce(excluded.redacted_sample, public.nlu_failure_samples.redacted_sample),
    intent = excluded.intent,
    result = excluded.result,
    reason = excluded.reason,
    version = excluded.version,
    hit_count = public.nlu_failure_samples.hit_count + 1,
    last_seen = now();
end;
$function$


-- public.record_nlu_metric(p_bucket_start timestamp with time zone, p_intent text, p_result text, p_latency_ms integer, p_version text)
CREATE OR REPLACE FUNCTION public.record_nlu_metric(p_bucket_start timestamp with time zone, p_intent text, p_result text, p_latency_ms integer, p_version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.nlu_intent_metrics_hourly(bucket_start,intent,result,version,request_count,latency_sum_ms,latency_max_ms)
  values (date_trunc('hour',p_bucket_start),left(coalesce(p_intent,'UNKNOWN'),80),left(coalesce(p_result,'error'),20),left(coalesce(p_version,''),100),1,greatest(coalesce(p_latency_ms,0),0),greatest(coalesce(p_latency_ms,0),0))
  on conflict (bucket_start,intent,result)
  do update set
    request_count = public.nlu_intent_metrics_hourly.request_count + 1,
    latency_sum_ms = public.nlu_intent_metrics_hourly.latency_sum_ms + greatest(coalesce(excluded.latency_sum_ms,0),0),
    latency_max_ms = greatest(public.nlu_intent_metrics_hourly.latency_max_ms, excluded.latency_max_ms),
    version = excluded.version;
end;
$function$

