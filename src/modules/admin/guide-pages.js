// @build:imports-start
import { APP_VERSION, appName, publicBaseUrl } from "../public/site-config.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { fetchPaymentAssets } from "../settings/payment-assets.js";
import { fetchReservePlans } from "../settings/reserve-plans.js";
import { fetchAdminHouseholds, fetchAdminRows } from "../data/households-members-rows.js";
import { userHouseholdRoleLabel } from "./ops-diagnostics-pages.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { inspectKakaoLoginConfig, verifyUserSession } from "../auth/user-session.js";
import { fetchUserById, fetchUserHouseholds } from "../data/users-household-create.js";
import {
  canManageMyHousehold, canReadMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "../my/access-control.js";
import { fetchBudgets } from "../domain/budgets.js";
import { fetchKakaoGroupLinkMap } from "../kakao/group-links-first-record.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleUiPolishCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const cards = [
    ["홈 대시보드", `/app?month=${encodeURIComponent(month)}${hh}`, "남은 예산, 타임라인, 카테고리 비율"],
    ["초보자 시작", `/start-guide?month=${encodeURIComponent(month)}${hh}`, "처음 설정 순서와 완료율"],
    ["예산 관리", `/budgets?month=${encodeURIComponent(month)}${hh}`, "월 수입 대비 예산"],
    ["정기 수입·지출", `/reserve-plans?month=${encodeURIComponent(month)}${hh}`, "재산세·자동차보험 준비"],
    ["분류·키워드", householdId ? `/categories?household_id=${encodeURIComponent(householdId)}` : "/categories", "우리집 자동분류 기준"],
    ["배포점검", `/deployment-check?month=${encodeURIComponent(month)}${hh}`, "배포 전후 기능 확인"],
  ].map(([title, href, desc]) => `<a class="sample" href="${escapeHtml(href)}"><b>${escapeHtml(title)}</b><span>${escapeHtml(desc)}</span></a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>화면점검</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8fafc,#f3f6fb);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#334155));color:#fff;border-radius:30px;padding:24px;margin:12px 0;box-shadow:0 22px 54px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.55;color:#e5e7eb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.sample{display:block;text-decoration:none;color:#111827;background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:18px;box-shadow:0 14px 34px rgba(15,23,42,.055);transition:all var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}.sample:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(15,23,42,.08)}.sample b{display:block;font-size:17px}.sample span{display:block;color:#667085;font-size:13px;line-height:1.45;margin-top:6px}.note{background:#fffdf3;border:1px solid #fde68a;color:#854d0e;border-radius:20px;padding:15px;margin:12px 0;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("ui-polish-check", { month, householdId })}<main class="wrap"><section class="hero"><h1>화면점검</h1><p>v13.4에서는 기능을 늘리기보다 화면을 더 깔끔하고 부드럽게 정리했습니다. 각 화면을 눌러 실제 사용 흐름을 확인하세요.</p></section><section class="note">확인 포인트: 카드 간격, 버튼 크기, 모바일 하단 메뉴, 데스크톱 좌측 메뉴, 첫 화면에서 무엇을 해야 하는지의 명확성</section><section class="grid">${cards}</section></main></body></html>`);
}

async function handleDeploymentCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const rows = householdId ? await fetchAdminRows(env, { month, householdId, type: "all" }) : [];
  const budgets = householdId ? await fetchBudgets(env, householdId, month) : [];
  const categories = householdId ? await fetchCustomCategories(env, householdId) : [];
  const payments = householdId ? await fetchPaymentAssets(env, householdId) : [];
  const reserves = householdId ? await fetchReservePlans(env, householdId) : [];
  const checks = [
    ["기본 접속", true, "/health, /app, /menu"],
    ["가계부", households.length > 0, `${households.length}개`],
    ["기록 데이터", rows.length >= 0, `${rows.length}건`],
    ["예산 설정", budgets.some((b) => Number(b.amount || 0) > 0), `${budgets.length}개`],
    ["분류·키워드", categories.length >= 0, `${categories.length}개`],
    ["자산·결제수단", payments.length >= 0, `${payments.length}개`],
    ["정기지출 준비", reserves.length >= 0, `${reserves.length}개`],
    ["초보자 가이드", true, "/start-guide"],
    ["모바일 홈", true, "/app"],
    ["백업·복구", true, "/backup"],
    ["카카오 챗봇", true, "/skill"],
    ["배포 버전", true, APP_VERSION],
  ];
  const okCount = checks.filter((c) => c[1]).length;
  const percent = Math.round((okCount / checks.length) * 100);
  const rowsHtml = checks.map(([name, ok, detail]) => `<tr><td>${escapeHtml(name)}</td><td><span class="${ok ? "ok" : "warn"}">${ok ? "정상" : "확인"}</span></td><td>${escapeHtml(detail || "")}</td></tr>`).join("");
  const linkCards = [
    ["처음 시작", `/start-guide?month=${encodeURIComponent(month)}${hh}`, "초보자 설정 순서"],
    ["모바일 홈", `/app?month=${encodeURIComponent(month)}${hh}`, "실사용 첫 화면"],
    ["예산", `/budgets?month=${encodeURIComponent(month)}${hh}`, "수입 대비 예산"],
    ["정기 수입·지출", `/reserve-plans?month=${encodeURIComponent(month)}${hh}`, "세금·보험 준비"],
    ["분류·키워드", householdId ? `/categories?household_id=${encodeURIComponent(householdId)}` : "/categories", "자동 분류 기준"],
    ["백업·복구", `/backup?month=${encodeURIComponent(month)}${hh}`, "배포 전후 백업"],
  ].map(([t, href, d]) => `<a class="linkCard" href="${escapeHtml(href)}"><b>${escapeHtml(t)}</b><span>${escapeHtml(d)}</span></a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>배포점검</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.02em}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff;border-radius:28px;padding:22px;margin:12px 0;box-shadow:0 18px 42px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.55;opacity:.92}.progress{height:13px;background:rgba(255,255,255,.22);border-radius:999px;overflow:hidden;margin-top:16px}.progress i{display:block;height:100%;background:#FEE500;border-radius:999px;width:${percent}%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:13px;font-weight:800}.metric b{font-size:25px}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:680px}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;font-size:14px}.ok,.warn{border-radius:999px;padding:5px 9px;font-size:12px;font-weight:1000}.ok{background:#dcfce7;color:#166534}.warn{background:#fff7ed;color:#9a3412}.linkCard{display:block;text-decoration:none;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.linkCard b{display:block}.linkCard span{display:block;color:#64748b;font-size:13px;margin-top:4px}.tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:13px;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("deployment-check", { month, householdId })}<main class="wrap"><section class="hero"><h1>배포점검</h1><p>최종 배포 전후에 핵심 기능이 살아있는지 한 화면에서 확인합니다. 실제 운영 비밀키 값은 표시하지 않습니다.</p><div class="progress"><i></i></div><p>점검률 ${percent}% · ${okCount}/${checks.length}</p></section><section class="grid"><div class="metric"><span>가계부</span><b>${numberWithCommas(households.length)}개</b></div><div class="metric"><span>이번 달 기록</span><b>${numberWithCommas(rows.length)}건</b></div><div class="metric"><span>예산 설정</span><b>${numberWithCommas(budgets.length)}개</b></div><div class="metric"><span>정기지출</span><b>${numberWithCommas(reserves.length)}개</b></div></section><section class="card"><h2>기능 점검</h2><div class="tableWrap"><table><thead><tr><th>항목</th><th>상태</th><th>세부</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></section><section class="card"><h2>주요 화면 바로가기</h2><div class="grid">${linkCards}</div></section><section class="card"><h2>배포 전 권장 순서</h2><div class="tip">1. /backup에서 현재 데이터 백업<br/>2. 새 index.js 배포<br/>3. /health에서 버전 확인<br/>4. /start-guide, /app, /budgets, /reserve-plans 확인<br/>5. 카카오 챗봇에서 "요약"과 지출 입력 테스트</div></section></main></body></html>`);
}

