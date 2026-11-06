// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import {
  getCookie, htmlResponse, redirectResponse, redirectResponseWithCookies,
} from "../runtime/http.js";
import { fetchHouseholdMembers, saveMemberAlias } from "../data/households-members-rows.js";
import { mergedMarkerFreeName, verifyUserSession } from "../auth/user-session.js";
import { hasBackupLoginIdentity, isPlaceholderUserNickname } from "../auth/identity-reauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  canManageMyHousehold, getMySelectedHousehold, householdIdWasRemembered, householdNotFoundResponse,
  myAccessStatusResponse,
} from "./access-control.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { sanitizeWebHouseholdNameInput } from "../kakao/household-budget-commands.js";
import { getHouseholdMemberRoleStrict } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.102 가계부 기본 설정 안내(사용자 2026-11-05: “가계부가 자동으로 생성되고 입장되다보니 … 설정을 해야하는 특정 표시가 계속 나와야”).
// 자동으로 만들어진 가계부(카카오 방 첫 기록 ‘이 방의 공동 가계부’, 로그인 뒤 ‘<이름> 가계부’)는 가계부 이름·이 가계부에서 보일 내 이름·
// 내 계정 로그인 비밀번호가 비어 있을 수 있다. 세 가지 가운데 하나라도 비어 있으면 홈과 주요 화면 맨 위에 공지 띠와 같은 자리의 띠
// (.abSetupBand, 셸 CSS 자산)를 띄우고, 셋이 끝나면 띠는 사라진다. 끄는 단추는 없다(설정이 끝나야 사라진다).
//   · 홈은 이미 읽은 가계부·구성원 행으로 이름·내 이름을 판정하고(DB 읽기 0회, 홈 조회 9회 상한 유지), 비밀번호는 쿠키 ab_bk 로만 본다:
//     1 = 내 계정 로그인 비밀번호가 있음, 0 = 없음(띄운다), 없음 = 모름(띄우지 않는다 — 모르는데 ‘설정 전’이라 하지 않는다). 쿠키(14일)는
//     카카오 로그인 콜백이 로그인 때 한 번 확인해 적고, /my/setup·내 계정·보안 화면이 실제로 확인해 적고, 로그인 이름 로그인·비밀번호 저장 뒤에는
//     1 로 굳는다. 이 판 전에 로그인해 둔 사람은 다음 로그인이나 그 두 화면을 열 때부터 ‘로그인 비밀번호’ 항목을 본다.
//   · 홈이 판정 결과를 쿠키 ab_setup(<가계부 id>.<빈 항목>, 1시간)에 적고, 전체 메뉴·가계부 전환·설정·참여자·단톡방 연결·내 계정 화면은
//     그 쿠키만 읽어 같은 가계부일 때 띠를 붙인다(응답 마무리에서, DB 읽기 0회). /my/setup 은 실제로 읽어 판정하고 두 쿠키를 새로 적는다.
//   · 이름 판정: 비어 있거나 ‘내 가계부·우리 가계부·이 방의 공동 가계부·<구성원 닉네임> 가계부’ 꼴이면 아직 안 정한 것으로 본다.
//     내 이름 판정: 이 가계부의 내 별칭(member_aliases)이 없고 계정 닉네임이 자리표시(카카오사용자·사용자 등)이면 아직 안 정한 것이다.
const HOUSEHOLD_SETUP_COOKIE = "ab_setup";
const BACKUP_LOGIN_COOKIE = "ab_bk";
const SETUP_LABELS = { name: "가계부 이름", me: "내 이름", password: "로그인 비밀번호" };
const SETUP_BAND_PATHS = new Set([
  "/menu", "/my/households", "/my/settings", "/my/members", "/my/groups", "/my/profile", "/my/backup-login",
]);
const COOKIE_TAIL = "; Path=/; HttpOnly; Secure; SameSite=Lax";

function backupLoginKnownCookie(known = true) {
  return `${BACKUP_LOGIN_COOKIE}=${known ? "1" : "0"}; Max-Age=1209600${COOKIE_TAIL}`;
}

function clearSetupCookies() {
  return [`${HOUSEHOLD_SETUP_COOKIE}=; Max-Age=0${COOKIE_TAIL}`, `${BACKUP_LOGIN_COOKIE}=; Max-Age=0${COOKIE_TAIL}`];
}

// true = 있음, false = 없음, null = 모름(쿠키 없음·다른 값).
function backupLoginKnown(request) {
  const value = String(getCookie(request, BACKUP_LOGIN_COOKIE) || "");
  return value === "1" ? true : value === "0" ? false : null;
}

