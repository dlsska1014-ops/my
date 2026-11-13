// @build:imports-start
import { verifyUserSession } from "../auth/user-session.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end
// V22.9.121 회원 번호(MB-XXXX-XXXX): 후원 확인이나 문의 때 사용자가 운영자에게 알려 주는 번호. 사용자 id(uuid)는 사용자 화면에 싣지 않는다.
// 사용자 결정(2026-11-04): "누구든 내 계정 보안 탭에서 나의 고유 아이디 혹은 로그인 아이디를 확인할 수 있고, 그걸 나한테 알려주면 내 관리자
// 화면에는 리스트가 있어서 적용" → 2026-11-13 범위 결정(내 계정·보안 카드 + 관리자 회원 번호 찾기·전체 사용자 목록 + /support·방침 문구).
// 왜: 후원자 표시는 설정 표 한 줄 supporter:<user_id> 인데, /support 는 ‘로그인 이름’ 을 알려 달라고 했고 대부분은 카카오 로그인만 써서 로그인
// 이름이 없다. 운영자가 송금한 분이 어느 계정인지 알 길이 없었다.
// 만드는 법: 사용자 세션에 서명하는 기존 비밀값(USER_SESSION_SECRET, 새 변수 없음)으로 "malhaebook:member-code:v1:<user_id>" 를 HMAC-SHA256 하고
// 앞 40비트를 크록퍼드 base32(0-9, I·L·O·U 를 뺀 A-Z) 8글자로 보인다. 같은 사용자는 늘 같은 번호다. 비밀값 없이는 번호를 만들 수도, 번호에서
// 사용자 id 를 거꾸로 알 수도 없다. 로그인에는 쓰이지 않는다(번호를 알아도 열리는 것이 없다). 비밀값을 바꾸면 모든 번호가 바뀐다.
// 비밀값이 없으면 "" 이다(내 계정·보안 카드는 숨고, 관리자 화면은 계산할 수 없다고 알린다). 어떤 경우에도 던지지 않는다.
// 번호 → 사용자: 설정 표 기억 줄 member_code:<번호> → { user_id, at } 를 읽고 그 사용자의 번호를 다시 계산해 같을 때만 믿는다(오래되거나 꾸민
// 줄을 거른다). 없거나 틀리면 최근 가입한 users id 를 많아야 500개 읽어 하나씩 계산한다(키는 한 번만 만들고 50개씩 서명, 처음 맞는 사람에서 멈춘다).
// 기억 줄은 사용자가 내 계정·보안 화면을 실제로 볼 때 그 화면이 보내는 신호(POST /my/member-code/seen, 아래)로 없을 때만 넣는다(on_conflict=key,
// ignore-duplicates — 있는 줄은 그대로, 한 번 호출, 답 뒤 ctx.waitUntil). 화면 GET 에서는 쓰지 않는다(미리 렌더링 규칙과 ‘GET 무변경’ 약속).
// 관리자가 번호를 넣어 저장할 때 훑어서 찾으면 그때도 넣는다(기억 줄이 틀렸던 경우에만 덮어쓴다). 같은 isolate 에서 같은 번호를 다시 넣지 않는다.
// 40비트라 사용자 1만 명이면 같은 번호가 하나라도 생길 확률이 약 0.005%다(생일 문제 N²/2⁴¹). 그때는 먼저 기억된 사람이 찾힌다 — 관리자 화면은
// 번호와 함께 표시 이름·가입일을 보여 준다.
const MEMBER_CODE_PREFIX_V229121 = "MB";
const MEMBER_CODE_MESSAGE_PREFIX_V229121 = "malhaebook:member-code:v1:";
// 크록퍼드 base32: 헷갈리는 I·L·O 와 U 를 뺀 32글자.
const MEMBER_CODE_ALPHABET_V229121 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MEMBER_CODE_SETTINGS_PREFIX_V229121 = "member_code:";
const MEMBER_CODE_SCAN_LIMIT_V229121 = 500;
const MEMBER_CODE_SCAN_CHUNK_V229121 = 50;
// 같은 isolate 에서 이미 기억 줄을 넣은 번호(번호 → user_id). 많아야 1,000개, 넘으면 비운다.
const AB_MEMBER_CODE_REMEMBERED_V229121 = globalThis.__AB_MEMBER_CODE_REMEMBERED_V229121 || (globalThis.__AB_MEMBER_CODE_REMEMBERED_V229121 = new Map());

