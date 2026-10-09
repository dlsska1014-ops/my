// @build:imports-start
import { READINESS_RPC_PROBE_BODIES } from "../runtime/config-readiness.js";
import { appName } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import {
  PASSWORD_KDF_ITERATIONS, checkAdminPassword, getAdminSecurityState, makeAdminSession,
  newPasswordSalt, pbkdf2PasswordHash, verifyAdminSession,
} from "../auth/crypto-admin-session.js";
import { dashboardQuery } from "./transactions-households.js";
import { fetchAdminHouseholds } from "../data/households-members-rows.js";
import { renderServerLoginHtml } from "./dashboard-page.js";
import { safeNavHouseholdId } from "./ops-diagnostics-pages.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { optionalSupabase } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

async function checkTableAvailable(env, table) {
  try {
    await supabase(env, `/rest/v1/${table}?select=*&limit=1`, { method: "GET" });
    return { ok: true, detail: "연결됨" };
  } catch (err) {
    return { ok: false, detail: safeError(err).slice(0, 160) };
  }
}

async function tableCheckPair(env, table) {
  const r = await checkTableAvailable(env, table);
  return [r.ok, r.detail];
}

// P0-2: /ready 준비 점검에서 핵심 RPC 존재 여부를 확인한다.
// 실제 파라미터 이름과 안전한 무효값을 보내 PostgREST가 함수 시그니처를
// 정확히 선택하게 한다. 함수가 존재하면 UUID 변환 또는 첫 입력 검증에서
// 쓰기 전에 실패하며, PGRST202일 때만 실제 누락으로 판정한다.
async function checkRpcAvailable(env, rpcName) {
  try {
    const probeBody = READINESS_RPC_PROBE_BODIES[rpcName];
    if (!probeBody) return { ok: false, detail: "점검 시그니처 없음" };
    await supabase(env, `/rest/v1/rpc/${rpcName}`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(probeBody) });
    return { ok: true, detail: "실행됨" };
  } catch (err) {
    const msg = safeError(err);
    if (/PGRST202|Could not find the function/i.test(msg)) {
      return { ok: false, detail: "함수 없음" };
    }
    return { ok: true, detail: "존재(안전 점검 중단)" };
  }
}

async function getSettingValue(env, key) {
  const rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { method: "GET" }, []);
  return rows?.[0]?.value || "";
}

async function getSettingValueStrict(env, key) {
  const rows = await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { method: "GET" });
  return rows?.[0]?.value || "";
}

async function handleSettingsPasswordUpdate(request, env) {
  if (!(await verifyAdminSession(request, env))) {
    return htmlResponse(renderServerLoginHtml(env, "보안 설정을 계속하려면 관리자 인증이 필요합니다.", "/settings"), 401);
  }
  const form = await request.formData();
  const current = String(form.get("current_password") || "").trim();
  const next = String(form.get("new_password") || "").trim();
  const confirm = String(form.get("confirm_password") || "").trim();
  if (!(await checkAdminPassword(env, current))) return redirectResponse("/settings?err=current_password_wrong");
  if (next.length < 10) return redirectResponse("/settings?err=password_too_short");
  if (next !== confirm) return redirectResponse("/settings?err=password_mismatch");
  const salt = newPasswordSalt();
  const hash = await pbkdf2PasswordHash(next, salt, PASSWORD_KDF_ITERATIONS);
  try {
    const state = await getAdminSecurityState(env);
    if (state.migration_required) throw new Error("schema_v22_7_0_auth_atomicity.sql required");
    await supabase(env, "/rest/v1/accountbook_admin_security?on_conflict=singleton", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        singleton: true,
        password_hash: hash,
        password_salt: salt,
        password_iterations: PASSWORD_KDF_ITERATIONS,
        password_version: Math.max(1, Number(state.password_version || 1)) + 1,
        session_version: Math.max(1, Number(state.session_version || 1)) + 1,
        updated_at: new Date().toISOString(),
      }),
    });
    await optionalSupabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent("admin_password_hash")}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, null);
    const session = await makeAdminSession(env);
    return redirectResponse("/settings?msg=password_updated", {
      "set-cookie": `ab_admin=${encodeURIComponent(session)}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`,
    });
  } catch (err) {
    return redirectResponse("/settings?err=settings_table_required");
  }
}

async function handleSettingsPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) {
    return htmlResponse(renderServerLoginHtml(env, "", `${url.pathname}${url.search}`), 401);
  }
  const state = await getAdminSecurityState(env);
  const settingValue = state.password_hash ? "v2" : await getSettingValue(env, "admin_password_hash");
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  return htmlResponse(renderSettingsHtml({ env, hasDbPassword: !!settingValue, msg, err }));
}