function compactName(value = "") {
  return normalizeText(String(value || "")).replace(/\s+/g, "").toLowerCase();
}

function isDefaultHouseholdName(name = "", nicknames = []) {
  const key = compactName(name);
  if (!key) return true;
  if (/^(?:내|우리|이방의공동|이방의|공동|기본|새|카카오사용자|가계부사용자|사용자)?가계부$/.test(key)) return true;
  for (const nickname of nicknames) {
    const nick = compactName(nickname);
    if (nick && (key === `${nick}가계부` || key === `${nick}의가계부`)) return true;
  }
  return false;
}

function householdSetupStatus({ household = null, members = [], userId = "", backupKnown = false } = {}) {
  const uid = String(userId || "").trim();
  const rows = Array.isArray(members) ? members : [];
  const me = rows.find((member) => String(member?.user_id || "") === uid) || null;
  // 자동 이름 ‘<이름> 가계부’의 <이름>은 만들 때의 계정 닉네임이지만, 그 뒤 별칭을 정했을 수도 있어 둘 다 본다.
  const nicknames = rows.flatMap((member) => [String(member?.base_nickname || ""), String(member?.display_alias || "")]).filter(Boolean);
  const nameMissing = isDefaultHouseholdName(household?.name || "", nicknames);
  const meMissing = !!me && !String(me.display_alias || "").trim() && isPlaceholderUserNickname(me.base_nickname || "");
  const passwordMissing = backupKnown === false;
  const missing = [nameMissing ? "name" : "", meMissing ? "me" : "", passwordMissing ? "password" : ""].filter(Boolean);
  return { nameMissing, meMissing, passwordMissing, missing, done: missing.length === 0, me };
}

function setupStatusCookie(householdId = "", status = { missing: [] }) {
  const hid = String(householdId || "").trim();
  const flags = status?.missing?.length ? status.missing.join("-") : "ok";
  return `${HOUSEHOLD_SETUP_COOKIE}=${encodeURIComponent(`${hid}.${flags}`)}; Max-Age=3600${COOKIE_TAIL}`;
}

function readSetupStatusCookie(request) {
  const raw = String(getCookie(request, HOUSEHOLD_SETUP_COOKIE) || "");
  if (!raw) return null;
  let value = raw;
  try { value = decodeURIComponent(raw); } catch (_) { value = raw; }
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const householdId = value.slice(0, dot);
  const flags = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(householdId)) return null;
  if (flags === "ok") return { householdId, missing: [] };
  const missing = flags.split("-").filter((key) => Object.prototype.hasOwnProperty.call(SETUP_LABELS, key));
  if (!missing.length) return null;
  return { householdId, missing };
}

function setupPagePath(householdId = "", month = "", extra = {}) {
  const qs = new URLSearchParams();
  if (householdId) qs.set("household_id", String(householdId));
  if (validMonth(month)) qs.set("month", month);
  for (const [key, value] of Object.entries(extra || {})) if (value !== undefined && value !== null && String(value) !== "") qs.set(key, String(value));
  const query = qs.toString();
  return `/my/setup${query ? `?${query}` : ""}`;
}

// 띠의 스타일은 띠와 함께 한 번만 실린다(1년 캐시 자산을 건드리지 않는다, 공지 띠와 같은 방식). 다크(앱 설정)에서도 대비 4.5 이상.
const AB_SETUP_BAND_STYLE = '<style id="abSetupBandStyle">.abSetupBand{display:flex;align-items:center;justify-content:center;gap:6px 10px;flex-wrap:wrap;padding:10px 16px;background:#fff1d6;color:#5a3a00;border-bottom:1px solid #f0c36d;font-size:14px;line-height:1.45;text-decoration:none;text-align:center;word-break:keep-all}.abSetupBand b,.abSetupBand em{font-weight:800}.abSetupBand em{font-style:normal;text-decoration:underline}html[data-ab-resolved-theme="dark"] .abSetupBand{background:#3a2a0b;color:#ffe2a8;border-bottom-color:#6b5420}</style>';

function setupBandHtml({ householdId = "", missing = [], month = "" } = {}) {
  const items = (missing || []).map((key) => SETUP_LABELS[key]).filter(Boolean);
  if (!items.length) return "";
  return `${AB_SETUP_BAND_STYLE}<a class="abSetupBand" href="${escapeHtml(setupPagePath(householdId, month))}"><b>설정 전</b><span>${escapeHtml(items.join("·"))} · 정하지 않으면 기록을 다시 찾기 어려워요</span><em>설정하기</em></a>`;
}

