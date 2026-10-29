// V22.9.18 — 화면을 실제 브라우저로 띄워 재는 도구 (저장소 하네스 밖, 사람이 돌린다).
// V22.9.85 (작업 지시서 T-08) — 데스크톱 폭·톤 순회·선택 상태 구분·고정 요소 가림 보고·테마 전환 대기·다른 클론 재기.
// V22.9.86 — 선택 상태 구분이 안쪽 윤곽선(box-shadow inset)과 글자 없는 자식(아이콘 칸)의 표시도 잰다(지시서 T-17 하단 탭 알약).
//
// 구조 계측(HTML 문자열 검사)으로는 겹침·넘침·대비를 판정할 수 없다. 이 도구는
//   1) 설치된 Chrome 을 헤드리스로 띄워 DevTools 를 **파이프**로 구동하고(포트·네트워크 없음),
//      모든 요청을 Fetch 도메인에서 가로채 같은 프로세스의 QA 픽스처 app.fetch 로 답한다(DB·서버 없음).
//      바깥 호스트 요청은 끊고 --host-resolver-rules 로 DNS 도 막는다. 받은 화면·자산은 snap/ 에 남긴다.
//      (예전 file:// 정적 파일 방식은 문서가 덜 뜬 채 재기 시작해 이 PC 에서 측정이 깨졌다.)
//   2) 폭(기본 390px 모바일, --width 1280 데스크톱)·톤·라이트/다크마다 문서가 다 뜨고(load 이벤트 + readyState)
//      글꼴과 색 전환이 끝난 뒤(--ab12-dur, 최소 180ms — 바로 재면 이전 테마 색이 나온다)
//      - 화면 폭을 넘는 요소 — 모바일은 넘침만큼 배치 폭이 넓어져 글자가 작아진다
//      - WCAG AA 대비(본문 4.5:1, 큰 글자 3:1) 미달 글자
//      - 선택 상태 구분: [aria-pressed=true]·:checked+span·[aria-current]·.active 요소를 같은 무리의 안 고른 형제와 견줘
//        면(바탕, 투명하면 부모 바탕 위에 겹친 색)과 테두리(1px 이상·투명 아님일 때만, ::before·::after 표시 막대 포함)
//        대비가 둘 다 3:1 미만이면 실패. 표시가 글자 없는 자식(아이콘 칸)에 있으면 같은 자리의 자식끼리도 견준다. 조작 요소의 상태만 본다(주간 띠 '오늘'처럼 표시용 aria-current 는 report.json 의 skipped 에 남긴다).
//      - 32px 미만 터치 대상, position:fixed 요소가 덮는 글자 노드 비율(스크롤 다섯 곳: 맨 위·끝·평균) — 참고용, 실패로 치지 않는다
//     을 재고, 원하면 전체 화면 PNG 를 남긴다. 측정값 전체는 결과 폴더의 report.json 에 적는다.
//
// 사용: node tools/screen-audit.mjs [--out 폴더] [--pages home,reports] [--schemes light,dark]
//                                    [--width 390] [--shots]
//                                    [--width 1280 | --width 390,1280] [--height 800] [--tones blue,emerald,violet,amber]
//                                    [--root 클론] [--interactions]
//   --height 를 안 주면 모바일(폭 700 미만) 844px · 데스크톱 900px.
//   --tones 를 주면 톤(localStorage ab:appearance:tone → html data-ab-tone)마다 돈다(값 없이 주면 네 톤). 안 주면 기본 톤 하나.
//   --root 는 잴 클론 폴더(기본: 이 도구가 든 저장소). 그 클론의 src/index.js·validation/qa-fixture.mjs·VERSION.txt 를 읽는다.
//   CHROME_PATH 로 브라우저 경로를 바꿀 수 있다. 넘침·대비 미달·선택 구분 실패·측정 실패가 있으면 종료 코드 1, 준비 실패는 2.
//
// 헤드리스 새 모드는 창 폭을 500px 밑으로 줄이지 않는다. --window-size 로는 390px 을 잴 수
// 없어서 Emulation.setDeviceMetricsOverride 로 폭을 준다.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); const value = i >= 0 ? args[i + 1] : undefined; return value === undefined || value.startsWith("--") ? fallback : value; };
const listFlag = (name, fallback) => String(flag(name, fallback)).split(",").map((v) => v.trim()).filter(Boolean);
const OUT = resolve(flag("out", join(tmpdir(), "ab-screen-audit")));
const INTERACTIONS = args.includes("interactions") || args.includes("--interactions");
function assertChildPath(root, target) {
  const rel = relative(resolve(root), resolve(target));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("unsafe audit output path");
}
const ROOT = resolve(flag("root", fileURLToPath(new URL("..", import.meta.url))));
const WIDTHS = [...new Set(listFlag("width", "390").map(Number))];
const WIDTH = WIDTHS[0];
const HEIGHT = Number(flag("height", "0")) || 0; // 0 이면 모바일 844 · 데스크톱 900
const SCHEMES = listFlag("schemes", "light,dark");
const ALL_TONES = ["blue", "emerald", "violet", "amber"];
const TONES = args.includes("--tones") ? listFlag("tones", ALL_TONES.join(",")) : [null];
const SHOTS = args.includes("--shots");
const ORIGIN = "https://malhaebook.com";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const H = "household_id=house-home";
const ALL_PAGES = {
  home: `/app?${H}`,
  // V22.9.85 T-08: 빠른 입력 시트를 연 홈 — 지출·수입 세그먼트(.seg)의 선택 구분을 여기서 잰다.
  quick: `/app?month=2026-07&${H}&quick=1#quick`,
  txlist: `/app?month=2026-07&${H}&tab=transactions`,
  budgets: `/budgets?month=2026-07&${H}`,
  reports: `/reports?month=2026-07&${H}`,
  reportsPrev: `/reports?month=2026-06&${H}`,
  reportsWeek: `/reports?month=2026-07&${H}&range=week&week=2026-07-06`,
  analysis: `/my/analysis?month=2026-07&${H}`,
  annual: `/annual?${H}`,
  settings: `/my/settings?${H}`,
  reserve: `/reserve-plans?${H}`,
  menu: `/menu?${H}`,
  // V22.9.37 감사 U4·U9: 로그아웃 시작(로그인) 화면과 시작 안내. login 은 쿠키 없이 그린다(로그아웃 상태의 다크 대비를 잰다).
  login: "/my",
  startGuide: `/start-guide?month=2026-07&${H}`,
};
const LOGGED_OUT_PAGES = new Set(["login"]);
const PAGES = flag("pages", Object.keys(ALL_PAGES).join(",")).split(",").filter((name) => ALL_PAGES[name]);

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

