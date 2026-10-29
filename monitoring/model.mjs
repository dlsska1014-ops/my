export const MONITOR_VERSION = "1.4.0";
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

// ── 1.4.0(V22.9.82) 이용 현황 ──────────────────────────────────────────────────
// 수익화 판단용 이용 지표(달마다 기록 이용자·인당 기록 수·재사용률·기능별 카카오 요청 등). 앱 V22.9.82 가 Supabase 읽기 전용 함수
// accountbook_usage_summary_v22982 로 센 합계 숫자만 /internal/ops-usage 로 받는다(사람·가계부·거래 내용 없음).
// 계약: review-artifacts/v82-usage-metrics-2026-10-27/CONTRACT.md. 관제는 받은 값을 다시 검사해 계약의 칸만 남긴다. 핵심 모양(판·달·
// 기간 셋·누적)이 틀리면 통째로 버리고(invalid_reply), 날마다 줄·기능 순위는 틀린 항목만 버린다.
// 전체 상태·경고·확인되지 않은 항목·수집 상태 표와 무관하고 '이용 현황' 칸에만 보인다.
export const USAGE_INTERVAL_MS = 55 * 60000;
export const USAGE_KEEP_MONTHS = 24;
const USAGE_STALE_MINUTES = 130;
export const USAGE_INTENT_LABELS = { TRANSACTION: "기록", SUMMARY: "요약", RECENT_RECORDS: "최근 기록", EDIT: "고치기", EDIT_GUIDE: "고치기 안내", BUDGET_SETUP: "예산 설정", BUDGET_STATUS: "남은 예산", SETTLEMENT: "정산", GROUP_LINK: "단톡방 연결", CREATE_HOUSEHOLD: "가계부 만들기", JOIN_HOUSEHOLD: "초대코드 참여", HOUSEHOLD_SWITCH: "가계부 바꾸기", MEMBER_ALIAS_CHANGE: "이름 설정", INVITE_CODE_SHOW: "초대코드 보기", INVITE_MEMBER: "초대하기", WEB_LINK: "웹 가계부", HELP: "도움말", MENU: "메뉴", START: "시작", INPUT_EXAMPLE: "기록 방법", KEYWORD_GUIDE: "키워드 안내", RESERVE_GUIDE: "예비비 안내", DATA_POLICY: "데이터 안내", CANCEL: "취소", EMPTY: "빈 메시지", UNKNOWN: "알 수 없음" };
const USAGE_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const USAGE_DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const USAGE_INTENT = /^[A-Z_]{1,40}$/;
const USAGE_COUNTS = ["recorders", "records", "heavy_recorders", "retained_recorders", "prior_month_recorders", "active_households", "shared_active_households", "new_users", "new_households", "kakao_requests"];
const USAGE_SOURCES = ["kakao", "web", "import", "auto", "other"];
const USAGE_DAILY = ["recorders", "records", "kakao_requests", "new_users"];
const isPlain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isText = (value, pattern) => typeof value === "string" && pattern.test(value);

