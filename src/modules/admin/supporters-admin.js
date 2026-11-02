// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { adminLoginLocation, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { safeArray } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { normalizeLocalLoginName } from "../auth/identity-reauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  fetchSupporterFlag, fetchSupporterRows, supporterDateV22995, supporterFlagActive,
  supporterInValueV22995, supporterSettingsKey, supporterTextV22995, supporterTodayV22995,
} from "../my/supporters.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { optionalSupabase } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
// V22.9.95 후원: 관리자 후원자 설정(/admin/supporters). 운영자가 송금을 확인한 뒤 사용자 한 명에게 후원자 표시를 켜고(설정 표 한 줄
// supporter:<user_id>), 끝나는 날·메모·공개 명단 이름을 고치거나 지운다. 새 표·SQL 없음. 금액·계좌 같은 결제 정보는 받지 않는다.
// CSRF 는 다른 관리자 폼처럼 라우터의 전역 확인(같은 출처 POST 만 통과)에 맡기고, 세션은 verifyAdminSession 으로 본다.
const SUPPORTER_ADMIN_MESSAGES_V22995 = Object.freeze({
  saved: "후원자 표시를 저장했어요.",
  removed: "후원자 표시를 지웠어요.",
});
const SUPPORTER_ADMIN_ERRORS_V22995 = Object.freeze({
  form: "입력을 읽지 못했어요. 다시 시도해 주세요.",
  user_required: "찾을 사용자를 적어 주세요.",
  user_not_found: "그 사용자를 찾지 못했어요. user_id 나 로그인 이름을 다시 확인해 주세요.",
  user_ambiguous: "같은 표시 이름이 여러 명이에요. user_id 나 로그인 이름으로 찾아 주세요.",
  since_invalid: "시작일은 YYYY-MM-DD 꼴로 적어 주세요.",
  until_invalid: "끝나는 날은 YYYY-MM-DD 꼴로 적거나 비워 두세요.",
  until_before_since: "끝나는 날이 시작일보다 빨라요.",
  confirm_required: "지우려면 확인 문구 칸에 ‘제거’ 를 적어 주세요.",
  save_failed: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  remove_failed: "지우지 못했어요. 잠시 뒤 다시 시도해 주세요.",
});

function supporterAdminRedirectV22995(params = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const query = search.toString();
  return redirectResponse(`/admin/supporters${query ? `?${query}` : ""}`);
}

// 사용자 찾기: user_id(그대로), 로그인 이름(로컬 로그인 아이디), 표시 이름(정확히 한 명일 때만) 가운데 관리자가 고른 방법 하나.
async function supporterAdminFindUserV22995(env, who = "", by = "user_id") {
  const text = String(who || "").trim().slice(0, 120);
  if (!text) return { error: "user_required" };
  if (by === "login") {
    const login = normalizeLocalLoginName(text);
    if (!login) return { error: "user_not_found" };
    const rows = await supabase(env, `/rest/v1/accountbook_user_identities?provider=eq.local&provider_subject=eq.${encodeURIComponent(login)}&select=user_id&limit=2`, { method: "GET" }).catch(() => []);
    const ids = [...new Set(safeArray(rows).map((row) => String(row?.user_id || "")).filter(Boolean))];
    if (ids.length !== 1) return { error: "user_not_found" };
    const user = await fetchUserById(env, ids[0]).catch(() => null);
    return user?.id ? { user } : { error: "user_not_found" };
  }
  if (by === "nickname") {
    const rows = await supabase(env, `/rest/v1/users?nickname=eq.${encodeURIComponent(text)}&select=id,nickname&limit=2`, { method: "GET" }).catch(() => []);
    const list = safeArray(rows).filter((row) => row?.id);
    if (list.length === 1) return { user: list[0] };
    return { error: list.length > 1 ? "user_ambiguous" : "user_not_found" };
  }
  const user = await fetchUserById(env, text).catch(() => null);
  return user?.id ? { user } : { error: "user_not_found" };
}

async function supporterAdminNamesV22995(env, ids = []) {
  const list = [...new Set(safeArray(ids).filter(Boolean))].slice(0, 100);
  const names = new Map();
  if (!list.length) return names;
  const params = new URLSearchParams();
  params.set("id", `in.(${list.map(supporterInValueV22995).join(",")})`);
  params.set("select", "id,nickname");
  params.set("limit", String(list.length));
  const rows = await optionalSupabase(env, `/rest/v1/users?${params.toString()}`, { method: "GET" }, []);
  for (const row of safeArray(rows)) names.set(String(row?.id || ""), String(row?.nickname || ""));
  return names;
}

