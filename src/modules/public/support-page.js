// @build:imports-start
import { HTML_HEADERS } from "../runtime/config-readiness.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { safeArray } from "../admin/backup-compare.js";
import { verifyUserSession } from "../auth/user-session.js";
import {
  fetchSupporterFlag, fetchSupporterRows, supporterFlagActive, supporterTodayV22995,
} from "../my/supporters.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end
// V22.9.95 후원: 공개 후원 안내 페이지(/support). 결제 연동·금액 입력·영수증은 없다. 비용 표·예정 금액은 싣지 않는다(E-18, 사용자 결정) — 받는 길(카카오페이 송금 링크·계좌이체·토스 송금 링크)과
// 오픈채팅 주소는 운영 변수로만 받고, 값이 없거나 http(s) 주소가 아니면 그 줄을 숨긴다. 이 변수들은 /ready·/health 에 내보내지 않는다.
// 후원자 오픈채팅 주소는 공개 페이지에 싣지 않는다 — 후원을 확인한 분의 전체 메뉴(화면 설정)에만 보인다(누구나 들어오면 후원자 방이 아니다).
const SUPPORT_CONTACT_EMAIL_V22995 = "admin@malhaebook.com";

function supportUrlV22995(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 500 || /[\s<>"'`]/.test(text)) return "";
  try {
    const parsed = new URL(text);
    if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function supportBankLineV22995(value) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= 100 ? text : "";
}

// 운영 변수는 여기 한 곳에서만 읽는다.
function supportConfigV22995(env = {}) {
  return {
    kakaopay: supportUrlV22995(env.SUPPORT_KAKAOPAY_URL),
    bank: supportBankLineV22995(env.SUPPORT_BANK_ACCOUNT),
    toss: supportUrlV22995(env.SUPPORT_TOSS_URL),
    community: supportUrlV22995(env.COMMUNITY_OPENCHAT_URL),
    supporterChat: supportUrlV22995(env.SUPPORTER_OPENCHAT_URL),
  };
}

// 후원하는 방법 절. 우선순위는 카카오페이 → 계좌이체 → 토스. 셋 다 없으면 준비 중 한 줄만 둔다.
function publicSupportWaysSectionV22995(config, email) {
  const ways = [
    config.kakaopay ? "카카오페이 송금: 아래 ‘카카오페이로 송금하기’ 를 누르면 송금 화면이 열려요." : "",
    config.bank ? `계좌이체: ${config.bank}` : "",
    config.toss ? "토스 송금: 아래 ‘토스로 송금하기’ 를 누르면 송금 화면이 열려요." : "",
  ].filter(Boolean);
  if (!ways.length) {
    // V22.9.97 사용자(2026-11-03) "후원은 카톡방 전용 링크로 접속한 사람한테 내가 안내할께": 송금 창구 변수가 없고 소통 오픈채팅(COMMUNITY_OPENCHAT_URL)만 있으면
    // ‘준비 중’ 대신 오픈채팅에서 운영자가 직접 안내한다는 문장과 경유 링크(/support/go/openchat, 누른 수를 센다)를 둔다. 오픈채팅도 없으면 종전처럼 준비 중 한 줄.
    if (config.community) {
      return {
        title: "후원하는 방법",
        paragraphs: [
          "후원 방법은 말해가계부 오픈채팅방에서 운영자가 직접 안내해 드려요. 아래 ‘말해가계부 오픈채팅 들어가기’ 로 들어와 ‘후원하고 싶어요’ 라고 말씀해 주세요.",
          `오픈채팅이 어려우면 ${email} 로 알려 주셔도 돼요.`,
        ],
        note: "말해가계부 후원은 연말정산 공제 대상이 아니고 영수증을 발행하지 않아요.",
        links: [["말해가계부 오픈채팅 들어가기", "/support/go/openchat"]],
      };
    }
    return { title: "후원하는 방법", paragraphs: ["후원 창구를 준비하고 있어요(출시 뒤 안내)."] };
  }
  // V22.9.97 후원 지표: 송금 단추는 변수 주소를 바로 싣지 않고 경유 주소(/support/go/<kind>)로 간다. 누른 수를 센 뒤 같은 주소로 302 한다.
  const links = [config.kakaopay ? ["카카오페이로 송금하기", "/support/go/kakaopay"] : null, config.toss ? ["토스로 송금하기", "/support/go/toss"] : null].filter(Boolean);
  return {
    title: "후원하는 방법",
    paragraphs: [`정해진 금액은 없어요. 편한 방법으로 보내 주신 뒤 보낸 분 이름·보낸 날짜·말해가계부 로그인 이름을 ${email} 로 알려 주시면 확인하고 후원자 표시를 켜 드려요.`],
    bullets: ways,
    note: "말해가계부 후원은 연말정산 공제 대상이 아니고 영수증을 발행하지 않아요. 잘못 보냈다면 같은 이메일로 알려 주세요.",
    ...(links.length ? { links } : {}),
  };
}

function publicSupportPageV22995(env = {}, supporters = []) {
  const config = supportConfigV22995(env);
  const email = SUPPORT_CONTACT_EMAIL_V22995;
  const names = safeArray(supporters).map((name) => String(name || "").trim()).filter(Boolean);
  const sections = [
    {
      title: "왜 후원이 필요한가요",
      paragraphs: [
        "말해가계부가 돌아가는 데는 매달 비용이 들어요. 카카오톡으로 묻고 답하는 서버, 여러분의 소중한 기록을 안전하게 보관하는 외부 저장소, 그리고 주소(도메인)와 장애 감시가 쉬지 않고 돌아가야 하거든요. 기능을 고치고 더하는 유지보수·업데이트에도 꾸준히 시간이 들어요.",
        "보내 주시는 후원은 이렇게 끊이지 않고 드는 운영 비용과 유지보수·업데이트에 큰 도움이 됩니다. 금액은 정해져 있지 않아요.",
      ],
    },
    {
      title: "후원금은 이렇게 써요",
      bullets: ["카카오톡으로 묻고 답하는 서버 비용", "여러분의 기록을 안전하게 보관하는 외부 저장소 비용", "주소(도메인) 갱신과 장애 감시", "운영비를 넘는 몫은 새 기능 개발과 개선"],
    },
    publicSupportWaysSectionV22995(config, email),
    {
      title: "후원자에게 드리는 것",
      bullets: ["웹 가계부에 보이는 ‘후원자’ 배지", "후원자만 고를 수 있는 포인트 색 3가지(코랄·민트·라벤더)", "후원자 오픈채팅방 초대(운영 소식을 먼저 듣고 의견을 나누는 곳)", "이 페이지 후원자 명단에 이름 올리기(원하는 분만, 원하는 이름으로)"],
      note: "보상은 보이는 표시와 이야기 나누는 곳이에요.",
    },
    {
      title: "함께 이야기하는 곳",
      paragraphs: [
        config.community
          ? "누구나 들어올 수 있는 말해가계부 오픈채팅방이 있어요. 쓰는 방법을 묻거나 고쳐 줬으면 하는 점을 나눠 주세요."
          : `누구나 들어올 수 있는 오픈채팅방을 준비하고 있어요. 그동안은 ${email} 로 의견을 보내 주세요.`,
        config.supporterChat
          ? "후원자 오픈채팅방은 후원을 확인한 분께 웹 가계부 ‘전체 메뉴’ 의 화면 설정에서 들어가는 단추로 안내해요."
          : "후원자 오픈채팅방도 준비하고 있어요. 열리면 후원자께 웹 가계부에서 안내해 드려요.",
      ],
      ...(config.community ? { links: [["말해가계부 오픈채팅 들어가기", "/support/go/openchat"]] } : {}),
    },
    ...(names.length ? [{
      title: "고마운 후원자",
      paragraphs: ["명단에 이름을 올려도 된다고 알려 주신 분만 적었어요. 먼저 후원해 주신 순서예요.", names.join(" · ")],
    }] : []),
    {
      title: "문의",
      paragraphs: [`후원 확인, 후원자 표시, 명단 이름 바꾸기와 빼기는 ${email} 로 알려 주세요. 보낸 분 이름·보낸 날짜·로그인 이름을 함께 적어 주시면 빨리 확인할 수 있어요.`],
      links: [[`${email} 로 메일 보내기`, `mailto:${email}`], ["문의 안내", "/contact"]],
    },
  ];
  return {
    title: "말해가계부 후원 안내",
    description: "말해가계부 후원이 서버와 저장소 운영 비용, 유지보수·업데이트에 쓰이는 곳, 후원하는 방법, 후원자에게 드리는 배지·포인트 색·오픈채팅과 문의 방법을 안내합니다.",
    eyebrow: "후원은 선택이에요",
    intro: "후원은 선택이에요. 보내 주시는 후원은 카카오톡으로 묻고 답하는 서버와 기록을 안전하게 보관하는 저장소, 그리고 유지보수·업데이트에 쓰여 서비스를 더 오래 안정적으로 운영하는 데 큰 도움이 됩니다.",
    sections,
    type: "WebPage",
    updated: "2026-11-04",
    primary: ["후원하는 방법 보기", "#section-3"],
    secondary: ["문의 안내", "/contact"],
  };
}

// ── V22.9.97 후원 지표 ──────────────────────────────────────────────────────
// 사용자(2026-11-02) "후원 페이지가 보이지 않아" + 수익화 검토 3절 2번(후원 지표를 관제에): /support 방문 → 송금 링크 누름 두 단계를 하루 한 줄로 센다.
// 설정 표 한 줄 support_stats:<KST 날짜>, 값 { visits, clicks: { kakaopay, toss, openchat, supporter_openchat } }. 새 표·SQL 은 없다.
// 읽고-더하고-올리는(upsert merge-duplicates) 방식이라 같은 순간에 둘이 들어오면 하나가 빠질 수 있다 — 관제에는 ‘대략’ 으로 보인다.
// 사용자 id·IP·UA 는 적지 않는다. 응답은 기다리지 않고(ctx.waitUntil), DB 실패는 로그 한 줄로 끝낸다.
const SUPPORT_STATS_PREFIX_V22997 = "support_stats:";
const SUPPORT_CLICK_KEYS_V22997 = Object.freeze(["kakaopay", "toss", "openchat", "supporter_openchat"]);
// 경유 주소 종류 → [설정 칸(supportConfigV22995), 집계 칸]. 계좌(SUPPORT_BANK_ACCOUNT)는 글자라 경유하지 않는다.
const SUPPORT_GO_KINDS_V22997 = Object.freeze({
  kakaopay: ["kakaopay", "kakaopay"],
  toss: ["toss", "toss"],
  openchat: ["community", "openchat"],
  "supporter-openchat": ["supporterChat", "supporter_openchat"],
});
// 지침의 봇 목록(bot·crawl·spider·slurp·facebookexternalhit·preview·lighthouse)에 국내 수집기 셋을 더했다: 카카오톡 링크 미리보기(kakaotalk-scrap,
// auth/kakao-account-link.js 와 같은 판단)·네이버 검색(Yeti)·다음 검색(Daumoa·Daum/4.1 꼴, 사람이 쓰는 다음 앱 DaumApps 는 세는 쪽). 자동화 브라우저(HeadlessChrome)도 사람이 아니다.
const SUPPORT_BOT_UA_V22997 = /bot|crawl|spider|slurp|scrap|yeti|daumoa|daum[/][0-9]|headless|facebookexternalhit|preview|lighthouse/i;

// 사람이 연 화면 이동만 센다. 봇 UA·UA 없음·미리 받기(prefetch·prerender)·화면 이동이 아닌 요청(Sec-Fetch-Mode 가 navigate 가 아님)은 빼고,
// Sec-Fetch-Mode 머리가 없는 옛 브라우저는 센다(카카오 자동 로그인 판정 auth/kakao-account-link.js 와 같은 기준).
function supportCountableRequestV22997(request) {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return false;
  const mode = String(headers.get("sec-fetch-mode") || "").toLowerCase();
  if (mode && mode !== "navigate") return false;
  if (/prefetch|prerender/i.test(`${headers.get("sec-purpose") || ""} ${headers.get("purpose") || ""}`)) return false;
  const agent = String(headers.get("user-agent") || "");
  return !!agent.trim() && !SUPPORT_BOT_UA_V22997.test(agent);
}

function supportStatCountV22997(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// 저장된 값(jsonb 객체 또는 JSON 글)을 정리한다. 모르는 칸은 버리고 틀린 수는 0 이다.
function normalizeSupportStatsV22997(raw) {
  let value = raw;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch (_) { value = null; } }
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clicks = source.clicks && typeof source.clicks === "object" && !Array.isArray(source.clicks) ? source.clicks : {};
  return { visits: supportStatCountV22997(source.visits), clicks: Object.fromEntries(SUPPORT_CLICK_KEYS_V22997.map((key) => [key, supportStatCountV22997(clicks[key])])) };
}

// 그날 줄을 읽어 한 칸에 1 을 더해 올린다. 읽기에 실패하면 쓰지 않는다(0 부터 다시 세어 덮지 않게).
async function bumpSupportStatsV22997(env, field) {
  const key = `${SUPPORT_STATS_PREFIX_V22997}${supporterTodayV22995()}`;
  const rows = await supabase(env, `/rest/v1/accountbook_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { method: "GET", timeoutMs: 5000 });
  if (!Array.isArray(rows)) throw new Error("support_stats_unreadable");
  const value = normalizeSupportStatsV22997(rows[0]?.value);
  if (field === "visits") value.visits += 1;
  else if (SUPPORT_CLICK_KEYS_V22997.includes(field)) value.clicks[field] += 1;
  else return;
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value }]),
  });
}

// 응답을 막지 않고 센다. 운영자가 확인하려고 연 화면(관리자 세션)은 세지 않는다 — 관리자 쿠키가 없으면 DB 를 읽지 않고 바로 넘어간다.
function recordSupportStatV22997(request, env, ctx, field) {
  const task = (async () => {
    if (await verifyAdminSession(request, env).catch(() => false)) return;
    await bumpSupportStatsV22997(env, field);
  })().catch((error) => {
    console.warn(JSON.stringify({ level: "warn", event: "support_stats_failed", field, error: String(error?.message || error).slice(0, 120) }));
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
  return task;
}

// /support 방문은 화면이 실제로 보일 때 그 화면이 보내는 신호(POST /support/visit)로 센다. GET 응답에서 세지 않는 까닭:
// 모든 화면의 미리 렌더링 규칙(conservative, assets/icons-manifest.js)이 /support 를 누르기 시작할 때 미리 열고(Sec-Purpose: prerender)
// 누르면 그 화면을 그대로 쓰므로 Worker 에 두 번째 요청이 오지 않는다 — GET 에서 세면 크롬 계열의 앱 안 링크 방문이 빠지고, 미리
// 렌더링까지 세면 ‘링크된 주소를 GET 으로 열어도 데이터가 바뀌지 않는다’ 는 약속(validate-speculation-rules-v2297)이 깨진다.
// 미리 렌더링된 화면은 실제로 열릴 때(prerenderingchange) 한 번 보낸다. 5분 캐시로 다시 연 화면도 센다(화면 수, 사람 수가 아니다).
// 스크립트가 꺼진 브라우저·봇은 세지 않는다.
const SUPPORT_VISIT_PATH_V22997 = "/support/visit";
const SUPPORT_VISIT_SCRIPT_V22997 = `<script>(function(){var d=document;function v(){try{navigator.sendBeacon("${SUPPORT_VISIT_PATH_V22997}")}catch(e){}}if(d.prerendering){d.addEventListener("prerenderingchange",v,{once:true})}else{v()}})();</script>`;

// 같은 출처 화면이 보낸 신호만 센다(Sec-Fetch-Site 머리가 없는 옛 브라우저는 센다. 다른 출처 POST 는 라우터의 csrfOriginAllowed 가 먼저 막는다).
// 봇 UA·UA 없음·미리 받기는 뺀다.
function supportBeaconCountableV22997(request) {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return false;
  const site = String(headers.get("sec-fetch-site") || "").toLowerCase();
  if (site && site !== "same-origin") return false;
  if (/prefetch|prerender/i.test(`${headers.get("sec-purpose") || ""} ${headers.get("purpose") || ""}`)) return false;
  const agent = String(headers.get("user-agent") || "");
  return !!agent.trim() && !SUPPORT_BOT_UA_V22997.test(agent);
}

// POST /support/visit: 늘 204(몸 없음·캐시 없음)이라 무엇을 셌는지 알리지 않는다. POST 밖은 다루지 않는다(라우터의 다음 경로).
function supportVisitResponseV22997(request, env, url, ctx) {
  if (String(url?.pathname || "") !== SUPPORT_VISIT_PATH_V22997 || String(request?.method || "").toUpperCase() !== "POST") return null;
  if (supportBeaconCountableV22997(request)) recordSupportStatV22997(request, env, ctx, "visits");
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}

// /support 화면(200)에 방문 신호 스크립트를 붙인다(content-pages.js handlePublicContentPage).
function withSupportVisitScriptV22997(html) {
  const text = String(html || "");
  return text.includes("</body>") ? text.replace("</body>", () => `${SUPPORT_VISIT_SCRIPT_V22997}</body>`) : text;
}

// 후원자 오픈채팅은 지금 켜진 후원자 세션에만 보낸다. V22.9.95 약속(후원자 방 주소는 공개 페이지에 싣지 않는다)을 경유 주소에서도 지킨다 —
// 이 주소를 아는 누구나 방에 들어오면 후원자 방이 아니다. 아니면 다른 ‘없음’ 과 같은 404 다(방이 있는지도 알리지 않는다).
async function supportViewerIsSupporterV22997(request, env) {
  try {
    const userId = await verifyUserSession(request, env);
    return !!userId && supporterFlagActive(await fetchSupporterFlag(env, userId));
  } catch (_) {
    return false;
  }
}

const SUPPORT_GO_MISSING_HTML_V22997 = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>후원 링크를 찾을 수 없어요</title></head><body><main style="max-width:620px;margin:70px auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif;color:#172033"><h1>후원 링크를 찾을 수 없어요.</h1><p style="color:#475569;line-height:1.65">이 후원 창구는 아직 준비 중이거나 지금은 열 수 없어요. 후원 안내에서 다른 방법을 확인해 주세요.</p><p><a href="/support" style="display:inline-flex;align-items:center;min-height:44px;color:#1d4ed8">후원 안내로 돌아가기</a></p></main></body></html>`;

function supportGoMissingResponseV22997(method = "GET") {
  return new Response(method === "HEAD" ? null : SUPPORT_GO_MISSING_HTML_V22997, { status: 404, headers: { ...HTML_HEADERS, "x-robots-tag": "noindex, nofollow" } });
}

// /support/go/<kind>: 변수가 있으면 그 주소로 302(캐시 없음·리퍼러 없음)하고 누른 수를 센다(GET 이고 사람 요청일 때만). 변수가 없거나
// http(s) 주소가 아니거나(supportUrlV22995 가 빈 값으로 만든다) 모르는 종류면 404 안내다. GET·HEAD 밖은 다루지 않는다(라우터의 다음 경로).
async function supportGoResponseV22997(request, env, url, ctx) {
  const match = /^\/support\/go\/([^/]*)\/?$/.exec(String(url?.pathname || ""));
  if (!match) return null;
  const method = String(request?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  const kind = Object.prototype.hasOwnProperty.call(SUPPORT_GO_KINDS_V22997, match[1]) ? match[1] : "";
  let target = kind ? supportConfigV22995(env)[SUPPORT_GO_KINDS_V22997[kind][0]] : "";
  if (target && kind === "supporter-openchat" && !(await supportViewerIsSupporterV22997(request, env))) target = "";
  if (!target) return supportGoMissingResponseV22997(method);
  if (method === "GET" && supportCountableRequestV22997(request)) recordSupportStatV22997(request, env, ctx, SUPPORT_GO_KINDS_V22997[kind][1]);
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } });
}

// /internal/ops-usage 의 support 칸(관제 1.6.0 ‘후원’ 줄): 오늘(KST)까지 30일의 방문·누른 수 합계와 지금 켜진 후원자 수. 읽기 두 번(그날 줄 최근
// 31줄·후원자 줄 최대 200줄)이고, 하나라도 읽지 못하면 null 이다(이 칸을 빼고 보낸다 — 관제는 ‘-’). 후원자 id 는 세기만 하고 내보내지 않는다.
async function supportUsageSummaryV22997(env) {
  const today = supporterTodayV22995();
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams();
  params.set("key", `like.${SUPPORT_STATS_PREFIX_V22997}*`);
  params.set("select", "key,value");
  params.set("order", "key.desc");
  params.set("limit", "31");
  const [rows, supporters] = await Promise.all([
    supabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET", timeoutMs: 5000 }).catch(() => null),
    fetchSupporterRows(env, 200),
  ]);
  if (!Array.isArray(rows) || !Array.isArray(supporters)) return null;
  let visits = 0;
  const clicks = Object.fromEntries(SUPPORT_CLICK_KEYS_V22997.map((name) => [name, 0]));
  for (const row of rows) {
    const key = String(row?.key || "");
    const day = key.startsWith(SUPPORT_STATS_PREFIX_V22997) ? key.slice(SUPPORT_STATS_PREFIX_V22997.length) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > today) continue;
    const value = normalizeSupportStatsV22997(row.value);
    visits += value.visits;
    for (const name of SUPPORT_CLICK_KEYS_V22997) clicks[name] += value.clicks[name];
  }
  return {
    days: 30, visits, clicks,
    clicks_total: SUPPORT_CLICK_KEYS_V22997.reduce((sum, name) => sum + clicks[name], 0),
    supporters_active: supporters.filter((row) => supporterFlagActive(row.flag, today)).length,
    as_of: today,
  };
}
// @build:exports-start
export {
  publicSupportPageV22995, supportConfigV22995, supportGoResponseV22997, supportUsageSummaryV22997,
  supportVisitResponseV22997, withSupportVisitScriptV22997,
};
// @build:exports-end
