// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { AB_HOUSEHOLD_MEMORY_HEADER } from "../runtime/config-readiness.js";
import { APP_VERSION } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { getCookie, redirectResponse, redirectResponseWithCookies } from "../runtime/http.js";
import { recordAuthAttempt } from "./crypto-admin-session.js";
import { safeObject } from "../admin/backup-compare.js";
import { makeUserSession, resolveEffectiveUserId, verifyUserSession } from "./user-session.js";
import { fetchUserIdentityLinks } from "./identity-reauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import { clearSetupCookies } from "../my/setup-page.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { canReadMyHousehold } from "../my/access-control.js";
import { kakaoAutoLoginPath } from "./kakao-account-link.js";
import { consentStateCookieFor } from "./kakao-start-screen.js";
import { getLinkedKakaoGroupHousehold } from "../kakao/group-links-first-record.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

// V22.9.105 R-1 단톡방 링크로 바로 열기(사용자 2026-11-06 "첫 기록 후 웹가계부 들어가면 바로 가계부가 나오고 팝업으로 개인정보 관련 나와야한다니까
// 왜 자꾸 별도 페이지로 안내해서 가계부가 바로 안나오는거야 앱 승인 담당자가 별도 화면없이 바로 가계부 홈 화면 나와야 한다고 했다고").
//
// 카카오 그룹 챗봇 안내서(‘URL 링크 버튼 클릭 시 유저 식별자 전달’): 팀채팅방에서 챗봇의 링크 버튼(스킬 답의 버튼과 오픈빌더 블록에 둔 고정 버튼 모두)을
// 누르면 카카오가 누른 사람의 botUserKey·appUserId 와 그 방의 botGroupKey 를 주소 뒤에 붙여 그 사람의 브라우저로 연다("클릭한 유저를 식별").
// V22.9.104 까지 웹은 이 값을 쓰지 않아, 세션 없는 첫 방문은 카카오 로그인(처음이면 시작 팝업 → 카카오 동의 화면 → 계정 잇기 단계)을 거친 뒤에야
// 가계부가 나왔다.
//
// 지금은 이렇게 연다(로그인 뒤 화면 /my·/app·/m·/my/* 의 GET 페이지 이동):
//  · botUserKey·botGroupKey 가 둘 다 있고, 그 방에 이어진 가계부가 있고, botUserKey 의 ‘원래 채팅 계정’(users.kakao_user_key 가 그대로 같고 통합되지
//    않은 행)이 그 가계부를 읽을 수 있는 구성원이면 로그인 화면 없이 그 계정 세션을 만들고 그 방 가계부 홈(/app?household_id=…)으로 보낸다. 승인 대기면
//    /my 상태 화면이다. 안내 확인 기록이 없으면 ab_cs=0 이라 홈 맨 위에 약관 안내 띠가 뜬다(V22.9.104 L-3 팝업 → V22.9.114 띠).
//  · 웹 계정에 이어진 사람(별칭 skill_identity: 나 계정 통합으로 찾은 계정)에게는 주소 값으로 세션을 주지 않는다(독립 검토 P2-1: 만료·폐기 없는 값이
//    웹 계정의 다른 가계부·관리자 권한까지 여는 일을 막는다). 세션이 없으면 그 방 가계부 주소로만 보내 인앱 자동 로그인(V22.9.91, 화면 없음)이 그
//    계정으로 로그인하게 한다.
//  · 하나라도 안 맞으면 카카오 값을 뺀 같은 주소로 보내고, 그 뒤는 V22.9.104 그대로(인앱 자동 로그인 → 시작 팝업)다.
//  · 로그인 뒤 화면이 아닌 곳(공개 문서·글·안내·로그아웃·계정 잇기)은 값만 지운다(검토 P2-2: 값이 붙은 주소가 화면에 남아 복사·공유되지 않게).
//    라우터가 공개 문서·후원·공지 처리보다 먼저 부른다.
//
// 지키는 것:
//  · 값이 붙은 주소는 바로 값을 뺀 주소로 보낸다(303, no-store, Referrer-Policy no-referrer). 값은 답·화면·백업 어디에도 쓰지 않는다.
//  · 값 모양은 16진 32~128자만 받는다(안내서 예시 66자). 우리 내부 키(kakao_login:·local_web: 등 ‘:’ 포함)와 QA 키(test-bot-user-key 등)는 걸러진다.
//    appUserId 로는 찾지 않는다. 새 계정은 만들지 않는다. 같은 이름의 값이 두 번 오면 열지 않는다(검토 P3: 앞에 미리 적힌 남의 값이 이기지 않게).
//  · 비밀번호·로그인 이름 바꾸기용 본인 확인 표(ab_credential_reauth)는 주지 않는다.
//  · 이미 세션이 있고 그 계정이 이 방 가계부를 읽을 수 있으면 세션을 바꾸지 않는다. 읽을 수 없는 다른 계정 세션은 앱에서 바로 연 이동
//    (Sec-Fetch-Site: none)일 때만 누른 사람으로 바꾼다(검토 P3: 다른 사이트의 링크로 세션을 갈아 끼우지 못하게; 머리가 없으면 바꾸지 않는다).
//  · 이용 제한(blocked) 구성원은 열지 않는다. 라우터가 기억한 가계부(ab_hh)로 채운 household_id 는 지우고 계산한다(검토 P2-3: 기억이 방
//    가계부를 이기거나 404 가 되지 않게).
//  · 시도는 IP 마다 15분 60번(두 값이 다 있는 시도만 센다). 관리자 쿠키 브라우저와 링크 미리보기 수집기(UA)는 열지 않는다.
//  · 결과는 설정 표 kakao_room_open_probe_v229105:<결과> 에 시각·판만 남긴다(식별자 없음, isolate 마다 결과별 10분에 한 번).
const KAKAO_ROOM_OPEN_PARAMS = ["botUserKey", "appUserId", "botGroupKey"];
const KAKAO_ROOM_OPEN_KEY_SHAPE = /^[0-9A-Fa-f]{32,128}$/;
const KAKAO_ROOM_OPEN_CRAWLER = /kakaotalk-scrap|facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|linkedinbot|skypeuripreview|googlebot|bingbot|yeti\/|daumoa|applebot|petalbot|headlesschrome/i;
const KAKAO_ROOM_OPEN_ADMISSION_LIMIT = 60;
const KAKAO_ROOM_OPEN_PROBE_PREFIX = "kakao_room_open_probe_v229105:";
const KAKAO_ROOM_OPEN_PROBE_MS = 10 * 60 * 1000;
const KAKAO_ROOM_OPEN_OK = new Set(["ok", "switched", "same_session", "member_session", "linked_account"]);
const KAKAO_ROOM_OPEN_HEADERS = { "referrer-policy": "no-referrer" };
const AB_KAKAO_ROOM_OPEN_PROBE = globalThis.__AB_KAKAO_ROOM_OPEN_PROBE || (globalThis.__AB_KAKAO_ROOM_OPEN_PROBE = new Map());

