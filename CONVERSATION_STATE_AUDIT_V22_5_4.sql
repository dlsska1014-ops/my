-- V22.5.4 운영 데이터 읽기 전용 감사 SQL
-- 데이터 변경문이 없습니다. Supabase SQL Editor에서 항목별로 실행하세요.

-- 1. 한 가계부에 owner가 2명 이상인지 확인
select household_id, count(*) as owner_count, array_agg(user_id order by user_id) as owner_user_ids
from household_members
where role = 'owner'
group by household_id
having count(*) > 1;

-- 2. 동일 사용자·가계부 참여 행 중복 확인
select household_id, user_id, count(*) as row_count, array_agg(role order by role) as roles
from household_members
group by household_id, user_id
having count(*) > 1;

-- 3. 존재하지 않는 가계부를 참조하는 거래
select t.id, t.household_id, t.user_id, t.transaction_date, t.amount
from transactions t
left join households h on h.id = t.household_id
where h.id is null
order by t.created_at desc
limit 500;

-- 4. 카카오 저장 거래 중 원 생성자 키가 없는 과거 행
select id, household_id, user_id, transaction_date, amount, memo, created_at
from transactions
where source = 'kakao_skill'
  and coalesce(source_user_key, '') = ''
order by created_at desc
limit 500;

-- 5. V22.5.4 방별 단톡방 연결 설정
select key, value, created_at
from accountbook_settings
where key like 'kakao_group_link_v2254:%'
order by created_at desc;

-- 6. 호환용 구형 단일 map. V22.5.4에서는 권위 데이터가 아니라 미러입니다.
select key, value, created_at
from accountbook_settings
where key = 'kakao_group_links';

-- 7. 비어 있지 않은 단계형 대화 상태. 오래된 값이 장기간 남는지 확인
select key, value, created_at
from accountbook_settings
where key like 'kakao_flow_v215:%'
  and coalesce(value, '') not in ('', '{}')
order by created_at desc
limit 500;

-- 8. 거래 수정·삭제 선택 상태
select key, value, created_at
from accountbook_settings
where key like 'kakao_edit_v2254:%'
  and coalesce(value, '') <> ''
order by created_at desc
limit 500;

-- 9. 선택 가계부 포인터가 삭제된 가계부를 가리키는지 확인
select s.key, s.value as selected_household_id, s.created_at
from accountbook_settings s
left join households h on h.id::text = s.value
where s.key like 'kakao_selected_household_v2251:%'
  and coalesce(s.value, '') <> ''
  and h.id is null
order by s.created_at desc;
