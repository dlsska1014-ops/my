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

// V22.9.35: Cloudflare Workers 운영 런타임은 PBKDF2 반복 횟수가 100,000 을 넘으면 deriveBits 를
// NotSupportedError 로 거절한다(workerd 기본 상한, 이슈 #1346). Node 와 공개 workerd 에는 이 상한이 없어
// 검사가 통과했고, 210,000 회로는 운영 가입·ID 설정·관리자 비밀번호 변경이 모두 실패했다(2026-10-09 가입 500).
// 새 해시는 상한 그대로 만들고, 상한을 넘는 저장값은 엉뚱한 해시를 만들지 않도록 분명한 오류로 알린다.
const PASSWORD_KDF_MAX_ITERATIONS = 100000;
const PASSWORD_KDF_ITERATIONS = PASSWORD_KDF_MAX_ITERATIONS;

async function pbkdf2PasswordHash(password = "", salt = "", iterations = PASSWORD_KDF_ITERATIONS) {
  const rounds = Math.max(100000, Math.round(Number(iterations || PASSWORD_KDF_ITERATIONS)));
  if (!(rounds <= PASSWORD_KDF_MAX_ITERATIONS)) throw new Error("password_kdf_iterations_unsupported");
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
  const at = new Date().toISOString();
  // V22.9.76 (감사 G-8): 인증 필수(KAKAO_SKILL_AUTH_REQUIRED=1)로 정해 놓고 Secret 이 빠지면 /ready 만 503 이고
  // /skill 은 누구에게나 열려 있었다. 필수로 정한 배포는 막고, 필수가 아니면 기존처럼 열어 둔다.
  if (!expected) {
    if (String(env.KAKAO_SKILL_AUTH_REQUIRED || "0") !== "1") return true;
    AB_SKILL_AUTH_STATS.denied++;
    AB_SKILL_AUTH_STATS.last_denied_at = at;
    return false;
  }
  const matched = kakaoSkillSecretMatches(request, expected);
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
// 있게 한다 — client(기존 키), ip(UA 제외), 그 밖(subject-client·account·global)은 부르는 쪽이 준 키.
// V22.9.118 S-1: 비밀번호를 대조하는 길(관리자 로그인, 로그인 이름 로그인, 비밀번호 재확인)만 ip 범위를 groupIpv6 로 부르고 ‘IP|계정’ 키를
// authAttemptNetwork 로 만든다(IPv4 는 주소 그대로, IPv6 는 /64 하나). IPv6 는 한 가입자가 /64 를 통째로 받아 그 안에서 주소를 마음대로
// 바꿀 수 있어, 주소마다 세면 바꿀 때마다 새로 셌다. 그 밖의 ip 범위 제한(가입, 방 단추 입장, 웹 연결 코드 입장, 카카오 로그인 콜백)은
// 예전처럼 주소 그대로 센다(독립 검토 P3-1: 같은 /64 뒤의 여러 사람을 한 묶음으로 막지 않게).
// 주소 하나로 세던 로그인 이름·관리자 횟수가 IP 와 무관하지 않던 것은 recordAuthAccountWideAttempt 로 따로 센다.
function trafficClientIp(request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    return String(ip).split(",")[0].trim().slice(0, 64) || "unknown";
  } catch (err) {
    return "unknown";
  }
}

