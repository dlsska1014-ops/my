
async function supabase(env, path, init = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL is not set");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const { timeoutMs, rawHeadResponse = false, ...fetchInit } = init;
  const method = String(fetchInit.method || "GET").toUpperCase();
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(method);
  if (!readOnly && !/\/rpc\/accountbook_(?:auth_attempt|claim_operation|release_operation)/.test(path)) env.__AB_REQUEST_USER_ROWS?.clear();
  const headers = new Headers(fetchInit.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (fetchInit.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const monitor = env.__AB_MONITOR_REQUEST;
  const startedAt = monitor ? Date.now() : 0;
  let failed = false;
  let dispatched = false;
  let status = 0;
  let timer;
  let timeout = false;
  const controller = readOnly ? new AbortController() : null;
  const upstreamSignal = fetchInit.signal;
  const signal = controller ? (upstreamSignal ? AbortSignal.any([controller.signal, upstreamSignal]) : controller.signal) : upstreamSignal;
  try {
    if (upstreamSignal?.aborted) throw new Error("supabase_request_cancelled_before_dispatch");
    const execute = async () => {
      if (env.__AB_DB_BUDGET) {
        if (env.__AB_DB_BUDGET.used >= env.__AB_DB_BUDGET.limit) throw Object.assign(new Error("supabase_subrequest_budget_before_dispatch"), {code:"supabase_subrequest_budget_before_dispatch"});
        env.__AB_DB_BUDGET.used++;
      }
      dispatched = true;
      const res = await fetch(`${base}${path}`, { ...fetchInit, headers, ...(signal ? { signal } : {}) });
      status = res.status;
      if (rawHeadResponse && method === "HEAD" && (res.ok || [405, 501].includes(status))) return res;
      const text = await res.text();
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 500)}`);
      if (!text) return null;
      try { return JSON.parse(text); } catch (_) { return text; }
    };
    // Bound safe reads first. Mutating deadlines require end-to-end result
    // reconciliation; no automatic write retry or cancellation is introduced here.
    if (!readOnly) return await execute();
    const budget = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Math.min(60000, Math.max(1, Number(timeoutMs))) : 10000;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { timeout = true; controller.abort(); const error = new Error("supabase_read_timeout: 저장소 조회 응답을 기다리는 시간이 초과되었습니다."); error.code = "supabase_read_timeout"; reject(error); }, budget);
    });
    return await Promise.race([execute(), deadline]);
  } catch (error) {
    failed = true;
    if (!readOnly && dispatched && (!status || status >= 500 || status === 408)) {
      const uncertain = new Error("supabase_write_result_unknown: 처리 결과를 확인하지 못했습니다. 기록·목표·참여 상태를 먼저 확인하고 같은 요청을 반복하지 마세요.", { cause: error });
      uncertain.name = "SupabaseWriteUncertainError";
      uncertain.code = "supabase_write_result_unknown";
      uncertain.uncertain_write = true;
      throw uncertain;
    }
    if (timeout && error?.code !== "supabase_read_timeout") { const deadlineError = new Error("supabase_read_timeout: 저장소 조회 응답을 기다리는 시간이 초과되었습니다.", { cause: error }); deadlineError.code = "supabase_read_timeout"; throw deadlineError; }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (monitor) {
      monitor.db_count += 1;
      monitor.db_ms += Math.max(0, Date.now() - startedAt);
      if (failed) monitor.db_failures += 1;
    }
  }
}
// @build:exports-start
export { supabase };
// @build:exports-end
