// @build:imports-start
import { HTML_HEADERS } from "../runtime/config-readiness.js";
import { htmlResponse } from "../runtime/http.js";
import { kakaoDefaultQuickReplies } from "../kakao/response-builders.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.19: 카카오 로그인 대기 팝업(가계부 팁), 카드사별 사용내역 가져오기 안내, 영수증 사진 등록 제거.
// (V22.9.18: 화면을 실제 브라우저로 띄워 재고 고쳤다 — tools/screen-audit.mjs.)
const APP_VERSION = "V22.9.34-AUDIT-FIXES";
const APP_MODE = "asset-dashboard-complete-stability";

const HIDDEN_MEME_PATHS = new Set([
  "/share", "/share/meme", "/share/meme/like", "/share/meme/share", "/share/meme-image",
  "/meme", "/meme-image", "/meme-lab", "/meme-archive", "/meme-rank", "/meme-stats",
  "/meme-card-content", "/meme-card-plan", "/meme-cards", "/meme-content-center", "/meme-library", "/meme-publish-center",
  "/meme-motion-guide", "/nanobanana-prompts", "/meme-animation-guide", "/meme-review-check", "/meme-safety-check", "/meme-policy-check",
  "/meme-share-kit", "/meme-kakao-share-kit", "/meme-share-copy", "/meme-card-catalog.json",
  "/admin/meme/react", "/admin/meme/save", "/admin/meme/delete",
]);
const HIDDEN_CARD_PERFORMANCE_PATHS = new Set(["/card-benefits"]);
const INTERNAL_MEME_OPERATIONS_PATHS = new Set([
  "/meme-card-content", "/meme-card-plan", "/meme-cards", "/meme-content-center", "/meme-library", "/meme-publish-center",
  "/meme-motion-guide", "/nanobanana-prompts", "/meme-animation-guide", "/meme-review-check", "/meme-safety-check", "/meme-policy-check",
  "/meme-share-kit", "/meme-kakao-share-kit", "/meme-share-copy", "/meme-card-catalog.json",
]);

