-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.79 V44 D-5·V76 M-7: 환불(분류 '환급' 수입)을 원래 지출에 연결하는 표 1개·RPC 2개·트리거 1개. 검토용이다.
-- 변경안: docs/codex/PROPOSAL_REFUND_LINKS_V22_9_78.md (2026-10-25 운영자 답 4~8 반영). V78 초안의 객체 이름(_v22978)은
-- 정의를 바꿨으므로 모두 _v22979 로 바꿨다(받은 사람 역할 확인, 쓴 사람 필수, 가계부 행 잠금 순서, 오류 코드).
-- 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다(트랜잭션이 바로 멈춘다).
--
-- 운영 순서:
--   1) Worker V22.9.79 를 플래그 꺼짐(REFUND_LINKS_ENABLED 를 두지 않음)으로 배포한다. 이 SQL 이 없어도 화면·답장은 예전과 같다.
--   2) SQL 편집기의 새 쿼리 탭에서 이 파일을 검토한다. 승인 뒤 RAISE EXCEPTION 한 줄만 지우고 실행한다.
--   3) 맨 아래 '적용 뒤 확인'(읽기만)으로 표·함수·트리거·권한을 확인한다.
--   4) Worker 변수 REFUND_LINKS_ENABLED=1 을 켜고 /ready 의 refund_links.available 이 true 인지 본다.
--      플래그를 끄면 연결은 표에 남고, 정산·답장은 예전 계산(환급을 빼지 않음)으로 돌아간다.
--   되돌리기: V22_9_79_REFUND_LINKS_ROLLBACK_REVIEW_ONLY.sql (플래그를 먼저 끈다).
--
-- 규칙(Worker src/modules/domain/refund-links.js 와 같다):
--   - 같은 가계부의 원래 지출(type expense, 쓴 사람 있음)과 환급(type income, 분류 '환급', 받은 사람이 정산에 들어가는
--     구성원: owner/admin/member/viewer)을 연결한다. 연결과 풀기는 그 가계부의 소유자·관리자만 한다.
--   - 원래 지출 날짜 <= 환급 날짜, 환급 날짜 - 365일 이상. 금액은 1원 이상이고 환급·원래 지출 각각 연결 합계가 기록 금액 이하.
--   - 환급 날짜의 달에 정산 완료 이력(accountbook_settings 'settlement_history:<가계부>')이 있으면 연결하거나 풀 수 없다.
--   - 연결된 기록은 가계부·종류를 바꿀 수 없고, 금액을 연결 합계 아래로 줄일 수 없고, 환급의 분류를 바꿀 수 없고,
--     날짜 순서·365일 창을 깨는 날짜로 옮길 수 없다(트리거). 기록을 지우면 연결도 지워진다(ON DELETE CASCADE).
--   - 잠금 순서는 가계부 삭제(accountbook_purge_household_v22960)와 같다: 가계부 행 → 거래 행(id 순서) → 설정 행.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22979_review_only_refund_links_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 0) 전제 확인: 이미 적용했거나 열 형식이 다르면 아무것도 만들지 않고 멈춘다.
DO $preflight$
DECLARE
  v_type text;
BEGIN
  IF to_regclass('public.accountbook_refund_links') IS NOT NULL THEN
    RAISE EXCEPTION 'refund_links_already_applied';
  END IF;
  IF to_regclass('public.transactions') IS NULL OR to_regclass('public.households') IS NULL
     OR to_regclass('public.household_members') IS NULL OR to_regclass('public.accountbook_settings') IS NULL
     OR to_regclass('public.accountbook_transaction_audit') IS NULL THEN
    RAISE EXCEPTION 'refund_links_prerequisite_table_missing';
  END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.transactions'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'refund_links_transactions_id_not_uuid: %', v_type; END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.households'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'refund_links_households_id_not_uuid: %', v_type; END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.transactions'::regclass AND a.attname = 'transaction_date' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'date' THEN RAISE EXCEPTION 'refund_links_transaction_date_not_date: %', v_type; END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a
   WHERE a.attrelid = 'public.accountbook_settings'::regclass AND a.attname = 'value' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'refund_links_settings_value_not_text: %', v_type; END IF;