async function handleTermsPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const terms = [
    ["서비스 목적", "말해가계부는 사용자가 직접 입력한 수입·지출 기록을 가족/모임 가계부 단위로 정리해 주는 생활비 기록 도우미입니다."],
    ["사용자 책임", "입력한 금액, 날짜, 메모, 결제수단의 정확성은 사용자가 확인해야 합니다. 금융·세무·투자 판단을 대신하지 않습니다."],
    ["공동 가계부", "초대코드로 참여한 사용자는 부여된 권한 범위 안에서 조회·입력·수정할 수 있습니다. owner/admin은 참여자 권한을 관리할 수 있습니다."],
    ["데이터 관리", "사용자는 웹 화면에서 기록을 수정·삭제하고 백업 파일을 내려받을 수 있습니다. 삭제·가져오기 같은 위험 작업은 확인 절차를 거칩니다."],
    ["장애 대응", "일시적인 오류나 과도 요청이 발생하면 안전 안내 화면 또는 재시도 안내를 표시하며, 데이터 중복 저장을 막는 것을 우선합니다."],
  ];
  const rows = terms.map(([a,b]) => `<tr><td><b>${escapeHtml(a)}</b></td><td>${escapeHtml(b)}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 이용안내</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:940px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe;line-height:1.65}.muted{color:#667085;line-height:1.7}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:12px;text-align:left;vertical-align:top}@media(max-width:760px){.wrap{padding:12px}}</style></head><body><main class="wrap"><section class="hero"><h1>서비스 이용안내</h1><p>${title}를 실제 사용자에게 열기 전, 심사와 운영에 필요한 기본 안내를 한곳에 정리했습니다.</p><p><a class="btn light" href="/privacy">개인정보 안내</a><a class="btn light" href="/start-guide">시작가이드</a><a class="btn light" href="/my">내 가계부</a></p></section><section class="card"><h2>핵심 이용 기준</h2><table><tbody>${rows}</tbody></table></section><section class="card"><h2>사업자 정보</h2><p class="muted">페이지 하단 사업자 정보 푸터를 기준으로 표시합니다. 카카오 비즈니스 심사에서는 하단 푸터의 상호, 사업자등록번호, 소재지, 업태, 종목, 서비스명을 확인할 수 있습니다.</p></section></main></body></html>`);
}

async function handleReviewReadyPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const adminOk = await verifyAdminSession(request, env);
  const checks = [
    ["사업자 정보 하단 노출", true, "모든 HTML 응답에 사업자 정보 푸터 자동 삽입"],
    ["개인정보 안내", true, "/privacy 또는 /data-policy"],
    ["이용안내", true, "/terms"],
    ["카카오 스킬 URL", true, `${publicBaseUrl(env, url)}/skill`],
    ["시작가이드", true, "/start-guide"],
    ["백업/복구 안내", true, "/backup"],
    ["과도 요청 방어", true, "쓰기 요청 및 /skill 1차 rate guard"],
    ["운영센터", adminOk, adminOk ? "/operation-center 접근 가능" : "관리자 로그인 후 확인"],
  ];
  const rows = checks.map(([name, ok, detail]) => `<tr><td>${escapeHtml(name)}</td><td><span class="${ok ? "ok" : "warn"}">${ok ? "정상" : "확인"}</span></td><td>${escapeHtml(detail)}</td></tr>`).join("");
  const steps = ["/health 버전 확인", "/my 하단 사업자 정보 확인", "/privacy 개인정보 안내 확인", "/terms 이용안내 확인", "카카오 OpenBuilder 폴백 포함 전체 블록 /skill 연결", "요약·오늘 기록·지출 입력 발화 테스트"].map((x)=>`<li>${escapeHtml(x)}</li>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 심사·베타 준비</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.65}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left}.ok,.warn{display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:1000;font-size:12px}.ok{background:#dcfce7;color:#166534}.warn{background:#fff7ed;color:#9a3412}@media(max-width:760px){.wrap{padding:12px}.grid{grid-template-columns:1fr}}</style></head><body><main class="wrap"><section class="hero"><h1>심사·베타 준비센터</h1><p>카카오 비즈니스 심사와 지인 베타 운영에 필요한 최소 항목을 한 번에 확인합니다.</p><p><a class="btn light" href="/my">/my 확인</a><a class="btn light" href="/privacy">개인정보</a><a class="btn light" href="/terms">이용안내</a><a class="btn light" href="/openbuilder-report">챗봇 점검</a></p></section><section class="grid"><div class="card"><h2>심사 체크</h2><table><tbody>${rows}</tbody></table></div><div class="card"><h2>재신청 전 순서</h2><ol>${steps}</ol></div></section><section class="card"><h2>운영 메모</h2><p>심사 통과 전에는 본문에 불필요한 심사용 카드를 노출하지 않고, 하단 사업자 푸터·개인정보 안내·이용안내·OpenBuilder 연결 상태를 명확히 유지하는 방향이 안전합니다.</p></section></main></body></html>`);
}

function betaInfoCard(title, body, href = "", cta = "열기") {
  const link = href ? `<a class="btn" href="${escapeHtml(href)}">${escapeHtml(cta)}</a>` : "";
  return `<div class="betaCard"><b>${escapeHtml(title)}</b><p>${escapeHtml(body)}</p>${link}</div>`;
}

