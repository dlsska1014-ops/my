-- 실행 금지(DO NOT RUN) — 운영자 승인 전. 사용자가 이 일을 직접 지목한 뒤에만 적용한다.
-- V22.9.119 O-1: 운영 DB 에만 있는 유니크 인덱스 transactions_kakao_request_unique_idx 를 지운다. 저장소의 스키마 SQL·픽스처에는 없는 인덱스다
-- (2026-11-10 운영 스키마 덤프에서 확인). 표·행·함수·권한·다른 인덱스는 바꾸지 않는다. 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도
-- 아무것도 바뀌지 않는다(트랜잭션이 바로 멈춘다).
--
-- 왜: 이 인덱스는 같은 가계부·같은 카카오 사용자 키·같은 날·같은 구분·같은 금액·같은 문장(raw_text)의 카카오 기록(source = 'kakao_skill')을
--   둘 이상 두지 못하게 한다. 앱은 120초 안의 같은 내용만 재전송으로 보고, 그 뒤 같은 문장은 새 기록(하루 두 번 탄 ‘버스 1500’ 같은 실제 구매)으로
--   넣는다. 인덱스가 있으면 그 둘째 기록이 23505 로 거절된다. V22.9.119 앱은 이 거절을 알아보고 ‘같은 문장으로 저장한 기록이 이미 있어요 …
--   문장을 조금 바꿔 보내 주세요’ 라고 사실대로 답하지만(대기 표식·잠금 없음), 인덱스가 있는 동안에는 아래가 계속 막힌다.
--     - 같은 날 같은 문장의 둘째 기록(문장을 바꿔야만 저장된다)
--     - 여러 건을 한 번에 보낸 글에서 한 건이라도 걸리면 그 글 전체(한 건도 저장되지 않는다), 한 글 안에 같은 문장이 두 번 있어도 전체
--     - 카카오 ‘수정 NN번 날짜·금액·구분’ 이 같은 날 같은 문장·같은 금액의 내 기록을 하나 더 만들게 되는 수정
--     - 같은 키·날·문장으로 다시 넣는 별도 구매 확인(‘별도 구매 추가 …’)·삭제 뒤 ‘복구’, 웹 수정(/my/update)으로 그런 겹침을 만드는 경우
--   앱에는 재전송 중복을 막는 장치가 따로 네 가지 있어 이 인덱스 없이도 같은 요청이 두 번 저장되지 않는다:
--     1) 메시지 잠금 kakao-message:writer:<가계부>:<사용자>(90초) — 같은 사람의 저장 요청을 한 줄로 세운다.
--     2) 대기 표식 kakao_edit_v2254:<가계부>:pending_write:<사용자> — 결과를 모르는 저장을 다시 보내면 처음과 같은 id 로만 다시 넣는다.
--     3) 고정 UUID INSERT(on_conflict=id + resolution=ignore-duplicates) — 같은 요청을 다시 넣어도 같은 id 라 두 번 들어가지 않는다.
--     4) 120초 중복 창(KAKAO_RETRY_DEDUP_SECONDS = 120) — 120초 안에 같은 내용이 오면 ‘중복 저장 안 함’ 으로 답하고 넣지 않는다.
--   같은 뿌리의 다른 운영 전용 인덱스 transactions_recurring_cloud_unique_idx(정기 자동 반영)는 이 파일이 건드리지 않는다.
--
-- 운영 순서:
--   1) Worker V22.9.119 를 먼저 배포한다. 앱은 인덱스가 있든 없든 맞게 동작한다(있으면 위 안내, 없으면 둘째 기록 저장).
--   2) 아래 ‘적용 전 확인’(읽기만)을 SQL 편집기의 새 쿼리 탭에서 돌려 인덱스 정의가 되돌리기 문과 같은지 본다.
--   3) 승인 뒤 RAISE EXCEPTION 한 줄만 지우고 이 파일을 실행한다. 정의가 다르면 사전 확인 블록이 멈춘다(아무것도 지우지 않는다).
--   4) 맨 아래 ‘적용 뒤 확인’(읽기만)으로 인덱스가 없어졌고 다른 유니크 인덱스는 그대로인지 본다. 그다음 카카오에서 같은 문장을 121초 뒤
--      다시 보내 둘째 기록이 저장되는지 사람이 확인한다.
--
-- 적용 전 확인(읽기만, 바꾸는 것 없음 — 이 블록은 주석이라 복사해 따로 돌린다):
--   SELECT c.relname, pg_get_indexdef(i.indexrelid) AS definition
--     FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--    WHERE i.indrelid = 'public.transactions'::regclass AND i.indisunique ORDER BY 1;
--   -- 기대: transactions_kakao_request_unique_idx 한 행의 정의가 아래 되돌리기 문과 같다(검색 경로에 따라 public. 이 빠져 보일 수 있다).
--   SELECT count(*) AS kakao_rows_under_index FROM public.transactions
--    WHERE source = 'kakao_skill' AND source_user_key IS NOT NULL AND raw_text IS NOT NULL;
--   -- 참고 값(행 수만, 내용은 보지 않는다).
--
-- 되돌리기(사용자 지목 뒤에만, 2026-11-10 운영 schema.sql 의 정의 그대로):
--   CREATE UNIQUE INDEX transactions_kakao_request_unique_idx ON public.transactions USING btree (household_id, source_user_key, transaction_date, type, amount, raw_text) WHERE ((source = 'kakao_skill'::text) AND (source_user_key IS NOT NULL) AND (raw_text IS NOT NULL));
--   지운 뒤 같은 날 같은 문장의 둘째 기록이 저장됐으면 이 문은 23505 로 실패한다(아무것도 바뀌지 않음). 먼저 겹치는 묶음 수만 센다(읽기만):
--   SELECT count(*) AS duplicate_groups FROM (
--     SELECT 1 FROM public.transactions WHERE source = 'kakao_skill' AND source_user_key IS NOT NULL AND raw_text IS NOT NULL
--      GROUP BY household_id, source_user_key, transaction_date, type, amount, raw_text HAVING count(*) > 1) d;
--   0 이 아니면 되돌리기 전에 그 기록들을 어떻게 할지 사용자가 정한다(이 파일은 기록을 지우지 않는다).
--   SQL_HISTORY.md 에 적용·되돌리기 시각을 남긴다.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v229119_review_only_drop_kakao_request_unique_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 사전 확인: 지울 인덱스가 운영 덤프의 정의(유니크·여섯 칸 순서·조건)와 같을 때만 지운다. 이미 없으면 알리고 넘어간다.
DO $preflight$
DECLARE
  v_unique boolean;
  v_columns text;
  v_predicate text;
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    RAISE EXCEPTION 'v229119_transactions_table_missing';
  END IF;
  SELECT i.indisunique,
         (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
            FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum),
         pg_get_expr(i.indpred, i.indrelid)
    INTO v_unique, v_columns, v_predicate
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'transactions_kakao_request_unique_idx' AND i.indrelid = 'public.transactions'::regclass;
  IF NOT FOUND THEN
    RAISE NOTICE 'v229119_kakao_request_unique_already_absent';
    RETURN;
  END IF;
  IF v_unique IS DISTINCT FROM true
     OR v_columns IS DISTINCT FROM 'household_id,source_user_key,transaction_date,type,amount,raw_text'
     OR regexp_replace(coalesce(v_predicate, ''), '\s+', ' ', 'g')
        IS DISTINCT FROM '((source = ''kakao_skill''::text) AND (source_user_key IS NOT NULL) AND (raw_text IS NOT NULL))' THEN
    RAISE EXCEPTION 'v229119_kakao_request_unique_definition_changed: unique=% columns=% predicate=%', v_unique, v_columns, v_predicate;
  END IF;
END $preflight$;

drop index if exists public.transactions_kakao_request_unique_idx;
COMMIT;

-- 적용 뒤 확인(읽기만, 바꾸는 것 없음):
SELECT count(*) AS kakao_request_unique_left
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'transactions_kakao_request_unique_idx';
-- 기대: 0
SELECT c.relname
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = 'public.transactions'::regclass AND i.indisunique
 ORDER BY 1;
-- 기대: 적용 전 목록에서 transactions_kakao_request_unique_idx 만 빠졌다(transactions_pkey·transactions_recurring_cloud_unique_idx 등은 그대로).
