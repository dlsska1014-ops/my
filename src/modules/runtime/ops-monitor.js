// @build:imports-start
import { rememberOpsEvent } from "./ops-telemetry.js";
import { HTML_HEADERS } from "./config-readiness.js";
import { constantTimeTextEqual, htmlResponse, jsonResponse, redirectResponse } from "./http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
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
  return { started_at: Date.now(), route, method: request.method, db_count: 0, db_ms: 0, db_failures: 0, outcome: "unknown" };
}

function abMonitorOutcome(env, outcome) {
  if (env.__AB_MONITOR_REQUEST) env.__AB_MONITOR_REQUEST.outcome = outcome;
}

function abMonitorCompleted(env, ctx, response) {
  try {
  const record = env.__AB_MONITOR_REQUEST;
  if (!record || !ctx || typeof ctx.waitUntil !== "function") return;
  const duration = Math.max(0, Date.now() - record.started_at);
  const status = response ? response.status : 500;
  const outcome = response?.headers.get("x-accountbook-nlu-result") || record.outcome;
  const randomSample = Math.random() < 0.02;
  const incident = status >= 500 || status === 403 || record.db_failures > 0 || outcome === "error" || duration >= 3500;
  if (!randomSample && !incident) return;
  const minute = Math.floor(Date.now() / 60000);
  if (AB_MONITOR_SEND_BUDGET.minute !== minute) { AB_MONITOR_SEND_BUDGET.minute = minute; AB_MONITOR_SEND_BUDGET.count = 0; }
  if (AB_MONITOR_SEND_BUDGET.count >= 100) return;
  AB_MONITOR_SEND_BUDGET.count += 1;
  const event = { id: crypto.randomUUID(), at: Date.now(), route: record.route, method: record.method, status, duration_ms: duration, db_count: record.db_count, db_ms: record.db_ms, db_failures: record.db_failures, outcome: outcome === "unknown" && status < 400 ? "ok" : outcome, sample_kind: randomSample ? "random" : "incident" };
  // No original URL, IDs, headers, utterances, database paths, or payloads cross this boundary.
  const persistence = (async () => {
    try {
      const result = await env.OPS_MONITOR.fetch("https://monitor.internal/internal/telemetry", { method: "POST", headers: { authorization: `Bearer ${env.OPS_MONITOR_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000) });
      if (result.body) await result.body.cancel();
      if (!result.ok) abMonitorSendFailed(new Error(`http_${result.status}`));
    } catch (error) { abMonitorSendFailed(error); /* Monitoring failure never changes the user's response or retries a write. */ }
  })();
  try { ctx.waitUntil(persistence); } catch (_) { /* Do not change a completed response. */ }
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

async function abMonitorDatabaseProbe(request, env) {
  if (!env.OPS_MONITOR_TOKEN || !constantTimeTextEqual(request.headers.get("authorization") || "", `Bearer ${env.OPS_MONITOR_TOKEN}`)) return jsonResponse({ ok: false, error_code: "unauthorized" }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ ok: false, error_code: "not_connected" }, 503);
  try {
    const base = new URL(env.SUPABASE_URL);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co")) return jsonResponse({ ok: false, error_code: "invalid_origin" }, 503);
    const response = await fetch(`${base.origin}/customer/v1/privileged/metrics`, { headers: { authorization: `Basic ${btoa(`service_role:${env.SUPABASE_SERVICE_ROLE_KEY}`)}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) { if (response.body) await response.body.cancel(); return jsonResponse({ ok: false, error_code: `http_${response.status}` }, 503); }
    const metrics = abMonitorParseDatabaseMetrics(await abMonitorReadBounded(response));
    if (metrics.database_bytes === undefined && metrics.cpu_counter === null) return jsonResponse({ ok: false, error_code: "unsupported_metrics" }, 503);
    return jsonResponse({ ok: true, metrics });
  } catch (_) { return jsonResponse({ ok: false, error_code: "metrics_unavailable" }, 503); }
}

async function handleComprehensiveMonitor(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return url.pathname === "/ops-monitor" || url.pathname === "/ops-monitor/open" ? redirectResponse("/admin-view") : jsonResponse({ ok: false, error: "admin_required" }, 401);
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
  handleComprehensiveMonitor,
};
// @build:exports-end
