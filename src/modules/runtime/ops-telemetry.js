// @build:imports-start
import {
  AB_NLU_RUNTIME_EVENTS, AB_NLU_RUNTIME_METRICS, AB_SKILL_EVENTS, AB_SKILL_RATE_BUCKETS,
} from "./global-state.js";
import { APP_MODE, APP_VERSION, publicBaseUrl } from "../public/site-config.js";
import { safeError } from "./leases.js";
import { getCookie, htmlResponse, jsonResponse } from "./http.js";
import { myReturnLocation } from "../my/access-control.js";
import { isUncertainStorageWrite, kakaoText } from "../kakao/response-builders.js";
import { KAKAO_RETRY_DEDUP_SECONDS } from "../kakao/transaction-save.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

function nluOpsConfig(env = {}) {
  return {
    aggregate_metrics_enabled: String(env.NLU_METRICS_ENABLED || "0") === "1",
    failure_samples_enabled: String(env.NLU_PERSIST_FAILURE_SAMPLES || "0") === "1",
    store_redacted_text: String(env.NLU_STORE_REDACTED_TEXT || "0") === "1",
    failure_sample_rate: boundedRuntimeNumber(env.NLU_FAILURE_SAMPLE_RATE, 1, 0, 1),
    retention_days: boundedRuntimeNumber(env.NLU_FAILURE_RETENTION_DAYS, 14, 1, 90),
    memory_event_limit: boundedRuntimeNumber(env.NLU_MEMORY_EVENT_LIMIT, 600, 100, 2000),
  };
}

