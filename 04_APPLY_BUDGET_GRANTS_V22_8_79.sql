-- V22.8.79-BUDGET-GRANTS-HARDENING
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.
-- `03_APPLY_BUDGET_STORAGE_V22_8_79.sql` 을 먼저 실행한 뒤에 적용하세요.
--
-- 왜 필요한가
--   2026-08-07 운영 확인 결과 `public.accountbook_budgets` 는
--     * RLS 켜짐 (`rls_enabled = true`)
--     * 정책 0건 (`pg_policies` 조회 결과 없음)
--     * `anon`·`authenticated` 에 7개 권한 전부
--       (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE)
--   상태였습니다. Supabase 가 `public` 스키마 표에 주는 기본값입니다.
--
--   읽기는 안전합니다. 정책이 하나도 없는 RLS 는 기본 거부라서 `anon` 으로
--   `select` 하면 0행이 나옵니다.
--
--   그러나 **RLS 는 TRUNCATE 를 덮지 않습니다.** 로컬 PostgreSQL 16.13 에서
--   같은 상태를 만들어 확인했습니다.
--     anon 으로 select   → 0행           (RLS 가 막음)
--     anon 으로 truncate → TRUNCATE TABLE (성공, 표가 비워짐)
--   `REFERENCES`·`TRIGGER` 도 마찬가지로 RLS 가 다루는 권한이 아닙니다.
--
--   지금 당장 뚫려 있다는 뜻은 아닙니다. PostgREST 는 REST 로 TRUNCATE 를
--   노출하지 않으므로 anon 키만으로 이 경로에 닿지는 않습니다. 다만 RLS 가
--   구조적으로 못 덮는 영역이므로, 권한 자체를 회수하는 편이 확실합니다.
--
--   V22.7.0 에서 만든 표들은 이미 같은 방식으로 회수해 두었습니다
--   (`schema_v22_7_0_auth_atomicity.sql:72-82`). `accountbook_budgets` 는 그
--   관례보다 먼저 만들어져 기본값이 남아 있었을 뿐입니다. 톤을 맞춥니다.
--
-- 앱에 영향이 없는 근거
--   Worker 는 `SUPABASE_SERVICE_ROLE_KEY` 만 씁니다.
--   `supabase()` (`src/index.js:28752`) 와 `supabaseExactCount()` (`7576`) 가
--   `apikey`·`authorization` 에 모두 service_role 키를 넣습니다. 코드 전체에
--   `SUPABASE_ANON_KEY` 사용처가 없습니다. 따라서 `anon`·`authenticated` 권한을
--   회수해도 앱 동작은 달라지지 않습니다.
--
-- 하는 일 / 하지 않는 일
--   * `public`·`anon`·`authenticated` 에서만 회수합니다.
--   * `service_role` 에는 필요한 4개 권한을 명시적으로 보장합니다.
--   * **`postgres` 는 건드리지 않습니다.** DB 소유자이자 SQL Editor 가 쓰는
--     역할이라 회수하면 관리가 막힙니다.
--   * 데이터·인덱스·RLS 설정·RPC 를 바꾸지 않습니다. `drop`·`truncate` 없음.
--   * 다른 표는 건드리지 않습니다. 맨 아래 조회가 현황만 보고합니다.

begin;
set local lock_timeout = '5s';

do $migration$
begin
  if to_regclass('public.accountbook_budgets') is null then
    raise exception 'V22.8.79: public.accountbook_budgets is missing — run 03_APPLY_BUDGET_STORAGE_V22_8_79.sql first';
  end if;

  -- RLS 는 이미 켜져 있어야 하지만, 회수와 함께 보장해 둡니다(멱등).
  execute 'alter table public.accountbook_budgets enable row level security';

  execute 'revoke all on table public.accountbook_budgets from public';
  execute 'revoke all on table public.accountbook_budgets from anon';
  execute 'revoke all on table public.accountbook_budgets from authenticated';
  execute 'grant select, insert, update, delete on table public.accountbook_budgets to service_role';

  raise notice 'V22.8.79: revoked public/anon/authenticated on public.accountbook_budgets';
end
$migration$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 사후점검 1 (비변경) — 이 표의 권한이 의도대로인지
--   anon_or_authenticated_grants 가 0 이어야 합니다.
--   service_role_grants 는 4 이상이어야 합니다. 이 파일은 SELECT·INSERT·UPDATE·
--   DELETE 4개를 보장할 뿐 기존 권한을 회수하지 않으므로, service_role 이 이미
--   Supabase 기본값 7개를 갖고 있었다면 7 로 나옵니다. 둘 다 정상입니다.
-- ---------------------------------------------------------------------------
select
  'V22.8.79-BUDGET-GRANTS-HARDENING' as version,
  (
    select c.relrowsecurity
    from pg_class c where c.oid = 'public.accountbook_budgets'::regclass
  ) as rls_enabled,
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'accountbook_budgets'
  ) as policy_count,
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'accountbook_budgets'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) as anon_or_authenticated_grants,
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'accountbook_budgets'
      and grantee = 'service_role'
  ) as service_role_grants;

-- ---------------------------------------------------------------------------
-- 사후점검 2 (비변경) — 나머지 표는 어떤 상태인가
--   이 파일은 accountbook_budgets 만 고칩니다. 아래는 보고만 합니다.
--   truncate_exposed = true 인 표는 RLS 를 켜 두었더라도 anon·authenticated 가
--   TRUNCATE 할 수 있는 상태입니다(RLS 가 덮지 않는 권한).
--   판단이 필요하면 같은 방식의 회수를 별도 SQL 로 진행하세요.
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
order by truncate_exposed desc, c.relname;
