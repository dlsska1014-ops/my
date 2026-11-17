// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { AB_HOUSEHOLD_MEMORY_HEADER } from "../runtime/config-readiness.js";
import { APP_VERSION, envFlagEnabled } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import {
  getCookie, htmlResponseWithCookies, redirectResponse, redirectResponseWithCookies,
  renderSessionUnavailableHtmlV229122,
} from "../runtime/http.js";
import { recordAuthAttempt } from "./crypto-admin-session.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { safeObject } from "../admin/backup-compare.js";
import {
  inspectKakaoLoginConfig, makeUserSession, resolveEffectiveUserId, verifyUserSession,
} from "./user-session.js";
import { fetchUserIdentityLinks } from "./identity-reauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import { clearSetupCookies } from "../my/setup-page.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { canReadMyHousehold } from "../my/access-control.js";
import {
  isKakaoTalkInAppBrowser, kakaoAutoLoginFallbackLocation, kakaoAutoLoginPath,
} from "./kakao-account-link.js";
import { consentStateCookieFor } from "./kakao-start-screen.js";
import { getLinkedKakaoGroupHousehold } from "../kakao/group-links-first-record.js";
import { getHouseholdMemberRole, readHouseholdRoleOrFailure } from "../domain/users-households.js";
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
//    않은 행)이 그 가계부를 읽을 수 있는 구성원이고 강한 식별(카카오 로그인·로그인 이름 비밀번호)이 붙지 않은 계정이면 로그인 화면 없이 그 계정 세션을
//    만들고 그 방 가계부 홈(/app?household_id=…)으로 보낸다. 승인 대기면
//    /my 상태 화면이다. 안내 확인 기록이 없으면 ab_cs=0 이라 홈 맨 위에 약관 안내 띠가 뜬다(V22.9.104 L-3 팝업 → V22.9.114 띠).
//  · 웹 계정에 이어진 사람(별칭 skill_identity: 나 계정 통합으로 찾은 계정)에게는 주소 값으로 세션을 주지 않는다(독립 검토 P2-1: 만료·폐기 없는 값이
//    웹 계정의 다른 가계부·관리자 권한까지 여는 일을 막는다). 세션이 없으면 그 방 가계부 주소로만 보내 인앱 자동 로그인(V22.9.91, 화면 없음)이 그
//    계정으로 로그인하게 한다.
//  · V22.9.118 S-2: 원래 채팅 행이라도 강한 식별(accountbook_user_identities 의 provider kakao·local 행 — 카카오 로그인·로그인 이름 비밀번호)이
//    붙은 계정은 웹 계정과 같아 주소 값으로 세션을 주지 않는다(결과 strong_account·strong_local_account·strong_other_session). 계정 잇기(V22.9.91·117)는
//    방 기록 계정을 주 계정으로 합치고 강한 식별 행을 그쪽으로 옮긴다(운영 함수 accountbook_merge_users_v227) — raw 만 보면 잇기를 마친 사람의 주소
//    값이 만료 없이 그 사람의 모든 가계부를 열었다(점검 2026-11-12). 세션이 없으면 카카오 로그인이 붙은 계정은 위처럼 그 방 가계부 주소로(인앱
//    자동 로그인), 로그인 이름 비밀번호만 붙은 계정은 자동 로그인을 끈 보통 로그인 화면(로그인 이름 칸)으로 보낸다(독립 검토 P3-3: 카카오 자동
//    로그인은 휴대폰의 카카오 계정으로 들어가 다른 계정에 닿을 수 있다). 로그인하면 그 방 가계부 주소로 돌아간다.
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
//  · 시도는 IP 마다 15분 60번(두 값이 다 있는 시도만 센다; IPv6 도 주소 그대로 — /64 로 묶는 것은 비밀번호를 대조하는 길만, V22.9.118).
//    관리자 쿠키 브라우저와 링크 미리보기 수집기(UA)는 열지 않는다.
//  · 결과는 설정 표 kakao_room_open_probe_v229105:<결과> 에 시각·판만 남긴다(식별자 없음, isolate 마다 결과별 10분에 한 번).
//    V22.9.129: 방 표식 길(아래 kakaoRoomEntryResponse)의 결과는 같은 칸에 entry_<결과> 로 남는다.
const KAKAO_ROOM_OPEN_PARAMS = ["botUserKey", "appUserId", "botGroupKey"];
const KAKAO_ROOM_OPEN_KEY_SHAPE = /^[0-9A-Fa-f]{32,128}$/;
const KAKAO_ROOM_OPEN_CRAWLER = /kakaotalk-scrap|facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|linkedinbot|skypeuripreview|googlebot|bingbot|yeti\/|daumoa|applebot|petalbot|headlesschrome/i;
const KAKAO_ROOM_OPEN_ADMISSION_LIMIT = 60;
const KAKAO_ROOM_OPEN_PROBE_PREFIX = "kakao_room_open_probe_v229105:";
const KAKAO_ROOM_OPEN_PROBE_MS = 10 * 60 * 1000;
const KAKAO_ROOM_OPEN_OK = new Set(["ok", "switched", "same_session", "member_session", "linked_account", "strong_account", "strong_local_account"]);
// V22.9.118 S-2: 강한 식별로 세는 종류. 계정 잇기(V22.9.117)·본인 확인이 믿는 것(identity-reauth.js fetchStrongIdentityForUser 의 kakao·local)과 같다.
const KAKAO_ROOM_OPEN_STRONG_PROVIDERS = ["kakao", "local"];
const KAKAO_ROOM_OPEN_HEADERS = { "referrer-policy": "no-referrer" };
const AB_KAKAO_ROOM_OPEN_PROBE = globalThis.__AB_KAKAO_ROOM_OPEN_PROBE || (globalThis.__AB_KAKAO_ROOM_OPEN_PROBE = new Map());
// V22.9.129 방 표식: 단톡방 ‘웹 가계부 열기’ 단추의 주소 /my?room=<그 방 가계부 번호>(kakao/response-builders.js kakaoWebLedgerReply).
const KAKAO_ROOM_ENTRY_PARAM_V229129 = "room";
// 독립 검토 3(P2): 표식은 가계부 번호(UUID) 모양만 받는다. 가계부 번호 칸은 uuid 형이라, 다른 글자(잘린 복사·손으로 친 값·남이 꾸민 링크)로 역할을 읽으면
// 저장소가 형 변환 오류를 내고 — 그것을 ‘읽기 실패’ 로 다루면 로그인한 사람이 끝나지 않는 ‘잠시 뒤 다시’ 에 갇힌다. 모양이 틀린 표식은 읽기 전에 버린다(/my).
const KAKAO_ROOM_ENTRY_ID_V229129 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function kakaoRoomEntryLocationV229129(householdId = "") {
  return `/my?${KAKAO_ROOM_ENTRY_PARAM_V229129}=${encodeURIComponent(String(householdId || ""))}`;
}
// 돌아갈 주소가 방 표식 주소(정확히 /my?room=<번호> 하나)인지. 카카오 로그인 시작(auth/kakao-oauth.js)이 카카오톡 밖의 브라우저에도 화면 없는 로그인을
// 허락할지 볼 때 쓴다 — 그 밖의 주소로는 예전처럼 인앱 브라우저만이다.
// V22.9.129 독립 검토 2(P2): 카카오톡 밖의 브라우저에서 하는 화면 없는 카카오 로그인은 운영 변수 KAKAO_ROOM_QUIET_LOGIN 을 켠 곳(1·true·on)에서만 한다.
// 없으면 꺼짐이다. 그 브라우저의 카카오 계정이 단추를 누른 사람인지는 서버가 알 수 없다 — 가족이 같이 쓰는 PC 에 다른 가족의 카카오 로그인이 남아 있고
// 그 사람도 같은 방 구성원이면, 아무도 누르지 않았는데 그 사람의 계정으로 들어가 기록이 그 사람 이름으로 남는다(그 방을 읽을 수 있는 계정만 들이는 조건으로는
// 막지 못한다). 꺼 두면 로그인 화면이 나오고(사람이 [카카오 로그인] 을 누른다) 로그인 뒤 그 방 가계부로 돌아온다. 켜는 것은 운영자 결정이다.
function kakaoRoomQuietLoginEnabledV229129(env) {
  return envFlagEnabled(env?.KAKAO_ROOM_QUIET_LOGIN, false) && envFlagEnabled(env?.KAKAO_INAPP_AUTO_LOGIN, true);
}
function kakaoRoomEntryHouseholdIdV229129(raw = "") {
  const match = /^\/my\?room=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(String(raw || "").trim());
  return match ? match[1] : "";
}
function kakaoRoomEntryReturnPathV229129(raw = "") {
  const id = kakaoRoomEntryHouseholdIdV229129(raw);
  return id ? kakaoRoomEntryLocationV229129(id) : "";
}

