-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.88 Y-2(Codex 지적): 저장 알림 ‘실행 취소’(POST /my/undo)가 기록을 지울 때, 행을 잠근 채 내용을 다시 견주는 삭제 함수 1개.
-- 예전에는 앱이 기록을 읽어 견준 뒤 accountbook_delete_transaction_v227 을 따로 불러, 그 사이(요청 하나 정도)에 다른 사람이 고친 기록도 지웠다.
-- 이 함수는 accountbook_delete_transaction_v227 과 같은 감사 기록(action 'delete', before_value = 지운 행)을 남기고, 일곱 칸이 다르면 지우지 않는다.
-- 표·행·다른 함수·권한(이 함수 밖)은 바꾸지 않는다. 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다.
--
-- 운영 순서:
--   1) Worker V22.9.88 을 배포한다. 이 함수가 없으면 앱은 PGRST202 를 받고 예전처럼(읽어 견준 뒤 v227 로) 지운다 — 동작은 V22.9.87 과 같다.
--   2) SQL 편집기의 새 쿼리 탭에서 이 파일을 검토한다. 승인 뒤 RAISE EXCEPTION 한 줄만 지우고 실행한다.
--   3) 맨 아래 '적용 뒤 확인'(읽기만)으로 함수·권한을 본다. 그다음 실행 취소부터 이 함수를 쓴다(PostgREST 스키마 다시 읽기 뒤).
--   되돌리기: V22_9_88_UNDO_DELETE_IF_UNCHANGED_ROLLBACK_REVIEW_ONLY.sql (함수만 지운다. 앱은 다시 예전 방식으로 지운다).
--
-- 견주는 칸(앱의 실행 취소 표 지문 quickUndoFingerprint 과 같은 일곱 칸): 종류·금액·날짜·분류·메모·결제수단·지출자.
--   분류·메모·결제수단은 빈 값과 NULL 을 같게 본다(앱의 지문도 그렇다). 금액은 수로, 날짜는 날짜로, 지출자는 글자로 견준다.
-- 답: 지웠으면 {"deleted": true, "id": …}, 내용이 다르면 {"deleted": false, "changed": true, "id": …}(지우지 않음).
--   기록이 없으면 v227 처럼 'transaction_not_found' 예외다. 함수는 SECURITY INVOKER 이고 service_role 만 부를 수 있다.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22988_review_only_undo_delete_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 사전 확인: 표와 칸의 형식이 앱이 가정한 것과 같아야 한다.
DO $preflight$
DECLARE
  v_type text;
BEGIN
  IF to_regclass('public.transactions') IS NULL OR to_regclass('public.accountbook_transaction_audit') IS NULL THEN
    RAISE EXCEPTION 'v22988_prerequisite_table_missing';
  END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.transactions'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'v22988_transactions_id_not_uuid: %', v_type; END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.transactions'::regclass AND a.attname = 'household_id' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'v22988_transactions_household_id_not_uuid: %', v_type; END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.transactions'::regclass AND a.attname = 'transaction_date' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'date' THEN RAISE EXCEPTION 'v22988_transaction_date_not_date: %', v_type; END IF;
  IF to_regprocedure('public.accountbook_delete_transaction_v227(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'v22988_v227_delete_missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.accountbook_delete_transaction_if_v22988(
  p_transaction_id uuid,
  p_household_id uuid,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_expected jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $undo$
DECLARE
  v_before public.transactions%ROWTYPE;
BEGIN
  IF p_expected IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'expected_row_required';
  END IF;
  SELECT * INTO v_before FROM public.transactions
   WHERE id = p_transaction_id AND household_id = p_household_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction_not_found'; END IF;
  -- 앱이 읽은 값과 잠근 뒤의 값이 다르면(그 사이 누가 고쳤으면) 지우지 않는다.
  IF (p_expected->>'type') IS DISTINCT FROM v_before.type::text
     OR (p_expected->>'amount')::numeric IS DISTINCT FROM v_before.amount::numeric
     OR (p_expected->>'transaction_date')::date IS DISTINCT FROM v_before.transaction_date
     OR coalesce(p_expected->>'category', '') IS DISTINCT FROM coalesce(v_before.category::text, '')
     OR coalesce(p_expected->>'memo', '') IS DISTINCT FROM coalesce(v_before.memo::text, '')
     OR coalesce(p_expected->>'payment_method', '') IS DISTINCT FROM coalesce(v_before.payment_method::text, '')
     OR (p_expected->>'user_id') IS DISTINCT FROM v_before.user_id::text THEN
    RETURN jsonb_build_object('deleted', false, 'changed', true, 'id', p_transaction_id);
  END IF;

  INSERT INTO public.accountbook_transaction_audit(
    transaction_id, household_id, actor_user_id, actor_kind, action, before_value, after_value
  ) VALUES (
    p_transaction_id, p_household_id, p_actor_user_id,
    left(coalesce(p_actor_kind, 'user'), 30), 'delete', to_jsonb(v_before), NULL
  );
  DELETE FROM public.transactions WHERE id = p_transaction_id;
  RETURN jsonb_build_object('deleted', true, 'id', p_transaction_id);
END;
$undo$;

REVOKE ALL ON FUNCTION public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb) TO service_role;
COMMENT ON FUNCTION public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb) IS 'V22.9.88 실행 취소: 잠근 행의 일곱 칸이 같을 때만 감사 기록과 함께 지운다. service_role 전용.';
COMMIT;
NOTIFY pgrst, 'reload schema';

-- 적용 뒤 확인(읽기만, 바꾸는 것 없음):
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'accountbook_delete_transaction_if_v22988';
-- 기대: 한 행, security_definer = false, volatility = 'v'(volatile)
SELECT has_function_privilege('anon', 'public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb)', 'execute') AS anon_can_execute,
       has_function_privilege('authenticated', 'public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb)', 'execute') AS authenticated_can_execute,
       has_function_privilege('service_role', 'public.accountbook_delete_transaction_if_v22988(uuid, uuid, uuid, text, jsonb)', 'execute') AS service_role_can_execute;
-- 기대: false, false, true
-- 운영 기록을 지우는 함수라 확인 단계에서 직접 부르지 않는다. 실제 동작은 배포 뒤 사람이 웹에서 기록을 저장하고 실행 취소해 본다.
