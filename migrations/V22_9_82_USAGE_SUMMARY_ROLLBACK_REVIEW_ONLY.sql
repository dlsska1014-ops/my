-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.82 되돌리기: 관제 '이용 현황'용 읽기 전용 집계 함수만 지운다. 표·행은 바뀌지 않는다(적용 SQL 도 바꾸지 않았다).
-- 지운 뒤 앱 /internal/ops-usage 는 rpc_missing 으로 답하고, 관제 1.4.0 은 '집계 함수 적용 전'을 보이며 마지막으로 받은 숫자를 남겨 둔다.
-- 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22982_review_only_usage_summary_rollback_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.accountbook_usage_summary_v22982(timestamptz, integer);
COMMIT;
NOTIFY pgrst, 'reload schema';

-- 지운 뒤 확인(읽기만): 0 행이어야 한다.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'accountbook_usage_summary_v22982';