// 띠는 공지 띠 뒤(있으면), 아니면 본문 바로가기 뒤, 아니면 <body> 바로 뒤에 둔다. 스타일은 띠 앞에 한 번 실린다(AB_SETUP_BAND_STYLE).
function attachSetupBand(html = "", band = "") {
  const source = String(html || "");
  if (!band || !source || source.includes('class="abSetupBand"')) return source;
  if (!/<body\b[^>]*>/i.test(source)) return source;
  // V22.9.104 A-1: 공지 띠 폼 끝에 닫기 ‘×’ 단추가 붙어 띠의 끝 글자가 바뀌었다. 띠 시작부터 처음 나오는 ‘</form></div>’ 가 띠의 끝이다
  // (띠 글과 링크는 이스케이프되어 그 글자를 만들 수 없다).
  const noticeEnd = "</form></div>";
  const noticeStart = source.indexOf('<div class="abNoticeBand"');
  const noticeAt = noticeStart >= 0 ? source.indexOf(noticeEnd, noticeStart) : -1;
  if (noticeAt >= 0) return source.slice(0, noticeAt + noticeEnd.length) + band + source.slice(noticeAt + noticeEnd.length);
  const skip = /<a class="abSkipLink" href="[^"]*">본문 바로가기<\/a>/;
  if (skip.test(source)) return source.replace(skip, (full) => full + band);
  return source.replace(/<body\b[^>]*>/i, (full) => full + band);
}

// 응답 마무리(worker/router.js fetch): 홈이 아닌 주요 화면은 쿠키 ab_setup 만 보고 같은 가계부의 띠를 붙인다. DB 를 읽지 않는다.
async function setupBandResponse(request, env, response) {
  try {
    if (!(response instanceof Response) || response.status !== 200 || request?.method !== "GET") return response;
    if (!/^text\/html\b/i.test(response.headers.get("content-type") || "")) return response;
    const url = new URL(request.url);
    if (!SETUP_BAND_PATHS.has(url.pathname)) return response;
    if (!getCookie(request, "ab_user")) return response;
    const stored = readSetupStatusCookie(request);
    if (!stored || !stored.missing.length) return response;
    const requested = String(url.searchParams.get("household_id") || getCookie(request, "ab_hh") || "").trim();
    if (requested && requested !== stored.householdId) return response;
    const html = await response.clone().text();
    const changed = attachSetupBand(html, setupBandHtml({ householdId: stored.householdId, missing: stored.missing, month: url.searchParams.get("month") || "" }));
    if (changed === html) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    const vary = (headers.get("vary") || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!vary.some((value) => /^(cookie|\*)$/i.test(value))) vary.push("Cookie");
    headers.set("vary", vary.join(", "));
    return new Response(changed, { status: response.status, statusText: response.statusText, headers });
  } catch (err) {
    rememberOpsEvent({ kind: "setup_band_attach_failed", severity: "warn", path: "", method: "GET", detail: safeError(err) });
    return response;
  }
}

function setupPageMessage(code = "") {
  const known = {
    household_updated: "가계부 이름을 저장했어요.",
    member_alias_updated: "이 가계부에서 보일 내 이름을 저장했어요.",
    backup_login_saved: "내 계정 로그인 비밀번호를 저장했어요.",
    setup_done: "세 가지가 모두 설정됐어요. 이제 안내 띠는 보이지 않아요.",
  };
  return known[code] || (code ? formatMessage(code) : "");
}

function setupPageError(code = "") {
  const known = {
    household_name_invalid: "가계부 이름을 1자 이상 적어 주세요.",
    household_name_default: "‘가계부’·‘내 가계부’ 같은 기본 이름은 그대로예요. 집이나 모임을 알아볼 수 있는 이름을 적어 주세요.",
    household_manage_not_allowed: "가계부 이름은 소유자 또는 관리자만 바꿀 수 있어요.",
    household_role_check_failed: "권한을 확인하지 못해 아무것도 바꾸지 않았어요. 잠시 후 다시 시도해 주세요.",
    household_update_failed: "가계부 이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    display_name_required: "이 가계부에서 보일 내 이름을 적어 주세요.",
    member_alias_failed: "내 이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    no_household: "먼저 사용할 가계부를 골라 주세요.",
  };
  return known[code] || (code ? "요청을 처리하지 못했어요. 다시 시도해 주세요." : "");
}