function memberCodeSecretV229121(env = {}) {
  return String(env?.USER_SESSION_SECRET || "").trim();
}

// 번호를 계산할 수 있는지(비밀값이 있는지). 관리자 화면이 ‘계산할 수 없음’ 을 알릴 때 쓴다.
function memberCodeAvailableV229121(env = {}) {
  return !!memberCodeSecretV229121(env);
}

async function memberCodeKeyV229121(env = {}) {
  const secret = memberCodeSecretV229121(env);
  if (!secret) return null;
  try {
    return await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } catch (_) {
    return null;
  }
}

// HMAC 앞 5바이트(40비트)를 5비트씩 8글자로 바꿔 MB-XXXX-XXXX 꼴로 묶는다.
function memberCodeFromBytesV229121(bytes) {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < 5; index += 1) {
    buffer = (buffer << 8) | (bytes[index] & 255);
    bits += 8;
    while (bits >= 5) {
      out += MEMBER_CODE_ALPHABET_V229121[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  return `${MEMBER_CODE_PREFIX_V229121}-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

async function memberCodeWithKeyV229121(key, userId = "") {
  const id = String(userId ?? "").trim();
  if (!key || !id) return "";
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${MEMBER_CODE_MESSAGE_PREFIX_V229121}${id}`));
  return memberCodeFromBytesV229121(new Uint8Array(signature));
}

// 한 사용자의 회원 번호. 비밀값이 없거나 계산하지 못하면 "".
async function memberCodeForUserV229121(env, userId = "") {
  try {
    const key = await memberCodeKeyV229121(env);
    return key ? await memberCodeWithKeyV229121(key, userId) : "";
  } catch (_) {
    return "";
  }
}

// 여러 사용자(관리자 목록 한 쪽): 키는 한 번만 만든다. Map(user_id → 번호), 계산하지 못하면 빈 Map.
async function memberCodesForUsersV229121(env, userIds = []) {
  const out = new Map();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) return out;
  try {
    const key = await memberCodeKeyV229121(env);
    if (!key) return out;
    const codes = await Promise.all(ids.map((id) => memberCodeWithKeyV229121(key, id)));
    ids.forEach((id, index) => { if (codes[index]) out.set(id, codes[index]); });
  } catch (_) {
    return new Map();
  }
  return out;
}

// 사람이 적은 번호를 MB-XXXX-XXXX 로 맞춘다. 소문자·띄어쓰기·빠진 줄표·빠진 MB 머리를 받고, 크록퍼드 바꿔 읽기(O→0, I·L→1)를 한다.
// 머리(MB)는 구분 기호를 뺀 길이가 10일 때만 뗀다 — 본문 8글자가 MB 로 시작해도 헷갈리지 않는다. 그 밖의 꼴은 "".
function normalizeMemberCodeV229121(text = "") {
  let value = String(text ?? "").normalize("NFKC").toUpperCase().replace(/[\s\-_.\u2010-\u2015\u2212]/g, "");
  if (value.length === 10 && value.startsWith(MEMBER_CODE_PREFIX_V229121)) value = value.slice(MEMBER_CODE_PREFIX_V229121.length);
  if (value.length !== 8) return "";
  value = value.replace(/O/g, "0").replace(/[IL]/g, "1");
  for (const ch of value) if (!MEMBER_CODE_ALPHABET_V229121.includes(ch)) return "";
  return `${MEMBER_CODE_PREFIX_V229121}-${value.slice(0, 4)}-${value.slice(4)}`;
}

// 기억 줄 키 member_code:<MB-XXXX-XXXX>. 번호 꼴이 아니면 "".
function memberCodeSettingsKeyV229121(code = "") {
  const canonical = normalizeMemberCodeV229121(code);
  return canonical ? `${MEMBER_CODE_SETTINGS_PREFIX_V229121}${canonical}` : "";
}