function renderSettingsHtml({ env, hasDbPassword, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const errMap = {
    current_password_wrong: "현재 비밀번호가 맞지 않습니다.",
    password_too_short: "새 비밀번호는 10자 이상으로 입력하세요.",
    password_mismatch: "새 비밀번호 확인이 일치하지 않습니다.",
    settings_table_required: "설정 저장 테이블이 없습니다. 설정 저장 구조을 관리자 설정에서 실행하세요.",
  };
  const msgMap = {
    password_updated: "관리자 비밀번호를 변경했습니다. 보안 설정 화면을 그대로 유지했습니다.",
  };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 설정</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.top{height:58px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 18px;position:sticky;top:0}.top a,.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:12px;border:1px solid #d1d5db;background:#fff;color:#111827;text-decoration:none;font-weight:900;padding:0 13px;cursor:pointer}.primary,button{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.wrap{max-width:840px;margin:0 auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:14px 0;box-shadow:0 8px 24px rgba(15,23,42,.055)}label{display:block;font-weight:900;margin:12px 0 6px}input{width:100%;height:44px;border:1px solid #cbd5e1;border-radius:14px;padding:0 12px;font:inherit}.muted{color:#64748b;font-size:13px;line-height:1.6}.ok{background:#dcfce7;color:#166534;border-radius:14px;padding:11px;margin:10px 0}.err{background:#fee2e2;color:#991b1b;border-radius:14px;padding:11px;margin:10px 0}.pill{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:900;font-size:12px;background:#eff6ff;color:#1d4ed8}.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:14px;padding:12px;line-height:1.6}</style></head><body>${renderUnifiedNav("settings")}<header class="top"><b>설정</b><nav><a href="/?legacy=1">관리자 홈</a> <a href="/app">모바일 입력</a> <a href="/diagnostics">시스템진단</a></nav></header><main class="wrap"><h1>보안 설정</h1>${msg ? `<div class="ok">${escapeHtml(msgMap[msg] || msg)}</div>` : ""}${err ? `<div class="err">${escapeHtml(errMap[err] || err)}</div>` : ""}<section class="card"><h2>관리자 비밀번호</h2><p class="muted">가계부 접속 비밀번호는 정상입니다. 가족/관리자 외 접근을 막기 위한 관리자 보호장치입니다. 비밀번호는 PBKDF2 방식으로 저장되며 원문은 보관하지 않습니다.</p><p><span class="pill">${hasDbPassword ? "앱 비밀번호 설정됨" : "Cloudflare 초기 비밀번호 사용 중"}</span></p><form method="post" action="/admin/settings/password"><label>현재 비밀번호</label><input name="current_password" type="password" autocomplete="current-password" required/><label>새 비밀번호</label><input name="new_password" type="password" autocomplete="new-password" minlength="10" required/><label>새 비밀번호 확인</label><input name="confirm_password" type="password" autocomplete="new-password" minlength="10" required/><p><button type="submit">비밀번호 변경</button></p></form><div class="warn"><b>중요</b><br/>변경하면 다른 관리자 로그인 세션은 즉시 만료되고 현재 화면은 유지됩니다. 이후에는 Cloudflare 초기 비밀번호가 로그인 수단으로 사용되지 않습니다.</div></section><section class="card"><h2>공유 설정</h2><p class="muted">공유 기능은 기본 공유와 문구 복사를 우선 제공합니다.</p></section><section class="card"><h2>저장 상태</h2><p class="muted">설정 저장이 정상 처리되는지 화면에서 확인하세요.</p></section></main></body></html>`;
}

function canonicalRouteRows(month = currentMonthKst(), householdId = "") {
  const hid = safeNavHouseholdId(householdId);
  const hh = hid ? `&household_id=${encodeURIComponent(hid)}` : "";
  return [
    ["관리자 홈", dashboardQuery(month, hid, { tab: "overview" }), "전체 현황"],
    ["기록 관리", dashboardQuery(month, hid, { tab: "transactions" }), "입력·수정·삭제"],
    ["모바일 입력", `/app?month=${encodeURIComponent(month)}${hh}`, "빠른 기록"],
    ["가계부·참여자", "/households", "가족/모임 공동 사용"],
    ["분류 설정", hid ? `/categories?household_id=${encodeURIComponent(hid)}` : "/categories", "카테고리"],
    ["예산 관리", `/budgets?month=${encodeURIComponent(month)}${hh}`, "월 수입 대비 예산"],
    ["무료 스마트 도구", `/smart-tools?month=${encodeURIComponent(month)}${hh}`, "예측·반복지출·리포트"],
    ["자동 리포트", `/reports?month=${encodeURIComponent(month)}${hh}`, "주간·월간 생성·공유"],
    ["결제수단", `/payment-methods?month=${encodeURIComponent(month)}${hh}`, "카드/계좌/간편결제"],
    ["정기지출 준비", `/reserve-plans?month=${encodeURIComponent(month)}${hh}`, "세금/보험 미리 준비"],
    ["백업·복구", `/backup?month=${encodeURIComponent(month)}${hh}`, "백업/복구/되돌리기 통합"],
    ["최종 사용자 준비 확인", "/user-ready-check", "사용자 화면 최종 확인"],
    ["사용자 배포 확인", "/release-check", "최종 사용자 흐름 확인"],
    ["운영센터", "/operation-center", "점검/배포/기능맵 통합"],
    ["설정", "/settings", "보안/공유 설정"],
  ];
}

async function handleRouteAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const selectedHousehold = households.find((h) => h.id === householdId) || households[0] || null;
  const rows = canonicalRouteRows(month, selectedHousehold?.id || "");
  const body = rows.map(([label, href, purpose]) => `<tr><td><b>${escapeHtml(label)}</b></td><td><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></td><td>${escapeHtml(purpose)}</td><td><span class="ok">표준</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>경로 점검</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.055);margin:14px 0}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters select,.filters input,.filters button{height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;font-size:14px}a{color:#2563eb;font-weight:900}.ok{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 9px;font-size:12px;font-weight:1000}.note{color:#64748b;line-height:1.6}</style></head><body>${renderUnifiedNav("route-audit", { month, householdId: selectedHousehold?.id || "" })}<main class="wrap"><section class="hero"><h1>경로 점검</h1><p class="note">화면마다 메뉴명이 달라지지 않도록 표준 메뉴명과 진입 경로를 한 곳에서 확인합니다.</p><form class="filters" method="get" action="/route-audit"><select name="household_id">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selectedHousehold?.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">기준 변경</button></form></section><table><thead><tr><th>표준 메뉴명</th><th>표준 경로</th><th>용도</th><th>상태</th></tr></thead><tbody>${body}</tbody></table></main></body></html>`);
}