function supporterAdminStateV22995(flag, today) {
  if (!flag) return ["값 오류", "bad"];
  if (flag.since > today) return ["시작 전", "wait"];
  return supporterFlagActive(flag, today) ? ["켜짐", "on"] : ["끝남", "off"];
}

async function handleSupportersAdminPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse(adminLoginLocation(url));
  const rows = await fetchSupporterRows(env, 500);
  const names = await supporterAdminNamesV22995(env, safeArray(rows).map((row) => row.user_id));
  const today = supporterTodayV22995();
  const msg = SUPPORTER_ADMIN_MESSAGES_V22995[String(url.searchParams.get("msg") || "")] || "";
  const err = SUPPORTER_ADMIN_ERRORS_V22995[String(url.searchParams.get("err") || "")] || "";
  const editId = String(url.searchParams.get("user_id") || "").trim();
  const editing = editId ? safeArray(rows).find((row) => row.user_id === editId) || null : null;
  const editFlag = editing?.flag || null;
  const tableRows = rows === null
    ? `<tr><td colspan="9">후원자 목록을 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요.</td></tr>`
    : rows.map((row) => {
      const [stateLabel, stateKey] = supporterAdminStateV22995(row.flag, today);
      const id = escapeHtml(row.user_id);
      return `<tr><td><code>${id}</code></td><td>${escapeHtml(names.get(row.user_id) || "(이름 없음)")}</td><td><span class="state ${stateKey}">${stateLabel}</span></td><td>${escapeHtml(row.flag?.since || "-")}</td><td>${escapeHtml(row.flag?.until || "없음")}</td><td>${escapeHtml(row.flag?.note || "")}</td><td>${escapeHtml(row.flag?.public_name || "(명단에 안 보임)")}</td><td><a href="/admin/supporters?user_id=${encodeURIComponent(row.user_id)}#edit">고치기</a></td><td><form method="post" action="/admin/supporters/remove" class="inline"><input type="hidden" name="user_id" value="${id}"/><label>확인 문구 <input name="confirm_text" placeholder="제거" autocomplete="off" required/></label><button type="submit" class="danger">제거</button></form></td></tr>`;
    }).join("") || `<tr><td colspan="9">아직 후원자 표시가 없어요.</td></tr>`;
  const value = (key) => escapeHtml(editFlag?.[key] || "");
  const finder = editing
    ? `<input type="hidden" name="user_id" value="${escapeHtml(editing.user_id)}"/><p>고치는 사용자: <code>${escapeHtml(editing.user_id)}</code> · ${escapeHtml(names.get(editing.user_id) || "(이름 없음)")} <a href="/admin/supporters#edit">새로 추가하기</a></p>`
    : `<div class="grid"><label class="field">찾는 방법<select name="by"><option value="user_id">user_id</option><option value="login">로그인 이름(아이디)</option><option value="nickname">표시 이름(한 명일 때만)</option></select></label><label class="field">사용자<input name="who" required maxlength="120" autocomplete="off"/></label></div>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>후원자 관리</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.06)}.hero{background:#111827;color:#fff}.hero p{color:#ede9fe;line-height:1.6}.hero a{color:#fff}.ok,.error,.warn{border-radius:15px;padding:12px;line-height:1.55}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px;margin:10px 0;font-weight:700}.field input,.field select{height:44px;border:1px solid #d0d5dd;border-radius:12px;padding:0 12px;font:inherit;font-weight:400}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-top:1px solid #e5e7eb;padding:10px 8px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}button{min-height:44px;border:0;border-radius:12px;padding:0 16px;font:inherit;font-weight:800;background:#111827;color:#fff;cursor:pointer}button.danger{background:#b42318}.inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline input{height:36px;width:72px;border:1px solid #d0d5dd;border-radius:10px;padding:0 8px}.state{display:inline-block;border-radius:999px;padding:2px 8px;font-weight:800;font-size:12px}.state.on{background:#dcfce7;color:#166534}.state.off{background:#f2f4f7;color:#475467}.state.wait{background:#eff6ff;color:#1d4ed8}.state.bad{background:#fef2f2;color:#991b1b}@media(max-width:720px){.grid{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("identity-audit", { scope: "admin" })}<main class="wrap"><section class="hero"><h1>후원자 관리</h1><p>송금을 확인한 사용자에게 후원자 배지와 포인트 색을 켜요. 기능은 후원과 관계없이 같아요. 오늘(KST) ${escapeHtml(today)} 기준으로 끝나는 날이 지나면 저절로 꺼져요.</p><p><a href="/ops-dashboard">운영 대시보드</a> · <a href="/support">공개 후원 안내</a></p></section>${msg ? `<p class="ok" role="status">${escapeHtml(msg)}</p>` : ""}${err ? `<p class="error" role="alert">${escapeHtml(err)}</p>` : ""}<section class="card"><h2>후원자 목록</h2><div class="tableWrap"><table><thead><tr><th scope="col">user_id</th><th scope="col">표시 이름</th><th scope="col">상태</th><th scope="col">시작일(since)</th><th scope="col">끝나는 날(until)</th><th scope="col">메모(note)</th><th scope="col">명단 이름(public_name)</th><th scope="col">고치기</th><th scope="col">제거</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="card" id="edit"><h2>${editing ? "후원자 표시 고치기" : "후원자 표시 추가"}</h2><form method="post" action="/admin/supporters/save">${finder}<div class="grid"><label class="field">시작일(비우면 ${editing ? "그대로" : "오늘"})<input name="since" placeholder="YYYY-MM-DD" value="${value("since")}" inputmode="numeric" maxlength="10"/></label><label class="field">끝나는 날(비우면 끝없음)<input name="until" placeholder="YYYY-MM-DD" value="${value("until")}" inputmode="numeric" maxlength="10"/></label><label class="field">메모(관리자만 봐요, 200자)<input name="note" value="${value("note")}" maxlength="200" autocomplete="off"/></label><label class="field">명단 이름(공개 /support 에 보임, 비우면 안 보임, 30자)<input name="public_name" value="${value("public_name")}" maxlength="30" autocomplete="off"/></label></div><p class="warn">명단 이름은 본인이 공개해도 된다고 한 이름만 적어요. 메모에는 계좌번호·금액 같은 결제 정보를 적지 않아요.</p><button type="submit">저장</button></form></section></main></body></html>`);
}

