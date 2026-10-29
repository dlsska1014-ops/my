// @build:imports-start
import { rememberOpsEvent } from "./ops-telemetry.js";
import { HTML_HEADERS } from "./config-readiness.js";
import { constantTimeTextEqual, htmlResponse, jsonResponse, redirectResponse } from "./http.js";
import { adminLoginLocation, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { supabase } from "../data/supabase-client.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

const AB_MONITOR_SEND_BUDGET = { minute: 0, count: 0 };
// V22.9.37(관제): 전송 실패는 조용히 사라졌다. 인스턴스마다 분당 한 번만 운영 이벤트로 남긴다(220개 버퍼를 채우지 않는다).
const AB_MONITOR_SEND_FAILURE = { minute: 0 };
// V22.9.37(관제): 설정·백업·정산·예산 알림·목표·연간·정기·자산 화면은 표본에서 빠져 있었다. 로그인 사용자 화면을 모두 포함한다.
const AB_MONITOR_ROUTE_PREFIXES = ["/skill", "/app", "/m", "/my", "/api", "/admin", "/admin-view", "/auth", "/u/api", "/login", "/menu", "/budgets", "/reports", "/annual", "/annual-report", "/analysis", "/settlement-summary", "/budget-alerts", "/today-budget", "/monthly-forecast", "/fixed-preview", "/goals", "/savings-goals", "/payment-methods", "/reserve-plans", "/settings", "/backup", "/transactions", "/keyword-guide", "/categories", "/smart-tools", "/home-layout", "/start-guide", "/households", "/card-benefits"];

function abMonitorSendFailed(error) {
  const minute = Math.floor(Date.now() / 60000);
  if (AB_MONITOR_SEND_FAILURE.minute === minute) return;
  AB_MONITOR_SEND_FAILURE.minute = minute;
  try { rememberOpsEvent({ kind: "monitor_send_failed", severity: "warn", path: "/internal/telemetry", method: "POST", detail: String(error?.message || error || "").slice(0, 160) }); } catch (_) { /* never interrupt */ }
}

function abMonitorRequestContext(request, env = {}) {
  if (!env.OPS_MONITOR || !env.OPS_MONITOR_TOKEN) return null;
  const path = new URL(request.url).pathname;
  if (/^\/(?:health|ready|internal|ops-|assets|icon-|favicon|apple-touch|manifest|ads\.txt|robots|sitemap)/.test(path)) return null;
  if (!AB_MONITOR_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + "/"))) return null;
  const route = path === "/skill" ? "skill" : /login|signup|auth/.test(path) ? "auth" : /import/.test(path) ? "import" : /^\/(?:u\/api|api|admin)\//.test(path) ? "api" : "web";
  return { started_at: Date.now(), route, method: request.method, db_count: 0, db_ms: 0, db_failures: 0, db_retries: 0, outcome: "unknown" };
}

// V22.9.77(감사 G-5): '처리 중'으로 먼저 답한 요청(deferred)은 응답 시점 표본 하나만 남아, 뒤 작업에서 저장이 실패해도 관제에는
// outcome=deferred·db_failures=0 으로 보였다. 스킬 처리가 그 뒤 작업(pending)을 넘기면 작업이 끝날 때 최종 결과 표본을 한 번 더
// 보낸다(ref = 첫 표본 id. 관제 1.2.0 이 첫 표본 행을 최종 결과로 고친다). 카카오 응답 경로에는 요청을 더하지 않는다.
function abMonitorOutcome(env, outcome, pending = null) {
  const record = env.__AB_MONITOR_REQUEST;
  if (!record) return;
  record.outcome = outcome;
  if (pending && typeof pending.then === "function") record.pending = pending;
}