END
$preflight$;

-- 1) 연결 표. 쓰기는 아래 두 RPC 만 한다(service_role 은 읽기만).
CREATE TABLE public.accountbook_refund_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  refund_id uuid NOT NULL,
  amount bigint NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT accountbook_refund_links_household_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE,
  CONSTRAINT accountbook_refund_links_expense_fkey FOREIGN KEY (expense_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  CONSTRAINT accountbook_refund_links_refund_fkey FOREIGN KEY (refund_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  CONSTRAINT accountbook_refund_links_amount_check CHECK (amount > 0 AND amount <= 2000000000),
  CONSTRAINT accountbook_refund_links_distinct_check CHECK (expense_id <> refund_id),
  CONSTRAINT accountbook_refund_links_pair_key UNIQUE (expense_id, refund_id)
);
CREATE INDEX accountbook_refund_links_refund_idx ON public.accountbook_refund_links (refund_id);
CREATE INDEX accountbook_refund_links_household_idx ON public.accountbook_refund_links (household_id, created_at);
COMMENT ON TABLE public.accountbook_refund_links IS
  'V22.9.79 D-5/M-7: 환급 수입을 원래 지출에 연결한다. 쓰기는 accountbook_link_refund_v22979 / accountbook_unlink_refund_v22979 만.';
ALTER TABLE public.accountbook_refund_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.accountbook_refund_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.accountbook_refund_links TO service_role;

-- 2) 연결 걸기.
CREATE FUNCTION public.accountbook_link_refund_v22979(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_expense_id uuid,
  p_refund_id uuid,
  p_amount bigint,
  p_expected jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  v_expense public.transactions%ROWTYPE;
  v_refund public.transactions%ROWTYPE;
  v_refund_linked bigint;
  v_expense_linked bigint;
  v_month text;
  v_history_raw text;
  v_history jsonb;
  v_link_id uuid;
BEGIN
  IF p_household_id IS NULL OR p_actor_user_id IS NULL OR p_expense_id IS NULL OR p_refund_id IS NULL
     OR p_expense_id = p_refund_id OR p_expected IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_expected->'expense') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_expected->'refund') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'refund_link_input_invalid';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 2000000000 THEN
    RAISE EXCEPTION 'refund_link_amount_invalid';
  END IF;
  PERFORM 1 FROM public.households h WHERE h.id = p_household_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_link_record_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = p_household_id AND m.user_id = p_actor_user_id
       AND lower(coalesce(m.role, 'member')) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'refund_link_permission_denied';
  END IF;
  -- 두 거래 행을 id 순서로 잠근다(연결 풀기·기록 수정과 같은 순서라 서로 기다리기만 한다).
  PERFORM 1 FROM public.transactions t WHERE t.id = least(p_expense_id, p_refund_id) FOR UPDATE;
  PERFORM 1 FROM public.transactions t WHERE t.id = greatest(p_expense_id, p_refund_id) FOR UPDATE;
  SELECT * INTO v_expense FROM public.transactions t WHERE t.id = p_expense_id;
  SELECT * INTO v_refund FROM public.transactions t WHERE t.id = p_refund_id;
  IF v_expense.id IS NULL OR v_refund.id IS NULL
     OR v_expense.household_id IS DISTINCT FROM p_household_id
     OR v_refund.household_id IS DISTINCT FROM p_household_id THEN
    RAISE EXCEPTION 'refund_link_record_not_found';
  END IF;
  -- 화면에서 본 값과 지금 값이 다르면 저장하지 않는다.
  IF (p_expected->'expense'->>'amount')::numeric IS DISTINCT FROM v_expense.amount::numeric
     OR (p_expected->'expense'->>'type') IS DISTINCT FROM v_expense.type::text
     OR (p_expected->'expense'->>'category') IS DISTINCT FROM v_expense.category::text
     OR (p_expected->'expense'->>'user_id') IS DISTINCT FROM v_expense.user_id::text
     OR (p_expected->'expense'->>'transaction_date')::date IS DISTINCT FROM v_expense.transaction_date
     OR (p_expected->'refund'->>'amount')::numeric IS DISTINCT FROM v_refund.amount::numeric
     OR (p_expected->'refund'->>'type') IS DISTINCT FROM v_refund.type::text
     OR (p_expected->'refund'->>'category') IS DISTINCT FROM v_refund.category::text
     OR (p_expected->'refund'->>'user_id') IS DISTINCT FROM v_refund.user_id::text
     OR (p_expected->'refund'->>'transaction_date')::date IS DISTINCT FROM v_refund.transaction_date THEN
    RAISE EXCEPTION 'refund_link_source_changed';
  END IF;
  IF v_expense.type IS DISTINCT FROM 'expense' OR v_refund.type IS DISTINCT FROM 'income'
     OR v_refund.category IS DISTINCT FROM '환급' THEN
    RAISE EXCEPTION 'refund_link_kind_invalid';
  END IF;
  IF v_expense.user_id IS NULL THEN RAISE EXCEPTION 'refund_link_spender_required'; END IF;
  IF v_refund.user_id IS NULL THEN RAISE EXCEPTION 'refund_link_recipient_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = p_household_id AND m.user_id = v_refund.user_id
       AND lower(coalesce(m.role, 'member')) IN ('owner', 'admin', 'member', 'viewer')
  ) THEN
    RAISE EXCEPTION 'refund_link_recipient_invalid';
  END IF;
  IF v_expense.transaction_date > v_refund.transaction_date THEN RAISE EXCEPTION 'refund_link_date_order'; END IF;
  IF v_expense.transaction_date < v_refund.transaction_date - 365 THEN RAISE EXCEPTION 'refund_link_window'; END IF;
  IF EXISTS (SELECT 1 FROM public.accountbook_refund_links l WHERE l.expense_id = p_expense_id AND l.refund_id = p_refund_id) THEN
    RAISE EXCEPTION 'refund_link_duplicate';
  END IF;
  SELECT coalesce(sum(l.amount), 0) INTO v_refund_linked FROM public.accountbook_refund_links l WHERE l.refund_id = p_refund_id;
  SELECT coalesce(sum(l.amount), 0) INTO v_expense_linked FROM public.accountbook_refund_links l WHERE l.expense_id = p_expense_id;
  IF v_refund_linked + p_amount > v_refund.amount OR v_expense_linked + p_amount > v_expense.amount THEN
    RAISE EXCEPTION 'refund_link_amount_exceeded';
  END IF;
  -- 정산을 완료한 달(환급 날짜의 달)은 바꾸지 않는다. 완료 저장과 이 연결이 엇갈리지 않게 설정 행을 함께 잠근다.
  v_month := to_char(v_refund.transaction_date, 'YYYY-MM');
  SELECT s.value INTO v_history_raw FROM public.accountbook_settings s
   WHERE s.key = 'settlement_history:' || p_household_id::text FOR SHARE;
  IF coalesce(btrim(v_history_raw), '') <> '' THEN
    BEGIN
      v_history := v_history_raw::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'refund_link_history_invalid';
    END;
    IF jsonb_typeof(v_history) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'refund_link_history_invalid'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_history) AS h(item)
                WHERE jsonb_typeof(h.item) = 'object' AND h.item->>'month' = v_month) THEN
      RAISE EXCEPTION 'refund_link_month_completed';
    END IF;
  END IF;
  INSERT INTO public.accountbook_refund_links (household_id, expense_id, refund_id, amount, created_by)
  VALUES (p_household_id, p_expense_id, p_refund_id, p_amount, p_actor_user_id)
  RETURNING id INTO v_link_id;
  INSERT INTO public.accountbook_transaction_audit (transaction_id, household_id, actor_user_id, actor_kind, action, before_value, after_value)
  VALUES (p_refund_id, p_household_id, p_actor_user_id, 'refund_link_v22979', 'update',
          jsonb_build_object('refund_link', NULL),
          jsonb_build_object('refund_link', jsonb_build_object('id', v_link_id, 'expense_id', p_expense_id,
                                                               'refund_id', p_refund_id, 'amount', p_amount)));
  RETURN jsonb_build_object('ok', true, 'link_id', v_link_id, 'amount', p_amount,
                            'refund_linked', v_refund_linked + p_amount, 'expense_linked', v_expense_linked + p_amount);
