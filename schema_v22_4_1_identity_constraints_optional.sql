-- V22.4.1 계정 중복 방지 제약
-- 반드시 identity_audit_v22_4_1.sql 확인 및 계정 통합 후 실행하세요.

do $$
begin
  if exists (
    select 1 from public.users
    where nullif(trim(coalesce(kakao_user_key, '')), '') is not null
    group by kakao_user_key having count(*) > 1
  ) then
    raise exception 'users.kakao_user_key 중복이 남아 있습니다. /identity-audit에서 먼저 통합하세요.';
  end if;
  if exists (
    select 1 from public.household_members
    group by household_id, user_id having count(*) > 1
  ) then
    raise exception 'household_members 중복이 남아 있습니다. 먼저 중복 참여행을 정리하세요.';
  end if;
end $$;

create unique index if not exists users_kakao_user_key_unique_v2241
on public.users (kakao_user_key)
where nullif(trim(coalesce(kakao_user_key, '')), '') is not null;

create unique index if not exists household_members_household_user_unique_v2241
on public.household_members (household_id, user_id);
