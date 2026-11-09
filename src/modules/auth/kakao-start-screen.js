// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName, termsNoticeLineHtml } from "../public/site-config.js";
import {
  KAKAO_LOGIN_PROGRESS_TIPS, kakaoLoginProgressClientMain,
} from "../client/legacy-ui-runtime.js";
import { safeError } from "../runtime/leases.js";
import {
  getCookie, htmlResponse, redirectResponse, redirectResponseWithCookies,
} from "../runtime/http.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { inspectKakaoLoginConfig, verifyUserSession } from "./user-session.js";
import { MOBILE_HOME_CSS_ASSET_PATH } from "../assets/asset-registry.js";
import { recordSignupConsent } from "./local-login-pages.js";
import { isKakaoTalkInAppBrowser } from "./kakao-account-link.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.104 L-1 카카오톡 인앱 시작 화면(사용자 2026-11-06 "카카오에서 기록하고 가계부 열면 … 이어열기 누르면 개인정보 관련해서 체크하고 로그인하라고
// 나와. 내가 원하는건 바로 가계부 홈이 나와야하고 개인정보 관련이나 체크 필요한것들은 팝업으로 나와야해").
//  · 카카오톡 인앱 브라우저에서 세션 없이 /my·/app·/m 을 열면 화면 없는 자동 로그인(V22.9.91, kakaoInAppAutoLoginResponse)을 먼저 해 보고, 그게 안 됐거나
//    (주소 auto=0, 쿠키 ab_kakao_auto) 할 수 없을 때 예전의 긴 로그인 화면 대신 이 시작 화면을 그린다. 홈처럼 보이는 빈 미리보기(머리·요약 칸·하단 탭, 데이터 없음)
//    위에 서버가 그린 팝업(스크립트 없이 열린 상태)이 있고, 팝업 안에 ‘카카오로 계속하기’(GET /auth/kakao/start, 화면 있는 보통 로그인) 단추와 그 아래 약관 안내
//    한 줄(V22.9.114, 예전의 동의 체크 칸 자리)이 있다. 시작 화면은 스스로 다른 곳으로 보내지 않는다(되풀이 없음). 자동 로그인 규칙(try·skip·off·auto=0)은 그대로다.
//  · 다른 길: ‘로그인 이름으로 로그인’ = /my?auto=0&login=1(긴 로그인 화면, 로그인 이름 칸을 열어 둔다), ‘웹 연결 코드로 열기’ = /my/kakao-claim?auto=0(1:1 채팅의
//    ‘웹 가계부 열기’ 코드 칸을 열어 둔 긴 로그인 화면). 1:1 채팅이 보내는 주소(/my)는 그대로이고, 그 주소에서 시작 화면 → 이 링크로 코드 칸에 닿는다.
//  · 관리자 쿠키(ab_admin)가 있는 브라우저, 인앱이 아닌 브라우저, 카카오 로그인 설정이 준비되지 않은 서버, login=1 은 예전 로그인 화면 그대로다.
// V22.9.104 L-3 → V22.9.114 약관 안내 띠(사용자 2026-11-09 "팝업을 없애고 안내 띠로 바꿔줘", 앱 심사 담당자 요청): 로그인한 사람 가운데 안내 확인 기록
// (consent:<user_id>, V22.9.95~113 의 동의 기록과 같은 행)이 없는 사람은 홈 맨 위에 닫을 수 있는 얇은 띠를 본다(가리는 팝업 아님). 홈은 DB 를 더 읽지 않고 쿠키
// ab_cs(1 = 기록 있음, 0 = 없음, 없음 = 모름 → 띄우지 않음, 14일)만 본다. 쿠키는 세션을 만들 때(카카오 로그인 콜백·로그인 이름 로그인·웹 연결 코드·가입·단톡방 열기)
// 한 번 읽어 적는다(V22.9.102 ab_bk 와 같은 방식). 읽기에 실패하면 적지 않는다. 띠의 ‘확인’ 은 POST /my/consent(라우터의 같은 출처 검사를 받는다)로 기록을 남기고 띠를 닫는다.
// 법적 성격: 개인정보는 계약 이행 근거(방침 9절) 처리라 동의 대상이 아니고, 약관은 명시 의무만 있어 체크 칸을 강제하지 않는다. 기록은 ‘안내를 본 시각’ 이다.
const CONSENT_STATE_COOKIE = "ab_cs";
const CONSENT_STATE_COOKIE_TAIL = "; Path=/; HttpOnly; Secure; SameSite=Lax";
const KAKAO_START_PATHS = new Set(["/my", "/app", "/m"]);
const TERMS_BAND_DROP_PARAMS = ["msg", "err", "balert", "saved_rid", "saved_qd", "undo", "restore", "quick", "day_detail", "rid"];
const KAKAO_START_NOTICE = "카카오톡에서 기록한 가계부를 바로 열어요.";

