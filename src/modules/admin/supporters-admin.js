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
import {
  findUserIdByMemberCodeV229121, lookupMemberCodeV229121, memberCodeAvailableV229121,
  memberCodesForUsersV229121, normalizeMemberCodeV229121,
} from "../my/member-code.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { optionalSupabase } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
// V22.9.95 후원: 관리자 후원자 설정(/admin/supporters). 운영자가 송금을 확인한 뒤 사용자 한 명에게 후원자 표시를 켜고(설정 표 한 줄
// supporter:<user_id>), 끝나는 날·메모·공개 명단 이름을 고치거나 지운다. 새 표·SQL 없음. 금액·계좌 같은 결제 정보는 받지 않는다.
// CSRF 는 다른 관리자 폼처럼 라우터의 전역 확인(같은 출처 POST 만 통과)에 맡기고, 세션은 verifyAdminSession 으로 본다.
// V22.9.121: 후원한 분이 알려 주는 회원 번호(MB-XXXX-XXXX, my/member-code.js — 내 계정·보안 화면에 보인다)로 찾는다(찾는 방법 ‘회원 번호’, 기본값).
// 그리고 ‘전체 사용자 목록’ 칸: 표시 이름 일부·회원 번호·user_id 앞자리로 걸러 최근 가입 순 50명씩, 줄마다 회원 번호·표시 이름·계정 유형(카카오
// 로그인/로그인 이름/채팅 전용)·가입일(KST)·user_id 앞 8자·후원 상태와 ‘후원자 추가’(이미 있으면 ‘고치기’) 링크. 추가 링크는 아래 폼을 그 사용자로
// 채운다(?add=<user_id>#edit, 숨은 user_id — 저장은 예전처럼 user_id 를 받은 길). 다른 계정으로 합쳐진 계정(키 merged: 또는 이름 끝 ‘(통합됨)’)은
// ‘통합됨’ 표시만 하고 추가 링크가 없으며, 새로 켜는 저장도 받지 않는다(이미 있는 줄 고치기·제거는 그대로).
// 화면 한 번에 DB 호출은 많아야 5번이다: 관리자 세션 · 후원자 줄 · 사용자 한 쪽(또는 회원 번호 기억 줄 + 없거나 틀릴 때 훑기) · 그 쪽에 없는
// 사용자 줄(후원자 이름·추가할 사람·회원 번호로 찾은 사람). 사용자 줄은 로그인 수단(강한 식별)을 같은 호출에 포함해 읽는다 — 줄마다 읽지 않는다.
// 화면 GET 에서 훑어 찾은 번호는 기억 줄을 쓰지 않는다(쓰기는 내 계정·보안 화면이 보이면 보내는 신호 POST /my/member-code/seen 과
// 아래 찾기 POST 가 한다).
const SUPPORTER_ADMIN_MESSAGES_V22995 = Object.freeze({
  saved: "후원자 표시를 저장했어요.",
  removed: "후원자 표시를 지웠어요.",
});
const SUPPORTER_ADMIN_ERRORS_V22995 = Object.freeze({
  form: "입력을 읽지 못했어요. 다시 시도해 주세요.",
  user_required: "찾을 사용자를 적어 주세요.",
  user_not_found: "그 사용자를 찾지 못했어요. 회원 번호·user_id·로그인 이름을 다시 확인해 주세요.",
  user_ambiguous: "같은 표시 이름이 여러 명이에요. 회원 번호나 로그인 이름으로 찾아 주세요.",
  member_code_invalid: "회원 번호는 MB-XXXX-XXXX 꼴이에요.",
  member_code_unavailable: "회원 번호를 계산할 수 없어요. 운영 설정을 확인해 주세요.",
  user_merged: "다른 계정으로 합쳐진 계정이라 새로 켤 수 없어요. 전체 사용자 목록에서 ‘통합됨’ 이 없는 계정을 골라 주세요.",
  since_invalid: "시작일은 YYYY-MM-DD 꼴로 적어 주세요.",
  until_invalid: "끝나는 날은 YYYY-MM-DD 꼴로 적거나 비워 두세요.",
  until_before_since: "끝나는 날이 시작일보다 빨라요.",
  confirm_required: "지우려면 확인 문구 칸에 ‘제거’ 를 적어 주세요.",
  save_failed: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  remove_failed: "지우지 못했어요. 잠시 뒤 다시 시도해 주세요.",
});
const SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121 = 50;
// 사용자 줄 + 그 사람의 강한 식별(로그인 수단). kakao/identity-chat-first.js 가 쓰는 것과 같은 users → accountbook_user_identities 포함.
const SUPPORTER_ADMIN_USER_SELECT_V229121 = "id,nickname,created_at,kakao_user_key,accountbook_user_identities(provider)";
const SUPPORTER_ADMIN_SEPARATORS_V229121 = /[\s\-_.\u2010-\u2015\u2212]/g;

