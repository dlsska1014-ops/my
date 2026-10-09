// @build:imports-start
import { buildOpsSnapshot, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  APP_VERSION, BUSINESS_FOOTER_INFO, appName, cardPerformanceEnabled, memeCardsEnabled,
  publicBaseUrl,
} from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { fetchAdminHouseholds } from "../data/households-members-rows.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { userPolishBaseStyle } from "./guide-pages.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

const MEME_CONTENT_LIBRARY = Object.freeze([
  {
    id: "card-alert-cat",
    title: "카드값 알림이 왔다",
    subtitle: "내 표정도 함께 멈췄다",
    character: "놀란 고양이",
    category: "카드값/알림",
    tone: "가벼운 놀람",
    motion: "알림 카드가 살짝 튀고, 고양이 눈동자가 1초간 동그랗게 커진 뒤 멈춥니다.",
    file: "meme_cards/카드값_알림에_얼어버린_고양이.png",
    status: "candidate",
    grade: "전체이용가"
  },
  {
    id: "save-rabbit",
    title: "오늘은 절약할 거야",
    subtitle: "배달앱이 먼저 말을 걸었다",
    character: "운동복 토끼",
    category: "절약/배달 유혹",
    tone: "귀여운 의지 흔들림",
    motion: "토끼 손이 멈칫하고, 배달앱 버튼이 반짝인 뒤 토끼가 고개를 살짝 돌립니다.",
    file: "meme_cards/오늘은_절약할_거야.png",
    status: "candidate",
    grade: "전체이용가"
  },
  {
    id: "meeting-penguin",
    title: "모임비 정산 시작",
    subtitle: "갑자기 모두가 조용해졌다",
    character: "펭귄 총무",
    category: "모임비/정산",
    tone: "어색한 침묵",
    motion: "단톡방 말풍선 점 세 개가 하나씩 줄어들고, 펭귄이 계산기를 멈칫합니다.",
    file: "meme_cards/모임비_정산에_당황한_펭귄.png",
    status: "candidate",
    grade: "전체이용가"
  },
  {
    id: "budget-capybara",
    title: "예산 안 넘겼다",
    subtitle: "오늘은 나 자신 칭찬 완료",
    character: "왕관 카피바라",
    category: "예산/성공",
    tone: "소소한 자축",
    motion: "체크 아이콘이 통통 튀고, 색종이가 천천히 떨어집니다.",
    file: "meme_cards/예산_안_넘겼다_나_자신_칭찬해.png",
    status: "candidate",
    grade: "전체이용가"
  }
]);

function memeSafePolicyList() {
  return [
    "비속어, 성적 표현, 폭력, 혐오, 차별, 도박, 음주·흡연 조장 표현을 쓰지 않습니다.",
    "사용자 소비를 비난하지 않고 표정·상황·타이밍으로만 가볍게 웃깁니다.",
    "카카오 심사에서 오해될 수 있는 은어, 줄임말, 자극적 문구는 사용하지 않습니다.",
    "움직임은 2~3초 루프 기준으로 흔들림, 반짝임, 표정 변화, 말풍선 변화 정도로 제한합니다.",
    "자동 재생 파일은 정지 이미지 대체본을 항상 같이 유지합니다."
  ];
}

function memeMotionPromptList(origin = "") {
  return MEME_CONTENT_LIBRARY.map((card) => ({
    id: card.id,
    title: `${card.title} / ${card.subtitle}`,
    source: card.file,
    prompt: `정지 이미지 ${card.file}를 기준으로 2~3초 길이의 짧은 루프 애니메이션을 만듭니다. 전체이용가, 카카오 심사 안전 문구 유지. 텍스트는 그대로 유지: 상단 "${card.title}", 하단 "${card.subtitle}". 움직임: ${card.motion} 화면 전체 흔들림은 약하게, 캐릭터 표정 변화와 작은 효과만 사용. 비속어/부적절한 단어 추가 금지.`,
    review_url: origin ? `${origin}/meme-review-check#${card.id}` : `/meme-review-check#${card.id}`
  }));
}

