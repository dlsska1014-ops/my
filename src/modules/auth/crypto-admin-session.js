// @build:imports-start
import {
  boundedRuntimeNumber, rememberOpsEvent, trafficClientKey,
} from "../runtime/ops-telemetry.js";
import {
  base64UrlDecodeBytes, base64UrlDecodeText, base64UrlEncode, base64UrlEncodeText,
  constantTimeTextEqual, getCookie,
} from "../runtime/http.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

const PASSWORD_KDF_ITERATIONS = 210000;

async function pbkdf2PasswordHash(password = "", salt = "", iterations = PASSWORD_KDF_ITERATIONS) {
  const rounds = Math.max(100000, Math.min(600000, Math.round(Number(iterations || PASSWORD_KDF_ITERATIONS))));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlDecodeBytes(salt), iterations: rounds },
    material,
    256,
  );
  return base64UrlEncode(bits);
}

function newPasswordSalt() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function hmacSha256(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function importPreviewTokenSecret(env = {}) {
  return requiredSecret(env, "MY_IMPORT_TOKEN_SECRET");
}

async function makeMyImportPreviewToken(env, payload = {}) {
  const data = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmacSha256(importPreviewTokenSecret(env), data);
  return `${data}.${signature}`;
}

async function verifyMyImportPreviewToken(env, token = "") {
  const value = String(token || "");
  if (!value || value.length > 2 * 1024 * 1024) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const data = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = await hmacSha256(importPreviewTokenSecret(env), data);
  if (!signature || !constantTimeTextEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecodeText(data));
    if (Number(payload?.v || 0) !== 1) return null;
    if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    if (!payload.user_id || !payload.household_id || !payload.jti || !Array.isArray(payload.ready)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function requiredSecret(env = {}, name = "") {
  const value = String(env?.[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function adminSessionSecret(env) {
  return requiredSecret(env, "ADMIN_SESSION_SECRET");
}

async function sha256Hex(data) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(data)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomEntityId(prefix = "item") {
  return `${String(prefix || "item").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "item"}_${Date.now().toString(36)}_${randomHex(8)}`;
}

// 비밀값을 넣는 순간부터 헤더 없는 호출은 전부 막힌다. OpenBuilder 헤더를
// 아직 안 넣었다면 그때부터 모든 대화가 실패하는데, 사용자에게는 평범한
// "다시 보내주세요"가 가고 운영자에게는 아무 신호도 없었다. 그래서
//   · 통과·거부 횟수를 세어 /health 로 내보내고
//   · 헤더를 맞추는 동안 잠시 막지 않는 observe 모드를 둔다.
const AB_SKILL_AUTH_STATS = { accepted: 0, denied: 0, last_denied_at: "", last_accepted_at: "" };

// V22.9.16: /skill 응답 시간을 아이솔레이트 안에서 센다. 카카오는 5초를 넘기면 "스킬 에러"로
// 끊는데, 지금까지는 응답 헤더에만 숫자가 실려 운영자가 볼 길이 없었다. 최근 300건의
// p50·p95·최대와 4초 초과 건수를 /health 에 싣고, 4초를 넘긴 발화는 운영 이벤트로 남긴다.
const AB_SKILL_LATENCY = globalThis.__AB_SKILL_LATENCY || (globalThis.__AB_SKILL_LATENCY = { samples: [], count: 0, slow: 0, max: 0, last_at: "" });
const AB_SKILL_SLOW_MS = 4000;

function rememberSkillLatency(latencyMs, detail = {}) {
  const ms = Math.max(0, Math.round(Number(latencyMs) || 0));
  AB_SKILL_LATENCY.samples.push(ms);
  if (AB_SKILL_LATENCY.samples.length > 300) AB_SKILL_LATENCY.samples.shift();
  AB_SKILL_LATENCY.count += 1;
  AB_SKILL_LATENCY.max = Math.max(AB_SKILL_LATENCY.max, ms);
  AB_SKILL_LATENCY.last_at = new Date().toISOString();
  if (ms > AB_SKILL_SLOW_MS) {
    AB_SKILL_LATENCY.slow += 1;
    rememberOpsEvent({ kind: "skill_slow", severity: "warn", path: "/skill", method: "POST", detail: `latency_ms=${ms}; intent=${String(detail.intent || "")}; result=${String(detail.result || "")}` });
  }
}

function skillLatencySnapshot() {
  const sorted = [...AB_SKILL_LATENCY.samples].sort((a, b) => a - b);
  const at = (ratio) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] : 0);
  return {
    window: sorted.length,
    count: AB_SKILL_LATENCY.count,
    p50_ms: at(0.5),
    p95_ms: at(0.95),
    max_ms: AB_SKILL_LATENCY.max,
    slow_over_ms: AB_SKILL_SLOW_MS,
    slow_count: AB_SKILL_LATENCY.slow,
    last_at: AB_SKILL_LATENCY.last_at,
  };
}
const KAKAO_SKILL_AUTH_OBSERVE = new Set(["observe", "monitor", "dry-run", "dryrun", "log"]);

function kakaoSkillAuthMode(env = {}) {
  const configured = !!String(env.KAKAO_SKILL_SECRET || "").trim();
  if (!configured) return "off";
  return KAKAO_SKILL_AUTH_OBSERVE.has(String(env.KAKAO_SKILL_AUTH_MODE || "").trim().toLowerCase()) ? "observe" : "enforce";
}

function kakaoSkillSecretMatches(request, expected = "") {
  const headerSecret = String(request?.headers?.get("x-kakao-skill-secret") || request?.headers?.get("x-api-key") || "").trim();
  const authorization = String(request?.headers?.get("authorization") || "").trim();
  return constantTimeTextEqual(headerSecret, expected) || constantTimeTextEqual(authorization, `Bearer ${expected}`);
}

function kakaoSkillCallerAuthorized(request, env = {}) {
  const expected = String(env.KAKAO_SKILL_SECRET || "").trim();
  if (!expected) return true;
  const matched = kakaoSkillSecretMatches(request, expected);
  const at = new Date().toISOString();
  if (matched) {
    AB_SKILL_AUTH_STATS.accepted++;
    AB_SKILL_AUTH_STATS.last_accepted_at = at;
    return true;
  }
  AB_SKILL_AUTH_STATS.denied++;
  AB_SKILL_AUTH_STATS.last_denied_at = at;
  // observe 모드에서는 세기만 하고 통과시킨다. 헤더를 맞추는 동안
  // 카카오톡이 멈추지 않게 하려는 것이고, 기본값은 계속 enforce 다.
  return kakaoSkillAuthMode(env) === "observe";
}

function kakaoSkillAuthSnapshot(env = {}) {
  const mode = kakaoSkillAuthMode(env);
  return {
    mode,
    configured: mode !== "off",
    accepted: AB_SKILL_AUTH_STATS.accepted,
    denied: AB_SKILL_AUTH_STATS.denied,
    last_accepted_at: AB_SKILL_AUTH_STATS.last_accepted_at,
    last_denied_at: AB_SKILL_AUTH_STATS.last_denied_at,
    // 켰는데 통과가 하나도 없고 거부만 쌓이면 헤더 설정이 빠진 것이다.
    header_missing_suspected: mode !== "off" && AB_SKILL_AUTH_STATS.denied > 0 && AB_SKILL_AUTH_STATS.accepted === 0,
  };
}

async function makeAdminSession(env) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const state = await getAdminSecurityState(env);
  const data = `${exp}|${Math.max(1, Number(state.session_version || 1))}`;
  const sig = await hmacSha256(adminSessionSecret(env), data);
  return `${data}.${sig}`;
}

async function verifyAdminSession(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (env.ADMIN_API_TOKEN && constantTimeTextEqual(auth, `Bearer ${env.ADMIN_API_TOKEN}`)) return true;
  const token = getCookie(request, "ab_admin");
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const data = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const parts = data.split("|");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  const version = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const state = await getAdminSecurityState(env);
  if (!Number.isFinite(version) || version !== Math.max(1, Number(state.session_version || 1))) return false;
  const sig = await hmacSha256(adminSessionSecret(env), data);
  return constantTimeTextEqual(sig, signature);
}

function verifyCronExecutionAuth(request, env) {
  const expectedCron = String(env.CRON_SECRET || "").trim();
  const expectedAdmin = String(env.ADMIN_API_TOKEN || "").trim();
  const auth = String(request?.headers?.get("authorization") || "").trim();
  const headerSecret = String(request?.headers?.get("x-cron-secret") || "").trim();
  if (expectedAdmin && constantTimeTextEqual(auth, `Bearer ${expectedAdmin}`)) return true;
  if (!expectedCron) return false;
  return constantTimeTextEqual(headerSecret, expectedCron) || constantTimeTextEqual(auth, `Bearer ${expectedCron}`);
}

async function checkAdminPassword(env, password) {
  const plain = String(password || "").trim();
  if (!plain) return false;
  const state = await getAdminSecurityState(env);
  if (state.password_hash && state.password_salt) {
    const actual = await pbkdf2PasswordHash(plain, state.password_salt, state.password_iterations);
    return constantTimeTextEqual(actual, state.password_hash);
  }
  // V22.9.34 감사 S8: 바꾼 관리자 비밀번호(설정의 해시)를 못 읽었다고 환경변수의 옛 비밀번호로
  // 넘어가면 이미 바꾼 비밀번호가 다시 통한다. 읽기 실패는 로그인 보호 기능 장애로 닫는다.
  let setting;
  try {
    setting = await getSettingValueStrict(env, "admin_password_hash");
  } catch (err) {
    throw new Error("admin_session_security_unavailable", { cause: err });
  }
  if (setting && String(setting).includes(":")) {
    const [salt, expectedHash] = String(setting).split(":", 2);
    const actual = await sha256Hex(`${salt}:${plain}`);
    return constantTimeTextEqual(actual, expectedHash);
  }
  return !!env.ADMIN_PASSWORD && constantTimeTextEqual(plain, String(env.ADMIN_PASSWORD));
}

async function getAdminSecurityState(env) {
  try {
    const rows = await supabase(env, "/rest/v1/accountbook_admin_security?singleton=eq.true&select=password_hash,password_salt,password_iterations,password_version,session_version&limit=1", { method: "GET" }) || [];
    return rows[0] || { password_version: 1, session_version: 1 };
  } catch (err) {
    throw new Error("admin_session_security_unavailable", {cause:err});
  }
}

// V22.9.26: 클라이언트 키(IP+UA)만 세던 제한은 User-Agent 만 바꾸면 비껴갔다. 범위를 고를 수
// 있게 한다 — client(기존 키), ip(UA 제외), account(로그인 이름), global(관리자 비밀번호 단일 계정).
function trafficClientIp(request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    return String(ip).split(",")[0].trim().slice(0, 64) || "unknown";
  } catch (err) {
    return "unknown";
  }
}

async function recordAuthAttempt(env, request, path = "login", success = false, options = {}) {
  const scope = String(options.scope || "ip");
  const rawKey = scope === "client" ? trafficClientKey(request)
    : scope === "ip" ? trafficClientIp(request)
    : String(options.key || "").trim().toLowerCase().slice(0, 160);
  if (!rawKey) return { allowed: true, attempts: 0, blocked_until: "" };
  const fingerprint = await sha256Hex(scope === "client" ? `auth|${String(path)}|${rawKey}` : `auth|${scope}|${String(path)}|${rawKey}`);
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Math.round(Number(options.limit))) : boundedRuntimeNumber(env.AUTH_RATE_LIMIT, 8, 3, 30);
  try {
    const result = await supabase(env, "/rest/v1/rpc/accountbook_auth_attempt", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_key: fingerprint,
        p_limit: limit,
        p_window_seconds: boundedRuntimeNumber(env.AUTH_RATE_WINDOW_SECONDS, 900, 60, 86400),
        p_success: !!success,
      }),
    });
    const item = Array.isArray(result) ? result[0] : result;
    return { allowed: item?.allowed !== false, attempts: Number(item?.attempts || 0), blocked_until: item?.blocked_until || "" };
  } catch (err) {
    rememberOpsEvent({ kind: "auth_rate_db_unavailable", severity: "error", path: String(path), method: "POST", detail: "database auth limiter unavailable" });
    return { allowed: false, unavailable: true };
  }
}

function safeAdminReturnPath(raw = "", fallback = "/?legacy=1") {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://accountbook.local");
    if (parsed.origin !== "https://accountbook.local" || ["/login", "/logout", "/my/logout"].includes(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (err) {
    return fallback;
  }
}
// @build:exports-start
export {
  PASSWORD_KDF_ITERATIONS, checkAdminPassword, getAdminSecurityState, hmacSha256,
  kakaoSkillAuthSnapshot, kakaoSkillCallerAuthorized, kakaoSkillSecretMatches, makeAdminSession,
  makeMyImportPreviewToken, newPasswordSalt, pbkdf2PasswordHash, randomEntityId, randomHex,
  recordAuthAttempt, rememberSkillLatency, requiredSecret, safeAdminReturnPath, sha256Hex,
  skillLatencySnapshot, trafficClientIp, verifyAdminSession, verifyCronExecutionAuth,
  verifyMyImportPreviewToken,
};
// @build:exports-end
