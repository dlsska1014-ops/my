// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { withSetCookie } from "../runtime/config-readiness.js";
import { safeError } from "../runtime/leases.js";
import { getCookie } from "../runtime/http.js";
import { supporterHeadHtml } from "./supporters.js";
import { ACCOUNTBOOK_SHELL_CSS_ASSET_PATH } from "../assets/asset-registry.js";
// @build:imports-end
// V22.9.121 후원자 포인트 색을 모든 웹 가계부 화면에(DB 조회를 늘리지 않고).
// 포인트 색(셸 CSS 변수 넷을 덮는 CSS · 이 브라우저에 저장한 색을 붙이는 작은 스크립트 · <html data-supporter="1">, my/supporters.js)은
// 지금까지 보는 사람의 후원자 표시를 읽는 세 화면 — 홈(/app·/m)·전체 메뉴(/menu)·참여자(/my/members) — 에만 그렸다. 다른 셸 화면
// (body.abV22812Shell)은 컬러톤만 보여, 전체 메뉴의 ‘고르면 컬러톤보다 먼저 보여요’ 가 그 화면들에서는 맞지 않았다.
//  · 쿠키 ab_sp(1일): 세 화면은 이미 보는 사람의 표시를 읽는다. 지금 켜진 후원자인데 요청에 ab_sp=1 이 없으면 쿠키를 주고, 후원자가 아닌데
//    ab_sp 가 있으면 지운다. 이번 요청에서 표시를 읽지 않았으면(관리자 세션의 홈·전체 메뉴, 구성원 50명 밖의 참여자 화면) 그대로 둔다.
//    로그아웃(/logout·/my/logout)도 지운다. 세 화면의 DB 호출 수는 그대로다.
//    로그인 세션(ab_user)을 새로 주거나 지우는 응답(다른 계정 로그인·방 바로 열기·계정 잇기 등)도 ab_sp 를 지운다 — 같은 브라우저의 다음
//    사람 화면에 앞사람의 색이 남지 않게(가계부 기억 쿠키 ab_hh 의 H4 와 같은 자리). 후원자는 다음 홈·전체 메뉴·참여자에서 다시 받는다.
//  · 응답 마무리(worker/router.js fetch): 로그인 쿠키(ab_user)와 ab_sp=1 이 함께 온 GET 의 200 HTML 가운데 셸 화면이고 <html> 에
//    data-supporter 가 아직 없는 것에만 data-supporter="1" 과 supporterHeadHtml({ viewer: true })(배지 CSS·포인트 색 CSS·스크립트)를 붙인다.
//    세 화면은 스스로 정하므로 건드리지 않고, 공개 화면(pubHeader)·관리자 화면·로그인 화면·HTML 이 아닌 응답은 붙이지 않는다.
//    쿠키가 없으면 응답을 그대로 돌려준다 — 비후원자 화면은 바이트 그대로다(홈 35 KiB 예산).
//  · 이 쿠키는 보기만 바꾼다. 위조한 쿠키는 위조한 사람 자기 화면의 색만 바꾸고, 다른 사람이 보는 ‘후원자’ 배지·공개 명단은 서버가 설정 표의
//    후원자 표시(supporter:<user_id>)로만 그린다. 그래서 서명하지 않는다.
const SUPPORTER_ACCENT_COOKIE_V229121 = "ab_sp";
const SUPPORTER_ACCENT_SET_COOKIE_V229121 = "ab_sp=1; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly";
const SUPPORTER_ACCENT_CLEAR_COOKIE_V229121 = "ab_sp=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly";
// 보는 사람의 표시를 스스로 읽어 그리는 화면. 응답 마무리는 이 화면들에 덧붙이지 않는다(후원이 끝난 사람의 홈에 남은 쿠키로 색을 칠하지 않게).
const SUPPORTER_ACCENT_SELF_PATHS_V229121 = new Set(["/app", "/m", "/menu", "/my/members"]);
// 운영·관리자 화면은 셸이 아니지만(운영 내비) 주소로도 한 번 더 뺀다.
const SUPPORTER_ACCENT_ADMIN_PATH_V229121 = /^\/(?:admin(?:[/-]|$)|ops(?:[/-]|$)|identity-audit(?:\/|$))/;

function supporterAccentCookieV229121(on = true) {
  return on ? SUPPORTER_ACCENT_SET_COOKIE_V229121 : SUPPORTER_ACCENT_CLEAR_COOKIE_V229121;
}

