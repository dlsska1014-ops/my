-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.88 되돌리기: 실행 취소용 조건부 삭제 함수만 지운다. 표·행은 바뀌지 않는다(적용 SQL 도 바꾸지 않았다).
-- 지운 뒤 앱 V22.9.88 은 PGRST202 를 받고 예전처럼(읽어 견준 뒤 accountbook_delete_transaction_v227 로) 지운다.
-- 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22988_review_only_undo_delete_rollback_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb);
COMMIT;
NOTIFY pgrst, 'reload schema';

-- 지운 뒤 확인(읽기만): 0 행이어야 한다.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'accountbook_delete_transaction_if_v22988';