export function kstMonth(at) { return new Date(at + 9 * 3600000).toISOString().slice(0, 7); }
export function monthShift(month, delta) {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}
// 5분 cron 은 직전 시도 뒤 55분이 지났을 때만 앱에 묻는다. 기록이 없거나 읽을 수 없거나 55분 넘게 앞선 시각(시계 이상)이면 묻는다.
export function usageDue(record, now) {
  const last = Date.parse(record?.last_attempt_at || "");
  return !Number.isFinite(last) || now - last >= USAGE_INTERVAL_MS || last - now > USAGE_INTERVAL_MS;
}
export function sanitizeUsage(input) {
  const reject = () => { throw new Error("invalid_reply"); };
  const count = value => isCount(value) ? value : reject();
  const period = p => {
    if (!isPlain(p) || !isText(p.from, USAGE_DAY) || !isText(p.to, USAGE_DAY) || p.from > p.to || !isPlain(p.records_by_source)) reject();
    const median = p.median_records_per_recorder;
    if (typeof median !== "number" || !Number.isFinite(median) || median < 0 || median > 1e9) reject();
    const out = { from: p.from, to: p.to };
    for (const key of USAGE_COUNTS) out[key] = count(p[key]);
    out.records_by_source = Object.fromEntries(USAGE_SOURCES.map(key => [key, count(p.records_by_source[key])]));
    out.median_records_per_recorder = Math.round(median * 10) / 10;
    // 기능 순위는 앱이 많은 순으로 보낸 차례를 그대로 두고(정렬은 화면 쪽 usageView), 틀린 항목·겹친 이름만 빼고 12개에서 멈춘다.
    // 5분 cron 에서 정렬하지 않는다(1.2.0 의 cron CPU 기준: 실행마다 정렬하는 값 10개 이하).
    const seen = new Set();
    const intents = [];
    for (const item of Array.isArray(p.kakao_by_intent) ? p.kakao_by_intent.slice(0, 100) : []) {
      if (!isPlain(item) || !isText(item.intent, USAGE_INTENT) || !isCount(item.requests) || seen.has(item.intent)) continue;
      seen.add(item.intent);
      intents.push({ intent: item.intent, requests: item.requests });
      if (intents.length === 12) break;
    }
    out.kakao_by_intent = intents;
    return out;
  };
  if (!isPlain(input) || input.schema !== 1 || !isText(input.month, USAGE_MONTH) || !Number.isSafeInteger(input.through_day) || input.through_day < 1 || input.through_day > 31
    || !Number.isSafeInteger(input.heavy_threshold) || input.heavy_threshold < 1 || !Array.isArray(input.daily) || !isPlain(input.totals)) reject();
  const generated = typeof input.generated_at === "string" && input.generated_at.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(input.generated_at) ? Date.parse(input.generated_at) : NaN;
  if (!Number.isFinite(generated)) reject();
  // 날마다 줄은 계약대로 날짜 오름차순만 받는다(앞 줄보다 늦지 않은 날·겹친 날·틀린 줄은 버림). 정렬하지 않고 마지막 62줄을 남긴다.
  const daily = [];
  for (const row of input.daily.slice(-200)) {
    if (!isPlain(row) || !isText(row.day, USAGE_DAY) || (daily.length && row.day <= daily[daily.length - 1].day) || !USAGE_DAILY.every(key => isCount(row[key]))) continue;
    daily.push({ day: row.day, recorders: row.recorders, records: row.records, kakao_requests: row.kakao_requests, new_users: row.new_users });
  }
  return {
    schema: 1, generated_at: new Date(generated).toISOString(), month: input.month, through_day: input.through_day, heavy_threshold: input.heavy_threshold,
    current: period(input.current), previous_same: period(input.previous_same), previous_full: period(input.previous_full),
    daily: daily.slice(-62),
    totals: { users: count(input.totals.users), households: count(input.totals.households), shared_households: count(input.totals.shared_households) },
  };
}
// 관제가 계산해 보이는 값(계약 '관제가 계산해 보이는 값'). 분모가 0 이거나 값이 없으면 null 이고 화면은 "—" 로 보인다.
export function usageRatio(numerator, denominator) {
  return Number.isFinite(numerator) && numerator >= 0 && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
}
export function usageChange(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0 ? (current - previous) / previous : null;
}
export function usageDerived(period) {
  if (!isPlain(period)) return null;
  return {
    records_per_recorder: usageRatio(period.records, period.recorders),
    retention_rate: usageRatio(period.retained_recorders, period.prior_month_recorders),
    kakao_per_recorder: usageRatio(period.kakao_requests, period.recorders),
    shared_ratio: usageRatio(period.shared_active_households, period.active_households),
    heavy_ratio: usageRatio(period.heavy_recorders, period.recorders),
  };
}
export const usageIntentLabel = intent => Object.hasOwn(USAGE_INTENT_LABELS, intent) ? USAGE_INTENT_LABELS[intent] : String(intent);
// 12개월 추이: 달마다 한 행(source 'usage', bucket = 그 달)의 current 를 쓰되, 다음 달 행이 있으면 그 행의 previous_full(그 달 전체를
// 다시 센 값)을 쓴다. 그래서 끝난 달에는 그 달 마지막 수집 뒤의 기록까지 들어가고, 1.4.0 을 올린 달의 지난달도 한 점 생긴다.
// 자료가 있는 가장 이른 달부터 가장 늦은 달까지 최대 12칸이며, 사이에 빠진 달은 null 칸이다.
export function usageTrend(rows, currentMonth, limit = 12) {
  const months = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isPlain(row) || !isText(row.bucket, USAGE_MONTH)) continue;
    const previous = typeof row.previous_from === "string" ? row.previous_from.slice(0, 7) : "";
    if (USAGE_MONTH.test(previous) && previous < row.bucket && isCount(row.previous_recorders)) months.set(previous, { month: previous, recorders: row.previous_recorders, records: isCount(row.previous_records) ? row.previous_records : null, through_day: null, complete: true, partial: false });
    if (isCount(row.recorders) && !months.get(row.bucket)?.complete) months.set(row.bucket, { month: row.bucket, recorders: row.recorders, records: isCount(row.records) ? row.records : null, through_day: Number.isSafeInteger(row.through_day) && row.through_day >= 1 && row.through_day <= 31 ? row.through_day : null, complete: false, partial: row.bucket === currentMonth });
  }
  if (!months.size) return [];
  const sorted = [...months.keys()].sort();
  const last = sorted.at(-1);
  const floor = monthShift(last, 1 - limit);
  const out = [];
  for (let month = sorted[0] > floor ? sorted[0] : floor; month <= last; month = monthShift(month, 1)) out.push(months.get(month) || { month, recorders: null, records: null, through_day: null, complete: false, partial: false });
  return out;
}
// /api/summary 의 usage. record = settings 'usage'(수집 상태), latest = 가장 늦은 달의 samples 행, rows = 최근 13달의 추이 칸.
// 상태: never(아직 묻지 않음)·ok·stale(성공 뒤 130분 넘게 새 성공 없음)·error·not_connected. 실패해도 마지막으로 받은 자료와 그 시각을 그대로 보인다.
export function usageView(record, latest, rows, now = Date.now()) {
  const state = isPlain(record) ? record : null;
  let data = null;
  try { data = latest && typeof latest.payload === "string" ? sanitizeUsage(JSON.parse(latest.payload)) : null; } catch (_) { data = null; }
  const collectedAt = data && typeof latest.collected_at === "string" && Number.isFinite(Date.parse(latest.collected_at)) ? latest.collected_at : null;
  const age = collectedAt ? Math.max(0, Math.floor((now - Date.parse(collectedAt)) / 60000)) : null;
  const stored = state ? (["ok", "error", "not_connected"].includes(state.status) ? state.status : "error") : data ? "ok" : "never";
  const status = stored === "ok" && (age === null || age > USAGE_STALE_MINUTES) ? "stale" : stored;
  const month = kstMonth(now);
  const derived = data ? { current: usageDerived(data.current), previous_same: usageDerived(data.previous_same), previous_full: usageDerived(data.previous_full) } : null;
  const change = data ? Object.fromEntries(["recorders", "records", "heavy_recorders", "kakao_requests", "new_users", "new_households"].map(key => [key, usageChange(data.current[key], data.previous_same[key])])) : null;
  if (change) change.records_per_recorder = usageChange(derived.current.records_per_recorder, derived.previous_same.records_per_recorder);
  return {
    status,
    error_code: status === "error" || status === "not_connected" ? (/^[A-Za-z0-9_]{1,60}$/.test(String(state?.error_code)) ? state.error_code : "collection_failed") : null,
    last_attempt_at: typeof state?.last_attempt_at === "string" ? state.last_attempt_at : collectedAt,
    last_success_at: typeof state?.last_success_at === "string" ? state.last_success_at : collectedAt,
    collected_at: collectedAt, age_minutes: age, current_month: month, data_is_current: Boolean(data) && data.month === month,
    data, derived, change,
    intents: data ? [...data.current.kakao_by_intent].sort((a, b) => b.requests - a.requests).map(item => ({ intent: item.intent, label: usageIntentLabel(item.intent), requests: item.requests, share: usageRatio(item.requests, data.current.kakao_requests) })) : [],
    trend: usageTrend(rows, month),
  };
}