async function handleMySetupPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { households, selected, restricted, invalidRequested } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (invalidRequested && households.length && !householdIdWasRemembered(request)) return householdNotFoundResponse({ env, user, requestedId: invalidRequested });
  if (!selected) return redirectResponse("/my/households?err=no_household");
  const [members, hasBackup] = await Promise.all([
    fetchHouseholdMembers(env, selected.id).catch(() => []),
    hasBackupLoginIdentity(env, user),
  ]);
  const status = householdSetupStatus({ household: selected, members, userId, backupKnown: hasBackup });
  const cookies = [setupStatusCookie(selected.id, status), backupLoginKnownCookie(hasBackup)];
  const html = renderMySetupHtml({
    env, user, month, selected, status, members,
    canRename: canManageMyHousehold(selected.role),
    msg: url.searchParams.get("msg") || "",
    err: url.searchParams.get("err") || "",
  });
  const response = htmlResponse(html);
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

async function handleMySetupNameSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  // 저장 뒤에는 홈이 다시 판정하도록 판정 쿠키(ab_setup)만 지운다(비밀번호 쿠키 ab_bk 는 그대로).
  const back = (extra = {}) => redirectResponseWithCookies(setupPagePath(householdId, month, extra), clearSetupCookies().slice(0, 1));
  const name = sanitizeWebHouseholdNameInput(String(form.get("household_name") || "").trim());
  if (!householdId) return redirectResponse("/my/households?err=no_household");
  if (!name) return back({ err: "household_name_invalid" });
  if (isDefaultHouseholdName(name)) return back({ err: "household_name_default" });
  let role = "";
  try {
    role = await getHouseholdMemberRoleStrict(env, userId, householdId);
  } catch (err) {
    rememberOpsEvent({ kind: "household_role_check_failed", severity: "warn", path: "/my/setup/name", method: "POST", detail: safeError(err) });
    return back({ err: "household_role_check_failed" });
  }
  if (!canManageMyHousehold(role)) return back({ err: "household_manage_not_allowed" });
  try {
    await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name }),
    });
    return back({ msg: "household_updated" });
  } catch (err) {
    rememberOpsEvent({ kind: "household_update_failed", severity: "warn", path: "/my/setup/name", method: "POST", detail: safeError(err) });
    return back({ err: "household_update_failed" });
  }
}

async function handleMySetupMeSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  // 저장 뒤에는 홈이 다시 판정하도록 판정 쿠키(ab_setup)만 지운다(비밀번호 쿠키 ab_bk 는 그대로).
  const back = (extra = {}) => redirectResponseWithCookies(setupPagePath(householdId, month, extra), clearSetupCookies().slice(0, 1));
  if (!householdId) return redirectResponse("/my/households?err=no_household");
  const name = mergedMarkerFreeName(String(form.get("display_name") || ""), 40);
  if (!name || isPlaceholderUserNickname(name)) return back({ err: "display_name_required" });
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my/households?err=no_household");
  try {
    await saveMemberAlias(env, householdId, userId, name);
    return back({ msg: "member_alias_updated" });
  } catch (err) {
    rememberOpsEvent({ kind: "member_alias_failed", severity: "warn", path: "/my/setup/me", method: "POST", detail: safeError(err) });
    return back({ err: "member_alias_failed" });
  }
}