// 세 화면의 응답에 쿠키를 맞춘다. viewerIsSupporter: true = 지금 켜진 후원자, false = 아님(읽지 못해 화면도 색 없이 그렸을 때 포함),
// 그 밖(null) = 이번 요청에서 읽지 않음 → 그대로. 쿠키가 이미 맞으면 응답을 그대로 돌려준다.
function withSupporterAccentCookieV229121(request, response, viewerIsSupporter = null) {
  try {
    if (viewerIsSupporter !== true && viewerIsSupporter !== false) return response;
    if (!(response instanceof Response) || response.status !== 200) return response;
    const current = getCookie(request, SUPPORTER_ACCENT_COOKIE_V229121);
    if (viewerIsSupporter ? current === "1" : !current) return response;
    return withSetCookie(response, supporterAccentCookieV229121(viewerIsSupporter));
  } catch (_) {
    return response;
  }
}

function setCookieLinesV229121(response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : String(response.headers.get("set-cookie") || "").split(/,(?=\s*[A-Za-z0-9_-]+=)/);
}

// 응답이 이미 ab_sp 를 정했는지(세 화면·로그아웃).
function setsSupporterAccentCookieV229121(response) {
  return setCookieLinesV229121(response).some((line) => /^\s*ab_sp=/.test(line));
}

// 응답이 로그인 세션(ab_user)을 새로 주거나 지우는지.
function changesUserSessionV229121(response) {
  return setCookieLinesV229121(response).some((line) => /^\s*ab_user=/.test(line));
}

// 셸 화면 HTML 에 포인트 색을 붙인다. 붙일 화면이 아니면 받은 글을 그대로 돌려준다.
function attachSupporterAccentV229121(html = "") {
  const source = String(html || "");
  const htmlTag = source.match(/<html\b[^>]*>/i);
  const bodyTag = source.match(/<body\b[^>]*>/i);
  const headEnd = source.indexOf("</head>");
  if (!htmlTag || !bodyTag || headEnd < 0 || headEnd > bodyTag.index) return source;
  if (/\sdata-supporter\s*=/i.test(htmlTag[0]) || source.includes('id="abSupporterAccent"')) return source;
  if (!/\bclass\s*=\s*["'][^"']*\babV22812Shell\b/i.test(bodyTag[0])) return source;
  // 셸이 붙는 로그인 화면(로그인 이름 로그인·가입 폼)·공개 화면·운영 내비 화면은 뺀다.
  if (/\babPageLogin\b/.test(bodyTag[0]) || source.includes('action="/my/local-login"') || source.includes('action="/my/local-signup"')
    || /class=["'][^"']*\bpubHeader\b/i.test(source) || /data-nav-scope="(?:ops|admin)"/.test(source)) return source;
  // 세 화면처럼 셸 CSS 링크 앞에 둔다(셸 링크가 머리의 마지막 스타일로 남는다). 링크가 없으면 </head> 앞.
  const shellLink = `<link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`;
  const linkAt = source.indexOf(shellLink);
  const at = linkAt >= 0 && linkAt < headEnd ? linkAt : headEnd;
  const withHead = source.slice(0, at) + supporterHeadHtml({ viewer: true }) + source.slice(at);
  return withHead.replace(/<html\b[^>]*>/i, (tag) => `${tag.slice(0, -1)} data-supporter="1">`);
}

// 응답 마무리(worker/router.js fetch). 쿠키가 없거나 붙일 화면이 아니면 받은 응답 그대로다.
async function supporterAccentResponseV229121(request, env, response) {
  try {
    if (!(response instanceof Response)) return response;
    const accentCookie = getCookie(request, SUPPORTER_ACCENT_COOKIE_V229121);
    if (!accentCookie) return response;
    // 세션이 바뀌는 응답: 앞사람의 색 쿠키를 지운다(응답이 ab_sp 를 스스로 정했으면 그대로).
    if (changesUserSessionV229121(response)) {
      return setsSupporterAccentCookieV229121(response) ? response : withSetCookie(response, supporterAccentCookieV229121(false));
    }
    if (response.status !== 200 || request?.method !== "GET") return response;
    if (accentCookie !== "1" || !getCookie(request, "ab_user")) return response;
    if (!/^text\/html\b/i.test(response.headers.get("content-type") || "")) return response;
    const url = new URL(request.url);
    if (SUPPORTER_ACCENT_SELF_PATHS_V229121.has(url.pathname) || SUPPORTER_ACCENT_ADMIN_PATH_V229121.test(url.pathname)) return response;
    if (setsSupporterAccentCookieV229121(response)) return response;
    const html = await response.clone().text();
    const changed = attachSupporterAccentV229121(html);
    if (changed === html) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    const vary = (headers.get("vary") || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!vary.some((value) => /^(cookie|\*)$/i.test(value))) vary.push("Cookie");
    headers.set("vary", vary.join(", "));
    return new Response(changed, { status: response.status, statusText: response.statusText, headers });
  } catch (err) {
    rememberOpsEvent({ kind: "supporter_accent_attach_failed", severity: "warn", path: "", method: "GET", detail: safeError(err) });
    return response;
  }
}
// @build:exports-start
export {
  supporterAccentCookieV229121, supporterAccentResponseV229121, withSupporterAccentCookieV229121,
};
// @build:exports-end