function consentStateCookie(known = true) {
  return `${CONSENT_STATE_COOKIE}=${known ? "1" : "0"}; Max-Age=1209600${CONSENT_STATE_COOKIE_TAIL}`;
}

function clearConsentStateCookie() {
  return `${CONSENT_STATE_COOKIE}=; Max-Age=0${CONSENT_STATE_COOKIE_TAIL}`;
}

// true = 기록 있음, false = 없음(띠), null = 모름(쿠키 없음·다른 값, 띠 없음 — 이 판 전에 로그인해 둔 사람).
function consentStateKnown(request) {
  const value = String(getCookie(request, CONSENT_STATE_COOKIE) || "");
  return value === "1" ? true : value === "0" ? false : null;
}

// 안내 확인(동의) 기록 한 번 읽기. 있음 true, 없음 false, 읽지 못함 null(쿠키를 적지 않는다).
async function readSignupConsentState(env, userId = "") {
  const id = String(userId || "").trim();
  if (!id) return null;
  try {
    return Boolean(await getSettingValueStrict(env, `consent:${id}`.slice(0, 180)));
  } catch (err) {
    rememberOpsEvent({ kind: "consent_state_read_failed", severity: "warn", path: "", method: "", detail: safeError(err) });
    return null;
  }
}

// 읽지 못하면(모름) 이 브라우저에 남은 앞 사람의 ab_cs 를 지우는 쿠키를 준다(모름 = 띠 없음, 독립 검토 P3-4).
async function consentStateCookieFor(env, userId = "") {
  const state = await readSignupConsentState(env, userId);
  return state === null ? clearConsentStateCookie() : consentStateCookie(state);
}

