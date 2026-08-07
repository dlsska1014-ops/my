-- V22.8.79-BUDGET-STORAGE-CONSOLIDATION
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- 적용 전 백업을 만드세요. Worker 배포와 순서를 맞출 필요는 없습니다(코드 변경 없음).
--
-- 왜 필요한가
--   src/index.js 는 예산을 두 곳에 씁니다.
--     1) public.accountbook_budgets 표 (정본)
--     2) public.accountbook_settings 의 'budgets:<household_id>:<월>' JSON (폴백)
--   handleBudgetSave 는 PostgREST 로
--     POST /rest/v1/accountbook_budgets?on_conflict=household_id,month,category
--   를 보냅니다. 이 세 열을 덮는 유니크 인덱스가 없으면 PostgREST 가 42P10
--   (no unique or exclusion constraint matching the ON CONFLICT specification)
--   으로 거절하고, 코드는 조용히 saveSettingsBudget 폴백으로 넘어갑니다.
--   그래서 fetchBudgets 가 매 요청마다 표와 설정을 둘 다 읽어 mergeBudgetRows 로
--   합치고 있습니다. 이 파일은 그 원인을 DB 쪽에서 없앱니다.
--
-- 이 파일이 하는 일
--   1. public.accountbook_budgets 가 없으면 만듭니다(운영에는 이미 있을 것).
--   2. Worker 가 select 하는 열(id, household_id, month, category, amount,
--      created_at)이 모두 있는지 확인합니다. 핵심 열이 없으면 중단합니다.
--   3. (household_id, month, category) 중복 행을 최신 1건만 남기고 정리합니다.
--   4. 같은 세 열의 유니크 인덱스를 만듭니다 → on_conflict upsert 가 살아납니다.
--   5. 'budgets:%' 설정 JSON 에 남은 예산을 표로 이관하고 그 설정 키를 지웁니다.
--
-- 하지 않는 일
--   * drop / truncate 없음. 기존 예산 금액을 바꾸지 않습니다.
--   * accountbook_replace_budget_plan_v227 RPC 본문을 손대지 않습니다.
--   * src/index.js 의 폴백 코드를 전제로 두지 않습니다. 적용 전에도 후에도
--     같은 Worker 가 그대로 동작합니다(적용 후에는 폴백 경로를 타지 않을 뿐).
--   * 이미 있는 표의 RLS·권한은 바꾸지 않습니다. 현재 상태는 맨 아래 사후점검이
--     보고하고, 조일지 여부는 운영자가 판단합니다.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  v_created boolean := false;
  v_missing text;
  v_duplicates integer := 0;
  v_index_name text;
  v_setting record;
  v_household_id uuid;
  v_month text;
  v_items jsonb;
  v_inserted integer := 0;
  v_moved_keys integer := 0;
  v_moved_rows integer := 0;
  v_skipped_keys integer := 0;
