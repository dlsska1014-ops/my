// @build:imports-start
import { appName } from "../public/site-config.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { dashboardQuery } from "../admin/transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { fetchPaymentAssets } from "../settings/payment-assets.js";
import { fetchReservePlans } from "../settings/reserve-plans.js";
import {
  countHouseholdTransactions, fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
  renderSpenderOptions,
} from "../data/households-members-rows.js";
import { getSettingValue } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { safeNavHouseholdId, safeNavMonth } from "../admin/ops-diagnostics-pages.js";
import { renderUnifiedNav } from "./unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { handleMyLogout } from "../auth/kakao-oauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  canManageMyHousehold, getMySelectedHousehold, householdNotFoundResponse, myAccessStatusResponse,
} from "../my/access-control.js";
import { fetchBudgets } from "../domain/budgets.js";
import { cursorPrefKey } from "../my/money-plan-home-layout.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "./login-page-side-nav.js";
import { fetchKakaoGroupLinkMap } from "../kakao/group-links-first-record.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function renderPublicStartGuideHtml({ env, url }) {
  const title = escapeHtml(appName(env));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 시작가이드</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 46%,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:980px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.step{background:#fff;border:1px solid #e8edf4;border-radius:22px;padding:16px}.step b{display:block;font-size:17px}.step span{display:block;color:#667085;margin-top:6px;line-height:1.5}.btn{display:inline-flex;background:#111827;color:#fff!important;text-decoration:none;border-radius:14px;padding:11px 14px;font-weight:1000}</style></head><body><main class="wrap"><section class="hero"><h1>${title} 시작가이드</h1><p>카카오 로그인 없이도 이름과 개인 접속코드로 시작할 수 있습니다.</p><p><a class="btn" href="/my">가계부 시작하기</a></p></section><section class="card"><h2>처음 사용 순서</h2><div class="grid"><div class="step"><b>1. 내 이름과 접속코드</b><span>/my에서 본인만 아는 코드로 접속합니다.</span></div><div class="step"><b>2. 새 가계부 만들기 또는 초대 참여</b><span>가족/모임별로 가계부를 나눕니다.</span></div><div class="step"><b>3. 수입·예산 설정</b><span>분류별 예산 합계가 월 예산이 됩니다.</span></div><div class="step"><b>4. 정기지출 등록</b><span>보험, 통신비, 관리비처럼 반복되는 돈을 등록합니다.</span></div><div class="step"><b>5. 키워드 연결</b><span>자주 쓰는 표현을 분류에 연결합니다.</span></div><div class="step"><b>6. 기록/분석 확인</b><span>홈, 캘린더, 종합분석에서 흐름을 확인합니다.</span></div></div></section></main></body></html>`;
}

