// @build:imports-start
import {
  APP_VERSION, appName, cardPerformanceEnabled, memeCardsEnabled, premiumBetaEnabled,
} from "../public/site-config.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { getAdminSecurityState, verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  countHouseholdTransactions, fetchAdminHouseholds, fetchHouseholdMemberCounts,
  fetchHouseholdMembers, selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { tableCheckPair } from "./settings-audit-pages.js";
import { safeArray } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { inspectKakaoLoginConfig } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  getMySelectedHousehold, householdNotFoundResponse, myAccessStatusResponse,
} from "../my/access-control.js";
import { optionalSupabase } from "../domain/budgets.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function buildProductionOpsAudit(env) {
  const adminSecurity = await getAdminSecurityState(env);
  const adminCredentialReady = !!(adminSecurity.password_hash && adminSecurity.password_salt) || !!env.ADMIN_PASSWORD;
  const kakaoConfig = inspectKakaoLoginConfig(env);
  const envStatus = {
    SUPABASE_URL: !!env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_CREDENTIAL: adminCredentialReady,
    ADMIN_SESSION_SECRET: !!env.ADMIN_SESSION_SECRET,
    USER_SESSION_SECRET: !!env.USER_SESSION_SECRET,
    ADMIN_API_TOKEN: !!env.ADMIN_API_TOKEN,
    MY_IMPORT_TOKEN_SECRET: !!env.MY_IMPORT_TOKEN_SECRET,
    KAKAO_LOGIN_ENABLED: kakaoConfig.enabled,
    KAKAO_REST_API_KEY: kakaoConfig.apiKeyConfigured,
    PUBLIC_BASE_URL: !!kakaoConfig.publicBase && !kakaoConfig.issues.includes("public_base_url_invalid"),
    KAKAO_REDIRECT_URI: !!kakaoConfig.redirectUri && !kakaoConfig.issues.includes("redirect_uri_invalid") && !kakaoConfig.issues.includes("redirect_origin_mismatch"),
    KAKAO_CLIENT_SECRET: kakaoConfig.clientSecretConfigured,
    KAKAO_CONFIG_READY: kakaoConfig.ready,
  };
  const households = await optionalSupabase(env, "/rest/v1/households?select=id,name&limit=50", { method: "GET" }, []);
  const tablePairs = {
    households: await tableCheckPair(env, "households"),
    transactions: await tableCheckPair(env, "transactions"),
    household_members: await tableCheckPair(env, "household_members"),
    accountbook_categories: await tableCheckPair(env, "accountbook_categories"),
    accountbook_settings: await tableCheckPair(env, "accountbook_settings"),
    accountbook_user_identities: await tableCheckPair(env, "accountbook_user_identities"),
    accountbook_user_security: await tableCheckPair(env, "accountbook_user_security"),
    accountbook_admin_security: await tableCheckPair(env, "accountbook_admin_security"),
    accountbook_auth_attempts: await tableCheckPair(env, "accountbook_auth_attempts"),
    accountbook_transaction_audit: await tableCheckPair(env, "accountbook_transaction_audit"),
  };
  const requiredEnvOk = !!(envStatus.SUPABASE_URL && envStatus.SUPABASE_SERVICE_ROLE_KEY && envStatus.ADMIN_CREDENTIAL && envStatus.ADMIN_SESSION_SECRET && envStatus.USER_SESSION_SECRET && envStatus.ADMIN_API_TOKEN && envStatus.MY_IMPORT_TOKEN_SECRET);
  const kakaoConfigOk = !kakaoConfig.enabled || kakaoConfig.ready;
  const userSessionOk = !!(envStatus.USER_SESSION_SECRET && envStatus.ADMIN_SESSION_SECRET);
  const dbOk = Object.values(tablePairs).every((pair) => !!pair[0]);
  const backupRoutes = ["/backup", "/backup/preview", "/backup/compare", "/backup/select", "/backup/final-check", "/backup/apply", "/backup/import-history", "/backup/rollback-candidates", "/backup/rollback-final-check"];
  const uiRoutes = ["/menu", "/app", "/?legacy=1", "/?legacy=1&tab=transactions", "/households", "/categories", "/smart-tools", "/reports", "/settlement-summary", "/payment-methods", "/settings", "/diagnostics", "/ui-audit", "/route-audit", "/nav-audit", "/operation-center", "/ops-audit", "/final-release", "/feature-map", "/deploy-runbook"];
  return {
    version: APP_VERSION,
    generated_at: new Date().toISOString(),
    ok: requiredEnvOk && dbOk && kakaoConfigOk,
    envStatus,
    kakaoConfig,
    tablePairs,
    households_count: households.length,
    checks: [
      ["필수 환경변수", requiredEnvOk, requiredEnvOk ? "DB·관리자 인증·세션·API·가져오기 Secret 설정됨" : "필수 Secret 또는 관리자 인증값 확인 필요"],
      ["세션 Secret", userSessionOk, userSessionOk ? "사용자·관리자 세션 Secret 설정됨" : "USER_SESSION_SECRET / ADMIN_SESSION_SECRET 설정 필요"],
      ["카카오 로그인", kakaoConfigOk, !kakaoConfig.enabled ? "명시적으로 비활성화됨 · 로컬 로그인 사용 가능" : kakaoConfig.ready ? "공개 주소·Redirect URI·앱 키 로컬 설정 일치" : `설정 불일치로 로그인 버튼 자동 차단: ${kakaoConfig.issues.join(", ")}`],
      ["DB 연결", dbOk, dbOk ? "주요 테이블 접근 가능" : "Supabase 테이블/권한 확인 필요"],
      ["기본 가계부", households.length > 0, households.length ? `${households.length}개` : "운영 전 /households에서 생성 필요"],
      ["UI 단일 메뉴", true, "통합메뉴 + 상단 탭 중복 숨김 유지"],
      ["모바일 운영", true, "/app 기본 최근 10건 + 조건 필터"],
      ["백업/복구 안전장치", true, "백업→미리보기→비교→후보→최종확인→적용→이력"],
      ["되돌리기 안전장치", true, "후보→최종확인까지 제공, 실제 삭제는 별도 안전 단계 권장"],
      ["운영 헤더", true, "nosniff / same-origin referrer / frame deny 적용"],
      ["공개 무료 기능", premiumBetaEnabled(env), "반복 거래·정산·리포트·스마트 분석 무료 제공"],
      ["미완성 기능 숨김", !memeCardsEnabled(env) && !cardPerformanceEnabled(env), "소비 카드/밈·카드 실적/혜택 기본 비노출"],
      ["최종 배포판", true, "/final-release, /feature-map, /deploy-runbook"],
    ],
    uiRoutes,
    backupRoutes,
  };
}

