-- =====================================================================
-- RPC_SIGNATURES_INFERRED.sql  (P0-1)
-- =====================================================================
-- 목적: src/index.js 가 호출하는 Supabase RPC 19개의 시그니처를
--       "호출 지점에서 역설계"한 참조 문서.
--
-- ⚠️ 경고 — 실행 금지(DO NOT RUN AS-IS)
--   * 함수 이름/인자 이름: 코드가 실제로 보내므로 신뢰 가능.
--   * 인자 타입 / 반환 타입 / 함수 본문 / RLS: 코드로는 복원 불가 → 추정(-- INFERRED).
--   * 운영 DB에 CREATE OR REPLACE 하면 실제 로직을 덮어써 데이터·보안을
--     손상시킬 수 있음. 정본은 pg_dump --schema-only 로 확보할 것.
--     (migrations/README.md 참조)
--
-- 이 파일은 "코드가 무엇을 기대하는가"를 리뷰/헬스체크 기준으로 삼기 위한 것.
-- =====================================================================

-- ── 핵심 인증/계정 (/ready 헬스체크 대상) ─────────────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_set_local_identity_v227(
  p_user_id             uuid,
  p_login_name          text,
  p_credential_hash     text,
  p_credential_salt     text,
  p_credential_iterations integer,
  p_revoke_sessions     boolean
) RETURNS jsonb AS $$ /* INFERRED: 실제 본문은 운영 DB 정본 참조 */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_create_local_user_v227(
  p_login_name          text,
  p_nickname            text,
  p_credential_hash     text,
  p_credential_salt     text,
  p_credential_iterations integer
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_link_kakao_identity_v227(
  p_user_id  uuid,
  p_kakao_id text,
  p_nickname text
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_merge_users_v227(
  p_primary_user_id   uuid,
  p_secondary_user_id uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- ── 거래 뮤테이션 ──────────────────────────────────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_update_transaction_v227(
  p_household_id   uuid,
  p_transaction_id uuid,
  p_patch          jsonb,
  p_actor_kind     text,
  p_actor_user_id  uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_delete_transaction_v227(
  p_household_id   uuid,
  p_transaction_id uuid,
  p_actor_kind     text,
  p_actor_user_id  uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_bulk_transactions_v227(
  p_household_id    uuid,
  p_transaction_ids uuid[],
  p_patch           jsonb,
  p_delete          boolean,
  p_actor_kind      text,
  p_actor_user_id   uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_import_transactions_v227(
  p_household_id uuid,
  p_rows         jsonb
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- ── 예산/반복/자산 ────────────────────────────────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_replace_budget_plan_v227(
  p_household_id uuid,
  p_month        text,
  p_rows         jsonb
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_apply_recurring_v227(
  p_household_id uuid,
  p_month        text
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED (신규 버전 — 스냅샷 월 인자 포함)
CREATE OR REPLACE FUNCTION public.accountbook_mutate_payment_assets_v2280(
  p_household_id  uuid,
  p_action        text,
  p_asset         jsonb,
  p_asset_id      uuid,
  p_snapshot_month text
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED (구 버전 — 폴백)
CREATE OR REPLACE FUNCTION public.accountbook_mutate_payment_assets_v2271(
  p_household_id uuid,
  p_action       text,
  p_asset        jsonb,
  p_asset_id     uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- ── 가계부 라이프사이클 ────────────────────────────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_leave_household_v227(
  p_household_id uuid,
  p_user_id      uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_purge_household_v227(
  p_household_id uuid
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- ── 운영 락/속도제한 (in-DB lease & rate-limit) ────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_claim_operation(
  p_key           text,
  p_owner         text,
  p_lease_seconds integer
) RETURNS boolean AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_release_operation(
  p_key   text,
  p_owner text
) RETURNS boolean AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.accountbook_auth_attempt(
  p_key            text,
  p_limit          integer,
  p_success        boolean,
  p_window_seconds integer
) RETURNS jsonb AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- ── NLU 관측(observability) ────────────────────────────────────────

-- INFERRED
CREATE OR REPLACE FUNCTION public.record_nlu_failure_sample(
  p_version         text,
  p_intent          text,
  p_result          text,
  p_reason          text,
  p_sample_hash     text,
  p_redacted_sample text
) RETURNS void AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- INFERRED
CREATE OR REPLACE FUNCTION public.record_nlu_metric(
  p_version      text,
  p_intent       text,
  p_result       text,
  p_latency_ms   integer,
  p_bucket_start timestamptz
) RETURNS void AS $$ /* INFERRED */ $$ LANGUAGE plpgsql;

-- =====================================================================
-- 끝. 정본은 pg_dump --schema-only 로 확보하세요. (migrations/README.md)
-- =====================================================================