async function handleBetaStartPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const userId = await verifyUserSession(request, env);
  let householdId = url.searchParams.get("household_id") || "";
  let householdName = "가계부 선택 전";
  let households = [];
  let progress = 0;
  let selected = null;
  if (userId) {
    const user = await fetchUserById(env, userId);
    const access = await getMySelectedHousehold(env, userId, householdId);
    if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
    households = access.households;
    selected = access.selected;
    householdId = selected?.id || "";
    householdName = selected?.name || householdName;
    if (householdId) {
      const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
      const budgets = await fetchBudgets(env, householdId, month);
      const payments = await fetchPaymentAssets(env, householdId);
      const reserves = await fetchReservePlans(env, householdId);
      progress = [households.length > 0, budgets.length > 0, payments.length > 0, reserves.length > 0, rows.length > 0].filter(Boolean).length;
    }
  }
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const publicMode = !userId;
  const steps = [
    ["1. 가계부 만들기/참여", "가족·모임·여행 장부를 분리하고 초대코드로 참여합니다.", userId ? "/my/households" : "/my", "가계부 시작"],
    ["2. 초대·승인", "만든 사람은 초대코드를 공유하고, 참여자는 승인 상태와 다음 행동을 확인합니다.", userId && canManageMyHousehold(selected?.role) ? `/my/members?month=${encodeURIComponent(month)}${hh}` : userId ? "/my/households" : "/start-guide", "초대 확인"],
    ["3. 단톡방 연결(선택)", "단톡방에서 쓸 때만 소유자·관리자 한 명이 사용할 가계부를 연결합니다.", userId && canManageMyHousehold(selected?.role) ? `/my/groups?month=${encodeURIComponent(month)}${hh}` : "/kakao-commands", "연결 방법"],
    ["4. 기록 방법 확인", "‘점심 12000원 국민카드’처럼 저장될 값이 분명한 예시부터 확인합니다.", "/kakao-commands", "기록 예시"],
    ["5. 첫 기록과 결과 확인", "첫 기록을 남긴 뒤 오늘 기록에서 가계부·금액·내용이 맞는지 확인합니다.", userId ? `/app?month=${encodeURIComponent(month)}${hh}#add` : "/my", "첫 기록"],
    ["6. 필요할 때 설정", "예산·분류·결제수단·정기지출은 첫 기록 이후 필요한 항목만 추가합니다.", userId ? `/my/settings?month=${encodeURIComponent(month)}${hh}` : "/start-guide", "선택 설정"],
  ];
  const cards = steps.map(([a,b,c,d]) => betaInfoCard(a,b,c,d)).join("");
  const pct = publicMode ? 0 : Math.round((progress / 5) * 100);
  const quick = [
    ["내 가계부", "/my"],
    ["가계부 전환·참여", "/my/households"],
    ["백업 안전가이드", "/backup-safety"],
    ["챗봇 명령어", "/kakao-commands"],
  ].map(([a,b]) => `<a class="btn light" href="${escapeHtml(b)}">${escapeHtml(a)}</a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 베타 시작</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1060px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff;border-radius:30px;padding:24px;margin:14px 0;box-shadow:0 20px 46px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:31px}.hero p{line-height:1.6;color:#ede9fe}.progress{height:13px;background:rgba(255,255,255,.2);border-radius:999px;overflow:hidden;margin:14px 0}.progress i{display:block;height:100%;width:${pct}%;background:#FEE500;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}.betaCard,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:17px;margin:10px 0;box-shadow:0 12px 28px rgba(15,23,42,.055)}.betaCard b{display:block;font-size:18px}.betaCard p,.muted{color:#64748b;line-height:1.55}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.pill{display:inline-flex;background:#eef2ff;color:#3730a3;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:1000}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}}</style></head><body><main class="wrap"><section class="hero"><span class="pill">${escapeHtml(APP_VERSION)}</span><h1>베타 시작 흐름</h1><p>${publicMode ? "처음 사용하는 사람이 로그인 전에도 어떤 순서로 시작할지 확인할 수 있게 만든 안내 화면입니다." : `${escapeHtml(householdName)} 기준으로 베타 준비 상태를 확인합니다.`}</p><div class="progress"><i></i></div><p>${publicMode ? "로그인 후 진행률이 표시됩니다." : `베타 준비 ${pct}% · ${progress}/5`}</p><p>${quick}</p></section><section class="grid">${cards}</section><section class="card"><h2>베타 운영 기준</h2><p class="muted">처음에는 기능을 많이 설명하기보다 “가계부 생성 → 예산 → 결제수단 → 정기지출 → 카카오 기록 → 분석 확인” 흐름만 안내합니다. 오류가 나면 안전화면과 백업 가이드를 먼저 보여줍니다.</p></section></main></body></html>`);
}

async function handleHouseholdFlowGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const userId = await verifyUserSession(request, env);
  const households = userId ? (await fetchUserHouseholds(env, userId)).filter((h) => canReadMyHousehold(h.role)) : [];
  const items = households.map((h) => `<tr><td><b>${escapeHtml(h.name || "가계부")}</b></td><td>${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</td><td><a href="/app?household_id=${encodeURIComponent(h.id)}">열기</a></td></tr>`).join("") || `<tr><td colspan="3">로그인 후 내가 참여한 가계부만 표시됩니다.</td></tr>`;
  const cards = [
    ["내 집 가계부", "가족/부부가 매달 계속 쓰는 기본 장부입니다."],
    ["모임 가계부", "회식, 친구 모임, 공동 구매처럼 기간이 있는 장부입니다."],
    ["여행 가계부", "여행 기간의 지출을 모아보고 참여자별로 확인합니다."],
    ["단발성 정산", "한 번 쓰고 보관하거나 읽기 전용으로 남길 수 있는 장부 흐름입니다."],
  ].map(([a,b]) => betaInfoCard(a,b,"/my/households","전환·추가")).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 여러 가계부</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0e7490));color:#fff}.hero p{color:#fff;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.betaCard{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:16px}.betaCard p{color:#64748b}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.note{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}</style></head><body><main class="wrap"><section class="hero"><h1>여러 가계부 운영 흐름</h1><p>가족 장부와 모임/여행/단발성 장부를 분리하되, 모든 화면은 내가 참여한 household 범위만 보여야 합니다.</p><p><a class="btn" href="/my/households">가계부 전환·추가</a><a class="btn" href="/beta-start">베타 시작</a></p></section><section class="grid">${cards}</section><section class="card"><h2>내가 참여한 가계부</h2><table><thead><tr><th>가계부</th><th>권한</th><th>진입</th></tr></thead><tbody>${items}</tbody></table></section><section class="card"><h2>운영 기준</h2><div class="note">초대코드를 받은 사용자는 참여 후 권한에 따라 입력/수정/삭제 범위가 달라집니다. viewer는 조회만, member는 자기 기록 중심, owner/admin은 전체 관리가 기본입니다.</div></section></main></body></html>`);
}

async function handleBackupSafetyGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const steps = [
    ["1. 배포 전 백업", "/backup", "운영 코드 변경 전 JSON/CSV 백업을 먼저 받습니다."],
    ["2. 미리보기", "/backup/preview", "파일을 바로 넣지 않고 구조와 컬럼을 먼저 확인합니다."],
    ["3. 비교", "/backup/compare", "신규/중복/충돌 후보를 나눠 확인합니다."],
    ["4. 최종 확인", "/backup/final-check", "가져오기 전 확인 문구와 권한을 다시 확인합니다."],
    ["5. 이력 확인", "/backup/import-history", "적용 후 언제 어떤 자료가 들어갔는지 확인합니다."],
  ].map(([a,b,c]) => `<div class="step"><b>${escapeHtml(a)}</b><p>${escapeHtml(c)}</p><a href="${escapeHtml(b)}">열기</a></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 백업 안전가이드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:960px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:21px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#92400e));color:#fff}.hero p{color:#fff;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.step{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:16px}.step p{color:#64748b}.step a,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;line-height:1.55}</style></head><body><main class="wrap"><section class="hero"><h1>백업·복구 안전가이드</h1><p>베타 운영에서는 새 기능보다 복구 가능성이 먼저입니다. 배포 전후에는 이 순서를 기준으로 움직입니다.</p><p><a class="btn" href="/backup">백업센터</a><a class="btn" href="/operation-center">운영센터</a></p></section><section class="grid">${steps}</section><section class="card"><h2>주의</h2><div class="warn">가져오기와 되돌리기는 전체 데이터를 직접 바꾸는 작업입니다. 반드시 백업 파일을 저장한 뒤, 미리보기 → 비교 → 최종 확인 순서로 진행하세요.</div></section></main></body></html>`);
}