function envFlagEnabled(value, defaultValue = false) {
  const raw = String(value ?? (defaultValue ? "1" : "0")).trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

function incompleteFeatureQaEnabled(env = {}) {
  // 이전 배포에 MEME_CARDS_ENABLED/CARD_PERFORMANCE_ENABLED=1이 남아 있어도
  // 전용 QA 잠금까지 명시적으로 열지 않으면 운영 경로는 계속 404입니다.
  return envFlagEnabled(env.INCOMPLETE_FEATURE_QA_ENABLED, false);
}

function memeCardsEnabled(env = {}) {
  // 미완성 소비 카드/밈 기능은 운영 기본값을 닫습니다. 내부 QA에서 전용 잠금과
  // 기능 플래그를 모두 명시한 경우에만 라우트를 열 수 있습니다.
  return incompleteFeatureQaEnabled(env) && envFlagEnabled(env.MEME_CARDS_ENABLED, false);
}

function cardPerformanceEnabled(env = {}) {
  // 카드 실적·혜택은 조건 데이터 검증이 끝날 때까지 운영 기본값을 닫습니다.
  return incompleteFeatureQaEnabled(env) && envFlagEnabled(env.CARD_PERFORMANCE_ENABLED, false);
}

function premiumBetaEnabled(_env = {}) {
  // V22.7부터 밈·카드실적 QA 잠금 기능을 제외한 스마트 기능은 환경값과
  // 관계없이 무료로 제공합니다. 과거 FREE_FEATURES_ENABLED=0 설정이 남아
  // 있어도 사용자가 다시 유료 안내/차단 화면을 보지 않게 합니다.
  return true;
}

function hiddenFeature404() {
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>페이지를 찾을 수 없습니다</title></head><body><main style="max-width:620px;margin:70px auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif"><h1>페이지를 찾을 수 없습니다.</h1><p style="color:#64748b;line-height:1.65">요청한 페이지가 없거나 현재 사용할 수 없습니다.</p><p><a href="/my" style="display:inline-flex;padding:11px 14px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900">내 가계부로 이동</a></p></main></body></html>`;
  return new Response(body, { status: 404, headers: { ...HTML_HEADERS, "x-robots-tag": "noindex, nofollow" } });
}

function hiddenIncompleteFeatureResponse(request, env, url) {
  const path = String(url?.pathname || "");
  if (INTERNAL_MEME_OPERATIONS_PATHS.has(path) && !envFlagEnabled(env.MEME_CONTENT_OPERATIONS_ENABLED, false)) return hiddenFeature404();
  if (!memeCardsEnabled(env) && HIDDEN_MEME_PATHS.has(path)) return hiddenFeature404();
  if (!cardPerformanceEnabled(env) && HIDDEN_CARD_PERFORMANCE_PATHS.has(path)) return hiddenFeature404();
  return null;
}

function normalizeBaseUrl(value = "") {
  const v = String(value || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) return `https://${v}`.replace(/\/+$/, "");
  return v;
}

const DEFAULT_PUBLIC_BASE_URL = "https://malhaebook.com";

function publicBaseUrl(env = {}, url = null) {
  return normalizeBaseUrl(env.PUBLIC_BASE_URL || env.SERVICE_BASE_URL || env.APP_BASE_URL || env.CANONICAL_BASE_URL || DEFAULT_PUBLIC_BASE_URL || url?.origin || "");
}

function currentRequestBaseUrl(url = null) {
  return normalizeBaseUrl(url?.origin || "");
}

const KAKAO_REPRESENTATIVE_COMMANDS = Object.freeze([
  { order: 1, label: "시작", command: "시작", messageText: "시작", description: "" },
  { order: 2, label: "새 가계부 만들기", command: "새 가계부 만들기", messageText: "새 가계부 만들기", description: "" },
  { order: 3, label: "초대코드로 참여", command: "초대코드로 참여", messageText: "초대코드로 참여", description: "" },
  { order: 4, label: "단톡방 연결", command: "단톡방 연결", messageText: "단톡방 연결", description: "현재 단톡방을 선택한 가계부에 연결해요." },
  { order: 5, label: "기록 방법", command: "기록 방법", messageText: "기록 방법", description: "입력 예시를 확인해요. 거래는 말하듯 바로 입력할 수 있어요." },
  { order: 6, label: "오늘 기록 보기", command: "오늘 기록 보기", messageText: "오늘 기록 보기", description: "" },
  { order: 7, label: "예산 설정", command: "예산 설정", messageText: "예산 설정", description: "" },
  { order: 8, label: "남은 예산", command: "남은 예산", messageText: "남은 예산", description: "" },
  { order: 9, label: "이번 달 요약", command: "이번 달 요약", messageText: "이번 달 요약", description: "" },
  { order: 10, label: "가계부 전환", command: "가계부 전환", messageText: "가계부 전환", description: "앞으로 기록하고 조회할 가계부를 선택해요." },
  { order: 11, label: "웹 가계부 열기", command: "웹 가계부 열기", messageText: "웹 가계부 열기", description: "웹은 나중에 선택적으로 이어 열어 전체 기록과 분석을 확인해요." },
]);

const KAKAO_SECONDARY_COMMANDS = Object.freeze([
  { command: "/도움말", messageText: "도움말", description: "전체 사용법 확인" },
  { command: "/내이름설정", messageText: "내 이름 설정", description: "가계부에서 표시할 지출자 이름 설정" },
  { command: "/수정", messageText: "수정가이드", description: "오늘 기록의 번호로 수정·삭제하는 방법" },
]);

function kakaoRepresentativeCommands() {
  return KAKAO_REPRESENTATIVE_COMMANDS.map((item) => ({ ...item }));
}

function kakaoChatCommandCatalog(origin = "") {
  return [
    ...KAKAO_REPRESENTATIVE_COMMANDS.map((item) => ({ group: item.order <= 2 ? "시작·기록" : item.order <= 7 ? "조회·예산" : "가계부·공유", command: item.command, message_text: item.messageText, description: item.description, representative: true, chat_first: true, order: item.order })),
    ...KAKAO_SECONDARY_COMMANDS.map((item) => ({ group: "추가 명령", command: item.command, message_text: item.messageText, description: item.description, representative: false, chat_first: true })),
    { group: "자연어 기록", command: "점심 12000원 국민카드", message_text: "점심 12000원 국민카드", description: "슬래시 없이 내용·금액·결제수단을 바로 입력", representative: false, chat_first: true },
    { group: "웹", command: `${origin}/my`, message_text: "", description: "상세 분석·전체 거래 관리·내보내기", representative: false, chat_first: false },
  ];
}

function handleKakaoCommandSystemPage(request, env, url) {
  const origin = publicBaseUrl(env, url);
  const rows = kakaoChatCommandCatalog(origin).map((c) => `<tr><td><span class="pill">${escapeHtml(c.group)}</span></td><td><code>${escapeHtml(c.command)}</code>${c.representative ? ` <b>대표</b>` : ""}</td><td>${escapeHtml(c.description)}</td><td>${c.chat_first ? "카톡 응답" : "웹 이동"}</td></tr>`).join("");
  const qrs = kakaoDefaultQuickReplies().map((q) => `<span>${escapeHtml(q.label)} → ${escapeHtml(q.messageText)}</span>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 카카오 명령어 체계</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1080px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#f59e0b));color:#fff}.hero p{color:#fff7ed;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px}.box b{display:block;font-size:18px;margin-bottom:6px}table{width:100%;border-collapse:collapse;background:#fff;min-width:820px}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;vertical-align:top}.scroll{overflow:auto}.pill,.chips span{display:inline-flex;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:6px 9px;font-weight:1000;font-size:12px}code{background:#111827;color:#fff;border-radius:10px;padding:5px 8px;font-family:inherit;font-weight:900}.chips{display:flex;gap:8px;flex-wrap:wrap}.notice{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:13px;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body><main class="wrap"><section class="hero"><h1>카카오톡 안에서 먼저 해결하는 명령어 체계</h1><p>웹 이동은 로그인·상세 설정·분석·백업에만 쓰고, 기록·조회·초대코드·참여·가계부 생성은 가능한 한 카카오톡 메시지로 처리합니다.</p></section><section class="grid"><div class="box"><b>대표 명령어 설명</b><span>필요한 경우만 짧게 사용</span></div><div class="box"><b>단계형 바로연결</b><span>온보딩·설정 과정에서만 사용</span></div><div class="box"><b>폴백</b><span>자유 입력은 모두 /skill로 전달</span></div></section><section class="card"><h2>단계형 바로연결 후보</h2><div class="chips">${qrs}</div></section><section class="card"><h2>명령어 목록</h2><div class="scroll"><table><thead><tr><th>구분</th><th>명령어</th><th>역할</th><th>처리</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="notice"><b>오픈챗봇 설정 원칙</b><br/>기존 시나리오명과 블록명은 변경하지 않습니다. 대표 명령어의 실행 문장은 현재 연결된 통합 Skill로 전달하고, 단계형 바로연결은 온보딩·설정 흐름에서만 사용합니다.</section></main></body></html>`);
}

function renderSkillGetHealthHtml(env = {}, url = null) {
  const base = publicBaseUrl(env, url);
  const title = escapeHtml(appName(env));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title} · 카카오 스킬 연결</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:860px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:13px;font-weight:900}.code{background:#0f172a;color:#e5e7eb;border-radius:14px;padding:14px;word-break:break-all}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a!important}</style></head><body><main class="wrap"><section class="hero"><h1>카카오 스킬 연결 대기중</h1><p>이 주소는 카카오 OpenBuilder가 POST로 호출하는 Skill endpoint입니다. 브라우저에서 직접 열면 이 안내가 보이는 것이 정상입니다.</p></section><section class="card"><div class="ok">Skill URL 준비 완료 · OpenBuilder에는 아래 주소를 입력하세요.</div><p class="code">${escapeHtml(base)}/skill</p><p><a class="btn" href="${escapeHtml(base)}/my">내 가계부</a><a class="btn light" href="${escapeHtml(base)}/privacy">개인정보 안내</a><a class="btn light" href="${escapeHtml(base)}/terms">이용약관</a></p></section></main></body></html>`;
}

