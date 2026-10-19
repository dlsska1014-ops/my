-- REVIEW ONLY. Not an approved migration; deliberately refuses execution.
-- Complete-schema and live cutover evidence must be reviewed before replacing this gate.
BEGIN;
DO $review_only$ BEGIN
  RAISE EXCEPTION 'v61_review_only_full_schema_and_cutover_approval_required';
END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.households, public.transactions, public.accountbook_settings IN ACCESS EXCLUSIVE MODE;
DO $legacy_guard$ DECLARE p record; BEGIN
  SELECT r.rolname AS owner_name, f.prosecdef, f.proconfig, f.proacl INTO p
    FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner WHERE f.oid='public.accountbook_import_transactions_v227(uuid,jsonb)'::regprocedure;
  IF p.owner_name IS DISTINCT FROM 'postgres' OR p.prosecdef IS DISTINCT FROM true
     OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('service_role','public.accountbook_import_transactions_v227(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.accountbook_import_transactions_v227(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.accountbook_import_transactions_v227(uuid,jsonb)','EXECUTE')
     OR md5(replace(pg_get_functiondef('public.accountbook_import_transactions_v227(uuid,jsonb)'::regprocedure), E'\r\n', E'\n')) <> '0cd6e6d7742577d311564887fc583839' THEN
    RAISE EXCEPTION 'v61_saved_legacy_contract_changed:accountbook_import_transactions_v227';
  END IF;
END $legacy_guard$;
DO $legacy_guard$ DECLARE p record; BEGIN
  SELECT r.rolname AS owner_name, f.prosecdef, f.proconfig, f.proacl INTO p
    FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner WHERE f.oid='public.accountbook_purge_household_v227(uuid)'::regprocedure;
  IF p.owner_name IS DISTINCT FROM 'postgres' OR p.prosecdef IS DISTINCT FROM true
     OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('service_role','public.accountbook_purge_household_v227(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.accountbook_purge_household_v227(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.accountbook_purge_household_v227(uuid)','EXECUTE')
     OR md5(replace(pg_get_functiondef('public.accountbook_purge_household_v227(uuid)'::regprocedure), E'\r\n', E'\n')) <> 'd17c52e9de4371f1beca31fb0dfaa921' THEN
    RAISE EXCEPTION 'v61_saved_legacy_contract_changed:accountbook_purge_household_v227';
  END IF;
END $legacy_guard$;
DO $new_names$ BEGIN
  IF to_regprocedure('public.accountbook_import_source_v22960(uuid,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.accountbook_commit_import_v22960(uuid,jsonb,text,text)') IS NOT NULL
     OR to_regprocedure('public.accountbook_purge_household_v22960(uuid)') IS NOT NULL
     OR to_regprocedure('public.accountbook_import_protocol_guard_v22960()') IS NOT NULL THEN
    RAISE EXCEPTION 'v61_lifecycle_name_already_present_review_required';
  END IF;