function kakaoGroupFlowBaseStyle() {
  return `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#0b1739,#153878);color:#fff}.hero h1{margin:0;font-size:31px;letter-spacing:-.06em}.hero p{color:#dbeafe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.flowCard{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:16px}.flowCard span,.tag{display:inline-flex;border-radius:999px;background:#fef9c3;color:#713f12;font-size:12px;font-weight:1000;padding:6px 10px}.flowCard b{display:block;margin-top:10px;font-size:18px}.flowCard p,.muted{color:#64748b;line-height:1.55}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.btn.kakao{background:#FEE500!important;color:#191919!important}.notice{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:13px;line-height:1.6}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:13px;line-height:1.6}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:760px;background:#fff}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}code,.cmd{display:inline-flex;background:#f1f5f9;border-radius:10px;padding:4px 7px;font-family:inherit;font-weight:900;color:#334155}.commandList{display:grid;gap:8px}.commandList div{border:1px solid #e5e7eb;border-radius:16px;padding:12px;background:#fff}.commandList b{display:block}.commandList span{color:#64748b;font-size:13px}.copyBox{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:16px;padding:12px;white-space:pre-wrap;line-height:1.6}.pillRow{display:flex;flex-wrap:wrap;gap:7px}.pillRow span{display:inline-flex;border-radius:999px;background:#eef2ff;color:#3730a3;font-weight:1000;font-size:12px;padding:7px 10px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.grid{grid-template-columns:1fr}table{min-width:680px}}`;
}

function kakaoFlowCard(step = "", title = "", text = "", href = "", label = "열기") {
  return `<div class="flowCard"><span>${escapeHtml(step)}</span><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p>${href ? `<a class="btn light" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : ""}</div>`;
}

function maskKakaoGroupKey(key = "") {
  const s = String(key || "").trim();
  if (!s) return "";
  if (s.length <= 10) return `${s.slice(0, 3)}***${s.slice(-2)}`;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

async function handleKakaoGroupFlowPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const userId = await verifyUserSession(request, env);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = userId ? (await fetchUserHouseholds(env, userId)).filter((h) => canManageMyHousehold(h.role)) : [];
  const householdRows = households.map((h) => {
    const invite = h.invite_code || "";
    const cmd = invite ? `단톡방 연결 ${invite}` : "초대코드 확인 필요";
    return `<tr><td><b>${escapeHtml(h.name || "가계부")}</b><br/><span class="muted">${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</span></td><td><code>${escapeHtml(invite || "-")}</code></td><td><div class="copyBox">${escapeHtml(cmd)}</div></td><td><a href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">열기</a></td></tr>`;
  }).join("") || `<tr><td colspan="4">로그인 후 내가 참여한 가계부와 초대코드가 표시됩니다. 비로그인 상태에서는 운영 흐름만 확인할 수 있습니다.</td></tr>`;
  const cards = [
    ["1", "챗봇을 단톡방에 초대", "카카오 채널/챗봇이 없는 방에서는 그룹 연결을 할 수 없습니다. 먼저 챗봇이 방 안에 있어야 합니다.", "/kakao-commands", "명령어"],
    ["2", "가계부 초대코드 확인", "웹의 /my/households 또는 참여자/초대 화면에서 연결할 가계부의 초대코드를 확인합니다.", "/my/households", "가계부 전환"],
    ["3", "그룹방에서 연결 명령", "그룹방 안에서 ‘단톡방 연결 초대코드’라고 보내면 그 방과 가계부가 연결됩니다.", "", ""],
    ["4", "기록/요약 사용", "연결 후 해당 방에서 점심 12000 국민카드, 요약, 남은예산, 오늘 기록을 사용할 수 있습니다.", "/openbuilder-final", "오픈빌더"],
  ].map((x) => kakaoFlowCard(...x)).join("");
  const copy = ["단톡방 연결 초대코드", "예: 단톡방 연결 ABC123", "", "연결 확인", "단톡방", "그룹 정보", "", "기록 예시", "점심 12000원 국민카드", "7월3일\n온열안대 9900 삼성카드\n풋샴푸 10150 삼성카드"].join("\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 단톡방 연결</title><style>${kakaoGroupFlowBaseStyle()}</style></head><body>${renderUnifiedNav("kakao-group-flow", { month })}<main class="wrap"><section class="hero"><span class="tag">${escapeHtml(APP_VERSION)}</span><h1>카카오 단톡방 연결 흐름</h1><p>그룹방마다 연결할 가계부를 명확히 분리합니다. 단톡방 전체 대화를 읽는 구조가 아니라, 챗봇에게 전달된 명령과 기록만 처리합니다.</p><p><a class="btn kakao" href="/openbuilder-final">오픈빌더 최종 발화</a><a class="btn" href="/group-household-links">연결 점검</a><a class="btn light" href="/kakao-login-recovery">로그인 복구</a></p></section><section class="grid">${cards}</section><section class="card"><h2>내 가계부별 연결 명령</h2><div class="tableWrap"><table><thead><tr><th>가계부</th><th>초대코드</th><th>단톡방에서 보낼 문장</th><th>열기</th></tr></thead><tbody>${householdRows}</tbody></table></div></section><section class="card"><h2>대표 문구</h2><div class="copyBox">${escapeHtml(copy)}</div></section><section class="card"><h2>운영 기준</h2><div class="notice">단톡방 연결은 그룹방 식별키가 있어야 동작합니다. 1:1 채팅에서는 연결 명령을 안내만 하고, 실제 연결은 그룹방 안에서 진행해야 합니다. 연결 후에도 blocked 사용자는 기록할 수 없고, pending/viewer 권한은 서버에서 제한됩니다.</div></section></main></body></html>`);
}

async function handleKakaoGroupLinksPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/my");
  const map = await fetchKakaoGroupLinkMap(env);
  const entries = Object.entries(map || {}).sort((a, b) => String(b[1]?.linked_at || "").localeCompare(String(a[1]?.linked_at || "")));
  const rows = entries.map(([key, item]) => `<tr><td><code>${escapeHtml(maskKakaoGroupKey(key))}</code></td><td><b>${escapeHtml(item.household_name || item.household_id || "가계부")}</b><br/><span class="muted">${escapeHtml(item.household_id || "")}</span></td><td>${escapeHtml(item.invite_code || "")}</td><td>${escapeHtml(item.linked_by || "")}</td><td>${escapeHtml(item.linked_at || "")}</td></tr>`).join("") || `<tr><td colspan="5">저장된 그룹방 연결이 아직 없습니다.</td></tr>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>단톡방 연결 점검</title><style>${kakaoGroupFlowBaseStyle()}</style></head><body>${renderUnifiedNav("group-household-links")}<main class="wrap"><section class="hero"><h1>단톡방-가계부 연결 점검</h1><p>관리자 전용 화면입니다. 그룹방 식별키는 일부 마스킹해서 표시합니다.</p><p><a class="btn" href="/kakao-group-flow">단톡방 연결 흐름</a><a class="btn light" href="/operation-center">운영센터</a></p></section><section class="card"><h2>연결 목록</h2><div class="tableWrap"><table><thead><tr><th>그룹키</th><th>가계부</th><th>초대코드</th><th>연결자</th><th>연결시각</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">이 정보는 Supabase의 방별 연결 설정을 기준으로 조회하며, 기존 kakao_group_links 값은 호환용 미러로만 유지합니다.</p></section></main></body></html>`);
}

async function handleKakaoLoginRecoveryGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const config = inspectKakaoLoginConfig(env);
  const kakaoKeyReady = config.ready;
  const origin = config.publicOrigin || "미설정";
  const redirectUri = config.redirectUri || (config.publicOrigin ? `${config.publicOrigin}/auth/kakao/callback` : "미설정");
  const rows = [
    ["카카오 로그인 성공", "카카오 계정으로 /my에 들어오고 기존 가계부가 보이는지 확인"],
    ["카카오 로그인 실패", "백업 로그인 화면에서 이름/접속코드로 먼저 진입"],
    ["기존 계정 연결", "로그인 후 /my/kakao-link 또는 카카오 로그인 버튼으로 계정 연결"],
    ["심사/운영 확인", "카카오 Developers Redirect URI와 Web domain이 Worker 주소와 일치하는지 확인"],
  ].map(([a,b]) => `<div class="flowCard"><b>${escapeHtml(a)}</b><p>${escapeHtml(b)}</p></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 로그인 복구</title><style>${kakaoGroupFlowBaseStyle()}</style></head><body>${renderUnifiedNav("kakao-login-recovery")}<main class="wrap"><section class="hero"><span class="tag">카카오 로그인 ${kakaoKeyReady ? "로컬 설정 일치" : "설정 확인 필요"}</span><h1>카카오 로그인 실패·백업 로그인 안내</h1><p>카카오 로그인은 편의 기능이고, 기존 접속코드 계정은 백업 진입 수단으로 유지합니다. 로그인 실패 시 사용자가 막히지 않도록 복구 흐름을 분리합니다.</p><p>${kakaoKeyReady ? `<a class="btn kakao" href="/auth/kakao/start">카카오 로그인 시작</a>` : ""}<a class="btn" href="/my">다른 방법으로 로그인</a><a class="btn light" href="/kakao-login-check">로그인 설정 확인</a></p></section><section class="grid">${rows}</section><section class="card"><h2>카카오 Developers 설정값</h2><div class="copyBox">Web domain: ${escapeHtml(origin)}\nRedirect URI: ${escapeHtml(redirectUri)}\nWorker callback: /auth/kakao/callback\nBackup login: /my/backup-login</div><div class="notice">표시된 Redirect URI와 완전히 같은 주소를 동일한 카카오 앱에 등록해야 합니다. 외부 관리자센터 등록 여부는 별도 확인 항목입니다.</div></section><section class="card"><h2>운영 문구</h2><div class="ok">카카오 로그인이 안 되면 다른 로그인 방법으로 먼저 들어가세요. 기록은 가계부 기준으로 보관되며, 로그인 방식이 바뀌어도 가계부 참여 권한이 맞으면 계속 사용할 수 있습니다.</div></section></main></body></html>`);
}

function openBuilderFinalRows(origin = "") {
  const skill = `${origin}/skill`;
  const rows = [
    ["기본 도움말", "도움말, 처음, 메뉴, 시작", "도움말 블록 → Skill", skill],
    ["기록 입력", "점심 12000 국민카드, 커피 4500 카카오페이", "입력 블록 또는 폴백 → Skill", skill],
    ["여러 줄 입력", "7월3일\\n온열안대 9900 삼성카드\\n풋샴푸 10150 삼성카드", "폴백 → Skill", skill],
    ["조회", "요약, 오늘 기록, 최근, 내역", "조회 블록 → Skill", skill],
    ["예산", "남은예산, 예산 현황, 예산 설정, 정기지출", "예산 블록 → Skill", skill],
    ["수정/삭제", "01번 금액 13000원, 01번 삭제, 수정가이드", "수정 블록 → Skill", skill],
    ["단톡방", "단톡방, 단톡방 연결 ABC123, 그룹 정보", "그룹 연결 블록 → Skill", skill],
    ["정책", "개인정보, 데이터 보관, 브랜드, 심사", "안내 블록 → Skill", skill],
    ["폴백", "알 수 없는 모든 사용자 문장", "반드시 /skill로 전달", skill],
  ];
  return rows.map((r) => `<tr><td><b>${escapeHtml(r[0])}</b></td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td><td><code>${escapeHtml(r[3])}</code></td></tr>`).join("");
}

