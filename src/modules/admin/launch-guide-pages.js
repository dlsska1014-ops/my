// @build:imports-start
import { boundedRuntimeNumber, skillIpGuardLimit } from "../runtime/ops-telemetry.js";
import {
  APP_VERSION, DEFAULT_PUBLIC_BASE_URL, appName, currentRequestBaseUrl, normalizeBaseUrl,
  publicBaseUrl,
} from "../public/site-config.js";
import { htmlResponse } from "../runtime/http.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { inspectKakaoLoginConfig } from "../auth/user-session.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function renderDomainStatusRows(env = {}, url = null) {
  const requestBase = currentRequestBaseUrl(url);
  const publicBase = publicBaseUrl(env, url);
  const canonicalOn = String(env.CANONICAL_REDIRECT || "").trim() === "1";
  const hasPublic = !!normalizeBaseUrl(env.PUBLIC_BASE_URL || env.SERVICE_BASE_URL || env.APP_BASE_URL || env.CANONICAL_BASE_URL || "");
  const loginConfig = inspectKakaoLoginConfig(env);
  const rows = [
    ["현재 접속 주소", requestBase || "확인 불가", requestBase.includes("workers.dev") ? "교체 권장" : "정상"],
    ["공개 기준 주소", publicBase || "미설정", hasPublic ? "설정됨" : "기본 공개 주소 사용"],
    ["PUBLIC_BASE_URL", env.PUBLIC_BASE_URL ? "설정됨" : "미설정", env.PUBLIC_BASE_URL ? "정상" : "권장"],
    ["SERVICE_BASE_URL/APP_BASE_URL", (env.SERVICE_BASE_URL || env.APP_BASE_URL || env.CANONICAL_BASE_URL) ? "보조 설정 있음" : "미설정", "선택"],
    ["CANONICAL_REDIRECT", canonicalOn ? "1" : "꺼짐", canonicalOn ? "다른 호스트의 GET → 공개 주소 308 (POST 유지)" : "안전 기본값"],
    ["Skill URL", `${publicBase}/skill`, publicBase.includes("workers.dev") ? "교체 필요" : "공개 가능"],
    ["KAKAO_REDIRECT_URI", loginConfig.redirectUri || "미설정", loginConfig.redirectUri && !loginConfig.issues.some((issue) => issue.startsWith("redirect_")) ? "설정됨" : "확인 필요"],
    ["카카오 로그인 설정", loginConfig.ready ? "사용 가능" : loginConfig.enabled ? "설정 확인 필요" : "꺼짐", loginConfig.issues.join(", ") || "설정 오류 없음"],
  ];
  return rows.map(([a,b,c]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td><td><span class="badge">${escapeHtml(c)}</span></td></tr>`).join("");
}

function renderFinalCandidateRows(env = {}, url = null) {
  const publicBase = publicBaseUrl(env, url);
  const rows = [
    ["앱 버전", APP_VERSION, "확인"],
    ["공개 주소", publicBase, publicBase.includes("workers.dev") ? "교체 권장" : "확인"],
    ["카카오 Skill", `${publicBase}/skill`, "OpenBuilder 연결"],
    ["신규 그룹 챗봇", "/group-chatbot-launch", "새 시나리오/블록 제작 기준"],
    ["카카오 Redirect URI", `${publicBase}/auth/kakao/callback`, "Developers 등록"],
    ["개인 주소 제거", "/personal-url-audit", "개인 계정명/개인 URL 점검"],
    ["사용자 홈", `${publicBase}/my`, "심사/베타 시작 URL"],
    ["사업자 푸터", "도담 네트워크 / 729-24-02288", "하단 노출"],
    ["가계부 생성·참여", "/my/households", "실사용 필수"],
    ["빠른입력 분류", "V20.7.2 보정 유지", "실사용 QA"],
    ["중복/트래픽 방어", "V20.2 보정 유지", "운영 안전"],
    ["운영센터", "/operation-center", "관리자 전용"],
    ["미완성 기능", "소비 카드/밈·카드 실적/혜택", "운영 비노출"],
  ];
  return rows.map(([a,b,c]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td><td><span class="badge">${escapeHtml(c)}</span></td></tr>`).join("");
}

async function handleDomainMigrationGuidePage(request, env, url) {
  const publicBase = publicBaseUrl(env, url);
  const requestBase = currentRequestBaseUrl(url);
  const migrationBase = DEFAULT_PUBLIC_BASE_URL;
  const rows = renderDomainStatusRows(env, url);
  const title = escapeHtml(appName(env));
  const sample = [
    "# Cloudflare Workers > Settings > Variables",
    "PUBLIC_BASE_URL=https://malhaebook.com",
    "KAKAO_REDIRECT_URI=https://malhaebook.com/auth/kakao/callback",
    "APP_NAME=말해가계부",
    "# 커스텀 도메인 연결 후에만 선택",
    "CANONICAL_REDIRECT=1",
    "",
    "# Kakao Developers",
    `Web domain: ${migrationBase}`,
    `Redirect URI: ${migrationBase}/auth/kakao/callback`,
    "",
    "# Kakao OpenBuilder Skill URL",
    `${migrationBase}/skill`,
  ].join("\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 도메인 이전 점검</title><style>${releaseCandidateDomainStyle()}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>도메인 이전 점검</h1><p>기존 workers.dev 주소가 심사·사용자 화면에 노출되지 않도록 공개 기준 주소를 환경변수로 분리합니다.</p><p><a class="btn light" href="/beta-release-candidate">V21 최종 후보</a><a class="btn light" href="/operation-center">운영센터</a></p></section><section class="card"><h2>현재 도메인 상태</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>권장 적용 순서</h2><ol><li>Cloudflare Workers에 커스텀 도메인을 연결합니다.</li><li>Kakao Developers에 새 Web domain과 Redirect URI를 먼저 추가합니다.</li><li>Worker 환경변수 <b>PUBLIC_BASE_URL</b>과 <b>KAKAO_REDIRECT_URI</b>를 새 주소로 함께 바꾸고 <b>APP_NAME=말해가계부</b>를 설정합니다.</li><li>OpenBuilder Skill URL을 새 주소의 <b>/skill</b>로 바꿉니다.</li><li>새 주소에서 /my, /skill, /auth/kakao/callback, /privacy, /terms를 확인합니다.</li><li>완전히 확인한 뒤 <b>CANONICAL_REDIRECT=1</b>로 workers.dev 접속을 새 주소로 보냅니다.</li></ol></section><section class="card"><h2>복사용 설정</h2><pre>${escapeHtml(sample)}</pre><p class="note">현재 접속 주소: ${escapeHtml(requestBase)}<br/>공개 기준 주소: ${escapeHtml(publicBase)}</p></section></main></body></html>`);
}

async function handleBetaReleaseCandidateFinalPage(request, env, url) {
  const publicBase = publicBaseUrl(env, url);
  const rows = renderFinalCandidateRows(env, url);
  const domainRows = renderDomainStatusRows(env, url);
  const title = escapeHtml(appName(env));
  const go = [
    ["사용자 홈", `${publicBase}/my`],
    ["가계부 전환·추가", "/my/households"],
    ["빠른입력 QA", "/quick-input-qa"],
    ["실사용 QA", "/real-user-qa"],
    ["도메인 점검", "/domain-migration"],
    ["신규 그룹 챗봇", "/group-chatbot-launch"],
    ["대량 트래픽", "/group-chatbot-scale"],
    ["개인 주소 점검", "/personal-url-audit"],
    ["카카오 발화", "/openbuilder-final"],
    ["운영 대시보드", "/ops-dashboard"],
  ].map(([label, href]) => `<a class="tile" href="${escapeHtml(href)}"><b>${escapeHtml(label)}</b><span>${escapeHtml(href)}</span></a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · V21 최종 후보 점검</title><style>${releaseCandidateDomainStyle()}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>V21 베타 릴리스 후보 점검</h1><p>실제 베타 오픈 전 주소, 심사 정보, 권한, 입력, 카카오, 미완성 기능 숨김, 운영 메뉴를 한 번에 확인합니다.</p><p><a class="btn light" href="/domain-migration">도메인 이전 점검</a><a class="btn light" href="/release-dry-run">릴리스 드라이런</a><a class="btn light" href="/operation-center">운영센터</a></p></section><section class="card"><h2>최종 후보 핵심 체크</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>도메인/카카오 주소 체크</h2><div class="tableWrap"><table><tbody>${domainRows}</tbody></table></div><p class="warn">PUBLIC_BASE_URL을 설정하면 카카오 응답, 오픈빌더 안내, Redirect URI 안내에 새 주소가 우선 표시됩니다. CANONICAL_REDIRECT는 커스텀 도메인 연결 확인 후 켜세요.</p></section><section class="card"><h2>바로 점검</h2><div class="grid">${go}</div></section></main></body></html>`);
}

function launchStatusBadge(ok = true) {
  return ok ? '<span class="badge">준비</span>' : '<span class="badge" style="background:#fee2e2;color:#991b1b">확인 필요</span>';
}

function renderGroupChatbotBlockRows(publicBase = "") {
  const rows = [
    ["봇 입장 블록", "봇이 단톡방에 들어왔을 때 첫 안내", "가계부적은 봇에게 직접 보낸 명령어만 처리합니다. / 도움말 / 가계부 연결"],
    ["도움말 블록", "기본 사용법", "예: 점심 12000 카카오페이 · 요약 · 오늘 기록 · 남은예산 · 초대코드"],
    ["가계부 연결 블록", "그룹방과 가계부 연결", "단톡방 연결 ABC123 / 초대코드 확인 / 가계부 전환"],
    ["기록 저장 블록", "금액·메모·결제수단 기록", "부족한 정보가 있으면 한 가지만 되묻고, 같은 요청은 중복 저장 방지"],
    ["조회 블록", "오늘/월간/분류별 요약", "그룹방에는 민감한 개인 메모를 과하게 노출하지 않음"],
    ["예산 블록", "남은 예산과 초과 상태", "80%·100%·초과액 증가 기준, 장문 알림 금지"],
    ["미완성 기능 폴백", "소비 카드/카드 실적 요청", "준비 중임을 알리고 기록·요약·분석 명령으로 안내"],
    ["폴백 블록", "알 수 없는 발화", "짧게 재입력 예시 3개만 안내"],
  ];
  return rows.map(([a,b,c]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td><td>${escapeHtml(c)}</td></tr>`).join("");
}

async function handleGroupChatbotLaunchGuidePage(request, env, url) {
  const publicBase = publicBaseUrl(env, url);
  const title = escapeHtml(appName(env));
  const blockRows = renderGroupChatbotBlockRows(publicBase);
  const setupCopy = [
    "# Kakao 챗봇 관리자센터 신규 그룹 챗봇 기준",
    `Skill URL: ${publicBase}/skill`,
    `심사용 첫 화면: ${publicBase}/my`,
    `개인정보처리방침: ${publicBase}/privacy`,
    `이용약관: ${publicBase}/terms`,
    `Redirect URI: ${publicBase}/auth/kakao/callback`,
    "",
    "# 봇 한 줄 설명 후보",
    "모임지출 함께정리",
    "공동가계부 빠른기록",
    "",
    "# 허용 문구",
    "가계부적은 봇에게 직접 보낸 명령어만 처리합니다.",
    "기록 제공을 위해 명령어와 가계부 데이터를 저장하며 보관·삭제 기준은 도움말에서 확인할 수 있습니다.",
    "",
    "# 금지 문구",
    "단톡방 대화를 읽어서 자동 분석합니다.",
    "채팅 내용을 학습해 소비 패턴을 알아냅니다."
  ].join("\n");
  const cards = [
    ["1. 새 시나리오", "기본 시나리오에서 + 시나리오를 만들고, 기존 개인 주소가 들어간 블록은 복사하지 않습니다."],
    ["2. Skill 연결", `${publicBase}/skill 만 연결합니다. 개인 workers 주소나 계정명 링크는 넣지 않습니다.`],
    ["3. 필수 블록", "봇 입장, 도움말, 가계부 연결, 기록 저장, 조회, 예산, 폴백을 먼저 만듭니다."],
    ["4. 그룹 맥락", "두 명 이상이 함께 쓰는 흐름: 초대코드, 모임비 정산, 멤버별 요약, 공동 예산을 우선합니다."],
    ["5. 심사 안전", "광고·구매유도·부적절 표현 없이 전체이용가 문구만 사용합니다."],
    ["6. 운영 분리", "개발 채널과 운영 채널을 분리하고, 운영 배포 전 테스트 방에서만 확인합니다."],
  ].map(([h,p]) => `<div class="tile"><b>${escapeHtml(h)}</b><span>${escapeHtml(p)}</span></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 신규 그룹 챗봇 제작</title><style>${releaseCandidateDomainStyle()}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>신규 그룹 챗봇 제작 기준</h1><p>카카오 챗봇 관리자센터에서 새로 만드는 기준입니다. 기존 기록은 참고하되, 공개 주소는 PUBLIC_BASE_URL 기준으로 시작하고 개인 계정명/개인 URL은 노출하지 않습니다.</p><p><a class="btn light" href="/group-chatbot-scale">대량 트래픽 준비</a><a class="btn light" href="/personal-url-audit">개인 주소 점검</a><a class="btn light" href="/kakao-new-bot-config.json">설정 JSON</a></p></section><section class="card"><h2>바로 복사할 설정</h2><pre>${escapeHtml(setupCopy)}</pre></section><section class="card"><h2>새 시나리오 블록 구성</h2><div class="tableWrap"><table><tbody>${blockRows}</tbody></table></div></section><section class="card"><h2>제작 순서</h2><div class="grid">${cards}</div></section><section class="card"><h2>첫 심사 기준 문구</h2><p class="warn">단톡방 전체 대화를 읽는다는 표현은 쓰지 않습니다. 챗봇에게 직접 전달된 명령어만 처리한다고 설명해야 합니다. 선톡/자동푸시는 별도 심사와 제약이 있으므로 기본 기능으로 약속하지 않습니다.</p></section></main></body></html>`);
}

async function handleGroupChatbotTrafficScalePage(request, env, url) {
  const publicBase = publicBaseUrl(env, url);
  const skillLimit = boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000);
  const trafficLimit = boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000);
  const rows = [
    ["/skill IP 가드", "비활성", "카카오 서버 IP/UA에 사용자가 몰리는 문제를 피하고 botUserKey 단위로 제한"],
    ["사용자별 스킬 제한", `${skillLimit}/분`, "SKILL_RATE_LIMIT 환경변수로 조정"],
    ["스킬 IP 상한", `${skillIpGuardLimit(env)}/분`, "SKILL_IP_GUARD_LIMIT 환경변수로 조정. botUserKey 회전 남용 차단용 상한"],
    ["웹/관리 쓰기 제한", `${trafficLimit}/분`, "TRAFFIC_GUARD_LIMIT 환경변수로 조정"],
    ["중복 저장 방어", `${boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600)}초`, "동일 거래/재전송 방어"],
    ["카카오 재전송 방어", `${boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, 120, 10, 3600)}초`, "같은 요청 재전송 중복 방지"],
    ["반복 발화 방어", `${boundedRuntimeNumber(env.KAKAO_REPEAT_GUARD_SECONDS, 8, 2, 600)}초`, "같은 사용자의 빠른 반복 입력 방지"],
    ["공개 기준 URL", publicBase, publicBase.includes("workers.dev") ? "커스텀 도메인 권장" : "정상"],
    ["운영 스냅샷", "/ops-snapshot.json", "최근 제한/스킬 이벤트 확인"],
  ].map(([a,b,c]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td><td><span class="badge">${escapeHtml(c)}</span></td></tr>`).join("");
  const envCopy = [
    "# 대량 유입 권장값",
    "SKILL_RATE_LIMIT=60",
    "SKILL_IP_GUARD_LIMIT=3000",
    "SKILL_RATE_WINDOW_MS=60000",
    "TRAFFIC_GUARD_LIMIT=240",
    "TRAFFIC_GUARD_WINDOW_MS=60000",
    "DUPLICATE_GUARD_SECONDS=90",
    "KAKAO_RETRY_DEDUP_SECONDS=120",
    "KAKAO_REPEAT_GUARD_SECONDS=8",
    "MY_IMPORT_LIMIT=120",
    "KAKAO_BULK_LIMIT=25",
    "",
    "# 주소 고정",
    "PUBLIC_BASE_URL=https://malhaebook.com",
    "CANONICAL_REDIRECT=1"
  ].join("\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 대량 트래픽 준비</title><style>${releaseCandidateDomainStyle()}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>그룹 챗봇 대량 트래픽 준비</h1><p>그룹 챗봇 승인 이후 유입이 늘어날 것을 전제로, 카카오 스킬 요청은 사용자 키 기준으로 제한하고 웹 쓰기 요청은 기존 중복방어를 유지합니다.</p><p><a class="btn light" href="/ops-dashboard">운영 대시보드</a><a class="btn light" href="/ops-traffic">트래픽 이벤트</a><a class="btn light" href="/skill-ops">스킬 운영</a></p></section><section class="card"><h2>현재 적용 기준</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>Cloudflare 환경변수 권장값</h2><pre>${escapeHtml(envCopy)}</pre></section><section class="card"><h2>운영 원칙</h2><p class="warn">처음 오픈할 때는 기능을 더 늘리지 말고 /skill 저장, 요약, 가계부 연결, 빠른 입력, 중복 방어만 집중 확인합니다. 장애가 생기면 새 기능 추가가 아니라 HOTFIX로만 처리합니다.</p></section></main></body></html>`);
}

function personalUrlAuditRows(env = {}, url = null) {
  const publicBase = publicBaseUrl(env, url);
  const requestBase = currentRequestBaseUrl(url);
  const publicText = `${publicBase} ${requestBase}`.toLowerCase();
  const checks = [
    ["PUBLIC_BASE_URL 설정", !!normalizeBaseUrl(env.PUBLIC_BASE_URL || env.SERVICE_BASE_URL || env.APP_BASE_URL || env.CANONICAL_BASE_URL || ""), "공개 주소 환경변수를 우선 사용"],
    ["개인 계정명 노출", !/(personal-|private-|user-account-|my-worker)/i.test(publicText), "공개 URL/카카오 설정에 개인 계정명 사용 금지"],
    ["개인 이메일 노출", !/@naver\.com|@gmail\.com|@daum\.net/i.test(publicText), "공개 안내 문구에 개인 메일 직접 노출 금지"],
    ["workers.dev 직접 노출", !publicBase.includes("workers.dev"), "심사/사용자 시작 주소는 커스텀 도메인 권장"],
    ["Skill URL", !!publicBase && `${publicBase}/skill`.startsWith("https://"), "OpenBuilder Skill URL은 HTTPS 필수"],
    ["사용자 홈", !!publicBase && `${publicBase}/my`.startsWith("https://"), "심사용 첫 화면"],
  ];
  return checks.map(([name, ok, detail]) => `<tr><th>${escapeHtml(name)}</th><td>${ok ? launchStatusBadge(true) : launchStatusBadge(false)}</td><td>${escapeHtml(detail)}</td></tr>`).join("");
}

async function handlePersonalUrlAuditPage(request, env, url) {
  const publicBase = publicBaseUrl(env, url);
  const requestBase = currentRequestBaseUrl(url);
  const rows = personalUrlAuditRows(env, url);
  const sample = [
    "# 공개 도메인 전환 후 카카오에 넣을 값",
    `Web domain: ${publicBase}`,
    `Redirect URI: ${publicBase}/auth/kakao/callback`,
    `OpenBuilder Skill URL: ${publicBase}/skill`,
    `심사용 첫 화면: ${publicBase}/my`,
    `개인정보처리방침: ${publicBase}/privacy`,
    `이용약관: ${publicBase}/terms`,
    "",
    "# 금지",
    "개인 계정명이 들어간 workers.dev 주소",
    "개인 이메일이 노출되는 공개 안내 문구",
    "이전 테스트 채널의 개인 링크 복사"
  ].join("\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 개인 주소 제거 점검</title><style>${releaseCandidateDomainStyle()}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>개인 주소 제거 점검</h1><p>신규 그룹 챗봇은 기존 개인 계정명/개인 workers 주소를 복사하지 않고 PUBLIC_BASE_URL 기준으로 시작합니다.</p><p><a class="btn light" href="/domain-migration">도메인 이전</a><a class="btn light" href="/group-chatbot-launch">신규 그룹 챗봇</a></p></section><section class="card"><h2>현재 주소 상태</h2><p class="note">현재 접속 주소: ${escapeHtml(requestBase)}<br/>공개 기준 주소: ${escapeHtml(publicBase)}</p><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>카카오 설정 복사용</h2><pre>${escapeHtml(sample)}</pre></section></main></body></html>`);
}

function releaseCandidateDomainStyle() {
  return `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.65}.tag,.badge{display:inline-flex;border-radius:999px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:1000;padding:6px 10px}.hero .tag{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.25)}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:18px}table{width:100%;border-collapse:collapse;background:#fff;min-width:760px}th,td{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;vertical-align:top}th{width:210px;background:#f8fafc}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.tile{display:block;text-decoration:none;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.tile b{display:block}.tile span{display:block;color:#64748b;margin-top:6px;word-break:break-all}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;line-height:1.55}.note{color:#64748b;line-height:1.6}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;border-radius:18px;padding:15px;overflow:auto}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}table{min-width:640px}}`;
}
// @build:exports-start
export {
  handleBetaReleaseCandidateFinalPage, handleDomainMigrationGuidePage,
  handleGroupChatbotLaunchGuidePage, handleGroupChatbotTrafficScalePage, handlePersonalUrlAuditPage,
};
// @build:exports-end