function renderOpsAuditRows(rows = []) {
  return rows.map(([name, ok, detail]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><span class="${ok ? "okb" : "badb"}">${ok ? "정상" : "확인필요"}</span></td><td>${escapeHtml(detail || "")}</td></tr>`).join("");
}

function renderOpsRouteLinks(routes = []) {
  return routes.map((href) => `<a class="routeLink" href="${escapeHtml(href)}">${escapeHtml(href)}</a>`).join("");
}

async function handleProductionOpsAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const audit = await buildProductionOpsAudit(env);
  const tableRows = Object.entries(audit.tablePairs).map(([name, pair]) => `<tr><td>${escapeHtml(name)}</td><td><span class="${pair[0] ? "okb" : "badb"}">${pair[0] ? "정상" : "확인필요"}</span></td><td>${escapeHtml(pair[1] || "")}</td></tr>`).join("");
  const kakaoEnv = new Set(["KAKAO_LOGIN_ENABLED", "KAKAO_REST_API_KEY", "PUBLIC_BASE_URL", "KAKAO_REDIRECT_URI", "KAKAO_CLIENT_SECRET", "KAKAO_CONFIG_READY"]);
  const envRows = Object.entries(audit.envStatus).map(([name, ok]) => {
    if (!kakaoEnv.has(name)) return `<tr><td>${escapeHtml(name)}</td><td><span class="${ok ? "okb" : "badb"}">${ok ? "설정됨" : "미설정"}</span></td><td>운영 필수</td></tr>`;
    if (!audit.kakaoConfig.enabled) return `<tr><td>${escapeHtml(name)}</td><td><span class="okb">비활성</span></td><td>카카오 로그인 기능을 켤 때 설정</td></tr>`;
    const optionalSecret = name === "KAKAO_CLIENT_SECRET" && !audit.kakaoConfig.clientSecretRequired;
    const acceptable = ok || optionalSecret;
    return `<tr><td>${escapeHtml(name)}</td><td><span class="${acceptable ? "okb" : "badb"}">${ok ? "설정됨" : optionalSecret ? "선택" : "확인필요"}</span></td><td>${optionalSecret ? "카카오 앱에서 Client Secret을 켠 경우 필수" : "카카오 로그인 사용 시 필수"}</td></tr>`;
  }).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>배포운영 점검</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055);overflow:hidden}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.okb,.badb{border-radius:999px;padding:5px 9px;font-weight:1000;font-size:12px}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:760px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.routeGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.routeLink{display:block;text-decoration:none;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:10px;font-weight:900;overflow-wrap:anywhere}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a}@media(max-width:720px){.wrap{padding:12px}.hero h1{font-size:24px}.card{padding:14px}table{min-width:680px}.readableTrendGrid{grid-template-columns:repeat(3,1fr)}.weekdayTrendGrid{grid-template-columns:repeat(2,1fr)}}</style></head><body>${renderUnifiedNav("ops-audit")}<main class="wrap"><section class="hero"><h1>배포운영 점검</h1><p>실제 운영 배포 전후로 환경변수, DB 연결, 메뉴/모바일/백업 안전 흐름을 한 화면에서 확인합니다.</p><p class="note">버전: ${escapeHtml(audit.version)}</p><p><a class="btn light" href="/menu">통합메뉴</a></p></section><section class="grid"><div class="metric"><span>운영 상태</span><b>${audit.ok ? "정상" : "확인필요"}</b></div><div class="metric"><span>가계부</span><b>${numberWithCommas(audit.households_count)}개</b></div><div class="metric"><span>UI 경로</span><b>${numberWithCommas(audit.uiRoutes.length)}개</b></div><div class="metric"><span>백업 경로</span><b>${numberWithCommas(audit.backupRoutes.length)}개</b></div></section><section class="card"><h2>운영 체크</h2><div class="tableWrap"><table><thead><tr><th>항목</th><th>상태</th><th>상세</th></tr></thead><tbody>${renderOpsAuditRows(audit.checks)}</tbody></table></div></section><section class="card"><h2>환경변수</h2><div class="tableWrap"><table><thead><tr><th>항목</th><th>상태</th><th>비고</th></tr></thead><tbody>${envRows}</tbody></table></div></section><section class="card"><h2>DB 연결</h2><div class="tableWrap"><table><thead><tr><th>항목</th><th>상태</th><th>상세</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="card"><h2>운영 주요 경로</h2><div class="routeGrid">${renderOpsRouteLinks(audit.uiRoutes)}</div></section><section class="card"><h2>백업/복구 안전 경로</h2><p class="warnBox">실제 저장/삭제 기능은 반드시 백업, 후보 선택, 비밀번호 재확인, 확인 문구, 결과 리포트를 거치는 흐름으로 운영하세요.</p><div class="routeGrid">${renderOpsRouteLinks(audit.backupRoutes)}</div></section></main></body></html>`);
}

async function handleDiagnosticsPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const adminSecurity = await getAdminSecurityState(env);
  const kakaoConfig = inspectKakaoLoginConfig(env);
  const envStatus = [
    ["SUPABASE_URL", !!env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", !!env.SUPABASE_SERVICE_ROLE_KEY],
    ["ADMIN_CREDENTIAL", !!(adminSecurity.password_hash && adminSecurity.password_salt) || !!env.ADMIN_PASSWORD],
    ["ADMIN_SESSION_SECRET", !!env.ADMIN_SESSION_SECRET],
    ["USER_SESSION_SECRET", !!env.USER_SESSION_SECRET],
    ["ADMIN_API_TOKEN", !!env.ADMIN_API_TOKEN],
    ["MY_IMPORT_TOKEN_SECRET", !!env.MY_IMPORT_TOKEN_SECRET],
    ["KAKAO_LOGIN_CONFIG", !kakaoConfig.enabled || kakaoConfig.ready],
  ];
  const households = await optionalSupabase(env, "/rest/v1/households?select=id,name&limit=50", { method: "GET" }, []);
  const checks = [
    ["기본 가계부", households.length > 0, households.length ? `${households.length}개` : "가계부가 없습니다"],
    ["거래 테이블", ...(await tableCheckPair(env, "transactions"))],
    ["참여자 테이블", ...(await tableCheckPair(env, "household_members"))],
    ["분류 설정 테이블", ...(await tableCheckPair(env, "accountbook_categories"))],
    ["예산 테이블", ...(await tableCheckPair(env, "accountbook_budgets"))],
    ["고정지출 테이블", ...(await tableCheckPair(env, "accountbook_recurring"))],
    ["설정 테이블", ...(await tableCheckPair(env, "accountbook_settings"))],
    ["로그인 식별정보 테이블", ...(await tableCheckPair(env, "accountbook_user_identities"))],
    ["사용자 세션 보안 테이블", ...(await tableCheckPair(env, "accountbook_user_security"))],
    ["관리자 보안 테이블", ...(await tableCheckPair(env, "accountbook_admin_security"))],
    ["인증 제한 테이블", ...(await tableCheckPair(env, "accountbook_auth_attempts"))],
    ["거래 변경 감사 테이블", ...(await tableCheckPair(env, "accountbook_transaction_audit"))],
    ["카카오 로그인", !kakaoConfig.enabled || kakaoConfig.ready, !kakaoConfig.enabled ? "명시적으로 비활성화됨" : kakaoConfig.ready ? "공개 주소·Redirect URI·앱 키 로컬 설정 일치" : `설정 불일치로 버튼 자동 차단: ${kakaoConfig.issues.join(", ")}`],
    ["소비 카드/밈 숨김", !memeCardsEnabled(env), "미완성 상태: 메뉴·공유·직접 URL 404"],
    ["카드 실적/혜택 숨김", !cardPerformanceEnabled(env), "미완성 상태: 메뉴·직접 URL 404"],
    ["무료 스마트 도구", premiumBetaEnabled(env), "/smart-tools · 월말예측·반복지출·이상지출"],
    ["UI 안정화", true, "모바일·데스크톱 주요 화면과 빠른입력 유지"],
    ["배포운영 점검", true, "/ops-audit"],
    ["최종 배포판", true, "/final-release, /feature-map, /deploy-runbook"],
  ];
  return htmlResponse(renderDiagnosticsHtml({ envStatus, checks, households }));
}

function renderDiagnosticsHtml({ envStatus, checks, households }) {
  const row = (name, ok, detail) => `<tr><td>${escapeHtml(name)}</td><td><span class="${ok ? "okb" : "badb"}">${ok ? "정상" : "확인필요"}</span></td><td>${escapeHtml(detail || "")}</td></tr>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>진단 · 가계부</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{width:100%;max-width:1100px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center}.btn{display:inline-flex;align-items:center;justify-content:center;height:38px;border-radius:12px;background:#111827;color:#fff!important;text-decoration:none;font-weight:900;padding:0 12px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:14px 0;box-shadow:0 8px 24px rgba(15,23,42,.055)}table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:14px}.okb,.badb{border-radius:999px;padding:5px 9px;font-weight:900;font-size:12px}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.link{display:block;border:1px solid #e5e7eb;border-radius:16px;padding:13px;text-decoration:none;color:#111827;background:#f8fafc;font-weight:900}</style></head><body>${renderUnifiedNav("diagnostics")}<main class="wrap"><div class="top"><div><h1>시스템진단</h1><p>운영 서버와 Supabase 연결 상태를 화면에서 확인합니다. 민감한 키 값은 표시하지 않습니다.</p></div><a class="btn" href="/?legacy=1">관리자 홈</a></div><section class="card"><h2>환경변수</h2><table><tbody>${envStatus.map(([k, ok]) => row(k, ok, ok ? "설정됨" : "미설정")).join("")}</tbody></table></section><section class="card"><h2>DB/기능 테이블</h2><table><tbody>${checks.map((c) => row(c[0], c[1], c[2])).join("")}</tbody></table><p>확인필요 항목이 보이면 운영센터에서 상태를 확인한 뒤 관리자에게 점검을 요청하세요.</p></section><section class="card"><h2>주요 화면 바로가기</h2><div class="grid"><a class="link" href="/app">모바일 앱</a><a class="link" href="/?legacy=1">관리자 홈</a><a class="link" href="/?legacy=1&tab=import">파일 업로드</a><a class="link" href="/households">가계부·참여자</a><a class="link" href="/categories">분류 설정</a><a class="link" href="/budgets">예산 관리</a><a class="link" href="/smart-tools">무료 스마트 도구</a><a class="link" href="/payment-methods">결제수단</a><a class="link" href="/final-release">최종 배포판</a><a class="link" href="/feature-map">기능맵</a><a class="link" href="/deploy-runbook">배포 런북</a><a class="link" href="/kakao-recent">카카오 저장 확인</a><a class="link" href="/ledger">기록 관리</a><a class="link" href="/ops-audit">배포운영 점검</a><a class="link" href="/health">Health</a></div></section><section class="card"><h2>가계부 목록</h2><table><tbody>${households.map((h) => `<tr><td>${escapeHtml(h.name || "")}</td><td>${escapeHtml(h.id || "")}</td></tr>`).join("") || `<tr><td colspan="2">가계부가 없습니다. /households에서 생성하세요.</td></tr>`}</tbody></table></section></main></body></html>`;
}

function userHouseholdRoleLabel(role = "") {
  const map = { owner: "소유자", admin: "관리자", member: "구성원", viewer: "조회전용", pending: "승인대기", blocked: "차단" };
  return map[String(role || "").trim()] || String(role || "구성원");
}

function identityTypeLabel(userKey = "") {
  const key = String(userKey || "");
  if (key.startsWith("kakao_login:")) return "카카오 웹 로그인";
  if (key.startsWith("local_web:")) return "백업 로그인";
  if (key.startsWith("app_user:")) return "카카오 앱 사용자";
  if (key.startsWith("plusfriend:")) return "카카오 채널 사용자";
  if (key.startsWith("merged:")) return "통합된 이전 계정";
  return "카카오 챗봇 사용자";
}

async function handleHouseholdUserPage(request, env, url, userId) {
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  // V22.9.37 감사 H9: 없는 가계부 id 는 첫 가계부로 바꾸지 않고 찾을 수 없다고 알린다.
  if (access.invalidRequested) return householdNotFoundResponse({ env, user, requestedId: access.invalidRequested });
  const households = access.households;
  const selected = access.selected;
  const householdId = selected?.id || "";
  const members = selected ? await fetchHouseholdMembers(env, selected.id) : [];
  const counts = Object.create(null);
  for (const h of households) counts[h.id] = await countHouseholdTransactions(env, h.id);
  const canManage = ["owner", "admin"].includes(String(selected?.role || ""));
  const ownerCount = members.filter((m) => String(m.role || "") === "owner").length;
  const msg = url.searchParams.get("msg") || "";
  const rawErr = url.searchParams.get("err") || "";
  const err = rawErr ? formatMessage(rawErr) : "";
  const householdCards = households.map((h) => `<a class="hhCard ${selected?.id === h.id ? "active" : ""}" href="/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}"><b>${escapeHtml(h.name)}</b><span>내 역할 ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))} · 거래 ${numberWithCommas(counts[h.id] || 0)}건</span></a>`).join("") || `<p class="muted">참여 중인 가계부가 없습니다.</p>`;
  const memberCards = members.map((m) => {
    const roleOptions = ["owner", "admin", "member", "viewer", "pending", "blocked"].map((r) => `<option value="${r}"${String(m.role || "") === r ? " selected" : ""}>${userHouseholdRoleLabel(r)}</option>`).join("");
    const identityLabel = identityTypeLabel(m.kakao_user_key || "");
    return `<div class="memberCard"><div class="memberMain"><b>${escapeHtml(m.nickname || "구성원")}</b><span>${escapeHtml(userHouseholdRoleLabel(m.role || "member"))} · ${escapeHtml(identityLabel)}</span></div>${canManage ? `<form method="post" action="/admin/member/nickname" class="miniForm"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><label>표시 이름<input name="nickname" value="${escapeHtml(m.nickname || "")}" placeholder="가계부 안에서 보일 이름"/></label><button type="submit">저장</button></form><form method="post" action="/admin/member/update" class="miniForm roleForm"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><label>역할<select name="role">${roleOptions}</select></label><button type="submit">권한 저장</button></form>` : `<p class="muted">참여자 정보는 관리자 권한에서 수정할 수 있습니다.</p>`}</div>`;
  }).join("") || `<p class="muted">참여자가 없습니다.</p>`;
  const ownerWarning = ownerCount > 1 ? `<div class="error"><b>중복 소유자 ${ownerCount}명 감지</b><br/>같은 사람이 여러 로그인 방식으로 등록됐을 수 있습니다. 거래나 가계부를 삭제하지 말고 관리자 계정 통합 점검을 먼저 실행하세요.${canManage ? ` <a href="/identity-audit?household_id=${encodeURIComponent(householdId)}">계정 통합 점검 열기</a>` : ""}</div>` : "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>가계부·참여자</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:20px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero h1{margin:0;font-size:28px}.hero p{line-height:1.55;color:#dbeafe}.grid{display:grid;grid-template-columns:320px 1fr;gap:12px}.toolGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hhList,.memberList{display:grid;gap:10px}.hhCard{display:block;text-decoration:none;color:#111827;border:1px solid #e5e7eb;background:#fff;border-radius:18px;padding:14px}.hhCard.active{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 3px rgba(37,99,235,.12)}.hhCard b,.memberMain b{display:block;font-size:17px}.hhCard span,.memberMain span,.muted{display:block;color:#64748b;font-size:13px;line-height:1.45;margin-top:4px}.memberCard{display:grid;gap:10px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:18px;padding:14px}.miniForm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.miniForm label{display:grid;gap:5px;color:#475569;font-size:12px;font-weight:1000}.miniForm input,.miniForm select{height:42px;border:1px solid #d1d5db;border-radius:12px;padding:0 10px;font:inherit;background:#fff}.miniForm button,.btn{height:42px;border:0;border-radius:12px;background:#111827;color:#fff;text-decoration:none;padding:0 12px;font-weight:1000}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534;border-radius:14px;padding:10px;margin:10px 0}.error{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:14px;padding:10px;margin:10px 0}.error a{color:#9a3412;font-weight:1000}@media(max-width:760px){.wrap{padding:12px 10px 96px}.grid,.toolGrid{grid-template-columns:1fr}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px}.miniForm{grid-template-columns:1fr}.miniForm input,.miniForm select,.miniForm button{width:100%;min-height:46px;font-size:16px}}</style></head><body>${selected ? renderUnifiedNav("households", { month, householdId, householdName: selected.name, role: String(selected.role || "") }) : ""}<main class="wrap"><section class="hero"><h1>가계부·참여자</h1><p>내가 참여한 가계부만 표시합니다. 참여자 아래의 ‘카카오 챗봇 사용자·웹 로그인’ 표시는 계정 유형이며 초대코드가 아닙니다. 초대코드는 가계부별로 별도 관리되고 기록 저장 때문에 바뀌지 않습니다.</p></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}${ownerWarning}<section class="card"><h2>새 가계부 만들기 / 초대코드 참여</h2><div class="toolGrid"><form method="post" action="/my/create" class="miniForm"><input type="hidden" name="return_to" value="/households"/><label>새 가계부 이름<input name="household_name" placeholder="예: 7월 여행, 모임비" required/></label><button type="submit">새로 만들기</button></form><form method="post" action="/my/join" class="miniForm"><input type="hidden" name="return_to" value="/households"/><label>초대코드<input name="invite_code" placeholder="받은 초대코드" required/></label><button type="submit">참여하기</button></form></div><p class="muted">새 가계부는 이 양식을 제출하거나 카카오톡에서 생성 확인을 완료했을 때만 만들어집니다. 기록 저장이나 화면 조회는 새 가계부를 만들지 않습니다.</p></section><section class="grid"><div class="card"><h2>가계부 목록</h2><div class="hhList">${householdCards}</div></div><div class="card"><h2>참여자 관리</h2><p class="muted">${canManage ? "관리자 권한입니다. 이름과 권한을 수정할 수 있습니다." : "읽기 전용입니다. 관리자에게 권한을 요청하세요."}</p><div class="memberList">${memberCards}</div></div></section></main></body></html>`);
}

async function handleHouseholdAdminPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const selectedId = String(url.searchParams.get("household_id") || "").trim();
  const selected = selectRequestedScopedHousehold(households, selectedId);
  // V22.9.37 감사 H8: 가계부마다 참여자(2회)와 거래 수(1회)를 따로 읽어 16개부터 요청당 DB 호출 예산(50회)을 넘었다.
  // 참여자 수는 한 번에 읽어 메모리에서 세고, 명단은 선택한 가계부만 읽는다.
  const [memberCounts, selectedMembers] = await Promise.all([
    fetchHouseholdMemberCounts(env, households),
    selected ? fetchHouseholdMembers(env, selected.id) : Promise.resolve([]),
  ]);
  const counts = Object.create(null);
  for (const h of households) counts[h.id] = await countHouseholdTransactions(env, h.id);
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  return htmlResponse(renderHouseholdAdminHtml({ env, households, memberCounts, selectedMembers, selected, counts, msg, err }));
}