async function handleOpenBuilderFinalUtterancePage(request, env, url) {
  const origin = publicBaseUrl(env, url);
  const copy = [
    `Skill URL: ${origin}/skill`,
    "",
    "필수 발화",
    "도움말 / 처음 / 메뉴 / 입력 예시",
    "요약 / 오늘 기록 / 최근",
    "남은예산 / 예산 현황 / 예산 설정 / 정기지출",
    "01번 삭제 / 01번 금액 13000원 / 수정가이드",
    "단톡방 / 단톡방 연결 초대코드 / 그룹 정보",
    "개인정보 / 브랜드 / 심사 / 폴백",
    "",
    "폴백 블록도 반드시 Skill URL로 연결",
  ].join("\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>오픈빌더 최종 발화</title><style>${kakaoGroupFlowBaseStyle()}</style></head><body>${renderUnifiedNav("openbuilder-final")}<main class="wrap"><section class="hero"><h1>카카오 OpenBuilder 최종 발화·블록 기준</h1><p>비즈니스 심사와 베타 운영에서 빠지는 발화가 없도록, 대표 발화와 폴백을 모두 /skill로 연결하는 기준입니다.</p><p><a class="btn kakao" href="/kakao-group-flow">단톡방 연결 흐름</a><a class="btn" href="/kakao-commands">챗봇 명령어</a><a class="btn light" href="/openbuilder-guide">기존 설정 가이드</a></p></section><section class="card"><h2>최종 연결 표</h2><div class="tableWrap"><table><thead><tr><th>영역</th><th>대표 발화</th><th>블록 기준</th><th>Skill URL</th></tr></thead><tbody>${openBuilderFinalRows(origin)}</tbody></table></div></section><section class="card"><h2>복사용 요약</h2><div class="copyBox">${escapeHtml(copy)}</div></section><section class="card"><h2>운영 주의</h2><div class="notice">사용자가 실제로 입력하는 자연어는 대부분 폴백으로 들어옵니다. 폴백이 /skill로 연결되지 않으면 Worker 코드가 정상이어도 카카오톡에서는 기본 응답만 나옵니다.</div></section></main></body></html>`);
}

function userPolishBaseStyle() {
  return `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 48%,#eef2f7);color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em;overflow-x:hidden}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:21px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe;line-height:1.65}.hero h1{margin:8px 0 10px;font-size:32px;letter-spacing:-.06em}.tag{display:inline-flex;border-radius:999px;background:#FEE500;color:#111827;padding:7px 11px;font-size:12px;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.step{background:#f8fafc;border:1px solid #e8edf4;border-radius:20px;padding:16px}.step b{display:block;font-size:18px}.step span{display:block;color:#64748b;line-height:1.55;margin-top:7px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.btn.kakao{background:#FEE500;color:#111827!important}.notice{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.6}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.6}.copy{white-space:pre-wrap;background:#111827;color:#f9fafb;border-radius:18px;padding:16px;line-height:1.6;font-family:inherit}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{display:inline-flex;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:8px 11px;font-weight:900;font-size:13px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e8edf4;padding:11px;text-align:left;vertical-align:top}code{background:#f1f5f9;border-radius:10px;padding:4px 7px;font-family:inherit;font-weight:900;white-space:pre-wrap}.tableWrap{overflow:auto}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}.grid{grid-template-columns:1fr}table{font-size:13px}}`;
}

function userPolishNav() {
  return `<p><a class="btn kakao" href="/my">가계부 시작</a><a class="btn light" href="/app">모바일 입력</a><a class="btn light" href="/quick-input-help">입력 가이드</a><a class="btn light" href="/beta-checklist">베타 체크</a><a class="btn light" href="/operation-center">운영센터</a></p>`;
}

async function handleUserPolishFinalPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const items = [
    ["1. 첫 화면", "사용자는 /my에서 시작하고, 로그인 후에는 /app에서 오늘 쓴 돈·빠른 입력·최근 기록을 바로 봅니다."],
    ["2. 입력", "한 줄 입력, 여러 줄 입력, 날짜별 묶음 입력을 모두 같은 방식으로 안내합니다."],
    ["3. 메뉴", "사용자 메뉴는 입력·분석·캘린더·예산·가계부 전환 중심으로 두고, 운영 메뉴는 운영센터로 분리합니다."],
    ["4. 베타 안내", "처음 쓰는 사람은 가계부 만들기 → 예산 → 결제수단 → 카카오 기록 → 백업 순서로 안내합니다."],
    ["5. 안전", "권한/가계부 범위/중복 방어/트래픽 가드는 유지하고 UI 안내만 정리합니다."],
    ["6. 심사", "사업자 정보는 하단 푸터만 유지하고 본문 심사용 카드는 표시하지 않습니다."],
  ].map(([a,b]) => `<div class="step"><b>${escapeHtml(a)}</b><span>${escapeHtml(b)}</span></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 사용자 UX 최종 정리</title><style>${userPolishBaseStyle()}</style></head><body>${renderUnifiedNav("user-polish-final")}<main class="wrap"><section class="hero"><span class="tag">V20.6 사용자 흐름 정리</span><h1>사용자가 덜 헷갈리게 만드는 최종 UX 기준</h1><p>기능을 더 넣기보다 첫 화면, 입력, 메뉴, 안내문구를 실제 베타 사용자 기준으로 정리합니다.</p>${userPolishNav()}</section><section class="grid">${items}</section><section class="card"><h2>이번 버전의 원칙</h2><div class="ok">/my, /app, /skill, 권한 체크, 여러 가계부, 예산 알림, 중복 방어, 하단 사업자 푸터는 유지합니다. 이번 단계는 사용자 안내와 운영 메뉴 정리 중심입니다.</div></section></main></body></html>`);
}

async function handleMobileFirstFlowGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rows = [
    ["/my", "첫 진입", "새 가계부 만들기, 초대코드 참여, 백업 로그인 안내"],
    ["/app", "매일 사용", "오늘 쓴 돈, 빠른 입력, 최근 기록, 필터, 수정/삭제"],
    ["/budget-alerts", "예산 확인", "오늘 사용 가능 금액, 월말 예상, 초과/주의 분류"],
    ["/my/analysis", "분석", "분류/요일/일자/결제수단 흐름 확인"],
    ["/app?view=calendar", "캘린더", "날짜별 기록 확인"],
    ["/my/households", "가계부 전환", "가족/모임/여행 가계부 전환·참여"],
    ["/my/backup", "백업", "CSV 백업과 가져오기 전 안전 확인"],
  ].map((r) => `<tr><td><code>${escapeHtml(r[0])}</code></td><td><b>${escapeHtml(r[1])}</b></td><td>${escapeHtml(r[2])}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 모바일 흐름</title><style>${userPolishBaseStyle()}</style></head><body>${renderUnifiedNav("mobile-first-flow")}<main class="wrap"><section class="hero"><span class="tag">모바일 우선</span><h1>휴대폰에서 보는 순서대로 정리</h1><p>카카오톡이나 모바일 브라우저에서 쓰는 사용자는 입력과 확인이 빠르면 됩니다. 운영/점검 기능은 뒤로 숨깁니다.</p>${userPolishNav()}</section><section class="card"><h2>사용자 경로 기준</h2><div class="tableWrap"><table><thead><tr><th>경로</th><th>역할</th><th>보여줄 내용</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="notice"><b>모바일 기준</b><br/>첫 화면은 오늘 필요한 정보만 보여주고, 복잡한 설정은 예산/가계부/백업 같은 별도 화면으로 분리합니다.</section></main></body></html>`);
}

async function handleQuickInputHelpPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const examples = [
    ["점심 12000 국민카드", "오늘 지출 1건"],
    ["커피 4500 카카오페이", "결제수단 포함 지출"],
    ["월급 250만원", "수입으로 인식"],
    ["7월3일\n온열안대 9900 삼성카드\n풋샴푸 10150 삼성카드", "날짜 묶음 여러 줄 입력"],
    ["7월5일 쌀 36900 현대카드", "날짜+메모+금액+카드 입력"],
    ["01번 삭제", "최근 기록 번호 기준 삭제"],
    ["01번 금액 13000원", "최근 기록 번호 기준 수정"],
  ];
  const rows = examples.map(([a,b]) => `<tr><td><code>${escapeHtml(a)}</code></td><td>${escapeHtml(b)}</td></tr>`).join("");
  const copy = examples.slice(0,5).map(([a]) => a).join("\n\n");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 빠른 입력</title><style>${userPolishBaseStyle()}</style></head><body>${renderUnifiedNav("quick-input-help")}<main class="wrap"><section class="hero"><span class="tag">스마트 입력 안내</span><h1>사용자는 문장처럼 쓰면 됩니다</h1><p>금액, 날짜, 결제수단, 메모를 자연스럽게 적으면 웹과 카카오에서 같은 방식으로 처리됩니다.</p>${userPolishNav()}</section><section class="card"><h2>대표 입력 예시</h2><div class="tableWrap"><table><thead><tr><th>입력</th><th>동작</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card"><h2>복사용 예시</h2><div class="copy">${escapeHtml(copy)}</div></section><section class="notice"><b>오입력 안내 기준</b><br/>금액이 없거나 날짜만 있는 줄은 저장하지 않고, 저장 가능한 줄만 분리해서 처리합니다. 중복 저장 방어는 V20.2 기준을 유지합니다.</section></main></body></html>`);
}