function canonicalRedirectResponse(request, env = {}, url = null) {
  try {
    if (!url || String(request?.method || "GET").toUpperCase() !== "GET") return null;
    if (String(env.CANONICAL_REDIRECT || "").trim() !== "1") return null;
    if (["/health", "/ops-snapshot.json", "/meme-card-catalog.json"].includes(url.pathname)) return null;
    const targetBase = publicBaseUrl(env, url);
    const currentBase = currentRequestBaseUrl(url);
    if (!targetBase || !currentBase || targetBase === currentBase) return null;
    const currentHost = new URL(currentBase).host;
    const targetHost = new URL(targetBase).host;
    if (!currentHost || !targetHost || currentHost === targetHost) return null;
    const next = new URL(url.pathname + url.search + url.hash, targetBase);
    return new Response(null, { status: 308, headers: { location: next.toString(), "cache-control": "no-store" } });
  } catch (err) {
    return null;
  }
}

function appName(env) {
  return env.APP_NAME || env.BRAND_NAME || "말해가계부";
}

const BUSINESS_FOOTER_INFO = Object.freeze({
  service: "말해가계부",
  company: "도담 네트워크",
  businessNumber: "729-24-02288",
  address: "경기도 평택시 신촌3로 12",
  businessType: "정보통신업",
  businessItem: "응용 소프트웨어 개발 및 공급업",
});

