
// V22.9.73: Worker→Supabase 요청 멈춤 대비. 2026-10-20 12:07~12:09 운영 단톡방 테스트에서 조회 요청 일부가 Supabase 에
// 도착하지 못한 채 10초 조회 제한에 걸려 세 요청이 실패했고(저장 요청 하나는 아예 보내지지 못함), Supabase 쪽 처리 시간은
// 평소(0.14~0.73초)와 같았다(docs/deployments/V22_9_72_OPENBUILDER_V3_4_2026_10_20.md). 조회(GET·HEAD·OPTIONS)는 멱등이므로
// 짧은 시한(기본 3초)에 응답이 없으면 한 번 더 보내고, 전체 시한(기본 10초)은 그대로 둔다. 쓰기는 다시 보내지 않고 시한(기본
// 15초)만 두며, 시한에 걸린 쓰기는 예전의 전송 오류처럼 '결과 불확실'로 올린다(기록·목표·참여 상태를 먼저 확인하라는 안내).
const SUPABASE_READ_TIMEOUT_MS = 10000;
const SUPABASE_RETRY_MIN_REMAINING_MS = 300;

function supabaseBoundedMs(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
}

function supabaseReadAttemptMs(env) {
  return supabaseBoundedMs(env?.SUPABASE_READ_ATTEMPT_MS, 3000, 500, 9000);
}

function supabaseWriteTimeoutMs(env) {
  return supabaseBoundedMs(env?.SUPABASE_WRITE_TIMEOUT_MS, 15000, 3000, 25000);
}

function supabaseReadTimeoutError(cause) {
  const error = new Error("supabase_read_timeout: 저장소 조회 응답을 기다리는 시간이 초과되었습니다.", cause ? { cause } : undefined);
  error.code = "supabase_read_timeout";
  return error;
}

// Workers 의 fetch 는 연결 실패·끊김을 TypeError 로, 우리 시한은 AbortError 로 끝낸다. 응답 상태가 없을 때만 멈춤으로 본다.
function supabaseTransportFailure(error) {
  return error instanceof TypeError || error?.name === "AbortError";
}

