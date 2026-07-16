-- V22.6.1 읽기 전용 계정 통합 세션 복구 감사
-- 데이터 수정 없음

-- 1) 통합된 이전 계정 목록
select id, nickname, kakao_user_key, created_at
from users
where kakao_user_key like 'merged:%'
   or nickname like '%(통합됨)'
order by created_at desc;

-- 2) V22.6.1 이후 생성되는 직접 리다이렉트 포인터
select key, value, created_at
from accountbook_settings
where key like 'identity_merge_redirect:%'
order by created_at desc;

-- 3) 과거 계정 통합 감사 기록
select key, value, created_at
from accountbook_settings
where key like 'identity_merge_audit:%'
order by created_at desc;

-- 4) 특정 사용자 ID의 가계부 참여 현황 확인
-- 아래 UUID를 실제 주 계정 ID로 교체
-- select hm.user_id, hm.role, h.id as household_id, h.name
-- from household_members hm
-- join households h on h.id = hm.household_id
-- where hm.user_id = 'PRIMARY_USER_UUID'
-- order by hm.created_at desc;