// 시작 화면의 팝업 모양. 스크립트 없이 열린 상태로 그리고(고정 덮개), 아래 화면은 눌리지 않는다. 카카오 단추·안내 줄 모양은 로그인 화면과 같다.
// 카드 칸(#abStartCard, 한 화면에 팝업은 하나)의 id 로 범위를 잡아 홈·셸 CSS 의 단추 규칙(.abV2281 button[type=submit] … !important, 파란 채움)과
// 다크 모드 글씨 규칙을 이긴다(카카오 단추는 카카오 노랑). 덮개는 홈의 축하 효과·안내 시트(z-index 11901·12000)보다 위다.
// 주 단추·체크 색은 컬러톤 토큰 var(--ab12-action) 을 따른다(V22.9.14 검사: 주 색 리터럴 금지, 옛 값은 폴백으로만).
const AB_START_MODAL_STYLE = '<style id="abStartModalStyle">.abStartModal{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.58);overflow:auto}#abStartCard{width:min(100%,400px);margin:auto;background:#fff!important;color:#101828!important;border:0!important;border-radius:22px!important;padding:24px 20px 18px;box-shadow:0 24px 60px rgba(15,23,42,.32);text-align:left;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.02em;color-scheme:light}#abStartCard h2{margin:0 0 6px;font-size:21px!important;font-weight:800!important;line-height:1.35;color:#101828!important}#abStartCard .abStartLead{margin:0 0 16px;color:#475467!important;font-size:15px;line-height:1.55}#abStartCard .abStartAlert{margin:0 0 14px;padding:10px 12px;border-radius:12px;background:#fef2f2!important;border:1px solid #fecaca;color:#991b1b!important;font-size:14px;line-height:1.5}#abStartCard form{margin:0;padding:0;border:0;background:none;box-shadow:none}#abStartCard .termsNote{margin:10px 0 0;color:#475467!important;font-size:12.5px;line-height:1.5;text-align:center;overflow-wrap:anywhere}#abStartCard .termsNote a{color:#1d4ed8!important;font-weight:700;text-decoration:underline}#abStartCard .kakaoBtn,#abStartCard .abStartGo{display:flex!important;align-items:center;justify-content:center;gap:10px;width:100%!important;min-height:54px!important;margin:0;padding:0 16px!important;border:0!important;border-radius:12px!important;font:inherit;font-size:16px!important;font-weight:800!important;cursor:pointer;box-shadow:none!important;transform:none!important}#abStartCard .kakaoBtn{background:#fee500!important;color:rgba(0,0,0,.85)!important}#abStartCard .kakaoBtn svg{width:22px;height:22px;fill:#000}#abStartCard .abStartGo{background:var(--ab12-action,#2457d6)!important;color:#fff!important}#abStartCard .abStartAlt{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 18px;margin-top:10px}#abStartCard .abStartAlt a,#abStartCard .abStartAlt button{display:inline-flex!important;align-items:center;width:auto!important;min-height:44px!important;padding:0 2px!important;border:0!important;border-radius:0!important;background:none!important;color:#344054!important;font:inherit;font-size:14px!important;font-weight:700!important;text-decoration:underline!important;box-shadow:none!important;transform:none!important;cursor:pointer}html:has(.abStartModal) body{overflow:hidden}</style>';

// 시작 화면 바탕: 홈 CSS 자산(1년 캐시, 로그인 뒤 홈이 그대로 다시 쓴다)의 홈 칸 이름으로 그린 빈 미리보기. 데이터·링크·입력 칸이 없고(초점이 가지 않는다)
// 화면 읽기에서도 빠진다(aria-hidden·inert).
function kakaoStartPreviewHtml() {
  // 탭은 홈과 같은 모양(a.tab > i + span)이되 주소(href)가 없어 링크가 아니다.
  const tab = (icon, label, extra = "") => `<a class="tab${extra}"><i>${icon}</i><span>${label}</span></a>`;
  return '<div class="abStartPreview" aria-hidden="true" inert><header class="appTop"><div class="topLine"><h1>가계부</h1></div></header><main class="wrap"><section class="homeBudget"><div class="homeBudgetTop"><span>이번 달 남은 예산</span></div><div class="homeBudgetAmount"><b>-</b></div><div class="homeProgress"><i style="width:0%"></i></div><div class="homeBudgetFoot"><span>예산 -</span><span>쓴 돈 -</span></div></section><section class="homeMetrics"><div class="homeMetric"><span>들어온 돈</span><b class="income">-</b></div><div class="homeMetric"><span>나간 돈</span><b class="expense">-</b></div></section><section class="panel"><h2>최근 내역</h2><div class="empty">로그인하면 기록이 보여요</div></section></main><nav class="bottom">'
    + tab("🏠", "홈", " active") + tab("📄", "기록") + tab("＋", "입력", " tabAdd") + tab("📊", "예산") + tab("☰", "전체") + "</nav></div>";
}