// 카카오 값을 뺀 주소. 가계부 번호(householdId)가 주어지면 그 방 가계부 홈으로 간다: /my·/app·/m 은 /app 홈, /my/* 는 그 화면에 가계부 번호를 붙인다.
function kakaoRoomOpenLocation(url, householdId = "") {
  const query = new URLSearchParams(url.search);
  for (const name of KAKAO_ROOM_OPEN_PARAMS) query.delete(name);
  let path = url.pathname === "/m" ? "/app" : url.pathname;
  if (householdId) {
    if (path === "/my") path = "/app";
    if (!query.get("household_id")) query.set("household_id", householdId);
  }
  const text = query.toString();
  return `${path}${text ? `?${text}` : ""}`;
}

// 사용자가 연 주소. 라우터가 기억한 가계부(ab_hh)로 household_id 를 채웠으면(머리 x-ab-household-memory: 1) 그 값을 지운다.
function kakaoRoomOpenSourceUrl(request, url) {
  const source = new URL(url.href);
  if (request.headers.get(AB_HOUSEHOLD_MEMORY_HEADER) === "1") source.searchParams.delete("household_id");
  return source;
}

function kakaoRoomOpenMergedLooking(user) {
  return String(user?.kakao_user_key || "").startsWith("merged:") || /\(통합됨\)\s*$/.test(String(user?.nickname || ""));
}

