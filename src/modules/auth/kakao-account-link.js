// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { APP_VERSION, appName, envFlagEnabled } from "../public/site-config.js";
import { parseStrictSettingsObject, safeError, withSettingsRmwLease } from "../runtime/leases.js";
import {
  getCookie, htmlResponse, redirectResponse, redirectResponseWithCookies,
} from "../runtime/http.js";
import { sha256Hex } from "./crypto-admin-session.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { supabaseExactCount } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeObject } from "../admin/backup-compare.js";
import {
  inspectKakaoLoginConfig, makeUserSession, resolveEffectiveUserId, verifyUserSession,
} from "./user-session.js";
import { lookupKakaoLoginOwner, readPurposeToken, signedPurposeToken } from "./identity-reauth.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { MY_ACCESS_STATUS_CSS } from "../my/access-control.js";
import { addQueryToUrl } from "./local-login-pages.js";
import { kakaoClaimUserUnmerged } from "./kakao-web-claim.js";
import { isDefiniteStorageFailure } from "../kakao/response-builders.js";
import { getKakaoBotGroupKey } from "../kakao/group-links-first-record.js";
import { performIdentityMerge } from "../admin/identity-merge.js";
import { supabase } from "../data/supabase-client.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.91 계정 잇기(사용자 2026-10-30 "로그인 없이 바로 가계부가 나오도록 계정 잇기가 필요해", 같은 날 "좋아 추천으로 진행하자").
// 조사는 review-artifacts/identity-link-2026-10-30/RESEARCH.md 에 있다. 이 파일이 맡는 일은 셋이다.
//  1) 카카오톡 인앱 브라우저 자동 로그인. 세션 없이 /my·/app 을 열면 prompt=none 으로 카카오 로그인을 먼저 해 본다(카카오 문서
//     ‘카카오톡에서 자동 로그인’). 회원이면 화면 없이 로그인되고, 비회원(consent_required)·오류면 지금처럼 로그인 화면이 나온다.
//  2) 갈라진 계정 잇기. 단톡방 기록 계정(봇 사용자 키)과 웹 카카오 로그인 계정이 따로 있을 수 있다. Secret 으로 확인된 카카오 요청의
//     appUserId 가 그 웹 계정의 카카오 로그인 id 와 같으면 같은 사람이다. 채팅 요청은 계정을 합치지 않고 ‘잇기 제안’만 남긴다
//     (identity-chat-first.js). 합치기는 같은 카카오 계정으로 방금 로그인한 브라우저에서만 한다. 남의 세션 쿠키만으로는 못 합친다.
//     한쪽에 가계부·기록이 없으면 확인 없이 잇고, 둘 다 있으면 /my/account-link 에서 확인을 받은 뒤 잇는다.
//  3) appUserId 도착 진단. 콘솔에서 웹 로그인 앱(1489689)을 그룹 챗봇에 연결한 뒤 실제로 오는지 관리자 화면(/identity-audit)에서 본다.
// 2)의 합치기(안내·확인 화면·합치기 표)는 KAKAO_ACCOUNT_LINK_ENABLED=1 일 때만 한다(기본 꺼짐, kakaoAccountLinkEnabled). 1)·3)과 제안 남기기는 꺼져 있어도 한다.
const KAKAO_AUTO_LOGIN_COOKIE = "ab_kakao_auto";
// try: 자동 로그인을 보낸 뒤 돌아올 때까지(되풀이 막기). skip: 비회원·오류(하루 동안 다시 보내지 않음). off: 직접 로그아웃(30일).
const KAKAO_AUTO_LOGIN_COOKIE_AGES = { try: 600, skip: 86400, off: 2592000 };
const KAKAO_ACCOUNT_LINK_OFFERS_KEY = "kakao_login_link_offers_v22991";
const KAKAO_ACCOUNT_LINK_PROOF_COOKIE = "ab_account_link";
const KAKAO_ACCOUNT_LINK_LATER_COOKIE = "ab_account_link_later";
const KAKAO_ACCOUNT_LINK_PAUSE_COOKIE = "ab_account_link_pause";
const KAKAO_ACCOUNT_LINK_PAUSE_SECONDS = 600;
const KAKAO_ACCOUNT_LINK_OFFER_CAPACITY = 200;
const KAKAO_ACCOUNT_LINK_OFFER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KAKAO_ACCOUNT_LINK_CACHE_MS = 60 * 1000;
const KAKAO_APP_USER_ID_PROBE_PREFIX = "kakao_app_user_id_probe_v22991:";
const KAKAO_APP_USER_ID_PROBE_SLOTS = ["present:group", "present:direct", "absent:group", "absent:direct"];
const AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE || (globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE = { at: 0, value: null });
const AB_KAKAO_APP_USER_ID_PROBE = globalThis.__AB_KAKAO_APP_USER_ID_PROBE || (globalThis.__AB_KAKAO_APP_USER_ID_PROBE = new Map());

// V22.9.91 독립 검토: 합치기는 Secret 으로 확인된 채팅 요청의 appUserId 를 믿는다. 콘솔에 엉뚱한 앱이 연결되거나 Secret 이 새면 남의 웹
// 계정과 이어질 수 있으니, 앱 1489689 를 봇에 연결하고 운영자 자신의 갈라진 계정으로 진단(appUserId 옴)·제안을 확인한 뒤에 켠다.
function kakaoAccountLinkEnabled(env) {
  return envFlagEnabled(env?.KAKAO_ACCOUNT_LINK_ENABLED, false) && inspectKakaoLoginConfig(env).ready;
}

