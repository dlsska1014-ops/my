// @build:imports-start
import { getCookie } from "./http.js";
// @build:imports-end

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const REQUIRED_RUNTIME_CONFIG = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_SESSION_SECRET",
  "USER_SESSION_SECRET",
  "ADMIN_API_TOKEN",
  "MY_IMPORT_TOKEN_SECRET",
];

function missingRuntimeConfiguration(env = {}) {
  const missing = REQUIRED_RUNTIME_CONFIG.filter((name) => !String(env[name] || "").trim());
  if (String(env.KAKAO_SKILL_AUTH_REQUIRED || "0") === "1" && !String(env.KAKAO_SKILL_SECRET || "").trim()) {
    missing.push("KAKAO_SKILL_SECRET");
  }
  return missing;
}

const READINESS_REQUIRED_TABLES = [
  "households",
  "household_members",
  "transactions",
  "accountbook_settings",
  "accountbook_user_identities",
  "accountbook_user_security",
  "accountbook_admin_security",
  "accountbook_auth_attempts",
  "accountbook_transaction_audit",
  "accountbook_operation_locks",
];

// Custom categories already fall back to accountbook_settings when the
// compatibility table is absent. Probe it for visibility, but do not make an
// otherwise healthy deployment unavailable.
const READINESS_OPTIONAL_TABLES = [
  "accountbook_categories",
];

// These RPCs back authentication, authorization-sensitive writes, bulk imports,
// recurring jobs, and cross-instance operation locks. A Worker is not ready when
// one is absent, even if the HTTP process itself is alive.
const READINESS_CORE_RPCS = [
  "accountbook_claim_operation",
  "accountbook_release_operation",
  "accountbook_auth_attempt",
  "accountbook_create_local_user_v227",
  "accountbook_set_local_identity_v227",
  "accountbook_link_kakao_identity_v227",
  "accountbook_purge_household_v227",
  "accountbook_replace_budget_plan_v227",
  "accountbook_apply_recurring_v227",
  "accountbook_merge_users_v227",
  "accountbook_update_transaction_v227",
  "accountbook_delete_transaction_v227",
  "accountbook_bulk_transactions_v227",
  "accountbook_import_transactions_v227",
  "accountbook_leave_household_v227",
];

const READINESS_ALTERNATIVE_RPC_GROUPS = [
  ["accountbook_mutate_payment_assets_v2280", "accountbook_mutate_payment_assets_v2271"],
];

// PostgREST resolves overloaded RPCs by the JSON parameter names. Sending an
// empty object reports PGRST202 even when a parameterized function exists, so
// readiness uses the real signature with deliberately invalid values. UUID
// conversion or the function's first validation guard fails before any write.
const READINESS_RPC_PROBE_BODIES = {
  accountbook_claim_operation: { p_key: "", p_owner: "", p_lease_seconds: 15 },
  accountbook_release_operation: { p_key: null, p_owner: null },
  accountbook_auth_attempt: { p_key: "", p_limit: 3, p_window_seconds: 60, p_success: false },
  accountbook_create_local_user_v227: { p_login_name: "", p_nickname: "", p_credential_hash: "", p_credential_salt: "", p_credential_iterations: 1 },
  accountbook_set_local_identity_v227: { p_user_id: "readiness-invalid-uuid", p_login_name: "", p_credential_hash: "", p_credential_salt: "", p_credential_iterations: 1, p_revoke_sessions: false },
  accountbook_link_kakao_identity_v227: { p_user_id: "readiness-invalid-uuid", p_kakao_id: "", p_nickname: "" },
  accountbook_purge_household_v227: { p_household_id: "readiness-invalid-uuid" },
  accountbook_replace_budget_plan_v227: { p_household_id: "readiness-invalid-uuid", p_month: "", p_rows: [] },
  accountbook_apply_recurring_v227: { p_household_id: "readiness-invalid-uuid", p_month: "" },
  accountbook_merge_users_v227: { p_primary_user_id: "readiness-invalid-uuid", p_secondary_user_id: "readiness-invalid-uuid" },
  accountbook_update_transaction_v227: { p_transaction_id: "readiness-invalid-uuid", p_household_id: "readiness-invalid-uuid", p_actor_user_id: "readiness-invalid-uuid", p_actor_kind: "readiness", p_patch: {} },
  accountbook_delete_transaction_v227: { p_transaction_id: "readiness-invalid-uuid", p_household_id: "readiness-invalid-uuid", p_actor_user_id: "readiness-invalid-uuid", p_actor_kind: "readiness" },
  accountbook_bulk_transactions_v227: { p_transaction_ids: ["readiness-invalid-uuid"], p_household_id: "readiness-invalid-uuid", p_actor_user_id: "readiness-invalid-uuid", p_actor_kind: "readiness", p_patch: {}, p_delete: false },
  accountbook_import_transactions_v227: { p_household_id: "readiness-invalid-uuid", p_rows: [] },
  accountbook_leave_household_v227: { p_household_id: "readiness-invalid-uuid", p_user_id: "readiness-invalid-uuid" },
  accountbook_mutate_payment_assets_v2280: { p_household_id: "readiness-invalid-uuid", p_action: "readiness", p_asset: {}, p_asset_id: null, p_snapshot_month: "2000-01" },
  accountbook_mutate_payment_assets_v2271: { p_household_id: "readiness-invalid-uuid", p_action: "readiness", p_asset: {}, p_asset_id: null },
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://cdn.jsdelivr.net https://developers.kakao.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://kauth.kakao.com https://kapi.kakao.com; worker-src 'self' blob: https://cdn.jsdelivr.net",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-api-key,x-kakao-skill-secret",
};