function renderHouseholdAdminHtml({ env, households, memberCounts = {}, selectedMembers = [], selected, counts = {}, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${title} · 가계부·참여자</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-size:14px}.top{height:58px;background:#fff;border-bottom:1px solid #e5e8eb;display:flex;align-items:center;justify-content:space-between;padding:0 22px;position:sticky;top:0}.logo{font-weight:1000;color:#1d4ed8;font-size:18px;text-decoration:none}.wrap{max-width:1220px;margin:18px auto;padding:0 16px}.grid{display:grid;grid-template-columns:360px 1fr;gap:18px}.card{background:#fff;border:1px solid #e5e8eb;border-radius:16px;padding:18px;box-shadow:0 4px 16px rgba(15,23,42,.055)}.list{display:grid;gap:8px}.hh{display:block;text-decoration:none;color:#1f2937;border:1px solid #e5e8eb;border-radius:14px;padding:12px;background:#fff}.hh.active{border-color:#1d4ed8;background:#eff6ff}.hh b{display:block}.muted{color:#667085;font-size:12px}.row{display:grid;gap:8px;margin:12px 0}.row label{font-size:12px;font-weight:900;color:#4b5563}.row input{height:40px;border:1px solid #d1d5db;border-radius:10px;padding:0 10px;font:inherit}.btn{display:inline-flex;align-items:center;justify-content:center;height:38px;border-radius:10px;border:1px solid #d1d5db;background:#fff;color:#334155;text-decoration:none;font-weight:900;padding:0 12px;cursor:pointer}.primary{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.danger{background:#fee2e2;color:#991b1b;border:0}.ok{background:#e8f1e9;color:#365b41;border:1px solid #c9decf;border-radius:12px;padding:10px;margin-bottom:12px}.error{background:#f7e8e4;color:#8f463d;border:1px solid #e7c4bd;border-radius:12px;padding:10px;margin-bottom:12px}.members{width:100%;border-collapse:collapse}.members th,.members td{border-bottom:1px solid #e5e8eb;padding:10px;text-align:left}.codeBox{display:inline-flex;gap:8px;align-items:center;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:10px 12px;font-weight:900}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:11px;margin:12px 0}@media(max-width:860px){.grid{grid-template-columns:1fr}}</style></head>
<body>${renderUnifiedNav("households")}<header class="top"><a class="logo" href="/manage">가계부·참여자</a><div><a class="btn primary" href="/?legacy=1">관리자 홈</a> <a class="btn" href="/settings">설정</a> <a class="btn" href="/ledger?all=1">기록 관리</a> <a class="btn" href="/households">가계부·참여자</a> <a class="btn" href="/?legacy=1">기존관리</a> <a class="btn" href="/app">모바일 입력</a></div></header><main class="wrap">
${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}
<section class="grid"><aside class="card"><h2>가계부 목록</h2><div class="list">${households.map((h) => `<a class="hh ${selected?.id === h.id ? "active" : ""}" href="/households?household_id=${encodeURIComponent(h.id)}"><b>${escapeHtml(h.name)}</b><span class="muted">참여자 ${memberCounts[h.id] || 0}명 · 거래 ${counts[h.id] || 0}건</span></a>`).join("") || `<div class="muted">가계부가 없습니다.</div>`}</div><hr/><form method="post" action="/admin/household/create"><div class="row"><label>새 가계부 이름</label><input name="name" placeholder="예: 우리집 생활비"/></div><button class="btn primary" type="submit">가계부 추가</button></form></aside>
<section class="card">${selected ? `<h2>${escapeHtml(selected.name)}</h2><form method="post" action="/admin/household/update"><input type="hidden" name="id" value="${escapeHtml(selected.id)}"/><div class="row"><label>가계부 이름 수정</label><input name="name" value="${escapeHtml(selected.name)}"/></div><button class="btn primary" type="submit">이름 저장</button></form><h3>참여자 명단</h3><table class="members"><thead><tr><th>이름</th><th>역할</th><th>참여일</th><th>관리</th></tr></thead><tbody>${selectedMembers.map((m) => `<tr><td><form method="post" action="/admin/member/nickname" style="display:flex;gap:6px"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><input name="nickname" value="${escapeHtml(m.nickname || "구성원")}" style="height:34px;min-width:110px"/><button class="btn" type="submit">저장</button></form></td><td><form method="post" action="/admin/member/update" style="display:flex;gap:6px"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><select name="role" style="height:34px;border:1px solid #d1d5db;border-radius:8px"><option value="pending"${m.role === "pending" ? " selected" : ""}>승인대기</option><option value="member"${m.role === "member" ? " selected" : ""}>구성원</option><option value="viewer"${m.role === "viewer" ? " selected" : ""}>조회만</option><option value="blocked"${m.role === "blocked" ? " selected" : ""}>제한</option><option value="owner"${m.role === "owner" ? " selected" : ""}>관리자</option></select><button class="btn primary" type="submit">${m.role === "pending" ? "승인" : "권한저장"}</button></form></td><td>${escapeHtml(String(m.created_at || "").slice(0, 10))}</td><td><form method="post" action="/admin/member/remove" onsubmit="return confirm('이 참여자를 방출할까요?')" style="margin-top:6px"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><button class="btn danger" type="submit">방출</button></form></td></tr>`).join("") || `<tr><td colspan="4">참여자가 없습니다.</td></tr>`}</tbody></table><h3>초대 코드</h3><p class="muted">초대 코드는 이 관리 화면에서만 표시합니다. 새 참여자는 승인대기 상태로 들어오며, 관리자가 구성원으로 승인해야 정상 사용합니다. 이름 저장은 이 가계부의 표시명만 바꾸며 로그인 식별정보에는 영향을 주지 않습니다.</p><div class="codeBox">가계부 참여 ${escapeHtml(selected.invite_code || "")}</div><form method="post" action="/admin/household/regenerate" onsubmit="return confirm('초대코드를 새로 만들까요? 기존 초대코드는 더 이상 사용할 수 없습니다.')" style="margin-top:10px"><input type="hidden" name="id" value="${escapeHtml(selected.id)}"/><button class="btn" type="submit">초대코드 재발급</button></form><h3>위험 구역</h3><div class="warn">삭제하면 이 가계부의 거래내역과 참여자 연결이 함께 삭제됩니다. 복구할 수 없습니다.</div><form method="post" action="/admin/household/delete" onsubmit="return confirm('정말 삭제할까요? 거래내역도 함께 삭제됩니다.')"><input type="hidden" name="id" value="${escapeHtml(selected.id)}"/><div class="row"><label>삭제하려면 아래에 '삭제' 입력</label><input name="confirm_text" placeholder="삭제"/></div><button class="btn danger" type="submit">가계부 삭제</button></form>` : `<h2>가계부를 선택하세요</h2>`}</section></section></main></body></html>`;
}

function maskKey(value = "") {
  const s = String(value || "");
  if (!s) return "-";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function safeNavMonth(month) {
  return validMonth(String(month || "")) || currentMonthKst();
}

function safeNavHouseholdId(householdId) {
  return String(householdId || "").trim();
}

function buildNavMonthSummary(rows = [], month = "") {
  const days = new Set();
  for (const row of safeArray(rows)) {
    const date = String(row.transaction_date || "").slice(0, 10);
    if (date && date.slice(0, 7) === month) days.add(Number(date.slice(8, 10)));
  }
  return Array.from(days).filter((day) => day >= 1 && day <= 31).sort((a, b) => a - b);
}

function renderNavMiniCalendar(month = "", householdId = "", rows = []) {
  const activeDays = buildNavMonthSummary(rows, safeNavMonth(month)).join(",");
  return `<section class="abNavCalendar" data-ab-nav-calendar data-month="${escapeHtml(safeNavMonth(month))}" data-household-id="${escapeHtml(householdId)}" data-active-days="${escapeHtml(activeDays)}"></section>`;
}
// @build:exports-start
export {
  buildProductionOpsAudit, handleDiagnosticsPage, handleHouseholdAdminPage, handleHouseholdUserPage,
  handleProductionOpsAuditPage, identityTypeLabel, maskKey, renderNavMiniCalendar,
  safeNavHouseholdId, safeNavMonth, userHouseholdRoleLabel,
};
// @build:exports-end