function renderMemeContentRows({ withPrompts = false } = {}) {
  return MEME_CONTENT_LIBRARY.map((card, idx) => `<tr id="${escapeHtml(card.id)}"><td>${idx + 1}</td><td><b>${escapeHtml(card.title)}</b><br/><span>${escapeHtml(card.subtitle)}</span></td><td>${escapeHtml(card.character)}</td><td>${escapeHtml(card.category)}</td><td>${escapeHtml(card.tone)}</td><td>${escapeHtml(card.motion)}</td><td><span class="safeBadge">${escapeHtml(card.grade)}</span></td>${withPrompts ? `<td><code>${escapeHtml(memeMotionPromptList()[idx]?.prompt || "")}</code></td>` : ""}</tr>`).join("");
}

function memeContentBaseStyle() {
  return `${userPolishBaseStyle()}.memeHero{background:linear-gradient(135deg,#111827,#7c3aed,#ec4899)}.safeBadge{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 9px;font-size:12px;font-weight:1000}.warnBadge{display:inline-flex;border-radius:999px;background:#fff7ed;color:#9a3412;padding:5px 9px;font-size:12px;font-weight:1000}.tableWrap table{min-width:960px}.cardPreviewGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.previewCard{background:#fff;border:1px solid #e8edf4;border-radius:22px;padding:15px;box-shadow:0 10px 24px rgba(15,23,42,.055)}.previewCard h3{margin:8px 0 5px}.previewCard p{color:#64748b;line-height:1.5}.previewCard .thumb{height:128px;border-radius:18px;background:linear-gradient(135deg,#111827,#334155);color:#fff;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:1000}.copyBlock{white-space:pre-wrap;background:#111827;color:#f8fafc;border-radius:18px;padding:14px;line-height:1.6;overflow:auto}.miniNav{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}`;
}

function memeContentNav() {
  return `<p class="miniNav"><a class="btn kakao" href="/meme-content-center">밈 콘텐츠센터</a><a class="btn light" href="/meme-motion-guide">Nano Banana 2 프롬프트</a><a class="btn light" href="/meme-review-check">심사 안전 체크</a><a class="btn light" href="/meme-share-kit">공유 문구 키트</a><a class="btn light" href="/meme-card-catalog.json">JSON</a></p>`;
}

async function handleMemeContentCenterPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const cards = MEME_CONTENT_LIBRARY.map((card) => `<article class="previewCard"><div class="thumb">${escapeHtml(card.character.slice(0, 2))}</div><h3>${escapeHtml(card.title)}</h3><p><b>${escapeHtml(card.subtitle)}</b></p><p>${escapeHtml(card.category)} · ${escapeHtml(card.tone)}</p><span class="safeBadge">${escapeHtml(card.grade)}</span></article>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 밈 콘텐츠센터</title><style>${memeContentBaseStyle()}</style></head><body>${renderUnifiedNav("meme-content-center")}<main class="wrap"><section class="hero memeHero"><span class="tag">V20.9 밈 콘텐츠 반영</span><h1>밈 카드를 앱 콘텐츠로 관리합니다</h1><p>정지 이미지 후보 4종을 기준으로 문구, 움직임, 심사 안전성, 공유 문구를 한 곳에서 관리합니다. 실제 공개는 /meme-lab 검수 후 진행합니다.</p>${memeContentNav()}</section><section class="card"><h2>콘텐츠 후보</h2><div class="cardPreviewGrid">${cards}</div></section><section class="card"><h2>상세 카탈로그</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>문구</th><th>캐릭터</th><th>분류</th><th>톤</th><th>움직임</th><th>등급</th></tr></thead><tbody>${renderMemeContentRows()}</tbody></table></div></section><section class="notice"><b>반영 원칙</b><br/>이미지 파일은 ZIP의 meme_cards/ 폴더에 보관하고, 앱 화면에는 먼저 문구·프롬프트·공유 문구를 반영합니다. 공개용 움직이는 이미지는 용량과 심사 문구 확인 후 별도 배포합니다.</section></main></body></html>`);
}