function renderMySetupHtml({ env, user, month, selected, status, members = [], canRename = false, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const hid = String(selected?.id || "");
  const hidden = `<input type="hidden" name="household_id" value="${escapeHtml(hid)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/>`;
  const myName = status.me ? String(status.me.nickname || "") : String(user?.nickname || "");
  const doneMark = (done) => done ? `<span class="setupState isDone">설정됨</span>` : `<span class="setupState">설정 전</span>`;
  const nameCard = `<section class="card setupCard${status.nameMissing ? "" : " isDone"}"><div class="setupHead"><h2>1. 가계부 이름</h2>${doneMark(!status.nameMissing)}</div><p class="muted">지금 이름: <b>${escapeHtml(selected?.name || "가계부")}</b>${status.nameMissing ? " · 자동으로 붙은 이름이에요. 가족·모임이 알아볼 이름으로 바꿔 주세요(예: 우리집 생활비, 제주 여행 경비)." : ""}</p>${status.nameMissing
    ? (canRename
      ? `<form method="post" action="/my/setup/name">${hidden}<div class="field"><label for="setupHouseholdName">가계부 이름</label><input id="setupHouseholdName" name="household_name" maxlength="80" placeholder="예: 우리집 생활비" required/></div><button type="submit">이름 저장</button></form>`
      : `<div class="warn">가계부 이름은 소유자 또는 관리자가 정해요. 관리자에게 이름을 정해 달라고 알려 주세요.</div>`)
    : ""}</section>`;
  const meCard = `<section class="card setupCard${status.meMissing ? "" : " isDone"}"><div class="setupHead"><h2>2. 이 가계부에서 보일 내 이름</h2>${doneMark(!status.meMissing)}</div><p class="muted">지금 이름: <b>${escapeHtml(myName || "카카오사용자")}</b>${status.meMissing ? " · 기록과 정산에 ‘카카오사용자’로만 남아 누가 썼는지 구분하기 어려워요." : " · 기록·정산·참여자 목록에 이 이름으로 보여요."}</p>${status.meMissing
    ? `<form method="post" action="/my/setup/me">${hidden}<div class="field"><label for="setupDisplayName">내 이름</label><input id="setupDisplayName" name="display_name" maxlength="40" placeholder="예: 엄마, 민수, 총무" required/></div><button type="submit">내 이름 저장</button></form>`
    : ""}</section>`;
  const passwordCard = `<section class="card setupCard${status.passwordMissing ? "" : " isDone"}"><div class="setupHead"><h2>3. 내 계정 로그인 비밀번호</h2>${doneMark(!status.passwordMissing)}</div>${status.passwordMissing
    ? `<p class="muted">카카오 로그인이 막히거나 휴대폰을 바꿀 때 이 비밀번호로 같은 계정에 들어와요. 없으면 지금까지의 기록을 다시 찾지 못할 수 있어요. 모든 가계부에 공통인 내 계정 비밀번호이고 다른 참여자와 공유하지 않아요.</p><a class="btn" href="/my/backup-login?return_to=${encodeURIComponent(setupPagePath(hid, month))}">로그인 이름·비밀번호 정하기</a>`
    : `<p class="muted">내 계정 로그인 비밀번호가 있어요. 바꾸려면 내 계정·보안에서 다시 저장하면 돼요.</p>`}</section>`;
  const remaining = status.missing.map((key) => SETUP_LABELS[key]);
  const summary = status.done
    ? `<div class="ok">세 가지가 모두 설정됐어요. 홈과 메뉴의 안내 띠는 더 보이지 않아요.</div>`
    : `<div class="warn"><b>아직 설정 전: ${escapeHtml(remaining.join(" · "))}</b><br/>자동으로 만들어진 가계부는 이름·내 이름·로그인 비밀번호가 비어 있을 수 있어요. 비밀번호가 없으면 로그인 방법이 바뀔 때 기록을 다시 찾기 어렵고, 이름이 없으면 같은 이름의 가계부가 여럿일 때 헷갈려요. 세 가지를 정하면 이 안내는 사라져요.</div>`;
  const message = msg ? `<div class="ok">${escapeHtml(setupPageMessage(msg))}</div>` : "";
  const error = err ? `<div class="error">${escapeHtml(setupPageError(err))}</div>` : "";
  const memberCount = Array.isArray(members) ? members.length : 0;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 가계부 기본 설정</title><style>${myNavCss()}body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:#111827;color:#fff}.hero p{color:#dbeafe}.muted{color:#667085;line-height:1.65}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:16px;padding:13px;line-height:1.6}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:16px;padding:13px;line-height:1.6}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}.setupHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.setupHead h2{margin:0}.setupState{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:13px;font-weight:1000}.setupState.isDone{background:#ecfdf5;color:#166534;border-color:#bbf7d0}.setupCard.isDone{border-color:#bbf7d0}.field{display:grid;gap:7px;margin:14px 0}.field label{font-size:13px;font-weight:1000;color:#475467}.field input{width:100%;height:50px;border:1px solid #d0d5dd;border-radius:14px;padding:0 13px;font:inherit}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:14px;background:#111827;color:#fff!important;font-weight:1000;padding:0 16px;text-decoration:none}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.setupFoot{display:flex;gap:8px;flex-wrap:wrap}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected?.role || "", month, "home")}<div class="pageMain"><section class="hero"><h1>가계부 기본 설정</h1><p>${escapeHtml(selected?.name || "가계부")} · 참여자 ${memberCount}명</p></section>${message}${error}${summary}${nameCard}${meCard}${passwordCard}<section class="card"><div class="setupFoot"><a class="btn secondary" href="/app?household_id=${encodeURIComponent(hid)}&month=${encodeURIComponent(month)}">홈으로</a><a class="btn secondary" href="/my/households?household_id=${encodeURIComponent(hid)}&month=${encodeURIComponent(month)}&manage=${encodeURIComponent(hid)}#manage">가계부 관리</a></div></section></div></div></main></body></html>`;
}
// @build:exports-start
export {
  backupLoginKnown, backupLoginKnownCookie, clearSetupCookies, handleMySetupMeSave,
  handleMySetupNameSave, handleMySetupPage, householdSetupStatus, setupBandHtml, setupBandResponse,
  setupStatusCookie,
};
// @build:exports-end