// 주소의 botUserKey 로 채팅 계정을 찾는다(읽기만, 새로 만들지 않는다). raw = 원래 채팅 행(값이 그대로 같고 통합되지 않음)인지.
// 원래 행이 없으면 별칭(skill_identity:)으로, 통합됐으면 합친 쪽(유효 계정)으로 찾고 raw 는 false 다 — 그 사람은 웹 계정에 이어져 있다.
async function kakaoRoomOpenIdentity(env, botUserKey = "") {
  const key = String(botUserKey || "").trim();
  if (!KAKAO_ROOM_OPEN_KEY_SHAPE.test(key)) return null;
  const rows = await supabase(env, `/rest/v1/users?kakao_user_key=eq.${encodeURIComponent(key)}&select=id,kakao_user_key,nickname&limit=2`, { method: "GET" }) || [];
  const raw = (Array.isArray(rows) ? rows : []).filter((row) => row?.id && row.kakao_user_key === key);
  if (raw.length > 1) return null;
  const sourceId = raw.length ? String(raw[0].id) : String(safeObject((await fetchUserIdentityLinks(env))[`skill_identity:${key}`]).user_id || "").trim();
  if (!sourceId) return null;
  const effectiveId = await resolveEffectiveUserId(env, sourceId, { fresh: true });
  if (!effectiveId) return null;
  const user = raw.length && effectiveId === sourceId ? raw[0] : await fetchUserById(env, effectiveId);
  if (!user?.id || kakaoRoomOpenMergedLooking(user)) return null;
  return { userId: String(user.id), raw: raw.length === 1 && effectiveId === sourceId };
}

function kakaoRoomOpenProbe(env, ctx, result = "", detail = "") {
  const slot = String(result || "unknown").replace(/[^a-z_]/g, "").slice(0, 40) || "unknown";
  rememberOpsEvent({ kind: "kakao_room_open", severity: KAKAO_ROOM_OPEN_OK.has(slot) ? "info" : "warn", path: "/my", method: "GET", detail: detail ? `${slot}: ${detail}`.slice(0, 200) : slot });
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;
  const now = Date.now();
  if (now - Number(AB_KAKAO_ROOM_OPEN_PROBE.get(slot) || 0) < KAKAO_ROOM_OPEN_PROBE_MS) return;
  AB_KAKAO_ROOM_OPEN_PROBE.set(slot, now);
  const job = saveSettingValue(env, `${KAKAO_ROOM_OPEN_PROBE_PREFIX}${slot}`, JSON.stringify({ version: 1, at: new Date(now).toISOString(), app_version: APP_VERSION }))
    .catch((err) => {
      AB_KAKAO_ROOM_OPEN_PROBE.delete(slot);
      rememberOpsEvent({ kind: "kakao_room_open_probe_failed", severity: "warn", path: "/my", method: "GET", detail: safeError(err) });
    });
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(job);
}

