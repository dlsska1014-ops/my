#!/usr/bin/env node
// V22.9.146 (애드센스 마지막 신청 계획 B4 — 실제 화면): 예시 데이터로 찍은 실제 웹 가계부 화면 네 장을 만들어
// src/modules/assets/real-screens-images-v229146.js 에 base64 로 담는다. 원본 그림은 저장소에 두지 않는다 — 이 파일이 다시 만드는 방법이다
// (tools/build-og-images.mjs 와 같은 방식). 의존성은 없다(Node 내장 모듈 + 설치된 Chrome).
//
//   node tools/build-real-screens.mjs [--chrome <chrome 실행 파일>] [--keep <검토용 사진 폴더>] [--check]
//
//   1) QA 픽스처(validation/lib-audit-v22934.mjs — 운영 DB·망 없음)를 열고 src/modules/public/real-screens-scenario-v229146.js 의 문장을
//      실제 봇 경로(/skill)로 보낸다. 문장마다 그 시나리오의 날 정오(KST)로 시계를 맞춘다. 픽스처 표에서 바꾸는 것은 가계부 이름 두 개뿐이다
//      (웹에서 이름을 바꾼 것과 같은 값 — 봇으로는 이름을 바꾸는 명령이 없다).
//   2) 단톡방 봇 답의 [웹 가계부 열기] 링크에 카카오가 붙이는 사용자 키(botUserKey·botGroupKey·appUserId)를 붙여 열고, 받은 세션으로
//      127.0.0.1 중계(app.fetch) 뒤의 머리 없는 Chrome 이 화면을 연다. Chrome 은 127.0.0.1 밖 이름을 풀지 못하고(--host-resolver-rules),
//      중계는 바깥 주소로 넘기는 응답을 끊는다(바깥으로 나가려 한 응답이 하나라도 있으면 멈춘다).
//   3) 휴대폰 폭 390×844 · 배율 2 · 밝은 테마 · 움직임 줄이기 · 브라우저 시계도 같은 날 정오로 두고 화면을 찍어 WebP(품질 80, Chrome 이
//      직접 만든다)로 담는다. --keep 은 같은 사진을 저장소 밖 폴더에 하나 더 쓴다. --check 는 파일을 쓰지 않고 지금 파일과 같은지만 본다.
//      글자 래스터는 Chrome 판·설치된 글꼴에 따라 달라질 수 있어 그린 판을 생성 파일 머리에 적는다. 다른 판에서 바이트가 달라지면 그 판으로
//      다시 만들고 검사(validation/validate-v229146-real-screens.mjs)가 쓰는 값은 생성 파일에서 바로 읽으므로 따로 고칠 곳은 없다.
//   사진을 바꾸면(시나리오·화면이 바뀌어 다시 찍으면) 주소의 판 번호(-v229146)를 올린다 — 1년 캐시(immutable) 주소다.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripBuildBlocks } from "./build-worker.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "src/modules/assets/real-screens-images-v229146.js");
const SCENARIO_FILE = join(ROOT, "src/modules/public/real-screens-scenario-v229146.js");
export const SHOT_WIDTH = 390;
export const SHOT_HEIGHT = 844;
export const SHOT_SCALE = 2;
export const WEBP_QUALITY = 80;
export const ASSET_VERSION = "v229146";

const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ""; };
const CHECK = args.includes("--check");
const KEEP = argValue("--keep") ? resolve(argValue("--keep")) : "";