// V22.9.17: 마지막에 쓰던 가계부를 기억한다.
//
// 가계부가 둘 이상이면 `household_id` 없는 진입(로그인 직후 /my, 북마크, 주소 직접 입력)이
// "가장 최근에 만든/참여한 가계부"로 열렸다. 여행용 가계부를 하나 만들면 그 뒤로 생활비
// 가계부 대신 여행 가계부가 먼저 떴다. 카카오는 선택 가계부를 설정으로 기억하지만 웹에는
// 그런 자리가 없었다.
//
// 방식: 사용자 화면이 `household_id` 를 달고 정상(200)으로 그려지면 그 값을 브라우저 쿠키
// `ab_hh` 에 남긴다. 값이 없는 진입은 쿠키 값을 `household_id` 로 채워 라우터에 넘긴다.
// 쿠키 값은 참여 여부를 다시 확인받는다(getMySelectedHousehold 가 거부하면 첫 가계부로
// 대체하지 않고 가계부 고르기 화면을 낸다 — 기준선 규칙 그대로). 그 화면이 나왔다는 것은
// 쿠키가 낡았다는 뜻이므로 지운다. DB 왕복은 늘지 않는다. 로그아웃하면 함께 지운다.
const AB_HOUSEHOLD_MEMORY_COOKIE = "ab_hh";
const AB_HOUSEHOLD_MEMORY_COOKIE_ATTRS = "Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax";
const AB_HOUSEHOLD_MEMORY_PATHS = new Set([
  "/my", "/app", "/m", "/menu", "/budgets", "/reports", "/my/analysis", "/my/settings", "/reserve-plans",
  "/payment-methods", "/goals", "/savings-goals", "/annual", "/annual-report",
  "/settlement-summary", "/split-summary", "/meeting-settlement", "/budget-alerts", "/today-budget",
  "/monthly-forecast", "/smart-tools", "/my/premium", "/keyword-guide", "/my/members", "/my/backup",
  "/my/groups", "/my/households",
]);

function isRememberableHouseholdId(value = "") {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ""));
}

function rememberedHouseholdRequest(request) {
  const none = { request, eligible: false, injected: false, remembered: "" };
  try {
    if (String(request?.method || "GET").toUpperCase() !== "GET") return none;
    const url = new URL(request.url);
    if (!AB_HOUSEHOLD_MEMORY_PATHS.has(url.pathname)) return none;
    const remembered = String(getCookie(request, AB_HOUSEHOLD_MEMORY_COOKIE) || "").trim();
    const requested = String(url.searchParams.get("household_id") || "").trim();
    if (requested || !isRememberableHouseholdId(remembered)) return { request, eligible: true, injected: false, remembered };
    url.searchParams.set("household_id", remembered);
    return { request: new Request(url.toString(), request), eligible: true, injected: true, remembered };
  } catch (_) {
    return none;
  }
}

