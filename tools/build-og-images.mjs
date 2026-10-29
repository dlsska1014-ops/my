#!/usr/bin/env node
// V22.9.87 (디자인 작업 지시서 T-22): 공유 미리보기 이미지(og:image, 1200×630 PNG)를 만들어 src/modules/assets/og-image.js 에
// base64 로 담는다. 원본 PNG 는 저장소에 두지 않는다 — 이 파일이 다시 만드는 방법이다(tools/build-icons.mjs 와 같은 방식).
//
//   1) 도구를 받는다(저장소에는 의존성을 설치하지 않는다. 저장소 밖 아무 폴더):
//        mkdir -p sharp-tool && cd sharp-tool && echo '{"private":true}' > package.json && npm install sharp@0.35.5 --ignore-scripts --save-exact && cd ..
//          sharp-0.35.5.tgz sha256 3b6bbbe6b308f5c383938ca4a31926cd5d79c4651ed8c5fda16a97da2014a9ac  (Apache-2.0, 2026-09-27 게시)
//          레지스트리 dist.integrity sha512-Ywn4OnzGukp7CDMrp08RQ50YKmuwG47brZgIVPTvBaaAfQlRlygrRqSrxdCiL9M+LlzLBiJ68IR1QqvzHyjC7g==
//        Windows 에서는 미리 빌드한 libvips 8.18.7 이 든 @img/sharp-win32-x64@0.35.5 가 같이 온다(Apache-2.0 AND LGPL-3.0-or-later).
//          sharp-win32-x64-0.35.5.tgz sha256 16a804181ddd258ca6fe7079b2faa0c0356654c9db3d93ab0a80ec5e5161c3d4
//          레지스트리 dist.integrity sha512-x76eH0vEiHlcMQu8Y8IenntaACtddpT6W0wmXtWrnKcnKI7ME5DdgqhAD6SEWOEl1v2zDvkZDhFA9KnURwpfqg==
//   2) node tools/build-og-images.mjs sharp-tool [--chrome <chrome 실행 파일>] [--png <검토용 PNG 경로>] [--check]
//      카드 HTML(아래 ogCardHtml)을 로컬 headless Chrome 이 1200×630·배율 1 로 그리고(DevTools 파이프, 서버·망 없음),
//      sharp 가 팔레트 PNG 로 줄인다. --png 는 같은 PNG 를 저장소 밖에 하나 더 쓴다. --check 는 파일을 쓰지 않고 지금 파일과 같은지만 본다.
//   3) 나온 파일의 SHA-256 이 validation/validate-public-brand-v22987.mjs 에 고정된 값과 같아야 한다.
//      글자는 설치된 ‘Noto Sans KR’ 로만 그린다(다른 글꼴이 섞이면 멈춘다). 글자 래스터는 Chrome 판에 따라 달라질 수 있어 그린 판을
//      생성 파일 머리에 적는다. 다른 판에서 바이트가 달라지면 그 판으로 다시 만들고 검사의 고정값을 새로 적는다.
// sharp 는 이 판을 만든 날(2026-10-29) 최신인 0.35.5(게시 뒤 2주 넘음)만 쓴다. 다른 판이거나 libvips 판이 다르면 멈춘다.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AB_CATEGORY_ICON_PATHS, AB_UI_ICON_PATHS } from "../src/modules/assets/icon-paths.js";

export const SHARP_VERSION = "0.35.5";
export const LIBVIPS_VERSION = "8.18.7";
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_FONT = "Noto Sans KR";
// 1년 캐시 주소다. 그림이 바뀌면 판 번호를 올린다(1년 캐시 자산과 같은 규칙).
export const OG_IMAGE_PATH = "/assets/og-malhaebook-v22987.png";
export const OG_IMAGE_ALT = "말해가계부 장부 마크와 ‘말한 기록이, 함께 보는 생활비가 됩니다’ 문구, 가상 데이터로 그린 웹 가계부 홈 화면 일부";
// 팔레트 PNG(256색, 품질 100): 바탕·카드가 단색이라 팔레트로도 글자 가장자리가 거의 그대로다. 이미지당 Worker 증가 100 KB(base64) 안에 둔다.
// (libvips 는 팔레트 비트 깊이를 1·2·4·8 로만 쓰므로 17~256 사이 색 수는 모두 8비트 256색과 같은 결과다.)
export const PNG_OPTIONS = Object.freeze({ palette: true, colors: 256, quality: 100, effort: 10, compressionLevel: 9, dither: 1 });
// 장부 마크: 앱 메뉴 아이콘(web/unified-nav.js)·공개 머리 로고(public/site-config.js ledgerMarkSvg)와 같은 rect·path(검사가 맞춰 본다).
export const LEDGER_MARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 3.5v17M11 8h5M11 12h5M11 16h3"/></svg>';

