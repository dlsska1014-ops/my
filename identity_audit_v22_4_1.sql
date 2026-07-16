-- V22.4.1 데이터 변경 없는 감사 SQL

-- 1. 같은 카카오 사용자키 중복
select kakao_user_key, count(*) as duplicate_count, array_agg(id order by created_at) as user_ids
from public.users
where nullif(trim(coalesce(kakao_user_key, '')), '') is not null
group by kakao_user_key
having count(*) > 1
order by duplicate_count desc;

-- 2. 동일 가계부·사용자 참여행 중복
select household_id, user_id, count(*) as duplicate_count, array_agg(role) as roles
from public.household_members
group by household_id, user_id
having count(*) > 1
order by duplicate_count desc;

-- 3. 소유자가 2명 이상인 가계부
select h.id as household_id, h.name, count(distinct hm.user_id) as owner_count,
       array_agg(distinct hm.user_id) as owner_user_ids
from public.households h
join public.household_members hm on hm.household_id = h.id and hm.role = 'owner'
group by h.id, h.name
having count(distinct hm.user_id) > 1
order by owner_count desc;

-- 4. 참여자·사용자키·거래 건수 확인
select h.name as household_name, hm.household_id, hm.user_id, u.nickname,
       u.kakao_user_key, hm.role, count(t.id) as transaction_count
from public.household_members hm
join public.households h on h.id = hm.household_id
left join public.users u on u.id = hm.user_id
left join public.transactions t on t.household_id = hm.household_id and t.user_id = hm.user_id
group by h.name, hm.household_id, hm.user_id, u.nickname, u.kakao_user_key, hm.role
order by h.name, transaction_count desc;