// ── 1. 픽스처 앱을 브라우저에 물린다 ─────────────────────────────────────────
// 픽스처 거래가 2026-07 에 있어 "지금"을 7월 중순으로 고정한다(V22.9.17 검증 전용 시계). 번들을 읽기 전에 건다.
async function loadClone(root) {
  for (const file of ["src/index.js", "validation/qa-fixture.mjs"]) {
    if (!existsSync(join(root, file))) throw new Error(`--root ${root} 에 ${file} 이 없습니다`);
  }
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
  const { default: app } = await import(pathToFileURL(join(root, "src/index.js")).href);
  const { createV2265QaFixture } = await import(pathToFileURL(join(root, "validation/qa-fixture.mjs")).href);
  const versionFile = join(root, "VERSION.txt");
  const version = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim().split(/\r?\n/)[0] : "(VERSION.txt 없음)";
  const fixture = await createV2265QaFixture();
  // 한 번에 수백 번 화면을 여므로 트래픽·스킬 제한에 걸리지 않게 한다(측정 전용 값).
  fixture.env.SKILL_RATE_LIMIT = 10000;
  fixture.env.TRAFFIC_GUARD_LIMIT = 10000;
  return { app, fixture, version };
}

// 받은 문서·자산을 예전 snap/ 형식(자산 주소를 상대 경로로 바꾼 정적 파일)으로 떨군다 — 디스크에서 열어 볼 수 있다.
const localAssets = (text) => text.replace(/(["'(=\s])\/assets\//g, (_m, p) => `${p}assets/`);

// 페이지 요청을 가로채 app.fetch 로 답한다. state.loggedOut 이면 쿠키를 붙이지 않는다(로그아웃 화면).
function serveFixture(browser, sessionId, cdp, { app, fixture }, state) {
  const ctx = () => ({ waitUntil(promise) { Promise.resolve(promise).catch(() => {}); }, passThroughOnException() {} });
  browser.on("Fetch.requestPaused", async (params, sid) => {
    if (sid !== sessionId) return;
    const { requestId, request, resourceType } = params;
    let url = null;
    try { url = new URL(request.url); } catch (_) { url = null; }
    if (!url || url.origin !== ORIGIN) {
      if (url && !["data:", "blob:"].includes(url.protocol)) state.external.add(request.url.slice(0, 160));
      cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch(() => {});
      return;
    }
    try {
      const headers = {};
      for (const [name, value] of Object.entries(request.headers || {})) if (name.toLowerCase() !== "cookie") headers[name] = value;
      // Sec-Fetch-* 는 네트워크 단계에서 붙어 가로채는 시점에는 없다. 같은 출처 페이지가 보낸 요청이므로 실제 값(same-origin)을 넣는다.
      if (!Object.keys(headers).some((name) => name.toLowerCase() === "sec-fetch-site")) headers["sec-fetch-site"] = "same-origin";
      if (!state.loggedOut) {
        const { cookies } = await cdp("Network.getCookies", { urls: [request.url] });
        const jar = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        if (jar) headers.cookie = jar;
      }
      let body;
      if (request.postDataEntries && request.postDataEntries.length) body = Buffer.concat(request.postDataEntries.map((entry) => Buffer.from(entry.bytes || "", "base64")));
      else if (request.postData != null) body = request.postData;
      const init = { method: request.method, headers };
      if (body != null && !["GET", "HEAD"].includes(request.method)) init.body = body;
      const response = await app.fetch(new Request(request.url, init), fixture.env, ctx());
      const bytes = Buffer.from(await response.arrayBuffer());
      const responseHeaders = [];
      response.headers.forEach((value, name) => { if (name.toLowerCase() !== "set-cookie") responseHeaders.push({ name, value }); });
      for (const value of (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [])) responseHeaders.push({ name: "set-cookie", value });
      if (resourceType === "Document") state.documents.push({ url: request.url, status: response.status, location: response.headers.get("location") || "" });
      if (state.snapDir && response.status === 200) {
        if (resourceType === "Document" && state.snapName && !state.saved.has(`page:${state.snapName}`)) {
          state.saved.add(`page:${state.snapName}`);
          writeFileSync(join(state.snapDir, `${state.snapName}.html`), localAssets(bytes.toString("utf8")));
        } else if (url.pathname.startsWith("/assets/")) {
          const asset = url.pathname.slice("/assets/".length);
          if (/^[A-Za-z0-9._-]+$/.test(asset) && !state.saved.has(asset)) {
            state.saved.add(asset);
            writeFileSync(join(state.snapDir, "assets", asset), /\.(css|js|mjs)$/.test(asset) ? localAssets(bytes.toString("utf8")).replace(/url\(\/assets\//g, "url(") : bytes);
          }
        }
      }
      await cdp("Fetch.fulfillRequest", { requestId, responseCode: response.status, responseHeaders, body: bytes.toString("base64") });
    } catch (error) {
      state.errors.push(`${request.method} ${url.pathname}${url.search}: ${String(error && error.message || error).slice(0, 200)}`);
      cdp("Fetch.failRequest", { requestId, errorReason: "Failed" }).catch(() => {});
    }
  });
}

// ── 2. 페이지 안에서 재는 식 ────────────────────────────────────────────────
// 문서가 뜬 뒤: 글꼴 → 두 프레임 → --ab12-dur(최소 180ms) → 끝나는 전환·애니메이션이 멈출 때까지(최대 3초). 무한 애니메이션은 기다리지 않는다.
const SETTLE = String.raw`(async () => {
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const frames = () => Promise.race([new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))), sleep(250)]);
  try { if (document.fonts) await Promise.race([document.fonts.ready, sleep(3000)]); } catch (_) {}
  await frames();
  const token = (el) => { const value = el ? getComputedStyle(el).getPropertyValue("--ab12-dur").trim() : ""; const m = /^(\d*\.?\d+)(ms|s)$/.exec(value); return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : 0; };
  const dur = Math.max(180, token(document.documentElement), token(document.body));
  await sleep(dur + 20);
  const started = performance.now();
  const finite = (a) => { try { return a.playState === "running" && Number.isFinite(a.effect.getComputedTiming().endTime); } catch (_) { return false; } };
  let running = 0;
  for (;;) {
    running = document.getAnimations().filter(finite).length;
    if (!running || performance.now() - started > 3000) break;
    await sleep(50);
  }
  await frames();
  const root = document.documentElement;
  return { dur, running, theme: root.getAttribute("data-ab-resolved-theme"), tone: root.getAttribute("data-ab-tone"), href: location.href };
})()`;

// 선택 상태 구분(T-08): 고른 요소와 같은 무리의 안 고른 형제를 견준다. 면과 테두리 대비가 둘 다 3:1 미만이면 실패다.
//  - 면: 요소 바탕을 조상 바탕 위에 겹친 색(투명하면 부모 바탕이 보인다). 그라디언트·이미지 바탕은 판정하지 않는다.
//  - 테두리: 변마다 1px 이상·선 있음·투명 아님일 때만 본다. 한쪽만 있으면 다른 쪽은 그 자리에 보이는 면과 견준다. 가장 큰 변을 쓴다.
//  - 무리: :checked+span 은 같은 name(없으면 가까운 조상)의 안 고른 입력 뒤 span, 나머지는 세 단계 위 조상 안의 같은 태그·같은 클래스 계열 요소.
//    형제가 여럿이면 가장 덜 구분되는 쪽을 쓴다. 숨은 것·비활성·inert 는 빼고, 라디오가 그대로 보이면(기본 컨트롤이 표시) 건너뛴다.
const SELECTION = String.raw`(() => {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  const memo = new Map();
  const rgba = (value) => {
    const key = String(value || "").trim();
    if (memo.has(key)) return memo.get(key);
    let out = null;
    const m = /^rgba?\(([^)]+)\)$/.exec(key);
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); out = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    else if (key && key !== "none") { paint.clearRect(0, 0, 1, 1); paint.fillStyle = "rgba(0, 0, 0, 0)"; paint.fillStyle = key; paint.fillRect(0, 0, 1, 1); const d = paint.getImageData(0, 0, 1, 1).data; out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; }
    memo.set(key, out);
    return out;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const hex = (c) => c ? "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : null;
  const canvasColor = /dark/.test(getComputedStyle(document.documentElement).colorScheme) ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  const faceMemo = new Map();
  const face = (el) => {
    if (faceMemo.has(el)) return faceMemo.get(el);
    const layers = [];
    let out;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") { out = null; break; }
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    if (out !== null) {
      out = canvasColor;
      for (let i = layers.length - 1; i >= 0; i -= 1) out = blend(layers[i], out);
      const opacity = Number(getComputedStyle(el).opacity);
      if (opacity < 1 && el.parentElement) { const under = face(el.parentElement); if (under) out = blend({ ...out, a: opacity }, under); }
    }
    faceMemo.set(el, out);
    return out;
  };
  const SIDES = ["Top", "Right", "Bottom", "Left"];
  const SLOTS = ["top", "right", "bottom", "left", "::before", "::after", "ring"];
  // V22.9.86: 안쪽 그림자 윤곽선(box-shadow inset, 흐림 0·퍼짐 1px 이상)은 테두리처럼 보이므로 한 변(ring)으로 본다.
  const ring = (cs, under) => {
    for (const part of String(cs.boxShadow || "none").split(/,(?![^(]*\))/)) {
      if (!/\binset\b/.test(part)) continue;
      const color = rgba((part.match(/rgba?\([^)]*\)/) || [""])[0]);
      const lengths = (part.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) || []).map(parseFloat);
      if (color && color.a > 0 && lengths.length >= 4 && lengths[2] === 0 && lengths[3] >= 1) return { shown: true, color: color.a < 1 ? blend(color, under) : { ...color, a: 1 } };
    }
    return { shown: false, color: under };
  };
  // 테두리 네 변 + 표시 막대(::before·::after) + 안쪽 윤곽선. 막대는 1px 이상 상자에 바탕·테두리가 칠해졌거나 글자(✓ 등)가 있을 때 본다.
  const edges = (el, own) => {
    const cs = getComputedStyle(el);
    const under = cs.backgroundClip === "border-box" || !el.parentElement ? own : (face(el.parentElement) || own);
    const solid = (c, base) => (c.a < 1 ? blend(c, base) : { ...c, a: 1 });
    const sides = SIDES.map((side) => {
      const width = parseFloat(cs["border" + side + "Width"]) || 0, style = cs["border" + side + "Style"], c = rgba(cs["border" + side + "Color"]);
      const shown = width >= 1 && style !== "none" && style !== "hidden" && !!c && c.a > 0;
      return { shown, color: shown ? solid(c, under) : own };
    });
    const marks = ["::before", "::after"].map((which) => {
      const ps = getComputedStyle(el, which);
      if (!ps.content || ps.content === "none" || ps.content === "normal" || ps.display === "none" || ps.visibility === "hidden" || Number(ps.opacity) === 0) return { shown: false, color: own };
      const w = parseFloat(ps.width), h = parseFloat(ps.height), boxed = w >= 1 && h >= 1;
      const bg = rgba(ps.backgroundColor), bc = rgba(ps.borderTopColor), bw = parseFloat(ps.borderTopWidth) || 0;
      let c = null;
      if (boxed && bg && bg.a > 0 && (!ps.backgroundImage || ps.backgroundImage === "none")) c = bg;
      else if (bw >= 1 && ps.borderTopStyle !== "none" && bc && bc.a > 0) c = bc;
      else if (!/^(""|'')$/.test(ps.content)) { const t = rgba(ps.color); if (t && t.a > 0) c = t; }
      return c ? { shown: true, color: solid(c, own) } : { shown: false, color: own };
    });
    return sides.concat(marks, [ring(cs, own)]);
  };
  // 모달 시트·덮개처럼 화면 절반 넘게 덮는 다른 고정 층 아래에 있으면 지금은 보이지 않는다 — 견주지 않는다.
  const layerOf = (el) => { let top = null; for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).position === "fixed") top = e; return top; };
  const occluded = (el) => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return false;
    const layer = layerOf(hit);
    if (!layer || layer.contains(el)) return false;
    const box = layer.getBoundingClientRect();
    const area = Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
    return area >= innerWidth * innerHeight * 0.5;
  };
  const visible = (el) => {
    if (!el || !el.isConnected || el.closest("[hidden],[inert]")) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4 && r.right > 0 && r.left < innerWidth;
  };
  const usable = (el) => !el.matches(":disabled,[aria-disabled=true]");
  const label = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + "[" + (el.textContent || el.getAttribute("aria-label") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 16) + "]";
  const classesOf = (el) => [...el.classList].filter((c) => c !== "active");
  const sameKind = (a, b) => { if (a.tagName !== b.tagName) return false; const x = classesOf(a), y = classesOf(b); return !x.length || !y.length || x.some((c) => y.includes(c)); };
  const unselected = {
    pressed: (p) => p.getAttribute("aria-pressed") === "false",
    current: (p) => !p.hasAttribute("aria-current") || p.getAttribute("aria-current") === "false",
    active: (p) => !p.classList.contains("active"),
  };
  const nativeShown = (input) => { if (!input || input.tagName !== "INPUT") return false; const r = input.getBoundingClientRect(); return Number(getComputedStyle(input).opacity) > 0.05 && r.width >= 8 && r.height >= 8 && input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); };
  // 조작 요소(WCAG 1.4.11 의 "UI 구성요소의 상태"): 자신·조상·자손 가운데 하나가 조작 요소면 된다.
  const CONTROL = 'a[href],button,input,select,textarea,summary,label,[role=tab],[role=button],[role=link],[role=radio],[role=checkbox],[role=switch],[role=menuitem],[role=menuitemradio],[role=option],[tabindex]:not([tabindex="-1"])';
  const isControl = (el) => el.matches(CONTROL) || !!el.closest(CONTROL) || !!el.querySelector(CONTROL);
  const peersOf = (el, type) => {
    if (type === "checked") {
      const input = el.previousElementSibling;
      if (!input || input.tagName !== "INPUT") return [];
      const candidate = (i) => i !== input && i.type === input.type && !i.checked && i.nextElementSibling && i.nextElementSibling.tagName === "SPAN";
      let found = input.name ? [...(input.form || document).querySelectorAll("input")].filter((i) => candidate(i) && i.name === input.name) : [];
      for (let a = input.parentElement, depth = 0; !found.length && a && a !== document.body && depth < 3; a = a.parentElement, depth += 1) found = [...a.querySelectorAll("input")].filter(candidate);
      return found.map((i) => i.nextElementSibling);
    }
    for (let a = el.parentElement, depth = 0; a && a !== document.body && depth < 3; a = a.parentElement, depth += 1) {
      const found = [...a.getElementsByTagName(el.tagName)].filter((p) => p !== el && !p.contains(el) && !el.contains(p) && unselected[type](p) && sameKind(el, p));
      if (found.length) return found;
    }
    // 고른 칸만 링크가 아닌 글자로 그리는 세그먼트(<span aria-current>일별</span><a>주별</a>)는 같은 부모의 링크·단추와 견준다. 날짜·시각 표시는 빼고.
    if (type === "current" && !/^(date|time)$/.test(el.getAttribute("aria-current")) && el.parentElement) {
      return [...el.parentElement.children].filter((p) => p !== el && p.matches("a[href],button") && unselected.current(p));
    }
    return [];
  };
  const SELECTORS = [["pressed", '[aria-pressed="true"]'], ["checked", ":checked + span"], ["current", '[aria-current]:not([aria-current="false"])'], ["active", ".active"]];
  const done = new Set(), seen = new Set(), fails = [], passes = [], skipped = [];
  let checked = 0;
  for (const [type, selector] of SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (done.has(el) || !visible(el)) continue;
      done.add(el);
      if (type === "checked" && nativeShown(el.previousElementSibling)) { skipped.push(type + " " + label(el) + " 기본 컨트롤이 보임"); continue; }
      if (occluded(el)) { skipped.push(type + " " + label(el) + " 다른 고정 층(시트·덮개)에 가려짐"); continue; }
      const found = peersOf(el, type).filter((p) => visible(p) && usable(p));
      if (!found.length) continue;
      // V22.9.86: 같은 클래스(active 뺀)의 형제가 있으면 그것들과만 견준다 — 하단 탭의 고른 탭을 탭이 아닌 가운데 ＋ 단추(.abNavQuick 원)와 견주지 않는다.
      const kind = (p) => classesOf(p).sort().join(" ");
      const exact = found.filter((p) => kind(p) === kind(el));
      const peers = exact.length ? exact : found;
      if (!isControl(el) && !peers.some(isControl)) { skipped.push(type + " " + label(el) + " 조작 요소가 아님(표시용)"); continue; }
      const own = face(el);
      if (!own) { skipped.push(type + " " + label(el) + " 그라디언트·이미지 바탕"); continue; }
      const ownEdges = edges(el, own);
      // 한 쌍(고른 것·형제)의 면 대비와 가장 큰 변 대비.
      const compare = (selFace, selEdges, peerFace, peerEdges) => {
        const faceRatio = contrast(selFace, peerFace);
        let borderRatio = null, side = -1;
        selEdges.forEach((edge, i) => {
          if (!edge.shown && !peerEdges[i].shown) return;
          const r = contrast(edge.color, peerEdges[i].color);
          if (borderRatio === null || r > borderRatio) { borderRatio = r; side = i; }
        });
        return { faceRatio, borderRatio, side, score: Math.max(faceRatio, borderRatio ?? 0), selFace, selEdges, peerFace, peerEdges, via: null };
      };
      let worst = null;
      for (const peer of peers) {
        const other = face(peer);
        if (!other) continue;
        let best = compare(own, ownEdges, other, edges(peer, other));
        // V22.9.86: 표시가 글자 없는 자식(아이콘 칸)에 있을 수 있다 — 하단 탭(지시서 T-17)은 고른 탭의 알약을 아이콘 칸 i 에 그려
        // 링크 자신에는 면·테두리 차이가 없다. 같은 순번·같은 태그의 글자 없는 자식끼리도 견줘 더 나은 쪽을 그 형제의 점수로 둔다.
        for (let k = 0; k < el.children.length && best.score < 3; k += 1) {
          const mine = el.children[k], theirs = peer.children[k];
          if (!theirs || mine.tagName !== theirs.tagName || mine.textContent.trim() || theirs.textContent.trim() || !visible(mine)) continue;
          const mineFace = face(mine), theirFace = face(theirs);
          if (!mineFace || !theirFace) continue;
          const child = compare(mineFace, edges(mine, mineFace), theirFace, edges(theirs, theirFace));
          if (child.score > best.score) best = { ...child, via: label(mine) };
        }
        if (!worst || best.score < worst.score) worst = { ...best, peer };
      }
      if (!worst) { skipped.push(type + " " + label(el) + " 형제 바탕을 판정할 수 없음"); continue; }
      checked += 1;
      const item = {
        type, el: label(el), peer: label(worst.peer),
        face: Math.round(worst.faceRatio * 100) / 100, border: worst.borderRatio === null ? null : Math.round(worst.borderRatio * 100) / 100,
        faceSel: hex(worst.selFace), facePeer: hex(worst.peerFace),
        borderSel: worst.side < 0 ? null : (worst.selEdges[worst.side].shown ? hex(worst.selEdges[worst.side].color) : "없음"),
        borderPeer: worst.side < 0 ? null : (worst.peerEdges[worst.side].shown ? hex(worst.peerEdges[worst.side].color) : "없음"),
        side: worst.side < 0 ? null : SLOTS[worst.side],
        via: worst.via,
        textSel: hex(rgba(getComputedStyle(el).color)), textPeer: hex(rgba(getComputedStyle(worst.peer).color)),
        pass: worst.score >= 3,
      };
      const key = [type, el.tagName, el.className, item.via, item.faceSel, item.facePeer, item.borderSel, item.borderPeer].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      (item.pass ? passes : fails).push(item);
    }
  }
  return { checked, fails, passes: passes.slice(0, 80), skipped: skipped.slice(0, 30) };
})()`;

// 고정 요소 가림(T-08, 참고용): 지금 화면에 보이는 글자 노드(고정 층 밖) 가운데, 줄 상자 한가운데에 position:fixed 층이 맞는 비율.
// 스크롤 0·25·50·75·100% 다섯 곳에서 재어 맨 위·끝·평균(다섯 곳 합)을 낸다. 스크롤 잠금용으로 body·html 이 fixed 여도 층으로 보지 않는다.
// pointer-events:none 인 고정 층은 맞지 않아 세지 못한다.
const FIXED_COVER = String.raw`(async () => {
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const frames = () => Promise.race([new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))), sleep(250)]);
  const style = document.createElement("style"); style.textContent = "*{scroll-behavior:auto!important}"; document.head.appendChild(style);
  const label = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const sample = () => {
    const fixedMemo = new Map();
    const fixedOf = (el) => {
      if (fixedMemo.has(el)) return fixedMemo.get(el);
      let top = null;
      for (let e = el; e && e.nodeType === 1 && e !== document.body && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).position === "fixed") top = e;
      fixedMemo.set(el, top);
      return top;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const by = {};
    let texts = 0, covered = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\S/.test(node.textContent)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript,template,.srOnly,[aria-hidden=true]")) continue;
      if (parent.checkVisibility && !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (fixedOf(parent)) continue;
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2).map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })).filter((p) => p.x >= 0 && p.y >= 0 && p.x < innerWidth && p.y < innerHeight);
      if (!lines.length) continue;
      texts += 1;
      for (const { x, y } of lines) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === parent || parent.contains(hit) || hit.contains(parent)) continue;
        const cover = fixedOf(hit);
        if (!cover || cover.contains(parent)) continue;
        covered += 1;
        const key = label(cover);
        by[key] = (by[key] || 0) + 1;
        break;
      }
    }
    return { texts, covered, pct: texts ? Math.round((covered / texts) * 1000) / 10 : 0, by, scrollY: Math.round(scrollY) };
  };
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const samples = [sample()];
  if (max > 4) {
    // 스크롤에 따라 접히는 바(전환 180ms)가 자리를 잡도록 매번 260ms 기다린다.
    for (const at of [0.25, 0.5, 0.75, 1]) {
      scrollTo(0, Math.round(max * at));
      await frames(); await sleep(260); await frames();
      if (scrollY > 4) samples.push(sample());
    }
    scrollTo(0, 0);
    await frames(); await sleep(60);
  }
  style.remove();
  const texts = samples.reduce((n, s) => n + s.texts, 0), covered = samples.reduce((n, s) => n + s.covered, 0);
  const by = {};
  for (const s of samples) for (const [who, n] of Object.entries(s.by)) by[who] = (by[who] || 0) + n;
  return { top: samples[0], bottom: samples.length > 1 ? samples[samples.length - 1] : null, mean: { texts, covered, pct: texts ? Math.round((covered / texts) * 1000) / 10 : 0, by }, samples: samples.length, scrollMax: max };
})()`;

const MEASURE = measureExpression(WIDTH);
function measureExpression(WIDTH) {
  return `(() => {
  const parse = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const backdrop = (el) => {
    const layers = []; let e = el;
    for (; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // 그라디언트·이미지 위 글자는 판정하지 않는다
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) base = blend(layers[i], base);
    return base;
  };
  const label = (el) => el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") + " [" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 18) + "]";
  // 가로 스크롤·잘림 상자(칩 줄, 표 감싸개) 안에서 넘는 것은 의도된 것이다 — 그 상자가 화면 안에 있으면 세지 않는다.
  const clipped = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { if (/auto|scroll|hidden|clip/.test(getComputedStyle(e).overflowX)) return e.getBoundingClientRect().right <= ${WIDTH} + 1; } return false; };
  const iw = innerWidth, overflow = [], contrast = [], small = [], seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden") continue;
    if (r.right > ${WIDTH} + 1 && !el.closest("[hidden]") && !clipped(el)) {
      if (overflow.length < 12) overflow.push(label(el) + " right=" + Math.round(r.right));
    }
    if (/^(A|BUTTON|SUMMARY)$/.test(el.tagName) && (r.height < 32 || r.width < 32) && small.length < 20) small.push(label(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
    if (!/\\S/.test(own) || el.closest(".srOnly,[aria-hidden=true]")) continue;
    let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.1) continue;
    const fg = parse(cs.color), bg = backdrop(el); if (!fg || !bg) continue;
    const text = fg.a < 1 ? blend(fg, bg) : fg;
    const L1 = lum(text), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    if (ratio >= (large ? 3 : 4.5)) continue;
    const key = el.className + "|" + cs.color + "|" + cs.backgroundColor; if (seen.has(key)) continue; seen.add(key);
    contrast.push(ratio.toFixed(2) + " " + label(el) + " " + cs.color + " on rgb(" + [bg.r, bg.g, bg.b].map(Math.round).join(",") + ")");
  }
  return { layoutWidth: iw, docHeight: document.documentElement.scrollHeight, overflow, contrast, small };
})()`;
}

// ── 3. DevTools 파이프 ──────────────────────────────────────────────────────
// extraArgs 는 이 도구가 붙이는 망 차단 인자다. 이 함수를 잘라 쓰는 도구(responsive·uiux 감사)는 인자 없이 예전처럼 띄운다.
function openBrowser(chromePath, profileDir, extraArgs = []) {
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-pipe", "--allow-file-access-from-files", `--user-data-dir=${profileDir}`, ...extraArgs, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const writer = chrome.stdio[3], reader = chrome.stdio[4];
  let seq = 0, buffer = "";
  const pending = new Map();
  const listeners = new Map();
  const failAll = (reason) => { for (const waiter of pending.values()) waiter.reject(new Error(reason)); pending.clear(); };
  chrome.on("error", (error) => failAll(`Chrome 실행 실패: ${error.message}`));
  chrome.on("exit", (code) => failAll(`Chrome 이 끝났습니다(${code})`));
  writer.on("error", () => {});
  reader.on("data", (chunk) => {
    buffer += chunk.toString();
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (!message.id) {
        for (const listener of listeners.get(message.method) || []) {
          try { listener(message.params, message.sessionId); } catch (error) { console.error("CDP 이벤트 처리 실패", error); }
        }
        continue;
      }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    seq += 1;
    pending.set(seq, { resolve, reject, method });
    writer.write(JSON.stringify({ id: seq, method, params, sessionId }) + "\0");
  });
  const on = (method, listener) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(listener);
    return () => { const list = listeners.get(method) || []; const i = list.indexOf(listener); if (i >= 0) list.splice(i, 1); };
  };
  return { send, on, close: () => { try { chrome.kill(); } catch (_) {} } };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 망 차단: 가로채기를 빠져나가는 브라우저 자체 요청까지 막는다(운영으로 나가는 요청이 없게).
const NETWORK_OFF_ARGS = [
  "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-domain-reliability", "--no-pings",
  "--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication", "--host-resolver-rules=MAP * ~NOTFOUND",
];

async function evaluate(page, expression, { retries = 0, timeout = 30000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let timer;
    const result = await Promise.race([
      page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`평가가 ${timeout}ms 안에 끝나지 않았습니다`)), timeout); }),
    ]).finally(() => clearTimeout(timer));
    if (!result.exceptionDetails) return result.result.value;
    if (attempt >= retries) throw new Error(`페이지 식 오류: ${String(result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 300)}`);
    await wait(250);
  }
}

// 탐색: load 이벤트(최대 20초)를 기다린 뒤 readyState 가 complete 이고 body 가 있을 때까지 본다.
// 같은 문서 안 이동(#만 다른 같은 주소)이면 load 가 없으므로 다시 읽는다 — 새 문서여야 테마 스크립트가 다시 돈다.
async function navigate(browser, sessionId, page, url) {
  let off = () => {}, timer;
  const loaded = new Promise((done) => {
    off = browser.on("Page.loadEventFired", (_params, sid) => { if (sid === sessionId) done(true); });
    timer = setTimeout(() => done(false), 20000);
  });
  try {
    const nav = await page("Page.navigate", { url });
    if (nav.errorText) throw new Error(`탐색 실패 ${nav.errorText}`);
    if (!nav.loaderId) await page("Page.reload", {});
    if (!await loaded) throw new Error("load 이벤트가 20초 안에 오지 않았습니다");
  } finally {
    off();
    clearTimeout(timer);
  }
  for (let i = 0; i < 100; i += 1) {
    const ready = await evaluate(page, `document.readyState === "complete" && !!document.body && location.href !== "about:blank"`).catch(() => false);
    if (ready) return;
    await wait(100);
  }
  throw new Error("문서가 10초 안에 준비되지 않았습니다");
}

async function auditInteractions(page, name) {
  const evaluate = async expression => {
    const value = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  const check = async (expression, message) => { if (!await evaluate(expression)) throw new Error(`${name}: ${message}`); console.log(`  interaction ok: ${name} ${message}`); };
  const key = async (keyName, code, virtual) => {
    await page("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: virtual });
    await page("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: virtual });
  };
  if (name === "budgets" || name === "settings") {
    await check(`!!document.querySelector('[name="budget_category"][role="combobox"]')`, "분류 선택기가 초기화된다");
    await evaluate(`(() => {const i=document.querySelector('[name="budget_category"][role="combobox"]'); window.__auditInput=i; window.__auditSubmitted=false; i.form.addEventListener('submit',e=>{e.preventDefault();window.__auditSubmitted=true;},{once:true});i.value='식';i.focus();i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await key("ArrowDown", "ArrowDown", 40);
    await key("Enter", "Enter", 13);
    await check(`__auditInput.value==='식비'&&!__auditSubmitted&&new FormData(__auditInput.form).getAll('budget_category').includes('식비')`, "실제 Enter는 분류를 적용하며 폼을 제출하지 않는다");
    await evaluate(`__auditInput.value='직접 입력한 새 분류';__auditInput.dispatchEvent(new Event('input',{bubbles:true}));`);
    await key("Escape", "Escape", 27);
    await check(`__auditInput.value==='직접 입력한 새 분류'&&__auditInput.getAttribute('aria-expanded')==='false'`, "Escape는 직접 입력값을 유지하며 목록만 닫는다");
    await evaluate(`document.querySelector('[data-add="expense"]').click()`);
    await wait(100);
    await check(`Array.from(document.querySelectorAll('[name="budget_category"]')).every(i=>i.getAttribute('role')==='combobox')`, "동적으로 추가한 예산 행도 선택기가 된다");
    await evaluate(`(() => {const f=__auditInput.form;const d=document.createElement('datalist');d.id='audit-labels';const o=document.createElement('option');o.value='<img src=x onerror=alert(1)>';d.append(o);const i=document.createElement('input');i.name='audit-category';i.setAttribute('list',d.id);f.append(d,i);window.__auditLabel=i;})()`);
    await wait(50);
    await evaluate(`__auditLabel.focus()`);
    await check(`__auditLabel.nextElementSibling.textContent.includes('<img src=x onerror=alert(1)>')&&!__auditLabel.nextElementSibling.querySelector('img')`, "HTML 모양의 분류 이름도 텍스트로 표시한다");
    await key("ArrowDown", "ArrowDown", 40);
    await key("Enter", "Enter", 13);
    await check(`__auditLabel.value==='<img src=x onerror=alert(1)>'`, "특수 문자를 포함한 값도 그대로 적용한다");
    await evaluate(`(()=>{const d=document.createElement('datalist');d.id='audit-late';const o=document.createElement('option');o.value='늦게 추가한 분류';d.append(o);__auditLabel.form.append(d);__auditLabel.setAttribute('list',d.id);})()`);
    await wait(60);
    await evaluate(`__auditLabel.value='늦게';__auditLabel.dispatchEvent(new Event('input',{bubbles:true}))`);
    await check(`!__auditLabel.hasAttribute('list')&&__auditLabel.nextElementSibling.textContent.includes('늦게 추가한 분류')`, "늦게 연결된 datalist는 중복 팝업 없이 반영된다");
    await evaluate(`(()=>{const o=document.createElement('option');o.value='후속 선택';document.getElementById('audit-late').append(o);})()`);
    await wait(60);
    await evaluate(`__auditLabel.value='후속';__auditLabel.dispatchEvent(new Event('input',{bubbles:true}))`);
    await check(`__auditLabel.nextElementSibling.textContent.includes('후속 선택')`, "나중에 추가한 선택지도 검색에 반영된다");
    await key("Tab", "Tab", 9);
    await check(`__auditLabel.getAttribute('aria-expanded')==='false'&&document.activeElement!==__auditLabel`, "Tab은 목록을 닫고 원래 포커스 순서로 이동한다");
    await evaluate(`document.getElementById('audit-late').remove()`);
    await evaluate(`__auditLabel.closest('.ab38Combo').remove();document.getElementById('audit-labels').remove();__auditInput.value='식비';__auditInput.blur()`);
    await check(`new Promise(resolve=>{let n=0;const o=new MutationObserver(rs=>n+=rs.length);o.observe(document.body,{subtree:true,childList:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(n<5)},150)})`, "동적 행 처리 후 DOM 관찰이 안정된다");
  }
  if (name === "menu") {
    await evaluate(`(()=>{const i=document.getElementById('ab38-menu-search');i.value='생활비';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await check(`Array.from(document.querySelectorAll('.menuRow:not([hidden]),.featuredCard:not([hidden])')).length===1&&document.querySelector('.menuRow:not([hidden])').textContent.includes('생활비 리포트')`, "메뉴 검색은 일치한 메뉴만 표시한다");
    await evaluate(`(()=>{const i=document.getElementById('ab38-menu-search');i.value='없는메뉴987';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await check(`document.querySelector('.ab38MenuSearch [role="status"]').textContent.includes('검색 결과가 없습니다')`, "메뉴 검색 결과가 없으면 이유를 안내한다");
    await evaluate(`document.querySelector('.ab38MenuSearch button').click()`);
    await check(`!document.querySelector('.menuRow[hidden]')&&document.activeElement.id==='ab38-menu-search'`, "검색 지우기는 전체 메뉴와 검색 포커스를 복원한다");
    await evaluate(`document.activeElement.blur()`);
  }
  if (name === "reports") {
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});window.__auditOriginalCopy=document.execCommand;document.execCommand=()=>false;document.getElementById('copyReport').click()`);
    await wait(50);
    await check(`document.getElementById('copyReport').textContent.includes('직접 복사')&&document.getElementById('reportShare').selectionEnd>0`, "복사 권한 거절과 대체 복사 실패는 직접 복사를 안내한다");
    await evaluate(`document.execCommand=()=>true;document.getElementById('copyReport').click()`);
    await wait(50);
    await check(`document.getElementById('copyReport').textContent==='복사됨'`, "대체 복사가 성공했을 때만 성공을 알린다");
    await evaluate(`document.execCommand=window.__auditOriginalCopy;document.getElementById('copyReport').textContent='문구 복사';document.activeElement.blur()`);
  }
  if (name === "reserve") {
    await check(`Array.from(document.querySelectorAll('.reserveEdit:not([open])>form')).every(f=>getComputedStyle(f).display==='none')`, "접힌 정기 수정 폼은 화면 배치를 차지하지 않는다");
    await evaluate(`document.querySelector('.reserveActions .reserveEdit summary').click()`);
    await check(`(()=>{const e=document.querySelector('.reserveActions .reserveEdit[open]');return e&&e.getBoundingClientRect().right<=innerWidth&&e.querySelector('input[name="name"]').getBoundingClientRect().height>=44})()`, "정기 계획 수정 폼은 화면 안에서 열린다");
    await evaluate(`document.querySelector('.reserveActions .reserveEdit summary').click()`);
  }
  if (name === "settings") {
    await check(`!!document.querySelector('.ab38Recurring .reserveEdit:not([open])')`, "정기 항목 수정 폼은 처음에는 접혀 있다");
    await evaluate(`document.querySelector('.ab38Recurring .reserveEdit summary').click()`);
    await check(`document.querySelector('.ab38Recurring .reserveEdit').open&&document.querySelector('.ab38Recurring form[action="/my/recurring/save"] input[name="category"]').getBoundingClientRect().height>=44`, "수정 폼을 열면 입력칸을 조작할 수 있다");
    await check(`document.querySelector('.ab38Recurring form[action="/my/recurring/delete"] button').getBoundingClientRect().height>=44`, "기존 삭제 버튼도 도달할 수 있다");
    await evaluate(`document.querySelector('.ab38Recurring .reserveEdit summary').click()`);
  }
}

const pct = (sample) => (sample ? `${sample.pct}%` : "-");
// 선택 줄: "면대비/테두리대비 종류 고른것 ↔ 형제 면 고른색/형제색 테두리(변) 고른색/형제색 글자 고른색/형제색"
const selectionLine = (item) => `${item.face.toFixed(2)}/${item.border === null ? "-" : item.border.toFixed(2)} ${item.type} ${item.el} ↔ ${item.peer}${item.via ? ` 표시 칸 ${item.via}` : ""} 면 ${item.faceSel}/${item.facePeer}` +
  (item.side ? ` ${item.side.startsWith("::") ? "표시" : item.side === "ring" ? "윤곽선" : "테두리"}(${item.side}) ${item.borderSel}/${item.borderPeer}` : " 테두리 없음") + ` 글자 ${item.textSel}/${item.textPeer}`;

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("Chrome/Edge 를 찾지 못했습니다. CHROME_PATH 로 경로를 알려 주세요.");
    process.exit(2);
  }
  const badTone = TONES.find((tone) => tone && !ALL_TONES.includes(tone));
  if (badTone || !PAGES.length || !WIDTHS.length || WIDTHS.some((w) => !Number.isInteger(w) || w < 200 || w > 4000)) {
    console.error(badTone ? `모르는 톤: ${badTone} (${ALL_TONES.join(",")})` : !PAGES.length ? `--pages 에 아는 화면이 없습니다: ${Object.keys(ALL_PAGES).join(",")}` : "--width 는 200~4000 사이 정수(쉼표로 여럿)");
    process.exit(2);
  }
  let clone;
  try { clone = await loadClone(ROOT); } catch (error) { console.error(String(error && error.message || error)); process.exit(2); }
  const { fixture, version } = clone;
  const snapDir = join(OUT, "snap");
  assertChildPath(OUT, snapDir);
  rmSync(snapDir, { recursive: true, force: true });
  mkdirSync(join(snapDir, "assets"), { recursive: true });
  if (SHOTS) mkdirSync(join(OUT, "shots"), { recursive: true });
  console.log(`판 ${version} · 클론 ${ROOT}`);
  console.log(`폭 ${WIDTHS.join(",")} · 톤 ${TONES[0] ? TONES.join(",") : "기본(blue)"} · 테마 ${SCHEMES.join(",")} · 화면 ${PAGES.length}개`);

  const state = { external: new Set(), errors: [], documents: [], saved: new Set(), snapDir, snapName: null, loggedOut: false, dialogs: [] };
  const report = { version, root: ROOT, widths: WIDTHS, tones: TONES[0] ? TONES : ["blue"], schemes: SCHEMES, pages: PAGES, startedAt: new Date().toISOString(), runs: [] };
  const browser = openBrowser(chromePath, join(OUT, "chrome-profile"), NETWORK_OFF_ARGS);
  let failures = 0;
  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => browser.send(method, params, sessionId);
    browser.on("Page.javascriptDialogOpening", (params, sid) => {
      if (sid !== sessionId) return;
      state.dialogs.push(`${params.type}: ${String(params.message).slice(0, 80)}`);
      page("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    serveFixture(browser, sessionId, page, clone, state);
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Network.enable");
    await page("Network.setCacheDisabled", { cacheDisabled: true });
    await page("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    // 화면마다 쿠키를 새로 둔다(예전처럼 화면끼리 독립): 픽스처 세션 쿠키만, 로그아웃 화면은 쿠키 없이.
    const resetCookies = async (loggedOut) => {
      await page("Network.clearBrowserCookies");
      if (loggedOut) return;
      for (const part of String(fixture.cookie || "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0) await page("Network.setCookie", { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim(), domain: "malhaebook.com", path: "/", secure: true, httpOnly: true });
      }
    };
    for (const width of WIDTHS) {
      const mobile = width < 700;
      await page("Emulation.setDeviceMetricsOverride", { width, height: HEIGHT || (mobile ? 844 : 900), deviceScaleFactor: 1, mobile });
      await page("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
      await page("Emulation.setUserAgentOverride", { userAgent: mobile ? MOBILE_UA : DESKTOP_UA });
      const measure = measureExpression(width);
      let firstPass = true;
      if (WIDTHS.length > 1 || TONES[0]) console.log(`\n── 폭 ${width}px (${mobile ? "모바일" : "데스크톱"}) ──`);
      for (const tone of TONES) {
        for (const scheme of SCHEMES) {
          // 다크·톤은 OS 설정이 아니라 앱 설정(localStorage)으로 켜진다 — 새 문서마다 저장소를 비우고 테마 스크립트가 읽는 키를 미리 넣는다.
          const { identifier } = await page("Page.addScriptToEvaluateOnNewDocument", {
            source: `try{if(window.top===window){localStorage.clear();sessionStorage.clear();localStorage.setItem("ab:appearance:theme",${JSON.stringify(scheme)});${tone ? `localStorage.setItem("ab:appearance:tone",${JSON.stringify(tone)});` : ""}}}catch(e){}`,
          });
          const theme = tone ? `${tone}-${scheme}` : scheme;
          for (const name of PAGES) {
            const run = { page: name, width, tone: tone || "blue", scheme };
            report.runs.push(run);
            state.loggedOut = LOGGED_OUT_PAGES.has(name);
            state.snapName = firstPass ? (width === WIDTH ? name : `${name}-${width}`) : null;
            state.documents = [];
            state.dialogs = [];
            try {
              await resetCookies(state.loggedOut);
              await navigate(browser, sessionId, page, ORIGIN + ALL_PAGES[name]);
              const first = state.documents[0];
              if (first && first.status !== 200) throw new Error(`응답 ${first.status}${first.location ? ` → ${first.location}` : ""}`);
              run.settle = await evaluate(page, SETTLE, { retries: 2 });
              if (INTERACTIONS) await auditInteractions(page, name);
              const m = await evaluate(page, measure, { retries: 3 });
              const selection = await evaluate(page, SELECTION, { retries: 1 });
              const cover = await evaluate(page, FIXED_COVER, { retries: 1 });
              Object.assign(run, { layoutWidth: m.layoutWidth, docHeight: m.docHeight, overflow: m.overflow, contrast: m.contrast, small: m.small, selection, fixedCover: cover });
              const wrongTheme = run.settle.theme !== null && (run.settle.theme !== scheme || (tone && run.settle.tone !== tone));
              const widened = m.layoutWidth > width;
              const bad = widened || m.overflow.length || m.contrast.length || selection.fails.length || wrongTheme;
              run.fail = !!bad;
              if (bad) failures += 1;
              console.log(`${bad ? "FAIL" : "ok  "} ${name.padEnd(12)} ${theme.padEnd(tone ? 13 : 5)} 배치폭 ${m.layoutWidth}px · 높이 ${m.docHeight}px · 넘침 ${m.overflow.length} · 대비미달 ${m.contrast.length} · 작은 터치 ${m.small.length}` +
                ` · 선택구분 실패 ${selection.fails.length}/${selection.checked} · 고정가림 위 ${pct(cover.top)} 끝 ${pct(cover.bottom)} 평균 ${pct(cover.mean)}`);
              if (wrongTheme) console.log(`       테마  요청 ${theme} 인데 적용 ${run.settle.tone}-${run.settle.theme}`);
              else if (run.settle.theme === null) console.log("       테마  html 에 data-ab-resolved-theme 가 없습니다(테마 스크립트 없음)");
              for (const line of m.overflow) console.log(`       넘침  ${line}`);
              for (const line of m.contrast) console.log(`       대비  ${line}`);
              for (const item of selection.fails) console.log(`       선택  ${selectionLine(item)}`);
              for (const line of state.dialogs) console.log(`       대화상자  ${line}`);
              if (SHOTS) {
                const height = Math.min(m.docHeight, 8000);
                const shot = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
                run.shot = `${name}-${tone ? `${tone}-` : ""}${scheme}-${width}.png`;
                writeFileSync(join(OUT, "shots", run.shot), Buffer.from(shot.data, "base64"));
              }
            } catch (error) {
              failures += 1;
              run.fail = true;
              run.error = String(error && error.message || error);
              console.log(`FAIL ${name.padEnd(12)} ${theme.padEnd(tone ? 13 : 5)} 측정 실패: ${run.error}`);
            }
          }
          await page("Page.removeScriptToEvaluateOnNewDocument", { identifier });
          firstPass = false;
        }
      }
    }
  } finally {
    browser.close();
    fixture.restore();
    delete globalThis.__AB_QA_FIXED_NOW_MS;
  }

  // 고정 요소 가림 요약(참고, 실패로 치지 않는다): 화면·폭마다 테마 가운데 가장 큰 값.
  const coverRows = new Map();
  for (const run of report.runs) {
    if (!run.fixedCover) continue;
    const key = `${run.page}@${run.width}`;
    const row = coverRows.get(key) || { page: run.page, width: run.width, top: 0, bottom: 0, mean: 0, texts: 0, covered: 0, by: {} };
    const { top, bottom, mean } = run.fixedCover;
    row.top = Math.max(row.top, top.pct);
    row.bottom = Math.max(row.bottom, bottom ? bottom.pct : 0);
    if (mean.pct >= row.mean) Object.assign(row, { mean: mean.pct, texts: mean.texts, covered: mean.covered });
    for (const [who, n] of Object.entries(mean.by)) row.by[who] = Math.max(row.by[who] || 0, n);
    coverRows.set(key, row);
  }
  if (coverRows.size) {
    console.log("\n고정 요소 가림(참고, 실패 아님) — 화면 폭: 맨 위 % / 끝까지 내림 % / 다섯 곳 평균 %(덮인 글자/본 글자) · 주로 덮는 층(다섯 곳 합)");
    for (const row of coverRows.values()) {
      const who = Object.entries(row.by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${name} ${n}`).join(", ");
      console.log(`  ${row.page.padEnd(12)} ${String(row.width).padStart(4)}  ${String(row.top).padStart(5)}% / ${String(row.bottom).padStart(5)}% / ${String(row.mean).padStart(5)}% (${row.covered}/${row.texts})  ${who || "-"}`);
    }
  }
  if (state.external.size) console.log(`\n끊은 바깥 요청 ${state.external.size}개: ${[...state.external].slice(0, 5).join(" , ")}`);
  if (state.errors.length) console.log(`\n앱 응답 오류 ${state.errors.length}건: ${state.errors.slice(0, 5).join(" | ")}`);
  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  report.external = [...state.external];
  report.appErrors = state.errors;
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
  console.log(`\n결과 폴더: ${OUT}${SHOTS ? " (shots/ 에 PNG)" : ""} · report.json`);
  process.exit(failures ? 1 : 0);
}

await main();