function supporterAdminRedirectV22995(params = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value));
  const query = search.toString();
  return redirectResponse(`/admin/supporters${query ? `?${query}` : ""}`);
}

// V22.9.121: 다른 계정으로 합쳐진 계정(합치기가 키를 merged: 로 바꾸고 이름 끝에 ‘(통합됨)’ 을 붙인다 — 세션도 받지 않는다).
function supporterAdminMergedV229121(user) {
  return String(user?.kakao_user_key || "").startsWith("merged:") || /\(통합됨\)\s*$/.test(String(user?.nickname || ""));
}

// 사용자 찾기: 회원 번호(V22.9.121), user_id(그대로), 로그인 이름(로컬 로그인 아이디), 표시 이름(정확히 한 명일 때만) 가운데 관리자가 고른 방법 하나.
async function supporterAdminFindUserV22995(env, who = "", by = "user_id", ctx = null) {
  const text = String(who || "").trim().slice(0, 120);
  if (!text) return { error: "user_required" };
  if (by === "member_code") {
    // V22.9.121: 기억 줄 → 다시 계산해 확인, 없으면 훑기(최근 가입 500명). 훑어 찾으면 기억 줄을 답 뒤에 넣는다.
    const code = normalizeMemberCodeV229121(text);
    if (!code) return { error: "member_code_invalid" };
    if (!memberCodeAvailableV229121(env)) return { error: "member_code_unavailable" };
    const userId = await findUserIdByMemberCodeV229121(env, code, { ctx });
    if (!userId) return { error: "user_not_found" };
    const user = await fetchUserById(env, userId).catch(() => null);
    return user?.id ? { user } : { error: "user_not_found" };
  }
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
    const rows = await supabase(env, `/rest/v1/users?nickname=eq.${encodeURIComponent(text)}&select=id,nickname,kakao_user_key&limit=2`, { method: "GET" }).catch(() => []);
    const list = safeArray(rows).filter((row) => row?.id);
    if (list.length === 1) return { user: list[0] };
    return { error: list.length > 1 ? "user_ambiguous" : "user_not_found" };
  }
  const user = await fetchUserById(env, text).catch(() => null);
  return user?.id ? { user } : { error: "user_not_found" };
}

// V22.9.121: 사용자 줄 읽기 공통 칸(줄 + 강한 식별 kakao·local 만 포함).
function supporterAdminUserParamsV229121() {
  const params = new URLSearchParams();
  params.set("select", SUPPORTER_ADMIN_USER_SELECT_V229121);
  params.set("accountbook_user_identities.provider", "in.(kakao,local)");
  return params;
}

// V22.9.121: id 로 사용자 줄을 모은다. known(이미 읽은 줄 — 목록 한 쪽)에 없는 id 만 한 번(id=in.)에 읽는다. 읽지 못하면 아는 줄만.
async function supporterAdminUsersByIdV229121(env, ids = [], known = new Map()) {
  const out = new Map(known);
  const missing = [...new Set(safeArray(ids).map((id) => String(id || "").trim()).filter(Boolean))].filter((id) => !out.has(id)).slice(0, 600);
  if (!missing.length) return out;
  const params = supporterAdminUserParamsV229121();
  params.set("id", `in.(${missing.map(supporterInValueV22995).join(",")})`);
  params.set("limit", String(missing.length));
  const rows = await optionalSupabase(env, `/rest/v1/users?${params.toString()}`, { method: "GET" }, []);
  for (const row of safeArray(rows)) if (row?.id) out.set(String(row.id), row);
  return out;
}

function supporterAdminStateV22995(flag, today) {
  if (!flag) return ["값 오류", "bad"];
  if (flag.since > today) return ["시작 전", "wait"];
  return supporterFlagActive(flag, today) ? ["켜짐", "on"] : ["끝남", "off"];
}