// 기억 줄 값(JSON 글 또는 jsonb 객체)의 user_id. 모양이 틀리면 "".
function memberCodeCachedUserIdV229121(value) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch (_) { return ""; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const id = String(raw.user_id ?? "").trim();
  return id && id.length <= 64 ? id : "";
}

// 기억 줄 넣기(호출 한 번). 기본은 없을 때만 넣는다(ignore-duplicates). replace=true 는 기억 줄이 틀렸다고 확인한 뒤에만(merge-duplicates).
// 실패해도 던지지 않는다(false). 화면은 답 뒤에 부른다(scheduleMemberCodeRememberV229121).
async function rememberMemberCodeV229121(env, code = "", userId = "", { replace = false } = {}) {
  const canonical = normalizeMemberCodeV229121(code);
  const id = String(userId ?? "").trim();
  if (!canonical || !id) return false;
  if (!replace && AB_MEMBER_CODE_REMEMBERED_V229121.get(canonical) === id) return true;
  try {
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: `${replace ? "resolution=merge-duplicates" : "resolution=ignore-duplicates"},return=minimal` },
      body: JSON.stringify({ key: memberCodeSettingsKeyV229121(canonical), value: JSON.stringify({ user_id: id, at: new Date().toISOString() }) }),
    });
  } catch (_) {
    return false;
  }
  if (AB_MEMBER_CODE_REMEMBERED_V229121.size >= 1000) AB_MEMBER_CODE_REMEMBERED_V229121.clear();
  AB_MEMBER_CODE_REMEMBERED_V229121.set(canonical, id);
  return true;
}

// 답 뒤에 기억 줄을 넣는다. ctx 가 있으면 ctx.waitUntil 에 맡기고 null, 없으면 그 일(Promise)을 돌려준다(부르는 쪽이 기다린다).
function scheduleMemberCodeRememberV229121(env, ctx, code = "", userId = "", options = {}) {
  const task = rememberMemberCodeV229121(env, code, userId, options);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
    return null;
  }
  return task;
}