function findChrome() {
  const fromArg = argValue("--chrome");
  const candidates = [fromArg, process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("Chrome 을 찾지 못했습니다(--chrome 으로 알려 주세요)");
  return found;
}

// 머리 없는 Chrome 을 DevTools 파이프로 연다(tools/screen-audit.mjs 의 openBrowser 와 같은 방식, 127.0.0.1 밖 이름 풀이 막음).
function openBrowser(chromePath, profileDir) {
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--lang=ko-KR",
    "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--remote-debugging-pipe", `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const writer = chrome.stdio[3], reader = chrome.stdio[4];
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
      if (!message.id) continue;
      const waiter = pending.get(message.id);
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
  return { send, close: () => { try { chrome.kill(); } catch (_) {} } };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const noonMs = (ymd) => Date.parse(`${ymd}T12:00:00+09:00`);
const hex66 = (label) => createHash("sha256").update(`real-screens-${label}`).digest("hex") + "ab";
const PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

// 시나리오 파일의 SHA-256 — 빌드가 다시 쓰는 import/export 블록(@build:…)은 빼고 센다(다른 모듈이 읽는 이름이 바뀌어도 사진은 그대로다).
// 생성 파일 머리에 적고, 검사가 지금 시나리오 파일과 대조한다(문장·기대값을 바꾸면 사진을 다시 찍어야 한다).
export function realScreensScenarioHash(text) {
  return sha256(stripBuildBlocks(String(text)));
}

// 화면마다: 연 주소와 찍기 전에 맞출 위치(그 글이 든 제목을 화면 위쪽 72px 에 둔다, 없으면 맨 위). 검사도 같은 주소를 연다.
export const SHOTS = [
  { key: "home", target: "personal", path: (ids) => `/app?household_id=${ids.personal}`, scrollTo: "" },
  { key: "list", target: "personal", path: (ids) => `/app?month=2026-11&household_id=${ids.personal}&tab=transactions`, scrollTo: "" },
  { key: "room", target: "room", path: (ids) => `/app?month=2026-11&household_id=${ids.room}&tab=transactions`, scrollTo: "" },
  { key: "settle", target: "room", path: (ids) => `/settlement-summary?month=2026-11&household_id=${ids.room}`, scrollTo: "송금 횟수를 줄인 제안" },
];

// 시나리오 문장을 실제 봇 경로(/skill)로 보내 픽스처에 가계부 두 개(1:1 개인·단톡방)를 만든다. 사진을 찍는 main 과
// 검사(validation/validate-v229146-real-screens.mjs)가 같은 함수를 쓴다. 문장마다 시계(globalThis.__AB_QA_FIXED_NOW_MS)를 그날 정오로 두고,
// 끝나면 찍는 날(REAL_SCREENS_CLOCK_V229146) 정오로 둔다 — 원래 시계로 되돌리는 일은 부르는 쪽이 한다.
// 돌려주는 것: ids(personal·room 가계부 id), cookie(단톡방 [웹 가계부 열기] 링크에 카카오 사용자 키를 붙여 연 세션), replies(문장마다
// { scope, message, body }), keys(구성원 키), room(방 키), say(더 보낼 문장 — (글, 구성원 번호, 방이면 true)).
export async function seedRealScreensScenario(audit, fx, scenario) {
  const { app, BASE } = audit;
  const { REAL_SCREENS_CLOCK_V229146: CLOCK, REAL_SCREENS_PERSONAL_V229146: PERSONAL, REAL_SCREENS_ROOM_V229146: ROOM_SCENARIO } = scenario;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(CLOCK || ""))) throw new Error("시나리오 시계(REAL_SCREENS_CLOCK_V229146)를 읽지 못했습니다");
  const SECRET = "real-screens-secret";
  const ROOM = hex66("room");
  const KEYS = ROOM_SCENARIO.members.map((_, i) => hex66(`member-${i}`));
  const ctx = () => { const jobs = []; return { jobs, waitUntil(job) { jobs.push(job); }, passThroughOnException() {} }; };
  const say = async (utterance, user, room) => {
    const c = ctx();
    const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
    if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }) }), fx.env, c);
    const body = await response.json();
    for (let i = 0; i < 5 && c.jobs.length; i += 1) await Promise.allSettled(c.jobs.splice(0));
    return body;
  };
  const linkOf = (body) => {
    for (const output of body?.template?.outputs || []) for (const card of [output.textCard, output.basicCard].filter(Boolean)) for (const button of card.buttons || []) if (/\/(my|app)\b/.test(button.webLinkUrl || "")) return button.webLinkUrl;
    return "";
  };
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" });
  const replies = [];
  for (const message of PERSONAL.messages) {
    globalThis.__AB_QA_FIXED_NOW_MS = noonMs(message.day);
    replies.push({ scope: "personal", message, body: await say(message.text, KEYS[0], null) });
  }
  for (const message of ROOM_SCENARIO.messages) {
    globalThis.__AB_QA_FIXED_NOW_MS = noonMs(message.day);
    replies.push({ scope: "room", message, body: await say(message.text, KEYS[message.who], ROOM) });
  }
  globalThis.__AB_QA_FIXED_NOW_MS = noonMs(CLOCK);
  const roomLink = linkOf(await say("@말해가계부 웹 가계부 열기", KEYS[0], ROOM));
  if (!roomLink) throw new Error("단톡방 [웹 가계부 열기] 링크가 없습니다");
  const open = new URL(roomLink);
  open.searchParams.set("botUserKey", KEYS[0]);
  open.searchParams.set("botGroupKey", ROOM);
  open.searchParams.set("appUserId", "1");
  const opened = await app.fetch(new Request(open.toString(), { headers: { "user-agent": PHONE, accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-site": "none" } }), fx.env, ctx());
  const cookie = (opened.headers.getSetCookie().find((value) => /^ab_user=[^;]/.test(value)) || "").split(";")[0];
  if (!cookie) throw new Error(`웹 가계부 링크가 세션을 주지 않았습니다(${opened.status})`);
  const owner = fx.db.users.find((user) => user.kakao_user_key === KEYS[0]);
  const roomId = open.searchParams.get("room");
  const personalId = (fx.db.household_members.find((row) => row.user_id === owner?.id && row.household_id !== roomId && row.role === "owner") || {}).household_id;
  if (!roomId || !personalId) throw new Error("가계부를 찾지 못했습니다");
  for (const [id, name] of [[personalId, PERSONAL.householdName], [roomId, ROOM_SCENARIO.householdName]]) {
    const row = fx.db.households.find((house) => house.id === id);
    if (!row) throw new Error(`가계부 ${id} 없음`);
    row.name = name;
  }
  globalThis.__AB_EFFECTIVE_USER_CACHE?.clear?.();
  return { ids: { personal: personalId, room: roomId }, cookie, replies, keys: KEYS, room: ROOM, say: (text, who = 0, inRoom = false) => say(text, KEYS[who], inRoom ? ROOM : null) };
}

async function main() {
  const scenario = await import(pathToFileURL(SCENARIO_FILE).href);
  const { REAL_SCREENS_CLOCK_V229146: CLOCK, REAL_SCREENS_ROOM_V229146: ROOM_SCENARIO } = scenario;
  const scenarioHash = realScreensScenarioHash(readFileSync(SCENARIO_FILE, "utf8"));
  const audit = await import(pathToFileURL(join(ROOT, "validation/lib-audit-v22934.mjs")).href);
  const { app, BASE } = audit;
  const ctx = () => { const jobs = []; return { jobs, waitUntil(job) { jobs.push(job); }, passThroughOnException() {} }; };
  const firstLine = (body) => String(body?.template?.outputs?.find((o) => o.simpleText)?.simpleText?.text || body?.template?.outputs?.[0]?.textCard?.title || "").split("\n").find((line) => line.trim()) || "";
  const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
  const shots = [];
  try {
    await audit.fixture(async (fx) => {
      const { ids, cookie, replies } = await seedRealScreensScenario(audit, fx, scenario);
      for (const { scope, message, body } of replies) console.log(`${scope === "room" ? `방 ${message.day} ${ROOM_SCENARIO.members[message.who]}` : `1:1 ${message.day}`} «${message.text}» → ${firstLine(body)}`);

      let base = "";
      const offsite = [];
      const server = createServer(async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers(req.headers);
          headers.set("cookie", cookie);
          if (headers.has("origin")) headers.set("origin", BASE);
          const response = await app.fetch(new Request(`${BASE}${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), fx.env, ctx());
          const out = {};
          for (const [name, value] of response.headers) {
            if (name === "content-encoding" || name === "strict-transport-security" || name === "set-cookie") continue;
            if (name === "location" && /^https?:\/\//i.test(value) && !value.startsWith(BASE)) { offsite.push(value); res.writeHead(200, { "content-type": "text/plain" }); res.end("blocked"); return; }
            out[name] = name === "location" ? value.replace(BASE, base) : value;
          }
          res.writeHead(response.status, out);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) { res.writeHead(500); res.end(String(error)); }
      });
      await new Promise((done) => server.listen(0, "127.0.0.1", done));
      base = `http://127.0.0.1:${server.address().port}`;
      const profile = mkdtempSync(join(tmpdir(), "ab-real-screens-"));
      const browser = openBrowser(findChrome(), profile);
      try {
        const { product } = await browser.send("Browser.getVersion");
        for (const shot of SHOTS) {
          const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
          const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
          const cdp = (method, params) => browser.send(method, params, sessionId);
          const evaluate = async (source) => {
            const result = await cdp("Runtime.evaluate", { expression: source, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw new Error(String(result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 400));
            return result.result.value;
          };
          await cdp("Page.enable");
          await cdp("Runtime.enable");
          await cdp("Emulation.setDeviceMetricsOverride", { width: SHOT_WIDTH, height: SHOT_HEIGHT, deviceScaleFactor: SHOT_SCALE, mobile: true });
          await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
          await cdp("Emulation.setUserAgentOverride", { userAgent: PHONE, acceptLanguage: "ko-KR" });
          await cdp("Emulation.setTimezoneOverride", { timezoneId: "Asia/Seoul" });
          await cdp("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] });
          const fixed = noonMs(CLOCK);
          await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{try{localStorage.setItem('ab:appearance:theme','light')}catch(_){}const R=Date,s=performance.now(),f=${fixed};class D extends R{constructor(...a){a.length?super(...a):super(f+(performance.now()-s))}static now(){return f+(performance.now()-s)}}D.UTC=R.UTC;D.parse=R.parse;globalThis.Date=D;})()` });
          await cdp("Page.navigate", { url: base + shot.path(ids) });
          for (let i = 0; i < 100; i += 1) { if (await evaluate("document.readyState==='complete'&&!!document.body").catch(() => false)) break; await wait(100); }
          await evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
          if (shot.scrollTo) {
            const found = await evaluate(`(() => { const head = [...document.querySelectorAll('h1,h2,h3')].find((node) => node.textContent.trim() === ${JSON.stringify(shot.scrollTo)}); if (!head) return false; const box = (head.closest('section') || head).getBoundingClientRect(); window.scrollTo(0, Math.max(0, window.scrollY + box.top - 72)); return true; })()`);
            if (!found) throw new Error(`${shot.key}: ‘${shot.scrollTo}’ 제목이 없습니다`);
          }
          await wait(600);
          const where = await evaluate("({ title: document.title, url: location.pathname + location.search, docW: document.documentElement.scrollWidth, host: location.hostname })");
          if (where.host !== "127.0.0.1") throw new Error(`${shot.key}: 127.0.0.1 밖(${where.host})에 있습니다`);
          if (where.docW > SHOT_WIDTH) throw new Error(`${shot.key}: 화면이 옆으로 넘칩니다(${where.docW}px)`);
          const image = await cdp("Page.captureScreenshot", { format: "webp", quality: WEBP_QUALITY, captureBeyondViewport: false });
          const bytes = Buffer.from(image.data, "base64");
          shots.push({ key: shot.key, bytes, product });
          console.log(`${shot.key}: ${where.title} · ${where.url.replace(/[0-9a-f-]{36}/g, "<id>")} · ${bytes.length} B`);
          await browser.send("Target.closeTarget", { targetId });
        }
      } finally {
        browser.close();
        server.close();
        await wait(300);
        try { rmSync(profile, { recursive: true, force: true }); } catch (_) {}
      }
      if (offsite.length) throw new Error(`바깥 주소로 넘기는 응답을 끊었습니다: ${offsite.map((u) => new URL(u).host).join(", ")}`);
    });
  } finally {
    globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
  }
  const product = shots[0]?.product || "";
  const entries = shots.map(({ key, bytes }) => {
    const size = webpSize(bytes);
    if (size.width !== SHOT_WIDTH * SHOT_SCALE || size.height !== SHOT_HEIGHT * SHOT_SCALE) throw new Error(`${key}: 크기 ${size.width}×${size.height}`);
    return { key, path: `/assets/real-screen-${key}-${ASSET_VERSION}.webp`, width: size.width, height: size.height, cssWidth: SHOT_WIDTH, cssHeight: SHOT_HEIGHT, bytes: bytes.length, sha256: sha256(bytes), base64: bytes.toString("base64") };
  });
  const source = generatedSource(entries, product, scenarioHash);
  if (KEEP) {
    mkdirSync(KEEP, { recursive: true });
    for (const { key, bytes } of shots) writeFileSync(join(KEEP, `real-screen-${key}-${ASSET_VERSION}.webp`), bytes);
  }
  if (CHECK) {
    const now = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
    if (now !== source) { console.error(`다릅니다: ${OUT_FILE}`); process.exitCode = 1; return; }
    console.log("같습니다");
    return;
  }
  writeFileSync(OUT_FILE, source);
  console.log(`썼습니다: ${OUT_FILE.slice(ROOT.length + 1)} (${source.length} B)`);
}

// WebP 머리(RIFF … WEBP, VP8 / VP8L / VP8X)에서 그림 크기를 읽는다.
export function webpSize(bytes) {
  const buf = Buffer.from(bytes);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("WebP 가 아닙니다");
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  throw new Error(`모르는 WebP 조각 ${chunk}`);
}

function generatedSource(entries, product, scenarioHash) {
  const lines = entries.map((entry) => `  Object.freeze({ key: ${JSON.stringify(entry.key)}, path: ${JSON.stringify(entry.path)}, width: ${entry.width}, height: ${entry.height}, cssWidth: ${entry.cssWidth}, cssHeight: ${entry.cssHeight}, bytes: ${entry.bytes}, sha256: ${JSON.stringify(entry.sha256)}, base64: ${JSON.stringify(entry.base64)} }),`);
  return [
    "// 생성 파일이다 — 손으로 고치지 않는다. 다시 만드는 법은 tools/build-real-screens.mjs 머리에 있다.",
    "// V22.9.146 (애드센스 B4): 예시 데이터로 찍은 실제 웹 가계부 화면(WebP). 공개 화면(public/real-screens-v229146.js)이 싣고,",
    "// assets/icons-manifest.js 가 1년 캐시(immutable)로 내려보낸다. 사진을 바꾸면 주소의 판 번호를 올린다.",
    `// 그림 ${product} (headless, ${SHOT_WIDTH}×${SHOT_HEIGHT}, 배율 ${SHOT_SCALE}, 밝은 테마, 움직임 줄이기) · WebP 품질 ${WEBP_QUALITY} · 시나리오 파일 SHA-256 ${scenarioHash}`,
    "const AB_REAL_SCREENS_IMAGES_V229146 = Object.freeze([",
    ...lines,
    "]);",
    "// @build:exports-start",
    "export { AB_REAL_SCREENS_IMAGES_V229146 };",
    "// @build:exports-end",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