function renderUserStartGuideHtml({ env, user, households = [], month = currentMonthKst(), checklist = null, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const userName = escapeHtml(user?.nickname || "사용자");
  if (!households.length) return renderMyStartChoiceHtml({ env, user, msg, err });
  const selected = households[0];
  const role = selected.role || "member";
  const qs = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const tabs = [
    ["home","홈·입력","/my?"+qs,"빠른 입력, 최근 기록, 지출자, 수정 이력을 확인합니다.","점심 12000원 국민카드처럼 간단히 입력하고, 최근 기록에서 수정/삭제합니다."],
    ["settings","예산·키워드","/my/settings?"+qs,"수입 계획, 분류별 예산, 정기지출, 키워드를 설정합니다.","분류별 예산 합계가 월 예산이 됩니다. 키워드는 ×/+로 관리합니다."],
    ["calendar","캘린더","/app?"+qs+"&view=calendar#calendar","날짜별 지출금액/건수와 그날 기록을 봅니다.","날짜를 눌러 하단 기록을 확인하고 바로 수정합니다."],
    ["analysis","분석","/my/analysis?"+qs,"예산 사용률, 소비 추이, 반복지출, 고정비를 분석합니다.","잔여 예산과 월말 예상 지출을 보며 조정합니다."],
    ["group","단톡방","/my/groups?"+qs,"카카오 챗봇이 있는 단톡방과 가계부를 연결합니다.","단톡방에서 ‘단톡방 연결 초대코드’를 입력해야 합니다."],
    ["members","참여자","/my/members?"+qs,"가족/모임 구성원과 초대코드를 확인합니다.","초대 후 권한과 표시 이름을 관리합니다."],
    ["backup","백업","/my/backup?"+qs,"CSV로 내보내고 가져옵니다.","정기적으로 백업해 데이터 실수를 줄입니다."],
  ];
  const ck = checklist || {};
  const ckMembers = safeArray(ck.members);
  const ckBudgets = safeArray(ck.budgets).filter((b) => { const c = String(b.category || ""); return c && c !== "__total" && c !== "__income" && !c.startsWith("__income"); });
  const ckAssets = safeArray(ck.paymentAssets);
  const ckReserves = safeArray(ck.reservePlans);
  const ckRows = safeArray(ck.rows);
  const ckGroupLinks = Object.values(safeObject(ck.groupLinks));
  const firstRecordCount = Math.max(0, Number(ck.firstRecordCount || 0));
  const hasKakaoRow = ckRows.some((r) => String(r.source || "").includes("kakao"));
  const hasGroupLink = ckGroupLinks.some((item) => String(item?.household_id || "") === String(selected.id));
  const hasFirstRecord = firstRecordCount > 0;
  const hasCheckedResult = hasFirstRecord && ck.resultChecked === true;
  const steps = [
    { name: "가계부 확인", done: households.length > 0, href: "/my/households", hint: `${selected.name} 선택됨` },
    { name: "첫 기록 남기기", done: hasFirstRecord, href: "/app?" + qs + "#add", hint: hasFirstRecord ? `기록 ${firstRecordCount}건 저장됨` : "금액과 내용만 입력해 저장하세요" },
    { name: "저장 결과 확인", done: hasCheckedResult, href: "/app?" + qs + "&tab=transactions&onboard_check=1#feed", hint: hasCheckedResult ? "최근 기록에서 저장 결과를 확인했어요" : hasFirstRecord ? "최근 기록에서 금액·내용·가계부를 확인하세요" : "저장 후 기록 목록에서 결과를 확인하세요" },
  ];
  const doneCount = steps.filter((st) => st.done).length;
  const stepPercent = Math.round((doneCount / steps.length) * 100);
  const optionalSteps = [
    ["참여자 초대", ckMembers.length >= 2, "/my/members?" + qs],
    ["단톡방 연결", hasGroupLink, "/my/groups?" + qs],
    ["예산·분류", ckBudgets.length > 0, "/my/settings?" + qs],
    ["결제수단", ckAssets.length > 0, "/payment-methods?" + qs],
    ["정기지출", ckReserves.length > 0, "/reserve-plans?" + qs],
    ["분석", ckRows.length >= 5, "/my/analysis?" + qs],
    ["백업", false, "/my/backup?" + qs],
  ];
  const optionalHtml = `<details class="card"><summary><b>함께 쓰기·예산 등 추가 설정</b></summary><p class="muted" style="color:#667085">처음부터 모두 설정하지 않아도 됩니다. 필요한 항목만 선택하세요.</p><div class="tabBtns">${optionalSteps.map(([name, done, href]) => `<a class="goBtn" href="${escapeHtml(href)}">${done ? "✓ " : ""}${escapeHtml(name)}</a>`).join("")}</div></details>`;
  const checklistHtml = checklist ? `<section class="card" data-start-household="${escapeHtml(selected.id)}"><h2>처음 3단계</h2><p class="muted" style="color:#667085">완료 <span data-start-count>${doneCount}/${steps.length}</span> · 지금 필요한 한 단계만 진행하세요.</p><div class="ckBar"><i style="width:${stepPercent}%"></i></div><ol class="ckList">${steps.map((st, i) => `<li class="${st.done ? "done" : ""}" ${i === 2 ? "data-start-result-step" : ""}><span class="ckNum">${st.done ? "✓" : i + 1}</span><div class="ckBody"><b>${escapeHtml(st.name)}</b><small>${escapeHtml(st.hint)}</small></div><a href="${escapeHtml(st.href)}">${st.done ? "보기" : "하러가기"}</a></li>`).join("")}</ol></section>${optionalHtml}` : "";
  const buttons = tabs.map(([id,label],i)=>`<button type="button" class="tabBtn ${i===0?'active':''}" data-tab="${id}">${escapeHtml(label)}</button>`).join("");
  const panels = tabs.map(([id,label,href,desc,detail],i)=>`<section class="tabPanel ${i===0?'active':''}" data-panel="${id}"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(desc)}</p><div class="tip">${escapeHtml(detail)}</div><p><a class="goBtn" href="${escapeHtml(href)}">바로가기</a></p></section>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 시작가이드</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 50%,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:30px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe}.tabBtns{display:flex;flex-wrap:wrap;gap:8px}.tabBtn{border:1px solid #dbe4ef;background:#f8fafc;color:#111827;border-radius:999px;padding:10px 13px;font-weight:1000;cursor:pointer}.tabBtn.active{background:#111827;color:#fff}.tabPanel{display:none;border:1px solid #e8edf4;border-radius:22px;padding:18px;margin-top:12px;background:#fff}.tabPanel.active{display:block}.tabPanel h3{margin-top:0}.tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.6}.goBtn{display:inline-flex;background:#111827;color:#fff!important;text-decoration:none;border-radius:14px;padding:11px 14px;font-weight:1000}.ckBar{height:10px;border-radius:999px;background:#e8edf4;overflow:hidden;margin:10px 0 14px}.ckBar i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:999px}.ckList{list-style:none;margin:0;padding:0;display:grid;gap:9px}.ckList li{display:grid;grid-template-columns:34px 1fr auto;gap:11px;align-items:center;border:1px solid #e8edf4;border-radius:18px;padding:12px;background:#fff}.ckList li.done{background:#f0fdf4;border-color:#bbf7d0}.ckNum{width:30px;height:30px;border-radius:999px;background:#eef2f7;color:#334155;display:flex;align-items:center;justify-content:center;font-weight:1000}.ckList li.done .ckNum{background:#22c55e;color:#fff}.ckBody b{display:block}.ckBody small{display:block;color:#667085;margin-top:2px;line-height:1.4}.ckList a{background:#111827;color:#fff!important;text-decoration:none;border-radius:12px;padding:9px 12px;font-weight:1000;white-space:nowrap}.ckList li.done a{background:#dcfce7;color:#166534!important}@media(max-width:560px){.ckList li{grid-template-columns:30px 1fr}.ckList a{grid-column:2;justify-self:start}}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, role, month, "guide")}<div class="pageMain"><section class="hero"><h1>${userName}님 시작가이드</h1><p>${escapeHtml(selected.name)} · ${escapeHtml(month)} · 필요한 기능만 탭으로 골라 보고 바로 이동하세요.</p></section>${checklistHtml}<section class="card"><h2>화면별 안내</h2><div class="tabBtns">${buttons}</div>${panels}</section><section class="card"><h2>입력 예시</h2><p class="tip">점심 12000원 국민카드<br/>커피 5000원 현금<br/>월급 250만원<br/>오늘 기록<br/>남은예산<br/>01번 금액 13000원</p></section></div></div></main><script>
(function(){try{var card=document.querySelector('[data-start-household]');if(!card)return;var hid=card.getAttribute('data-start-household')||'default';if(window.localStorage&&window.localStorage.getItem('ab:onboarding:result-checked:'+hid)==='1'){var step=card.querySelector('[data-start-result-step]');if(step&&!step.classList.contains('done')){step.classList.add('done');var num=step.querySelector('.ckNum');if(num)num.textContent='✓';var small=step.querySelector('.ckBody small');if(small)small.textContent='최근 기록에서 저장 결과를 확인했어요';var link=step.querySelector('a');if(link){link.textContent='보기';link.href='/app?household_id='+encodeURIComponent(hid)+'#feed';}var count=card.querySelector('[data-start-count]');if(count)count.textContent='3/3';var bar=card.querySelector('.ckBar i');if(bar)bar.style.width='100%';}}}catch(e){}})();
document.querySelectorAll('.tabBtn').forEach(function(btn){
  btn.addEventListener('click', function(){
    const id = btn.getAttribute('data-tab');
    document.querySelectorAll('.tabBtn').forEach(function(b){ b.classList.toggle('active', b === btn); });
    document.querySelectorAll('.tabPanel').forEach(function(p){ p.classList.toggle('active', p.getAttribute('data-panel') === id); });
  });
});
</script></body></html>`;
}

async function handleBeginnerGuidePage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) {
    const userId = await verifyUserSession(request, env);
    if (userId) {
      const user = await fetchUserById(env, userId);
      if (!user) return handleMyLogout();
      const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
      const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
      if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
      // V22.9.37 감사 H9: 없는 가계부 id 는 첫 가계부로 바꾸지 않고 찾을 수 없다고 알린다.
      if (access.invalidRequested) return householdNotFoundResponse({ env, user, requestedId: access.invalidRequested });
      const households = access.households;
      let checklist = null;
      if (access.selected) {
        const sel = access.selected;
        const [members, budgets, paymentAssets, reservePlans, rows, groupLinks, firstRecordCount] = await Promise.all([
          fetchHouseholdMembers(env, sel.id),
          fetchBudgets(env, sel.id, month),
          fetchPaymentAssets(env, sel.id),
          fetchReservePlans(env, sel.id),
          fetchAdminRows(env, { month, householdId: sel.id, type: "all" }),
          fetchKakaoGroupLinkMap(env),
          countHouseholdTransactions(env, sel.id),
        ]);
        checklist = {
          members,
          budgets,
          paymentAssets,
          reservePlans,
          rows,
          groupLinks,
          firstRecordCount,
          resultChecked: url.searchParams.get("result_checked") === "1",
        };
      }
      return htmlResponse(renderUserStartGuideHtml({ env, user, households, month, checklist, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
    }
    return htmlResponse(renderPublicStartGuideHtml({ env, url }));
  }
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  // V22.9.37 감사 H9: 관리자도 목록에 없는 가계부 id 를 첫 가계부로 바꾸지 않는다.
  const requestedHousehold = String(url.searchParams.get("household_id") || "").trim();
  if (requestedHousehold && !households.some((h) => String(h.id) === requestedHousehold)) return householdNotFoundResponse({ env, requestedId: requestedHousehold, listHref: "/households" });
  const householdId = requestedHousehold || households[0]?.id || "";
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const rows = householdId ? await fetchAdminRows(env, { month, householdId, type: "all" }) : [];
  const budgets = householdId ? await fetchBudgets(env, householdId, month) : [];
  const categories = householdId ? await fetchCustomCategories(env, householdId) : [];
  const payments = householdId ? await fetchPaymentAssets(env, householdId) : [];
  const reserves = householdId ? await fetchReservePlans(env, householdId) : [];
  const hasHousehold = households.length > 0;
  const hasIncomeBudget = budgets.some((b) => String(b.category) === "__income" && Number(b.amount || 0) > 0);
  const hasTotalBudget = budgets.some((b) => String(b.category) === "__total" && Number(b.amount || 0) > 0);
  const hasCategoryBudget = budgets.some((b) => !["__income","__total"].includes(String(b.category || "")) && Number(b.amount || 0) > 0);
  const hasKeywords = categories.some((c) => safeArray(c.keywords).length > 0);
  const hasPayment = payments.length > 0;
  const hasReserve = reserves.length > 0;
  const hasTx = rows.length > 0;
  const steps = [
    { no: 1, title: "우리집 가계부 선택", done: hasHousehold, body: "가족/부부/모임 단위로 장부를 나눕니다.", href: "/households", action: "가계부 관리" },
    { no: 2, title: "월 수입 기준 입력", done: hasIncomeBudget, body: "월급이나 평균 수입을 기준으로 예산 비율을 계산합니다.", href: `/budgets?month=${encodeURIComponent(month)}${hh}`, action: "수입 기준 입력" },
    { no: 3, title: "월 전체 예산 정하기", done: hasTotalBudget, body: "이번 달 쓸 수 있는 총 금액을 정합니다.", href: `/budgets?month=${encodeURIComponent(month)}${hh}`, action: "전체 예산 입력" },
    { no: 4, title: "분류별 예산 나누기", done: hasCategoryBudget, body: "식비, 교통, 보험처럼 자주 쓰는 분류별로 예산을 나눕니다.", href: `/budgets?month=${encodeURIComponent(month)}${hh}`, action: "분류 예산 설정" },
    { no: 5, title: "분류·키워드 설정", done: hasKeywords, body: "커피를 식비로 볼지 용돈으로 볼지 우리집 기준을 정합니다.", href: householdId ? `/categories?household_id=${encodeURIComponent(householdId)}` : "/categories", action: "키워드 설정" },
    { no: 6, title: "카드·현금·통장 등록", done: hasPayment, body: "신용카드, 체크카드, 현금, 통장, 간편결제를 나눠 등록합니다.", href: `/payment-methods?month=${encodeURIComponent(month)}${hh}`, action: "결제수단 등록" },
    { no: 7, title: "정기지출 준비", done: hasReserve, body: "재산세, 자동차세, 자동차보험처럼 큰돈을 미리 준비합니다.", href: `/reserve-plans?month=${encodeURIComponent(month)}${hh}`, action: "정기지출 등록" },
    { no: 8, title: "첫 기록 입력", done: hasTx, body: "카톡이나 모바일에서 '점심 12000원 국민카드'처럼 입력합니다.", href: `/app?month=${encodeURIComponent(month)}${hh}#add`, action: "첫 기록 입력" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const cards = steps.map((step) => `<div class="stepCard ${step.done ? "done" : ""}"><div class="stepNo">${step.done ? "✓" : step.no}</div><div class="stepBody"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.body)}</p><a href="${escapeHtml(step.href)}">${escapeHtml(step.action)}</a></div></div>`).join("");
  const examples = [["지출 입력", "점심 12000원 국민카드"], ["수입 입력", "월급 250만원"], ["키워드 분류", "스타벅스 커피 5000원"], ["정기지출", "자동차보험 120만원 8월"], ["요약 확인", "요약"]].map(([a,b]) => `<div class="ex"><span>${escapeHtml(a)}</span><b>${escapeHtml(b)}</b></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>시작가이드</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#10b981));color:#fff;border-radius:30px;padding:26px;margin:12px 0;box-shadow:0 18px 46px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:31px;letter-spacing:-.04em}.hero p{line-height:1.6;opacity:.94}.filters{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-top:14px}.filters select,.filters input,.filters button{height:44px;border:1px solid rgba(255,255,255,.35);border-radius:14px;padding:0 12px;font:inherit}.filters button{background:#FEE500;color:#111827;font-weight:1000;border:0}.progress{background:rgba(255,255,255,.16);height:12px;border-radius:999px;overflow:hidden;margin-top:14px}.progress i{display:block;height:100%;background:#FEE500;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.stepCard{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:16px;display:flex;gap:13px;box-shadow:0 10px 28px rgba(15,23,42,.055)}.stepCard.done{border-color:#a7f3d0;background:#f0fdf4}.stepNo{width:38px;height:38px;border-radius:15px;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:1000;flex:0 0 38px}.stepCard.done .stepNo{background:#10b981}.stepBody h3{margin:0;font-size:17px}.stepBody p{margin:6px 0 12px;color:#64748b;font-size:13px;line-height:1.5}.stepBody a{display:inline-flex;min-height:34px;align-items:center;text-decoration:none;background:#111827;color:#fff;border-radius:12px;padding:0 11px;font-weight:1000;font-size:13px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.ex{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #f1f5f9;padding:11px 0}.ex:last-child{border-bottom:0}.ex span{color:#64748b;font-size:13px;font-weight:800}.ex b{font-size:14px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}.filters{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("start-guide", { month, householdId })}<main class="wrap"><section class="hero"><h1>처음이라면 이 순서대로 시작하세요</h1><p>가계부 앱들이 공통으로 잘하는 장점은 복잡한 기능보다 “처음 설정 순서”를 쉽게 보여주는 것입니다. 아래 순서대로 설정하면 카톡 입력, 예산, 정기지출, 분석이 자연스럽게 연결됩니다.</p><form class="filters" method="get" action="/start-guide"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form><div class="progress"><i style="width:${percent}%"></i></div><p><b>${doneCount}/${steps.length}단계 완료</b> · 완료한 항목은 초록색으로 표시됩니다.</p></section><section class="grid">${cards}</section><section class="card"><h2>카톡 입력 예시</h2>${examples}</section></main></body></html>`);
}

async function handleUnifiedMenuPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk && !userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  let selectedHousehold = null;
  try {
    if (adminOk) {
      households = await fetchAdminHouseholds(env);
      // V22.9.37 감사 H9: 없는 가계부 id 는 첫 가계부로 바꾸지 않고 찾을 수 없다고 알린다(관리자·사용자 모두).
      const requestedAdmin = String(url.searchParams.get("household_id") || "").trim();
      if (requestedAdmin && !households.some((h) => String(h.id) === requestedAdmin)) return householdNotFoundResponse({ env, requestedId: requestedAdmin, listHref: "/households" });
    } else {
      const [user, access] = await Promise.all([
        fetchUserById(env, userId),
        getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || ""),
      ]);
      if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
      if (access.invalidRequested) return householdNotFoundResponse({ env, user, requestedId: access.invalidRequested });
      households = access.households;
      selectedHousehold = access.selected;
    }
  } catch (err) {
    households = [];
  }
  const requested = String(url.searchParams.get("household_id") || "").trim();
  selectedHousehold = selectedHousehold || households.find((h) => String(h.id) === requested) || households[0] || null;
  const hid = selectedHousehold?.id || "";
  const hh = hid ? `&household_id=${encodeURIComponent(hid)}` : "";
  const monthQs = `month=${encodeURIComponent(month)}${hh}`;
  // V22.9.37 감사 U14: 일반 참여자(member·viewer)에게는 관리자 전용 메뉴임을 미리 말한다(누르면 403 화면이었다).
  const adminOnlyNote = userId && selectedHousehold && !canManageMyHousehold(selectedHousehold.role) ? "관리자 전용 · " : "";
  const householdOptions = households.length
    ? households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === hid ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")
    : `<option value="">가계부 없음</option>`;
  const featured = [
    ["기록 입력", `/app?${monthQs}#add`, "금액과 내용만 빠르게", "plus"],
    ["최근 기록", `/app?${monthQs}&tab=transactions`, "확인·수정·삭제", "records"],
    ["정산", `/settlement-summary?${monthQs}`, "모임·여행 비용 정리", "settlement"],
    ["분석", `/my/analysis?${monthQs}`, "이번 달 소비 흐름", "stats"],
  ];
  const sections = [
    ["계획과 자산", "돈의 계획과 보유 현황", [
      ["예산", `/budgets?${monthQs}`, "이번 달 수입과 분류별 한도", "budget"],
      ["자산·결제수단", `/payment-methods?${monthQs}`, "통장·현금·카드·대출", "wallet"],
      ["정기 수입·지출", `/reserve-plans?${monthQs}`, "보험료·세금·반복 지출", "recurring"],
      ["캘린더", `/app?${monthQs}&view=calendar#calendar`, "날짜별 기록과 지출", "calendar"],
    ]],
    ["가계부 관리", "사람과 분류, 데이터 관리", [
      ["가계부 전환·추가", `/my/households?${monthQs}`, "새 가계부와 초대코드 참여", "switch"],
      ["참여자·초대", `/my/members?${monthQs}`, `${adminOnlyNote}구성원과 권한 관리`, "users"],
      ["분류·키워드", `/keyword-guide?${monthQs}`, "자동분류 기준 관리", "tag"],
      ["백업·복구", `/my/backup?${monthQs}`, "CSV·JSON으로 보관", "backup"],
    ]],
    ["분석과 자동화", "필요할 때 쓰는 보조 도구", [
      ["자동 리포트", `/reports?${monthQs}`, "주간·월간 소비 요약", "report"],
      ["스마트 분석", `/smart-tools?${monthQs}`, "예측·반복·이상 지출", "sparkle"],
      ["예산 알림", `/budget-alerts?${monthQs}`, "오늘 사용 가능 금액", "bell"],
    ]],
  ];
  const more = [
    ["내 계정·보안", `/my/backup-login?return_to=${encodeURIComponent(`/menu?${monthQs}`)}`, "계정 로그인·복구", "shield"],
    ["처음 시작", `/start-guide?${monthQs}`, "초보자 체크리스트", "check"],
    ["스마트 입력 도움말", "/quick-input-help", "한 줄·여러 줄 입력 예시", "chat"],
    ["카카오 명령어", "/kakao-commands", "챗봇 대표 발화", "chat"],
    ["이용안내", "/terms", "서비스 이용 기준", "file"],
    ["개인정보 안내", "/privacy", "데이터 처리 안내", "shield"],
  ];
  const row = ([label, href, desc, icon]) => `<a class="menuRow" href="${escapeHtml(href)}"><span class="menuRowIcon" aria-hidden="true" data-ab-nav-icon="${escapeHtml(icon)}"></span><span class="menuRowTitle">${escapeHtml(label)}</span><span class="menuRowDesc">${escapeHtml(desc)}</span><span class="menuArrow" aria-hidden="true">›</span></a>`;
  const sectionHtml = sections.map(([title, subtitle, links]) => `<section class="menuSection"><div class="menuSectionHead"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle)}</span></div><div class="menuList">${links.map(row).join("")}</div></section>`).join("");
  const featuredHtml = featured.map(([label, href, desc, icon]) => `<a class="featuredCard" href="${escapeHtml(href)}"><span class="featuredIcon" aria-hidden="true" data-ab-nav-icon="${escapeHtml(icon)}"></span><span class="featuredCopy"><b>${escapeHtml(label)}</b><span>${escapeHtml(desc)}</span></span><span class="menuArrow" aria-hidden="true">›</span></a>`).join("");
  const moreHtml = `<details class="advancedGroup"><summary><b>개인 설정과 도움말</b><span>필요할 때 열기</span></summary><div class="menuList">${more.map(row).join("")}</div></details>`;
  // V22.8.95 (10.1): 마우스 따라오는 표시 스위치. 테마·톤과 달리 이 값은 기기가
  // 아니라 계정에 붙으므로(지시서) 폼 하나로 서버에 저장한다. 데스크톱에서만 뜻이
  // 있어서 모바일에서는 아무것도 하지 않는다는 사실을 문구로 말한다.
  const cursorOn = String(await getSettingValue(env, cursorPrefKey(userId || "shared")).catch(() => "") || "") !== "off";
  const cursorSwitchHtml = `<form class="abCursorPref" method="post" action="/cursor-preference/save"><input type="hidden" name="household_id" value="${escapeHtml(hid)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><label class="abCursorPick"><input type="checkbox" name="cursor" value="on"${cursorOn ? " checked" : ""}/><span><b>마우스 따라오는 표시</b><small>마우스가 있는 큰 화면에서만 켜집니다. 동작 줄이기를 켜 두면 이 설정과 무관하게 나타나지 않습니다.</small></span></label><button type="submit">표시 설정 저장</button></form>`;
  const appearanceHtml = `<section class="abAppearancePanel" aria-labelledby="abAppearanceTitle"><div class="abAppearanceHead"><div><h2 id="abAppearanceTitle">화면 설정</h2><p>이 브라우저에서 사용할 화면 모드와 포인트 컬러를 선택하세요.</p></div><span class="abAppearanceDevice">기기별 저장</span></div><div class="abAppearanceRows"><div><b>화면 모드</b><div class="abAppearanceChoices" role="group" aria-label="화면 모드"><button type="button" data-ab-theme-choice="light" aria-pressed="false">라이트</button><button type="button" data-ab-theme-choice="dark" aria-pressed="false">다크</button></div></div><div><b>컬러톤</b><div class="abAppearanceChoices abToneChoices" role="group" aria-label="컬러톤"><button type="button" data-ab-tone-choice="blue" aria-pressed="false"><i class="abToneDot abToneBlue" aria-hidden="true"></i>블루</button><button type="button" data-ab-tone-choice="emerald" aria-pressed="false"><i class="abToneDot abToneEmerald" aria-hidden="true"></i>그린</button><button type="button" data-ab-tone-choice="violet" aria-pressed="false"><i class="abToneDot abToneViolet" aria-hidden="true"></i>바이올렛</button><button type="button" data-ab-tone-choice="amber" aria-pressed="false"><i class="abToneDot abToneAmber" aria-hidden="true"></i>앰버</button></div></div></div><p id="abAppearanceStatus" class="abAppearanceStatus" aria-live="polite">화면 설정을 불러오는 중입니다.</p>${cursorSwitchHtml}</section>`;
  // V22.9.34 감사 U1: 일반 사용자 화면에 로그아웃이 없어 공용 PC 에서 14일 세션이 남았다.
  // 관리자 세션은 운영 화면의 로그아웃을 쓴다.
  const logoutHtml = userId ? `<form class="menuLogout" method="post" action="/my/logout"><button type="submit">로그아웃</button><p>이 기기에서 로그인을 끝냅니다. 여러 사람이 쓰는 PC 라면 사용 뒤 꼭 로그아웃하세요.</p></form>` : "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>전체 메뉴</title><style>.menuLogout{margin:22px 0 6px;display:grid;justify-items:center;gap:8px;text-align:center}.menuLogout button{appearance:none;width:100%;max-width:340px;min-height:46px;border:1px solid currentColor;border-radius:14px;background:transparent;color:inherit;font:inherit;font-weight:800;cursor:pointer}.menuLogout p{margin:0;font-size:12.5px;line-height:1.5;opacity:.75}*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.menuPage select,.menuPage input,.menuPage button{border:1px solid #cfd6e1;border-radius:11px;background:#fff;color:#172033;padding:0 12px;font:inherit}.menuPage button{background:var(--ab12-action,#2457d6);color:#fff;border-color:var(--ab12-action,#2457d6);font-weight:700;cursor:pointer}.adminNote{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:13px;padding:12px 14px;line-height:1.55}</style></head><body>${renderUnifiedNav("menu", { month, householdId: hid, householdName: selectedHousehold?.name || "", role: userId ? String(selectedHousehold?.role || "") : "" })}<main class="wrap menuPage"><header class="menuHeader"><div><h1>전체 메뉴</h1></div><form class="menuContext" method="get" action="/menu"><select name="household_id" aria-label="가계부">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}" aria-label="기준 월"/><button type="submit">기준 변경</button></form></header>${adminOk ? `<p class="adminNote">관리자로 접속 중입니다. 운영·점검 기능은 운영센터에서 별도로 관리합니다.</p>` : ""}<section class="menuSection featuredSection"><div class="menuSectionHead"><h2>매일 쓰는 기능</h2><span>가장 자주 찾는 4개</span></div><div class="featuredGrid">${featuredHtml}</div></section><div class="menuSecondary">${sectionHtml}${moreHtml}</div><nav class="menuJourney" aria-label="처음 사용 순서"><div class="journeyStep"><span class="journeyNum">1</span><span class="journeyCopy"><b>가계부 선택</b><span>쓸 가계부가 맞는지 확인</span></span></div><div class="journeyStep"><span class="journeyNum">2</span><span class="journeyCopy"><b>첫 기록</b><span>금액과 내용만 입력</span></span></div><div class="journeyStep"><span class="journeyNum">3</span><span class="journeyCopy"><b>결과 확인</b><span>월 지출 확인</span></span></div></nav>${appearanceHtml}${logoutHtml}</main></body></html>`);
}

function renderPcSidebar(active, month, householdId, householdName = "") {
  const items = [
    ["overview", "관리자 홈", "⌂"],
    ["transactions", "기록 관리", "▤"],
    ["import", "파일 업로드", "⇧"],
    ["calendar", "달력", "◷"],
    ["analysis", "분석", "▣"],
    ["cleanup", "정리", "✓"],
    ["premium", "무료 스마트", "◇"],
  ];
  const m = safeNavMonth(month);
  const hid = safeNavHouseholdId(householdId);
  const hh = hid ? `&household_id=${encodeURIComponent(hid)}` : "";
  const extra = [
    ["모바일 입력", `/app?month=${encodeURIComponent(m)}${hh}`],
    ["가계부·참여자", "/households"],
    ["분류 설정", hid ? `/categories?household_id=${encodeURIComponent(hid)}` : "/categories"],
    ["시스템진단", "/diagnostics"],
    ["경로 점검", "/route-audit"],
    ["설정", "/settings"],
  ];
  return `<aside class="pcSidebar"><div class="pcSideLogo"><b>우리집 가계부</b><span>통합 관리</span></div><div class="pcSideUser"><div class="avatar">💸</div><div><b>${escapeHtml(householdName || "우리집")}</b><span>현재 가계부</span></div></div><nav class="pcSideNav">${items.map(([key,label,icon]) => `<a class="${active === key ? "active" : ""}" href="${escapeHtml(dashboardQuery(m, hid, { tab: key }))}"><i>${icon}</i><span>${label}</span></a>`).join("")}</nav><div class="pcSideBottom">${extra.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("")}<a href="/menu">통합메뉴</a><form method="post" action="/logout"><button type="submit">로그아웃</button></form></div></aside>`;
}

function renderMobileBottomNav(active, month, householdId) {
  const items = [
    ["overview", "관리자 홈", "⌂"],
    ["transactions", "기록 관리", "+"],
    ["calendar", "달력", "◷"],
    ["import", "파일 업로드", "⇧"],
    ["analysis", "분석", "▣"],
  ];
  return `<nav class="mobileBottomNav">${items.map(([key, label, icon]) => `<a class="${active === key ? "active" : ""}" href="${escapeHtml(dashboardQuery(month, householdId, { tab: key }))}${key === "transactions" ? "#quickAddSection" : ""}"><b>${icon}</b><span>${label}</span></a>`).join("")}</nav>`;
}

function onboardingExamples() {
  return [
    "점심 12000원",
    "커피 4500원 카드",
    "어제 병원 만오천원",
    "쿠팡 3만원 삼성페이",
    "수입 300만원 급여",
    "요약",
    "최근",
    "취소",
  ];
}

function renderQuickStartPanel({ month, household, origin = "", compact = false }) {
  const myUrl = origin ? `${origin}/my` : "/my";
  return `<section class="${compact ? "welcomeBanner" : "onboardHero"}"><h3>처음 시작하기</h3><p>기록, 분류, 가족 관리까지 한 화면에서 시작할 수 있도록 정리했습니다.</p><div class="onboardActions"><a href="${escapeHtml(dashboardQuery(month, household?.id || "", { tab: "guide" }))}">가이드</a><a class="soft" href="/households${household?.id ? `?household_id=${encodeURIComponent(household.id)}` : ""}">가계부·참여자</a><a class="soft" href="/categories">분류 설정</a><a class="soft" href="${escapeHtml(myUrl)}">내 프로필</a></div></section>`;
}

function renderGuideTab({ month, household, origin = "", skillUrl = "" }) {
  const examples = onboardingExamples().map((x, i) => `<div class="exampleChip ${i >= 5 ? "light" : ""}">${escapeHtml(x)}</div>`).join("");
  return `<section class="onboardHero"><h3>시작 가이드</h3><p class="muted">처음 쓰는 사람도 바로 기록할 수 있도록 핵심만 정리했습니다.</p><div class="onboardGrid"><div class="onboardStep"><b>1. 기록</b><span>점심 12000원처럼 짧게 입력하거나 모바일에서 금액부터 바로 기록합니다.</span></div><div class="onboardStep"><b>2. 분류</b><span>식비, 교통, 주거, 보험, 의료처럼 기본 분류를 추천하고 직접 분류를 추가할 수 있습니다.</span></div><div class="onboardStep"><b>3. 가족 관리</b><span>초대코드는 가계부·참여자 화면에서만 확인하고, 참여자는 관리자가 승인·제한·방출합니다.</span></div></div></section><section class="layout2"><div class="card"><h3>입력 예시</h3><div class="exampleGrid">${examples}</div><p class="muted">날짜와 결제수단을 함께 쓰면 더 정확합니다. 예: “어제 병원 만오천원”, “쿠팡 3만원 삼성페이”</p></div><div class="card"><h3>운영 메뉴</h3><div class="copyBox"><b>초대코드는 공개하지 않습니다.</b><br/><br/>가계부·참여자에서 초대코드 확인, 참여 승인, 방출, 이름 수정, 삭제를 처리하세요.</div><p class="muted"><a class="btn ghost" href="/households${household?.id ? `?household_id=${encodeURIComponent(household.id)}` : ""}">가계부·참여자</a> <a class="btn ghost" href="/categories">분류 설정</a></p></div></section><section class="layout2"><div class="card"><h3>기본 확인</h3><div class="checkList"><div class="checkItem"><span>✓</span><span>초대코드 입력 후 참여자 수 확인</span></div><div class="checkItem"><span>✓</span><span>카카오톡 입력 후 웹 반영 확인</span></div><div class="checkItem"><span>✓</span><span>요약, 최근, 취소 명령어 확인</span></div></div></div><div class="card"><h3>연결 정보</h3><div class="copyBox"><b>사용자 웹</b><br/>${escapeHtml(origin ? `${origin}/my` : "/my")}<br/><br/><b>스킬 URL</b><br/>${escapeHtml(skillUrl || "-")}</div></div></section>`;
}

function renderImportTab({ month, households = [], household, defaultHouseholdId = "", members = [] }) {
  const effectiveHouseholdId = household?.id || defaultHouseholdId || households[0]?.id || "";
  const selectedHousehold = households.find((h) => h.id === effectiveHouseholdId) || household || households[0] || null;
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === effectiveHouseholdId ? " selected" : ""}>${escapeHtml(h.name || "이름 없는 가계부")}</option>`).join("");
  const importSpenderOptions = renderSpenderOptions(members, "", "업로드 기본 지출자 선택");
  if (!households.length) {
    return `<section class="onboardHero"><h3>📥 엑셀/CSV 가져오기</h3><p class="muted">업로드하려면 먼저 가계부가 필요합니다.</p><div class="onboardActions"><a href="/households">가계부 만들기</a></div></section>`;
  }
  return `<section class="onboardHero"><h3>📥 엑셀/CSV 가져오기</h3><p class="muted">업로드할 가계부를 먼저 선택한 뒤 파일을 올리세요. 선택값은 Supabase에 저장될 household_id로 사용됩니다.</p><div class="templateLinks"><a class="btn ghost" href="/admin/import/template.csv">CSV 양식 다운로드</a><a class="btn ghost" href="/admin/import/template.xls">엑셀 양식 다운로드</a></div></section><section class="card"><h3>1. 업로드 대상 가계부 선택</h3><form method="get" action="/" class="calmFilters" style="margin:0"><input type="hidden" name="legacy" value="1"/><input type="hidden" name="tab" value="import"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><div class="filterTop"><div class="field"><label>가계부</label><select id="importHouseholdSelect" name="household_id" onchange="this.form.submit()">${householdOptions}</select></div><div class="filterActions"><button type="submit">선택 적용</button><a class="btn ghost" href="/households">가계부·참여자</a></div></div></form><p class="muted" style="margin-top:10px">현재 업로드 대상: <b>${escapeHtml(selectedHousehold?.name || "선택 안 됨")}</b></p></section><section class="importGrid"><div class="card"><h3>2. 파일 업로드</h3><div class="formField"><label>업로드 기본 지출자</label><select id="importUserId">${importSpenderOptions}</select></div><div class="importDrop"><input id="importFile" type="file" accept=".csv,.txt,.tsv,.xls,.xlsx"/><div class="fileHint">CSV, TXT, TSV는 바로 분석합니다. XLS/XLSX는 브라우저에서 변환을 시도하며, 안 되면 엑셀에서 CSV로 저장 후 업로드하세요.</div></div><h3 style="margin-top:18px">또는 내용 붙여넣기</h3><textarea id="importText" class="importPaste" placeholder="엑셀에서 복사해 붙여넣거나, 자유 형식으로 입력하세요.&#10;예:&#10;2026-06-18,지출,12000,식비,점심,카드&#10;어제 병원 만오천원&#10;수입 300만원 급여"></textarea><div class="onboardActions"><button type="button" onclick="previewImportRows()">미리보기</button><button type="button" onclick="uploadImportRows()">업로드</button><button class="soft" type="button" onclick="clearImportRows()">비우기</button></div><div id="importStatus" class="importStatus" style="margin-top:12px">파일을 선택하거나 내용을 붙여넣은 뒤 미리보기를 누르세요.</div></div><div class="card"><h3>자동 분석 기준</h3><div class="mappingList"><div><b>날짜</b><br/>날짜, 일자, 거래일, 사용일, 승인일, date, 1/1/26</div><div><b>금액</b><br/>금액, 결제금액, 실지출, 지출, 수입, 출금, 입금</div><div><b>분류/내용</b><br/>분류, 카테고리, 내용, 메모, 적요, 사용처, 가맹점</div><div><b>결제수단</b><br/>카드, 현금, 계좌, 결제수단, payment</div></div><p class="muted">분류가 비어 있으면 기존 카카오 입력 분석 규칙으로 자동 분류합니다.</p></div></section><section class="card"><h3>업로드 미리보기</h3><div id="importPreview" class="importPreview"><div class="empty">아직 미리보기 데이터가 없습니다.</div></div></section><script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script><script>
window.__IMPORT_HOUSEHOLD_ID__=${JSON.stringify(effectiveHouseholdId)};
function setImportStatus(msg, cls){var el=document.getElementById('importStatus');if(!el)return;el.className='importStatus '+(cls||'');el.textContent=msg;}
function clearImportRows(){document.getElementById('importText').value='';document.getElementById('importPreview').innerHTML='<div class="empty">아직 미리보기 데이터가 없습니다.</div>';setImportStatus('내용을 비웠습니다.','');}
function splitCsvLine(line){var out=[],cur='',q=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch=='"'){if(q&&line[i+1]=='"'){cur+='"';i++;}else q=!q;}else if((ch==','||ch=='\\t'||ch==';')&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;}
function guessLines(text){return String(text||'').split(/\\r?\\n/).map(function(x){return x.trim();}).filter(Boolean);}
function localPreviewRows(text){var lines=guessLines(text);var rows=[];for(var i=0;i<Math.min(lines.length,80);i++){var cells=splitCsvLine(lines[i]);rows.push(cells);}return rows;}
function renderImportPreview(text){var rows=localPreviewRows(text);if(!rows.length){document.getElementById('importPreview').innerHTML='<div class="empty">읽을 데이터가 없습니다.</div>';return;}var html='<table><tbody>';for(var i=0;i<Math.min(rows.length,30);i++){html+='<tr>'+rows[i].slice(0,8).map(function(c){return '<td>'+String(c||'').replace(/[&<>]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m];})+'</td>';}).join('')+'</tr>';}html+='</tbody></table>';document.getElementById('importPreview').innerHTML=html;setImportStatus('미리보기 '+rows.length+'행을 읽었습니다. 업로드 전 날짜/금액 열이 잘 보이는지 확인하세요.','ok');}
function previewImportRows(){renderImportPreview(document.getElementById('importText').value);}
function getImportHouseholdId(){var sel=document.getElementById('importHouseholdSelect');return (sel&&sel.value)||window.__IMPORT_HOUSEHOLD_ID__||'';}
async function uploadImportRows(){var raw=document.getElementById('importText').value;var householdId=getImportHouseholdId();if(!householdId){setImportStatus('업로드할 가계부를 먼저 선택하세요. 상단의 가계부 선택 후 다시 시도하세요.','err');return;}if(!raw.trim()){setImportStatus('업로드할 내용이 없습니다.','err');return;}setImportStatus('업로드 중입니다...','');try{var res=await fetch('/admin/import/json',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({household_id:householdId,user_id:(document.getElementById('importUserId')?document.getElementById('importUserId').value:''),raw_text:raw})});var text=await res.text();var data=null;try{data=JSON.parse(text);}catch(parseErr){var head=String(text||'').slice(0,80).replace(/\s+/g,' ');throw new Error(res.status===401?'로그인 세션이 만료되었습니다. 새로고침 후 다시 로그인하세요.':'서버가 JSON이 아닌 응답을 보냈습니다: '+head);}if(!res.ok||!data.ok)throw new Error((data&&(data.message||data.error))||('서버 오류 HTTP '+res.status));setImportStatus('업로드 완료: '+data.inserted+'건 저장, '+data.skipped+'건 제외'+(data.date_samples&&data.date_samples.length?' · 날짜 예시: '+data.date_samples.join(', '):''),'ok');}catch(e){setImportStatus('업로드 실패: '+(e.message||e),'err');}}
document.getElementById('importFile').addEventListener('change',function(ev){var file=ev.target.files&&ev.target.files[0];if(!file)return;var name=(file.name||'').toLowerCase();if(/\\.xlsx?$/.test(name)){var reader=new FileReader();reader.onload=function(e){try{if(!window.XLSX)throw new Error('엑셀 변환 라이브러리를 불러오지 못했습니다. CSV로 저장 후 다시 업로드하세요.');var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false});var ws=wb.Sheets[wb.SheetNames[0]];var csv=XLSX.utils.sheet_to_csv(ws,{rawNumbers:false});document.getElementById('importText').value=csv;renderImportPreview(csv);}catch(err){setImportStatus(err.message||String(err),'err');}};reader.readAsArrayBuffer(file);}else{var r=new FileReader();r.onload=function(e){document.getElementById('importText').value=e.target.result;renderImportPreview(e.target.result);};r.readAsText(file,'utf-8');}});
</script>`;
}

function renderTabs(active, month, householdId, extra) {
  const tabs = [
    ["overview", "홈"],
    ["transactions", "기록 관리"],
    ["calendar", "달력"],
    ["analysis", "분석"],
    ["cleanup", "정리"],
    ["import", "파일"],
    ["guide", "가이드"],
    ["premium", "무료 스마트"],
  ];
  const normal = tabs.map(([key, label]) => `<a class="tab ${active === key ? "active" : ""}" href="${escapeHtml(dashboardQuery(month, householdId, { ...extra, tab: key }))}">${label}</a>`).join("");
  const tools = `<a class="tab tool" href="/households${householdId ? `?household_id=${encodeURIComponent(householdId)}` : ""}">가계부·참여자</a><a class="tab tool" href="/categories${householdId ? `?household_id=${encodeURIComponent(householdId)}` : ""}">분류설정</a><a class="tab tool" href="/kakao-recent">카카오확인</a><a class="tab tool" href="/diagnostics">시스템진단</a><a class="tab tool" href="/app">모바일 입력</a>`;
  return `<nav class="tabs">${normal}${tools}</nav>`;
}

function renderCalendarFilterScript(selectedDate) {
  return `<script>(function(){try{var active=${JSON.stringify(selectedDate || "")};function qs(s){return document.querySelector(s)}function qsa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}function apply(date){var visible=0;qsa('.tx-row').forEach(function(r){var show=!date||r.getAttribute('data-date')===date;r.classList.toggle('hiddenByDate',!show);if(show)visible++;});qsa('.calendarDay').forEach(function(a){a.classList.toggle('selected',a.getAttribute('data-date')===date);});var note=qs('#txFilterNote');if(note)note.textContent=date?(date+' 거래 '+visible+'건 표시 중'):(visible+'건 전체 표시 중');var u=new URL(location.href);if(date){u.searchParams.set('date',date);u.searchParams.set('tab','calendar');}else{u.searchParams.delete('date');}history.replaceState(null,'',u.pathname+u.search+(date?'#transactionsSection':''));}qsa('.calendarDay').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var d=this.getAttribute('data-date');apply(d);var t=qs('#transactionsSection');if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth',block:'start'});});});var clear=qs('#clearDateFilter');if(clear){clear.addEventListener('click',function(){apply('');});}if(active)apply(active);}catch(e){console.log('calendar filter disabled',e);}})();</script>`;
}

function renderAutoRefreshScript() {
  return `<script>(function(){try{document.documentElement.setAttribute('data-autorefresh','off');}catch(e){}})();</script>`;
}
// @build:exports-start
export {
  handleBeginnerGuidePage, handleUnifiedMenuPage, renderAutoRefreshScript,
  renderCalendarFilterScript, renderGuideTab, renderImportTab, renderMobileBottomNav,
  renderPcSidebar, renderQuickStartPanel, renderTabs,
};
// @build:exports-end
