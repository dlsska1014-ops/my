export const MONITOR_VERSION = "1.3.0";
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

// 1.2.0(V44:G-6): 성장 예측은 가장 이른 점·가장 늦은 점과 점 개수(3개 이상)만 쓴다. 5분 cron 은 이 셋을 D1 에서 바로 받아
// 7일치 2,016행을 읽지 않는다(growthDaysToLimit). 화면용 daysToLimit 은 시각을 한 번만 해석해 정렬한다(예전에는 비교마다 Date.parse).
export function growthDaysToLimit(first, last, count, value, limit) {
  if (!(count >= 3) || !first || !last || numberOrNull(value) === null || numberOrNull(limit) === null) return null;
  const days = (Date.parse(last.at)-Date.parse(first.at))/DAY;
  const growth = (last.value-first.value)/days;
  if (days < 2 || growth <= 0) return null;
  return Math.max(0, (limit-value)/growth);
}

export function daysToLimit(points, value, limit) {
  const sorted = points.map(p => ({ at: p.at, value: p.value, t: Date.parse(p.at) })).filter(p => numberOrNull(p.value) !== null && Number.isFinite(p.t)).sort((a,b) => a.t-b.t);
  return growthDaysToLimit(sorted[0], sorted.at(-1), sorted.length, value, limit);
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

// 표본 30건 미만이면 p95 를 내지 않는다. cron 은 이 위치만 D1 에 물어 한 행을 받는다(1.2.0).
export function percentileIndex(count, p = 0.95) {
  return count < 30 ? null : Math.max(0,Math.ceil(count*p)-1);
}

export function percentile(values, p = 0.95) {
  const numbers = values.map(numberOrNull).filter(v => v !== null).sort((a,b)=>a-b);
  const index = percentileIndex(numbers.length, p);
  return index === null ? null : numbers[index];
}

export function sanitizeTelemetry(input, now = Date.now()) {
  const routes = new Set(["skill", "web", "api", "auth", "import"]);
  // 1.2.0(V44:G-5): "deferred" = 카카오 5초 제한 때문에 '처리 중'으로 먼저 답한 요청. 뒤 작업이 끝나면 앱이 최종 결과 표본을
  // 하나 더 보내고(ref = 첫 표본 id), 관제는 그 결과로 첫 표본 행을 고친다. 예전에는 "deferred"가 unknown 으로 바뀌었다.
  const outcomes = new Set(["ok", "error", "fallback", "clarify", "saved", "auth_denied", "http_error", "deferred", "unknown"]);
  const idPattern = /^[a-zA-Z0-9-]{8,64}$/;
  const at = Number(input?.at);
  const status = Number(input?.status);
  if (!input || !routes.has(input.route) || !Number.isFinite(at) || Math.abs(now-at)>10*60000 || !Number.isInteger(status) || status<100 || status>599) throw new Error("invalid_telemetry");
  const bounded = (value,max) => Math.min(max, Math.max(0, Math.round(Number(value)||0)));
  const id = typeof input.id === "string" && idPattern.test(input.id) ? input.id : crypto.randomUUID();
  const outcome = outcomes.has(input.outcome) ? input.outcome : "unknown";
  // 1.3.0(V79:T-43): "roundtrip" = 관제가 5분 DB 수집 요청으로 앱에 보내게 한 왕복 확인 표본. 사용자 요청 표본과 같은 길로 들어와
  // 같은 표에 잠깐 들어가지만 요청 표본 통계에서는 빠지고, 관제가 받았는지 확인하면서 지운다. 다른 표본을 고치지(ref) 못한다.
  const kind = input.sample_kind === "random" ? "random" : input.sample_kind === "roundtrip" ? "roundtrip" : "incident";
  return {
    id,
    at, route: input.route, method: ["GET","POST","PATCH","DELETE","PUT","HEAD"].includes(input.method) ? input.method : "OTHER",
    status, duration_ms: bounded(input.duration_ms,120000), db_count: bounded(input.db_count,1000), db_ms: bounded(input.db_ms,300000), db_failures: bounded(input.db_failures,1000),
    outcome, sample_kind: kind,
    ref: kind !== "roundtrip" && outcome !== "deferred" && typeof input.ref === "string" && idPattern.test(input.ref) && input.ref !== id ? input.ref : null,
  };
}

// ── 1.3.0(V79:T-43) 앱 표본 왕복 확인 ──────────────────────────────────────────
// 관제는 요청 표본이 하루 창 안에 없으면 '미연결'로만 보여 저사용량과 전송 고장을 가르지 못했다(표본은 요청의 2% 와 사고 요청뿐).
// 이제 5분마다 앱을 부르는 DB 수집 요청에 왕복 확인 id 를 싣고, 앱이 사용자 표본과 같은 전송으로 확인 표본을 하나 보낸다.
// 상태: ok = 관제가 그 표본을 받음 · failing = 앱이 보내지 못했다고 답했거나, 보냈다는데 관제에 없음 ·
// unknown = 옛 앱(답에 roundtrip 이 없음)·앱을 부르지 못함·인증 실패·기록 없음·20분 넘게 확인 없음. unknown 은 경고를 만들지 않는다.
// 기록은 D1 settings 의 'roundtrip' 한 행이다(표 바꿈 없음, 1.2.1 은 이 행을 읽지 않는다).
export const ROUNDTRIP_ALERT_FAILURES = 3;
const ROUNDTRIP_MAX_AGE_MS = 20 * 60000;
export function roundtripRecord(previous, outcome, checkedAt) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const streak = Number.isSafeInteger(prev.failures) && prev.failures > 0 ? prev.failures : 0;
  // 연속 실패는 정상 확인으로만 0 이 된다. unknown(확인 못 함)은 세지도 지우지도 않는다.
  const failures = outcome.status === "ok" ? 0 : outcome.status === "failing" ? streak + 1 : streak;
  return { status: outcome.status, checked_at: checkedAt, error_code: outcome.status === "ok" ? null : outcome.error_code || null, last_ok_at: outcome.status === "ok" ? checkedAt : typeof prev.last_ok_at === "string" ? prev.last_ok_at : null, failures };
}
export function roundtripView(record, now = Date.now()) {
  const view = { status: "unknown", checked_at: null, last_ok_at: null, error_code: "not_checked", failures: 0 };
  if (!record || typeof record !== "object") return view;
  const age = now - Date.parse(record.checked_at || "");
  const stored = ["ok", "failing", "unknown"].includes(record.status) ? record.status : "unknown";
  const fresh = Number.isFinite(age) && age >= -60000 && age <= ROUNDTRIP_MAX_AGE_MS;
  return {
    status: fresh ? stored : "unknown",
    checked_at: typeof record.checked_at === "string" ? record.checked_at : null,
    last_ok_at: typeof record.last_ok_at === "string" ? record.last_ok_at : null,
    error_code: fresh ? (stored === "ok" ? null : String(record.error_code || "unknown").slice(0, 60)) : "stale",
    failures: Number.isSafeInteger(record.failures) && record.failures > 0 ? record.failures : 0,
  };
}