function redactNluOpsSample(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b\d{2,4}[ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b[A-Z0-9]{6,16}\b/g, "[코드]")
    .replace(/\b\d{8,}\b/g, "[긴숫자]")
    .replace(/@?(?:말해가계부|똑똑한가계부)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function nluOpsFingerprint(text = "") {
  const input = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `nlu_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function redactOpsDetail(value = "") {
  return String(value || "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[사용자식별자]")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[토큰]")
    .replace(/(?:password|access[_-]?code|secret|apikey|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[보호됨]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/([?&](?:code|token|key|secret|password)=)[^&\s]+/gi, "$1[보호됨]")
    .replace(/\b\d{10,}\b/g, "[긴숫자]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function nluOutcomeFromKakaoResponse(responseText = "") {
  let text = "";
  let quickReplyCount = 0;
  try {
    const body = JSON.parse(String(responseText || "{}"));
    text = String(body?.template?.outputs?.[0]?.simpleText?.text || "");
    quickReplyCount = Array.isArray(body?.template?.quickReplies) ? body.template.quickReplies.length : 0;
  } catch (err) {
    text = String(responseText || "");
  }
  if (/(정확히 이해하지 못했|아래 예시처럼 보내|원하는 내용을 찾지 못했|다시 보내주세요)/.test(text)) {
    return { result: "fallback", reason: "generic_fallback", text, quick_reply_count: quickReplyCount };
  }
  // V22.9.37(관제): 저장소가 거절한 저장("저장하지 못했어요")과 결과를 모르는 저장("저장 확인이 지연")은 관제에 "ok"로
  // 집계되고 있었다. 실패·불확실로 나눠 센다.
  if (/(저장하지 못했어요|기록되지 않았어요)/.test(text)) {
    return { result: "error", reason: "save_failed", text, quick_reply_count: quickReplyCount };
  }
  if (/저장 확인이 지연/.test(text)) {
    return { result: "error", reason: "save_uncertain", text, quick_reply_count: quickReplyCount };
  }
  if (/(잠시 후 다시|처리 중 오류|서버.*오류|문제가 발생|처리하지 못했어요)/.test(text)) {
    return { result: "error", reason: "safe_error_response", text, quick_reply_count: quickReplyCount };
  }
  if (quickReplyCount > 0 && /(인가요|할까요|선택해|입력해 주세요|어떻게 처리|무엇을|어떤 )/.test(text)) {
    return { result: "clarify", reason: "guided_clarification", text, quick_reply_count: quickReplyCount };
  }
  return { result: "ok", reason: "handled", text, quick_reply_count: quickReplyCount };
}

function nluPercentile(values = [], p = 0.5) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.ceil(arr.length * p) - 1));
  return arr[idx];
}

function rememberNluRuntimeEvent(event = {}, env = {}) {
  try {
    const cfg = nluOpsConfig(env);
    const result = ["ok", "fallback", "clarify", "error"].includes(String(event.result || "")) ? String(event.result) : "error";
    const intent = String(event.intent || "UNKNOWN").slice(0, 80) || "UNKNOWN";
    const latencyMs = Math.max(0, Math.round(Number(event.latency_ms || 0)));
    const at = String(event.at || new Date().toISOString());
    const bucket = `${at.slice(0, 13)}:00:00.000Z`;
    const key = `${bucket}|${intent}|${result}`;
    const prev = AB_NLU_RUNTIME_METRICS.get(key) || { bucket_start: bucket, intent, result, request_count: 0, latency_sum_ms: 0, latency_max_ms: 0 };
    prev.request_count += 1;
    prev.latency_sum_ms += latencyMs;
    prev.latency_max_ms = Math.max(prev.latency_max_ms, latencyMs);
    AB_NLU_RUNTIME_METRICS.set(key, prev);
    while (AB_NLU_RUNTIME_METRICS.size > 1200) AB_NLU_RUNTIME_METRICS.delete(AB_NLU_RUNTIME_METRICS.keys().next().value);

    AB_NLU_RUNTIME_EVENTS.push({
      at,
      request_id: String(event.request_id || "").slice(0, 80),
      intent,
      confidence: Math.max(0, Math.min(1, Number(event.confidence || 0))),
      result,
      reason: String(event.reason || "").slice(0, 100),
      latency_ms: latencyMs,
      block: String(event.block || "").slice(0, 100),
      version: String(event.version || APP_VERSION).slice(0, 100),
      sample: result === "ok" ? "" : redactNluOpsSample(event.utterance || ""),
      sample_hash: nluOpsFingerprint(normalizeText(event.utterance || "")),
    });
    while (AB_NLU_RUNTIME_EVENTS.length > cfg.memory_event_limit) AB_NLU_RUNTIME_EVENTS.shift();
  } catch (err) {}
}

function getNluOpsSnapshot(env = {}) {
  const recent = AB_NLU_RUNTIME_EVENTS.slice().reverse();
  const latency = recent.map((e) => e.latency_ms).filter(Number.isFinite);
  const byResult = recent.reduce((acc, e) => { acc[e.result] = (acc[e.result] || 0) + 1; return acc; }, {});
  const byIntent = recent.reduce((acc, e) => { acc[e.intent] = (acc[e.intent] || 0) + 1; return acc; }, {});
  const total = recent.length;
  const successful = Number(byResult.ok || 0);
  const failureLike = Number(byResult.fallback || 0) + Number(byResult.clarify || 0) + Number(byResult.error || 0);
  return {
    generated_at: new Date().toISOString(),
    config: nluOpsConfig(env),
    total,
    successful,
    failure_like: failureLike,
    success_rate: total ? Math.round((successful / total) * 10000) / 100 : 0,
    fallback_rate: total ? Math.round((Number(byResult.fallback || 0) / total) * 10000) / 100 : 0,
    clarify_rate: total ? Math.round((Number(byResult.clarify || 0) / total) * 10000) / 100 : 0,
    error_rate: total ? Math.round((Number(byResult.error || 0) / total) * 10000) / 100 : 0,
    latency: { p50: nluPercentile(latency, 0.5), p95: nluPercentile(latency, 0.95), p99: nluPercentile(latency, 0.99), max: latency.length ? Math.max(...latency) : 0 },
    by_result: byResult,
    by_intent: byIntent,
    recent: recent.slice(0, 120),
    hourly: [...AB_NLU_RUNTIME_METRICS.values()].sort((a, b) => String(b.bucket_start).localeCompare(String(a.bucket_start))).slice(0, 240),
  };
}

async function persistNluMetricAggregate(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.aggregate_metrics_enabled || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const at = String(event.at || new Date().toISOString());
  return supabase(env, "/rest/v1/rpc/record_nlu_metric", {
    method: "POST",
    body: JSON.stringify({
      p_bucket_start: `${at.slice(0, 13)}:00:00.000Z`,
      p_intent: String(event.intent || "UNKNOWN").slice(0, 80),
      p_result: String(event.result || "error").slice(0, 20),
      p_latency_ms: Math.max(0, Math.round(Number(event.latency_ms || 0))),
      p_version: String(event.version || APP_VERSION).slice(0, 100),
    }),
  });
}

async function persistNluFailureSample(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.failure_samples_enabled || !["fallback", "clarify", "error"].includes(String(event.result || ""))) return { skipped: true };
  if (Math.random() > cfg.failure_sample_rate || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const normalized = normalizeText(event.utterance || "");
  const redacted = redactNluOpsSample(event.utterance || "");
  return supabase(env, "/rest/v1/rpc/record_nlu_failure_sample", {
    method: "POST",
    body: JSON.stringify({
      p_sample_hash: nluOpsFingerprint(normalized),
      p_redacted_sample: cfg.store_redacted_text ? redacted : null,
      p_intent: String(event.intent || "UNKNOWN").slice(0, 80),
      p_result: String(event.result || "error").slice(0, 20),
      p_reason: String(event.reason || "").slice(0, 120),
      p_version: String(event.version || APP_VERSION).slice(0, 100),
    }),
  });
}

function scheduleNluOpsPersistence(ctx, env = {}, event = {}) {
  const job = Promise.allSettled([
    persistNluMetricAggregate(env, event),
    persistNluFailureSample(env, event),
  ]).then((results) => {
    for (const r of results) if (r.status === "rejected") rememberOpsEvent({ kind: "nlu_persist_error", severity: "warn", path: "/skill", method: "POST", detail: safeError(r.reason) });
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
  else job.catch(() => {});
}

async function cleanupNluOpsRetention(env = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.failure_samples_enabled || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const cutoff = new Date(Date.now() - cfg.retention_days * 86400000).toISOString();
  await supabase(env, `/rest/v1/nlu_failure_samples?last_seen=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  return { ok: true, cutoff };
}

function rememberSkillEvent(event = {}) {
  try {
    const kind = String(event.kind || "info").slice(0, 40);
    const keepRedactedSample = ["bad_json", "error", "clarify"].includes(kind);
    AB_SKILL_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      user_key: event.user_key ? nluOpsFingerprint(String(event.user_key)) : "",
      utterance: keepRedactedSample ? redactNluOpsSample(event.utterance || "").slice(0, 120) : "",
      detail: redactOpsDetail(event.detail || "").slice(0, 240),
    });
    while (AB_SKILL_EVENTS.length > 120) AB_SKILL_EVENTS.shift();
  } catch (err) {}
}

function getSkillOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_SKILL_RATE_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_SKILL_RATE_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_SKILL_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function boundedRuntimeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(min, Math.min(max, safe));
}

function pruneRateBucketMap(map, now, windowMs, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, bucket] of map.entries()) {
    if (!bucket || now - Number(bucket.windowStart || 0) > windowMs * 2) map.delete(key);
  }
  while (map.size > maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneExpiringMap(map, now = Date.now(), maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, value] of map.entries()) {
    if (!value || Number(value.expires_at || 0) <= now) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneTimestampMap(map, now = Date.now(), maxAgeMs = 10 * 60 * 1000, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, timestamp] of map.entries()) {
    if (!timestamp || now - Number(timestamp) > maxAgeMs) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function checkSkillRateLimit(userKey = "", env = {}) {
  const key = String(userKey || "anonymous").slice(0, 120);
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000);
  const limit = boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000);
  pruneRateBucketMap(AB_SKILL_RATE_BUCKETS, now, windowMs);
  let bucket = AB_SKILL_RATE_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  AB_SKILL_RATE_BUCKETS.set(key, bucket);
  const resetInMs = Math.max(0, windowMs - (now - bucket.windowStart));
  return { ok: bucket.count <= limit, count: bucket.count, limit, resetInMs };
}