// 카카오 문서: 인앱 브라우저는 UserAgent 에 대문자 KAKAOTALK 이 있다. 링크 미리보기 수집기(kakaotalk-scrap)는 사람이 아니라서 뺀다.
function isKakaoTalkInAppBrowser(request) {
  const ua = String(request?.headers?.get?.("user-agent") || "");
  return /\bKAKAOTALK\b/.test(ua) && !/kakaotalk-scrap/i.test(ua);
}

function kakaoAutoLoginCookie(kind = "") {
  const age = KAKAO_AUTO_LOGIN_COOKIE_AGES[kind];
  return age
    ? `${KAKAO_AUTO_LOGIN_COOKIE}=${kind}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`
    : `${KAKAO_AUTO_LOGIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function kakaoAutoLoginPath(pathname = "") {
  const path = String(pathname || "");
  if (path === "/my" || path === "/app" || path === "/m") return true;
  if (!path.startsWith("/my/") || path === "/my/logout" || path.startsWith("/my/account-link")) return false;
  return !/\.(?:js|css|json|png|svg|ico|webmanifest|txt)$/i.test(path);
}

// 라우터가 통합 계정 세션 복구 다음에 부른다. 로그인 화면을 그리기 전에 카카오 로그인을 화면 없이 한 번 해 본다.
// 세션이 있거나(같은 요청 캐시라 왕복이 늘지 않는다), 이미 해 봤거나(ab_kakao_auto), 페이지 이동이 아닌 요청이면 하지 않는다.
// 관리자 세션이 있는 브라우저의 /app 은 관리자 화면이라 건드리지 않는다. 운영에서 끌 때는 KAKAO_INAPP_AUTO_LOGIN=0.
async function kakaoInAppAutoLoginResponse(request, env, url) {
  if (String(request?.method || "GET").toUpperCase() !== "GET" || !url || !kakaoAutoLoginPath(url.pathname)) return null;
  if (url.searchParams.get("auto") === "0" || !isKakaoTalkInAppBrowser(request) || getCookie(request, KAKAO_AUTO_LOGIN_COOKIE)) return null;
  const fetchMode = String(request.headers.get("sec-fetch-mode") || "").toLowerCase();
  if (fetchMode ? fetchMode !== "navigate" : !/text\/html/i.test(String(request.headers.get("accept") || ""))) return null;
  if (/prefetch|prerender/i.test(`${request.headers.get("sec-purpose") || ""} ${request.headers.get("purpose") || ""}`)) return null;
  if (!envFlagEnabled(env.KAKAO_INAPP_AUTO_LOGIN, true) || !inspectKakaoLoginConfig(env).ready || getCookie(request, "ab_admin")) return null;
  if (await verifyUserSession(request, env)) return null;
  const back = safeUserReturnPath(`${url.pathname}${url.search}`, "");
  const qs = new URLSearchParams({ auto: "1" });
  if (back && back !== "/my" && back.length <= 512) qs.set("return_to", back);
  return redirectResponse(`/auth/kakao/start?${qs.toString()}`);
}

// 자동 로그인이 안 됐을 때 돌아갈 로그인 화면. auto=0 은 쿠키가 막힌 인앱 브라우저에서도 되풀이를 끊는다.
function kakaoAutoLoginFallbackLocation(next = "") {
  const back = safeUserReturnPath(next || "", "");
  return back && back !== "/my" ? `/my?auto=0&return_to=${encodeURIComponent(back)}` : "/my?auto=0";
}

async function kakaoAccountLinkOfferHash(kakaoId = "") {
  return sha256Hex(`kakao-login-link-offer:v1:${String(kakaoId || "").trim()}`);
}

// 잇기 제안 표: { 웹 로그인 계정 id: { chat_user_id, kakao_hash, created_at, updated_at } }. 카카오 로그인 id 는 해시로만 둔다.
// 모양이 틀린 줄은 버린다(원형 없는 객체에 담아 "__proto__" 같은 키가 원형을 바꾸지 못한다).
function normalizeKakaoAccountLinkOffers(value) {
  const parsed = parseStrictSettingsObject(value, KAKAO_ACCOUNT_LINK_OFFERS_KEY);
  const out = Object.create(null);
  for (const [loginUserId, raw] of Object.entries(parsed)) {
    const item = safeObject(raw);
    const chatUserId = String(item.chat_user_id || "").trim();
    const kakaoHash = String(item.kakao_hash || "");
    const updatedAt = String(item.updated_at || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(loginUserId) || ["__proto__", "constructor", "prototype"].includes(loginUserId)) continue;
    if (!chatUserId || chatUserId === loginUserId || !/^[a-f0-9]{64}$/.test(kakaoHash) || !Number.isFinite(Date.parse(updatedAt))) continue;
    out[loginUserId] = { chat_user_id: chatUserId, kakao_hash: kakaoHash, created_at: String(item.created_at || updatedAt), updated_at: updatedAt };
  }
  return out;
}

function rememberKakaoAccountLinkOffersCache(offers) {
  AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE.value = offers;
  AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE.at = Date.now();
}

// /my 의 확인은 isolate 마다 1분 동안 같은 표를 쓴다(제안이 없는 사람에게 DB 조회를 늘리지 않는다). 합치기·제안 저장은 fresh 로 새로 읽는다.
async function readKakaoAccountLinkOffers(env, { fresh = false } = {}) {
  const cache = AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (!fresh && cache.value && Date.now() - cache.at < KAKAO_ACCOUNT_LINK_CACHE_MS) return cache.value;
  const offers = normalizeKakaoAccountLinkOffers(await getSettingValueStrict(env, KAKAO_ACCOUNT_LINK_OFFERS_KEY));
  rememberKakaoAccountLinkOffersCache(offers);
  return offers;
}

function prunedKakaoAccountLinkOffers(offers, now = Date.now()) {
  const entries = Object.entries(offers)
    .filter(([, item]) => now - Date.parse(item.updated_at) < KAKAO_ACCOUNT_LINK_OFFER_TTL_MS)
    .sort((a, b) => Date.parse(b[1].updated_at) - Date.parse(a[1].updated_at))
    .slice(0, KAKAO_ACCOUNT_LINK_OFFER_CAPACITY);
  const out = Object.create(null);
  for (const [key, item] of entries) out[key] = item;
  return out;
}

async function rememberKakaoAccountLinkOffer(env, { chatUserId = "", loginUserId = "", kakaoId = "" } = {}) {
  const chat = String(chatUserId || "").trim();
  const login = String(loginUserId || "").trim();
  if (!chat || !login || chat === login || !String(kakaoId || "").trim()) return false;
  const hash = await kakaoAccountLinkOfferHash(kakaoId);
  const cached = AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE.value?.[login];
  if (cached && cached.chat_user_id === chat && cached.kakao_hash === hash && Date.now() - AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE.at < KAKAO_ACCOUNT_LINK_CACHE_MS) return false;
  return withSettingsRmwLease(env, `settings-rmw:${KAKAO_ACCOUNT_LINK_OFFERS_KEY}`, async ({ assertFresh }) => {
    const offers = normalizeKakaoAccountLinkOffers(await getSettingValueStrict(env, KAKAO_ACCOUNT_LINK_OFFERS_KEY));
    const current = offers[login];
    if (current && current.chat_user_id === chat && current.kakao_hash === hash) {
      rememberKakaoAccountLinkOffersCache(offers);
      return false;
    }
    const now = new Date().toISOString();
    offers[login] = { chat_user_id: chat, kakao_hash: hash, created_at: now, updated_at: now };
    const kept = prunedKakaoAccountLinkOffers(offers);
    assertFresh();
    await saveSettingValue(env, KAKAO_ACCOUNT_LINK_OFFERS_KEY, JSON.stringify(kept));
    rememberKakaoAccountLinkOffersCache(kept);
    rememberOpsEvent({ kind: "kakao_account_link_offer", severity: "info", path: "/skill", method: "POST", label: "계정 잇기 제안 저장", detail: `채팅 ${chat.slice(0, 8)} · 카카오 로그인 ${login.slice(0, 8)}` });
    return true;
  });
}

async function forgetKakaoAccountLinkOffer(env, loginUserId = "") {
  const login = String(loginUserId || "").trim();
  if (!login) return false;
  return withSettingsRmwLease(env, `settings-rmw:${KAKAO_ACCOUNT_LINK_OFFERS_KEY}`, async ({ assertFresh }) => {
    const offers = normalizeKakaoAccountLinkOffers(await getSettingValueStrict(env, KAKAO_ACCOUNT_LINK_OFFERS_KEY));
    if (!offers[login]) {
      rememberKakaoAccountLinkOffersCache(offers);
      return false;
    }
    delete offers[login];
    assertFresh();
    await saveSettingValue(env, KAKAO_ACCOUNT_LINK_OFFERS_KEY, JSON.stringify(offers));
    rememberKakaoAccountLinkOffersCache(offers);
    return true;
  });
}

function kakaoAccountLinkOfferForUser(offers = {}, userId = "") {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  if (offers[uid]) return { loginUserId: uid, ...offers[uid] };
  for (const [loginUserId, item] of Object.entries(offers)) {
    if (item.chat_user_id === uid) return { loginUserId, ...item };
  }
  return null;
}

// 채팅 요청(identity-chat-first.js)은 제안을 바로 쓰지 않고 요청 안에 모아 둔다. 답 처리가 끝난 뒤 afterKakaoSkillIdentityWork 가
// 이 요청의 DB 호출 여유가 있을 때만 쓴다. 단톡방 첫 기록처럼 호출이 많은 요청을 50회 한도 쪽으로 밀지 않기 위해서다.
function queueKakaoAccountLinkOffer(env, offer = {}) {
  if (!env || typeof env !== "object") return;
  const queue = Array.isArray(env.__AB_PENDING_ACCOUNT_LINK_OFFERS) ? env.__AB_PENDING_ACCOUNT_LINK_OFFERS : (env.__AB_PENDING_ACCOUNT_LINK_OFFERS = []);
  if (queue.length < 4) queue.push({ chatUserId: String(offer.chatUserId || ""), loginUserId: String(offer.loginUserId || ""), kakaoId: String(offer.kakaoId || "") });
}

function hasDatabaseRoom(env, reserve = 0) {
  const budget = env?.__AB_DB_BUDGET;
  return !budget || Number(budget.used || 0) + reserve <= Number(budget.limit || 50);
}

// appUserId 가 실제로 오는지(콘솔에서 앱 1489689 를 봇에 연결한 뒤) 관리자 화면에서 보려고 남긴다. 받은 값은 적지 않고 왔는지·안 왔는지와
// 시각만 적는다. 칸(왔음·안 옴 × 단톡방·1:1)마다 isolate 당 한 시간에 한 번만 쓴다. 웹 카카오 로그인이 꺼진 곳에서는 잇기가 없으니 남기지 않는다.
async function noteKakaoAppUserIdProbe(env, payload = {}) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY || !inspectKakaoLoginConfig(env).ready) return false;
  const user = safeObject(payload?.userRequest?.user || payload?.user || {});
  const props = safeObject(user.properties || {});
  const present = !!String(props.appUserId || payload?.appUserId || "").trim();
  const slot = `${present ? "present" : "absent"}:${getKakaoBotGroupKey(payload) ? "group" : "direct"}`;
  const now = Date.now();
  if (now - Number(AB_KAKAO_APP_USER_ID_PROBE.get(slot) || 0) < 60 * 60 * 1000) return false;
  AB_KAKAO_APP_USER_ID_PROBE.set(slot, now);
  try {
    await saveSettingValue(env, `${KAKAO_APP_USER_ID_PROBE_PREFIX}${slot}`, JSON.stringify({ version: 1, at: new Date(now).toISOString(), app_version: APP_VERSION }));
    return true;
  } catch (err) {
    AB_KAKAO_APP_USER_ID_PROBE.delete(slot);
    rememberOpsEvent({ kind: "kakao_app_user_id_probe_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
    return false;
  }
}

// skill-handler.js 가 답 처리(work)가 끝난 뒤 waitUntil 로 부른다. 실패해도 답에는 영향이 없다.
// 웹 카카오 로그인이 꺼진 곳에서는 이을 수 없으니 제안도 진단도 남기지 않는다.
async function afterKakaoSkillIdentityWork(env, payload = {}, trustedKakaoCaller = false) {
  const queue = Array.isArray(env?.__AB_PENDING_ACCOUNT_LINK_OFFERS) ? env.__AB_PENDING_ACCOUNT_LINK_OFFERS.splice(0) : [];
  if (!inspectKakaoLoginConfig(env).ready) return;
  for (const offer of queue) {
    if (!hasDatabaseRoom(env, 8)) {
      // 같은 두 계정의 충돌은 isolate 마다 10분에 한 번 남기므로(identity-chat-first.js) 그 뒤 요청이 다시 남긴다.
      rememberOpsEvent({ kind: "kakao_account_link_offer_deferred", severity: "info", path: "/skill", method: "POST", detail: "DB 호출 여유가 없어 이번 요청에서는 쓰지 않음" });
      break;
    }
    try {
      await rememberKakaoAccountLinkOffer(env, offer);
    } catch (err) {
      rememberOpsEvent({ kind: "kakao_account_link_offer_failed", severity: "warn", path: "/skill", method: "POST", detail: safeError(err) });
    }
  }
  if (trustedKakaoCaller && hasDatabaseRoom(env, 4)) await noteKakaoAppUserIdProbe(env, payload);
}

// 합치기 방향과 가능 여부. 계정 잇기의 합치기는 performIdentityMerge 의 잠금 안에서 이것을 다시 부른다.
//  - stale: 두 계정 중 하나가 이미 통합됐거나 없다(제안을 지운다).
//  - blocked: 두 계정이 같은 종류의 로그인(카카오·로그인 이름)을 각각 갖고 있다. 합치기 RPC 가 보조 쪽 것을 지우므로 하지 않는다.
//  - auto: 한쪽에 가계부·기록이 없다. 빈 쪽을 보조로 합친다(잃을 것이 없다).
//  - confirm: 둘 다 있다. 확인을 받은 뒤 채팅 계정을 주 계정으로 합친다(방 연결·나가기 이력이 채팅 계정에 붙어 있어 옮길 것이 적다).
async function kakaoAccountLinkPlan(env, { chatUserId = "", loginUserId = "", counts = false } = {}) {
  const chat = String(chatUserId || "").trim();
  const login = String(loginUserId || "").trim();
  if (!chat || !login || chat === login) return { status: "stale", reason: "same_or_missing" };
  env.__AB_REQUEST_USER_ROWS?.delete(chat);
  env.__AB_REQUEST_USER_ROWS?.delete(login);
  const [chatUnmerged, loginUnmerged] = await Promise.all([kakaoClaimUserUnmerged(env, chat), kakaoClaimUserUnmerged(env, login)]);
  if (!chatUnmerged || !loginUnmerged) return { status: "stale", reason: "merged_or_missing" };
  const ids = `${encodeURIComponent(chat)},${encodeURIComponent(login)}`;
  const [members, identities] = await Promise.all([
    supabase(env, `/rest/v1/household_members?user_id=in.(${ids})&select=user_id,household_id,role`, { method: "GET" }),
    supabase(env, `/rest/v1/accountbook_user_identities?user_id=in.(${ids})&select=user_id,provider`, { method: "GET" }),
  ]);
  if (!Array.isArray(members) || !Array.isArray(identities)) throw new Error("account_link_source_invalid");
  const providers = (uid) => new Set(identities.filter((row) => String(row?.user_id || "") === uid).map((row) => String(row?.provider || "")));
  const chatProviders = providers(chat);
  const shared = [...providers(login)].filter((provider) => provider && chatProviders.has(provider));
  const households = (uid) => [...new Set(members.filter((row) => String(row?.user_id || "") === uid).map((row) => String(row?.household_id || "")).filter(Boolean))];
  // 기록은 확인 화면(counts)에서는 세어 보이고, 합치기에서는 가계부가 없는 쪽만 한 건이라도 있는지 본다(가계부가 있으면 이미 빈 쪽이 아니다).
  const records = async (uid) => {
    if (counts) return Math.max(0, Number(await supabaseExactCount(env, `/rest/v1/transactions?user_id=eq.${encodeURIComponent(uid)}&select=id`)) || 0);
    if (households(uid).length) return null;
    const rows = await supabase(env, `/rest/v1/transactions?user_id=eq.${encodeURIComponent(uid)}&select=id&limit=1`, { method: "GET" });
    if (!Array.isArray(rows)) throw new Error("account_link_source_invalid");
    return rows.length;
  };
  const [chatRecords, loginRecords] = await Promise.all([records(chat), records(login)]);
  const summary = {
    chat: { households: households(chat).length, records: chatRecords },
    login: { households: households(login).length, records: loginRecords },
  };
  if (shared.length) return { status: "blocked", reason: "same_provider", ...summary };
  const chatHasData = summary.chat.households > 0 || Number(summary.chat.records || 0) > 0;
  const loginHasData = summary.login.households > 0 || Number(summary.login.records || 0) > 0;
  if (!loginHasData) return { status: "auto", primaryId: chat, secondaryId: login, secondaryHouseholdIds: households(login), ...summary };
  if (!chatHasData) return { status: "auto", primaryId: login, secondaryId: chat, secondaryHouseholdIds: households(chat), ...summary };
  return { status: "confirm", primaryId: chat, secondaryId: login, secondaryHouseholdIds: households(login), ...summary };
}

// 방금 카카오 로그인으로 확인한 카카오 id 가 제안의 그것과 같을 때만 합치기 표(5분, 이 브라우저의 세션 사용자에게 묶임)를 준다.
// mode login: 로그인 콜백. 빈 쪽이 있을 때만 합치고, 둘 다 있으면 확인 화면으로 보낸다. mode confirm: 확인 화면에서 누른 뒤.
async function kakaoAccountLinkProofAfterKakao(env, { userId = "", kakaoId = "", offerUserId = "", mode = "login", next = "/my" } = {}) {
  const uid = String(userId || "").trim();
  const offerKey = String(offerUserId || "").trim();
  if (!kakaoAccountLinkEnabled(env)) return { ok: false, reason: "disabled" };
  if (!uid || !offerKey || !String(kakaoId || "").trim()) return { ok: false, reason: "no_offer" };
  const offers = await readKakaoAccountLinkOffers(env, { fresh: true });
  const offer = offers[offerKey];
  if (!offer || ![offerKey, offer.chat_user_id].includes(uid)) return { ok: false, reason: "no_offer" };
  const hash = await kakaoAccountLinkOfferHash(kakaoId);
  if (offer.kakao_hash !== hash) return { ok: false, reason: "kakao_account_mismatch" };
  if (mode === "confirm") {
    // 확인 화면에서 온 요청은 로그인한 사람이 채팅 계정일 수도 있다. 카카오 id 의 주인이 제안의 웹 계정인지 다시 본다.
    const owner = await lookupKakaoLoginOwner(env, kakaoId);
    const ownerId = String(owner?.user?.id || "");
    if (!ownerId || (ownerId !== offerKey && await resolveEffectiveUserId(env, ownerId) !== offerKey)) return { ok: false, reason: "kakao_account_mismatch" };
  }
  const token = await signedPurposeToken(env, "account-link", { u: uid, b: offerKey, h: hash, m: mode === "confirm" ? "confirm" : "login", n: safeUserReturnPath(next || "/my", "/my") }, 300);
  return { ok: true, cookie: kakaoAccountLinkProofCookie(token) };
}

function kakaoAccountLinkProofCookie(token = "") {
  return token
    ? `${KAKAO_ACCOUNT_LINK_PROOF_COOKIE}=${encodeURIComponent(token)}; Path=/my/account-link; Max-Age=300; HttpOnly; Secure; SameSite=Lax`
    : `${KAKAO_ACCOUNT_LINK_PROOF_COOKIE}=; Path=/my/account-link; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function readKakaoAccountLinkProof(env, request) {
  const raw = getCookie(request, KAKAO_ACCOUNT_LINK_PROOF_COOKIE);
  if (!raw) return null;
  let payload = null;
  try { payload = await readPurposeToken(env, "account-link", raw); } catch (_) { return null; }
  if (!payload || !payload.u || !payload.b || !/^[a-f0-9]{64}$/.test(String(payload.h || "")) || !["login", "confirm"].includes(payload.m)) return null;
  return payload;
}

function kakaoAccountLinkLaterCookie(offer = null, seconds = 7 * 24 * 60 * 60) {
  return offer?.kakao_hash
    ? `${KAKAO_ACCOUNT_LINK_LATER_COOKIE}=${offer.kakao_hash.slice(0, 16)}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`
    : `${KAKAO_ACCOUNT_LINK_LATER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// V22.9.91 독립 검토: 확인 화면이 화면을 그리지 않고 /my 로 돌려보낼 때 준다(10분). 그동안 /my 는 확인 화면으로 다시 보내지 않는다.
// 1분 캐시에 남은 제안, 지우지 못한 제안, 읽기 실패가 두 화면을 오가게 하거나 오류 화면에 가두지 않게 한다.
function kakaoAccountLinkPauseCookie() {
  return `${KAKAO_ACCOUNT_LINK_PAUSE_COOKIE}=1; Path=/; Max-Age=${KAKAO_ACCOUNT_LINK_PAUSE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

// /my(handleMyPage)가 가계부 화면으로 보내기 전에 부른다. 이 사람에게 잇기 제안이 있고 ‘나중에’를 고르지 않았으면 확인 화면으로 보낸다.
// 표는 1분 캐시라 제안이 없는 사람에게는 DB 조회가 늘지 않는다. 읽지 못하면 지금처럼 가계부를 연다.
// 잇기가 꺼져 있거나(웹 카카오 로그인이 없으면 카카오 확인을 할 수 없다) 멈춤 쿠키가 있으면 묻지 않는다.
async function kakaoAccountLinkPrompt(request, env, userId = "") {
  if (!kakaoAccountLinkEnabled(env) || getCookie(request, KAKAO_ACCOUNT_LINK_PAUSE_COOKIE)) return null;
  try {
    const offer = kakaoAccountLinkOfferForUser(await readKakaoAccountLinkOffers(env), userId);
    if (!offer || getCookie(request, KAKAO_ACCOUNT_LINK_LATER_COOKIE) === offer.kakao_hash.slice(0, 16)) return null;
    return redirectResponse("/my/account-link");
  } catch (err) {
    return null;
  }
}

const KAKAO_ACCOUNT_LINK_ERRORS = {
  expired: "확인 시간이 지났어요. 아래 버튼을 다시 눌러 주세요.",
  unavailable: "지금 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  failed: "계정을 잇지 못했어요. 두 계정의 가계부와 기록은 바뀌지 않았어요. 잠시 후 다시 시도해 주세요.",
  result_unknown: "잇기 결과를 아직 확인하지 못했어요. 같은 버튼을 다시 누르지 말고 잠시 뒤 가계부 화면에서 결과를 확인해 주세요.",
  kakao_account_mismatch: "확인한 카카오 계정이 이 가계부의 카카오 계정과 달라요. 카카오톡 방에서 쓰는 카카오 계정으로 확인해 주세요.",
  session: "로그인 상태가 바뀌었어요. 가계부를 다시 연 뒤 시도해 주세요.",
  kakao_unavailable: "카카오 확인을 지금 쓸 수 없어요. 잠시 후 다시 시도해 주세요.",
  kakao_retry: "카카오 확인을 화면 없이 끝내지 못했어요. 아래 버튼을 다시 누르면 카카오 확인 화면이 열려요.",
  cancelled: "카카오 확인을 취소했어요. 계정은 잇지 않았고 가계부와 기록은 그대로예요.",
  busy: "카카오 로그인 요청이 잠시 많아요. 1~2분 뒤 다시 시도해 주세요.",
  in_progress: "다른 창이나 카카오톡 방의 요청이 이 계정을 쓰고 있어 이번에는 바꾼 것이 없어요. 잠시 뒤 가계부 화면에서 결과를 확인하고, 아직 이어지지 않았으면 다시 시도해 주세요.",
};

function renderKakaoAccountLinkHtml(env, { plan, err = "" } = {}) {
  const title = escapeHtml(appName(env));
  const status = plan?.status || "";
  const heading = status === "blocked" ? "두 계정을 자동으로 이을 수 없어요"
    : status === "auto" ? "카카오톡 방 가계부와 웹을 이어 드릴게요" : "카카오톡 방 가계부와 웹 계정을 이을까요?";
  const sub = status === "blocked"
    ? "같은 카카오 계정의 기록 계정이 둘로 나뉘어 있는데, 두 계정에 서로 다른 로그인 방법이 이미 하나씩 있어요. 잘못 합치지 않도록 이 화면에서는 잇지 않아요."
    : status === "auto"
      ? "같은 카카오 계정으로 쓰는 계정이 둘로 나뉘어 있고, 한쪽은 아직 비어 있어요. 카카오로 한 번 확인하면 카카오톡 방 가계부가 바로 열려요."
      : "같은 카카오 계정으로 쓰는 계정이 둘로 나뉘어 있어요. 이으면 카카오톡 방에서 기록한 가계부와 웹 가계부를 한 계정에서 봐요.";
  const rows = plan && plan.chat && plan.login ? `<ol><li><b>방</b><span>카카오톡 방 기록 계정 · 가계부 ${numberWithCommas(plan.chat.households)}개 · 내가 쓴 기록 ${numberWithCommas(plan.chat.records)}건</span></li><li><b>웹</b><span>웹 로그인 계정 · 가계부 ${numberWithCommas(plan.login.households)}개 · 내가 쓴 기록 ${numberWithCommas(plan.login.records)}건</span></li></ol>` : "";
  const guide = status === "blocked"
    ? "가계부와 기록은 그대로 두었어요. 계정을 하나로 합치려면 관리자에게 문의해 주세요."
    : "가계부·기록·초대코드는 지우지 않고 한 계정으로 옮겨요. 이은 뒤에는 카카오톡과 웹 어디서든 같은 가계부가 열려요. 잇기는 되돌릴 수 없어요.";
  const error = KAKAO_ACCOUNT_LINK_ERRORS[err] ? `<p class="linkError" role="alert">${escapeHtml(KAKAO_ACCOUNT_LINK_ERRORS[err])}</p>` : "";
  const actions = status === "blocked"
    ? `<div class="actions"><a class="btn" href="/my/account-link?later=blocked">가계부로 가기</a></div>`
    : `<form method="post" action="/my/account-link" class="actions">${err === "kakao_retry" ? '<input type="hidden" name="interactive" value="1"/>' : ""}<button class="btn" type="submit">카카오로 확인하고 잇기</button><a class="btn soft" href="/my/account-link?later=1">나중에 하기</a></form><p class="sub">카카오톡 안에서는 확인 화면 없이 바로 지나가요. 다른 브라우저에서는 카카오 로그인 화면이 한 번 나올 수 있어요.</p>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${title} · 계정 잇기</title><style>${MY_ACCESS_STATUS_CSS}button.btn{border:0;font:inherit;cursor:pointer}.linkError{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:14px;padding:12px;line-height:1.6}</style></head><body><main class="wrap"><section class="card"><span class="badge">계정 잇기</span><h1>${heading}</h1><p class="sub">${escapeHtml(sub)}</p>${error}${rows}<div class="guide">${escapeHtml(guide)}</div>${actions}</section></main></body></html>`;
}

// 화면을 그리지 않고 가계부로 돌려보낼 때는 멈춤 쿠키를 함께 준다(V22.9.91 독립 검토). 계정을 읽지 못하면 오류 화면 대신 지금처럼
// 가계부를 연다. 예전에는 읽기 실패·지우지 못한 제안이 /my 와 이 화면을 오가게 하거나 503 화면에 가뒀다(‘나중에’도 같은 확인을 거쳤다).
async function handleMyAccountLinkPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const backToBook = () => redirectResponseWithCookies("/my", [kakaoAccountLinkPauseCookie()]);
  if (!kakaoAccountLinkEnabled(env)) return backToBook();
  let offers;
  try {
    offers = await readKakaoAccountLinkOffers(env, { fresh: true });
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_account_link_read_failed", severity: "warn", path: "/my/account-link", method: "GET", detail: safeError(err) });
    return backToBook();
  }
  const offer = kakaoAccountLinkOfferForUser(offers, userId);
  if (!offer) return backToBook();
  // ‘나중에’는 계정 확인보다 먼저 받는다. later=blocked 는 이을 수 없는 두 계정의 화면에서 온다(30일).
  const later = String(url.searchParams.get("later") || "");
  if (later === "1" || later === "blocked") {
    return redirectResponseWithCookies("/my", [kakaoAccountLinkLaterCookie(offer, later === "blocked" ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60)]);
  }
  let plan;
  try {
    plan = await kakaoAccountLinkPlan(env, { chatUserId: offer.chat_user_id, loginUserId: offer.loginUserId, counts: true });
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_account_link_plan_failed", severity: "warn", path: "/my/account-link", method: "GET", detail: safeError(err) });
    return backToBook();
  }
  if (plan.status === "stale") {
    try { await forgetKakaoAccountLinkOffer(env, offer.loginUserId); } catch (_) {}
    return backToBook();
  }
  return htmlResponse(renderKakaoAccountLinkHtml(env, { plan, err: String(url.searchParams.get("err") || "") }));
}

// 확인 화면의 ‘카카오로 확인하고 잇기’(POST, 라우터의 CSRF 출처 확인을 거친다). 카카오 로그인(account-link 모드)으로 보낸다.
// interactive=1 은 인앱 브라우저에서 화면 없는 확인(prompt=none)이 안 됐을 때 확인 화면이 넣는다. 그때는 카카오 화면을 띄운다.
async function handleMyAccountLinkStart(request, env, startKakao) {
  if (!kakaoAccountLinkEnabled(env)) return redirectResponse("/my");
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  let interactive = false;
  try { interactive = String((await request.formData()).get("interactive") || "") === "1"; } catch (_) { interactive = false; }
  let offer = null;
  try {
    offer = kakaoAccountLinkOfferForUser(await readKakaoAccountLinkOffers(env, { fresh: true }), userId);
  } catch (err) {
    return redirectResponse("/my/account-link?err=unavailable");
  }
  if (!offer) return redirectResponse("/my");
  const response = await startKakao(request, env, { userId, offerUserId: offer.loginUserId, interactive });
  return response || redirectResponse("/my/account-link?err=kakao_unavailable");
}

// 카카오 확인 뒤(콜백이 준 합치기 표) 실제로 합친다. 로그인 콜백과 다른 요청이라 DB 호출 한도(50회)를 합치기에 온전히 쓴다.
async function handleMyAccountLinkRun(request, env) {
  const clearProof = kakaoAccountLinkProofCookie("");
  if (!kakaoAccountLinkEnabled(env)) return redirectResponseWithCookies("/my", [clearProof]);
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponseWithCookies("/my", [clearProof]);
  const proof = await readKakaoAccountLinkProof(env, request);
  if (!proof || proof.u !== userId) return redirectResponseWithCookies("/my/account-link?err=expired", [clearProof]);
  const next = safeUserReturnPath(proof.n || "/my", "/my");
  let offers;
  try {
    offers = await readKakaoAccountLinkOffers(env, { fresh: true });
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_account_link_read_failed", severity: "warn", path: "/my/account-link/run", method: "GET", detail: safeError(err) });
    return redirectResponseWithCookies("/my/account-link?err=unavailable", [clearProof]);
  }
  const offer = offers[proof.b];
  if (!offer || offer.kakao_hash !== proof.h || ![proof.b, offer.chat_user_id].includes(userId)) return redirectResponseWithCookies(next, [clearProof]);
  let plan = null;
  let merged = null;
  const cookies = [clearProof, kakaoAccountLinkLaterCookie(null)];
  try {
    merged = await performIdentityMerge(env, {
      userIds: [offer.chat_user_id, proof.b],
      path: "/my/account-link/run",
      revokeSecondarySessions: true,
      choose: async () => {
        plan = await kakaoAccountLinkPlan(env, { chatUserId: offer.chat_user_id, loginUserId: proof.b });
        return plan.status === "auto" || (plan.status === "confirm" && proof.m === "confirm") ? plan : null;
      },
      // V22.9.91 독립 검토: 합친 바로 뒤, 방 연결·표시 별명 정리보다 먼저 이 브라우저의 새 세션을 만들고 제안을 지운다. 방이 많은 사람은
      // 그 정리가 DB 호출 한도(50회)를 다 써서 예전에는 새 세션을 못 만들거나 제안 표 잠금이 90초 남았다. 보조 계정의 옛 세션은 판이 올라 풀렸다.
      afterMerge: async ({ primaryId }) => {
        try {
          const session = await makeUserSession(env, primaryId);
          cookies.push(`ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
        } catch (err) {
          // 합치기는 끝났다. 세션을 새로 못 만들면 로그인 화면이 다시 나오고, 카카오로 로그인하면 이은 계정으로 들어간다.
          rememberOpsEvent({ kind: "kakao_account_link_session_pending", severity: "warn", path: "/my/account-link/run", method: "GET", detail: safeError(err) });
        }
        // 제안 지우기는 잠금·읽기·쓰기·풀기 4회가 남았을 때만 한다(잠금을 잡고 못 풀면 90초 남는다). 못 지우면 다음 확인 화면이 지운다.
        try {
          if (!hasDatabaseRoom(env, 4)) throw new Error("account_link_offer_cleanup_no_budget");
          await forgetKakaoAccountLinkOffer(env, proof.b);
        } catch (err) {
          rememberOpsEvent({ kind: "kakao_account_link_offer_cleanup_pending", severity: "warn", path: "/my/account-link/run", method: "GET", detail: safeError(err) });
        }
      },
    });
  } catch (err) {
    // V22.9.91 독립 검토: 두 계정의 잠금을 다른 요청(다른 창의 잇기, 카카오톡 방의 기록)이 쥐고 있으면 아무것도 바꾸기 전에 멈춘다.
    // 예전에는 ‘잇지 못했어요’로 보여, 다른 창에서 이미 이은 사람이 다시 누르게 했다.
    const busy = !err?.mergeRpcStarted && !err?.departurePreservationStarted && /settings_rmw_busy/.test(safeError(err));
    rememberOpsEvent({ kind: busy ? "kakao_account_link_busy" : "kakao_account_link_failed", severity: busy ? "warn" : "error", path: "/my/account-link/run", method: "GET", detail: safeError(err) });
    const unknown = err?.mergeRpcStarted && !isDefiniteStorageFailure(err) && !/identity_merge_not_confirmed/.test(safeError(err));
    return redirectResponseWithCookies(`/my/account-link?err=${busy ? "in_progress" : unknown ? "result_unknown" : "failed"}`, [clearProof]);
  }
  if (!merged) {
    if (plan?.status === "stale") {
      try { await forgetKakaoAccountLinkOffer(env, proof.b); } catch (_) {}
      return redirectResponseWithCookies(next, [clearProof]);
    }
    // 로그인 콜백에서 왔는데 둘 다 가계부·기록이 있거나(확인 필요), 이을 수 없는 두 계정이다. 확인 화면이 이유를 보인다.
    return redirectResponseWithCookies(plan?.status === "confirm" || plan?.status === "blocked" ? "/my/account-link" : next, [clearProof]);
  }
  rememberOpsEvent({ kind: "kakao_account_link_merged", severity: "info", path: "/my/account-link/run", method: "GET", label: "계정 잇기 완료", detail: `${plan?.status || "-"} · 주 ${String(merged.primaryId).slice(0, 8)} · 보조 ${String(merged.secondaryId).slice(0, 8)}` });
  return redirectResponseWithCookies(addQueryToUrl(proof.m === "login" ? next : "/my", { msg: "account_linked" }), cookies);
}

// 관리자 계정·가계부 점검(/identity-audit) 화면의 진단 칸. appUserId 가 마지막으로 온 때·안 온 때와 남은 잇기 제안 수를 보인다.
async function renderKakaoAccountLinkDiagnostics(env) {
  let probe = Object.create(null);
  let offers = null;
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(`${KAKAO_APP_USER_ID_PROBE_PREFIX}*`)}&select=key,value`, { method: "GET" });
    for (const row of Array.isArray(rows) ? rows : []) {
      const slot = String(row?.key || "").slice(KAKAO_APP_USER_ID_PROBE_PREFIX.length);
      if (!KAKAO_APP_USER_ID_PROBE_SLOTS.includes(slot)) continue;
      try { probe[slot] = String(JSON.parse(String(row.value || "{}")).at || "").slice(0, 19).replace("T", " "); } catch (_) {}
    }
  } catch (err) {
    probe = null;
  }
  try { offers = await readKakaoAccountLinkOffers(env, { fresh: true }); } catch (err) { offers = null; }
  const cell = (slot) => escapeHtml(probe?.[slot] ? `${probe[slot]} (UTC)` : "기록 없음");
  const probeRows = probe ? `<tr><td>단톡방</td><td>${cell("present:group")}</td><td>${cell("absent:group")}</td></tr><tr><td>1:1</td><td>${cell("present:direct")}</td><td>${cell("absent:direct")}</td></tr>` : `<tr><td colspan="3">진단 기록을 읽지 못했습니다.</td></tr>`;
  const offerCount = offers ? Object.keys(offers).length : null;
  const switchState = kakaoAccountLinkEnabled(env)
    ? "켜짐 — 제안이 있는 사람에게 /my 에서 잇기를 묻습니다."
    : "꺼짐 — 제안과 진단만 남기고 잇기는 묻지 않습니다. 운영자 계정으로 appUserId 옴과 제안을 확인한 뒤 KAKAO_ACCOUNT_LINK_ENABLED=1 로 켭니다.";
  return `<section class="card"><h2>카카오 로그인 연결 진단</h2><p>그룹 챗봇에 웹 로그인 앱을 연결하면 카카오가 방 메시지에 appUserId 를 실어 보냅니다. 받은 값은 적지 않고 마지막으로 온 때와 안 온 때만 적습니다(isolate 마다 한 시간에 한 번).</p><div class="tableWrap"><table><thead><tr><th>대화</th><th>appUserId 옴</th><th>appUserId 안 옴</th></tr></thead><tbody>${probeRows}</tbody></table></div><p>계정 잇기: ${escapeHtml(switchState)}</p><p>남은 계정 잇기 제안: ${offerCount === null ? "읽지 못함" : `${numberWithCommas(offerCount)}건`} · 웹에서 이은 뒤 사라집니다.</p></section>`;
}
// @build:exports-start
export {
  afterKakaoSkillIdentityWork, handleMyAccountLinkPage, handleMyAccountLinkRun,
  handleMyAccountLinkStart, isKakaoTalkInAppBrowser, kakaoAccountLinkPrompt,
  kakaoAccountLinkProofAfterKakao, kakaoAutoLoginCookie, kakaoAutoLoginFallbackLocation,
  kakaoInAppAutoLoginResponse, queueKakaoAccountLinkOffer, renderKakaoAccountLinkDiagnostics,
};
// @build:exports-end