async function handleMemeMotionGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rows = renderMemeContentRows({ withPrompts: true });
  const copy = memeMotionPromptList(publicBaseUrl(env, url)).map((x, i) => `${i + 1}. ${x.title}\n${x.prompt}`).join("\n\n---\n\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · Nano Banana 2 프롬프트</title><style>${memeContentBaseStyle()}</style></head><body>${renderUnifiedNav("meme-motion-guide")}<main class="wrap"><section class="hero memeHero"><span class="tag">Nano Banana 2</span><h1>짧게 움직이는 밈 제작 프롬프트</h1><p>2~3초 루프, 전체이용가, 문구 변경 금지, 표정·흔들림·반짝임 중심으로 제작하는 기준입니다.</p>${memeContentNav()}</section><section class="card"><h2>카드별 프롬프트</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>문구</th><th>캐릭터</th><th>분류</th><th>톤</th><th>움직임</th><th>등급</th><th>복사용 프롬프트</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card"><h2>전체 복사용</h2><div class="copyBlock">${escapeHtml(copy)}</div></section></main></body></html>`);
}

async function handleMemeReviewCheckPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rules = memeSafePolicyList().map((rule, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(rule)}</td><td><span class="safeBadge">필수</span></td></tr>`).join("");
  const cards = MEME_CONTENT_LIBRARY.map((card, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(card.title)}</b><br/>${escapeHtml(card.subtitle)}</td><td>${escapeHtml(card.character)}</td><td><span class="safeBadge">문구 안전</span></td><td><span class="safeBadge">전체이용가</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 밈 심사 안전 체크</title><style>${memeContentBaseStyle()}</style></head><body>${renderUnifiedNav("meme-review-check")}<main class="wrap"><section class="hero memeHero"><span class="tag">카카오 심사 안전</span><h1>부적절한 단어 없이 피식하는지 확인합니다</h1><p>병맛은 표정과 상황으로만 만들고, 텍스트는 가족/전체이용가 기준으로 유지합니다.</p>${memeContentNav()}</section><section class="card"><h2>콘텐츠별 체크</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>문구</th><th>캐릭터</th><th>문구</th><th>등급</th></tr></thead><tbody>${cards}</tbody></table></div></section><section class="card"><h2>금지/주의 기준</h2><div class="tableWrap"><table><tbody>${rules}</tbody></table></div></section><section class="notice"><b>릴리스 기준</b><br/>움직이는 이미지는 공개 전 정지 이미지, 첫 프레임, 마지막 프레임, 반복 구간에서 문구가 왜곡되지 않는지 확인합니다.</section></main></body></html>`);
}

async function handleMemeShareKitPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rows = MEME_CONTENT_LIBRARY.map((card, i) => {
    const share = `${card.title}\n${card.subtitle}\n\n${BUSINESS_FOOTER_INFO.service}에서 오늘 소비를 가볍게 확인해보세요.`;
    return `<tr><td>${i + 1}</td><td><b>${escapeHtml(card.title)}</b><br/>${escapeHtml(card.subtitle)}</td><td><div class="copyBlock">${escapeHtml(share)}</div></td><td>${escapeHtml(card.file)}</td></tr>`;
  }).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 밈 공유 키트</title><style>${memeContentBaseStyle()}.tableWrap table{min-width:900px}.copyBlock{font-size:13px}</style></head><body>${renderUnifiedNav("meme-share-kit")}<main class="wrap"><section class="hero memeHero"><span class="tag">공유 문구</span><h1>카카오 공유용 문구를 안전하게 관리합니다</h1><p>공유 문구는 과장된 자극 없이 앱의 가벼운 재미와 기록 유도만 담습니다.</p>${memeContentNav()}</section><section class="card"><h2>카드별 공유 문구</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>카드</th><th>공유 문구</th><th>정지 이미지 후보</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="ok"><b>운영 권장</b><br/>초기에는 자동 공유보다 문구 복사 + 정지 이미지 다운로드 기준으로 운영하고, 심사 통과 후 움직이는 WebP/GIF 노출을 검토합니다.</section></main></body></html>`);
}