// V22.9.118 S-1: 비밀번호를 대조하는 길의 시도 제한용 주소 묶음(위 설명). IPv4·"unknown" 은 trafficClientIp 그대로다(예전 키와 같은 지문).
// IPv6 는 앞 64비트(/64)를 "2001:db8:77:1::/64" 꼴로 돌려준다. ::ffff:1.2.3.4 꼴(IPv4 를 담은 주소)은 그 IPv4 로 본다.
// 모양을 읽지 못한 값은 주소 그대로 둔다(서로 다른 사람을 한 묶음으로 합치지 않는다).
function authAttemptNetwork(request) {
  const ip = trafficClientIp(request);
  if (!ip.includes(":")) return ip;
  const text = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = text.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  const halves = text.split("::");
  if (halves.length > 2) return ip;
  const groups = (part) => {
    if (!part) return [];
    const out = [];
    for (const piece of part.split(":")) {
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(piece)) out.push("0", "0"); // 끝 32비트의 IPv4 는 /64 에 들어가지 않는다
      else if (/^[0-9a-f]{1,4}$/.test(piece)) out.push(piece);
      else return null;
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return ip;
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return ip;
  const full = [...head, ...Array(fill).fill("0"), ...tail];
  return `${full.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// V22.9.118 S-1: IP 와 무관한 계정 전체 횟수(관리자 비밀번호 하나, 로그인 이름 하나마다). 예전 ‘계정 단위’ 키는 IP 를 품어서(IP|admin,
// IP|로그인 이름) 주소를 바꾸면 새로 8~10번씩 허용됐다(점검 2026-11-12: 같은 /64 안에서 관리자 120번 연속 401, 잠금 없음).
// 이 횟수는 남이 일부러 채워 그 계정을 잠그는 데도 쓰일 수 있어(독립 검토 P2-2), 한도는 정상 사용자가 걸리지 않을 만큼 넉넉히 두고
// 운영자가 바로 끌 수 있게 한다. 변수 AUTH_ACCOUNT_GLOBAL_RATE_LIMIT:
//  · 없거나 비면 50, 0 보다 큰 숫자는 10~50(반올림, 1~9 는 10) 번 / AUTH_RATE_WINDOW_SECONDS(기본 900초) — 운영 함수
//    accountbook_auth_attempt 가 한도를 3~50 으로 자르므로 50 이 위 끝이다. 차면 429(기존 문구).
//  · 끔: off·false·no·none·disabled(대소문자·앞뒤 빈칸 무시), 또는 숫자로 읽어 0 이하인 값(0·00·0.0·-0·음수). 그대로 세고(한도 50)
//    운영 이벤트도 남기지만 막지는 않는다(이 횟수를 읽지 못해도 막지 않는다). 재검토(2026-11-12): 예전에는 "00"·"0.0"·"-0" 이 숫자 0 으로
//    읽혀 하한 10(가장 엄한 한도)이 됐다.
//  · 그 밖의 글자(숫자로 읽히지 않는 값)는 기본 50 으로 막고, 운영 이벤트 auth_account_limit_value_unknown(warn)을 isolate 당 한 번 남긴다
//    (값 원문 40자까지, 변수 값은 버전마다 고정이라 isolate 하나에는 값 하나다).
// 막힌 계정을 푸는 법: 변수를 off(또는 0)로 바꿔 배포하거나, 마지막으로 막힌 시도 뒤 창(기본 15분)이 지나기를 기다린다 — 운영 함수는 막힌 뒤
// 시도가 올 때마다 막힘을 창만큼 늘린다. 끈 동안 맞는 비밀번호로 로그인하면 그 횟수는 지워진다.
// IP 단위 제한(입장·IP·IP|계정) 다음에 세므로, 한 주소(/64)가 이 횟수를 채우는 속도는 그 제한에 묶인다.
// 근본 대책은 Cloudflare 요청 제한 규칙과 관리자 경로 접근 제한이다(코드 밖).
const AUTH_ACCOUNT_WIDE_OFF_WORDS = new Set(["off", "false", "no", "none", "disabled"]);

function authAccountWideLimitSetting(env, path = "") {
  const original = String(env?.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT ?? "");
  const raw = original.trim().toLowerCase();
  if (raw === "") return { enforce: true, limit: 50 };
  if (AUTH_ACCOUNT_WIDE_OFF_WORDS.has(raw)) return { enforce: false, limit: 50 };
  const number = Number(raw);
  if (Number.isFinite(number)) return number <= 0 ? { enforce: false, limit: 50 } : { enforce: true, limit: Math.round(boundedRuntimeNumber(number, 50, 10, 50)) };
  if (globalThis.__AB_AUTH_WIDE_SETTING_WARNED === undefined) {
    globalThis.__AB_AUTH_WIDE_SETTING_WARNED = original.slice(0, 40);
    rememberOpsEvent({ kind: "auth_account_limit_value_unknown", severity: "warn", path: String(path), method: "POST", label: "AUTH_ACCOUNT_GLOBAL_RATE_LIMIT", detail: `value ${JSON.stringify(original.slice(0, 40))} not understood, limit 50 (blocking)` });
  }
  return { enforce: true, limit: 50 };
}

// 운영 이벤트는 허용에서 막힘으로 바뀐 첫 응답에 한 번만 남긴다(독립 검토 P3-2: 운영 함수가 막힌 뒤 횟수를 어떻게 돌려주든). 처음 막힌 때를
// isolate 메모리에만 기억하고(키 = 경로|계정 키, 어디에도 쓰지 않는다), 허용·성공을 보면 지운다. 막힘이 창보다 오래 이어지면 창마다 한 번 남긴다.
// isolate 가 여럿이면 isolate 마다 한 번일 수 있다(운영 이벤트 칸도 isolate 메모리다).
const AB_AUTH_WIDE_BLOCKED = globalThis.__AB_AUTH_WIDE_BLOCKED || (globalThis.__AB_AUTH_WIDE_BLOCKED = new Map());
const AUTH_WIDE_BLOCKED_CAPACITY = 500;

function authAccountWideBlockStarted(slot, blocked, windowMs, now = Date.now()) {
  if (!blocked) {
    AB_AUTH_WIDE_BLOCKED.delete(slot);
    return false;
  }
  const since = Number(AB_AUTH_WIDE_BLOCKED.get(slot) || 0);
  if (since && now >= since && now - since < windowMs) return false;
  AB_AUTH_WIDE_BLOCKED.delete(slot);
  AB_AUTH_WIDE_BLOCKED.set(slot, now);
  while (AB_AUTH_WIDE_BLOCKED.size > AUTH_WIDE_BLOCKED_CAPACITY) AB_AUTH_WIDE_BLOCKED.delete(AB_AUTH_WIDE_BLOCKED.keys().next().value);
  return true;
}

async function recordAuthAccountWideAttempt(env, request, path = "", key = "", success = false, label = "") {
  const setting = authAccountWideLimitSetting(env, path);
  const windowSeconds = boundedRuntimeNumber(env?.AUTH_RATE_WINDOW_SECONDS, 900, 60, 86400);
  const result = await recordAuthAttempt(env, request, path, success, { scope: "global", key, limit: setting.limit });
  const slot = `${String(path)}|${String(key || "").trim().toLowerCase().slice(0, 160)}`;
  if (success) {
    AB_AUTH_WIDE_BLOCKED.delete(slot);
  } else if (!result.unavailable && authAccountWideBlockStarted(slot, !result.allowed, windowSeconds * 1000)) {
    rememberOpsEvent({ kind: "auth_account_limit_reached", severity: "warn", path: String(path), method: "POST", label: String(label || ""), detail: `limit ${setting.limit}, window ${windowSeconds}s${setting.enforce ? "" : ", off (not blocking)"}` });
  }
  if (!setting.enforce) return { ...result, allowed: true, unavailable: false };
  return result;
}

async function recordAuthAttempt(env, request, path = "login", success = false, options = {}) {
  const scope = String(options.scope || "ip");
  const rawKey = scope === "client" ? trafficClientKey(request)
    : scope === "ip" ? (options.groupIpv6 ? authAttemptNetwork(request) : trafficClientIp(request))
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
    // V22.9.76 감사 C-2: "/.//x" 는 앞의 검사를 통과하지만 정규화하면 "//x"(다른 사이트 주소)가 된다. 정규화한 결과로 다시 본다.
    if (parsed.pathname.startsWith("//")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (err) {
    return fallback;
  }
}
// V22.9.41: 관리자 전용 화면은 로그인 뒤 요청한 화면으로 돌아간다(/ops-monitor → 로그인 → /ops-monitor).
// 전에는 /admin-view 로만 보내 로그인 뒤 ?legacy=1 관리자 화면에 떨어졌다.
function adminLoginLocation(url) {
  const requested = url ? `${url.pathname}${url.search}` : "";
  const returnTo = safeAdminReturnPath(requested, "");
  return returnTo ? `/admin-view?return_to=${encodeURIComponent(returnTo)}` : "/admin-view";
}
// @build:exports-start
export {
  PASSWORD_KDF_ITERATIONS, adminLoginLocation, authAttemptNetwork, checkAdminPassword,
  getAdminSecurityState, hmacSha256, kakaoSkillAuthSnapshot, kakaoSkillCallerAuthorized,
  kakaoSkillSecretMatches, makeAdminSession, makeMyImportPreviewToken, newPasswordSalt,
  pbkdf2PasswordHash, randomEntityId, randomHex, recordAuthAccountWideAttempt, recordAuthAttempt,
  rememberSkillLatency, requiredSecret, safeAdminReturnPath, sha256Hex, skillLatencySnapshot,
  trafficClientIp, verifyAdminSession, verifyCronExecutionAuth, verifyMyImportPreviewToken,
};
// @build:exports-end