END $new_names$;
CREATE OR REPLACE FUNCTION public.accountbook_import_transactions_v227(p_household_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_inserted integer := 0;
  v_duplicates integer := 0;
begin
  if coalesce(current_setting('accountbook.import_protocol_v22960', true), '') <> 'import:' || p_household_id::text then raise exception 'import_contract_upgrade_required'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'rows_must_be_array'; end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 1000 then raise exception 'invalid_import_size'; end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    if (v_item->>'household_id')::uuid <> p_household_id then raise exception 'import_household_scope_mismatch'; end if;
    if not exists (
      select 1 from public.household_members
      where household_id = p_household_id
        and user_id = (v_item->>'user_id')::uuid
        and role not in ('blocked', 'pending')
    ) then raise exception 'import_spender_not_member'; end if;
    if coalesce((v_item->>'amount')::numeric, 0) <= 0 then raise exception 'invalid_import_amount'; end if;
    if coalesce(v_item->>'type', '') not in ('income', 'expense') then raise exception 'invalid_import_type'; end if;

    insert into public.transactions(
      id, household_id, user_id, type, amount, category, memo, payment_method,
      transaction_date, source, source_user_key, raw_text
    ) values (
      (v_item->>'id')::uuid,
      p_household_id,
      (v_item->>'user_id')::uuid,
      v_item->>'type',
      (v_item->>'amount')::numeric,
      left(coalesce(v_item->>'category', ''), 80),
      left(coalesce(v_item->>'memo', ''), 160),
      left(coalesce(v_item->>'payment_method', ''), 40),
      (v_item->>'transaction_date')::date,
      case when v_item->>'source' = 'backup_import_v19_3' then 'backup_import_v19_3' else 'my_import' end,
      left(coalesce(v_item->>'source_user_key', ''), 180),
      left(coalesce(v_item->>'raw_text', ''), 500)
    ) on conflict (id) do nothing;
    if found then v_inserted := v_inserted + 1; else v_duplicates := v_duplicates + 1; end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.accountbook_purge_household_v227(p_household_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_transactions integer := 0;
  v_members integer := 0;
  v_households integer := 0;
begin
  if coalesce(current_setting('accountbook.import_protocol_v22960', true), '') <> 'purge:' || p_household_id::text then raise exception 'purge_contract_upgrade_required'; end if;
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
$function$
;
CREATE FUNCTION public.accountbook_import_protocol_guard_v22960()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE ctx text := coalesce(current_setting('accountbook.import_protocol_v22960', true), '');
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.source IN ('my_import','backup_import_v19_3') AND ctx <> 'import:' || NEW.household_id::text THEN
      RAISE EXCEPTION 'import_contract_upgrade_required';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'households' THEN
    IF ctx <> 'purge:' || OLD.id::text THEN RAISE EXCEPTION 'purge_contract_upgrade_required'; END IF;
    RETURN OLD;
  END IF;
  IF ((TG_OP <> 'INSERT' AND (left(OLD.key,char_length('my_import_source_v22955:')) = 'my_import_source_v22955:' OR left(OLD.key,char_length('my_import_scope_v22959:')) = 'my_import_scope_v22959:'))
     OR (TG_OP <> 'DELETE' AND (left(NEW.key,char_length('my_import_source_v22955:')) = 'my_import_source_v22955:' OR left(NEW.key,char_length('my_import_scope_v22959:')) = 'my_import_scope_v22959:')))
     AND ctx !~ '^(state|purge):[a-f0-9-]{36}$' THEN
    RAISE EXCEPTION 'import_state_contract_upgrade_required';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $body$;

CREATE TRIGGER import_insert_protocol_v22960 BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.accountbook_import_protocol_guard_v22960();
CREATE TRIGGER import_settings_protocol_v22960 BEFORE INSERT OR UPDATE OR DELETE ON public.accountbook_settings
FOR EACH ROW EXECUTE FUNCTION public.accountbook_import_protocol_guard_v22960();
CREATE TRIGGER household_delete_protocol_v22960 BEFORE DELETE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.accountbook_import_protocol_guard_v22960();

-- A single row lock precedes every source registration/CAS, import and purge.
-- SQL text values retain the exact Worker bytes; jsonb is used for validation only.
CREATE FUNCTION public.accountbook_import_source_v22960(
  p_household_id uuid, p_source_hash text, p_expected_value text DEFAULT NULL,
  p_next_value text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  sk text; ok text; ov text; current_value text; current_owner text; st jsonb;
  previous_context text := coalesce(current_setting('accountbook.import_protocol_v22960', true), '');
BEGIN
  PERFORM 1 FROM public.households WHERE id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'household_not_found'; END IF;
  IF p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'import_source_scope_invalid'; END IF;
  sk := 'my_import_source_v22955:' || encode(sha256(convert_to(p_household_id::text || '|' || p_source_hash, 'UTF8')), 'hex');
  ok := 'my_import_scope_v22959:' || encode(sha256(convert_to(p_household_id::text, 'UTF8')), 'hex') || ':' || p_source_hash;
  ov := format('{"v":1,"household_id":"%s","source_hash":"%s","state_key":"%s"}', p_household_id, p_source_hash, sk);
  SELECT value INTO current_owner FROM public.accountbook_settings WHERE key = ok;
  IF FOUND AND current_owner IS DISTINCT FROM ov THEN RAISE EXCEPTION 'import_source_scope_changed'; END IF;
  SELECT value INTO current_value FROM public.accountbook_settings WHERE key = sk;
  IF p_next_value IS NOT NULL THEN
    IF current_value IS DISTINCT FROM p_expected_value THEN RAISE EXCEPTION 'import_source_state_changed'; END IF;
    st := p_next_value::jsonb;
    IF jsonb_typeof(st) IS DISTINCT FROM 'object' OR st->'v' IS DISTINCT FROM '1'::jsonb
       OR coalesce(st->>'revision', '') !~ '^[a-f0-9]{32}$'
       OR left(p_next_value, char_length('{"revision":"' || (st->>'revision') || '",')) IS DISTINCT FROM '{"revision":"' || (st->>'revision') || '",'
       OR coalesce(st->>'state', '') NOT IN ('preview','pending','complete','failed')
       OR jsonb_typeof(st->'rows') IS DISTINCT FROM 'array'
       OR jsonb_typeof(st->'jti') IS DISTINCT FROM 'string' OR coalesce(st->>'jti','') = '' THEN
      RAISE EXCEPTION 'import_source_state_invalid';
    END IF;
    IF jsonb_array_length(st->'rows') > 1000
       OR (st->>'state' = 'pending' AND jsonb_array_length(st->'rows') = 0)
       OR (st->>'state' <> 'pending' AND jsonb_array_length(st->'rows') <> 0)
       OR EXISTS (SELECT FROM jsonb_array_elements(st->'rows') item
         WHERE coalesce(item->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
            OR coalesce(item->>'hash','') !~ '^[a-f0-9]{64}$')
       OR (SELECT count(*) <> count(DISTINCT item->>'id') FROM jsonb_array_elements(st->'rows') item) THEN
      RAISE EXCEPTION 'import_source_state_invalid';
    END IF;
    -- Pending bytes can be refreshed only with the same token and fixed rows.
    IF current_value IS NOT NULL AND current_value::jsonb->>'state' = 'pending'
       AND st->>'state' = 'pending'
       AND (st->>'jti' IS DISTINCT FROM current_value::jsonb->>'jti'
            OR st->'rows' IS DISTINCT FROM current_value::jsonb->'rows') THEN
      RAISE EXCEPTION 'import_pending_identity_changed';
    END IF;
    IF current_value IS NOT NULL AND current_value::jsonb->>'state' = 'pending' THEN
      IF st->>'state' = 'preview' THEN RAISE EXCEPTION 'import_pending_unresolved'; END IF;
      IF st->>'state' = 'failed' AND EXISTS (
        SELECT FROM jsonb_array_elements(current_value::jsonb->'rows') signature
        JOIN public.transactions t ON t.id = (signature->>'id')::uuid
      ) THEN RAISE EXCEPTION 'import_pending_rows_exist'; END IF;
      IF st->>'state' = 'complete' AND EXISTS (
        SELECT FROM jsonb_array_elements(current_value::jsonb->'rows') signature
        WHERE NOT EXISTS (SELECT FROM public.transactions t WHERE t.id = (signature->>'id')::uuid AND t.household_id = p_household_id)
      ) THEN RAISE EXCEPTION 'import_pending_rows_missing'; END IF;
    END IF;
  END IF;
  PERFORM set_config('accountbook.import_protocol_v22960', 'state:' || p_household_id::text, true);
  INSERT INTO public.accountbook_settings(key,value) VALUES(ok,ov) ON CONFLICT(key) DO NOTHING;
  IF p_next_value IS NOT NULL THEN
    INSERT INTO public.accountbook_settings(key,value) VALUES(sk,p_next_value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    current_value := p_next_value;
  END IF;
  PERFORM set_config('accountbook.import_protocol_v22960', previous_context, true);
  RETURN jsonb_build_object('key',sk,'value',current_value,'scope_key',ok,'scope_value',ov);
END $body$;

CREATE FUNCTION public.accountbook_commit_import_v22960(
  p_household_id uuid, p_rows jsonb, p_source_hash text DEFAULT NULL, p_expected_value text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE scope jsonb; st jsonb; result jsonb; row_item jsonb; owner_row record; prefix text; source_count integer := 0;
  previous_context text := coalesce(current_setting('accountbook.import_protocol_v22960', true), '');
BEGIN
  PERFORM 1 FROM public.households WHERE id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'household_not_found'; END IF;
  IF p_source_hash IS NOT NULL THEN
    scope := public.accountbook_import_source_v22960(p_household_id, p_source_hash);
    IF p_expected_value IS NULL OR scope->>'value' IS DISTINCT FROM p_expected_value THEN
      RAISE EXCEPTION 'import_source_state_changed';
    END IF;
    st := p_expected_value::jsonb;
    IF st->>'state' IS DISTINCT FROM 'pending' OR jsonb_typeof(st->'rows') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'import_source_not_pending';
    END IF;
    FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      IF NOT EXISTS (SELECT FROM jsonb_array_elements(st->'rows') signature WHERE signature->>'id' = row_item->>'id') THEN
        RAISE EXCEPTION 'import_pending_identity_changed';
      END IF;
    END LOOP;
  ELSE
    -- Administrator imports have no signed source state; never bypass an owned pending.
    IF p_expected_value IS NOT NULL THEN RAISE EXCEPTION 'import_source_scope_invalid'; END IF;
    prefix := 'my_import_scope_v22959:' || encode(sha256(convert_to(p_household_id::text,'UTF8')),'hex') || ':';
    FOR owner_row IN SELECT key,value FROM public.accountbook_settings WHERE left(key,char_length(prefix)) = prefix ORDER BY key LOOP
      source_count := source_count + 1;
      IF source_count > 1000 THEN RAISE EXCEPTION 'household_purge_scope_too_large'; END IF;
      st := owner_row.value::jsonb;
      IF owner_row.key IS DISTINCT FROM prefix || (st->>'source_hash') THEN RAISE EXCEPTION 'import_source_scope_invalid'; END IF;
      scope := public.accountbook_import_source_v22960(p_household_id,st->>'source_hash');
      IF scope->>'value' IS NOT NULL THEN
        st := (scope->>'value')::jsonb;
        IF coalesce(st->>'state','') NOT IN ('preview','complete','failed') THEN RAISE EXCEPTION 'household_import_pending'; END IF;
      END IF;
    END LOOP;
  END IF;
  -- Recheck member existence inside the legacy function while holding the household lock.
  -- Worker session/actor authorization and exact row hashes remain mandatory in the adapter.
  PERFORM set_config('accountbook.import_protocol_v22960','import:' || p_household_id::text,true);
  result := public.accountbook_import_transactions_v227(p_household_id,p_rows);
  PERFORM set_config('accountbook.import_protocol_v22960',previous_context,true);
  RETURN result;
END $body$;

CREATE FUNCTION public.accountbook_purge_household_v22960(p_household_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  prefix text; owner_row record; scope jsonb; sk text; source_hash text; raw_state text; state jsonb;
  count_sources integer := 0; result jsonb;
  previous_context text := coalesce(current_setting('accountbook.import_protocol_v22960', true), '');
BEGIN
  PERFORM 1 FROM public.households WHERE id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'household_not_found'; END IF;
  prefix := 'my_import_scope_v22959:' || encode(sha256(convert_to(p_household_id::text,'UTF8')),'hex') || ':';
  PERFORM set_config('accountbook.import_protocol_v22960','purge:' || p_household_id::text,true);
  FOR owner_row IN SELECT key,value FROM public.accountbook_settings WHERE left(key,char_length(prefix)) = prefix ORDER BY key LOOP
    count_sources := count_sources + 1;
    IF count_sources > 1000 THEN RAISE EXCEPTION 'household_purge_scope_too_large'; END IF;
    scope := owner_row.value::jsonb;
    source_hash := scope->>'source_hash';
    IF source_hash IS NULL OR source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'import_source_scope_invalid'; END IF;
    sk := 'my_import_source_v22955:' || encode(sha256(convert_to(p_household_id::text || '|' || source_hash,'UTF8')),'hex');
    IF owner_row.key IS DISTINCT FROM prefix || source_hash
       OR scope IS DISTINCT FROM jsonb_build_object('v',1,'household_id',p_household_id::text,'source_hash',source_hash,'state_key',sk) THEN
      RAISE EXCEPTION 'import_source_scope_invalid';
    END IF;
    SELECT value INTO raw_state FROM public.accountbook_settings WHERE key = sk;
    IF FOUND THEN
      state := raw_state::jsonb;
      IF state->>'state' = 'pending' THEN RAISE EXCEPTION 'household_import_pending'; END IF;
      IF jsonb_typeof(state) IS DISTINCT FROM 'object' OR state->'v' IS DISTINCT FROM '1'::jsonb
         OR coalesce(state->>'revision','') !~ '^[a-f0-9]{32}$'
         OR coalesce(state->>'state','') NOT IN ('preview','complete','failed')
         OR state->'rows' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'import_source_state_invalid'; END IF;
      DELETE FROM public.accountbook_settings WHERE key = sk;
    END IF;
    DELETE FROM public.accountbook_settings WHERE key = owner_row.key;
  END LOOP;
  result := public.accountbook_purge_household_v227(p_household_id);
  PERFORM set_config('accountbook.import_protocol_v22960',previous_context,true);
  RETURN result || jsonb_build_object('import_sources',count_sources);
END $body$;

REVOKE ALL ON FUNCTION public.accountbook_import_protocol_guard_v22960() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accountbook_import_source_v22960(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accountbook_commit_import_v22960(uuid,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accountbook_purge_household_v22960(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accountbook_import_source_v22960(uuid,text,text,text),
  public.accountbook_commit_import_v22960(uuid,jsonb,text,text), public.accountbook_purge_household_v22960(uuid) TO service_role;

-- Nested SECURITY DEFINER wrappers execute these legacy bodies as their owner.
-- Direct service-role callers must use the new contract, including old Workers.
REVOKE EXECUTE ON FUNCTION public.accountbook_import_transactions_v227(uuid,jsonb),
  public.accountbook_purge_household_v227(uuid) FROM service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