begin
  ----------------------------------------------------------------------------
  -- 1. 표 보장
  ----------------------------------------------------------------------------
  if to_regclass('public.accountbook_budgets') is null then
    create table public.accountbook_budgets (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references public.households(id) on delete cascade,
      month text not null check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
      category text not null check (char_length(btrim(category)) between 1 and 80),
      -- 상한 검사를 넣지 않습니다. handleBudgetSave 는 금액을 clamp 하지 않으므로
      -- 상한을 걸면 큰 입력이 표 저장에 실패해 다시 settings 폴백으로 갈라집니다.
      -- 상한(20억)은 accountbook_replace_budget_plan_v227 이 이미 걸고 있습니다.
      amount numeric not null default 0 check (amount >= 0),
      created_at timestamptz not null default clock_timestamp()
    );

    alter table public.accountbook_budgets enable row level security;
    revoke all on table public.accountbook_budgets from public, anon, authenticated;
    grant select, insert, update, delete on table public.accountbook_budgets to service_role;

    v_created := true;
    raise notice 'V22.8.79: created public.accountbook_budgets';
  end if;

  ----------------------------------------------------------------------------
  -- 2. Worker 가 읽는 열 확인
  --    select=id,household_id,month,category,amount,created_at 중 하나라도 없으면
  --    PostgREST 가 400 을 내고 fetchBudgets 의 catch 가 표를 통째로 버립니다.
  ----------------------------------------------------------------------------
  select string_agg(needed.name, ', ' order by needed.name)
    into v_missing
  from (values ('household_id'), ('month'), ('category'), ('amount')) as needed(name)
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.accountbook_budgets'::regclass
      and a.attname = needed.name
      and a.attnum > 0
      and not a.attisdropped
  );

  if v_missing is not null then
    raise exception 'V22.8.79: public.accountbook_budgets is missing required column(s): %', v_missing;
  end if;

  -- id / created_at 은 조회 전용이라 없으면 안전하게 채워 넣습니다.
  alter table public.accountbook_budgets
    add column if not exists id uuid not null default gen_random_uuid();
  alter table public.accountbook_budgets
    add column if not exists created_at timestamptz not null default clock_timestamp();

  ----------------------------------------------------------------------------
  -- 3. 중복 정리 (유니크 인덱스를 만들려면 선행되어야 함)
  --    같은 (가계부, 월, 분류) 가 여러 건이면 created_at 이 가장 늦은 1건만 남깁니다.
  --    동률이면 금액이 큰 쪽, 그래도 동률이면 물리 순서로 결정합니다.
  ----------------------------------------------------------------------------
  with ranked as (
    select ctid,
           row_number() over (
             partition by household_id, month, category
             order by created_at desc nulls last, amount desc, ctid desc
           ) as rn
    from public.accountbook_budgets
  )
  delete from public.accountbook_budgets b
  using ranked
  where b.ctid = ranked.ctid and ranked.rn > 1;
  get diagnostics v_duplicates = row_count;

  if v_duplicates > 0 then
    raise notice 'V22.8.79: removed % duplicate budget row(s)', v_duplicates;
  end if;

  ----------------------------------------------------------------------------
  -- 4. 유니크 인덱스
  --    PostgREST 의 on_conflict 는 열 집합으로 추론하므로 유니크 "인덱스"로 충분하고
  --    열 순서는 상관없습니다. 이미 같은 집합을 덮는 유니크가 있으면 만들지 않습니다.
  ----------------------------------------------------------------------------
  select i.indexrelid::regclass::text
    into v_index_name
  from pg_index i
  where i.indrelid = 'public.accountbook_budgets'::regclass
    and i.indisunique
    and i.indpred is null
    and i.indnatts = i.indnkeyatts
    and i.indnkeyatts = 3
    -- indkey 는 int2vector 라 배열 캐스트가 버전마다 다릅니다.
    -- 텍스트 출력('1 2 3')을 쪼개는 방식이 모든 버전에서 같게 동작합니다.
    and (
      select array_agg(a.attname::text order by a.attname)
      from unnest(string_to_array(i.indkey::text, ' ')::int[]) as k(attnum)
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = k.attnum
    ) = array['category', 'household_id', 'month']
  limit 1;

  if v_index_name is null then
    create unique index accountbook_budgets_household_month_category_unique_v22879
      on public.accountbook_budgets (household_id, month, category);
    raise notice 'V22.8.79: created accountbook_budgets_household_month_category_unique_v22879';
  else
    raise notice 'V22.8.79: reusing existing unique index %', v_index_name;
  end if;

  ----------------------------------------------------------------------------
  -- 5. settings JSON 폴백 이관
  --    키 형식: 'budgets:<household_id>:<YYYY-MM>' (budgetsSettingsKey)
  --    값 형식: saveSettingsBudget 이 JSON.stringify 한 배열 문자열
  --    표에 이미 같은 분류가 있으면 표를 정본으로 두고 건너뜁니다
  --    (mergeBudgetRows 가 primary=table 을 우선하는 것과 같은 판단).
  ----------------------------------------------------------------------------
  for v_setting in
    select key, value
    from public.accountbook_settings
    where left(key, char_length('budgets:')) = 'budgets:'
    order by key
  loop
    v_household_id := null;
    v_month := split_part(v_setting.key, ':', 3);
    v_items := null;

    -- 가계부 ID 가 uuid 가 아니거나(예: 'budgets:default:2026-08')
    -- 월 형식이 아니면 손대지 않고 남깁니다.
    if split_part(v_setting.key, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
      v_household_id := split_part(v_setting.key, ':', 2)::uuid;
    end if;

    if v_household_id is null
       or not exists (select 1 from public.households h where h.id = v_household_id) then
      v_skipped_keys := v_skipped_keys + 1;
      continue;
    end if;

    -- 깨진 JSON 은 건너뜁니다. 지우지 않으므로 나중에 사람이 볼 수 있습니다.
    begin
      v_items := case
        when jsonb_typeof(coalesce(v_setting.value, '')::jsonb) = 'array'
          then v_setting.value::jsonb
        else null
      end;
    exception when others then
      v_items := null;
    end;

    if v_items is null then
      v_skipped_keys := v_skipped_keys + 1;
      continue;
    end if;

    insert into public.accountbook_budgets (household_id, month, category, amount)
    select distinct on (left(btrim(item->>'category'), 80))
           v_household_id,
           v_month,
           left(btrim(item->>'category'), 80),
           greatest(0, least(2000000000, round((item->>'amount')::numeric)))
    from jsonb_array_elements(v_items) item
    where nullif(btrim(item->>'category'), '') is not null
      and coalesce(item->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
      and (item->>'amount')::numeric > 0
    order by left(btrim(item->>'category'), 80),
             (item->>'amount')::numeric desc
    on conflict (household_id, month, category) do nothing;
    get diagnostics v_inserted = row_count;

    -- 금액 0 이하 / 분류 빈 항목은 옮기지 않습니다. budgetSummary·incomePlans·
    -- expensePlans 가 모두 amount > 0 만 세므로 화면과 집계에서 이미 무시됩니다.
    delete from public.accountbook_settings where key = v_setting.key;

    v_moved_keys := v_moved_keys + 1;
    v_moved_rows := v_moved_rows + v_inserted;
  end loop;

  raise notice 'V22.8.79: created_table=% duplicates_removed=% settings_keys_moved=% budget_rows_moved=% settings_keys_skipped=%',
    v_created, v_duplicates, v_moved_keys, v_moved_rows, v_skipped_keys;
end
$migration$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 사후점검 (비변경 조회)
--   upsert_ready 가 true 여야 handleBudgetSave 의 on_conflict 가 동작합니다.
--   leftover_settings_budget_keys 는 uuid 가 아니거나 JSON 이 깨진 키만 남습니다.
--   rls_enabled / anon_or_authenticated_grants 는 보고만 합니다. 이 파일은 이미
--   있던 표의 권한을 바꾸지 않습니다. 아래 값이 (false, > 0) 이면 별도 판단이
--   필요합니다.
-- ---------------------------------------------------------------------------
select
  'V22.8.79-BUDGET-STORAGE-CONSOLIDATION' as version,
  to_regclass('public.accountbook_budgets') is not null as table_present,
  (
    select count(*)::integer
    from pg_index i
    where i.indrelid = 'public.accountbook_budgets'::regclass
      and i.indisunique
      and i.indpred is null
      and i.indnatts = i.indnkeyatts
      and i.indnkeyatts = 3
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(string_to_array(i.indkey::text, ' ')::int[]) as k(attnum)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      ) = array['category', 'household_id', 'month']
  ) > 0 as upsert_ready,
  (
    select count(*)::integer
    from (
      select 1
      from public.accountbook_budgets
      group by household_id, month, category
      having count(*) > 1
    ) dup
  ) as duplicate_groups,
  (
    select count(*)::integer
    from public.accountbook_settings
    where left(key, char_length('budgets:')) = 'budgets:'
  ) as leftover_settings_budget_keys,
  (
    select count(*)::integer from public.accountbook_budgets
  ) as budget_rows,
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.accountbook_budgets'::regclass
  ) as rls_enabled,
  (
    select count(*)::integer
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.table_name = 'accountbook_budgets'
      and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  ) as anon_or_authenticated_grants;