// 라우터가 같은 출처 검사 바로 다음(숨긴 기능·공지·후원·공개 문서·인앱 자동 로그인보다 먼저)에 부른다. 카카오가 붙인 값(botUserKey·appUserId·
// botGroupKey)이 하나라도 있는 GET 페이지 이동만 맡는다. 그 밖(미리 읽기·fetch·POST·HEAD)은 null 이라 예전 그대로다.
async function kakaoRoomOpenResponse(request, env, url, ctx) {
  if (String(request?.method || "GET").toUpperCase() !== "GET" || !url) return null;
  if (!KAKAO_ROOM_OPEN_PARAMS.some((name) => url.searchParams.has(name))) return null;
  const fetchMode = String(request.headers.get("sec-fetch-mode") || "").toLowerCase();
  if (fetchMode ? fetchMode !== "navigate" : !/text\/html/i.test(String(request.headers.get("accept") || ""))) return null;
  if (/prefetch|prerender/i.test(`${request.headers.get("sec-purpose") || ""} ${request.headers.get("purpose") || ""}`)) return null;
  const source = kakaoRoomOpenSourceUrl(request, url);
  const plain = kakaoRoomOpenLocation(source, "");
  // 로그인 뒤 화면이 아니면(공개 문서·글·안내·로그아웃·계정 잇기) 값만 지운다. DB 는 읽지 않는다.
  if (!kakaoAutoLoginPath(url.pathname)) {
    rememberOpsEvent({ kind: "kakao_room_values_stripped", severity: "info", path: url.pathname.slice(0, 80), method: "GET", detail: "" });
    return redirectResponse(plain, KAKAO_ROOM_OPEN_HEADERS);
  }
  const finish = (result, location, cookies = [], detail = "") => {
    kakaoRoomOpenProbe(env, ctx, result, detail);
    return cookies.length ? redirectResponseWithCookies(location, cookies, KAKAO_ROOM_OPEN_HEADERS) : redirectResponse(location, KAKAO_ROOM_OPEN_HEADERS);
  };
  if (KAKAO_ROOM_OPEN_CRAWLER.test(String(request.headers.get("user-agent") || ""))) return finish("crawler", plain);
  if (getCookie(request, "ab_admin")) return finish("admin_browser", plain);
  if (KAKAO_ROOM_OPEN_PARAMS.some((name) => url.searchParams.getAll(name).length > 1)) return finish("duplicate_values", plain);
  const groupKey = String(url.searchParams.get("botGroupKey") || "").trim();
  const userKey = String(url.searchParams.get("botUserKey") || "").trim();
  if (!groupKey) return finish(userKey ? "no_group_key" : "no_user_key", plain);
  if (!userKey) return finish("no_user_key", plain);
  if (!KAKAO_ROOM_OPEN_KEY_SHAPE.test(userKey) || !KAKAO_ROOM_OPEN_KEY_SHAPE.test(groupKey)) return finish("bad_key_shape", plain);
  try {
    const admission = await recordAuthAttempt(env, request, "/my/room-open-admission", false, { limit: KAKAO_ROOM_OPEN_ADMISSION_LIMIT });
    if (admission.unavailable) return finish("limiter_unavailable", plain);
    if (!admission.allowed) return finish("rate_limited", plain);
    const household = await getLinkedKakaoGroupHousehold(env, groupKey);
    if (!household?.id) return finish("no_room_household", plain);
    const identity = await kakaoRoomOpenIdentity(env, userKey);
    if (!identity) return finish("no_user", plain);
    const role = String(await getHouseholdMemberRole(env, identity.userId, household.id) || "").toLowerCase();
    const readable = canReadMyHousehold(role);
    // 이용 제한 등 읽을 수 없고 승인 대기도 아닌 사람은 열지 않는다.
    if (!readable && role !== "pending") return finish("not_member", plain);
    const roomHome = kakaoRoomOpenLocation(source, household.id);
    // 승인 대기처럼 아직 읽을 수 없는 구성원은 지금처럼 /my 의 상태 화면으로 간다.
    const home = readable ? roomHome : `/my?household_id=${encodeURIComponent(household.id)}`;
    const current = await verifyUserSession(request, env);
    if (current && current === identity.userId) return finish("same_session", home);
    if (current && canReadMyHousehold(await getHouseholdMemberRole(env, current, household.id))) return finish("member_session", roomHome);
    // 웹 계정에 이어진 사람: 세션을 주지 않는다. 세션이 없으면 그 방 가계부 주소로만 보내 인앱 자동 로그인이 그 계정으로 로그인하게 하고,
    // 이 방 가계부를 못 읽는 다른 계정 세션이면 그대로 둔다.
    if (!identity.raw) return current ? finish("linked_other_session", plain) : finish("linked_account", home);
    // 다른 계정 세션을 누른 사람으로 바꾸는 것은 앱에서 바로 연 이동(Sec-Fetch-Site: none)일 때만이다.
    if (current && String(request.headers.get("sec-fetch-site") || "").toLowerCase() !== "none") return finish("session_kept", plain);
    const token = await makeUserSession(env, identity.userId);
    const cookies = [
      `ab_user=${encodeURIComponent(token)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
      "ab_hh=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      // V22.9.112 ⑳b: 다른 계정으로 세션이 바뀔 때 이전 계정의 설정 띠 판정 쿠키(ab_setup·ab_bk)도 지운다(로그아웃과 같게). 안 지우면 바뀐 계정 홈에 이전 계정의 설정/백업 로그인 띠 상태가 잘못 남는다.
      ...clearSetupCookies(),
    ];
    const consentCookie = await consentStateCookieFor(env, identity.userId);
    if (consentCookie) cookies.push(consentCookie);
    return finish(current ? "switched" : "ok", home, cookies);
  } catch (err) {
    return finish("lookup_failed", plain, [], safeError(err));
  }
}

// @build:exports-start
export { kakaoRoomOpenResponse };
// @build:exports-end