async function handleReleaseDryRunPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (err) { households = []; rememberOpsEvent({ kind: "release_dry_run_db", severity: "warn", path: "/release-dry-run", method: "GET", detail: safeError(err) }); }
  const householdId = String(url.searchParams.get("household_id") || households[0]?.id || "").trim();
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const checks = [
    ["버전", APP_VERSION, true],
    ["사업자 푸터", BUSINESS_FOOTER_INFO.company + " / " + BUSINESS_FOOTER_INFO.businessNumber, true],
    ["가계부 수", `${households.length}개`, households.length >= 0],
    ["사용자 메뉴", "/menu 운영 메뉴 숨김", true],
    ["빠른 입력 QA", "/quick-input-qa 샘플 확인", true],
    ["가계부 생성/참여", "/my/households 실제 경로 확인", true],
    ["미완성 기능", "소비 카드/밈·카드 실적/혜택 404 확인", !memeCardsEnabled(env) && !cardPerformanceEnabled(env)],
    ["운영센터", "/operation-center 관리자 전용", true],
  ].map(([a,b,ok])=>`<tr><td><b>${escapeHtml(a)}</b></td><td>${escapeHtml(b)}</td><td><span class="${ok?'okb':'badb'}">${ok?'확인':'주의'}</span></td></tr>`).join("");
  const links = [
    ["모바일 입력", `/app?month=${encodeURIComponent(month)}${hh}`],
    ["빠른입력 QA", "/quick-input-qa"],
    ["가계부 전환", "/my/households"],
    ["운영 대시보드", "/ops-dashboard"],
  ].map(([a,b])=>`<a class="btn light" href="${escapeHtml(b)}">${escapeHtml(a)}</a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 릴리스 드라이런</title><style>${userPolishBaseStyle()}.okb,.badb{border-radius:999px;padding:5px 9px;font-size:12px;font-weight:1000}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}</style></head><body>${renderUnifiedNav("release-dry-run", { month, householdId })}<main class="wrap"><section class="hero"><span class="tag">릴리스 드라이런</span><h1>배포 직전 마지막 눌러보기</h1><p>실사용 QA, 빠른입력 분류, 가계부 생성/참여, 미완성 기능 숨김, 운영센터 접근을 한 번에 확인합니다.</p><p>${links}</p></section><section class="card"><h2>확인 항목</h2><div class="tableWrap"><table><tbody>${checks}</tbody></table></div></section><section class="notice"><b>릴리스 판단</b><br/>이 화면에서 기능 추가 요구가 나오면 다음 FEATURE로 넘기고, 오류/노출/가독성 문제만 HOTFIX로 처리합니다.</section></main></body></html>`);
}

async function handleKakaoCommandsPage(request, env, url) {
  const origin = publicBaseUrl(env, url);
  const title = escapeHtml(appName(env));
  const rows = [
    ["요약", "이번 달 수입·지출·잔액 요약"],
    ["오늘 기록", "오늘 또는 최근 입력 내역 확인"],
    ["점심 12000 국민카드", "지출 1건 저장"],
    ["7월3일\\n온열안대 9900 삼성카드\\n풋샴푸 10150 삼성카드", "날짜 묶음 여러 줄 저장"],
    ["01번 삭제", "최근 기록 번호 기준 삭제"],
    ["남은예산", "이번 달 남은 예산 확인"],
    ["도움말", "기본 사용법 안내"],
  ].map(([a,b]) => `<tr><td><code>${escapeHtml(a)}</code></td><td>${escapeHtml(b)}</td></tr>`).join("");
  const openbuilder = ["웰컴", "도움말", "요약", "오늘 기록", "입력 예시", "수정가이드", "폴백"].map((x) => `<span>${escapeHtml(x)} → /skill</span>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 챗봇 명령어</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:980px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:21px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#0b1739,#153878);color:#fff}.hero p{color:#dbeafe;line-height:1.65}.skill{background:#111827;color:#fff;border-radius:16px;padding:13px;word-break:break-all;font-weight:1000}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;vertical-align:top}code{white-space:pre-wrap;background:#f1f5f9;border-radius:10px;padding:6px 8px;font-family:inherit;font-weight:900}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{background:#eef2ff;color:#3730a3;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}@media(max-width:760px){.wrap{padding:12px}table{font-size:13px}}</style></head><body><main class="wrap"><section class="hero"><h1>카카오 챗봇 명령어</h1><p>베타 운영에서는 사용자가 가장 많이 쓰는 문장과 오입력 안내를 먼저 안정화합니다.</p><div class="skill">Skill URL: ${escapeHtml(origin)}/skill</div><p><a class="btn" href="/openbuilder-guide">오픈빌더 설정</a><a class="btn" href="/beta-start">베타 시작</a></p></section><section class="card"><h2>대표 발화</h2><table><thead><tr><th>발화</th><th>동작</th></tr></thead><tbody>${rows}</tbody></table></section><section class="card"><h2>OpenBuilder 연결 기준</h2><div class="chips">${openbuilder}</div><p>폴백 블록까지 /skill로 연결되어야 “이해하기 어려워요” 대신 서비스 안내와 입력 예시가 표시됩니다.</p></section></main></body></html>`);
}