async function handleSupportersAdminSave(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/admin-view?return_to=%2Fadmin%2Fsupporters");
  const form = await request.formData().catch(() => null);
  if (!form) return supporterAdminRedirectV22995({ err: "form" });
  const field = (name) => String(form.get(name) || "").trim();
  let user = null;
  const fixedId = field("user_id");
  if (fixedId) {
    user = await fetchUserById(env, fixedId).catch(() => null);
    if (!user?.id) return supporterAdminRedirectV22995({ err: "user_not_found" });
  } else {
    const by = ["user_id", "login", "nickname"].includes(field("by")) ? field("by") : "user_id";
    const found = await supporterAdminFindUserV22995(env, field("who"), by);
    if (found.error) return supporterAdminRedirectV22995({ err: found.error });
    user = found.user;
  }
  const userId = String(user.id);
  const existing = await fetchSupporterFlag(env, userId).catch(() => null);
  const sinceRaw = field("since");
  const since = sinceRaw ? supporterDateV22995(sinceRaw) : existing?.since || supporterTodayV22995();
  if (!since) return supporterAdminRedirectV22995({ err: "since_invalid", user_id: fixedId });
  const untilRaw = field("until");
  const until = untilRaw ? supporterDateV22995(untilRaw) : null;
  if (untilRaw && !until) return supporterAdminRedirectV22995({ err: "until_invalid", user_id: fixedId });
  if (until && until < since) return supporterAdminRedirectV22995({ err: "until_before_since", user_id: fixedId });
  const flag = { since, until, note: supporterTextV22995(field("note"), 200), public_name: supporterTextV22995(field("public_name"), 30) || null };
  try {
    await saveSettingValue(env, supporterSettingsKey(userId), flag);
  } catch (_) {
    return supporterAdminRedirectV22995({ err: "save_failed", user_id: fixedId });
  }
  rememberOpsEvent({ kind: "supporter_flag_saved", severity: "info", path: "/admin/supporters/save", method: "POST", detail: `user=${userId}` });
  return supporterAdminRedirectV22995({ msg: "saved" });
}

async function handleSupportersAdminRemove(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/admin-view?return_to=%2Fadmin%2Fsupporters");
  const form = await request.formData().catch(() => null);
  if (!form) return supporterAdminRedirectV22995({ err: "form" });
  const userId = String(form.get("user_id") || "").trim();
  if (!userId) return supporterAdminRedirectV22995({ err: "user_required" });
  if (String(form.get("confirm_text") || "").trim() !== "제거") return supporterAdminRedirectV22995({ err: "confirm_required" });
  try {
    await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(supporterSettingsKey(userId))}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  } catch (_) {
    return supporterAdminRedirectV22995({ err: "remove_failed" });
  }
  rememberOpsEvent({ kind: "supporter_flag_removed", severity: "info", path: "/admin/supporters/remove", method: "POST", detail: `user=${userId}` });
  return supporterAdminRedirectV22995({ msg: "removed" });
}
// @build:exports-start
export { handleSupportersAdminPage, handleSupportersAdminRemove, handleSupportersAdminSave };
// @build:exports-end
