export const MONITOR_VERSION = "1.1.0";
export const PRICING_VERIFIED_AT = "2026-10-01";
export const DAY = 86400000;

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function quotaStatus(value, limit, { fresh = true, forecast = null } = {}) {
  const used = numberOrNull(value);
  const cap = numberOrNull(limit);
  if (!fresh || used === null || cap === null || cap <= 0) return { status: "unknown", ratio: null, forecast_ratio: null };
  const ratio = used / cap;
  const forecastRatio = numberOrNull(forecast) === null ? null : forecast / cap;
  const status = ratio >= 0.95 ? "critical" : ratio >= 0.85 || forecastRatio >= 1 ? "upgrade" : ratio >= 0.7 ? "warning" : "normal";
  return { status, ratio, forecast_ratio: forecastRatio };
}

export function monthlyForecast(value, periodStart, periodEnd, measuredAt) {
  const n = numberOrNull(value);
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  const at = Date.parse(measuredAt);
  if (n === null || ![start, end, at].every(Number.isFinite) || at - start < DAY || at < start || at > end || end <= start) return null;
  return n * (end - start) / (at - start);
}

export function daysToLimit(points, value, limit) {
  const sorted = points.filter(p => numberOrNull(p.value) !== null && Number.isFinite(Date.parse(p.at))).sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
  if (sorted.length < 3 || numberOrNull(value) === null || numberOrNull(limit) === null) return null;
  const first = sorted[0];
  const last = sorted.at(-1);
  const days = (Date.parse(last.at)-Date.parse(first.at))/DAY;
  const growth = (last.value-first.value)/days;
  if (days < 2 || growth <= 0) return null;
  return Math.max(0, (limit-value)/growth);
}

export function freshState(row, maxAgeMs, now = Date.now()) {
  if (!row) return { status: "not_connected", fresh: false, last_success_at: null, last_attempt_at: null, error_code: null };
  const age = now - Date.parse(row.last_success_at || "");
  const fresh = row.status === "ok" && Number.isFinite(age) && age >= -60000 && age <= maxAgeMs;
  return { status: fresh ? "ok" : row.status === "ok" ? "stale" : row.status, fresh, last_success_at: row.last_success_at || null, last_attempt_at: row.last_attempt_at || null, error_code: row.error_code || null };
}

export function cpuPercent(current, previous) {
  if (!current || !previous || current.total < previous.total || current.idle < previous.idle) return null;
  const total = current.total-previous.total;
  const idle = current.idle-previous.idle;
  if (total <= 0 || idle > total) return null;
  return Math.max(0, Math.min(100, 100*(1-idle/total)));
}

// Only metric names in this allowlist can cross the application/monitor boundary.
export function parseDatabaseMetrics(text) {
  const names = new Set(["pg_database_size_mb", "pg_stat_database_num_backends", "pg_stat_database_numbackends", "max_connections_connection_count", "pg_settings_max_connections", "node_memory_MemTotal_bytes", "node_memory_MemAvailable_bytes", "node_cpu_seconds_total"]);
  const values = {};
  let idle = 0;
  let total = 0;
  let cpuSeen = false;
  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{([^}]*)\})?\s+([-+\deE.]+)(?:\s|$)/);
    if (!match || !names.has(match[1])) continue;
    const value = numberOrNull(match[3]);
    if (value === null) continue;
    if (match[1] === "node_cpu_seconds_total") {
      cpuSeen = true;
      total += value;
      if (/mode="idle"/.test(match[2] || "")) idle += value;
    } else if (match[1] === "pg_database_size_mb") {
      // The provider metric is per database. Match the application's postgres DB.
      if (!/datname=/.test(match[2] || "") || /datname="postgres"/.test(match[2] || "")) values.database_bytes = value*1024*1024;
    } else if (match[1] === "pg_stat_database_num_backends" || match[1] === "pg_stat_database_numbackends") {
      values.connections = (values.connections || 0)+value;
    } else if (match[1] === "max_connections_connection_count" || match[1] === "pg_settings_max_connections") values.max_connections = value;
    else if (match[1] === "node_memory_MemTotal_bytes") values.memory_total_bytes = value;
    else if (match[1] === "node_memory_MemAvailable_bytes") values.memory_available_bytes = value;
  }
  values.cpu_counter = cpuSeen ? { total, idle } : null;
  return values;
}

export function workersCost(requests, cpuMs) {
  const r = numberOrNull(requests);
  const cpu = numberOrNull(cpuMs);
  if (r === null) return { minimum_usd: null, total_usd: null, complete: false };
  const minimum = 5+Math.max(0,r-10000000)/1000000*0.3;
  return { minimum_usd: minimum, total_usd: cpu === null ? null : minimum+Math.max(0,cpu-30000000)/1000000*0.02, complete: cpu !== null };
}

export function percentile(values, p = 0.95) {
  const numbers = values.map(numberOrNull).filter(v => v !== null).sort((a,b)=>a-b);
  if (numbers.length < 30) return null;
  return numbers[Math.max(0,Math.ceil(numbers.length*p)-1)];
}

export function sanitizeTelemetry(input, now = Date.now()) {
  const routes = new Set(["skill", "web", "api", "auth", "import"]);
  const outcomes = new Set(["ok", "error", "fallback", "clarify", "saved", "auth_denied", "http_error", "unknown"]);
  const at = Number(input?.at);
  const status = Number(input?.status);
  if (!input || !routes.has(input.route) || !Number.isFinite(at) || Math.abs(now-at)>10*60000 || !Number.isInteger(status) || status<100 || status>599) throw new Error("invalid_telemetry");
  const bounded = (value,max) => Math.min(max, Math.max(0, Math.round(Number(value)||0)));
  return {
    id: typeof input.id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(input.id) ? input.id : crypto.randomUUID(),
    at, route: input.route, method: ["GET","POST","PATCH","DELETE","PUT","HEAD"].includes(input.method) ? input.method : "OTHER",
    status, duration_ms: bounded(input.duration_ms,120000), db_count: bounded(input.db_count,1000), db_ms: bounded(input.db_ms,300000), db_failures: bounded(input.db_failures,1000),
    outcome: outcomes.has(input.outcome) ? input.outcome : "unknown", sample_kind: input.sample_kind === "random" ? "random" : "incident",
  };
}