const AB_TRAFFIC_BUCKETS = globalThis.__AB_TRAFFIC_BUCKETS || (globalThis.__AB_TRAFFIC_BUCKETS = new Map());
const AB_TRAFFIC_EVENTS = globalThis.__AB_TRAFFIC_EVENTS || (globalThis.__AB_TRAFFIC_EVENTS = []);
const AB_OPS_EVENTS = globalThis.__AB_OPS_EVENTS || (globalThis.__AB_OPS_EVENTS = []);
const AB_DUPLICATE_EVENTS = globalThis.__AB_DUPLICATE_EVENTS || (globalThis.__AB_DUPLICATE_EVENTS = []);
const AB_KAKAO_REPEAT_GUARD = globalThis.__AB_KAKAO_REPEAT_GUARD || (globalThis.__AB_KAKAO_REPEAT_GUARD = new Map());
const AB_KAKAO_INFLIGHT = globalThis.__AB_KAKAO_INFLIGHT || (globalThis.__AB_KAKAO_INFLIGHT = new Map());

function rememberOpsEvent(event = {}) {
  try {
    AB_OPS_EVENTS.push({
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      severity: String(event.severity || "info").slice(0, 20),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      label: String(event.label || "").slice(0, 80),
      detail: redactOpsDetail(event.detail || ""),
    });
    while (AB_OPS_EVENTS.length > 220) AB_OPS_EVENTS.shift();
  } catch (err) {}
}

function getOpsEventsSnapshot() {
  const recent = AB_OPS_EVENTS.slice(-120).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  const bySeverity = recent.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});
  const lastError = recent.find((e) => e.severity === "error" || e.kind === "server_error" || e.kind === "route_error") || null;
  return { recent, byKind, bySeverity, lastError };
}

function rememberDuplicateEvent(event = {}) {
  try {
    const kind = String(event.kind || "duplicate_guard").slice(0, 40);
    const detail = kind === "kakao_repeat"
      ? `utterance_hash=${nluOpsFingerprint(normalizeText(event.detail || ""))}`
      : redactNluOpsSample(String(event.detail || "")).slice(0, 220);
    AB_DUPLICATE_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      source: String(event.source || "").slice(0, 40),
      household_id: event.household_id ? nluOpsFingerprint(String(event.household_id)) : "",
      user_id: event.user_id ? nluOpsFingerprint(String(event.user_id)) : "",
      amount: Number(event.amount || 0) || 0,
      transaction_date: String(event.transaction_date || "").slice(0, 20),
      detail,
    });
    while (AB_DUPLICATE_EVENTS.length > 180) AB_DUPLICATE_EVENTS.shift();
    if (["duplicate_skipped", "bulk_limited", "kakao_repeat"].includes(kind)) {
      rememberOpsEvent({ kind, severity: "warn", path: event.path || "", method: event.method || "", detail: detail || `${event.source || ""} ${event.transaction_date || ""} ${event.amount || ""}` });
    }
  } catch (err) {}
}

function getDuplicateOpsSnapshot() {
  const recent = AB_DUPLICATE_EVENTS.slice(-90).reverse();
  const byKind = recent.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});
  const bySource = recent.reduce((acc, e) => { acc[e.source || "unknown"] = (acc[e.source || "unknown"] || 0) + 1; return acc; }, {});
  return { recent, byKind, bySource };
}

function duplicateGuardSeconds(env = {}, source = "") {
  const src = String(source || "");
  if (src === "kakao_skill") return boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600);
  if (src === "my_import") return 0;
  return boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600);
}

function isDuplicateGuardSource(source = "") {
  const s = String(source || "");
  return ["my_web", "web_user", "ledger_live", "api", "kakao_skill", "web_admin"].includes(s);
}