// 카카오 로그인 대기 화면(로그인 화면과 같은 id·스크립트, V22.9.102 J-13 의 location.assign 이동 포함). 스크립트가 없으면 폼 제출 그대로다.
function kakaoStartProgressHtml() {
  return '<style>.kakaoProgress{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.62)}.kakaoProgress[hidden]{display:none}.kakaoProgressCard{width:min(100%,380px);background:#fff;color:#101828;border-radius:22px;padding:24px 18px;text-align:center;box-shadow:0 24px 60px rgba(15,23,42,.35)}.kakaoProgressCard h2{margin:14px 0 6px;font-size:20px}.kakaoProgressCard p{margin:0;color:#667085;line-height:1.55;font-size:14px}.kakaoSpinner{width:44px;height:44px;margin:0 auto;border-radius:50%;border:4px solid #fde68a;border-top-color:#f59e0b;animation:kakaoSpin .9s linear infinite}@keyframes kakaoSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.kakaoSpinner{animation-duration:2.4s}}.kakaoTip{margin-top:18px;background:#fffbea;border:1px solid #fde68a;border-radius:14px;padding:13px;text-align:left}.kakaoTip b{display:block;font-size:12px;color:#92400e;margin-bottom:4px}.kakaoTip span{display:block;font-size:14px;line-height:1.55;color:#3f3f46;min-height:44px}.kakaoSlow{margin-top:14px}.kakaoSlow button{min-height:42px;padding:0 16px;margin-top:8px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;color:#101828;font:inherit;font-weight:700}.kakaoProgressOpen body{overflow:hidden}</style>'
    + '<div id="kakaoLoginProgress" class="kakaoProgress" role="alertdialog" aria-modal="true" aria-labelledby="kakaoProgressTitle" aria-describedby="kakaoProgressTip" hidden><div class="kakaoProgressCard"><div class="kakaoSpinner" aria-hidden="true"></div><h2 id="kakaoProgressTitle">로그인 중입니다</h2><p>카카오 인증 화면으로 이동하고 있어요. 잠시만 기다려 주세요.</p><div class="kakaoTip" aria-live="polite"><b>가계부 사용 팁</b><span id="kakaoProgressTip"></span></div><div id="kakaoProgressSlow" class="kakaoSlow" hidden><p>평소보다 오래 걸리고 있어요. 네트워크 상태에 따라 10초 이상 걸릴 수 있습니다.</p><button id="kakaoProgressCancel" type="button">취소하고 다른 방법 선택</button></div></div></div>'
    + `<script id="kakaoLoginProgressRuntime">(${kakaoLoginProgressClientMain.toString()})({overlayId:"kakaoLoginProgress",tipId:"kakaoProgressTip",slowId:"kakaoProgressSlow",cancelId:"kakaoProgressCancel",tips:${JSON.stringify(KAKAO_LOGIN_PROGRESS_TIPS)}});</script>`;
}

// 팝업이 열려 있는 동안 아래 화면(같은 body 의 다른 칸: 미리보기·홈·공지 띠)은 초점·누르기가 가지 않게 inert 로 둔다. 카카오 로그인 대기 화면은 그대로 둔다
// (취소 단추). 팝업 뒤에 붙는 칸까지 잡으려고 문서를 다 읽은 뒤 한 번 돈다. 스크립트가 없어도 덮개가 화면을 가린다.
function modalInertScript(id = "") {
  return `<script>(function(){function f(){var p=document.getElementById(${JSON.stringify(String(id))});if(!p||!p.parentNode)return;for(var n=p.parentNode.firstElementChild;n;n=n.nextElementSibling){if(n!==p&&n.id!=="kakaoLoginProgress"&&n.tagName!=="SCRIPT"&&n.tagName!=="STYLE")n.inert=true;}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",f);else f();})();</script>`;
}