// V22.9.121: 목록 찾기 칸(q). 회원 번호 꼴(구분 기호를 뺀 길이 10 + MB 머리, 또는 ‘XXXX-XXXX’ 처럼 넷째 글자 뒤 구분 기호)이면 그 번호 한 명,
// 아니면 표시 이름 일부(ilike), 그리고 16진수 4~32자리(줄표 포함 36자 이내)면 user_id 앞자리도 함께 본다. 머리도 구분 기호도 없는 8글자는
// 번호로 보지 않는다(흔한 이름·id 앞자리와 겹친다 — 그런 번호는 아래 찾기 폼의 ‘회원 번호’ 방법이 받는다).
function supporterAdminUserQueryV229121(raw = "") {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!text) return { text: "", kind: "all", code: "", idPrefix: "" };
  const folded = text.normalize("NFKC");
  const compact = folded.toUpperCase().replace(SUPPORTER_ADMIN_SEPARATORS_V229121, "");
  const codeShaped = (compact.length === 10 && compact.startsWith("MB")) || /^[0-9A-Za-z]{4}[\s\-_.\u2010-\u2015\u2212][0-9A-Za-z]{4}$/.test(folded);
  if (codeShaped) {
    const code = normalizeMemberCodeV229121(folded);
    return code ? { text, kind: "code", code, idPrefix: "" } : { text, kind: "badcode", code: "", idPrefix: "" };
  }
  const hex = text.toLowerCase().replace(/-/g, "");
  const idPrefix = text.length <= 36 && /^[0-9a-f-]+$/i.test(text) && /^[0-9a-f]{4,32}$/.test(hex) ? hex : "";
  return { text, kind: "text", code: "", idPrefix };
}

// V22.9.121: user_id(uuid) 앞자리 → 범위 [앞자리 + 0…, 앞자리 + f…]. uuid 는 16진 글자 순서와 같은 순서로 비교된다.
function supporterAdminUuidRangeV229121(hexPrefix = "") {
  const shape = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return [shape(hexPrefix.padEnd(32, "0")), shape(hexPrefix.padEnd(32, "f"))];
}

// V22.9.121: 표시 이름 부분 일치(ilike) + user_id 앞자리 논리식. 이름 값은 큰따옴표로 감싸고(논리식 안 쉼표·괄호·점), 와일드카드·따옴표·역슬래시
// (* % _ " \)는 ‘아무 글자’(*)로 바꾼다.
function supporterAdminUserFilterV229121(query) {
  if (query?.kind !== "text" || !query.text) return "";
  const pattern = `*${query.text.replace(/[*%_"\\]/g, "*")}*`.replace(/\*{2,}/g, "*");
  const parts = [`nickname.ilike."${pattern}"`];
  if (query.idPrefix) {
    const [low, high] = supporterAdminUuidRangeV229121(query.idPrefix);
    parts.push(`and(id.gte.${low},id.lte.${high})`);
  }
  return `(${parts.join(",")})`;
}

// V22.9.121: 사용자 한 쪽(최근 가입 순, 50명 + 다음 쪽이 있는지 보려고 한 명 더). 읽지 못하면 null.
async function supporterAdminUserPageV229121(env, query, pageNo = 1) {
  const params = supporterAdminUserParamsV229121();
  params.set("order", "created_at.desc,id.desc");
  params.set("limit", String(SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121 + 1));
  params.set("offset", String((pageNo - 1) * SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121));
  const filter = supporterAdminUserFilterV229121(query);
  if (filter) params.set("or", filter);
  try {
    const rows = await supabase(env, `/rest/v1/users?${params.toString()}`, { method: "GET" });
    return Array.isArray(rows) ? rows : null;
  } catch (_) {
    return null;
  }
}

// V22.9.121: 계정 유형. 강한 식별 행이 먼저다(카카오 로그인·로그인 이름 — 둘 다면 둘 다). 없으면 사용자 줄의 키로 본다: 옛 웹 로그인 별칭
// kakao_login:(카카오 로그인)·local_web:/local_account:(로그인 이름 계정), 그 밖은 카카오톡 채팅에서만 생긴 계정(채팅 전용).
function supporterAdminAccountTypeV229121(user) {
  const providers = new Set(safeArray(user?.accountbook_user_identities).map((row) => String(row?.provider || "")));
  const kinds = [];
  if (providers.has("kakao")) kinds.push("카카오 로그인");
  if (providers.has("local")) kinds.push("로그인 이름");
  if (kinds.length) return kinds.join(" · ");
  const key = String(user?.kakao_user_key || "");
  if (key.startsWith("kakao_login:")) return "카카오 로그인";
  if (key.startsWith("local_web:") || key.startsWith("local_account:")) return "로그인 이름";
  return "채팅 전용";
}