function isDatabaseBusyError(err) {
  const m = String(err?.message || err || "").toLowerCase();
  return /supabase|fetch|network|timeout|timed|gateway|503|502|504|failed|database|connection/.test(m);
}

function userSafeErrorCode(err) {
  if (isUncertainStorageWrite(err)) return "db_write_unknown";
  if (isDatabaseBusyError(err)) return "db_delay";
  const raw = safeError(err);
  if (/spender_not_member|transaction_spender_not_member/i.test(raw)) return "spender_not_member";
  if (/amount_required|invalid_amount/i.test(raw)) return "amount_required";
  if (/record_not_found|transaction_not_found/i.test(raw)) return "record_not_found";
  return "save_failed";
}

function duplicateSkippedReturnLocation(month, householdId, extra = {}) {
  return myReturnLocation(month, householdId, { msg: "duplicate_skipped", ...extra });
}

function getOperationIntegritySnapshot() {
  return {
    profile: "atomic-dedup-and-cron-lease",
    migration: "schema_v22_6_8_operations_integrity.sql",
    database_lock_rpc_required: true,
    active_memory_fallback_leases: 0,
  };
}

function buildOpsSnapshot(env = {}) {
  const traffic = getTrafficOpsSnapshot();
  const skill = getSkillOpsSnapshot();
  const events = getOpsEventsSnapshot();
  const duplicates = getDuplicateOpsSnapshot();
  return {
    app_version: APP_VERSION,
    app_mode: APP_MODE,
    generated_at: new Date().toISOString(),
    traffic,
    skill,
    events,
    duplicates,
    operation_integrity: getOperationIntegritySnapshot(),
    nlu: getNluOpsSnapshot(env),
    limits: {
      traffic_guard_limit: boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000),
      traffic_guard_window_ms: boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000),
      skill_rate_limit: boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000),
      skill_rate_window_ms: boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000),
      duplicate_guard_seconds: boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600),
      kakao_retry_dedup_seconds: boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600),
      kakao_repeat_guard_seconds: boundedRuntimeNumber(env.KAKAO_REPEAT_GUARD_SECONDS, 8, 2, 600),
      my_import_limit: boundedRuntimeNumber(env.MY_IMPORT_LIMIT, 120, 10, 1000),
      kakao_bulk_limit: boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80),
    },
  };
}

function rememberTrafficEvent(event = {}) {
  try {
    AB_TRAFFIC_EVENTS.push({
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      key: event.key ? nluOpsFingerprint(String(event.key || "")) : "",
      detail: redactOpsDetail(event.detail || "").slice(0, 220),
    });
    while (AB_TRAFFIC_EVENTS.length > 160) AB_TRAFFIC_EVENTS.shift();
    if (String(event.kind || "") === "limited") rememberOpsEvent({ kind: "rate_limited", severity: "warn", path: event.path, method: event.method, detail: event.detail });
  } catch (err) {}
}

function trafficClientKey(request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    const ua = request.headers.get("user-agent") || "";
    return `${String(ip).split(",")[0].trim()}|${String(ua).slice(0, 32)}`.slice(0, 120);
  } catch (err) {
    return "unknown";
  }
}

// KAKAO_SKILL_SECRET을 설정하기 전에는 /skill 요청 본문의 botUserKey를 신원으로
// 사용하므로 값을 바꿔가며 사용자별 제한을 우회할 수 있다. 그룹 챗봇의 정상 유입을
// 막지 않도록 높은 IP 상한을 함께 두고, 운영에서는 OpenBuilder 헤더 인증을 켠다.
function skillIpGuardLimit(env = {}) {
  return boundedRuntimeNumber(env.SKILL_IP_GUARD_LIMIT, 3000, 60, 100000);
}

