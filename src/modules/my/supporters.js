// @build:imports-start
import { safeArray } from "../admin/backup-compare.js";
import { optionalSupabase } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
// V22.9.95 후원자 표시: 후원자는 설정 표의 한 줄 `supporter:<user_id>` 로만 켠다(새 표·SQL 없음). 운영자가 송금을 확인한 뒤
// 관리자 화면(/admin/supporters)에서 넣는다. 값은 { since, until|null, note, public_name|null } 이고 until 이 지났으면 꺼진 것으로 본다.
// 후원자라도 기능은 같다 — 배지와 포인트 색처럼 보이는 표시만 다르다. 읽지 못하면 조용히 ‘후원자 아님’ 이다(화면을 막지 않는다).
// 조회는 이미 설정 표를 읽는 길에 얹는다: 홈은 fetchMobileHomeSettings 의 extraKeys, 전체 메뉴는 마우스 표시 설정과 한 번에,
// 참여자 화면은 구성원 id 들을 모아 한 번(fetchSupporterFlags). 공개 /support 명단은 GET 때 한 번(fetchPublicSupporterNames).
const SUPPORTER_KEY_PREFIX_V22995 = "supporter:";
const SUPPORTER_ACCENTS_V22995 = Object.freeze([["coral", "코랄"], ["mint", "민트"], ["lavender", "라벤더"]]);
// 포인트 색 점(선택 단추 안)의 색. 아래 CSS 의 --ab12-brand 와 같다.
const SUPPORTER_ACCENT_DOTS_V22995 = Object.freeze({ coral: "#e8593c", mint: "#14a38b", lavender: "#7c6fd6" });

function supporterSettingsKey(userId = "") {
  const id = String(userId || "").trim();
  return id ? `${SUPPORTER_KEY_PREFIX_V22995}${id}` : "";
}

function supporterDateV22995(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : "";
}

function supporterTextV22995(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// 저장된 값(JSON 글 또는 jsonb 객체)을 정리한다. 시작일이 없거나 날짜 모양이 틀리면 null(후원자 아님)이다.
function normalizeSupporterFlag(value) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const since = supporterDateV22995(raw.since);
  if (!since) return null;
  const until = raw.until == null || raw.until === "" ? null : supporterDateV22995(raw.until);
  if (until === "" || (until && until < since)) return null;
  return { since, until, note: supporterTextV22995(raw.note, 200), public_name: supporterTextV22995(raw.public_name, 30) || null };
}

function supporterTodayV22995() {
  return formatDate(nowKstDate());
}

// 오늘(KST)이 시작일과 끝나는 날 사이면 켜져 있다. 끝나는 날 당일까지 켜져 있고 다음 날 꺼진다.
function supporterFlagActive(flag, today = supporterTodayV22995()) {
  return !!flag && flag.since <= today && (!flag.until || flag.until >= today);
}

function activeSupporterFlag(value, today = supporterTodayV22995()) {
  const flag = normalizeSupporterFlag(value);
  return supporterFlagActive(flag, today) ? flag : null;
}

// PostgREST in.(…) 목록 안의 값은 큰따옴표로 감싼다(쉼표·괄호가 섞여도 목록이 깨지지 않게). 따옴표와 역슬래시는 키에 없으므로 뺀다.
function supporterInValueV22995(value = "") {
  return `"${String(value).replace(/["\\]/g, "")}"`;
}

// 설정 여러 줄을 key=in.(…) 한 번으로 읽는다. 읽지 못하면 빈 Map 이다(각 화면이 기본값으로 그린다 — getSettingValue 와 같은 뜻).
async function fetchSettingValuesByKeysV22995(env, keys = []) {
  const list = [...new Set(safeArray(keys).map((key) => String(key || "")).filter(Boolean))];
  const out = new Map();
  if (!list.length) return out;
  const params = new URLSearchParams();
  params.set("key", `in.(${list.map(supporterInValueV22995).join(",")})`);
  params.set("select", "key,value");
  params.set("limit", String(list.length));
  const rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET" }, []);
  for (const row of safeArray(rows)) out.set(String(row?.key || ""), row?.value);
  return out;
}

// 한 사용자: key=eq. 한 번. 관리자 고치기가 지금 값을 읽을 때 쓴다(꺼진 값도 그대로 돌려준다).
async function fetchSupporterFlag(env, userId = "") {
  const key = supporterSettingsKey(userId);
  if (!key) return null;
  const rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { method: "GET" }, []);
  return normalizeSupporterFlag(safeArray(rows)[0]?.value);
}