function businessFooterText(value = "") {
  return escapeHtml(String(value || "").trim());
}

function renderBusinessInfoFooter() {
  const info = BUSINESS_FOOTER_INFO;
  return `<style>
  .abBusinessFooter{margin:18px 0 0;padding:13px 0 2px;border-top:1px solid #e5e7eb;color:#596579;font-size:11px;line-height:1.45;letter-spacing:-.015em}
  .abBusinessFooterInner{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px}
  .abBusinessFooterTitle{font-weight:1000;color:#334155;white-space:nowrap}
  .abBusinessFooterItem{display:inline-flex;gap:5px;align-items:baseline;min-width:0}
  .abBusinessFooterItem b{color:#475569;font-weight:900;white-space:nowrap}
  @media(max-width:700px){.abBusinessFooterInner{gap:5px 11px}.abBusinessFooterTitle{flex-basis:100%}.abBusinessFooterItem{font-size:10.5px}}
  </style><footer class="abBusinessFooter" aria-label="사업자 정보"><div class="abBusinessFooterInner">
    <span class="abBusinessFooterTitle">사업자 정보</span>
    <span class="abBusinessFooterItem"><b>상호</b>${businessFooterText(info.company)}</span>
    <span class="abBusinessFooterItem"><b>등록번호</b>${businessFooterText(info.businessNumber)}</span>
    <span class="abBusinessFooterItem"><b>소재지</b>${businessFooterText(info.address)}</span>
    <span class="abBusinessFooterItem"><b>업태</b>${businessFooterText(info.businessType)}</span>
    <span class="abBusinessFooterItem"><b>종목</b>${businessFooterText(info.businessItem)}</span>
    <span class="abBusinessFooterItem"><b>서비스</b>${businessFooterText(info.service)}</span>
  </div></footer>`;
}