// V22.9.121: 가입일(KST 날짜). 모양이 틀리면 ‘-’.
function supporterAdminKstDateV229121(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// V22.9.121: ?add= 값(사용자 id 모양만 받는다 — 그 밖은 무시).
function supporterAdminIdParamV229121(value) {
  const id = String(value || "").trim();
  return /^[0-9A-Za-z][0-9A-Za-z_-]{1,63}$/.test(id) ? id : "";
}

function supporterAdminUserListLinkV229121(query, pageNo) {
  const search = new URLSearchParams();
  if (query.text) search.set("q", query.text);
  if (pageNo > 1) search.set("page", String(pageNo));
  const text = search.toString();
  return `/admin/supporters${text ? `?${text}` : ""}#users`;
}

async function handleSupportersAdminPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse(adminLoginLocation(url));
  const query = supporterAdminUserQueryV229121(url.searchParams.get("q"));
  const listMode = query.kind === "all" || query.kind === "text";
  const pageNo = listMode ? Math.min(1000, Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1))) : 1;
  const addId = supporterAdminIdParamV229121(url.searchParams.get("add"));
  const editId = String(url.searchParams.get("user_id") || "").trim();
  // 후원자 줄과 사용자 한 쪽(또는 회원 번호 찾기)을 나란히 읽는다. 화면 GET 은 기억 줄을 쓰지 않는다(remember:false).
  const [rows, listRows, lookup] = await Promise.all([
    fetchSupporterRows(env, 500),
    listMode ? supporterAdminUserPageV229121(env, query, pageNo) : Promise.resolve(null),
    query.kind === "code" ? lookupMemberCodeV229121(env, query.code, { remember: false }) : Promise.resolve(null),
  ]);
  const known = new Map();
  for (const row of safeArray(listRows)) if (row?.id) known.set(String(row.id), row);
  const foundId = String(lookup?.userId || "");
  // 그 쪽에 없는 사용자(후원자 이름·추가할 사람·회원 번호로 찾은 사람)는 한 번에 읽는다.
  const usersById = await supporterAdminUsersByIdV229121(env, [...safeArray(rows).map((row) => row.user_id), addId, foundId], known);
  const nameOf = (id) => String(usersById.get(id)?.nickname || "");
  const today = supporterTodayV22995();
  const msg = SUPPORTER_ADMIN_MESSAGES_V22995[String(url.searchParams.get("msg") || "")] || "";
  const err = SUPPORTER_ADMIN_ERRORS_V22995[String(url.searchParams.get("err") || "")] || "";
  let editing = editId ? safeArray(rows).find((row) => row.user_id === editId) || null : null;
  // V22.9.121: ‘후원자 추가’ 링크(?add=). 이미 후원자 줄이 있으면 고치기로 연다. 합쳐진 계정·없는 사용자는 찾기 폼과 안내 한 줄.
  let addUser = null;
  let addNote = "";
  if (!editing && addId) {
    const existing = safeArray(rows).find((row) => row.user_id === addId) || null;
    const user = usersById.get(addId) || null;
    if (existing) editing = existing;
    else if (!user) addNote = "추가할 사용자를 찾지 못했어요. 전체 사용자 목록에서 다시 골라 주세요.";
    else if (supporterAdminMergedV229121(user)) addNote = SUPPORTER_ADMIN_ERRORS_V22995.user_merged;
    else addUser = user;
  }
  const editFlag = editing?.flag || null;
  const pageUsers = query.kind === "code"
    ? (foundId && usersById.get(foundId) ? [usersById.get(foundId)] : [])
    : safeArray(listRows).slice(0, SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121);
  const hasNext = listMode && safeArray(listRows).length > SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121;
  const codes = await memberCodesForUsersV229121(env, [...pageUsers.map((user) => user.id), addUser?.id || "", editing?.user_id || ""]);
  const codeHtml = (id) => (codes.get(String(id || "")) ? `<code>${escapeHtml(codes.get(String(id)))}</code>` : `<span class="muted">-</span>`);
  const tableRows = rows === null
    ? `<tr><td colspan="9">후원자 목록을 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요.</td></tr>`
    : rows.map((row) => {
      const [stateLabel, stateKey] = supporterAdminStateV22995(row.flag, today);
      const id = escapeHtml(row.user_id);
      return `<tr><td><code>${id}</code></td><td>${escapeHtml(nameOf(row.user_id) || "(이름 없음)")}</td><td><span class="state ${stateKey}">${stateLabel}</span></td><td>${escapeHtml(row.flag?.since || "-")}</td><td>${escapeHtml(row.flag?.until || "없음")}</td><td>${escapeHtml(row.flag?.note || "")}</td><td>${escapeHtml(row.flag?.public_name || "(명단에 안 보임)")}</td><td><a href="/admin/supporters?user_id=${encodeURIComponent(row.user_id)}#edit">고치기</a></td><td><form method="post" action="/admin/supporters/remove" class="inline"><input type="hidden" name="user_id" value="${id}"/><label>확인 문구 <input name="confirm_text" placeholder="제거" autocomplete="off" required/></label><button type="submit" class="danger">제거</button></form></td></tr>`;
    }).join("") || `<tr><td colspan="9">아직 후원자 표시가 없어요.</td></tr>`;
  const value = (key) => escapeHtml(editFlag?.[key] || "");
  const finder = editing
    ? `<input type="hidden" name="user_id" value="${escapeHtml(editing.user_id)}"/><p>고치는 사용자: <code>${escapeHtml(editing.user_id)}</code> · ${escapeHtml(nameOf(editing.user_id) || "(이름 없음)")} · 회원 번호 ${codeHtml(editing.user_id)} <a href="/admin/supporters#edit">새로 추가하기</a></p>`
    : addUser
      ? `<input type="hidden" name="user_id" value="${escapeHtml(addUser.id)}"/><p>추가할 사용자: 회원 번호 ${codeHtml(addUser.id)} · ${escapeHtml(addUser.nickname || "(이름 없음)")} · user_id 앞 8자 <code>${escapeHtml(String(addUser.id).slice(0, 8))}</code> <a href="/admin/supporters#edit">다른 사용자 찾기</a></p>`
      : `${addNote ? `<p class="warn" role="alert">${escapeHtml(addNote)}</p>` : ""}<div class="grid"><label class="field">찾는 방법<select name="by"><option value="member_code">회원 번호(MB-XXXX-XXXX)</option><option value="user_id">user_id</option><option value="login">로그인 이름(아이디)</option><option value="nickname">표시 이름(한 명일 때만)</option></select></label><label class="field">사용자<input name="who" required maxlength="120" autocomplete="off" placeholder="MB-XXXX-XXXX"/></label></div>`;
  // V22.9.121 전체 사용자 목록 칸.
  const userRows = listMode && listRows === null
    ? `<tr><td colspan="7">사용자 목록을 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요.</td></tr>`
    : pageUsers.map((user) => {
      const id = String(user.id || "");
      const merged = supporterAdminMergedV229121(user);
      const supporter = rows === null ? null : safeArray(rows).find((row) => row.user_id === id) || null;
      const [stateLabel, stateKey] = rows === null ? ["확인 못 함", "bad"] : supporter ? supporterAdminStateV22995(supporter.flag, today) : ["없음", "none"];
      const action = merged
        ? `<span class="muted">-</span>`
        : supporter
          ? `<a href="/admin/supporters?user_id=${encodeURIComponent(id)}#edit">고치기</a>`
          : `<a href="/admin/supporters?add=${encodeURIComponent(id)}#edit">후원자 추가</a>`;
      return `<tr><td>${codeHtml(id)}</td><td>${escapeHtml(user.nickname || "(이름 없음)")}${merged ? ` <span class="state merged">통합됨</span>` : ""}</td><td>${escapeHtml(supporterAdminAccountTypeV229121(user))}</td><td>${escapeHtml(supporterAdminKstDateV229121(user.created_at))}</td><td><code>${escapeHtml(id.slice(0, 8))}</code></td><td><span class="state ${stateKey}">${escapeHtml(stateLabel)}</span></td><td>${action}</td></tr>`;
    }).join("") || `<tr><td colspan="7">${query.kind === "all" ? "아직 사용자가 없어요." : "찾는 사용자가 없어요."}</td></tr>`;
  let lookupNote = "";
  if (query.kind === "badcode") lookupNote = `<p class="error" role="alert">${escapeHtml(SUPPORTER_ADMIN_ERRORS_V22995.member_code_invalid)}</p>`;
  else if (query.kind === "code" && lookup?.available === false) lookupNote = `<p class="error" role="alert">${escapeHtml(SUPPORTER_ADMIN_ERRORS_V22995.member_code_unavailable)}</p>`;
  else if (query.kind === "code" && foundId && !pageUsers.length) lookupNote = `<p class="warn" role="status">회원 번호 ${escapeHtml(query.code)} 의 사용자 줄을 읽지 못했어요. 잠시 뒤 다시 찾아 주세요.</p>`;
  else if (query.kind === "code" && !foundId) lookupNote = `<p class="warn" role="status">회원 번호 ${escapeHtml(query.code)} 와 맞는 사용자가 없어요. 번호를 다시 확인해 주세요.</p>`;
  const first = (pageNo - 1) * SUPPORTER_ADMIN_USER_PAGE_SIZE_V229121 + 1;
  const range = listMode && pageUsers.length ? `<p class="muted">${first}–${first + pageUsers.length - 1}번째</p>` : "";
  const pager = listMode && (pageNo > 1 || hasNext)
    ? `<nav class="pager" aria-label="사용자 목록 쪽">${pageNo > 1 ? `<a href="${escapeHtml(supporterAdminUserListLinkV229121(query, pageNo - 1))}">이전 50명</a>` : ""}${hasNext ? `<a href="${escapeHtml(supporterAdminUserListLinkV229121(query, pageNo + 1))}">다음 50명</a>` : ""}</nav>`
    : "";
  const userList = `<section class="card" id="users"><h2>전체 사용자 목록</h2><p class="muted">최근에 가입한 순서로 50명씩 보여요. 표시 이름 일부, 회원 번호(MB-XXXX-XXXX), user_id 앞자리(4자 이상)로 찾을 수 있어요.</p><form method="get" action="/admin/supporters#users" class="userFilter"><label class="field">찾기<input name="q" value="${escapeHtml(query.text)}" maxlength="60" autocomplete="off" placeholder="이름 · MB-XXXX-XXXX · user_id 앞자리"/></label><button type="submit">찾기</button>${query.text ? `<a href="/admin/supporters#users">전체 보기</a>` : ""}</form>${lookupNote}${range}<div class="tableWrap"><table><thead><tr><th scope="col">회원 번호</th><th scope="col">표시 이름</th><th scope="col">계정 유형</th><th scope="col">가입일(KST)</th><th scope="col">user_id 앞 8자</th><th scope="col">후원 상태</th><th scope="col">후원자 표시</th></tr></thead><tbody>${userRows}</tbody></table></div>${pager}</section>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>후원자 관리</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 28px rgba(15,23,42,.06)}.hero{background:#111827;color:#fff}.hero p{color:#ede9fe;line-height:1.6}.hero a{color:#fff}.ok,.error,.warn{border-radius:15px;padding:12px;line-height:1.55}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.muted{color:#475467;line-height:1.55}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px;margin:10px 0;font-weight:700}.field input,.field select{height:44px;border:1px solid #d0d5dd;border-radius:12px;padding:0 12px;font:inherit;font-weight:400}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-top:1px solid #e5e7eb;padding:10px 8px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}button{min-height:44px;border:0;border-radius:12px;padding:0 16px;font:inherit;font-weight:800;background:#111827;color:#fff;cursor:pointer}button.danger{background:#b42318}.inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.inline input{height:36px;width:72px;border:1px solid #d0d5dd;border-radius:10px;padding:0 8px}.state{display:inline-block;border-radius:999px;padding:2px 8px;font-weight:800;font-size:12px}.state.on{background:#dcfce7;color:#166534}.state.off,.state.none{background:#f2f4f7;color:#475467}.state.wait{background:#eff6ff;color:#1d4ed8}.state.bad{background:#fef2f2;color:#991b1b}.state.merged{background:#fef3c7;color:#92400e}.userFilter{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.userFilter .field{flex:1 1 280px;margin:0}.userFilter a,.pager a{font-weight:800;color:#1d4ed8}.pager{display:flex;gap:16px;justify-content:flex-end;margin:12px 0 0}@media(max-width:720px){.grid{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("identity-audit", { scope: "admin" })}<main class="wrap"><section class="hero"><h1>후원자 관리</h1><p>송금을 확인한 사용자에게 후원자 배지와 포인트 색을 켜요. 기능은 후원과 관계없이 같아요. 오늘(KST) ${escapeHtml(today)} 기준으로 끝나는 날이 지나면 저절로 꺼져요.</p><p>후원한 분이 알려 준 회원 번호(MB-XXXX-XXXX, 웹 가계부 ‘전체 메뉴 → 내 계정·보안’ 에 보여요)로 찾거나, 아래 전체 사용자 목록에서 골라 주세요.</p><p><a href="/ops-dashboard">운영 대시보드</a> · <a href="/support">공개 후원 안내</a></p></section>${msg ? `<p class="ok" role="status">${escapeHtml(msg)}</p>` : ""}${err ? `<p class="error" role="alert">${escapeHtml(err)}</p>` : ""}<section class="card"><h2>후원자 목록</h2><div class="tableWrap"><table><thead><tr><th scope="col">user_id</th><th scope="col">표시 이름</th><th scope="col">상태</th><th scope="col">시작일(since)</th><th scope="col">끝나는 날(until)</th><th scope="col">메모(note)</th><th scope="col">명단 이름(public_name)</th><th scope="col">고치기</th><th scope="col">제거</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><section class="card" id="edit"><h2>${editing ? "후원자 표시 고치기" : "후원자 표시 추가"}</h2><form method="post" action="/admin/supporters/save">${finder}<div class="grid"><label class="field">시작일(비우면 ${editing ? "그대로" : "오늘"})<input name="since" placeholder="YYYY-MM-DD" value="${value("since")}" inputmode="numeric" maxlength="10"/></label><label class="field">끝나는 날(비우면 끝없음)<input name="until" placeholder="YYYY-MM-DD" value="${value("until")}" inputmode="numeric" maxlength="10"/></label><label class="field">메모(관리자만 봐요, 200자)<input name="note" value="${value("note")}" maxlength="200" autocomplete="off"/></label><label class="field">명단 이름(공개 /support 에 보임, 비우면 안 보임, 30자)<input name="public_name" value="${value("public_name")}" maxlength="30" autocomplete="off"/></label></div><p class="warn">명단 이름은 본인이 공개해도 된다고 한 이름만 적어요. 메모에는 계좌번호·금액 같은 결제 정보를 적지 않아요.</p><button type="submit">저장</button></form></section>${userList}</main></body></html>`);
}

