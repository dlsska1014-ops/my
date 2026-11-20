// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { HTML_HEADERS } from "../runtime/config-readiness.js";
import { APP_VERSION, envFlagEnabled } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { getCookie } from "../runtime/http.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { isKakaoTalkInAppBrowser } from "../auth/kakao-account-link.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.132 여는 중 화면(사용자 2026-11-20 "모바일에서 웹 가계부 들어갈떼 오래걸려서 멈춘것 같아 로딩화면처럼 만들어서 퍼센트 올라가는것 처럼 개선해서
// 멈춘게 아니라는 인식이 필요해 그냥 빙글빙글 도는 에니메이션도 뭔가 버그라서 멈춘걸로 인식할 수도 있잖아").
//
// 무엇이 느렸나: 가계부로 들어오는 요청(/my·/app·/m)은 서버가 세션·가계부·기록을 읽고(저장소 왕복 여러 번) 화면을 다 만든 뒤에야 첫 글자를 보낸다.
// /my 는 /app 으로 한 번 더 넘기고, 카카오톡 안의 브라우저에서 세션이 없으면 화면 없는 카카오 로그인(카카오 서버 왕복)까지 거친다. 그동안 휴대폰에는
// 빈 화면만 보인다.
//
// 어떻게 바꿨나: 그런 요청 가운데 사람이 바로 연 첫 요청에는 저장소를 읽지 않고 바로 ‘여는 중’ 화면(이 파일의 HTML 한 장 — 바깥 파일을 하나도 부르지
// 않는다)을 보낸다. 그 화면이 같은 주소를 곧바로 다시 열고(둘째 요청), 서버는 둘째 요청을 예전 그대로 처리한다. 브라우저는 다음 화면의 첫 글자가 올
// 때까지 지금 화면을 그대로 두므로, 넘김이 몇 번이든(우리 303, 카카오 로그인 왕복) 그동안 ‘여는 중’ 화면이 보인다.
//
// 퍼센트는 서버가 알려 주는 진행률이 아니다. 지난 시간으로 그리는 어림값이다(처음에는 빨리, 갈수록 천천히 오르고 99 에서 멈춘다 — 100 은 그리지 않는다.
// 끝은 실제 화면이 도착하는 때다). 10초쯤 지나면 ‘평소보다 오래 걸리고 있어요’ 와 [다시 열기] 가 나타난다.
//
// 움직임은 모두 transform·opacity 의 CSS 애니메이션이고 처음부터 돌고 있다(늦게 나타나는 글도 delay 가 아니라 한 애니메이션 안에서 값을 붙들어 둔다).
// 아이폰의 브라우저(WebKit)는 다음 화면을 기다리는 동안 지금 화면을 다시 그리지 않는다고 알려져 있다 — 그렇다면 스크립트로 글자를 바꾸거나 steps() 로
// 끊어 그리는 움직임은 그 순간 멈춘 것처럼 보이고, 이미 넘겨 둔 transform·opacity 애니메이션만 그동안에도 돈다. 그래서 숫자도 글자를 바꾸지 않고
// 0~99 가 적힌 띠를 위로 굴린다. 같은 까닭으로 둘째 요청은 화면을 한 번 그린 뒤에 보낸다(두 프레임 + 조금). 이 저장소의 검사와 개발 PC 의 Chrome 으로는
// 그 동작을 볼 수 없다 — 배포 뒤 기기에서 확인한다(멈춰 보이면 아래 운영 변수로 끈다).
// 화면의 색은 기본 파란색이다(어두운 테마는 그 테마의 파란색). 강조 색을 바꿔 쓰는 사용자에게도 같다 — 잠깐 보이는 화면이라 그대로 뒀다.
//
// 지키는 것:
//  · 예전과 달라지는 것은 ‘여는 중’ 화면이 먼저 보인다는 것뿐이어야 한다. 둘째 요청은 우리 화면이 시킨 이동이라 브라우저가 Sec-Fetch-Site 를 none 이
//    아니라 same-origin 으로 보낸다. 이 값에 따라 갈리는 처리가 셋 있다 — 카카오가 식별 값(botUserKey·botGroupKey)을 붙인 주소의 방 열기, 세션 없는
//    카카오톡 밖 브라우저의 방 표식 길(/my?room=…), 그 길이 보내는 카카오 로그인 시작(auth/kakao-room-open.js·auth/kakao-oauth.js: 다른 계정 세션을
//    누른 사람으로 바꾸기, 방 전용 세션 끝내기, 화면 없는 로그인은 ‘사람이 바로 연 이동’ 일 때만). 그래서 그 요청들에는 ‘여는 중’ 화면을 주지 않는다:
//    카카오 값이 붙은 주소는 예전 그대로 바로 처리하고(값이 붙은 주소가 화면으로 남지도 않는다 — 브라우저 방문 기록에 그 주소가 적히지 않게),
//    방 표식은 카카오톡 안의 브라우저(그 길이 none 을 보지 않는다)에서만 준다. 값을 처리한 서버가 넘긴 다음 주소(/app?household_id=… — 브라우저는
//    바로 연 이동의 넘김을 none 그대로 보낸다)부터 ‘여는 중’ 화면이 보인다. 단톡방 단추의 첫 요청(누른 사람 확인)은 그래서 예전처럼 빈 화면이다.
//  · 쿠키를 쓰지 않는다(개인정보처리방침은 쿠키를 이름으로 모두 적고 스크립트가 읽지 못한다고 적는다 — 이 화면 때문에 그 글이 틀려지지 않게).
//    서명·표·머리 바꾸기도 없다. 둘째 요청은 브라우저가 보낸 그대로 처리기에 간다(표식 _o=<숫자> 가 붙었으면 그것만 뗀다).
//  · 되풀이는 없다. ‘여는 중’ 화면은 Sec-Fetch-Site: none 인 요청에만 준다(둘째 요청은 same-origin). 그 값을 none 으로 보내는 브라우저가 있더라도,
//    화면의 스크립트가 같은 탭에서 15초 안에 이 화면을 또 받았는지 세어(탭 기억) 둘째에는 표식을 붙여 보내고 — 새로 고침으로 받은 둘째만 한 번 더
//    그대로 열어 보고 셋째에는 붙인다 — 서버는 표식이 붙은 요청에 어떤 경우에도 이 화면을 주지 않는다. 탭 기억을 쓸 수 없으면 처음부터 붙인다.
//    스크립트를 끈 브라우저는 표식을 붙인 주소로 바로 넘어간다. 표식의 숫자는 붙인 까닭이다(아래 ENTRY_PROGRESS_MARK_CAUSES_V229132).
//  · Sec-Fetch 머리를 보내지 않는 브라우저(오래된 아이폰 등)·미리 읽기·수집기·POST 는 예전 그대로다. 세션 쿠키가 없는 보통 브라우저의 /my(로그인 화면 —
//    빨리 열린다)와 로그인 화면을 바로 여는 주소(auto=0·login)에도 주지 않는다.
//  · 이 파일의 어떤 오류도 요청을 막지 않는다(화면을 주지 않고 예전 그대로 처리한다).
//  · 끄기: 운영 변수 ENTRY_PROGRESS_DISABLED=1(없으면 켜짐). 끄면 ‘여는 중’ 화면을 주지 않는다 — 표식은 계속 뗀다.
//  · 결과는 설정 표 entry_progress_probe_v229132:<결과>_<기기> 에 시각·판·횟수만 남긴다(식별자·주소 없음, isolate 마다 줄별 10분에 한 번).
//    기기 = ios·android·other(브라우저 이름표로 나눈다 — 한 기기에서만 안 되는 것을 다른 기기의 수가 가리지 않게).
//    shell = 화면을 줌. resumed = 그 화면을 받을 만한 요청이 same-origin 으로, 사람이 누른 표시(Sec-Fetch-User) 없이 옴 — 화면이 이어 보낸 둘째 요청의
//    어림이다(누른 표시를 보내지 않는 브라우저에서는 사이트 안의 이동도 함께 세어진다). marked_<까닭> = 표식이 붙어 옴.
//    shell 은 있는데 resumed·marked 가 없으면 둘째 요청이 오지 않는 것이다 — 그때는 끈다. marked_repeat 이 shell 만큼 많으면 그 브라우저는 둘째 요청을
//    none 으로 보내는 것이다(화면이 두 번 보인다).
const ENTRY_PROGRESS_PATHS_V229132 = new Set(["/my", "/app", "/m"]);
// 카카오가 단추 주소에 붙이는 값(auth/kakao-room-open.js KAKAO_ROOM_OPEN_PARAMS 와 같다). 하나라도 있으면 ‘여는 중’ 화면을 주지 않는다.
const ENTRY_PROGRESS_KAKAO_VALUE_PARAMS_V229132 = ["botUserKey", "appUserId", "botGroupKey"];
// 되풀이 막기 표식 _o=<숫자> 의 숫자 = 붙인 까닭. 1 스크립트를 끈 브라우저(noscript 넘김)·스크립트가 돌지 못한 화면의 [다시 열기] · 2 탭 기억을 쓸 수 없음 ·
// 3 같은 탭에서 15초 안에 이 화면을 또 받음 · 4 다시 여는 호출이 실패함 · 6 [다시 열기] 를 누름.
const ENTRY_PROGRESS_MARK_CAUSES_V229132 = { 1: "noscript", 2: "storage", 3: "repeat", 4: "error", 6: "retry" };
const ENTRY_PROGRESS_PROBE_PREFIX_V229132 = "entry_progress_probe_v229132:";
const ENTRY_PROGRESS_PROBE_MS_V229132 = 10 * 60 * 1000;
const AB_ENTRY_PROGRESS_PROBE = globalThis.__AB_ENTRY_PROGRESS_PROBE || (globalThis.__AB_ENTRY_PROGRESS_PROBE = new Map());

function entryProgressHeaderV229132(request, name = "") {
  return String(request?.headers?.get?.(name) || "").trim().toLowerCase();
}

// 사람이 화면을 여는 이동인지. Sec-Fetch 머리 둘(mode·dest)을 보내는 브라우저의 맨 위 화면 이동만이다 — 머리가 없는 요청, fetch, 미리 읽기는 아니다.
function entryProgressNavigationV229132(request) {
  if (String(request?.method || "GET").toUpperCase() !== "GET") return false;
  if (entryProgressHeaderV229132(request, "sec-fetch-mode") !== "navigate" || entryProgressHeaderV229132(request, "sec-fetch-dest") !== "document") return false;
  return !/prefetch|prerender/i.test(`${request.headers.get("sec-purpose") || ""} ${request.headers.get("purpose") || ""}`);
}

// 되풀이 막기 표식. 늘 주소 값의 맨 끝에 붙는다(?_o=<숫자> 또는 &_o=<숫자>, 숫자는 1~9 한 글자) — 그 모양만 뗀다. 화면의 스크립트도 같은 모양으로 붙인다.
function entryProgressUnmarkV229132(search = "") {
  const text = String(search || "");
  const match = /^(.*)([?&])_o=([1-9])$/.exec(text);
  if (!match || (match[2] === "?" && match[1] !== "") || (match[2] === "&" && !match[1].startsWith("?"))) return { search: text, cause: "" };
  return { search: match[1], cause: ENTRY_PROGRESS_MARK_CAUSES_V229132[match[3]] || "other" };
}

function entryProgressMarkedPathV229132(raw = "", digit = 1) {
  const text = String(raw || "");
  return `${text}${text.includes("?") ? "&" : "?"}_o=${digit}`;
}

// 결과 기록의 기기 이름. 브라우저 이름표만 본다(아이패드가 맥으로 적는 것은 other 로 간다).
function entryProgressPlatformV229132(request) {
  const agent = String(request?.headers?.get?.("user-agent") || "");
  return /iPhone|iPad|iPod/.test(agent) ? "ios" : /Android/.test(agent) ? "android" : "other";
}

function entryProgressProbeV229132(env, ctx, slot = "") {
  try {
    const name = String(slot || "unknown").replace(/[^a-z_]/g, "").slice(0, 40) || "unknown";
    const held = AB_ENTRY_PROGRESS_PROBE.get(name) || { at: 0, count: 0 };
    held.count += 1;
    AB_ENTRY_PROGRESS_PROBE.set(name, held);
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;
    const now = Date.now();
    if (now - held.at < ENTRY_PROGRESS_PROBE_MS_V229132) return;
    const before = held.at, count = held.count;
    held.at = now;
    held.count = 0;
    rememberOpsEvent({ kind: "entry_progress", severity: "info", path: "/my", method: "GET", detail: `${name}: ${count}` });
    const job = saveSettingValue(env, `${ENTRY_PROGRESS_PROBE_PREFIX_V229132}${name}`, JSON.stringify({ version: 1, at: new Date(now).toISOString(), app_version: APP_VERSION, count }))
      .catch((err) => {
        held.at = before;
        held.count += count;
        rememberOpsEvent({ kind: "entry_progress_probe_failed", severity: "warn", path: "/my", method: "GET", detail: safeError(err) });
      });
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(job);
  } catch (_) {}
}

// ‘여는 중’ 화면을 받을 만한 요청인지(누가 연 이동인지는 빼고 본다 — 그것은 부르는 쪽이 본다). 저장소를 읽지 않는다.
//  · /my·/app·/m 의 화면 이동이다. 카카오 값(botUserKey·appUserId·botGroupKey)이 주소에 없다. 로그인 화면을 바로 여는 주소(auto=0·login)가 아니다.
//  · 카카오톡 안의 브라우저이거나, 세션 쿠키(ab_user)가 있고 방 표식(room)이 없다.
function entryProgressCandidateV229132(request, url) {
  if (!url || !ENTRY_PROGRESS_PATHS_V229132.has(url.pathname) || !entryProgressNavigationV229132(request)) return false;
  const query = url.searchParams;
  if (ENTRY_PROGRESS_KAKAO_VALUE_PARAMS_V229132.some((name) => query.has(name)) || query.get("auto") === "0" || query.has("login")) return false;
  return isKakaoTalkInAppBrowser(request) || (!!getCookie(request, "ab_user") && !query.has("room"));
}

// fetch 가 맨 먼저 부른다(가계부 기억·라우터보다 앞). 돌려주는 것은 처리기가 볼 요청이다: 표식(_o=<숫자>)이 붙은 /my·/app·/m 의 GET 은 표식을 뗀 주소의
// 요청으로 바꾸고, 그 밖의 요청은 받은 그대로다(머리는 건드리지 않는다). 본 것은 요청별 env(__AB_ENTRY_PROGRESS)에 적어 둔다 — 아래 화면 판정이 읽는다.
function entryProgressGateV229132(request, env, ctx) {
  try {
    if (String(request?.method || "GET").toUpperCase() !== "GET") return request;
    const url = new URL(request.url);
    if (!ENTRY_PROGRESS_PATHS_V229132.has(url.pathname)) return request;
    const unmarked = entryProgressUnmarkV229132(url.search);
    const state = { raw: `${url.pathname}${unmarked.search}`, marked: !!unmarked.cause, shell: null };
    env.__AB_ENTRY_PROGRESS = state;
    if (!state.marked) {
      // 화면이 이어 보낸 둘째 요청의 어림: 화면을 받을 만한 요청이 same-origin 으로, 사람이 누른 표시 없이 왔다.
      if (entryProgressHeaderV229132(request, "sec-fetch-site") === "same-origin" && !request.headers.get("sec-fetch-user") && entryProgressCandidateV229132(request, url)) entryProgressProbeV229132(env, ctx, `resumed_${entryProgressPlatformV229132(request)}`);
      return request;
    }
    if (entryProgressNavigationV229132(request)) entryProgressProbeV229132(env, ctx, `marked_${unmarked.cause}_${entryProgressPlatformV229132(request)}`);
    return new Request(`${url.origin}${state.raw}`, { method: "GET", headers: request.headers });
  } catch (_) {
    return request;
  }
}

// 라우터가 같은 출처 검사 바로 다음(방 열기보다 먼저)에 부른다. ‘여는 중’ 화면을 줄 요청이면 그 응답, 아니면 null(예전 그대로). 저장소는 읽지 않는다.
// 주는 요청: 사람이 바로 연(Sec-Fetch-Site: none) 요청 가운데 화면을 받을 만한 것(위 entryProgressCandidateV229132)이고 표식이 붙지 않은 것.
function entryProgressShellResponseV229132(request, env, url, ctx) {
  try {
    const state = env?.__AB_ENTRY_PROGRESS;
    if (!state || state.marked || envFlagEnabled(env?.ENTRY_PROGRESS_DISABLED, false)) return null;
    if (entryProgressHeaderV229132(request, "sec-fetch-site") !== "none" || !entryProgressCandidateV229132(request, url)) return null;
    const response = new Response(renderEntryProgressHtmlV229132(state.raw), { status: 200, headers: { ...HTML_HEADERS } });
    state.shell = response;
    entryProgressProbeV229132(env, ctx, `shell_${entryProgressPlatformV229132(request)}`);
    return response;
  } catch (_) {
    return null;
  }
}

// fetch 가 라우터의 응답을 받은 바로 뒤에 묻는다. ‘여는 중’ 화면은 띠·색·쿠키 마무리와 관제 표본을 거치지 않고 그대로 나간다(둘째 요청의 응답이 그것들을
// 받는다 — 저장소를 읽지 않는 이 화면의 빠른 답이 화면 응답 시간 표본에 섞이지 않게).
function entryProgressIsShellV229132(env, response) {
  return !!response && env?.__AB_ENTRY_PROGRESS?.shell === response;
}

// 시간(초) → 퍼센트 어림값. 처음에는 빨리(1초 32, 2초 51, 4초 69), 갈수록 천천히(9초 84, 20초 95) 오르고 99 를 넘지 않는다.
function entryProgressPercentAtV229132(seconds = 0) {
  const t = Math.max(0, Number(seconds) || 0);
  return 60 * (1 - Math.exp(-t / 1.6)) + 39 * (1 - Math.exp(-t / 9));
}

// 숫자 k(0~99)가 보이기 시작하는 시각(초). 1~98 은 어림값이 k 에 닿는 때(늘 오르는 값이라 반씩 좁혀 찾는다), 99 는 98 의 12초 뒤다(끝).
function entryProgressTimelineV229132() {
  const times = [0];
  for (let percent = 1; percent <= 98; percent += 1) {
    let low = times[percent - 1], high = 120;
    for (let round = 0; round < 40; round += 1) {
      const mid = (low + high) / 2;
      if (entryProgressPercentAtV229132(mid) < percent) low = mid; else high = mid;
    }
    times.push(high);
  }
  times.push(times[98] + 12);
  return times;
}

// 숫자 띠(translateY)와 막대(scaleX)의 keyframes. 값 사이는 linear 로 잇는다(steps 를 쓰지 않는다 — 위 설명).
//  · 숫자: 다음 숫자까지 0.22초보다 길면 그 숫자에 머물다가 0.22초 동안 굴러 넘어가고, 짧으면(처음 5초쯤) 머물지 않고 이어서 구른다.
//    이어서 구르는 구간은 넷에 하나만 적는다(사이는 곧게 이어도 눈에 같다).
//  · 막대: 같은 시각의 값(k/100)을 곧게 잇는다.
function entryProgressKeyframesV229132() {
  const times = entryProgressTimelineV229132();
  const total = times[99];
  const ROLL = 0.22, LINE = 1.2;
  const at = (seconds) => `${Number(((Math.min(total, Math.max(0, seconds)) / total) * 100).toFixed(3))}%`;
  const digit = ["0%{transform:translateY(0)}"];
  const bar = ["0%{transform:scaleX(0)}"];
  let lastDigitKey = "0%", lastBarKey = "0%";
  const pushDigit = (seconds, value) => {
    const key = at(seconds);
    if (key === lastDigitKey) return;
    lastDigitKey = key;
    digit.push(`${key}{transform:translateY(-${Number((value * LINE).toFixed(1))}em)}`);
  };
  const pushBar = (seconds, value) => {
    const key = at(seconds);
    if (key === lastBarKey) return;
    lastBarKey = key;
    bar.push(`${key}{transform:scaleX(${String(value / 100).replace(/^0\./, ".")})}`);
  };
  for (let value = 1; value <= 99; value += 1) {
    const gap = times[value] - times[value - 1];
    const nextGap = value < 99 ? times[value + 1] - times[value] : Infinity;
    if (gap > ROLL) {
      pushDigit(times[value] - ROLL, value - 1);
      pushDigit(times[value], value);
      if (value % 2 === 0 || value === 99) pushBar(times[value], value);
    } else if (value % 4 === 0 || nextGap > ROLL) {
      pushDigit(times[value], value);
      pushBar(times[value], value);
    }
  }
  return { seconds: Number(total.toFixed(2)), digit: digit.join(""), bar: bar.join("") };
}

let ENTRY_PROGRESS_STYLE_V229132 = "";
function entryProgressStyleV229132() {
  if (ENTRY_PROGRESS_STYLE_V229132) return ENTRY_PROGRESS_STYLE_V229132;
  const frames = entryProgressKeyframesV229132();
  const run = `${frames.seconds}s linear both`;
  // 늦은 안내는 10초쯤에 나타난다(전체 길이의 그만큼 — delay 를 쓰지 않고 처음부터 도는 애니메이션이 0 을 붙들고 있다).
  const lateFrom = Number(((9.6 / frames.seconds) * 100).toFixed(2)), lateTo = Number(((10.4 / frames.seconds) * 100).toFixed(2));
  ENTRY_PROGRESS_STYLE_V229132 = [
    "html,body{height:100%}",
    "body{margin:0;display:flex;align-items:center;justify-content:center;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Noto Sans KR\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%}",
    ".abOpening{box-sizing:border-box;width:100%;max-width:340px;padding:32px 28px;text-align:center}",
    ".abOpeningBrand{margin:0 0 22px;font-size:14px;line-height:1.4;font-weight:800;color:var(--ab12-action,#2457d6)}",
    ".abOpeningTitle{margin:0 0 18px;font-size:20px;line-height:1.4;font-weight:800;letter-spacing:-.01em}",
    ".abOpeningNum{display:flex;justify-content:center;align-items:baseline;height:1.2em;margin:0 0 14px;overflow:hidden;font-size:44px;line-height:1.2;font-weight:800;font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\";color:var(--ab12-action,#2457d6)}",
    ".abOpeningRoll{height:1.2em;min-width:1.3em;overflow:hidden;text-align:right}",
    `.abOpeningStrip{will-change:transform;animation:abOpeningNum ${run}}`,
    ".abOpeningTen{white-space:pre;will-change:transform}",
    ".abOpeningUnit{margin-left:3px;font-size:.5em;color:#64748b}",
    ".abOpeningBar{position:relative;height:8px;margin:0 0 18px;overflow:hidden;border-radius:999px;background:#dfe5ee}",
    `.abOpeningFill{position:absolute;top:0;right:0;bottom:0;left:0;background:var(--ab12-action,#2457d6);transform:scaleX(0);transform-origin:0 50%;will-change:transform;animation:abOpeningBar ${run}}`,
    ".abOpeningSheen{position:absolute;top:0;bottom:0;left:0;width:36%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.6),rgba(255,255,255,0));will-change:transform;animation:abOpeningSheen 1.5s linear infinite}",
    ".abOpeningText{margin:0;font-size:14px;line-height:1.6;color:#475569}",
    `.abOpeningLate{margin:14px 0 0;font-size:13px;line-height:1.6;color:#475569;opacity:0;animation:abOpeningLate ${run}}`,
    ".abOpeningLate:focus-within{opacity:1!important}",
    ".abOpeningLate a{color:var(--ab12-action,#2457d6);font-weight:800;text-underline-offset:2px}",
    // 가계부 화면을 어두운 테마로 쓰는 브라우저(스크립트가 저장된 테마를 읽어 html 에 표시한다) — 다음 화면과 바탕이 이어지게.
    // 파란색은 그 테마의 글자용 색(--ab12-brand 의 값)을 그대로 적는다. --ab12-action 은 흰 글자를 얹는 바탕용 토큰이라 여기서 새로 정하지 않는다
    // (어두운 바탕 위의 글자·막대에는 그 값이 어둡다).
    ".abOpeningDark body{background:#141519;color:#edeff3}",
    ".abOpeningDark .abOpeningBrand,.abOpeningDark .abOpeningNum,.abOpeningDark .abOpeningLate a{color:#4e96fa}",
    ".abOpeningDark .abOpeningFill{background:#4e96fa}",
    ".abOpeningDark .abOpeningUnit,.abOpeningDark .abOpeningText,.abOpeningDark .abOpeningLate{color:#b3bdc9}",
    ".abOpeningDark .abOpeningBar{background:#3b475a}",
    ".abOpeningDark .abOpeningSheen{background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.35),rgba(255,255,255,0))}",
    `@keyframes abOpeningNum{${frames.digit}}`,
    `@keyframes abOpeningBar{${frames.bar}}`,
    "@keyframes abOpeningSheen{0%{transform:translateX(-110%)}100%{transform:translateX(290%)}}",
    `@keyframes abOpeningLate{0%,${lateFrom}%{opacity:0}${lateTo}%,100%{opacity:1}}`,
    "@media (prefers-reduced-motion:reduce){.abOpeningSheen{display:none;animation:none}}",
  ].join("");
  return ENTRY_PROGRESS_STYLE_V229132;
}

// 화면의 스크립트(고정 글 — 요청의 값을 싣지 않는다). 하는 일:
//  ⓪ 가계부 화면을 어두운 테마로 쓰는 브라우저면(저장된 테마 ab:appearance:theme = dark) 이 화면도 어둡게 한다.
//  ① 화면을 한 번 그린 뒤(두 프레임 + 90ms, 프레임이 안 오는 브라우저는 0.7초 뒤) 같은 주소를 다시 연다. 보통은 주소 그대로(location.replace — 뒤로
//     가기에 이 화면이 남지 않는다), 주소에 # 이 있으면 새로 고침으로(같은 주소로 가라고 하면 브라우저가 새로 요청하지 않는다 — 새로 고침은 # 을 지킨다).
//     같은 탭에서 15초 안에 이 화면을 또 받았으면(탭 기억에 때와 횟수를 적는다) 표식 _o=3 을 붙인 주소로 연다 — 새로 고침으로 받은 둘째만 한 번 더
//     그대로 열고 셋째에는 붙인다. 탭 기억을 쓸 수 없으면 _o=2, 여는 호출이 실패하면 _o=4 를 붙인다.
//  ② [다시 열기] 의 주소를 지금 주소 + _o=6 으로 바꾸고, 보이기 전(10초쯤)에는 눌리지 않게 해 둔다. 스크립트가 돌지 못한 브라우저에서는 처음부터 눌린다.
//  ③ 뒤로 가기 보관함에서 이 화면이 되살아나면 다시 연다.
const ENTRY_PROGRESS_SCRIPT_V229132 = "(function(){var w=window,d=document,l=location,q=l.search,p=l.pathname+q,t=d.getElementById(\"abOpeningLate\"),a=t&&t.getElementsByTagName(\"a\")[0],f=0,c=0,r=0;"
  + "function m(x){return p+(q?\"&\":\"?\")+\"_o=\"+x+l.hash}"
  + "try{if(w.localStorage.getItem(\"ab:appearance:theme\")===\"dark\"){d.documentElement.className=\"abOpeningDark\";var h=d.querySelector(\"meta[name=theme-color]\");if(h)h.setAttribute(\"content\",\"#141519\")}}catch(e){}"
  + "try{var y=w.performance.getEntriesByType(\"navigation\")[0];r=y?y.type===\"reload\":w.performance.navigation.type===1}catch(e){}"
  + "try{var k=\"abOpeningAt\",s=w.sessionStorage,v=String(s.getItem(k)||\"\").split(\",\"),o=Date.now(),n=o-(+v[0]||0)<15000?(+v[1]||1)+1:1;s.setItem(k,o+\",\"+n);if(n>=3||(n===2&&!r))c=3}catch(e){c=2}"
  + "function go(){if(f)return;f=1;try{if(c)l.replace(m(c));else if(l.hash)l.reload();else l.replace(p)}catch(e){l.href=m(4)}}"
  + "try{if(a)a.setAttribute(\"href\",m(6));if(t){t.style.pointerEvents=\"none\";w.setTimeout(function(){t.style.pointerEvents=\"\";t.removeAttribute(\"aria-hidden\");if(a)a.removeAttribute(\"tabindex\")},10400)}}catch(e){}"
  + "try{var g=w.requestAnimationFrame;if(g)g(function(){g(function(){w.setTimeout(go,90)})})}catch(e){}"
  + "w.setTimeout(go,700);"
  + "try{w.addEventListener(\"pageshow\",function(e){if(e&&e.persisted){f=0;go()}})}catch(e){}"
  + "})();";

// 숫자 띠의 글: 0~99 를 열 줄씩 열 조각으로 나눠 적는다. 한 덩어리로 두면 띠가 5천 픽셀이 넘는 큰 레이어가 되는데, WebKit 은 큰 레이어를 조각조각
// 필요할 때 그린다 — 다음 화면을 기다리는 동안에는 새 조각을 그리지 않아 숫자가 비어 보일 수 있다. 조각마다 작은 레이어(will-change)로 두면
// 처음 그릴 때 모두 그려지고, 움직이는 띠(조각들을 담은 틀)는 자기 그림이 없다.
let ENTRY_PROGRESS_DIGITS_V229132 = "";
function entryProgressDigitsV229132() {
  if (!ENTRY_PROGRESS_DIGITS_V229132) ENTRY_PROGRESS_DIGITS_V229132 = Array.from({ length: 10 }, (_, ten) => `<div class="abOpeningTen">${Array.from({ length: 10 }, (__, one) => String(ten * 10 + one)).join("\n")}</div>`).join("");
  return ENTRY_PROGRESS_DIGITS_V229132;
}

// raw = 사용자가 연 주소의 경로 + 값(표식을 뗀 것 — 카카오 값이 붙은 주소에는 이 화면을 주지 않으므로 그 값은 여기 오지 않는다). 화면에는 스크립트를 끈
// 브라우저용 넘김(noscript)과 [다시 열기] 의 주소(표식 _o=1 을 붙인 것 — 스크립트가 돌면 _o=6 으로 바꾼다)로만 쓴다.
function renderEntryProgressHtmlV229132(raw = "/my") {
  const path = String(raw || "/my");
  const marked = escapeHtml(entryProgressMarkedPathV229132(/^\/(?:my|app|m)(?:\?|$)/.test(path) ? path : "/my", 1));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex"/><meta name="theme-color" content="#f6f7fb"/><title>말해가계부 · 여는 중</title><noscript><meta http-equiv="refresh" content="0;url=${marked}"/></noscript><style>${entryProgressStyleV229132()}</style></head><body><main class="abOpening"><div role="status"><p class="abOpeningBrand">말해가계부</p><h1 class="abOpeningTitle">가계부를 여는 중이에요</h1><div class="abOpeningNum" aria-hidden="true"><div class="abOpeningRoll"><div class="abOpeningStrip">${entryProgressDigitsV229132()}</div></div><span class="abOpeningUnit">%</span></div><div class="abOpeningBar" aria-hidden="true"><div class="abOpeningFill"></div><div class="abOpeningSheen"></div></div><p class="abOpeningText">가계부를 불러오고 있어요. 잠시만 기다려 주세요.</p><p class="abOpeningLate" id="abOpeningLate" aria-hidden="true">평소보다 오래 걸리고 있어요. <a href="${marked}" tabindex="-1">다시 열기</a></p></div></main><script>${ENTRY_PROGRESS_SCRIPT_V229132}</script></body></html>`;
}

// @build:exports-start
export { entryProgressGateV229132, entryProgressIsShellV229132, entryProgressShellResponseV229132 };
// @build:exports-end