async function handleMenuPolishGuidePage(request, env, url) {
  const title = escapeHtml(appName(env));
  const groups = [
    ["사용자 하단 메뉴", "입력, 분석, 캘린더, 예산, 가계부 전환"],
    ["첫 사용자 메뉴", "가계부 만들기, 초대코드 참여, 예산 설정, 카카오 기록"],
    ["운영자 메뉴", "운영센터, 배포점검, 트래픽, 스킬 운영, 중복 방어"],
    ["숨길 메뉴", "진단/감사/라우트 점검은 일반 사용자에게 직접 노출하지 않음"],
  ].map(([a,b]) => `<div class="step"><b>${escapeHtml(a)}</b><span>${escapeHtml(b)}</span></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 메뉴 정리</title><style>${userPolishBaseStyle()}</style></head><body>${renderUnifiedNav("menu-polish")}<main class="wrap"><section class="hero"><span class="tag">메뉴 정리</span><h1>사용자 메뉴와 운영 메뉴를 분리합니다</h1><p>실제 사용자는 기록과 확인에 집중하고, 점검/배포/운영 항목은 운영센터 안에서 관리합니다.</p>${userPolishNav()}</section><section class="grid">${groups}</section><section class="card"><h2>추천 운영 기준</h2><div class="ok">일반 사용자에게는 /my, /app, 예산, 캘린더, 분석, 가계부 전환, 백업만 자연스럽게 보이면 충분합니다. 운영자는 /operation-center에서 전체 상태를 확인합니다.</div></section></main></body></html>`);
}

async function handleBetaChecklistPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const checks = [
    ["카카오 심사", "하단 사업자 푸터, 개인정보/이용안내, Skill URL 확인"],
    ["계정", "카카오 로그인 실패 시 백업 로그인 안내 확인"],
    ["가계부", "새 가계부 만들기, 초대코드 참여, 전환 흐름 확인"],
    ["권한", "viewer 저장 차단, member 자기 기록 중심 수정, owner/admin 관리 확인"],
    ["입력", "한 줄/여러 줄/날짜별 입력, 중복 저장 방어 확인"],
    ["예산", "오늘 예산, 남은 예산, 월말 예상, 정기지출 예정 확인"],
    ["모임", "여행/모임 가계부 생성, 정산 요약, 공유 문구 확인"],
    ["운영", "운영 대시보드, 트래픽, 스킬 발화, 중복 방어 이벤트 확인"],
    ["백업", "배포 전 JSON/CSV 백업, 가져오기 미리보기 확인"],
  ].map((r, i) => `<tr><td>${i+1}</td><td><b>${escapeHtml(r[0])}</b></td><td>${escapeHtml(r[1])}</td><td>□</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 베타 체크리스트</title><style>${userPolishBaseStyle()}</style></head><body>${renderUnifiedNav("beta-checklist")}<main class="wrap"><section class="hero"><span class="tag">베타 오픈 전 체크</span><h1>사용자에게 열기 전 마지막 확인</h1><p>3~4단계씩 기능을 묶어 올렸기 때문에, 베타 오픈 전에는 이 체크리스트로 사용자 흐름과 운영 안전장치를 같이 봅니다.</p>${userPolishNav()}</section><section class="card"><h2>체크리스트</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>영역</th><th>확인 내용</th><th>체크</th></tr></thead><tbody>${checks}</tbody></table></div></section><section class="notice"><b>배포 원칙</b><br/>문제가 생기면 새 기능을 더 붙이지 말고 HOTFIX로 해당 문제만 수정합니다. 사용자 데이터와 권한 구조를 건드리는 변경은 별도 FEATURE 버전으로 분리합니다.</section></main></body></html>`);
}

async function handleRealUserQaPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const householdId = String(url.searchParams.get("household_id") || "").trim();
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const cards = [
    ["/app", "빠른 입력", "한 줄·여러 줄·날짜별 입력 후 분류와 결제수단이 카카오와 비슷하게 잡히는지 확인", `/app?month=${encodeURIComponent(month)}${hh}#add`],
    ["/my/households", "가계부 생성/참여", "기존 가계부가 있어도 새 모임·여행 가계부를 만들고 초대코드 참여가 가능한지 확인", "/my/households"],
    ["/menu", "사용자 메뉴", "운영/점검 메뉴가 일반 전체보기에서 보이지 않는지 확인", `/menu?month=${encodeURIComponent(month)}${hh}`],
    ["/budget-alerts", "예산 알림", "오늘예산·월말예상·정기지출예정·초과/주의 분류가 자연스럽게 보이는지 확인", `/budget-alerts?month=${encodeURIComponent(month)}${hh}`],
    ["/settlement-summary", "모임 정산", "참여자별 지출과 1/N 정산 요약이 선택 가계부 범위 안에서만 보이는지 확인", `/settlement-summary?month=${encodeURIComponent(month)}${hh}`],
    ["/smart-tools", "무료 스마트 도구", "월말 예상·반복지출·이상지출과 무료 제공 안내가 정확한지 확인", `/smart-tools?month=${encodeURIComponent(month)}${hh}`],
    ["/privacy", "심사 정보", "개인정보 안내와 하단 사업자 푸터가 자연스럽게 표시되는지 확인", "/privacy"],
    ["/ops-dashboard", "운영 로그", "최근 오류·트래픽·중복 방어 이벤트가 운영자 화면에서만 보이는지 확인", "/ops-dashboard"],
  ].map(([route, name, desc, href]) => `<a class="qaCard" href="${escapeHtml(href)}"><code>${escapeHtml(route)}</code><b>${escapeHtml(name)}</b><span>${escapeHtml(desc)}</span></a>`).join("");
  const steps = [
    "V20.7.2를 배포한 뒤 실제 모바일 브라우저에서 /app 입력을 먼저 확인합니다.",
    "가계부를 2개 이상 만든 뒤 기록·예산·분석·정산이 서로 섞이지 않는지 확인합니다.",
    "사용자 /menu에는 운영·점검 항목이 보이지 않고, 운영자는 /operation-center에서만 확인합니다.",
    "빠른 입력 샘플 30개 중 이상한 분류가 나오면 기능 추가가 아니라 키워드 HOTFIX로만 처리합니다.",
  ].map((x,i)=>`<li><b>${i+1}</b><span>${escapeHtml(x)}</span></li>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 실사용 QA</title><style>${userPolishBaseStyle()}.qaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.qaCard{display:block;text-decoration:none;color:#111827;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px;box-shadow:0 10px 24px rgba(15,23,42,.05)}.qaCard code{display:inline-flex;background:#eff6ff;color:#1e3a8a;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:1000}.qaCard b{display:block;margin-top:10px;font-size:17px}.qaCard span{display:block;color:#64748b;line-height:1.45;margin-top:6px}.stepList{list-style:none;padding:0;margin:0;display:grid;gap:9px}.stepList li{display:flex;gap:10px;align-items:flex-start;background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px}.stepList b{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:999px;background:#111827;color:#fff}.stepList span{line-height:1.55}</style></head><body>${renderUnifiedNav("real-user-qa", { month, householdId })}<main class="wrap"><section class="hero"><span class="tag">V20.8 실사용 QA</span><h1>실제 사용자 기준으로 마지막 어색함을 잡습니다</h1><p>기능을 더 붙이기보다 모바일 입력, 메뉴 노출, 가계부 전환, 무료 스마트 도구, 심사 정보, 운영 로그를 한 번에 확인하는 단계입니다.</p>${userPolishNav()}</section><section class="card"><h2>바로 눌러 확인할 화면</h2><div class="qaGrid">${cards}</div></section><section class="card"><h2>진행 순서</h2><ol class="stepList">${steps}</ol></section><section class="notice"><b>운영 원칙</b><br/>이 화면에서 발견된 문제는 V20.8.x HOTFIX로만 고칩니다. /my, /app, /skill 저장 로직과 권한 구조는 안정 버전으로 유지합니다.</section></main></body></html>`);
}