const OUT = fileURLToPath(new URL("../src/modules/assets/og-image.js", import.meta.url));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// assets/icon-mask-css.js iconMaskUrl 과 같은 data: SVG 마스크(선 굵기 2·둥근 끝).
const maskUrl = (d) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${d}'/%3E%3C/svg%3E")`;

export function checkToolVersions(versions = {}) {
  if (versions.sharp !== SHARP_VERSION) throw new Error(`sharp ${SHARP_VERSION} 만 씁니다(받은 판 ${versions.sharp || "없음"}). 머리의 1) 대로 sharp@${SHARP_VERSION} 를 받으세요.`);
  if (versions.vips !== LIBVIPS_VERSION) throw new Error(`libvips ${LIBVIPS_VERSION} 만 씁니다(받은 판 ${versions.vips || "없음"}). sharp ${SHARP_VERSION} 의 미리 빌드한 libvips 를 쓰세요.`);
  return true;
}

// 카드: 왼쪽에 장부 마크·이름과 한 줄(공개 첫 화면 제목), 오른쪽에 앱 홈 화면 미리보기 일부(공개 첫 화면 미리보기와 같은 가상 값·색).
// 미리보기 값은 public/content-pages.js publicAppPreviewHtml(T-21)과 같고(거래는 앞 두 행), 크기만 1200 폭에 맞게 키웠다. 화면 판은 아래 끝에서 잘린다.
export function ogCardHtml() {
  const cat = (key, bg, ink) => `.c-${key}{background:${bg}}.c-${key} i{background:${ink};mask:${maskUrl(AB_CATEGORY_ICON_PATHS[key])} center/contain no-repeat}`;
  const row = (key, title, line, amount) => `<div class="row"><span class="cat c-${key}"><i></i></span><div><b>${title}</b><span>${line}</span></div><strong>${amount}</strong></div>`;
  const css = `*{box-sizing:border-box}html,body{margin:0;padding:0}`
    + `body{position:relative;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;background:#e8f3ff;color:#191f28;font-family:"${OG_FONT}";letter-spacing:-.01em}`
    + `.brand{position:absolute;left:80px;top:78px;display:flex;align-items:center;gap:18px}.mark{display:grid;place-items:center;width:76px;height:76px;border-radius:22px;background:#3182f6}`
    + `.mark svg{width:44px;height:44px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.brand b{font-size:42px;font-weight:800;letter-spacing:-.03em}`
    + `.line{position:absolute;left:80px;top:244px;width:580px;margin:0;font-size:54px;font-weight:800;line-height:1.32;letter-spacing:-.045em}`
    + `.site{position:absolute;left:80px;bottom:74px;margin:0;color:#4e5968;font-size:26px;font-weight:700;letter-spacing:0}`
    + `.screen{position:absolute;left:684px;top:70px;display:grid;gap:12px;width:452px;height:620px;align-content:start;padding:16px;border:1px solid #cfe0fb;border-radius:34px;background:#f2f4f6}`
    + `.card{padding:22px;border:1px solid #e9ebee;border-radius:22px;background:#fff}.top{display:flex;align-items:center;justify-content:space-between;gap:10px}`
    + `.top span{color:#5f6b7a;font-size:16px;font-weight:800}.top em{padding:6px 12px;border-radius:999px;background:#e8f3ff;color:#1b64da;font-size:15px;font-style:normal;font-weight:900}`
    + `.amount{margin:12px 0 14px;line-height:1.2}.amount b{font-size:46px;font-weight:900;letter-spacing:-.05em}.amount small{margin-left:5px;color:#5f6b7a;font-size:17px;font-weight:800}`
    + `.bar{position:relative;height:14px;border-radius:999px;background:#edf0f3}.bar i{display:block;width:20%;height:100%;border-radius:999px;background:#1d4ed8}`
    + `.bar:after{content:"";position:absolute;top:50%;left:39%;width:3px;height:26px;border-radius:2px;background:#191f28;transform:translate(-50%,-50%)}`
    + `.foot{display:flex;justify-content:space-between;margin-top:12px;color:#5f6b7a;font-size:14.5px;font-weight:800}`
    + `.pace{display:flex;gap:10px;margin:14px 0 0;padding:13px 14px;border-radius:16px;background:#e8f3ff;font-size:15.5px;font-weight:700;line-height:1.5}`
    + `.pace:before{content:"";flex:none;width:22px;height:22px;margin-top:2px;background:#1d4ed8;mask:${maskUrl(AB_UI_ICON_PATHS.clock)} center/contain no-repeat}.pace p{flex:1 1 0;min-width:0;margin:0}.pace b{font-weight:800}`
    + `.row{display:flex;align-items:center;gap:14px;padding:15px 18px;border:1px solid #e8edf4;border-radius:22px;background:#fff}.row div{flex:1 1 auto;min-width:0}`
    + `.row b{display:block;font-size:19px;font-weight:700;line-height:1.45}.row span{display:block;margin-top:2px;color:#687385;font-size:14.5px;line-height:1.45}`
    + `.row strong{font-size:19px;font-weight:700;white-space:nowrap}`
    + `.cat{display:grid;place-items:center;flex:none;width:50px;height:50px;border-radius:50%}.cat i{display:block;width:25px;height:25px}`
    + cat("food", "#fff1e6", "#c2410c") + cat("cafe", "#f8efe2", "#8a4b0f");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>og</title><style>${css}</style></head><body>`
    + `<div class="brand"><span class="mark">${LEDGER_MARK_SVG}</span><b>말해가계부</b></div>`
    + `<p class="line">말한 기록이,<br>함께 보는 생활비가 됩니다</p><p class="site">malhaebook.com</p>`
    + `<div class="screen"><section class="card"><div class="top"><span>이번 달 쓸 수 있는 돈</span><em>예산 사용률 20%</em></div>`
    + `<div class="amount"><b>981,400</b><small>원</small></div><div class="bar"><i></i></div>`
    + `<div class="foot"><span>전체 예산 1,230,000원</span><span>지출 248,600원</span></div>`
    + `<div class="pace"><p>이번 달의 39%가 지났고 예산은 20%만 썼어요. 하루 <b>49,070</b>원씩 쓰면 돼요.</p></div></section>`
    + row("food", "점심", "식비 · 국민카드", "-12,000원") + row("cafe", "가족 카페", "카페/간식 · 카카오페이", "-28,600원") + `</div></body></html>`;
}

function findChrome() {
  return [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .filter(Boolean).find((path) => existsSync(path));
}

// tools/screen-audit.mjs openBrowser 와 같은 DevTools 파이프 연결. 망은 막는다(카드에는 바깥 자원이 없다).
function openChrome(chromePath, profileDir) {
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", `--user-data-dir=${profileDir}`,
    "--force-device-scale-factor=1", "--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text",
    "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-pings", "--host-resolver-rules=MAP * ~NOTFOUND", "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const writer = chrome.stdio[3], reader = chrome.stdio[4];
  const exited = new Promise((done) => chrome.on("exit", done));
  let seq = 0, buffer = "";
  const pending = new Map();
  const failAll = (reason) => { for (const waiter of pending.values()) waiter.reject(new Error(reason)); pending.clear(); };
  chrome.on("error", (error) => failAll(`Chrome 실행 실패: ${error.message}`));
  chrome.on("exit", (code) => failAll(`Chrome 이 끝났습니다(${code})`));
  writer.on("error", () => {});
  reader.on("data", (chunk) => {
    buffer += chunk.toString();
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const waiter = message.id ? pending.get(message.id) : null;
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
    seq += 1;
    pending.set(seq, { resolve: done, reject: fail, method });
    writer.write(JSON.stringify({ id: seq, method, params, sessionId }) + "\0");
  });
  return { send, close: async () => { try { chrome.kill(); } catch (_) {} await Promise.race([exited, new Promise((done) => setTimeout(done, 3000))]); } };
}

// 카드를 그려 PNG(Chrome 원본)와 쓴 글꼴·Chrome 판을 돌려준다. 글꼴이 OG_FONT 하나가 아니거나 글자가 칸을 넘치면 멈춘다.
export async function renderCard(chromePath, html = ogCardHtml()) {
  if (!chromePath || !existsSync(chromePath)) throw new Error("Chrome 을 찾지 못했습니다. --chrome 으로 실행 파일을 알려 주세요.");
  const profile = mkdtempSync(join(tmpdir(), "ab-og-"));
  const browser = openChrome(chromePath, profile);
  try {
    const { product } = await browser.send("Browser.getVersion");
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => browser.send(method, params, sessionId);
    await page("Page.enable");
    await page("DOM.enable");
    await page("CSS.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: OG_WIDTH, height: OG_HEIGHT, deviceScaleFactor: 1, mobile: false });
    const { frameTree } = await page("Page.getFrameTree");
    await page("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    const probe = `document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const lines = (selector) => { const el = document.querySelector(selector); const style = getComputedStyle(el); return Math.round((el.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight)); };
      const rows = [...document.querySelectorAll(".row")].map((row) => row.querySelector("div").scrollWidth <= row.querySelector("div").clientWidth);
      done(JSON.stringify({ width: document.documentElement.scrollWidth, line: lines(".line"), pace: lines(".pace p"), copyRight: Math.max(box(".line").right, box(".brand").right, box(".site").right), screenLeft: box(".screen").left, rows }));
    }))))`;
    const evaluated = await page("Runtime.evaluate", { expression: probe, awaitPromise: true, returnByValue: true });
    if (evaluated.exceptionDetails) throw new Error(`카드 측정 실패: ${evaluated.exceptionDetails.text}`);
    const layout = JSON.parse(evaluated.result.value);
    if (layout.width !== OG_WIDTH || layout.line !== 2 || layout.pace > 2 || layout.copyRight > layout.screenLeft - 16 || !layout.rows.every(Boolean)) {
      throw new Error(`카드 배치가 어긋났습니다: ${JSON.stringify(layout)}`);
    }
    const { root } = await page("DOM.getDocument", { depth: -1 });
    const { nodeIds } = await page("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "body *" });
    const fonts = new Set();
    for (const nodeId of nodeIds) for (const font of (await page("CSS.getPlatformFontsForNode", { nodeId })).fonts) fonts.add(font.familyName);
    if (fonts.size !== 1 || !fonts.has(OG_FONT)) throw new Error(`글자를 ‘${OG_FONT}’ 로만 그려야 합니다(쓴 글꼴: ${[...fonts].join(", ") || "없음"}). 글꼴을 설치하세요.`);
    const shot = await page("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT, scale: 1 }, captureBeyondViewport: false, fromSurface: true });
    return { png: Buffer.from(shot.data, "base64"), chrome: product, fonts: [...fonts], layout };
  } finally {
    await browser.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
}

export function loadSharp(sharpDir) {
  const manifest = join(sharpDir, "node_modules", "sharp", "package.json");
  if (!existsSync(manifest)) throw new Error(`${sharpDir} 에 sharp 가 없습니다. 머리의 1) 대로 받으세요.`);
  const declared = JSON.parse(readFileSync(manifest, "utf8")).version;
  checkToolVersions({ sharp: declared, vips: LIBVIPS_VERSION });
  const sharp = createRequire(join(sharpDir, "package.json"))("sharp");
  checkToolVersions(sharp.versions);
  return sharp;
}

// annotate-modules.mjs 의 formatList 와 같은 줄 나눔(100자). 생성 파일을 annotate 가 다시 쓰지 않게 한다.
function formatList(keyword, names, tail) {
  const single = `${keyword} { ${names.join(", ")} }${tail}`;
  if (single.length <= 100) return single;
  const lines = [];
  let line = "";
  for (const name of names) {
    const next = line ? `${line}, ${name}` : name;
    if (line && `  ${next},`.length > 100) { lines.push(`  ${line},`); line = name; } else line = next;
  }
  if (line) lines.push(`  ${line},`);
  return `${keyword} {\n${lines.join("\n")}\n}${tail}`;
}

export function ogModuleText({ png, chrome, fonts, sharpVersions }) {
  const names = ["AB_OG_IMAGE_ALT", "AB_OG_IMAGE_HEIGHT", "AB_OG_IMAGE_PATH", "AB_OG_IMAGE_PNG_BASE64", "AB_OG_IMAGE_WIDTH"];
  return [
    "// 생성 파일이다 — 손으로 고치지 않는다. 다시 만드는 법은 tools/build-og-images.mjs 머리에 있다.",
    "// V22.9.87 (디자인 작업 지시서 T-22): 공유 미리보기 이미지(og:image). 장부 마크 + 한 줄 + 앱 홈 화면 미리보기 일부, 1200×630 PNG.",
    "// 공개 페이지 머리(public/content-pages.js)의 og:image 가 이 주소를 가리키고, assets/icons-manifest.js 가 1년 캐시(immutable)로 내려보낸다.",
    `// 카드 HTML SHA-256 ${sha256(ogCardHtml())} · 그림 ${chrome} (headless, 배율 1) · 글꼴 ${fonts.join(", ")}`,
    `// 줄임 sharp ${sharpVersions.sharp} (libvips ${sharpVersions.vips}) 팔레트 ${PNG_OPTIONS.colors}색 · PNG ${png.length} B · SHA-256 ${sha256(png)}`,
    `const AB_OG_IMAGE_PATH = ${JSON.stringify(OG_IMAGE_PATH)};`,
    `const AB_OG_IMAGE_WIDTH = ${OG_WIDTH};`,
    `const AB_OG_IMAGE_HEIGHT = ${OG_HEIGHT};`,
    `const AB_OG_IMAGE_ALT = ${JSON.stringify(OG_IMAGE_ALT)};`,
    `const AB_OG_IMAGE_PNG_BASE64 = "${png.toString("base64")}";`,
    "// @build:exports-start",
    formatList("export", names, ";"),
    "// @build:exports-end",
    "",
  ].join("\n");
}