function publicSupportEmail(env = {}) {
  const value = String(env.PUBLIC_SUPPORT_EMAIL || env.SUPPORT_EMAIL || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

const DEFAULT_ADSENSE_PUBLISHER_ID = "ca-pub-3546469870344416";

function adsensePublisherId(_env = {}) {
  // The review owner is intentionally pinned. Existing production variables may
  // contain a previous publisher and must not override this reviewed identity.
  return DEFAULT_ADSENSE_PUBLISHER_ID;
}

function adsensePublisherIdForTxt(env = {}) {
  return adsensePublisherId(env).replace(/^ca-/, "");
}

function publicAdsenseHead(env = {}) {
  const client = adsensePublisherId(env);
  if (!client) return "";
  // AdSense review mode is ownership-only. Ad runtime, slots, and ad cookies
  // remain disabled until a later, separately reviewed release enables them.
  return `<meta name="google-adsense-account" content="${escapeHtml(client)}"/>`;
}

const PUBLIC_CONTENT_PATHS = Object.freeze([
  "/", "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide",
  "/group-accountbook", "/security", "/faq", "/about", "/contact",
  "/privacy", "/terms", "/cookies", "/site-map",
]);

function publicSiteNav(active = "home") {
  const links = [
    ["home", "서비스", "/"],
    ["service-guide", "기능 안내", "/service-guide"],
    ["how-it-works", "사용 방법", "/how-it-works"],
    ["kakao-guide", "카카오톡 가이드", "/kakao-guide"],
    ["budget-guide", "예산 관리", "/budget-guide"],
    ["group-accountbook", "가족·모임", "/group-accountbook"],
    ["security", "데이터 보호", "/security"],
    ["faq", "FAQ", "/faq"],
  ];
  const linkHtml = links.map(([key,label,href]) => `<a class="${active === key ? "active" : ""}" ${active === key ? `aria-current="page"` : ""} href="${href}">${escapeHtml(label)}</a>`).join("");
  return `<header class="pubHeader"><div class="pubHeaderInner"><a class="pubBrand" href="/"><span>₩</span><b>말해가계부</b></a><nav class="pubDesktopNav" aria-label="공개 페이지">${linkHtml}</nav><a class="pubStart" href="/my">가계부 시작하기</a><details class="pubMobileMenu"><summary aria-label="공개 페이지 메뉴 열기">메뉴</summary><nav aria-label="모바일 공개 페이지"><a href="/my">가계부 시작하기</a>${linkHtml}</nav></details></div></header>`;
}

function publicSiteFooter() {
  return `<footer class="pubFooter"><div><b>말해가계부</b><p>혼자 또는 함께 쓰는 생활 가계부를 더 쉽고 꾸준하게 기록하도록 돕는 서비스입니다.</p></div><div class="pubFooterLinks"><a href="/about">서비스 소개</a><a href="/contact">문의 안내</a><a href="/privacy">개인정보처리방침</a><a href="/terms">이용약관</a><a href="/cookies">쿠키 정책</a><a href="/site-map">사이트맵</a><a href="https://everyday-tools-ko.pages.dev" target="_blank" rel="noopener">생활 계산기</a></div></footer>`;
}
// @build:exports-start
export {
  APP_MODE, APP_VERSION, BUSINESS_FOOTER_INFO, DEFAULT_PUBLIC_BASE_URL,
  KAKAO_REPRESENTATIVE_COMMANDS, KAKAO_SECONDARY_COMMANDS, PUBLIC_CONTENT_PATHS,
  adsensePublisherIdForTxt, appName, canonicalRedirectResponse, cardPerformanceEnabled,
  currentRequestBaseUrl, envFlagEnabled, handleKakaoCommandSystemPage,
  hiddenIncompleteFeatureResponse, incompleteFeatureQaEnabled, kakaoChatCommandCatalog,
  kakaoRepresentativeCommands, memeCardsEnabled, normalizeBaseUrl, premiumBetaEnabled,
  publicAdsenseHead, publicBaseUrl, publicSiteFooter, publicSiteNav, publicSupportEmail,
  renderBusinessInfoFooter, renderSkillGetHealthHtml,
};
// @build:exports-end
