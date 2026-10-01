// Run from a different provider or a computer outside Cloudflare.
// No credentials or private ledger endpoints are used.
const origin = process.env.MONITOR_APP_ORIGIN || "https://malhaebook.com";
const url = new URL(origin);
if (url.protocol !== "https:") throw new Error("HTTPS origin required");
let failed = false;
for (const path of ["/health", "/ready"]) {
  const start = Date.now();
  try {
    const response = await fetch(url.origin+path, { signal: AbortSignal.timeout(10000), redirect: "error" });
    const body = await response.json();
    const ok = response.ok && (path === "/ready" ? body.ready === true : body.alive === true);
    failed ||= !ok;
    console.log(JSON.stringify({ checked_at: new Date().toISOString(), path, ok, http_status: response.status, duration_ms: Date.now()-start }));
  } catch (_) {
    failed = true;
    console.log(JSON.stringify({ checked_at: new Date().toISOString(), path, ok: false, error: "connection_failed", duration_ms: Date.now()-start }));
  }
}
process.exitCode = failed ? 1 : 0;