// 여러 사용자(최대 50명): key=in.(…) 한 번. 지금 켜진 사람만 Map(user_id → flag)에 담는다. 실패하면 빈 Map.
async function fetchSupporterFlags(env, userIds = []) {
  const ids = [...new Set(safeArray(userIds).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 50);
  const out = new Map();
  if (!ids.length) return out;
  const values = await fetchSettingValuesByKeysV22995(env, ids.map(supporterSettingsKey));
  const today = supporterTodayV22995();
  for (const id of ids) {
    const flag = activeSupporterFlag(values.get(supporterSettingsKey(id)), today);
    if (flag) out.set(id, flag);
  }
  return out;
}

// 모든 후원자 줄(관리자 목록·공개 명단). 읽지 못하면 null 이다(관리자 화면은 ‘불러오지 못함’, 공개 명단은 절을 뺀다).
async function fetchSupporterRows(env, limit = 200) {
  const params = new URLSearchParams();
  params.set("key", `like.${SUPPORTER_KEY_PREFIX_V22995}*`);
  params.set("select", "key,value");
  params.set("order", "key.asc");
  params.set("limit", String(Math.max(1, Math.min(500, Number(limit) || 200))));
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET" });
    if (!Array.isArray(rows)) return null;
    return rows
      .map((row) => ({ user_id: String(row?.key || "").startsWith(SUPPORTER_KEY_PREFIX_V22995) ? String(row.key).slice(SUPPORTER_KEY_PREFIX_V22995.length) : "", raw: row?.value, flag: normalizeSupporterFlag(row?.value) }))
      .filter((row) => row.user_id);
  } catch (_) {
    return null;
  }
}

// 공개 /support 의 후원자 명단: 지금 켜져 있고 명단 이름(public_name)을 준 분만, 먼저 후원한 순서. 많아야 100명.
async function fetchPublicSupporterNames(env) {
  const rows = await fetchSupporterRows(env, 200);
  if (!rows) return [];
  const today = supporterTodayV22995();
  return rows.filter((row) => supporterFlagActive(row.flag, today) && row.flag.public_name)
    .sort((a, b) => a.flag.since.localeCompare(b.flag.since) || a.flag.public_name.localeCompare(b.flag.public_name, "ko"))
    .slice(0, 100).map((row) => row.flag.public_name);
}

// 배지: 글자 + 하트 아이콘. 대비 7.3:1(밝은 화면)·11:1(다크). 읽는 프로그램에는 ‘후원자’ 한 번만 읽힌다.
function supporterBadgeHtml() {
  return '<span class="abSupporterBadge" role="img" aria-label="후원자" title="후원해 주셔서 고마워요"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false"><path d="M12 20.6s-7.3-4.5-9.3-8.9C1.3 8.5 3.3 4.8 7 4.8c2 0 3.5 1.1 5 2.9 1.5-1.8 3-2.9 5-2.9 3.7 0 5.7 3.7 4.3 6.9-2 4.4-9.3 8.9-9.3 8.9z"/></svg>후원자</span>';
}

// 배지 CSS(배지가 하나라도 있는 화면). 화면마다 이름 칸 CSS 가 span 을 덮어서(예: 참여자 카드 .memberHead span) 몇 칸은 !important 로 지킨다.
const SUPPORTER_BADGE_CSS_V22995 = '.abSupporterBadge{display:inline-flex!important;align-items:center;gap:3px;margin:0 0 0 6px!important;padding:1px 8px;border:1px solid #fecdd3;border-radius:999px;background:#fff1f2;color:#9f1239!important;font-size:12px!important;font-weight:800;line-height:1.6;vertical-align:middle;white-space:nowrap}.abSupporterBadge svg{width:12px;height:12px;fill:currentColor;flex:none}html[data-ab-resolved-theme="dark"] .abSupporterBadge{background:#4c0519;border-color:#881337;color:#fecdd3!important}';

// 포인트 색: 셸 CSS 의 컬러톤(html[data-ab-tone=…] body.abV22812Shell)과 같은 변수 넷을 덮는다. 서버가 data-supporter="1" 을 그린 화면에서만
// 맞는다 — 후원이 끝나면 저장값(ab:appearance:accent)이 남아도 적용되지 않는다. 선택자가 컬러톤보다 구체적이라(0,3,0 > 0,2,2, 다크 0,4,0 > 0,3,2)
// 포인트 색을 고르면 컬러톤보다 먼저 보인다. 대비: 단추 흰 글자 5.4:1 이상, 본문 강조 글자 4.7:1 이상(밝은), 8:1 이상(다크).
const SUPPORTER_ACCENT_CSS_V22995 = [
  ["coral", "#e8593c", "#b93a22", "#ffe8e1", "#f28b6d", "#ffb4a0", "#4a2018"],
  ["mint", "#14a38b", "#0f766e", "#d5f7ee", "#2dc2a4", "#7eead2", "#123d37"],
  ["lavender", "#7c6fd6", "#5a4bc2", "#ece9fd", "#9d92ec", "#cfc8ff", "#2b2650"],
].map(([name, brand, accent, soft, darkBrand, darkAccent, darkSoft]) => `[data-supporter="1"][data-ab-accent=${name}] .abV22812Shell{--ab12-brand:${brand};--ab12-accent:${accent};--ab12-action:${accent};--ab12-accent-soft:${soft}}[data-supporter="1"][data-ab-accent=${name}][data-ab-resolved-theme=dark] .abV22812Shell{--ab12-brand:${darkBrand};--ab12-accent:${darkAccent};--ab12-action:${accent};--ab12-accent-soft:${darkSoft}}`).join("");