// V22.9.81 T-43: 사용자 요청 표본과 관제 왕복 확인 표본이 같은 전송(OPS_MONITOR /internal/telemetry·같은 토큰·2초 시한)을 쓴다.
// 결과는 "sent" 또는 실패 코드(http_NNN·timeout·transport)다. 사용자 표본 쪽은 예전처럼 결과를 쓰지 않는다.
async function abMonitorPost(env, event) {
  try {
    const result = await env.OPS_MONITOR.fetch("https://monitor.internal/internal/telemetry", { method: "POST", headers: { authorization: `Bearer ${env.OPS_MONITOR_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000) });
    if (result.body) await result.body.cancel();
    if (!result.ok) { abMonitorSendFailed(new Error(`http_${result.status}`)); return `http_${result.status}`; }
    return "sent";
  } catch (error) {
    abMonitorSendFailed(error); /* Monitoring failure never changes the user's response or retries a write. */
    return error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "transport";
  }
}

function abMonitorSend(env, event) {
  const minute = Math.floor(Date.now() / 60000);
  if (AB_MONITOR_SEND_BUDGET.minute !== minute) { AB_MONITOR_SEND_BUDGET.minute = minute; AB_MONITOR_SEND_BUDGET.count = 0; }
  if (AB_MONITOR_SEND_BUDGET.count >= 100) return null;
  AB_MONITOR_SEND_BUDGET.count += 1;
  // No original URL, IDs, headers, utterances, database paths, or payloads cross this boundary.
  return abMonitorPost(env, event);
}

// V22.9.81 T-43: 관제 1.3.0 은 5분 DB 수집 요청에 왕복 확인 id 를 x-ab-monitor-roundtrip 머리로 싣는다. 앱은 사용자 표본과 같은 전송으로
// 확인 표본(sample_kind "roundtrip", 발화·사용자·주소 없음) 하나를 보내고 결과를 답의 roundtrip 에 붙인다. 관제가 그 표본을 받았는지 보고
// '표본 0건'이 요청이 적은 것인지 전송 고장인지 가른다. 머리가 없으면(관제 1.2.1) 아무것도 보내지 않고 예전과 같은 바이트로 답한다.
// OPS_MONITOR 연결이 없으면 사용자 표본도 못 보내므로 not_connected 로 답한다. 분당 전송 예산(사용자 표본 보호)은 쓰지 않는다.
const AB_MONITOR_ROUNDTRIP_ID = /^[a-zA-Z0-9-]{8,64}$/;
async function abMonitorRoundtrip(env, id) {
  if (!env.OPS_MONITOR || !env.OPS_MONITOR_TOKEN) return { id, result: "not_connected" };
  const result = await abMonitorPost(env, { id, at: Date.now(), route: "api", method: "GET", status: 200, duration_ms: 0, db_count: 0, db_ms: 0, db_failures: 0, db_retries: 0, outcome: "ok", sample_kind: "roundtrip" });
  return { id, result };
}

async function abMonitorDeferredResult(env, record, first) {
  try {
    let response = null;
    try { response = await record.pending; } catch (_) { response = null; /* 뒤 작업이 던졌으면 실패로 남긴다. */ }
    const status = response ? response.status : 500;
    const reported = response?.headers?.get("x-accountbook-nlu-result") || "";
    const outcome = reported && reported !== "deferred" && reported !== "unknown" ? reported : status < 400 ? "ok" : "error";
    await abMonitorSend(env, { ...first, id: crypto.randomUUID(), ref: first.id, at: Date.now(), status, duration_ms: Math.max(0, Date.now() - record.started_at), db_count: record.db_count, db_ms: record.db_ms, db_failures: record.db_failures, db_retries: record.db_retries || 0, outcome });
  } catch (_) { /* Telemetry must never interrupt application handling. */ }
}

function abMonitorCompleted(env, ctx, response) {
  try {
  const record = env.__AB_MONITOR_REQUEST;
  if (!record || !ctx || typeof ctx.waitUntil !== "function") return;
  const duration = Math.max(0, Date.now() - record.started_at);
  const status = response ? response.status : 500;
  const outcome = response?.headers.get("x-accountbook-nlu-result") || record.outcome;
  const randomSample = Math.random() < 0.02;
  // '처리 중' 먼저 답은 응답 예산을 3.5초보다 짧게 둬도 늘 오류·지연 표본이다(최종 결과 표본과 짝을 이룬다).
  const incident = outcome === "deferred" || status >= 500 || status === 403 || record.db_failures > 0 || (record.db_retries || 0) > 0 || outcome === "error" || duration >= 3500;
  if (!randomSample && !incident) return;
  const event = { id: crypto.randomUUID(), at: Date.now(), route: record.route, method: record.method, status, duration_ms: duration, db_count: record.db_count, db_ms: record.db_ms, db_failures: record.db_failures, db_retries: record.db_retries || 0, outcome: outcome === "unknown" && status < 400 ? "ok" : outcome, sample_kind: randomSample ? "random" : "incident" };
  const persistence = abMonitorSend(env, event);
  if (persistence) { try { ctx.waitUntil(persistence); } catch (_) { /* Do not change a completed response. */ } }
  if (outcome === "deferred" && record.pending) { try { ctx.waitUntil(abMonitorDeferredResult(env, record, event)); } catch (_) { /* Do not change a completed response. */ } }
  } catch (_) { /* Telemetry must never interrupt application handling. */ }
}

async function abMonitorReadBounded(response, limit = 1048576) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error("monitor_payload_too_large");
      parts.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}

function abMonitorParseDatabaseMetrics(text) {
  const metrics = {};
  let cpuTotal = 0;
  let cpuIdle = 0;
  let cpuSeen = false;
  for (const line of text.split("\n")) {
    if (!/^(?:pg_database_size_mb|pg_stat_database_num_backends|pg_stat_database_numbackends|max_connections_connection_count|pg_settings_max_connections|node_memory_MemTotal_bytes|node_memory_MemAvailable_bytes|node_cpu_seconds_total)(?:\{|\s)/.test(line)) continue;
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{([^}]*)\})?\s+([-+\deE.]+)(?:\s|$)/);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    if (match[1] === "node_cpu_seconds_total") { cpuSeen = true; cpuTotal += value; if (/mode="idle"/.test(match[2] || "")) cpuIdle += value; }
    else if (match[1] === "pg_database_size_mb" && (!/datname=/.test(match[2] || "") || /datname="postgres"/.test(match[2] || ""))) metrics.database_bytes = value * 1024 * 1024;
    else if (match[1] === "pg_stat_database_num_backends" || match[1] === "pg_stat_database_numbackends") metrics.connections = (metrics.connections || 0) + value;
    else if (match[1] === "max_connections_connection_count" || match[1] === "pg_settings_max_connections") metrics.max_connections = value;
    else if (match[1] === "node_memory_MemTotal_bytes") metrics.memory_total_bytes = value;
    else if (match[1] === "node_memory_MemAvailable_bytes") metrics.memory_available_bytes = value;
  }
  metrics.cpu_counter = cpuSeen ? { total: cpuTotal, idle: cpuIdle } : null;
  return metrics;
}

async function abMonitorDatabaseMetrics(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { body: { ok: false, error_code: "not_connected" }, status: 503 };
  try {
    const base = new URL(env.SUPABASE_URL);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co")) return { body: { ok: false, error_code: "invalid_origin" }, status: 503 };
    const response = await fetch(`${base.origin}/customer/v1/privileged/metrics`, { headers: { authorization: `Basic ${btoa(`service_role:${env.SUPABASE_SERVICE_ROLE_KEY}`)}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) { if (response.body) await response.body.cancel(); return { body: { ok: false, error_code: `http_${response.status}` }, status: 503 }; }
    const metrics = abMonitorParseDatabaseMetrics(await abMonitorReadBounded(response));
    if (metrics.database_bytes === undefined && metrics.cpu_counter === null) return { body: { ok: false, error_code: "unsupported_metrics" }, status: 503 };
    return { body: { ok: true, metrics }, status: 200 };
  } catch (_) { return { body: { ok: false, error_code: "metrics_unavailable" }, status: 503 }; }
}

async function abMonitorDatabaseProbe(request, env) {
  if (!env.OPS_MONITOR_TOKEN || !constantTimeTextEqual(request.headers.get("authorization") || "", `Bearer ${env.OPS_MONITOR_TOKEN}`)) return jsonResponse({ ok: false, error_code: "unauthorized" }, 401);
  const roundtripId = request.headers.get("x-ab-monitor-roundtrip") || "";
  if (!AB_MONITOR_ROUNDTRIP_ID.test(roundtripId)) { const answer = await abMonitorDatabaseMetrics(env); return jsonResponse(answer.body, answer.status); }
  // V22.9.81 T-43: 확인 표본은 DB 지표 조회와 함께 보낸다(답이 늦어지지 않게). DB 지표가 실패해도 roundtrip 은 붙인다.
  const [answer, roundtrip] = await Promise.all([abMonitorDatabaseMetrics(env), abMonitorRoundtrip(env, roundtripId).catch(() => ({ id: roundtripId, result: "transport" }))]);
  return jsonResponse({ ...answer.body, roundtrip }, answer.status);
}

// V22.9.82: 관제 1.4.0 이 한 시간에 한 번 /internal/ops-usage 로 이용 현황(수익화 판단용 합계 숫자)을 받아 간다. 앱은 Supabase 읽기 전용
// 함수 accountbook_usage_summary_v22982 를 GET 으로 부르고, 계약(review-artifacts/v82-usage-metrics-2026-10-27/CONTRACT.md) 밖의 값은
// 버린다. 함수가 아직 없으면(운영자 승인 전 SQL) rpc_missing 으로 답한다. 사용자·가계부 id·이름·금액·메모는 이 경계를 넘지 않는다.
const AB_USAGE_HEAVY_THRESHOLD = 30;
const AB_USAGE_PERIOD_COUNTS = ["recorders", "records", "heavy_recorders", "retained_recorders", "prior_month_recorders", "active_households", "shared_active_households", "new_users", "new_households", "kakao_requests"];
const AB_USAGE_SOURCES = ["kakao", "web", "import", "auto", "other"];
const AB_USAGE_DAILY_COUNTS = ["recorders", "records", "kakao_requests", "new_users"];

function abUsageCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function abUsageDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function abUsagePeriod(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const from = abUsageDay(raw.from), to = abUsageDay(raw.to);
  const median = abUsageCount(raw.median_records_per_recorder) === null ? null : Math.round(raw.median_records_per_recorder * 10) / 10;
  const bySource = raw.records_by_source && typeof raw.records_by_source === "object" ? raw.records_by_source : {};
  if (!from || !to || median === null) return null;
  const out = { from, to };
  for (const key of AB_USAGE_PERIOD_COUNTS) { const n = abUsageCount(raw[key]); if (n === null) return null; out[key] = n; }
  out.median_records_per_recorder = median;
  out.records_by_source = {};
  for (const key of AB_USAGE_SOURCES) { const n = abUsageCount(bySource[key]); if (n === null) return null; out.records_by_source[key] = n; }
  out.kakao_by_intent = (Array.isArray(raw.kakao_by_intent) ? raw.kakao_by_intent : [])
    .filter(row => row && typeof row.intent === "string" && /^[A-Z_]{1,40}$/.test(row.intent) && abUsageCount(row.requests) !== null)
    .slice(0, 12).map(row => ({ intent: row.intent, requests: abUsageCount(row.requests) }));
  return out;
}

function abSanitizeUsage(raw) {
  if (!raw || typeof raw !== "object" || raw.schema !== 1) return null;
  const month = typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : null;
  const generatedAt = typeof raw.generated_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw.generated_at) ? raw.generated_at : null;
  const throughDay = abUsageCount(raw.through_day), heavy = abUsageCount(raw.heavy_threshold);
  const current = abUsagePeriod(raw.current), previousSame = abUsagePeriod(raw.previous_same), previousFull = abUsagePeriod(raw.previous_full);
  const totalsRaw = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  const totals = { users: abUsageCount(totalsRaw.users), households: abUsageCount(totalsRaw.households), shared_households: abUsageCount(totalsRaw.shared_households) };
  if (!month || !generatedAt || !throughDay || throughDay > 31 || !heavy || !current || !previousSame || !previousFull || Object.values(totals).includes(null)) return null;
  const daily = (Array.isArray(raw.daily) ? raw.daily : []).slice(-62).flatMap(row => {
    const day = abUsageDay(row?.day);
    const values = AB_USAGE_DAILY_COUNTS.map(key => abUsageCount(row?.[key]));
    return day && !values.includes(null) ? [{ day, recorders: values[0], records: values[1], kakao_requests: values[2], new_users: values[3] }] : [];
  });
  return { schema: 1, generated_at: generatedAt, month, through_day: throughDay, heavy_threshold: heavy, current, previous_same: previousSame, previous_full: previousFull, daily, totals };
}

async function abMonitorUsageSummary(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { body: { ok: false, error_code: "not_connected" }, status: 503 };
  try {
    const raw = await supabase(env, `/rest/v1/rpc/accountbook_usage_summary_v22982?p_heavy_threshold=${AB_USAGE_HEAVY_THRESHOLD}`, { method: "GET", timeoutMs: 8000 });
    const usage = abSanitizeUsage(raw);
    return usage ? { body: { ok: true, usage }, status: 200 } : { body: { ok: false, error_code: "invalid_reply" }, status: 503 };
  } catch (error) {
    // PostgREST 는 함수가 없으면 404(PGRST202)로 답한다. 그 밖(권한·시한·전송)은 원인을 밖으로 내지 않고 usage_unavailable 로 묶는다.
    const message = String(error?.message || "");
    return { body: { ok: false, error_code: /^Supabase 404\b/.test(message) || message.includes("PGRST202") ? "rpc_missing" : "usage_unavailable" }, status: 503 };
  }
}

async function abMonitorUsageProbe(request, env) {
  if (!env.OPS_MONITOR_TOKEN || !constantTimeTextEqual(request.headers.get("authorization") || "", `Bearer ${env.OPS_MONITOR_TOKEN}`)) return jsonResponse({ ok: false, error_code: "unauthorized" }, 401);
  const answer = await abMonitorUsageSummary(env);
  return jsonResponse(answer.body, answer.status);
}

async function handleComprehensiveMonitor(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return url.pathname === "/ops-monitor" || url.pathname === "/ops-monitor/open" ? redirectResponse(adminLoginLocation(url)) : jsonResponse({ ok: false, error: "admin_required" }, 401);
  if (!env.OPS_MONITOR || !env.OPS_MONITOR_TOKEN) return htmlResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>종합 관제 연결 준비</title><h1>종합 관제 연결이 필요합니다.</h1><p>별도 관제 Worker와 저장소를 연결하면 사용량과 오류 이력을 확인할 수 있습니다.</p><a href="/ops-dashboard">기존 운영 화면 열기</a></html>', 503);
  const paths = { "/ops-monitor": "/dashboard?base=/ops-monitor", "/ops-monitor/api/summary": "/api/summary", "/ops-monitor/api/manual": "/api/manual", "/ops-monitor/api/plans": "/api/plans", "/ops-monitor/open": "/internal/ticket" };
  const target = paths[url.pathname];
  if (!target || !((url.pathname.endsWith("/manual") || url.pathname.endsWith("/plans")) ? request.method === "POST" : request.method === "GET")) return jsonResponse({ ok: false, error: "not_found" }, 404);
  try {
    const body = request.method === "POST" ? await abMonitorReadBounded(request, 16384) : undefined;
    const response = await env.OPS_MONITOR.fetch(`https://monitor.internal${target}`, { method: url.pathname === "/ops-monitor/open" ? "POST" : request.method, headers: { authorization: `Bearer ${env.OPS_MONITOR_TOKEN}`, "content-type": "application/json" }, body, signal: AbortSignal.timeout(10000) });
    if (url.pathname !== "/ops-monitor/open") return response;
    if (!response.ok) return jsonResponse({ ok: false, error: "monitor_unavailable" }, 503);
    const result = JSON.parse(await abMonitorReadBounded(response, 4096));
    const origin = new URL(env.OPS_MONITOR_PUBLIC_ORIGIN || "");
    if (origin.protocol !== "https:" || !origin.hostname.endsWith(".workers.dev") || !/^[a-f0-9-]{36}$/.test(result.ticket || "")) return jsonResponse({ ok: false, error: "monitor_origin_required" }, 503);
    return htmlResponse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>별도 관제 열기</title><body><p>관리자 인증을 확인했습니다. 별도 관제를 열고 있습니다.</p><form method="post" action="${escapeHtml(origin.origin)}/session" id="monitorLogin"><input type="hidden" name="ticket" value="${escapeHtml(result.ticket)}"><button type="submit">관제 열기</button></form><script>document.getElementById('monitorLogin').submit()</script></body></html>`, 200, {
      "content-security-policy": HTML_HEADERS["content-security-policy"].replace("form-action 'self'", `form-action 'self' ${origin.origin}`),
    });
  } catch (_) { return jsonResponse({ ok: false, error: "monitor_unavailable" }, 503); }
}
// @build:exports-start
export {
  abMonitorCompleted, abMonitorDatabaseProbe, abMonitorOutcome, abMonitorRequestContext,
  abMonitorUsageProbe, handleComprehensiveMonitor,
};
// @build:exports-end