// 번호 → 사용자. 돌려주는 값: { userId, via: "cache"|"scan"|"", cacheStale, available }. DB 호출은 기억 줄 읽기 1 + (없거나 틀리면) 훑기 1,
// 그리고 remember 일 때 훑어서 찾으면 기억 줄 넣기 1(ctx 가 있으면 답 뒤). 관리자 화면 GET 은 remember:false 로 부른다(화면 한 번 호출 상한).
async function lookupMemberCodeV229121(env, code = "", { remember = true, ctx = null } = {}) {
  const canonical = normalizeMemberCodeV229121(code);
  const result = { userId: "", via: "", cacheStale: false, available: memberCodeAvailableV229121(env) };
  if (!canonical || !result.available) return result;
  const key = await memberCodeKeyV229121(env);
  if (!key) return { ...result, available: false };
  let cached = "";
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(memberCodeSettingsKeyV229121(canonical))}&select=value&limit=1`, { method: "GET" });
    cached = memberCodeCachedUserIdV229121(Array.isArray(rows) ? rows[0]?.value : null);
  } catch (_) {
    cached = "";
  }
  if (cached) {
    if (await memberCodeWithKeyV229121(key, cached) === canonical) return { ...result, userId: cached, via: "cache" };
    result.cacheStale = true;
  }
  let users;
  try {
    users = await supabase(env, `/rest/v1/users?select=id&order=created_at.desc,id.desc&limit=${MEMBER_CODE_SCAN_LIMIT_V229121}`, { method: "GET" });
  } catch (_) {
    return result;
  }
  if (!Array.isArray(users)) return result;
  const ids = users.map((row) => String(row?.id ?? "").trim());
  for (let start = 0; start < ids.length && !result.userId; start += MEMBER_CODE_SCAN_CHUNK_V229121) {
    const chunk = ids.slice(start, start + MEMBER_CODE_SCAN_CHUNK_V229121);
    const codes = await Promise.all(chunk.map((id) => (id ? memberCodeWithKeyV229121(key, id) : "")));
    const hit = codes.indexOf(canonical);
    if (hit >= 0) result.userId = chunk[hit];
  }
  if (result.userId) {
    result.via = "scan";
    if (remember) {
      const task = scheduleMemberCodeRememberV229121(env, ctx, canonical, result.userId, { replace: result.cacheStale });
      if (task) await task;
    }
  }
  return result;
}

// 관리자 찾기가 쓰는 짧은 길: 번호 → user_id 또는 "".
async function findUserIdByMemberCodeV229121(env, code = "", options = {}) {
  return (await lookupMemberCodeV229121(env, code, { remember: options.remember !== false, ctx: options.ctx || null })).userId;
}
// V22.9.121: 기억 줄은 화면 GET 에서 쓰지 않는다. 모든 화면의 미리 렌더링 규칙(conservative)이 ‘내 계정·보안’ 을 누르기 시작할 때 미리 열고
// 누르면 그 화면을 그대로 쓴다 — GET 에서 쓰면 ‘링크된 주소를 GET 으로 열어도 데이터가 바뀌지 않는다’ 는 약속(validate-speculation-rules-v2297)이
// 깨지고, 미리 렌더링을 빼면 크롬 계열의 앱 안 방문이 빠진다. 그래서 /support 방문 신호(V22.9.97)처럼 화면이 실제로 보일 때(미리 렌더링된 화면은
// prerenderingchange 때) 그 화면이 POST 신호를 한 번 보낸다. 스크립트가 꺼진 브라우저에서는 기억 줄이 없고, 관리자 찾기는 최근 500명 훑기로 찾는다.
const MEMBER_CODE_SEEN_PATH_V229121 = "/my/member-code/seen";
const MEMBER_CODE_SEEN_SCRIPT_V229121 = `<script id="memberCodeSeenRuntime">(function(){var d=document;function v(){try{navigator.sendBeacon("${MEMBER_CODE_SEEN_PATH_V229121}")}catch(e){}}if(d.prerendering){d.addEventListener("prerenderingchange",v,{once:true})}else{v()}})();</script>`;

// 같은 출처 화면이 보낸 신호만 받는다(Sec-Fetch-Site 머리가 없는 옛 브라우저는 받는다. 다른 출처 POST 는 라우터의 csrfOriginAllowed 가 먼저 막는다).
// 미리 받기·미리 렌더링 요청은 뺀다.
function memberCodeSeenRequestOkV229121(request) {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return false;
  const site = String(headers.get("sec-fetch-site") || "").toLowerCase();
  if (site && site !== "same-origin") return false;
  return !/prefetch|prerender/i.test(`${headers.get("sec-purpose") || ""} ${headers.get("purpose") || ""}`);
}

// POST /my/member-code/seen: 늘 204(몸 없음·캐시 없음)라 무엇을 했는지 알리지 않는다. 세션이 맞을 때만(합쳐진 계정은 verifyUserSession 이 "")
// 그 사용자의 기억 줄을 없을 때만 넣는다 — 세션 확인 1 + 넣기 0~1(같은 isolate 에서 넣은 번호는 건너뜀), 넣기는 답 뒤. 다른 사람의 번호는 넣을 수
// 없다(번호와 사용자를 모두 세션에서 정한다). POST 밖은 다루지 않는다(라우터의 다음 경로).
async function memberCodeSeenResponseV229121(request, env, url, ctx = null) {
  if (String(url?.pathname || "") !== MEMBER_CODE_SEEN_PATH_V229121 || String(request?.method || "").toUpperCase() !== "POST") return null;
  try {
    if (memberCodeSeenRequestOkV229121(request)) {
      const userId = await verifyUserSession(request, env);
      const code = userId ? await memberCodeForUserV229121(env, userId) : "";
      if (code) {
        const task = scheduleMemberCodeRememberV229121(env, ctx, code, userId);
        if (task) await task;
      }
    }
  } catch (_) {
    // 신호는 늘 204 다.
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}
// @build:exports-start
export {
  MEMBER_CODE_SEEN_SCRIPT_V229121, findUserIdByMemberCodeV229121, lookupMemberCodeV229121,
  memberCodeAvailableV229121, memberCodeForUserV229121, memberCodeSeenResponseV229121,
  memberCodesForUsersV229121, normalizeMemberCodeV229121,
};
// @build:exports-end