function kakaoStartShellHtml(env, { title = "가계부 열기", body = "" } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><meta name="theme-color" content="#3182f6"/><title>${escapeHtml(appName(env))} · ${escapeHtml(title)}</title><link rel="stylesheet" href="${MOBILE_HOME_CSS_ASSET_PATH}"/>${AB_START_MODAL_STYLE}</head><body class="abKakaoStart">${kakaoStartPreviewHtml()}${body}</body></html>`;
}

function kakaoStartQuery(returnTo = "", extra = {}) {
  const qs = new URLSearchParams({ auto: "0", ...extra });
  if (returnTo) qs.set("return_to", returnTo);
  return qs.toString();
}

// 시작 화면. error(카카오 취소·오류)는 팝업 위에 알린다. 카카오 폼은 로그인 화면과 같은 모양(form.kakaoStart, 숨은 return_to 가 먼저)이라 대기 화면 스크립트가
// 그대로 붙고, 폼 뒤에 약관 안내 한 줄(V22.9.114)이 온다.
function renderKakaoStartHtml(env, { returnTo = "", error = "" } = {}) {
  const back = safeUserReturnPath(returnTo || "", "");
  const alert = error ? `<p class="abStartAlert" role="alert">${escapeHtml(error)}</p>` : "";
  const hidden = back ? `<input type="hidden" name="return_to" value="${escapeHtml(back)}"/>` : "";
  const form = '<form class="kakaoStart" method="get" action="/auth/kakao/start">' + hidden
    + '<button class="kakaoBtn" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c-5.247 0-9.5 3.343-9.5 7.466 0 2.66 1.77 4.995 4.432 6.316l-.9 3.296a.35.35 0 0 0 .532.383l3.917-2.598c.5.06 1.007.09 1.519.09 5.247 0 9.5-3.343 9.5-7.487C21.5 6.843 17.247 3.5 12 3.5Z"/></svg>카카오로 계속하기</button></form>' + termsNoticeLineHtml();
  const alt = `<div class="abStartAlt"><a href="${escapeHtml(`/my?${kakaoStartQuery(back, { login: "1" })}#login-local`)}">로그인 이름으로 로그인</a><a href="${escapeHtml(`/my/kakao-claim?${kakaoStartQuery(back)}#kakao-claim-start`)}">웹 연결 코드로 열기</a></div>`;
  const modal = `<div class="abStartModal" id="abKakaoStart" role="dialog" aria-modal="true" aria-labelledby="abKakaoStartTitle" aria-describedby="abKakaoStartLead"><div class="abStartCard" id="abStartCard"><h2 id="abKakaoStartTitle">카카오 계정으로 가계부 열기</h2><p class="abStartLead" id="abKakaoStartLead">${KAKAO_START_NOTICE}</p>${alert}${form}${alt}</div></div>`;
  return kakaoStartShellHtml(env, { title: "가계부 열기", body: modal + modalInertScript("abKakaoStart") + kakaoStartProgressHtml() });
}

// 시작 화면을 그릴 요청인가: GET /my·/app·/m, 인앱 브라우저, login=1 아님, 관리자 쿠키 없음, 카카오 로그인 준비됨, 로그인 세션 없음.
function kakaoInAppStartEligible(request, env, url) {
  if (String(request?.method || "GET").toUpperCase() !== "GET" || !url || !KAKAO_START_PATHS.has(url.pathname)) return false;
  if (url.searchParams.get("login") === "1" || !isKakaoTalkInAppBrowser(request) || getCookie(request, "ab_admin")) return false;
  return inspectKakaoLoginConfig(env).ready;
}

// /my 는 return_to 를, /app·/m 은 지금 주소(auto·login 뺀)를 돌아갈 곳으로 싣는다(자동 로그인과 같은 512자 한도).
function kakaoStartReturnPath(url) {
  if (url.pathname === "/my") return safeUserReturnPath(url.searchParams.get("return_to") || "", "");
  const qs = new URLSearchParams(url.search);
  qs.delete("auto");
  qs.delete("login");
  const query = qs.toString();
  // /m 은 돌아갈 곳 허용 목록(safeUserReturnPath)에 없어 같은 홈을 그리는 /app 으로 돌아간다(독립 검토 P3-3).
  const path = url.pathname === "/m" ? "/app" : url.pathname;
  const back = safeUserReturnPath(`${path}${query ? `?${query}` : ""}`, "");
  return back.length <= 512 ? back : "";
}

// 라우터가 자동 로그인(kakaoInAppAutoLoginResponse) 바로 다음에 부른다. 자동 로그인을 보낸 요청은 여기 오지 않는다.
async function kakaoInAppStartResponse(request, env, url) {
  if (!kakaoInAppStartEligible(request, env, url)) return null;
  if (await verifyUserSession(request, env)) return null;
  const autoCookie = String(getCookie(request, "ab_kakao_auto") || "");
  rememberOpsEvent({ kind: "kakao_inapp_start_shown", severity: "info", path: url.pathname, method: "GET", detail: url.searchParams.get("auto") === "0" ? "auto=0" : autoCookie ? `cookie=${autoCookie.slice(0, 8)}` : "other" });
  return htmlResponse(renderKakaoStartHtml(env, { returnTo: kakaoStartReturnPath(url) }));
}

// 카카오 로그인 시작·콜백이 로그인 화면으로 되돌리던 자리(카카오 취소·오류). 인앱 브라우저이고 카카오 로그인이 준비된 서버면 시작 화면에
// 같은 말을 띄운다. 그 밖은 예전 로그인 화면 그대로다.
function kakaoStartOrLoginHtml(request, env, { error = "", returnTo = "", authMode = "login" } = {}) {
  if (isKakaoTalkInAppBrowser(request) && inspectKakaoLoginConfig(env).ready) return renderKakaoStartHtml(env, { returnTo, error });
  return renderUserLoginHtml(env, error, returnTo, authMode);
}

// V22.9.114 약관 안내 띠(홈 맨 위, 팝업 대신). 스타일은 띠와 함께 한 번만 실린다(1년 캐시 자산을 건드리지 않는다, 공지·설정 띠와 같은 방식). 닫기 단추는
// class="secondary" 라 셸의 파란 제출 단추 규칙(.abV2281 button[type=submit]:not(.secondary) …)에 걸리지 않고, 띠 자신의 규칙이 모양을 정한다.
const AB_TERMS_BAND_STYLE = '<style id="abTermsBandStyle">.abTermsBand{display:flex;align-items:center;justify-content:center;gap:6px 12px;flex-wrap:wrap;margin:0;padding:9px 16px;background:#eef4ff;color:#1e3a8a;border-bottom:1px solid #c7d7fe;font-size:13.5px;line-height:1.45;text-align:center;word-break:keep-all;overflow-wrap:anywhere}.abTermsBand p{margin:0}.abTermsBand a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px}.abTermsBand a:focus-visible,.abTermsBand button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.abTermsBand form{display:inline-block;margin:0;padding:0;border:0;background:none;box-shadow:none}.abTermsBand button.secondary{display:inline-flex!important;align-items:center;min-height:34px!important;margin:0;padding:4px 14px!important;border:1px solid #93b4fd!important;border-radius:999px!important;background:#fff!important;color:#1e3a8a!important;font:inherit;font-size:13px!important;font-weight:700!important;box-shadow:none!important;transform:none!important;cursor:pointer}html[data-ab-resolved-theme="dark"] .abTermsBand{background:#172554;color:#dbe4ff;border-bottom-color:#2f4a8a}html[data-ab-resolved-theme="dark"] .abTermsBand button.secondary{background:#1e3a8a!important;color:#fff!important;border-color:#3b5bb5!important}</style>';

// 띠 한 조각. 돌아갈 곳은 같은 사이트 주소만(safeUserReturnPath). 링크는 같은 탭(홈으로 돌아오면 띠는 그대로 있다가 ‘확인’ 으로 닫는다).
function termsNoticeBandHtml(returnTo = "") {
  const back = safeUserReturnPath(returnTo || "", "/app");
  return AB_TERMS_BAND_STYLE + '<div class="abTermsBand" id="abTermsBand" role="region" aria-label="이용약관 안내"><p>서비스를 이용하면 <a href="/terms">이용약관</a>에 동의한 것으로 봅니다. <a href="/privacy">개인정보처리방침</a>도 확인해 주세요.</p>'
    + `<form method="post" action="/my/consent"><input type="hidden" name="return_to" value="${escapeHtml(back)}"/><button class="secondary" type="submit" aria-label="이용약관 안내 확인하고 닫기">확인</button></form></div>`;
}

// 홈 응답 마무리(my/mobile-home.js): 로그인 사용자(관리자 세션 아님)이고 쿠키 ab_cs=0 일 때만 띠를 붙인다. 그 밖은 바이트 하나 바꾸지 않는다(홈 HTML 예산).
// 자리: 본문 바로가기 링크 뒤, 없으면 <body> 바로 뒤(공지 띠·설정 띠는 응답 마무리 단계에서 그 앞에 끼어든다 → 공지 → 설정 → 약관 순).
// 돌아갈 곳은 지금 홈 주소에서 한 번만 쓰는 알림 값(msg·err·되돌리기 표 등)을 뺀 것이다.
function withTermsNoticeBandV229114(request, url, eligible, html) {
  if (!eligible || consentStateKnown(request) !== false) return html;
  const source = String(html || "");
  if (!source || source.includes('class="abTermsBand"') || !/<body\b[^>]*>/i.test(source)) return source;
  const qs = new URLSearchParams(url.search);
  for (const key of TERMS_BAND_DROP_PARAMS) qs.delete(key);
  const query = qs.toString();
  const path = url.pathname === "/m" ? "/app" : url.pathname;
  const band = termsNoticeBandHtml(safeUserReturnPath(`${path}${query ? `?${query}` : ""}`, "/app"));
  const skip = /<a class="abSkipLink" href="[^"]*">본문 바로가기<\/a>/;
  if (skip.test(source)) return source.replace(skip, (full) => full + band);
  return source.replace(/<body\b[^>]*>/i, (full) => full + band);
}

// POST /my/consent(띠의 ‘확인’): 로그인 세션이 있어야 하고(없으면 /my), 같은 출처 검사는 라우터가 모든 POST 에 먼저 한다. 체크 칸은 없다(V22.9.114).
// 기록이 이미 있으면 다시 쓰지 않는다(처음 기록의 시각·경로를 지키려고). 기록을 읽지 못했으면(null) 쓰지 않는다(덮어쓰기 저장이라, 독립 검토 P3-2).
// 어느 경우든 ab_cs=1 을 적어 이 브라우저의 띠를 닫고 돌아갈 곳(같은 사이트 주소만)으로 303 — 띠는 안내라 저장 실패가 사람을 막지 않는다.
// 기록이 없거나 못 썼으면 다음 세션을 만들 때 다시 읽어 쿠키를 새로 적으므로 띠가 다시 보인다.
async function handleMyConsent(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const rawBack = safeUserReturnPath(String(form.get("return_to") || ""), "/app");
  const back = rawBack.startsWith("/my/consent") ? "/app" : rawBack;
  const existing = await readSignupConsentState(env, userId);
  const recorded = existing === true ? true : existing === false ? await recordSignupConsent(env, userId, "band") : false;
  const detail = existing === true ? "already" : recorded ? "recorded" : existing === null ? "unread" : "unrecorded";
  rememberOpsEvent({ kind: "terms_notice_closed", severity: recorded ? "info" : "warn", path: "/my/consent", method: "POST", detail });
  return redirectResponseWithCookies(back, [consentStateCookie(true)]);
}
// @build:exports-start
export {
  clearConsentStateCookie, consentStateCookie, consentStateCookieFor, handleMyConsent,
  kakaoInAppStartResponse, kakaoStartOrLoginHtml, readSignupConsentState,
  withTermsNoticeBandV229114,
};
// @build:exports-end
