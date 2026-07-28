-- V22.7.1 자산 대시보드 동시 저장 보호
begin;

create or replace function public.accountbook_mutate_payment_assets_v2271(
  p_household_id uuid,
  p_action text,
  p_asset jsonb default '{}'::jsonb,
  p_asset_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := 'payment_assets:' || p_household_id::text;
  v_assets jsonb := '[]'::jsonb;
  v_asset jsonb := coalesce(p_asset, '{}'::jsonb);
  v_id text := coalesce(nullif(p_asset_id, ''), v_asset->>'id');
begin
  if p_household_id is null or not exists(select 1 from public.households where id = p_household_id) then
    raise exception 'household_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select case when jsonb_typeof(value::jsonb) = 'array' then value::jsonb else '[]'::jsonb end
    into v_assets from public.accountbook_settings where key = v_key for update;
  v_assets := coalesce(v_assets, '[]'::jsonb);

  if p_action = 'create' then
    if coalesce(v_asset->>'id', '') = '' or length(trim(coalesce(v_asset->>'name', ''))) not between 1 and 80 then raise exception 'asset_invalid'; end if;
    v_assets := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_assets) x where x->>'id' <> v_asset->>'id') || jsonb_build_array(v_asset);
  elsif p_action = 'update' then
    if coalesce(v_id, '') = '' then raise exception 'asset_id_required'; end if;
    v_assets := (select coalesce(jsonb_agg(case when x->>'id' = v_id then v_asset else x end), '[]'::jsonb) from jsonb_array_elements(v_assets) x);
  elsif p_action = 'delete' then
    v_assets := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_assets) x where x->>'id' <> v_id);
  else
    raise exception 'asset_action_invalid';
  end if;

  insert into public.accountbook_settings(key, value) values(v_key, v_assets::text)
  on conflict(key) do update set value = excluded.value;
  return v_assets;
end;
$$;

revoke all on function public.accountbook_mutate_payment_assets_v2271(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.accountbook_mutate_payment_assets_v2271(uuid,text,jsonb,text) to service_role;

commit;