END
$body$;

-- 3) 연결 풀기.
CREATE FUNCTION public.accountbook_unlink_refund_v22979(
  p_household_id uuid,
  p_actor_user_id uuid,
  p_link_id uuid,
  p_expected_amount bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  v_link public.accountbook_refund_links%ROWTYPE;
  v_refund public.transactions%ROWTYPE;
  v_month text;
  v_history_raw text;
  v_history jsonb;
BEGIN
  IF p_household_id IS NULL OR p_actor_user_id IS NULL OR p_link_id IS NULL
     OR p_expected_amount IS NULL OR p_expected_amount <= 0 THEN
    RAISE EXCEPTION 'refund_link_input_invalid';
  END IF;
  PERFORM 1 FROM public.households h WHERE h.id = p_household_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_link_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = p_household_id AND m.user_id = p_actor_user_id
       AND lower(coalesce(m.role, 'member')) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'refund_link_permission_denied';
  END IF;
  SELECT * INTO v_link FROM public.accountbook_refund_links l WHERE l.id = p_link_id AND l.household_id = p_household_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'refund_link_not_found'; END IF;
  -- 거래 행을 먼저(id 순서로) 잠그고 연결 행을 잠근다(연결 걸기·기록 수정과 같은 순서).
  PERFORM 1 FROM public.transactions t WHERE t.id = least(v_link.expense_id, v_link.refund_id) FOR UPDATE;
  PERFORM 1 FROM public.transactions t WHERE t.id = greatest(v_link.expense_id, v_link.refund_id) FOR UPDATE;
  SELECT * INTO v_link FROM public.accountbook_refund_links l
   WHERE l.id = p_link_id AND l.household_id = p_household_id FOR UPDATE;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'refund_link_not_found'; END IF;
  IF v_link.amount IS DISTINCT FROM p_expected_amount THEN RAISE EXCEPTION 'refund_link_source_changed'; END IF;
  SELECT * INTO v_refund FROM public.transactions t WHERE t.id = v_link.refund_id;
  IF v_refund.id IS NULL THEN RAISE EXCEPTION 'refund_link_not_found'; END IF;
  v_month := to_char(v_refund.transaction_date, 'YYYY-MM');
  SELECT s.value INTO v_history_raw FROM public.accountbook_settings s
   WHERE s.key = 'settlement_history:' || p_household_id::text FOR SHARE;
  IF coalesce(btrim(v_history_raw), '') <> '' THEN
    BEGIN
      v_history := v_history_raw::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'refund_link_history_invalid';
    END;
    IF jsonb_typeof(v_history) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'refund_link_history_invalid'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_history) AS h(item)
                WHERE jsonb_typeof(h.item) = 'object' AND h.item->>'month' = v_month) THEN
      RAISE EXCEPTION 'refund_link_month_completed';
    END IF;
  END IF;
  DELETE FROM public.accountbook_refund_links l WHERE l.id = p_link_id;
  INSERT INTO public.accountbook_transaction_audit (transaction_id, household_id, actor_user_id, actor_kind, action, before_value, after_value)
  VALUES (v_link.refund_id, p_household_id, p_actor_user_id, 'refund_unlink_v22979', 'update',
          jsonb_build_object('refund_link', jsonb_build_object('id', v_link.id, 'expense_id', v_link.expense_id,
                                                                'refund_id', v_link.refund_id, 'amount', v_link.amount)),
          jsonb_build_object('refund_link', NULL));
  RETURN jsonb_build_object('ok', true, 'link_id', v_link.id, 'amount', v_link.amount);