function withSetCookie(response, cookie) {
  const out = new Response(response.body, response);
  out.headers.append("set-cookie", cookie);
  return out;
}

const AB_HOUSEHOLD_MEMORY_CLEAR_COOKIE = `${AB_HOUSEHOLD_MEMORY_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
// V22.9.37 감사 H4: 가계부 목록은 승인 대기·이용 제한 가계부를 골라도 200 으로 그린다(상태를 보여 주는 화면이다).
// 참여 요청 뒤 돌아오는 주소가 그 가계부 ID 를 달고 있어서 "승인 대기" 가계부가 기억됐고, 그 뒤 모든 화면이 403 이 됐다.
// 이 화면에서는 기억을 새로 쓰지 않는다. 읽을 수 있는 가계부를 실제로 그린 화면(홈 등)만 기억을 남긴다.
const AB_HOUSEHOLD_MEMORY_NO_SET_PATHS = new Set(["/my/households"]);

// 응답이 로그인 세션(ab_user)을 새로 발급하는지. 이미 가계부 기억 쿠키를 다루는 응답(카카오 연결 등)은 건드리지 않는다.
function issuesUserSession(response) {
  try {
    const cookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : String(response.headers.get("set-cookie") || "").split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    return cookies.some((cookie) => /^\s*ab_user=[^;]/.test(cookie)) && !cookies.some((cookie) => /^\s*ab_hh=/.test(cookie));
  } catch (_) {
    return false;
  }
}

async function withRememberedHouseholdCookie(routed, response) {
  try {
    const request = routed.request;
    const url = new URL(request.url);
    if (url.pathname === "/my/logout") {
      return withSetCookie(response, AB_HOUSEHOLD_MEMORY_CLEAR_COOKIE);
    }
    // H4: 다른 계정이 로그인해도 쿠키가 남아 그 사람의 가계부로 열렸다. 세션을 새로 주면 기억을 함께 지운다.
    if (issuesUserSession(response)) return withSetCookie(response, AB_HOUSEHOLD_MEMORY_CLEAR_COOKIE);
    if (!routed.eligible) return response;
    // H4: 기억한 가계부가 더 읽을 수 없게 됐으면(승인 대기·이용 제한) 접근 안내 화면(403)이 나온다. 그 자리에서 기억을
    // 지워 다음 화면은 기본 규칙으로 열리게 한다. 예전에는 승인 전까지 모든 화면이 403 이었다.
    if (routed.injected && response.status === 403) return withSetCookie(response, AB_HOUSEHOLD_MEMORY_CLEAR_COOKIE);
    if (response.status !== 200) return response;
    if (!String(response.headers.get("content-type") || "").includes("text/html")) return response;
    const requested = String(url.searchParams.get("household_id") || "").trim();
    if (!isRememberableHouseholdId(requested)) return response;
    if (routed.injected) {
      // 정상 화면은 링크마다 그 가계부 ID 를 단다. 하나도 없으면 가계부 고르기 화면이다 — 쿠키가 낡았다.
      const html = await response.clone().text();
      if (html.includes(`household_id=${requested}`)) return response;
      return withSetCookie(response, AB_HOUSEHOLD_MEMORY_CLEAR_COOKIE);
    }
    if (AB_HOUSEHOLD_MEMORY_NO_SET_PATHS.has(url.pathname)) return response;
    if (requested === routed.remembered) return response;
    return withSetCookie(response, `${AB_HOUSEHOLD_MEMORY_COOKIE}=${requested}; ${AB_HOUSEHOLD_MEMORY_COOKIE_ATTRS}`);
  } catch (_) {
    return response;
  }
}
// @build:exports-start
export {
  CORS_HEADERS, HTML_HEADERS, JSON_HEADERS, READINESS_ALTERNATIVE_RPC_GROUPS, READINESS_CORE_RPCS,
  READINESS_OPTIONAL_TABLES, READINESS_REQUIRED_TABLES, READINESS_RPC_PROBE_BODIES,
  missingRuntimeConfiguration, rememberedHouseholdRequest, withRememberedHouseholdCookie,
};
// @build:exports-end