async function handleOpsSnapshotJson(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return jsonResponse({ ok: false, error: "admin_required", reason: "admin_required", message: "관리자 권한이 필요합니다." }, 401);
  return jsonResponse({ ok: true, snapshot: buildOpsSnapshot(env) });
}

function renderDuplicateSafetyHtml(env = {}) {
  const snapshot = buildOpsSnapshot(env);
  const d = snapshot.duplicates || { recent: [], byKind: {}, bySource: {} };
  const limits = snapshot.limits || {};
  const rows = (d.recent || []).slice(0, 60).map((e) => `<tr><td>${escapeHtml(String(e.at || "").replace("T"," ").slice(0,19))}</td><td>${escapeHtml(e.kind || "")}</td><td>${escapeHtml(e.source || "")}</td><td>${escapeHtml(e.transaction_date || "")}</td><td>${numberWithCommas(e.amount || 0)}원</td><td><code>${escapeHtml(e.household_id || "")}</code></td><td>${escapeHtml(e.detail || "")}</td></tr>`).join("") || `<tr><td colspan="7">최근 중복/대량 제한 이벤트가 없습니다.</td></tr>`;
  const kindCards = Object.entries(d.byKind || {}).map(([k,v]) => `<div class="metric"><span>${escapeHtml(k)}</span><b>${numberWithCommas(v)}</b></div>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>중복 저장 방어</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c2d12));color:#fff;border-radius:26px;padding:22px;margin:14px 0}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.06)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.metric{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}.metric span{display:block;color:#64748b}.metric b{font-size:23px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:9px;text-align:left;font-size:13px;vertical-align:top}.tableWrap{overflow:auto}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.note{color:#64748b;line-height:1.6}code{font-size:11px;word-break:break-all}</style></head><body><main class="wrap"><section class="hero"><h1>중복 저장·대량 입력 안전센터</h1><p>카카오 재전송, 같은 폼 반복 제출, CSV 대량 가져오기에서 데이터 중복과 과부하를 막는 운영 현황입니다.</p><p><a class="btn" href="/operation-center">운영센터</a> <a class="btn" href="/ops-dashboard">운영 대시보드</a> <a class="btn" href="/ops-duplicates">중복 방어</a></p></section><section class="grid"><div class="metric"><span>중복 방어 시간</span><b>${numberWithCommas(limits.duplicate_guard_seconds || 0)}초</b></div><div class="metric"><span>카카오 재전송 방어</span><b>${numberWithCommas(limits.kakao_retry_dedup_seconds || 0)}초</b></div><div class="metric"><span>카카오 반복 발화</span><b>${numberWithCommas(limits.kakao_repeat_guard_seconds || 0)}초</b></div><div class="metric"><span>CSV 1회 처리 제한</span><b>${numberWithCommas(limits.my_import_limit || 0)}건</b></div><div class="metric"><span>카카오 1회 처리 제한</span><b>${numberWithCommas(limits.kakao_bulk_limit || 0)}건</b></div></section><section class="card"><h2>이벤트 요약</h2><div class="grid">${kindCards || `<div class="metric"><span>최근 이벤트</span><b>0</b></div>`}</div><p class="note">이 목록은 Worker 인스턴스 메모리 기준입니다. 배포/재시작/인스턴스 변경 시 초기화될 수 있습니다.</p></section><section class="card"><h2>최근 이벤트</h2><div class="tableWrap"><table><thead><tr><th>시간</th><th>종류</th><th>입력경로</th><th>날짜</th><th>금액</th><th>가계부</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table></div></section></main></body></html>`;
}
// @build:exports-start
export {
  MEME_CONTENT_LIBRARY, handleKakaoCommandsPage, handleMemeContentCenterPage,
  handleMemeMotionGuidePage, handleMemeReviewCheckPage, handleMemeShareKitPage,
  handleOpsSnapshotJson, handleReleaseDryRunPage, memeMotionPromptList, memeSafePolicyList,
  renderDuplicateSafetyHtml,
};
// @build:exports-end
