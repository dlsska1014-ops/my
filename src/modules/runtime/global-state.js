/*
  Kakao Household Account Book - 운영 서버 MVP
  -----------------------------------------------------
  Routes
  - GET  /              : Admin web page
  - GET  /health        : Health check
  - POST /skill         : Kakao chatbot skill endpoint
  - GET  /api/bootstrap : Admin summary and households
  - GET  /api/transactions?month=YYYY-MM&type=expense|income&household_id=uuid
  - POST /api/transactions
  - PATCH /api/transactions/:id
  - DELETE /api/transactions/:id
  - GET  /api/stats?month=YYYY-MM&household_id=uuid
  - GET  /api/calendar?month=YYYY-MM&household_id=uuid

  Required Worker secrets/vars
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - ADMIN_PASSWORD (DB 관리자 비밀번호를 처음 설정하기 전의 bootstrap 전용)
  - ADMIN_SESSION_SECRET
  - USER_SESSION_SECRET
  - ADMIN_API_TOKEN
  - MY_IMPORT_TOKEN_SECRET
  Optional
  - APP_NAME
  - KAKAO_SKILL_SECRET (OpenBuilder header authentication)
  - KAKAO_SKILL_AUTH_REQUIRED=1 (fail readiness when the secret is absent)
*/

// Kakao Login uses Cloudflare environment variables only.
// Do not hard-code Kakao REST API keys in source code.
function kakaoRestApiKey(env) {
  return String((env && env.KAKAO_REST_API_KEY) || "").trim();
}

function kakaoClientSecret(env) {
  return String((env && env.KAKAO_CLIENT_SECRET) || "").trim();
}

const AB_SKILL_RATE_BUCKETS = globalThis.__AB_SKILL_RATE_BUCKETS || (globalThis.__AB_SKILL_RATE_BUCKETS = new Map());
const AB_SKILL_EVENTS = globalThis.__AB_SKILL_EVENTS || (globalThis.__AB_SKILL_EVENTS = []);

const AB_NLU_RUNTIME_EVENTS = globalThis.__AB_NLU_RUNTIME_EVENTS || (globalThis.__AB_NLU_RUNTIME_EVENTS = []);
const AB_NLU_RUNTIME_METRICS = globalThis.__AB_NLU_RUNTIME_METRICS || (globalThis.__AB_NLU_RUNTIME_METRICS = new Map());
const AB_EFFECTIVE_USER_CACHE = globalThis.__AB_EFFECTIVE_USER_CACHE || (globalThis.__AB_EFFECTIVE_USER_CACHE = new Map());
const AB_OPERATION_MUTEXES = globalThis.__AB_OPERATION_MUTEXES || (globalThis.__AB_OPERATION_MUTEXES = new Map());
const AB_REQUEST_RAW_USER_CACHE = new WeakMap();
const AB_REQUEST_USER_CACHE = new WeakMap();