END
$body$;

-- 4) 연결된 기록을 바꾸는 수정은 막는다(기록 수정 RPC·일괄 수정·직접 REST 수정 모두).
CREATE FUNCTION public.accountbook_refund_link_guard_v22979()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  v_as_expense bigint;
  v_as_refund bigint;
BEGIN
  SELECT coalesce(sum(l.amount), 0) INTO v_as_expense FROM public.accountbook_refund_links l WHERE l.expense_id = OLD.id;
  SELECT coalesce(sum(l.amount), 0) INTO v_as_refund FROM public.accountbook_refund_links l WHERE l.refund_id = OLD.id;
  IF v_as_expense = 0 AND v_as_refund = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.household_id IS DISTINCT FROM OLD.household_id OR NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'refund_link_locked_kind';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount < greatest(v_as_expense, v_as_refund) THEN
    RAISE EXCEPTION 'refund_link_locked_amount';
  END IF;
  IF v_as_refund > 0 AND NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'refund_link_locked_category';
  END IF;
  IF NEW.transaction_date IS DISTINCT FROM OLD.transaction_date THEN
    IF v_as_expense > 0 AND EXISTS (
      SELECT 1 FROM public.accountbook_refund_links l JOIN public.transactions r ON r.id = l.refund_id
       WHERE l.expense_id = OLD.id
         AND (NEW.transaction_date > r.transaction_date OR NEW.transaction_date < r.transaction_date - 365)
    ) THEN
      RAISE EXCEPTION 'refund_link_locked_date';
    END IF;
    IF v_as_refund > 0 AND EXISTS (
      SELECT 1 FROM public.accountbook_refund_links l JOIN public.transactions e ON e.id = l.expense_id
       WHERE l.refund_id = OLD.id
         AND (e.transaction_date > NEW.transaction_date OR e.transaction_date < NEW.transaction_date - 365)
    ) THEN
      RAISE EXCEPTION 'refund_link_locked_date';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER refund_link_guard_v22979
