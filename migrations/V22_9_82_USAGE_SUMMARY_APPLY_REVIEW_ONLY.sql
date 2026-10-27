-- 실행 금지(DO NOT RUN) — 운영자 승인 전.
-- V22.9.82: 관제센터 '이용 현황'(수익화 판단용)에 쓰는 읽기 전용 집계 함수 1개. 표·행·권한(이 함수 밖)은 바꾸지 않는다.
-- 계약: review-artifacts/v82-usage-metrics-2026-10-27/CONTRACT.md. 앱 src/modules/runtime/ops-monitor.js 의 /internal/ops-usage 가
-- 이 함수를 GET /rest/v1/rpc 로 부르고, 관제 1.4.0 이 한 시간에 한 번 그 답(합계 숫자만)을 받아 간다.
-- 맨 위 RAISE EXCEPTION 줄이 있는 동안에는 실행해도 아무것도 바뀌지 않는다(트랜잭션이 바로 멈춘다).
--
-- 운영 순서:
--   1) Worker V22.9.82 를 배포한다. 이 SQL 이 없으면 /internal/ops-usage 는 rpc_missing 으로 답하고, 관제는 '집계 함수 적용 전'만 보인다.
--   2) SQL 편집기의 새 쿼리 탭에서 이 파일을 검토한다. 승인 뒤 RAISE EXCEPTION 한 줄만 지우고 실행한다.
--   3) 맨 아래 '적용 뒤 확인'(읽기만)으로 함수·권한·답 모양을 본다. 관제 화면에는 다음 정시 수집(최대 1시간) 뒤에 숫자가 나온다.
--   되돌리기: V22_9_82_USAGE_SUMMARY_ROLLBACK_REVIEW_ONLY.sql (함수만 지운다. 관제는 다시 '집계 함수 적용 전'을 보인다).
--
-- 셈 규칙(한국 시간 기준):
--   - 직접 기록 = 거래 source 가 kakao…(카카오) 또는 …web…(웹). 가져오기(…import…)·정기 자동(recurring…)·그 밖(other)은
--     기록 경로 수(records_by_source)에만 넣고, 이용자·기록 수·재사용률에는 넣지 않는다.
--   - 기록 이용자 = 기간 안에 직접 기록된 거래의 user_id(거래의 주인)를 중복 없이 센다. 기준 시각은 거래가 저장된 created_at 이다.
--   - 재사용 = 기간 안 기록 이용자 중 '기간 시작 달의 바로 전 달'에도 직접 기록이 있는 사람. 분모는 그 전 달 기록 이용자.
--   - 함께 쓰는 가계부 = 지금 구성원(역할 pending 제외)이 2명 이상인 가계부.
--   - 카카오 요청 = nlu_intent_metrics_hourly.request_count 합계(사람별이 아니다).
--   - 함수는 SECURITY INVOKER 이고 service_role 만 부를 수 있다. 답에는 사용자·가계부 id, 이름, 금액, 메모가 없다.
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v22982_review_only_usage_summary_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.accountbook_usage_summary_v22982(p_now timestamptz DEFAULT now(), p_heavy_threshold integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
SET timezone TO 'UTC'
AS $usage$
WITH b AS (
  SELECT x.now_tz, x.local_now, x.cur_start,
         x.cur_start - interval '1 month' AS prev_start,
         x.cur_start - interval '2 month' AS prev2_start,
         least(x.cur_start - interval '1 month' + (x.local_now - x.cur_start), x.cur_start) AS prev_same_end,
         greatest(1, least(coalesce(p_heavy_threshold, 30), 100000)) AS heavy
  FROM (
    SELECT coalesce(p_now, now()) AS now_tz,
           coalesce(p_now, now()) AT TIME ZONE 'Asia/Seoul' AS local_now,
           date_trunc('month', coalesce(p_now, now()) AT TIME ZONE 'Asia/Seoul') AS cur_start
  ) x
),
periods AS (
  SELECT 'current'::text AS name, b.cur_start AS p_from, b.local_now AS p_to, b.prev_start AS prior_from, b.cur_start AS prior_to FROM b
  UNION ALL SELECT 'previous_same', b.prev_start, b.prev_same_end, b.prev2_start, b.prev_start FROM b
  UNION ALL SELECT 'previous_full', b.prev_start, b.cur_start, b.prev2_start, b.prev_start FROM b
),
tx AS (
  SELECT t.user_id::text AS user_id, t.household_id::text AS household_id,
         t.created_at::timestamptz AT TIME ZONE 'Asia/Seoul' AS local_at,
         CASE
           WHEN coalesce(t.source::text, '') ILIKE 'kakao%' THEN 'kakao'
           WHEN coalesce(t.source::text, '') ILIKE '%import%' THEN 'import'
           WHEN coalesce(t.source::text, '') ILIKE 'recurring%' THEN 'auto'
           WHEN coalesce(t.source::text, '') ILIKE '%web%' THEN 'web'
           ELSE 'other'
         END AS kind
  FROM public.transactions t, b
  WHERE t.created_at::timestamptz >= (b.prev2_start AT TIME ZONE 'Asia/Seoul')
    AND t.created_at::timestamptz < b.now_tz
),
manual AS (SELECT * FROM tx WHERE kind IN ('kakao', 'web') AND user_id IS NOT NULL),
pu AS (
  SELECT p.name, m.user_id, count(*) AS n
  FROM periods p JOIN manual m ON m.local_at >= p.p_from AND m.local_at < p.p_to
  GROUP BY p.name, m.user_id
),
prior AS (
  SELECT DISTINCT p.name, m.user_id
  FROM periods p JOIN manual m ON m.local_at >= p.prior_from AND m.local_at < p.prior_to
),
ah AS (
  SELECT DISTINCT p.name, m.household_id
  FROM periods p JOIN manual m ON m.local_at >= p.p_from AND m.local_at < p.p_to
  WHERE m.household_id IS NOT NULL
),
member_counts AS (
  SELECT hm.household_id::text AS household_id, count(*) AS members
  FROM public.household_members hm
  WHERE coalesce(hm.role::text, '') <> 'pending'
  GROUP BY hm.household_id
),
src AS (
  SELECT p.name, t.kind, count(*) AS n
  FROM periods p JOIN tx t ON t.local_at >= p.p_from AND t.local_at < p.p_to
  GROUP BY p.name, t.kind
),
nlu AS (
  SELECT n.bucket_start::timestamptz AT TIME ZONE 'Asia/Seoul' AS local_at, n.intent, coalesce(n.request_count, 0)::bigint AS requests
  FROM public.nlu_intent_metrics_hourly n, b
  WHERE n.bucket_start::timestamptz >= (b.prev2_start AT TIME ZONE 'Asia/Seoul')
    AND n.bucket_start::timestamptz < b.now_tz
),
kq AS (
  SELECT p.name, n.intent, sum(n.requests) AS requests
  FROM periods p JOIN nlu n ON n.local_at >= p.p_from AND n.local_at < p.p_to
  GROUP BY p.name, n.intent
),
period_json AS (
  SELECT p.name, jsonb_build_object(
    'from', to_char(p.p_from, 'YYYY-MM-DD'),
    'to', to_char(greatest(p.p_from, p.p_to - interval '1 microsecond'), 'YYYY-MM-DD'),
    'recorders', (SELECT count(*) FROM pu WHERE pu.name = p.name),
    'records', (SELECT coalesce(sum(pu.n), 0) FROM pu WHERE pu.name = p.name),
    'records_by_source', jsonb_build_object(
      'kakao', (SELECT coalesce(sum(src.n), 0) FROM src WHERE src.name = p.name AND src.kind = 'kakao'),
      'web', (SELECT coalesce(sum(src.n), 0) FROM src WHERE src.name = p.name AND src.kind = 'web'),
      'import', (SELECT coalesce(sum(src.n), 0) FROM src WHERE src.name = p.name AND src.kind = 'import'),
      'auto', (SELECT coalesce(sum(src.n), 0) FROM src WHERE src.name = p.name AND src.kind = 'auto'),
      'other', (SELECT coalesce(sum(src.n), 0) FROM src WHERE src.name = p.name AND src.kind = 'other')
    ),
    'median_records_per_recorder', (SELECT coalesce(round((percentile_cont(0.5) WITHIN GROUP (ORDER BY pu.n))::numeric, 1), 0) FROM pu WHERE pu.name = p.name),
    'heavy_recorders', (SELECT count(*) FROM pu, b WHERE pu.name = p.name AND pu.n >= b.heavy),
    'retained_recorders', (SELECT count(*) FROM pu JOIN prior pr ON pr.name = pu.name AND pr.user_id = pu.user_id WHERE pu.name = p.name),
    'prior_month_recorders', (SELECT count(*) FROM prior WHERE prior.name = p.name),
    'active_households', (SELECT count(*) FROM ah WHERE ah.name = p.name),
    'shared_active_households', (SELECT count(*) FROM ah JOIN member_counts mc ON mc.household_id = ah.household_id AND mc.members >= 2 WHERE ah.name = p.name),
    'new_users', (SELECT count(*) FROM public.users u WHERE u.created_at::timestamptz >= (p.p_from AT TIME ZONE 'Asia/Seoul') AND u.created_at::timestamptz < (p.p_to AT TIME ZONE 'Asia/Seoul')),
    'new_households', (SELECT count(*) FROM public.households h WHERE h.created_at::timestamptz >= (p.p_from AT TIME ZONE 'Asia/Seoul') AND h.created_at::timestamptz < (p.p_to AT TIME ZONE 'Asia/Seoul')),
    'kakao_requests', (SELECT coalesce(sum(kq.requests), 0) FROM kq WHERE kq.name = p.name),
    'kakao_by_intent', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('intent', s.intent, 'requests', s.requests) ORDER BY s.requests DESC, s.intent), '[]'::jsonb)
      FROM (SELECT kq.intent, kq.requests FROM kq WHERE kq.name = p.name ORDER BY kq.requests DESC, kq.intent LIMIT 12) s
    )
  ) AS j
  FROM periods p
),
days AS (
  SELECT d::date AS day FROM b, generate_series(b.prev_start, b.local_now, interval '1 day') AS d
),
tx_day AS (
  SELECT m.local_at::date AS day, count(*) AS records, count(DISTINCT m.user_id) AS recorders
  FROM manual m, b WHERE m.local_at >= b.prev_start GROUP BY 1
),
nlu_day AS (
  SELECT n.local_at::date AS day, sum(n.requests) AS requests
  FROM nlu n, b WHERE n.local_at >= b.prev_start GROUP BY 1
),
user_day AS (
  SELECT (u.created_at::timestamptz AT TIME ZONE 'Asia/Seoul')::date AS day, count(*) AS n
  FROM public.users u, b
  WHERE u.created_at::timestamptz >= (b.prev_start AT TIME ZONE 'Asia/Seoul') AND u.created_at::timestamptz < b.now_tz
  GROUP BY 1
),
daily AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(days.day, 'YYYY-MM-DD'),
    'recorders', coalesce(tx_day.recorders, 0),
    'records', coalesce(tx_day.records, 0),
    'kakao_requests', coalesce(nlu_day.requests, 0),
    'new_users', coalesce(user_day.n, 0)
  ) ORDER BY days.day), '[]'::jsonb) AS j
  FROM days
  LEFT JOIN tx_day ON tx_day.day = days.day
  LEFT JOIN nlu_day ON nlu_day.day = days.day
  LEFT JOIN user_day ON user_day.day = days.day
)
SELECT jsonb_build_object(
  'schema', 1,
  'generated_at', to_char(b.now_tz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'month', to_char(b.cur_start, 'YYYY-MM'),
  'through_day', extract(day FROM b.local_now)::int,
  'heavy_threshold', b.heavy,
  'current', (SELECT j FROM period_json WHERE name = 'current'),
  'previous_same', (SELECT j FROM period_json WHERE name = 'previous_same'),
  'previous_full', (SELECT j FROM period_json WHERE name = 'previous_full'),
  'daily', (SELECT j FROM daily),
  'totals', jsonb_build_object(
    'users', (SELECT count(*) FROM public.users),
    'households', (SELECT count(*) FROM public.households),
    'shared_households', (SELECT count(*) FROM member_counts WHERE members >= 2)
  )
)
FROM b
$usage$;

REVOKE ALL ON FUNCTION public.accountbook_usage_summary_v22982(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accountbook_usage_summary_v22982(timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accountbook_usage_summary_v22982(timestamptz, integer) TO service_role;
COMMENT ON FUNCTION public.accountbook_usage_summary_v22982(timestamptz, integer) IS 'V22.9.82 관제 이용 현황: 읽기 전용 합계(개인 식별 정보 없음). service_role 전용.';
COMMIT;
NOTIFY pgrst, 'reload schema';

-- 적용 뒤 확인(읽기만, 바꾸는 것 없음):
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'accountbook_usage_summary_v22982';
-- 기대: security_definer = false, volatility = 's'(stable)
SELECT has_function_privilege('anon', 'public.accountbook_usage_summary_v22982(timestamptz, integer)', 'execute') AS anon_can_execute,
       has_function_privilege('authenticated', 'public.accountbook_usage_summary_v22982(timestamptz, integer)', 'execute') AS authenticated_can_execute,
       has_function_privilege('service_role', 'public.accountbook_usage_summary_v22982(timestamptz, integer)', 'execute') AS service_role_can_execute;
-- 기대: false, false, true
SELECT jsonb_object_keys(public.accountbook_usage_summary_v22982()) AS key ORDER BY 1;
-- 기대: current, daily, generated_at, heavy_threshold, month, previous_full, previous_same, schema, through_day, totals