async function handleSupportersAdminSave(request, env, ctx = null) {
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
    // V22.9.121: 찾는 방법에 ‘회원 번호’(member_code)를 더했다. 값이 없거나 모르는 방법이면 예전처럼 user_id.
    const by = ["member_code", "user_id", "login", "nickname"].includes(field("by")) ? field("by") : "user_id";
    const found = await supporterAdminFindUserV22995(env, field("who"), by, ctx);
    if (found.error) return supporterAdminRedirectV22995({ err: found.error });
    user = found.user;
  }
  const userId = String(user.id);
  const existing = await fetchSupporterFlag(env, userId).catch(() => null);
  // V22.9.121: 오류로 돌아갈 때 고치기(이미 있는 줄)는 user_id, 목록의 ‘후원자 추가’(아직 없는 줄)는 add 로 같은 폼을 다시 연다.
  const back = fixedId ? (existing ? { user_id: fixedId } : { add: fixedId }) : {};
  // V22.9.121: 다른 계정으로 합쳐진 계정에는 새로 켜지 않는다(이미 있는 줄을 고치거나 지우는 것은 그대로).
  if (!existing && supporterAdminMergedV229121(user)) return supporterAdminRedirectV22995({ err: "user_merged" });
  const sinceRaw = field("since");
  const since = sinceRaw ? supporterDateV22995(sinceRaw) : existing?.since || supporterTodayV22995();
  if (!since) return supporterAdminRedirectV22995({ err: "since_invalid", ...back });
  const untilRaw = field("until");
  const until = untilRaw ? supporterDateV22995(untilRaw) : null;
  if (untilRaw && !until) return supporterAdminRedirectV22995({ err: "until_invalid", ...back });
  if (until && until < since) return supporterAdminRedirectV22995({ err: "until_before_since", ...back });
  const flag = { since, until, note: supporterTextV22995(field("note"), 200), public_name: supporterTextV22995(field("public_name"), 30) || null };
  try {
    await saveSettingValue(env, supporterSettingsKey(userId), flag);
  } catch (_) {
    return supporterAdminRedirectV22995({ err: "save_failed", ...back });
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
