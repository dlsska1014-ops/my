-- V22.8.79-TABLE-GRANTS-HARDENING
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- `04_APPLY_BUDGET_GRANTS_V22_8_79.sql` 의 사후점검 2 에서 나온 나머지 표를 같은
-- 방식으로 정리합니다. 04 를 먼저 돌릴 필요는 없습니다(서로 독립).
--
-- 왜 필요한가
--   2026-08-07 운영 조사 결과 `public` 스키마 18개 표 중 11개가
--     RLS 켜짐 · 정책 0건 · anon·authenticated 에 7개 권한 전부
--   상태였습니다. Supabase 가 `public` 스키마 표에 주는 기본값입니다.
--   저장소 SQL(V22.6.8·V22.7.0)이 만든 표 7개만 이미 회수돼 있었습니다.
--
--   **읽기·쓰기는 이미 막혀 있습니다.** 정책이 하나도 없는 RLS 는 기본 거부라서
--   anon·authenticated 는 SELECT·INSERT·UPDATE·DELETE 를 못 합니다.
--
--   **그러나 RLS 는 TRUNCATE·TRIGGER·REFERENCES 를 덮지 않습니다.**
--   로컬 PostgreSQL 16.13 에서 같은 상태를 만들어 확인했습니다.
--     anon 으로 select   → 0행             (RLS 가 막음)
--     anon 으로 truncate → TRUNCATE TABLE  (성공, 표가 비워짐)
--
--   그래서 이 변경으로 실제 닫히는 것은 그 세 권한뿐이고, **동작하던 흐름은
--   끊길 수 없습니다.** anon 으로 되던 읽기·쓰기가 애초에 없기 때문입니다.
--
-- 앱에 영향이 없는 근거 (두 겹)
--   1. Worker 는 `SUPABASE_SERVICE_ROLE_KEY` 만 씁니다. `supabase()`
--      (`src/index.js:28752`)·`supabaseExactCount()` (`7576`) 가 `apikey` 와
--      `authorization` 에 모두 service_role 키를 넣고, 코드 전체에
--      `SUPABASE_ANON_KEY` 사용처가 없습니다.
--   2. 브라우저는 Supabase 에 직접 닿지 못합니다. CSP 의 `connect-src` 가
--      `'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com
--      https://kauth.kakao.com https://kapi.kakao.com` 뿐이라 Supabase 주소가
--      없습니다. 클라이언트측 Supabase 호출 자체가 불가능합니다.
--
-- 확인하지 못한 것
--   이 저장소 밖에서 같은 DB 에 붙는 다른 소비자(다른 앱·Realtime 구독·외부
--   스크립트)가 anon·authenticated 키로 이 표들을 쓰고 있다면 그쪽은 영향을
--   받습니다. 운영자만 알 수 있는 부분입니다. 짚이는 곳이 없다면 그대로
--   진행하면 됩니다. 되돌리는 방법은 맨 아래에 있습니다.
--
-- 하는 일 / 하지 않는 일
--   * `public`·`anon`·`authenticated` 에서만 회수합니다.
--   * `service_role` 에 SELECT·INSERT·UPDATE·DELETE 를 보장합니다.
--   * **`postgres` 는 건드리지 않습니다.** DB 소유자이자 SQL Editor 가 쓰는
--     역할이라 회수하면 관리가 막힙니다.
--   * 데이터·인덱스·RLS 설정·RPC·정책을 바꾸지 않습니다.
--   * `drop`·`truncate` 없음. **표를 지우지 않습니다.**
--     `budgets` 는 코드 호출이 0건인 잔존 표로 보이지만(현재 코드가 쓰는 것은
--     `accountbook_budgets`), 확인 없이 지우지 않고 권한만 정리합니다.

begin;
set local lock_timeout = '5s';

do $migration$
declare
  v_table text;
  v_done integer := 0;
  v_skipped text := '';
begin
  foreach v_table in array array[
    'accountbook_meme_cards',
    'accountbook_recurring',
    'accountbook_settings',
    'budgets',
    'household_members',
    'households',
    'nlu_failure_samples',
    'nlu_intent_metrics_hourly',
    'transactions',
    'unrecognized_inputs',
    'users'
  ]
  loop
    if to_regclass('public.' || quote_ident(v_table)) is null then
      v_skipped := v_skipped || v_table || ' ';
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public', v_table);
    execute format('revoke all on table public.%I from anon', v_table);
    execute format('revoke all on table public.%I from authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);

    v_done := v_done + 1;
  end loop;

  raise notice 'V22.8.79: hardened % table(s)%', v_done,
    case when v_skipped = '' then '' else ' / skipped (missing): ' || v_skipped end;
end
$migration$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 사후점검 (비변경) — public 스키마 전체 현황
--   anon_or_authenticated_grants 와 truncate_exposed 가 모든 행에서
--   0 / false 여야 합니다.
--   service_role_grants 가 0 인 행이 있으면 Worker 가 그 표를 못 씁니다.
--   (Supabase 기본값을 갖고 있던 표는 회수 후 4 로, 원래 7개를 갖고 있던
--    표는 그대로 7 로 나올 수 있습니다. 둘 다 정상입니다.)
-- ---------------------------------------------------------------------------
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (
    select count(*)::integer from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  ) as policy_count,
  (
    select count(*)::integer
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = c.relname
      and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  ) as anon_or_authenticated_grants,
  (
    select count(*)::integer
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = c.relname
      and g.grantee = 'service_role'
  ) as service_role_grants,
  exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = c.relname
      and g.grantee in ('anon', 'authenticated', 'PUBLIC')
      and g.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  ) as truncate_exposed
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by truncate_exposed desc, anon_or_authenticated_grants desc, c.relname;

-- ---------------------------------------------------------------------------
-- 되돌리기
--   Supabase 기본값으로 돌리려면 표마다 아래를 실행합니다. 다만 되돌리면
--   TRUNCATE 노출도 함께 돌아옵니다.
--
--   grant all on table public.<표이름> to anon, authenticated;
-- ---------------------------------------------------------------------------