async function supabase(env, path, init = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL is not set");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const { timeoutMs, rawHeadResponse = false, analysisGetResponse = false, optionalTable = "", ...fetchInit } = init;
  const method = String(fetchInit.method || "GET").toUpperCase();
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(method);
  if (!readOnly && !/\/rpc\/accountbook_(?:auth_attempt|claim_operation|release_operation)/.test(path)) env.__AB_REQUEST_USER_ROWS?.clear();
  const headers = new Headers(fetchInit.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (fetchInit.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const monitor = env.__AB_MONITOR_REQUEST;
  const startedAt = Date.now();
  let failed = false;
  let dispatched = false;
  let status = 0;
  // V22.9.81 U-22: 응답 머리(상태)는 받았지만 본문을 아직 다 받지 못한 동안 true 다.
  let bodyPending = false;
  let expectedOptionalAbsence = false;
  let timer;
  let timeout = false;
  let retries = 0;
  const upstreamSignal = fetchInit.signal;
  const signalFor = (controller) => (upstreamSignal ? AbortSignal.any([controller.signal, upstreamSignal]) : controller.signal);
  const withDeadline = (ms, onTimeout) => {
    const controller = new AbortController();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { onTimeout(); controller.abort(); reject(supabaseReadTimeoutError()); }, Math.max(1, ms));
    });
    return { controller, deadline };
  };
  try {
    if (upstreamSignal?.aborted) throw new Error("supabase_request_cancelled_before_dispatch");
    const execute = async (signal) => {
      if (env.__AB_DB_BUDGET) {
        if (env.__AB_DB_BUDGET.used >= env.__AB_DB_BUDGET.limit) throw Object.assign(new Error("supabase_subrequest_budget_before_dispatch"), {code:"supabase_subrequest_budget_before_dispatch"});
        env.__AB_DB_BUDGET.used++;
      }
      dispatched = true;
      const res = await fetch(`${base}${path}`, { ...fetchInit, headers, signal });
      status = res.status;
      if (rawHeadResponse && method === "HEAD" && (res.ok || [405, 501].includes(status))) return res;
      bodyPending = true;
      const text = await res.text();
      bodyPending = false;
      if (!res.ok) {
        // V22.9.45: only an explicitly optional categories GET may treat this
        // schema-cache absence as expected. Authentication, writes and other
        // 404/5xx errors still count as failures. Keep the exception for fallback.
        if (method === "GET" && optionalTable === "accountbook_categories" &&
            /^\/rest\/v1\/accountbook_categories(?:\?|$)/.test(path) && status === 404) {
          try { expectedOptionalAbsence = JSON.parse(text)?.code === "PGRST205"; } catch (_) {}
        }
        throw new Error(`Supabase ${res.status}: ${text.slice(0, 500)}`);
      }
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch (_) { data = text; } }
      // Explicit opt-in for the insight GET only; ordinary JSON and HEAD callers
      // retain their return contract. No extra count/HEAD request is dispatched.
      if (analysisGetResponse && method === "GET") return { data, meta: {
        status, contentRange: res.headers.get("content-range"),
        rangeUnit: res.headers.get("range-unit"), preferenceApplied: res.headers.get("preference-applied"),
      } };
      return data;
    };
    if (!readOnly) {
      // 쓰기: 시한만 둔다. 다시 보내면 중복 저장이 될 수 있으므로 재시도하지 않는다. 시한에 걸리면 아래 catch 가
      // 전송 오류와 같은 '결과 불확실'로 올리고, 호출부는 기록 확인 안내를 낸다(transaction-save.js).
      const { controller, deadline } = withDeadline(supabaseWriteTimeoutMs(env), () => { timeout = true; });
      return await Promise.race([execute(signalFor(controller)), deadline]);
    }
    // 조회: 첫 시도는 짧은 시한, 응답이 전혀 없으면(시한·연결 오류) 남은 전체 시한 안에서 한 번 더 보낸다.
    const totalBudget = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Math.min(60000, Math.max(1, Number(timeoutMs))) : SUPABASE_READ_TIMEOUT_MS;
    const attemptMs = supabaseReadAttemptMs(env);
    for (let attempt = 1; ; attempt += 1) {
      const remaining = totalBudget - (Date.now() - startedAt);
      const thisBudget = attempt === 1 ? Math.min(attemptMs, remaining) : remaining;
      let attemptTimedOut = false;
      const { controller, deadline } = withDeadline(thisBudget, () => { attemptTimedOut = true; });
      try {
        return await Promise.race([execute(signalFor(controller)), deadline]);
      } catch (error) {
        clearTimeout(timer);
        const remainingAfter = totalBudget - (Date.now() - startedAt);
        const retryable = attempt < 2 && !status && !upstreamSignal?.aborted &&
          (attemptTimedOut || supabaseTransportFailure(error)) && remainingAfter >= SUPABASE_RETRY_MIN_REMAINING_MS;
        if (!retryable) {
          if (attemptTimedOut) timeout = true;
          throw error;
        }
        retries += 1;
        dispatched = false;
      }
    }
  } catch (error) {
    failed = true;
    // V22.9.81 U-22: 2xx 머리를 받은 뒤 본문 받기가 끊기거나 쓰기 시한에 걸린 쓰기도 결과 불확실이다. 저장소는 이미 반영했을 수 있다.
    // 예전에는 상태가 있어 이 판정에 들지 않고 전송 오류·조회 시한 오류로 나가, 부르는 곳이 ‘저장하지 못함’으로 안내했다(다시 보내면
    // 두 번 저장될 수 있다). 4xx 는 상태만으로 거절이 분명하므로 그대로 둔다.
    const bodyLost = bodyPending && status >= 200 && status < 300;
    if (!readOnly && dispatched && (!status || status >= 500 || status === 408 || bodyLost)) {
      const uncertain = new Error("supabase_write_result_unknown: 처리 결과를 확인하지 못했습니다. 기록·목표·참여 상태를 먼저 확인하고 같은 요청을 반복하지 마세요.", { cause: error });
      uncertain.name = "SupabaseWriteUncertainError";
      uncertain.code = "supabase_write_result_unknown";
      uncertain.uncertain_write = true;
      throw uncertain;
    }
    if (timeout && error?.code !== "supabase_read_timeout") throw supabaseReadTimeoutError(error);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (monitor) {
      monitor.db_count += 1;
      monitor.db_ms += Math.max(0, Date.now() - startedAt);
      if (retries) monitor.db_retries = (monitor.db_retries || 0) + retries;
      if (failed && !expectedOptionalAbsence) monitor.db_failures += 1;
    }
  }
}
// @build:exports-start
export { supabase };
// @build:exports-end