function isTrafficGuardedPath(path = "", method = "GET") {
  const m = String(method || "GET").toUpperCase();
  const p = String(path || "");
  if (p === "/skill") return m === "POST";
  if (!["POST", "PATCH", "DELETE"].includes(m)) return false;
  return p === "/login" || p === "/my/local-login" || p === "/my/local-signup"
    || p.startsWith("/my/") || p.startsWith("/api/") || p.startsWith("/admin/") || p.startsWith("/backup/") || p.startsWith("/cron/");
}

function checkTrafficGuard(request, env, url) {
  const method = request.method || "GET";
  if (!isTrafficGuardedPath(url?.pathname || "", method)) return { ok: true, skipped: true };
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000);
  const authPath = ["/login", "/my/local-login", "/my/local-signup"].includes(String(url?.pathname || ""));
  const skillPath = String(url?.pathname || "") === "/skill";
  const limit = authPath
    ? boundedRuntimeNumber(env.AUTH_RATE_LIMIT, 8, 3, 30)
    : skillPath
      ? skillIpGuardLimit(env)
      : boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000);
  const key = `${trafficClientKey(request)}|${String(url?.pathname || "").slice(0, 60)}`;
  pruneRateBucketMap(AB_TRAFFIC_BUCKETS, now, windowMs);
  let bucket = AB_TRAFFIC_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) bucket = { windowStart: now, count: 0 };
  bucket.count += 1;
  AB_TRAFFIC_BUCKETS.set(key, bucket);
  const ok = bucket.count <= limit;
  if (!ok) rememberTrafficEvent({ kind: "limited", path: url?.pathname || "", method, key, detail: `${bucket.count}/${limit}` });
  return { ok, count: bucket.count, limit, resetInMs: Math.max(0, windowMs - (now - bucket.windowStart)), key };
}

function httpOriginFromHeader(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "null") return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : "";
  } catch (err) {
    return "";
  }
}

function hasBrowserSessionCookie(request) {
  try { return !!(getCookie(request, "ab_user") || getCookie(request, "ab_admin")); }
  catch (err) { return false; }
}

function isTrustedKakaoTransitionUrl(value = "") {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "kakao.com" || host.endsWith(".kakao.com");
  } catch (err) {
    return false;
  }
}

function csrfSignalSummary(request, url) {
  const expected = String(url?.origin || "");
  const originRaw = String(request?.headers?.get("origin") || "").trim();
  const refererRaw = String(request?.headers?.get("referer") || "").trim();
  const origin = httpOriginFromHeader(originRaw);
  const referer = httpOriginFromHeader(refererRaw);
  const classify = (raw, parsed) => !raw ? "missing" : parsed ? (parsed === expected ? "same" : "different") : "opaque";
  return `fetch_site=${String(request?.headers?.get("sec-fetch-site") || "missing").slice(0, 20)};origin=${classify(originRaw, origin)};referer=${classify(refererRaw, referer)};session=${hasBrowserSessionCookie(request) ? "present" : "missing"}`;
}