BEFORE UPDATE OF household_id, type, amount, category, transaction_date ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.accountbook_refund_link_guard_v22979();

-- 5) V22.9.80 T-11: 가계부를 지우면 환불 ‘수입으로 두기’ 목록(accountbook_settings 'refund_review_kept:<가계부 id>')도 지운다.
--    가계부 삭제 함수(accountbook_purge_household_v227, docs/db-review/v22961/10_APPLY_LIFECYCLE_REVIEW_ONLY.sql, 2026-10-18 적용)의
--    키 목록은 고치지 않는다(적용 이력과 V22.9.61 확인 지문을 그대로 둔다). 대신 households 행이 지워질 때 같은 트랜잭션에서
--    이 한 줄을 지운다. 연결 표의 행은 외래키 ON DELETE CASCADE 로 이미 함께 지워진다. 잠금 순서는 삭제 함수와 같다
--    (가계부 행 → 설정 행). 이 절만 따로 적용할 때(1~4절을 V22.9.80 전에 이미 적용한 DB)는 BEGIN·가드·이 절·COMMIT 만 새 쿼리 탭에 둔다.
CREATE FUNCTION public.accountbook_refund_review_kept_cleanup_v22980()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
BEGIN
  DELETE FROM public.accountbook_settings WHERE key = 'refund_review_kept:' || OLD.id::text;
  RETURN OLD;
END
$body$;
CREATE TRIGGER refund_review_kept_cleanup_v22980
AFTER DELETE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.accountbook_refund_review_kept_cleanup_v22980();
REVOKE ALL ON FUNCTION public.accountbook_refund_review_kept_cleanup_v22980() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.accountbook_link_refund_v22979(uuid, uuid, uuid, uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accountbook_unlink_refund_v22979(uuid, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accountbook_refund_link_guard_v22979() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accountbook_link_refund_v22979(uuid, uuid, uuid, uuid, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.accountbook_unlink_refund_v22979(uuid, uuid, uuid, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 적용 뒤 확인(읽기만, 필요할 때 한 줄씩 주석을 풀어 따로 실행):
-- SELECT to_regclass('public.accountbook_refund_links') AS links_table;
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname IN ('accountbook_link_refund_v22979', 'accountbook_unlink_refund_v22979', 'accountbook_refund_link_guard_v22979');
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname IN ('refund_link_guard_v22979', 'refund_review_kept_cleanup_v22980');
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'accountbook_refund_links';
-- SELECT grantee, routine_name FROM information_schema.role_routine_grants WHERE routine_schema = 'public' AND routine_name LIKE 'accountbook_%refund_v22979';
-- SELECT count(*) AS links FROM public.accountbook_refund_links;