async function handleTopTabAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const rows = [
    ["관리자 기록", "/?legacy=1&tab=transactions", "통합메뉴 1개 + 보조 상단 메뉴 숨김"],
    ["모바일 입력", "/app", "통합메뉴 1개 + 월/가계부 선택만 유지"],
    ["가계부·참여자", "/households", "옛 관리자/설정/기록 버튼 숨김"],
    ["분류 설정", "/categories", "옛 관리자/설정/기록 버튼 숨김"],
    ["설정", "/settings", "옛 관리자/앱/진단 탭 숨김"],
    ["점검/백업 화면", "/menu", "상단 보조 nav 숨김"],
  ];
  const body = rows.map(([name, route, rule]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><code>${escapeHtml(route)}</code></td><td>${escapeHtml(rule)}</td><td><span class="ok">정리됨</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>상단 탭 중복 점검</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.055);margin:14px 0}.note{color:#64748b;line-height:1.6}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;font-size:14px}code{background:#f1f5f9;border-radius:8px;padding:3px 7px}.ok{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 9px;font-size:12px;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900;padding:0 12px}</style></head><body>${renderUnifiedNav("nav-audit")}<main class="wrap"><section class="hero"><h1>상단 탭 중복 점검</h1><p class="note">모든 주요 화면의 상단 진입은 통합메뉴 1개로 통일하고, 각 화면에 남아 있던 보조 상단 탭은 숨깁니다.</p><p><a class="btn" href="/menu">통합메뉴로 이동</a></p></section><table><thead><tr><th>화면</th><th>대표 경로</th><th>정리 기준</th><th>상태</th></tr></thead><tbody>${body}</tbody></table></main></body></html>`);
}

async function handleRecordFlowAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const rows = [
    ["입력 저장", "/admin/transactions", "POST", "가계부·금액·날짜 검증 후 저장"],
    ["수정 저장", "/admin/update", "POST", "ID·가계부·금액·날짜 검증 후 수정"],
    ["단건 삭제", "/admin/delete", "POST", "ID 검증 후 삭제"],
    ["일괄 수정", "/admin/bulk", "POST", "선택 ID와 변경값 검증 후 수정"],
    ["일괄 삭제", "/admin/bulk", "POST", "선택 ID 검증 후 삭제"],
    ["오류 복귀", "return_to", "redirect", "현재 화면으로 오류/성공 메시지 유지"],
  ];
  const body = rows.map(([name, route, method, check]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><code>${escapeHtml(route)}</code></td><td>${escapeHtml(method)}</td><td>${escapeHtml(check)}</td><td><span class="ok">점검대상</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>기록 흐름 점검</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.055);margin:14px 0}.note{color:#64748b;line-height:1.6}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;font-size:14px}code{background:#f1f5f9;border-radius:8px;padding:3px 7px}.ok{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 9px;font-size:12px;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900;padding:0 12px}</style></head><body>${renderUnifiedNav("flow-audit")}<main class="wrap"><section class="hero"><h1>기록 흐름 점검</h1><p class="note">입력·수정·삭제·일괄변경의 저장 경로와 검증 기준입니다. 실제 DB 변경은 하지 않는 점검 화면입니다.</p><p><a class="btn" href="/?legacy=1&tab=transactions">기록 관리로 이동</a></p></section><table><thead><tr><th>흐름</th><th>경로</th><th>방식</th><th>검증</th><th>상태</th></tr></thead><tbody>${body}</tbody></table></main></body></html>`);
}
// @build:exports-start
export {
  checkRpcAvailable, checkTableAvailable, getSettingValue, getSettingValueStrict,
  handleRecordFlowAuditPage, handleRouteAuditPage, handleSettingsPage, handleSettingsPasswordUpdate,
  handleTopTabAuditPage, tableCheckPair,
};
// @build:exports-end
