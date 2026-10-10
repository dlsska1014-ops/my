// V22.9.18 — 화면을 실제 브라우저로 띄워 재는 도구 (저장소 하네스 밖, 사람이 돌린다).
//
// 구조 계측(HTML 문자열 검사)으로는 겹침·넘침·대비를 판정할 수 없다. 이 도구는
//   1) QA 픽스처로 화면을 렌더해 자산까지 정적 파일로 떨군 뒤(DB·서버 없음)
//   2) 설치된 Chrome 을 헤드리스로 띄워 DevTools 를 **파이프**로 구동한다(포트·네트워크 없음)
//   3) 390px 모바일 에뮬레이션에서 라이트·다크마다
//      - 화면 폭(390px)을 넘는 요소 — 모바일은 넘침만큼 배치 폭이 넓어져 글자가 작아진다
//      - WCAG AA 대비(본문 4.5:1, 큰 글자 3:1) 미달 글자
//      - 32px 미만 터치 대상(참고용, 실패로 치지 않는다)
//     을 재고, 원하면 전체 화면 PNG 를 남긴다.
//
// 사용: node tools/screen-audit.mjs [--out 폴더] [--pages home,reports] [--schemes light,dark]
//                                    [--width 390] [--shots]
//   CHROME_PATH 로 브라우저 경로를 바꿀 수 있다. 넘침·대비 미달이 있으면 종료 코드 1.
//
// 헤드리스 새 모드는 창 폭을 500px 밑으로 줄이지 않는다. --window-size 로는 390px 을 잴 수
// 없어서 Emulation.setDeviceMetricsOverride 로 폭을 준다.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { pathToFileURL } from "node:url";
import app from "../src/index.js";
import { createV2265QaFixture } from "../validation/qa-fixture.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const OUT = resolve(flag("out", join(tmpdir(), "ab-screen-audit")));
const INTERACTIONS = args.includes("interactions") || args.includes("--interactions");
function assertChildPath(root, target) {
  const rel = relative(resolve(root), resolve(target));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("unsafe audit output path");
}
const WIDTH = Number(flag("width", "390"));
const SCHEMES = flag("schemes", "light,dark").split(",");
const SHOTS = args.includes("--shots");
const ORIGIN = "https://malhaebook.com";
const H = "household_id=house-home";
const ALL_PAGES = {
  home: `/app?${H}`,
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

// ── 1. 픽스처 화면을 정적 파일로 ─────────────────────────────────────────────
// 픽스처 거래가 2026-07 에 있어 "지금"을 7월 중순으로 고정한다(V22.9.17 검증 전용 시계).
async function renderSnapshot(dir) {
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
  const fixture = await createV2265QaFixture();
  const assets = new Set();
  const localAssets = (text) => text.replace(/(["'(=\s])\/assets\//g, (_m, p) => `${p}assets/`);
  assertChildPath(OUT, dir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  try {
    for (const name of PAGES) {
      const response = await app.fetch(new Request(ORIGIN + ALL_PAGES[name], {
        headers: { ...(LOGGED_OUT_PAGES.has(name) ? {} : { cookie: fixture.cookie }), "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" },
      }), fixture.env, { waitUntil() {} });
      let html = await response.text();
      if (response.status !== 200) throw new Error(`${name} ${ALL_PAGES[name]} → ${response.status}`);
      for (const match of html.matchAll(/\/assets\/([A-Za-z0-9._-]+)/g)) assets.add(match[1]);
      writeFileSync(join(dir, `${name}.html`), localAssets(html));
    }
    for (const asset of assets) {
      const response = await app.fetch(new Request(`${ORIGIN}/assets/${asset}`), fixture.env, { waitUntil() {} });
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(join(dir, "assets", asset), /\.(css|js|mjs)$/.test(asset) ? localAssets(bytes.toString("utf8")).replace(/url\(\/assets\//g, "url(") : bytes);
    }
  } finally {
    fixture.restore();
    delete globalThis.__AB_QA_FIXED_NOW_MS;
  }
}

// ── 2. 페이지 안에서 재는 식 ────────────────────────────────────────────────
const MEASURE = `(() => {
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

// ── 3. DevTools 파이프 ──────────────────────────────────────────────────────
function openBrowser(chromePath, profileDir) {
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-pipe", "--allow-file-access-from-files", `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const writer = chrome.stdio[3], reader = chrome.stdio[4];
  let seq = 0, buffer = "";
  const pending = new Map();
  reader.on("data", (chunk) => {
    buffer += chunk.toString();
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const waiter = message.id && pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    seq += 1;
    pending.set(seq, { resolve, reject });
    writer.write(JSON.stringify({ id: seq, method, params, sessionId }) + "\0");
  });
  return { send, close: () => chrome.kill() };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("Chrome/Edge 를 찾지 못했습니다. CHROME_PATH 로 경로를 알려 주세요.");
    process.exit(2);
  }
  const snapDir = join(OUT, "snap");
  await renderSnapshot(snapDir);
  if (SHOTS) mkdirSync(join(OUT, "shots"), { recursive: true });

  const browser = openBrowser(chromePath, join(OUT, "chrome-profile"));
  let failures = 0;
  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => browser.send(method, params, sessionId);
    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 1, mobile: WIDTH < 700 });
    for (const scheme of SCHEMES) {
      // 다크는 OS 설정이 아니라 앱 설정(localStorage)으로 켜진다 — 테마 스크립트가 읽는 키를 미리 넣는다.
      const { identifier } = await page("Page.addScriptToEvaluateOnNewDocument", {
        source: `try{localStorage.setItem("ab:appearance:theme",${JSON.stringify(scheme)})}catch(e){}`,
      });
      for (const name of PAGES) {
        await page("Page.navigate", { url: pathToFileURL(join(snapDir, `${name}.html`)).href });
        await wait(1500);
        if (INTERACTIONS) await auditInteractions(page, name);
        const { result } = await page("Runtime.evaluate", { expression: MEASURE, returnByValue: true });
        const m = result.value;
        const widened = m.layoutWidth > WIDTH;
        const bad = widened || m.overflow.length || m.contrast.length;
        if (bad) failures += 1;
        console.log(`${bad ? "FAIL" : "ok  "} ${name.padEnd(12)} ${scheme.padEnd(5)} 배치폭 ${m.layoutWidth}px · 높이 ${m.docHeight}px · 넘침 ${m.overflow.length} · 대비미달 ${m.contrast.length} · 작은 터치 ${m.small.length}`);
        for (const line of m.overflow) console.log(`       넘침  ${line}`);
        for (const line of m.contrast) console.log(`       대비  ${line}`);
        if (SHOTS) {
          const height = Math.min(m.docHeight, 8000);
          const shot = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 } });
          writeFileSync(join(OUT, "shots", `${name}-${scheme}-${WIDTH}.png`), Buffer.from(shot.data, "base64"));
        }
      }
      await page("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  } finally {
    browser.close();
  }
  console.log(`\n결과 폴더: ${OUT}${SHOTS ? " (shots/ 에 PNG)" : ""}`);
  process.exit(failures ? 1 : 0);
}

await main();
