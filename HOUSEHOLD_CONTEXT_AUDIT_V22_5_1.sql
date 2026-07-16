-- V22.5.1 가계부·사용자 컨텍스트 조회 전용 감사 SQL
-- 데이터를 변경하지 않습니다.

-- 1) 가계부별 참여자·역할·거래 건수
select
  h.id as household_id,
  h.name as household_name,
  h.invite_code,
  hm.user_id,
  coalesce(u.nickname, '') as user_nickname,
  case
    when coalesce(u.kakao_user_key, '') <> '' then 'kakao_or_linked_user'
    else 'web_or_backup_user'
  end as identity_hint,
  hm.role,
  count(t.id) as transaction_count,
  min(hm.created_at) as joined_at
from public.households h
join public.household_members hm on hm.household_id = h.id
left join public.users u on u.id = hm.user_id
left join public.transactions t
  on t.household_id = hm.household_id
 and t.user_id = hm.user_id
group by h.id, h.name, h.invite_code, hm.user_id, u.nickname, u.kakao_user_key, hm.role
order by h.name, hm.role, transaction_count desc;

-- 2) owner가 여러 명인 가계부
select
  h.id as household_id,
  h.name as household_name,
  count(*) filter (where hm.role = 'owner') as owner_count
from public.households h
join public.household_members hm on hm.household_id = h.id
group by h.id, h.name
having count(*) filter (where hm.role = 'owner') > 1
order by owner_count desc, h.name;

-- 3) 카카오 선택 가계부 포인터
select key, value, created_at
from public.accountbook_settings
where key like 'kakao_selected_household_v2251:%'
order by key;

-- 4) 단톡방 연결 원문(JSON)
select key, value, created_at
from public.accountbook_settings
where key = 'kakao_group_links';
