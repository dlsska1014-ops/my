// @build:imports-start
import { rememberOpsEvent } from "./ops-telemetry.js";
import { CORS_HEADERS, HTML_HEADERS, JSON_HEADERS } from "./config-readiness.js";
import { attachBusinessInfoFooter, attachUiUxRuntime } from "../web/html-postprocess.js";
import { logWorkerError, safeError } from "./leases.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function renderEmergencyErrorHtml(url, err, title = "화면을 안전모드로 전환했어요") {
  const safePath = escapeHtml(`${url?.pathname || "/"}${url?.search || ""}`);
  const rawError = safeError(err);
  const uncertain = isUncertainStorageWrite(err);
  const msg = uncertain ? formatMessage("db_write_unknown") : /timeout|timed out|abort/i.test(rawError) ? "저장소 응답이 지연되고 있습니다." : "요청을 완료하지 못해 원래 데이터는 변경하지 않았습니다.";
  const origin = url?.origin || "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>말해가계부 · 안전모드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:40px auto;padding:20px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:24px;box-shadow:0 18px 44px rgba(15,23,42,.08)}h1{margin-top:0}.muted{color:#64748b;line-height:1.6}.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.btn{display:inline-flex;align-items:center;justify-content:center;background:#111827;color:#fff!important;text-decoration:none;border-radius:14px;padding:11px 14px;font-weight:900}.secondary{background:#eef2f7;color:#111827!important;border:1px solid #d8dee8}.code{background:#f1f5f9;border-radius:14px;padding:12px;word-break:break-all;color:#334155;font-size:13px}</style></head><body><main class="wrap"><section class="card"><h1>${escapeHtml(title)}</h1><p class="muted">일시적으로 해당 화면을 여는 중 문제가 발생해 안전 안내 화면을 표시합니다. 같은 작업을 반복 제출하지 말고 아래 경로로 돌아가 상태를 확인해 주세요.</p><div class="code">경로: ${safePath}<br/>상태: ${escapeHtml(msg)}</div><div class="btns"><a class="btn" href="${origin}${safePath}">${uncertain ? "목록에서 결과 확인" : "다시 시도"}</a><a class="btn secondary" href="${origin}/my/households">가계부 전환·추가</a><a class="btn secondary" href="${origin}/my/backup">백업·복구</a><a class="btn secondary" href="${origin}/start-guide">시작가이드</a></div></section></main></body></html>`;
}

// V22.9.26: 라우터의 마지막 catch 가 브라우저 폼 제출을 구분하는 데 쓴다.
// JSON 을 기대하는 경로(/api, /u/api, /skill)와 fetch() 호출은 그대로 JSON 을 받는다.
function isJsonApiPath(pathname = "") {
  const path = String(pathname || "");
  return path.startsWith("/api/") || path.startsWith("/u/api/") || path.startsWith("/internal/") || path.endsWith(".json");
}

function browserFormRequestFailed(request, url) {
  const path = String(url?.pathname || "");
  if (path === "/skill" || path.startsWith("/cron/") || isJsonApiPath(path)) return false;
  const accept = String(request?.headers?.get("accept") || "");
  return /text\/html/i.test(accept) && !/application\/json/i.test(accept.split(",")[0] || "");
}

function emergencyReturnUrl(request, url) {
  try {
    const referer = new URL(String(request?.headers?.get("referer") || ""));
    if (referer.origin === url.origin && !/^\/(api|u\/api|cron)\//.test(referer.pathname) && referer.pathname !== "/skill") {
      return referer;
    }
  } catch (_) {}
  return new URL("/my", url);
}