// 카카오 값을 뺀 주소. 가계부 번호(householdId)가 주어지면 그 방 가계부 홈으로 간다: /my·/app·/m 은 /app 홈, /my/* 는 그 화면에 가계부 번호를 붙인다.
function kakaoRoomOpenLocation(url, householdId = "") {
  const query = new URLSearchParams(url.search);
  for (const name of KAKAO_ROOM_OPEN_PARAMS) query.delete(name);
  let path = url.pathname === "/m" ? "/app" : url.pathname;
  if (householdId) {
    // V22.9.129: 방 가계부 번호가 정해졌으면 방 표식(room)은 뺀다(같은 뜻이 household_id 로 실린다). 값을 뺀 주소(householdId 없음)에는 그대로 남겨
    // 아래 kakaoRoomEntryResponse 가 이어 받게 한다.
    query.delete(KAKAO_ROOM_ENTRY_PARAM_V229129);
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

// V22.9.118 S-2: 이 계정에 강한 식별(카카오 로그인·로그인 이름 비밀번호)이 붙어 있는지(읽기 한 번). 돌려주는 값: "kakao"(카카오 로그인이 있다) ·
// "local"(로그인 이름 비밀번호만) · ""(없음). 읽지 못하면 던져서 열지 않는다(lookup_failed).
// kakao·local 두 종류만 센다(독립 검토 P2-1: 표에 다른 종류의 행이 생겨도 — 지금은 표의 CHECK 가 두 종류만 받는다 — 보통 채팅 사용자의 바로
// 열기가 깨지지 않게). 한 계정에 종류마다 한 줄뿐이라(UNIQUE provider·user_id) 두 줄까지 읽는다.
// 옛 링크 표 별칭(kakao_login:·local_web:)만 붙은 계정은 보지 않는다 — 전역 링크 표(사용자마다 커지는 한 줄 JSON)를 단추를 누를 때마다 읽게 되어서다.
// kakao_login: 별칭은 그 카카오 계정으로 웹에 처음 로그인할 때 강한 식별 행이 되고(findUserByKakaoLoginId), local_web: 별칭으로는 지금 로그인할 수
// 없다(로그인 이름 로그인은 강한 식별만 본다). 남는 틈은 별칭만 있고 아직 웹으로 한 번도 로그인하지 않은 계정이다.
async function kakaoRoomOpenStrongIdentity(env, userId = "") {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("room_open_identity_missing");
  const rows = await supabase(env, `/rest/v1/accountbook_user_identities?user_id=eq.${encodeURIComponent(uid)}&provider=in.(${KAKAO_ROOM_OPEN_STRONG_PROVIDERS.join(",")})&select=provider&limit=2`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("room_open_identity_invalid");
  const providers = new Set(rows.map((row) => String(row?.provider || "")));
  return providers.has("kakao") ? "kakao" : providers.has("local") ? "local" : "";
}

// V22.9.118 S-2: 로그인 이름 비밀번호만 붙은 계정이 갈 곳. 자동 로그인을 끈(auto=0) 보통 로그인 화면에 로그인 이름 칸을 열어 두고(login=1, 시작
// 화면의 ‘로그인 이름으로 로그인’ 과 같은 주소), 로그인하면 그 방 가계부 주소(return_to)로 돌아간다.
function kakaoRoomOpenLoginNameLocation(home = "") {
  const back = safeUserReturnPath(home, "");
  const query = new URLSearchParams({ auto: "0", login: "1" });
  if (back && back !== "/my" && back.length <= 512) query.set("return_to", back);
  return `/my?${query.toString()}#login-local`;
}

function kakaoRoomOpenProbe(env, ctx, result = "", detail = "") {
  const slot = String(result || "unknown").replace(/[^a-z_]/g, "").slice(0, 40) || "unknown";
  rememberOpsEvent({ kind: "kakao_room_open", severity: KAKAO_ROOM_OPEN_OK.has(slot) ? "info" : "warn", path: "/my", method: "GET", detail: detail ? `${slot}: ${detail}`.slice(0, 200) : slot });
  kakaoRoomOpenProbeSave(env, ctx, slot);
}

// V22.9.129: 방 표식 길(kakaoRoomEntryResponse)의 결과. 같은 진단 기록 칸에 entry_<결과> 로 남긴다(시각·판만 — 가계부 번호·식별자 없음).
// 2026-11-17 의 교훈: 이 흐름은 화면에서 본 것으로 짐작하지 않고 서버가 남긴 이 기록으로 확인한다.
function kakaoRoomEntryProbeV229129(env, ctx, result = "") {
  const name = String(result || "unknown").replace(/[^a-z_]/g, "").slice(0, 30) || "unknown";
  rememberOpsEvent({ kind: "kakao_room_entry", severity: "info", path: "/my", method: "GET", detail: name });
  kakaoRoomOpenProbeSave(env, ctx, `entry_${name}`);
}

function kakaoRoomOpenProbeSave(env, ctx, slot = "") {
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
  let plain = kakaoRoomOpenLocation(source, "");
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
    // V22.9.129 독립 검토 P3: 방이 다른 가계부로 다시 묶인 뒤 옛 카드를 누르면 표식(room)이 옛 가계부를 가리킨다. 카카오 값이 가리키는 지금의 방 가계부와
    // 다른 표식은 아래의 ‘값을 뺀 주소’ 에서 버린다(그 방의 지금 가계부 번호로 바꿔 적지는 않는다 — 구성원이 아닌 사람에게 번호를 알려 주지 않으려고).
    // 방 가계부를 읽기 전에 끝나는 결과(사용자 키 없음·키 모양 틀림·요청 제한·수집기·관리자 브라우저)와 값이 아예 없는 PC 길은 방을 확인하지 않으므로
    // 옛 표식이 남는다 — 그 가계부를 읽을 수 있는 사람에게만 열리고 권한은 넓어지지 않는다(알려진 한계, 발견 기록 E-6).
    if (source.searchParams.has(KAKAO_ROOM_ENTRY_PARAM_V229129) && source.searchParams.get(KAKAO_ROOM_ENTRY_PARAM_V229129) !== String(household.id)) {
      source.searchParams.delete(KAKAO_ROOM_ENTRY_PARAM_V229129);
      plain = kakaoRoomOpenLocation(source, "");
    }
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
    // V22.9.129: 카카오톡 밖의 브라우저(PC 카카오톡이 여는 기본 브라우저)에는 인앱 자동 로그인이 없어, 그 방 가계부 주소(/app?household_id=…)가 세션 없이
    // 가계부 번호를 잃고 /my 시작 화면으로 갔다. 그런 브라우저는 방 표식 주소(/my?room=…)로 보낸다 — kakaoRoomEntryResponse 가 화면 없는 카카오 로그인을
    // 한 번 해 보고, 안 되면 로그인 화면이 이 방 가계부로 돌아올 주소를 갖는다. 주소 값으로 세션을 주지 않는 것은 그대로다.
    const loginEntry = readable && !isKakaoTalkInAppBrowser(request) ? kakaoRoomEntryLocationV229129(household.id) : home;
    if (!identity.raw) return current ? finish("linked_other_session", plain) : finish("linked_account", loginEntry);
    // 다른 계정 세션을 누른 사람으로 바꾸는 것은 앱에서 바로 연 이동(Sec-Fetch-Site: none)일 때만이다.
    if (current && String(request.headers.get("sec-fetch-site") || "").toLowerCase() !== "none") return finish("session_kept", plain);
    // V22.9.118 S-2: 강한 식별이 붙은 채팅 계정도 웹 계정에 이어진 사람과 같이 세션을 주지 않는다(R-6 의 뜻). 다른 계정 세션이면 그대로 둔다.
    // 세션이 없으면 카카오 로그인이 붙은 계정은 그 방 가계부 주소로만 보내 인앱 자동 로그인이 그 카카오 계정으로 로그인하게 하고, 로그인 이름
    // 비밀번호만 붙은 계정은 자동 로그인 없이 로그인 이름 칸을 연 로그인 화면으로 보낸다(카카오 자동 로그인은 이 계정에 닿지 않는다).
    const strong = await kakaoRoomOpenStrongIdentity(env, identity.userId);
    if (strong) {
      if (current) return finish("strong_other_session", plain);
      return strong === "kakao" ? finish("strong_account", loginEntry) : finish("strong_local_account", kakaoRoomOpenLoginNameLocation(home));
    }
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

// V22.9.129 W-3·W-4(사용자 2026-11-17 "앱 승인 담당자가 말했듯 웹 가계부 열기 누르면 로그인 없이 바로 가계부가 열려야해", "pc에서도 바로 열리게 해줘"):
// 단톡방 ‘웹 가계부 열기’ 단추의 주소는 /my?room=<그 방 가계부 번호> 다. 카카오가 식별 값을 붙여 주면(휴대폰) 위의 kakaoRoomOpenResponse 가 먼저 받는다.
// 값이 없거나 쓸 수 없으면(2026-11-17 운영 기록: PC 카카오톡은 사용자 식별 값 없이 연다) 이 표식만 남고, 라우터가 그다음에 이 함수를 부른다.
//  · 세션이 있으면: 그 가계부를 읽을 수 있을 때 그 가계부 홈으로, 아니면 표식을 뺀 /my 로 보낸다. 표식은 고르는 힌트일 뿐 권한이 아니다 —
//    남의 가계부 번호를 적어도 그 가계부는 열리지 않고 ‘찾을 수 없음’ 도 내지 않는다(자기 가계부가 열린다).
//  · 세션이 없고 카카오톡 밖의 브라우저면: 기본은 로그인 화면이다(돌아올 주소 = 이 표식 주소 — 로그인하면 그 방 가계부가 열린다).
//    운영 변수 KAKAO_ROOM_QUIET_LOGIN 을 켠 곳에서는 화면 없는 카카오 로그인(prompt=none)을 한 번 해 본다. 그 브라우저에 카카오 로그인이 돼 있고 이미 회원이면
//    화면 없이 들어와 이 표식 주소로 돌아오고(위 줄), 아니면 로그인 화면이 돌아올 주소(이 표식 주소)를 갖고 열린다. 자동 로그인의 규칙(새 계정을 만들지
//    않음, 한 번 해 보면 되풀이하지 않음 — auth/kakao-oauth.js)은 인앱과 같고, 인앱보다 좁다: 그 카카오 계정의 웹 계정이 이 표식의 가계부를 읽을 수 있을
//    때만 세션을 준다(콜백, 독립 검토 P2). 빈 계정·그 방을 못 읽는 계정(공용 PC 에 남은 다른 사람의 카카오 로그인일 수 있다)·계정 잇기 제안이 걸린 계정은
//    세션 없이 로그인 화면으로 간다 — 그 사람의 다른 가계부가 아무도 누르지 않았는데 열리는 일이 없다.
//  · 카카오톡 안의 브라우저는 예전의 인앱 자동 로그인·시작 팝업이 그대로 맡는다(돌아올 주소에 이 표식이 실린다). 관리자 쿠키 브라우저는 건드리지 않는다.
// 식별 값으로 세션을 주는 일은 여기서 하지 않는다 — 이 길의 로그인은 그 브라우저의 카카오 로그인(또는 사용자가 직접 한 로그인)뿐이다.
async function kakaoRoomEntryResponse(request, env, url, ctx) {
  if (String(request?.method || "GET").toUpperCase() !== "GET" || !url || url.pathname !== "/my" || !url.searchParams.has(KAKAO_ROOM_ENTRY_PARAM_V229129)) return null;
  const fetchMode = String(request.headers.get("sec-fetch-mode") || "").toLowerCase();
  if (fetchMode ? fetchMode !== "navigate" : !/text\/html/i.test(String(request.headers.get("accept") || ""))) return null;
  if (/prefetch|prerender/i.test(`${request.headers.get("sec-purpose") || ""} ${request.headers.get("purpose") || ""}`)) return null;
  const householdId = String(url.searchParams.get(KAKAO_ROOM_ENTRY_PARAM_V229129) || "").trim();
  // 모양이 틀리거나 두 번 온 표식은 버린다(그냥 /my).
  if (url.searchParams.getAll(KAKAO_ROOM_ENTRY_PARAM_V229129).length !== 1 || !KAKAO_ROOM_ENTRY_ID_V229129.test(householdId)) return redirectResponse("/my", KAKAO_ROOM_OPEN_HEADERS);
  const entry = kakaoRoomEntryLocationV229129(householdId);
  const current = await verifyUserSession(request, env);
  // V22.9.129 독립 검토: 서명·만료가 맞는 세션인데 DB 가 잠깐 답하지 못해 확인을 못 한 요청(V22.9.122 F-1 의 표시)은 로그인하지 않은 사람처럼 카카오로
  // 보내지 않는다. 예전 길(/my)에 맡긴다 — 라우터가 그 로그인 화면을 ‘잠시 뒤 다시’ 안내로 바꾸고, 주소는 그대로라 새로 고치면 다시 이 길로 온다.
  if (!current && env?.__AB_SESSION_UNAVAILABLE === true) return null;
  if (current) {
    // 독립 검토 2(P3): 역할을 읽지 못한 것(DB 순간 장애)을 ‘읽을 수 없음’ 으로 다루지 않는다 — 표식을 뺀 /my 로 보내면 새로 고쳐도 이 방 가계부로 돌아오지 못한다.
    // 실패를 따로 알려 주는 엄격판으로 읽고(getHouseholdMemberRole 은 실패하면 빈 역할을 돌려준다 — V22.9.76 D-27), 실패하면 ‘잠시 뒤 다시’ 안내(503)를 낸다.
    // 그 화면의 다시 열기 주소가 이 표식을 싣는다(runtime/http.js).
    const roleRead = await readHouseholdRoleOrFailure(env, current, householdId, { path: "/my", method: "GET" });
    if (roleRead.failed) {
      kakaoRoomEntryProbeV229129(env, ctx, "role_read_failed");
      // 로그인은 확인됐고 가계부 읽기만 실패했다 — 화면의 말도 그렇게 한다(독립 검토 3 P3).
      return htmlResponseWithCookies(renderSessionUnavailableHtmlV229122(url, false, "household"), 503, [], { "retry-after": "10", "cache-control": "no-store", ...KAKAO_ROOM_OPEN_HEADERS });
    }
    const readable = canReadMyHousehold(roleRead.role); // 역할은 readHouseholdRoleOrFailure 가 소문자로 돌려준다
    kakaoRoomEntryProbeV229129(env, ctx, readable ? "session_readable" : "session_other");
    return redirectResponse(readable ? `/app?household_id=${encodeURIComponent(householdId)}` : "/my", KAKAO_ROOM_OPEN_HEADERS);
  }
  // 카카오톡 안의 브라우저(예전의 인앱 자동 로그인이 맡는다)·관리자 쿠키 브라우저·링크 미리보기 수집기는 건드리지 않는다(예전 그대로 /my).
  if (isKakaoTalkInAppBrowser(request) || getCookie(request, "ab_admin") || KAKAO_ROOM_OPEN_CRAWLER.test(String(request.headers.get("user-agent") || ""))) return null;
  const fallback = kakaoAutoLoginFallbackLocation(entry);
  // 화면 없는 로그인은 사람이 바로 연 이동(Sec-Fetch-Site: none — 카카오톡이 띄운 브라우저, 주소 입력)일 때만 해 본다. 다른 사이트의 링크·넘김이 시킨 이동이나
  // 그 머리가 없는 요청은 로그인 화면으로 간다(위의 세션 바꾸기와 같은 기준 — 남의 화면이 이 브라우저를 말없이 로그인시키지 못하게).
  const direct = String(request.headers.get("sec-fetch-site") || "").toLowerCase() === "none";
  // 화면 없는 로그인을 켜지 않은 운영(기본 — 위 kakaoRoomQuietLoginEnabledV229129), 이미 한 번 해 본 브라우저(ab_kakao_auto: try·skip), 직접 로그아웃한 브라우저(off),
  // 카카오 로그인 설정이 준비되지 않은 곳도 로그인 화면이다(돌아올 주소는 이 표식 주소).
  if (!direct || url.searchParams.get("auto") === "0" || getCookie(request, "ab_kakao_auto") || !kakaoRoomQuietLoginEnabledV229129(env) || !inspectKakaoLoginConfig(env).ready) {
    kakaoRoomEntryProbeV229129(env, ctx, direct ? "login_screen" : "login_screen_indirect");
    return redirectResponse(fallback, KAKAO_ROOM_OPEN_HEADERS);
  }
  kakaoRoomEntryProbeV229129(env, ctx, "quiet_login");
  return redirectResponse(`/auth/kakao/start?auto=1&return_to=${encodeURIComponent(entry)}`, KAKAO_ROOM_OPEN_HEADERS);
}

// @build:exports-start
export {
  kakaoRoomEntryHouseholdIdV229129, kakaoRoomEntryResponse, kakaoRoomEntryReturnPathV229129,
  kakaoRoomOpenResponse, kakaoRoomQuietLoginEnabledV229129,
};
// @build:exports-end