// 저장·적용 스크립트(머리 안, 그리기 전에 속성을 붙인다). 기존 화면 설정 스크립트(1년 캐시 자산)는 건드리지 않는다.
// 컬러톤 단추를 누르면 포인트 색을 끈다(고른 컬러톤이 바로 보이게). data-supporter 가 없는 화면에서는 아무것도 하지 않는다.
const SUPPORTER_ACCENT_JS_V22995 = '(function(){var D=document,d=D.documentElement,K="ab:appearance:accent",A=["coral","mint","lavender"],C="[data-ab-accent-choice]";function g(){try{var v=localStorage.getItem(K);return A.indexOf(v)>=0?v:""}catch(e){return""}}function s(v,m){if(d.getAttribute("data-supporter")!=="1")return;v?d.setAttribute("data-ab-accent",v):d.removeAttribute("data-ab-accent");var b=D.querySelectorAll(C),i,o,n="기본",t=D.getElementById("abAccentStatus");for(i=0;i<b.length;i++){o=b[i].getAttribute("data-ab-accent-choice")===v;b[i].setAttribute("aria-pressed",o);if(o&&v)n=b[i].textContent}if(t)t.textContent=(m?"저장했어요. ":"")+"포인트 색: "+n}s(g());D.addEventListener("click",function(e){var x=e.target.closest&&e.target.closest(C+",[data-ab-tone-choice]");if(!x)return;var v=x.getAttribute("data-ab-accent-choice")||"";v=A.indexOf(v)>=0?v:"";if(!v&&!g())return;try{v?localStorage.setItem(K,v):localStorage.removeItem(K)}catch(_){}s(v,1)});D.addEventListener("DOMContentLoaded",function(){s(g())})})();';

// <html> 에 붙이는 표식. 지금 보는 사람이 후원자일 때만.
function supporterHtmlAttr(viewerIsSupporter = false) {
  return viewerIsSupporter ? ' data-supporter="1"' : "";
}

// 머리(<head>) 안 조각. 보는 사람이 후원자면 배지 CSS + 포인트 색 CSS + 스크립트, 다른 사람 배지만 있으면 배지 CSS 만, 둘 다 없으면 빈 글(바이트 그대로).
function supporterHeadHtml({ viewer = false, badges = false } = {}) {
  if (!viewer && !badges) return "";
  return `<style id="abSupporterStyle">${SUPPORTER_BADGE_CSS_V22995}${viewer ? SUPPORTER_ACCENT_CSS_V22995 : ""}</style>${viewer ? `<script id="abSupporterAccent">${SUPPORTER_ACCENT_JS_V22995}</script>` : ""}`;
}

// 전체 메뉴 머리말의 후원자 줄(보는 사람이 후원자일 때만).
function supporterThanksHtml() {
  return `<p class="abSupporterThanks">${supporterBadgeHtml()} 후원해 주셔서 고마워요. 포인트 색은 아래 화면 설정에서 고를 수 있어요.</p>`;
}

// 전체 메뉴 ‘화면 설정’ 패널의 후원자 줄(후원자에게만 그린다). 기본(지금 컬러톤) + 포인트 색 셋. 후원자 오픈채팅 주소가 있으면 들어가는 단추도 둔다.
function supporterAccentChoicesHtml({ supporterChatUrl = "" } = {}) {
  const choices = SUPPORTER_ACCENTS_V22995.map(([value, label]) => `<button type="button" data-ab-accent-choice="${value}" aria-pressed="false"><i class="abToneDot" style="background:${SUPPORTER_ACCENT_DOTS_V22995[value]}" aria-hidden="true"></i>${escapeHtml(label)}</button>`).join("");
  const chat = supporterChatUrl ? `<p><a class="abSupporterChat" href="${escapeHtml(supporterChatUrl)}" target="_blank" rel="noopener noreferrer">후원자 오픈채팅 들어가기</a></p>` : "";
  return `<div class="abAccentRow" data-ab-supporter-accent style="grid-column:1/-1"><b>포인트 색 ${supporterBadgeHtml()}</b><div class="abAppearanceChoices" role="group" aria-label="포인트 색"><button type="button" data-ab-accent-choice="" aria-pressed="true">기본</button>${choices}</div><p id="abAccentStatus" class="abAppearanceStatus" aria-live="polite">포인트 색: 기본</p><p class="abAppearanceStatus">후원자만 고를 수 있는 색이에요. 이 브라우저에 저장되고, 고르면 컬러톤보다 먼저 보여요.</p>${chat}</div>`;
}
// @build:exports-start
export {
  activeSupporterFlag, fetchPublicSupporterNames, fetchSettingValuesByKeysV22995,
  fetchSupporterFlag, fetchSupporterFlags, fetchSupporterRows, normalizeSupporterFlag,
  supporterAccentChoicesHtml, supporterBadgeHtml, supporterDateV22995, supporterFlagActive,
  supporterHeadHtml, supporterHtmlAttr, supporterInValueV22995, supporterSettingsKey,
  supporterTextV22995, supporterThanksHtml, supporterTodayV22995,
};
// @build:exports-end