export async function buildOgImage(sharpDir, chromePath = findChrome()) {
  const sharp = loadSharp(sharpDir);
  const card = await renderCard(chromePath);
  const png = await sharp(card.png).png(PNG_OPTIONS).toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.format !== "png" || meta.width !== OG_WIDTH || meta.height !== OG_HEIGHT) throw new Error(`PNG 크기가 다릅니다: ${meta.format} ${meta.width}×${meta.height}`);
  return { png, text: ogModuleText({ png, chrome: card.chrome, fonts: card.fonts, sharpVersions: sharp.versions }), card };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const sharpDir = resolve(args.find((arg, index) => !arg.startsWith("--") && !["--chrome", "--png"].includes(args[index - 1])) || "sharp-tool");
  const { png, text, card } = await buildOgImage(sharpDir, option("--chrome") || findChrome());
  const pngPath = option("--png");
  if (pngPath) writeFileSync(resolve(pngPath), png);
  const summary = `og-image.js ${Buffer.byteLength(text)} B sha256 ${sha256(text)} · PNG ${png.length} B sha256 ${sha256(png)} · ${card.chrome} · ${card.fonts.join(", ")}`;
  if (args.includes("--check")) {
    const same = existsSync(OUT) && readFileSync(OUT, "utf8") === text;
    console.log(`${same ? "같음" : "다름"}: ${summary}`);
    process.exitCode = same ? 0 : 1;
  } else {
    writeFileSync(OUT, text);
    console.log(summary);
  }
}