async function safeHtmlRoute(request, url, handler, label = "화면") {
  try {
    return await handler();
  } catch (err) {
    logWorkerError({ event: "safe_html_route_error", path: url?.pathname || "", method: request?.method || "GET", label, error: err });
    rememberOpsEvent({ kind: "route_error", severity: "error", path: url?.pathname || "", method: request?.method || "GET", label, detail: safeError(err) });
    return htmlResponse(renderEmergencyErrorHtml(url, err, `${label}을 안전모드로 전환했어요`), 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function headOnlyResponse(response) {
  const safe = response instanceof Response ? response : new Response(null, { status: 500 });
  return new Response(null, {
    status: safe.status,
    statusText: safe.statusText,
    headers: new Headers(safe.headers),
  });
}

function htmlResponse(html, status = 200, headers = {}) {
  const operationallyAlignedHtml = String(html || "")
    .replaceAll("schema_v22_8_0_asset_dashboard_complete.sql", "schema_v22_7_1_asset_dashboard.sql")
    .replaceAll("V22.8.0 자산 마이그레이션", "V22.7.1 자산 원자성 마이그레이션");
  return new Response(attachBusinessInfoFooter(attachUiUxRuntime(operationallyAlignedHtml)), {
    status,
    headers: { ...HTML_HEADERS, ...headers },
  });
}

function responseHeadersWithCookies(baseHeaders = {}, cookies = []) {
  const headers = new Headers(baseHeaders);
  for (const cookie of cookies) {
    if (cookie) headers.append("set-cookie", cookie);
  }
  return headers;
}

function htmlResponseWithCookies(html, status = 200, cookies = [], headers = {}) {
  return new Response(attachBusinessInfoFooter(attachUiUxRuntime(html)), {
    status,
    headers: responseHeadersWithCookies({ ...HTML_HEADERS, ...headers }, cookies),
  });
}

function csvResponse(csv, filename = "accountbook_backup.csv") {
  const safeName = String(filename || "accountbook_backup.csv").replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "");
  const encodedName = encodeURIComponent(String(filename || "accountbook_backup.csv"));
  return new Response("\ufeff" + csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...CORS_HEADERS,
    },
  });
}

function redirectResponse(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function redirectResponseWithCookies(location, cookies = [], headers = {}) {
  return new Response(null, {
    status: 303,
    headers: responseHeadersWithCookies({
      location,
      "cache-control": "no-store",
      ...headers,
    }, cookies),
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) {
      try { return decodeURIComponent(v); }
      catch (err) { return ""; }
    }
  }
  return "";
}

function isMobileRequest(request) {
  const ua = request.headers.get("user-agent") || "";
  return /Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/i.test(ua);
}

function isExplicitAdminUrl(url) {
  return url.pathname === "/admin-view" || url.searchParams.get("admin") === "1" || url.searchParams.get("operator") === "1";
}

async function redirectPublicAwayFromAdmin(request, env, location = "/my") {
  return (await verifyAdminSession(request, env)) ? null : redirectResponse(location);
}

function mobileAppLocation(url) {
  const month = url.searchParams.get("month") || "";
  const householdId = url.searchParams.get("household_id") || "";
  const qs = new URLSearchParams();
  if (month) qs.set("month", month);
  if (householdId) qs.set("household_id", householdId);
  const tab = url.searchParams.get("tab") || "";
  const hash = tab === "calendar" ? "#calendar" : tab === "import" ? "#file" : tab === "transactions" ? "#quick" : "";
  return `/app${qs.toString() ? `?${qs.toString()}` : ""}${hash}`;
}

function base64UrlEncode(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value = "") {
  return base64UrlEncode(new TextEncoder().encode(String(value || "")));
}

function base64UrlDecodeText(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlDecodeBytes(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeTextEqual(a = "", b = "") {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  let diff = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
// @build:exports-start
export {
  base64UrlDecodeBytes, base64UrlDecodeText, base64UrlEncode, base64UrlEncodeText,
  browserFormRequestFailed, constantTimeTextEqual, csvResponse, emergencyReturnUrl, getCookie,
  headOnlyResponse, htmlResponse, htmlResponseWithCookies, isExplicitAdminUrl, isJsonApiPath,
  isMobileRequest, jsonResponse, mobileAppLocation, redirectPublicAwayFromAdmin, redirectResponse,
  redirectResponseWithCookies, renderEmergencyErrorHtml, safeHtmlRoute,
};
// @build:exports-end
