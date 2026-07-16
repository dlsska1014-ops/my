-- V22.6.8 운영·데이터 무결성 사전 감사 (조회 전용)
-- 이 파일은 데이터를 변경하지 않습니다.
-- 각 결과가 0행인지 확인한 뒤 schema_v22_6_8_operations_integrity.sql을 적용하세요.

-- 1) 설정 키 중복: on_conflict=key와 정산/리포트 저장의 전제
select key, count(*) as duplicate_count
from public.accountbook_settings
group by key
having count(*) > 1
order by duplicate_count desc, key;

-- 2) 영수증 확정 저장 중복 후보
select
  household_id,
  transaction_date,
  amount,
  coalesce(
    nullif(regexp_replace(lower(btrim(coalesce(raw_text, ''))), '\s+', '', 'g'), ''),
    nullif(regexp_replace(lower(btrim(coalesce(memo, ''))), '\s+', '', 'g'), '')
  ) as receipt_fingerprint,
  count(*) as duplicate_count,
  array_agg(id order by created_at, id) as transaction_ids
from public.transactions
where source in ('receipt_confirmed', 'receipt')
  and type = 'expense'
  and (
    nullif(btrim(coalesce(raw_text, '')), '') is not null
    or nullif(btrim(coalesce(memo, '')), '') is not null
  )
group by household_id, transaction_date, amount,
  coalesce(
    nullif(regexp_replace(lower(btrim(coalesce(raw_text, ''))), '\s+', '', 'g'), ''),
    nullif(regexp_replace(lower(btrim(coalesce(memo, ''))), '\s+', '', 'g'), '')
  )
having count(*) > 1
order by duplicate_count desc, household_id, transaction_date;

-- 3) 정기거래 자동 적용 중복 후보
select household_id, raw_text, count(*) as duplicate_count,
       array_agg(id order by created_at, id) as transaction_ids
from public.transactions
where source = 'recurring_auto'
  and nullif(btrim(coalesce(raw_text, '')), '') is not null
group by household_id, raw_text
having count(*) > 1
order by duplicate_count desc, household_id, raw_text;

-- 4) 사용자 카카오 식별키 / 가계부 참여행 / 초대코드 중복
select kakao_user_key, count(*) as duplicate_count
from public.users
where nullif(btrim(coalesce(kakao_user_key, '')), '') is not null
group by kakao_user_key
having count(*) > 1;

select household_id, user_id, count(*) as duplicate_count
from public.household_members
group by household_id, user_id
having count(*) > 1;

select upper(btrim(invite_code)) as invite_code, count(*) as duplicate_count
from public.households
where nullif(btrim(coalesce(invite_code, '')), '') is not null
group by upper(btrim(invite_code))
having count(*) > 1;

-- 5) 소유자 없음 / 소유자 다수
select h.id as household_id, h.name,
       count(*) filter (where hm.role = 'owner') as owner_count
from public.households h
left join public.household_members hm on hm.household_id = h.id
group by h.id, h.name
having count(*) filter (where hm.role = 'owner') <> 1
order by owner_count, h.name;

-- 6) 고아 참여행과 고아 거래
select hm.*
from public.household_members hm
left join public.households h on h.id = hm.household_id
left join public.users u on u.id = hm.user_id
where h.id is null or u.id is null;

select t.id, t.household_id, t.user_id, t.transaction_date, t.amount, t.source
from public.transactions t
left join public.households h on h.id = t.household_id
left join public.users u on u.id = t.user_id
where h.id is null
   or (nullif(btrim(coalesce(t.user_id::text, '')), '') is not null and u.id is null)
order by t.created_at desc;

-- 7) 가계부 ID를 키에 포함하는 설정 중 범위 불일치 후보
select key, value
from public.accountbook_settings
where key like 'free_report_preference:%'
  and value is not null
  and value::text not like '%' || split_part(key, ':', 2) || '%';

