-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.79 V44 D-5·V76 M-7: V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql 을 되돌리는 검토용 SQL.
-- 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다.
--
-- 운영 순서:
--   1) Worker 변수 REFUND_LINKS_ENABLED 를 먼저 끈다. 꺼지면 정산·카카오 답장은 예전 계산(환급을 빼지 않음)이고
--      이 표와 RPC 를 부르지 않는다.
--   2) 연결 행이 남아 있으면 이 SQL 은 멈춘다(refund_links_not_empty). 남은 연결을 읽기만 해서 보관한 뒤, 지우는 것이
--      정말 의도일 때만 같은 트랜잭션 안에서 사용자 설정 accountbook.refund_links_drop_confirmed 를 'yes' 로 두고 실행한다.
--   3) 정산 완료 이력(schema_version 3)에 적힌 refund_links·refund_total 은 그대로 남는다(과거 이력은 다시 계산하지 않는다).
--      설정 'refund_review_kept:<가계부>'(수입으로 두기 목록)도 남지만 플래그가 꺼져 있으면 읽지 않는다.
--   4) V22.9.80 T-11 의 가계부 삭제 정리 트리거(refund_review_kept_cleanup_v22980)도 함께 지운다. 그 뒤로는 가계부를 지워도
--      위 설정 줄이 남는다(V22.9.79 전과 같다).
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22979_review_only_refund_links_rollback_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF to_regclass('public.accountbook_refund_links') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.accountbook_refund_links)
     AND coalesce(current_setting('accountbook.refund_links_drop_confirmed', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'refund_links_not_empty';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS refund_review_kept_cleanup_v22980 ON public.households;
DROP FUNCTION IF EXISTS public.accountbook_refund_review_kept_cleanup_v22980();
DROP TRIGGER IF EXISTS refund_link_guard_v22979 ON public.transactions;
DROP FUNCTION IF EXISTS public.accountbook_refund_link_guard_v22979();
DROP FUNCTION IF EXISTS public.accountbook_link_refund_v22979(uuid, uuid, uuid, uuid, bigint, jsonb);
DROP FUNCTION IF EXISTS public.accountbook_unlink_refund_v22979(uuid, uuid, uuid, bigint);
DROP TABLE IF EXISTS public.accountbook_refund_links;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 되돌린 뒤 확인(읽기만, 필요할 때 주석을 풀어 따로 실행):
-- SELECT to_regclass('public.accountbook_refund_links') AS links_table;
-- SELECT count(*) AS left_functions FROM pg_proc WHERE proname IN ('accountbook_link_refund_v22979', 'accountbook_unlink_refund_v22979', 'accountbook_refund_link_guard_v22979');
-- SELECT count(*) AS left_triggers FROM pg_trigger WHERE tgname IN ('refund_link_guard_v22979', 'refund_review_kept_cleanup_v22980');
