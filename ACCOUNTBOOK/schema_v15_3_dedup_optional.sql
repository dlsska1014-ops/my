-- v15.3 optional duplicate-prevention indexes
-- 먼저 중복을 확인한 뒤 실행하세요.

-- 1) 카카오 중복 후보 확인
select
  household_id,
  source_user_key,
  transaction_date,
  type,
  amount,
  raw_text,
  count(*) as duplicate_count
from public.transactions
where source = 'kakao_skill'
  and source_user_key is not null
  and raw_text is not null
group by household_id, source_user_key, transaction_date, type, amount, raw_text
having count(*) > 1
order by duplicate_count desc;

-- 2) 중복 정리 후 인덱스 생성
create unique index if not exists transactions_kakao_request_unique_idx
on public.transactions (household_id, source_user_key, transaction_date, type, amount, raw_text)
where source = 'kakao_skill'
  and source_user_key is not null
  and raw_text is not null;

-- 3) 정기지출 자동기록용 예비 인덱스
-- v15.4 Cron 적용 시 source='recurring_auto' 기준으로 사용합니다.
create unique index if not exists transactions_recurring_cloud_unique_idx
on public.transactions (household_id, transaction_date, type, amount, memo, category)
where source = 'recurring_auto';