async function handleQuickInputQaPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const samples = [
    ["점심 12000 국민카드", "식비", "국민카드", "오늘 지출"],
    ["커피 4500 카카오페이", "카페/간식", "카카오페이", "오늘 지출"],
    ["월급 250만원", "급여", "", "수입"],
    ["7월3일 온열안대 9900 삼성카드", "의료/건강", "삼성카드", "날짜 지정"],
    ["7월3일 풋샴푸 10150 삼성카드", "생활용품", "삼성카드", "생활 항목"],
    ["7월5일 쌀 36900 현대카드", "장보기", "현대카드", "식자재"],
    ["7월6일 어린이식기 6000 현대카드", "육아/자녀", "현대카드", "육아 항목"],
    ["7월6일 마시멜로우 22000 현대카드", "카페/간식", "현대카드", "간식"],
    ["7월6일 시리얼 11640 현대카드", "장보기", "현대카드", "식품"],
    ["7월6일 김자반 7960 현대카드", "장보기", "현대카드", "식품"],
    ["택시 18000 토스", "교통/차량", "토스", "교통"],
    ["관리비 230000 계좌이체", "주거/관리", "계좌이체", "고정비"],
    ["넷플릭스 17000 신한카드", "구독", "신한카드", "구독"],
    ["소아과 15800 삼성카드", "의료/건강", "삼성카드", "병원"],
    ["다이소 8700 현금", "생활용품", "현금", "생활용품"],
  ];
  const rows = samples.map((r,i)=>`<tr><td>${i+1}</td><td><code>${escapeHtml(r[0])}</code></td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2] || "자동/미입력")}</td><td>${escapeHtml(r[3])}</td><td>□</td></tr>`).join("");
  const bulk = `7월3일\n온열안대 9900 삼성카드\n풋샴푸 10150 삼성카드\n\n7월5일\n쌀 36900 현대카드\n\n7월6일\n어린이식기 6000 현대카드\n마시멜로우 22000 현대카드\n시리얼 11640 현대카드\n김자반 7960 현대카드`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 빠른입력 QA</title><style>${userPolishBaseStyle()}.copy{white-space:pre-wrap;font-family:inherit;background:#111827;color:#fff;border-radius:18px;padding:14px;line-height:1.6}.tableWrap table{min-width:760px}.pass{background:#ecfdf5;border:1px solid #bbf7d0;color:#166534;border-radius:16px;padding:12px;line-height:1.55}</style></head><body>${renderUnifiedNav("quick-input-qa")}<main class="wrap"><section class="hero"><span class="tag">분류 샘플 QA</span><h1>빠른입력이 카카오처럼 분류되는지 확인합니다</h1><p>한 줄 입력과 여러 줄 날짜 묶음 입력을 같은 기준으로 테스트합니다. 실제 분류가 다르면 키워드만 보정하는 HOTFIX로 처리합니다.</p>${userPolishNav()}</section><section class="card"><h2>샘플별 기대 분류</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>입력</th><th>기대 분류</th><th>결제수단</th><th>메모</th><th>확인</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card"><h2>여러 줄 복사 테스트</h2><div class="copy">${escapeHtml(bulk)}</div></section><section class="pass"><b>통과 기준</b><br/>날짜·금액·결제수단·메모가 분리되고, 분류가 식비/장보기/생활용품/의료/육아 등으로 자연스럽게 들어가면 통과입니다.</section></main></body></html>`);
}

async function handleMemeCardContentPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const rows = [
    ["카드값 알림이 왔다", "내 표정도 함께 멈췄다", "놀란 고양이", "눈 동그랗게, 알림 카드 살짝 흔들기"],
    ["오늘은 절약할 거야", "배달앱이 먼저 말을 걸었다", "운동복 토끼", "손사래, 배달앱 반짝임"],
    ["모임비 정산 시작", "갑자기 모두가 조용해졌다", "펭귄 총무", "단톡방 말풍선이 점점 작아짐"],
    ["예산 안 넘겼다", "오늘은 나 자신 칭찬 완료", "왕관 카피바라", "색종이, 체크 아이콘 튕김"],
  ].map((r,i)=>`<tr><td>${i+1}</td><td><b>${escapeHtml(r[0])}</b><br/><span>${escapeHtml(r[1])}</span></td><td>${escapeHtml(r[2])}</td><td>${escapeHtml(r[3])}</td><td>전체이용가</td></tr>`).join("");
  const rules = [
    "비속어, 조롱, 폭력, 성적 표현, 음주/도박/담배/불법 암시는 사용하지 않습니다.",
    "돈을 못 썼다고 비난하지 않고, 가볍게 웃고 넘기는 표정 중심으로 만듭니다.",
    "카카오 심사에서 부적절하게 보일 수 있는 줄임말·은어는 피합니다.",
    "움직이는 이미지는 2~3초 루프, 흔들림/반짝임/표정 변화 정도로만 구성합니다.",
  ].map(x=>`<li>${escapeHtml(x)}</li>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 밈 카드 콘텐츠</title><style>${userPolishBaseStyle()}.policy{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}.policy li{margin:6px 0}.badge{display:inline-flex;background:#dcfce7;color:#166534;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:1000}.tableWrap table{min-width:760px}</style></head><body>${renderUnifiedNav("meme-card-content")}<main class="wrap"><section class="hero"><span class="tag">밈 카드 콘텐츠</span><h1>Nano Banana 2용 안전한 피식 밈 기준</h1><p>병맛은 살짝만, 문구는 전체이용가로, 카카오 심사에서 걸릴 수 있는 단어 없이 표정과 상황으로 웃기는 방향입니다.</p>${userPolishNav()}</section><section class="card"><h2>우선 제작 카드 4종</h2><div class="tableWrap"><table><thead><tr><th>#</th><th>문구</th><th>캐릭터</th><th>짧은 움직임 아이디어</th><th>등급</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card"><h2>콘텐츠 안전 규칙</h2><ul class="policy">${rules}</ul></section><section class="card"><h2>앱 반영 기준</h2><p><span class="badge">추천</span> 밈 이미지는 먼저 /meme-lab에서 검수하고, 공개/숨김 상태를 둔 뒤 /meme-archive와 공유 화면에 노출합니다. 자동 재생 GIF/WebP는 용량을 작게 유지하고, 정지 이미지 대체본도 같이 보관합니다.</p></section></main></body></html>`);
}
// @build:exports-start
export {
  handleBackupSafetyGuidePage, handleBetaChecklistPage, handleBetaStartPage,
  handleDeploymentCheckPage, handleHouseholdFlowGuidePage, handleKakaoGroupFlowPage,
  handleKakaoGroupLinksPage, handleKakaoLoginRecoveryGuidePage, handleMemeCardContentPage,
  handleMenuPolishGuidePage, handleMobileFirstFlowGuidePage, handleOpenBuilderFinalUtterancePage,
  handleQuickInputHelpPage, handleQuickInputQaPage, handleRealUserQaPage, handleReviewReadyPage,
  handleUiPolishCheckPage, handleUserPolishFinalPage, userPolishBaseStyle,
};
// @build:exports-end