function csrfOriginAllowed(request, url) {
  const method = String(request?.method || "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return true;
  const path = String(url?.pathname || "");
  if (path === "/skill" || path.startsWith("/cron/")) return true;
  if (/^Bearer\s+\S+/i.test(String(request.headers.get("authorization") || ""))) return true;
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") return false;
  const expectedOrigin = String(url?.origin || "");
  const originRaw = String(request.headers.get("origin") || "").trim();
  const origin = httpOriginFromHeader(originRaw);

  // A concrete HTTP(S) Origin is the strongest browser signal. A real mismatch
  // remains blocked even when a WebView reports a confusing Referer.
  if (origin) return origin === expectedOrigin;
  if (originRaw && originRaw.toLowerCase() !== "null") return false;

  // Kakao and a few mobile WebViews can preserve an opaque/app Referer or
  // `Origin: null` after OAuth. Fetch Metadata still identifies a same-site
  // form submission, so do not reject that legitimate request.
  if (["same-origin", "same-site", "none"].includes(fetchSite)) return true;

  const refererRaw = String(request.headers.get("referer") || "").trim();
  const refererOrigin = httpOriginFromHeader(refererRaw);
  if (refererOrigin) {
    if (refererOrigin === expectedOrigin) return true;
    if (originRaw.toLowerCase() === "null" && hasBrowserSessionCookie(request) && isTrustedKakaoTransitionUrl(refererRaw)) return true;
    return false;
  }

  // Older WebViews sometimes omit Fetch Metadata and expose only an opaque
  // app referrer. Accept that case only for an already authenticated browser.
  if ((originRaw || refererRaw) && !hasBrowserSessionCookie(request)) return false;
  return true;
}

function csrfRejectedResponse(url) {
  if (String(url?.pathname || "").startsWith("/api/")) {
    return jsonResponse({ ok: false, error: "cross_site_request_blocked", reason: "cross_site_request_blocked", message: "보안 확인에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." }, 403);
  }
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>요청을 확인할 수 없습니다</title></head><body><main style="max-width:680px;margin:48px auto;padding:20px;font-family:system-ui,sans-serif"><h1>요청을 안전하게 차단했습니다.</h1><p>다른 사이트에서 전송된 변경 요청으로 확인됐습니다. 가계부 화면을 새로 열어 다시 시도해주세요.</p><p><a href="/my">내 가계부로 이동</a></p></main></body></html>`, 403);
}

function getTrafficOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_TRAFFIC_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_TRAFFIC_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_TRAFFIC_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function trafficLimitedResponse(url, request, result = {}, env = {}) {
  const retry = Math.max(1, Math.ceil(Number(result.resetInMs || 0) / 1000));
  if (url?.pathname === "/skill") return rateLimitedKakaoText(publicBaseUrl(env, url));
  if (String(url?.pathname || "").startsWith("/api/")) return jsonResponse({ ok: false, error: "rate_limited", reason: "rate_limited", message: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.", retry_after_seconds: retry }, 429);
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>요청이 잠시 제한되었어요</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:720px;margin:38px auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;box-shadow:0 18px 44px rgba(15,23,42,.08)}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.muted{color:#64748b;line-height:1.6}</style></head><body><main class="wrap"><section class="card"><h1>잠시 후 다시 시도해주세요</h1><p class="muted">짧은 시간에 저장·수정 요청이 많아 데이터 중복을 막기 위해 잠깐 제한했습니다. 약 ${retry}초 뒤 다시 시도해주세요.</p><a class="btn" href="/my">내 가계부로 이동</a></section></main></body></html>`, 429, { "retry-after": String(retry) });
}

function rateLimitedKakaoText(origin = "") {
  return kakaoText([
    "잠시만요 😊",
    "",
    "짧은 시간에 요청이 많아서 잠깐 쉬었다가 처리할게요.",
    "같은 내용을 여러 번 보내면 중복될 수 있어요.",
    "",
    "잠시 후 아래처럼 다시 보내주세요.",
    "• 요약",
    "• 오늘 기록 보기",
    "• 남은 예산",
    "",
    origin ? `가계부 확인\n${origin}/my` : "",
  ].filter(Boolean).join("\n"));
}
// @build:exports-start
export {
  AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD, boundedRuntimeNumber, buildOpsSnapshot,
  checkSkillRateLimit, checkTrafficGuard, cleanupNluOpsRetention, csrfOriginAllowed,
  csrfRejectedResponse, csrfSignalSummary, duplicateGuardSeconds, duplicateSkippedReturnLocation,
  getNluOpsSnapshot, getSkillOpsSnapshot, getTrafficOpsSnapshot, isDatabaseBusyError,
  isDuplicateGuardSource, nluOpsConfig, nluOutcomeFromKakaoResponse, pruneExpiringMap,
  pruneTimestampMap, rateLimitedKakaoText, rememberDuplicateEvent, rememberNluRuntimeEvent,
  rememberOpsEvent, rememberSkillEvent, scheduleNluOpsPersistence, skillIpGuardLimit,
  trafficClientKey, trafficLimitedResponse, userSafeErrorCode,
};
// @build:exports-end
