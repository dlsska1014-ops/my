import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createV2265QaFixture } from "../validation/qa-fixture.mjs";

const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--out")) throw new Error("Use --out <directory outside the repository> for Chrome evidence.");
const out = resolve(option("--out"));
const repository = resolve(fileURLToPath(new URL("../", import.meta.url)));
if (out.toLowerCase() === repository.toLowerCase() || out.toLowerCase().startsWith(repository.toLowerCase() + (process.platform === "win32" ? "\\" : "/"))) throw new Error("Chrome evidence must stay outside the repository.");
const worker = resolve(process.argv.includes("--worker") ? option("--worker") : fileURLToPath(new URL("../src/index.js", import.meta.url)));
const prereq = process.argv.includes("--prereq"), reproOnly = process.argv.includes("--repro-only");
const app = (await import(pathToFileURL(worker))).default;
mkdirSync(out, { recursive: true });
const chromePath = process.argv.includes("--chrome") ? option("--chrome") : [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
].find(existsSync);
if (!chromePath) throw new Error("Chrome was not found; provide --chrome <executable>.");
const report = { source: worker, sourceSha256: createHash("sha256").update(readFileSync(worker)).digest("hex"), node: process.version, checks: [], failures: [], observations: [], assets: {} };
const check = (condition, label) => { report.checks.push({ label, passed: !!condition }); if (!condition) report.failures.push(label); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fx = await createV2265QaFixture(), original = structuredClone(fx.db.transactions);
let mode = "normal", releaseAsset = null, saveRequests = 0, classifications = 0;
let holdClassification = false;
const heldClassifications = [];
const BASE = "https://malhaebook.com", home = "/app?month=2026-07&household_id=house-home";
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (!["host", "content-length", "cookie", "connection", "accept-encoding", "origin", "referer"].includes(key)) headers.set(key, String(value));
    headers.set("cookie", fx.cookie); headers.set("origin", BASE); headers.set("user-agent", "Lucian-A-native-regression");
    if (req.method === "POST" && req.url === "/admin/transactions") saveRequests++;
    let heldClassification;
    if (req.url === "/u/api/input-classification") {
      classifications++;
      if (holdClassification) await new Promise(resolve => {
        heldClassification = { release: resolve, sent: false, raw: JSON.parse(Buffer.concat(chunks).toString()).raw_text };
        heldClassifications.push(heldClassification);
      });
    }
    if (/^\/assets\/accountbook-quick-input-v\d+\.js$/.test(req.url)) {
      if (mode === "fail") { res.writeHead(503, { "content-type": "text/plain", "cache-control": "no-store" }); res.end("fixture asset unavailable"); return; }
      if (mode === "delay") await new Promise(resolve => { releaseAsset = resolve; });
    }
    const init = { method: req.method, headers }; if (chunks.length) init.body = Buffer.concat(chunks);
    const response = await app.fetch(new Request(BASE + req.url, init), fx.env, {});
    const bytes = Buffer.from(await response.arrayBuffer()), outgoing = {};
    response.headers.forEach((value, key) => { if (!["content-length", "content-encoding", "strict-transport-security"].includes(key)) outgoing[key] = value; });
    if (req.url.startsWith("/assets/") && response.status === 200) report.assets[req.url] = { sha256: createHash("sha256").update(bytes).digest("hex"), etag: response.headers.get("etag") };
    if (outgoing.location) outgoing.location = outgoing.location.replace(BASE, "http://127.0.0.1:" + server.address().port);
    res.writeHead(response.status, outgoing); res.end(bytes);
    if (heldClassification) { heldClassification.reply = JSON.parse(bytes.toString()); heldClassification.sent = true; }
  } catch (error) { res.writeHead(500, { "content-type": "text/plain" }); res.end(String(error.stack)); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--user-data-dir=" + join(out, "profile"), "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
let sequence = 0, buffer = "";
const pending = new Map();
chrome.stdio[4].on("data", chunk => {
  buffer += chunk;
  for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    const task = pending.get(message.id); if (!task) continue;
    pending.delete(message.id); clearTimeout(task.timer);
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 15000);
  pending.set(id, { resolve, reject, timer }); chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
});
const target = await send("Target.createTarget", { url: "about:blank" });
const session = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
const page = (method, params) => send(method, params, session.sessionId);
const evaluate = async expression => {
  const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
// Poll only observable lifecycle conditions; input assertions themselves have no delay.
async function until(predicate, label = String(predicate)) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (typeof predicate === "function" ? await predicate() : await evaluate(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Condition did not complete: " + label);
}
async function key(key, code = key, virtualKey, modifiers = 0) {
  await page("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}), ...(virtualKey ? { windowsVirtualKeyCode: virtualKey } : {}), modifiers });
  await page("Input.dispatchKeyEvent", { type: "keyUp", key, code, ...(virtualKey ? { windowsVirtualKeyCode: virtualKey } : {}), modifiers });
}
async function click(selector) {
  const point = await evaluate(`(()=>{const b=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.getClientRects().length&&b.getBoundingClientRect().width>0);if(!b)throw Error('missing click target');b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await page("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await page("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
}
async function replace(id, text) {
  if (["catInput", "payInput", "txDate"].includes(id) && !await evaluate("quickMore.open")) await click("#quickMore summary");
  await click("#" + id); await key("a", "KeyA", 65, 2);
  if (text) await page("Input.insertText", { text }); else await key("Backspace", "Backspace", 8);
}
const snap = () => evaluate(`({amount:amountInput.value,valid:amountInput.validity.valid,error:amountInput.validationMessage,aria:amountInput.getAttribute('aria-invalid'),caret:amountInput.selectionStart,date:txDate.value,type:document.querySelector('#add input[name=type]:checked').value,category:catInput.value,payment:payInput.value,chips:Array.from(document.querySelectorAll('.abInputReview button')).map(b=>b.textContent),summary:document.querySelector('.abQuickValue b')?.textContent,manual:document.querySelector('[name=quick_manual_amount]')?.value})`);
function observeClassificationConsumption() {
  const originalFetch = window.fetch;
  window.__classificationConsumed = [];
  window.fetch = async (...args) => {
    const response = await originalFetch.apply(window, args);
    if (new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href).pathname !== "/u/api/input-classification") return response;
    const raw = JSON.parse(args[1]?.body || "{}").raw_text;
    const originalJson = response.json.bind(response);
    response.json = async (...jsonArgs) => {
      try { return await originalJson(...jsonArgs); }
      finally {
        // This task runs after JSON consumption and the controller's promise reactions.
        // A server write or an arbitrary frame delay does not establish that condition.
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          window.__classificationConsumed.push(raw);
          channel.port1.close(); channel.port2.close();
        };
        channel.port2.postMessage(null);
      }
    };
    return response;
  };
}
let preId;
async function settings(theme = "light", tone = "blue", hide = false) {
  if (preId) await page("Page.removeScriptToEvaluateOnNewDocument", { identifier: preId });
  preId = (await page("Page.addScriptToEvaluateOnNewDocument", { source: `(${observeClassificationConsumption.toString()})();window.__abErrors=[];window.__inputOrder=[];addEventListener('error',e=>__abErrors.push(e.message));addEventListener('unhandledrejection',e=>__abErrors.push(String(e.reason)));localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('ab:appearance:tone',${JSON.stringify(tone)});localStorage.setItem('abHideAmounts',${hide ? "'1'" : "'0'"});document.addEventListener('input',e=>{if(!['amountInput','smartInput'].includes(e.target.id))return;const observe=phase=>__inputOrder.push({phase,target:e.target.id,value:e.target.value,amount:document.getElementById('amountInput')?.value,chip:document.querySelector('[data-ab-input-field=amount]')?.textContent,valid:document.getElementById('amountInput')?.validity.valid});observe('capture');queueMicrotask(()=>observe('capture-microtask'));},true);document.addEventListener('ab:quick-update',()=>__inputOrder.push({phase:'complete',amount:document.getElementById('amountInput')?.value,chip:document.querySelector('[data-ab-input-field=amount]')?.textContent}));` })).identifier;
}
async function go(quick = false) {
  await page("Page.navigate", { url: "http://127.0.0.1:" + server.address().port + home + (quick ? "&quick=1" : "") });
  await until("document.readyState==='complete'&&!!document.getElementById('abV5Search')");
}
async function open(waitForReview = true) {
  mode = "normal"; fx.db.transactions = structuredClone(original);
  await go(); await evaluate("sessionStorage.removeItem('abQuickInputDraft:v2:user-bin:house-home')");
  await go();
  check(await evaluate("performance.getEntriesByType('resource').every(r=>!r.name.includes('accountbook-quick-input'))"), "input asset is lazy");
  await click("[data-ab-quick-open]");
  await until("document.body.classList.contains('abQuickInputOpen')&&!!document.getElementById('amountInput')");
  if (waitForReview && !prereq) await until("document.querySelectorAll('.abInputReview button').length===5");
}
async function shot(name) { const result = await page("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, name + ".png"), Buffer.from(result.data, "base64")); }
async function noSave(label) {
  const requests = saveRequests, rows = fx.db.transactions.length;
  const browserAllowsSubmit = await evaluate("amountInput.validity.valid");
  await click("#add form button[type=submit]");
  if (browserAllowsSubmit) await until(() => fx.db.transactions.length > rows, "baseline unexpectedly accepted invalid input");
  else await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  check(saveRequests === requests && fx.db.transactions.length === rows, label);
  return { requests: saveRequests - requests, rows: fx.db.transactions.length - rows };
}
async function save(label) {
  const requests = saveRequests, rows = fx.db.transactions.length;
  await click("#add form button[type=submit]");
  await until(() => fx.db.transactions.length > rows, label);
  check(saveRequests === requests + 1 && fx.db.transactions.length === rows + 1, label);
  await until("document.readyState==='complete'");
  return fx.db.transactions.at(-1);
}
try {
  report.chrome = await send("Browser.getVersion");
  await page("Page.enable"); await page("Runtime.enable"); await page("Network.enable");
  await settings();
  for (const width of reproOnly ? [375] : [375, 1280]) {
    await page("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width === 375 });
    for (const raw of ["1e3", "-10", "1.5", "₩12,000", "8,900원"]) {
      await open(); await replace("amountInput", raw);
      const state = await snap(), valid = raw.includes("원") || raw.includes("₩");
      report.observations.push({ width, raw, immediate: state, order: await evaluate("window.__inputOrder") });
      if (valid) {
        const expected = raw === "₩12,000" ? "12,000" : "8,900";
        check(state.amount === expected && state.valid && state.aria === "false", "currency normalized and valid immediately " + width + "/" + raw);
        if (!prereq) check(state.chips[1] === "금액 · " + expected + "원", "currency chip immediately agrees " + width + "/" + raw);
      } else {
        check(state.amount === raw && !state.valid && state.aria === "true", "invalid source preserved and blocked immediately " + width + "/" + raw);
        if (!prereq) check(state.chips[1] === "금액 · 형식 확인", "invalid chip agrees " + width + "/" + raw);
        report.observations.at(-1).save = await noSave("no request or new row for " + width + "/" + raw);
      }
    }
    if (!prereq) {
      await open(); await replace("catInput", "직접분류"); const requests = classifications;
      await replace("smartInput", "어제 점심 12000 국민카드");
      const state = await snap(); report.observations.push({ width, manualCategorySmart: state });
      check(JSON.stringify(state.chips) === JSON.stringify(["날짜 · 2026-07-14", "금액 · 12,000원", "구분 · 지출", "분류 · 직접분류", "결제수단 · 국민카드"]), "all chips match without another click or recommendation " + width);
      check(classifications === requests && state.category === "직접분류" && state.date === "2026-07-14" && state.amount === "12,000" && state.payment === "국민카드", "manual classification and actual fields agree " + width);
      if (!reproOnly) {
        const row = await save("manual classification smart input saves once " + width);
        check(row.transaction_date === state.date && row.amount === 12000 && row.type === state.type && row.category === state.category && row.payment_method === state.payment, "all five submitted values match chips " + width);
      }
    }
    for (const [initial, steps, expected, caret] of [["123", 1, "1,923", 3], ["1234", 4, "124", 2]]) {
      await open(); await replace("amountInput", initial); await key("Home", "Home", 36);
      for (let i = 0; i < steps; i++) await key("ArrowRight", "ArrowRight", 39);
      if (initial === "123") await page("Input.insertText", { text: "9" }); else await key("Backspace", "Backspace", 8);
      const state = await snap(); report.observations.push({ width, initial, caret: state });
      check(state.amount === expected && state.caret === caret, "group separator boundary preserves caret " + width + "/" + initial);
    }
    if (reproOnly) continue;
    await open(); await replace("amountInput", "1e3"); await noSave("invalid entry cannot save before correction " + width);
    await replace("amountInput", "24000"); let state = await snap();
    check(state.valid && state.aria === "false" && state.error === "" && state.chips[1] === "금액 · 24,000원", "correcting invalid input clears error immediately " + width);
    check((await save("corrected input saves once " + width)).amount === 24000, "corrected amount stored accurately " + width);
    await open();
    let total = 0;
    for (const delta of [1000, 5000, 10000, 50000]) { await click('[data-ab-amount-add="' + delta + '"]'); total += delta; state = await snap(); check(state.amount === total.toLocaleString("ko-KR") && state.valid && state.chips[1].includes(total.toLocaleString("ko-KR")) && state.manual === "1", "increment updates field validity chip and manual flag " + width + "/" + delta); }
    await click('[data-ab-amount-add="0"]'); state = await snap(); check(state.amount === "" && state.chips[1] === "금액 · 미입력", "clear updates actual field and chip " + width); await noSave("clear cannot save " + width);
    await replace("amountInput", "2000000000"); check((await snap()).valid, "20억원 is valid " + width);
    check((await save("20억원 saves once " + width)).amount === 2000000000, "20억원 stored accurately " + width);
    await open(); await replace("amountInput", "2000000000");
    await click('[data-ab-amount-add="1000"]'); check(!(await snap()).valid, "increment beyond 20억원 is blocked " + width); await noSave("over-limit increment cannot save " + width);
    await replace("amountInput", "0"); await noSave("zero cannot save " + width);
    await replace("amountInput", "-10"); await replace("payInput", "현금"); check(!(await snap()).valid && (await snap()).amount === "-10", "another field cannot clear amount error " + width);
    await replace("amountInput", "10000000"); await replace("catInput", "식비"); await replace("memoInput", "예산 초과 검사");
    check(await evaluate("amountInput.validity.valid&&document.querySelector('.abAmountHint').textContent.includes('실제 지출을 저장')"), "over-budget valid expense is informational " + width);
    check((await save("over-budget expense saves once " + width)).amount === 10000000, "over-budget amount stored accurately " + width);
    await open(); await replace("amountInput", "");
    await page("Input.imeSetComposition", { text: "1234", selectionStart: 4, selectionEnd: 4 });
    check((await snap()).amount === "1234", "numeric composition is untouched " + width);
    await page("Input.insertText", { text: "1234" }); state = await snap(); check(state.amount === "1,234" && state.valid && state.chips[1] === "금액 · 1,234원", "numeric composition commit updates synchronously " + width);
    await replace("smartInput", ""); await page("Input.imeSetComposition", { text: "점심", selectionStart: 2, selectionEnd: 2 });
    check(await evaluate("smartInput.value==='점심'"), "Korean composition is untouched " + width);
    await page("Input.insertText", { text: "점심 8000 현금" }); check((await snap()).amount === "1,234", "Korean commit preserves manually edited amount " + width);
    await replace("catInput", "직접분류"); await replace("payInput", "직접결제");
    await evaluate("txDate.focus()"); await key("ArrowDown", "ArrowDown", 40); // Native date picker segment edit.
    const manualDate = (await snap()).date;
    await click('#add input[name=type][value=income] + span');
    await replace("smartInput", "어제 저녁 8000 국민카드"); state = await snap();
    check(state.amount === "1,234" && state.category === "직접분류" && state.payment === "직접결제" && state.type === "income" && state.date === manualDate, "manual date amount type category and payment survive parsing " + width);
    await key("Escape", "Escape", 27); await click("[data-ab-quick-open]"); check((await snap()).amount === "1,234", "sheet reopen preserves current fields " + width);
    await until("(()=>{const d=JSON.parse(sessionStorage.getItem('abQuickInputDraft:v2:user-bin:house-home')||'{}');return d.amount==='1,234'&&d.category==='직접분류'&&d.payment_method==='직접결제'&&d.raw_text===smartInput.value})()");
    await go(true); await until("document.body.classList.contains('abQuickInputOpen')"); await until("document.querySelectorAll('.abInputReview button').length===5");
    state = await snap(); check(state.amount === "1,234" && state.category === "직접분류" && state.payment === "직접결제", "draft restore preserves manual values " + width);
    await replace("amountInput", "1.5"); await until("JSON.parse(sessionStorage.getItem('abQuickInputDraft:v2:user-bin:house-home')||'{}').amount==='1.5'"); await go(true); await until("document.body.classList.contains('abQuickInputOpen')"); await until("document.querySelectorAll('.abInputReview button').length===5");
    state = await snap(); check(state.amount === "1.5" && !state.valid && state.chips[1] === "금액 · 형식 확인", "invalid raw draft remains blocked " + width); await noSave("invalid restored draft cannot save " + width);
  }
  if (!reproOnly) {
    await settings(); await open(); holdClassification = true;
    let heldStart = heldClassifications.length;
    await replace("smartInput", "점심 12000 국민카드");
    await until(() => heldClassifications.length === heldStart + 1, "first recommendation is held");
    await replace("catInput", "늦은 응답 전 수동분류");
    heldClassifications[heldStart].release(); await until(() => heldClassifications[heldStart].sent, "old recommendation delivered");
    await until("__classificationConsumed.length===1");
    let recommended = await snap();
    check(recommended.category === "늦은 응답 전 수동분류" && recommended.chips[3] === "분류 · 늦은 응답 전 수동분류", "late recommendation preserves manual category and chip");
    holdClassification = false; await open(); holdClassification = true; heldStart = heldClassifications.length;
    await replace("smartInput", "점심 12000 국민카드"); await until(() => heldClassifications.length === heldStart + 1, "old input recommendation is held");
    await replace("smartInput", "어제 택시 8000 현금"); await until(() => heldClassifications.length === heldStart + 2, "new input recommendation is held");
    heldClassifications[heldStart + 1].release();
    await until("catInput.value!==''&&!quickAfter.textContent.includes('분류를 확인하고')");
    recommended = await snap();
    check(recommended.amount === "8,000" && recommended.date === "2026-07-14" && recommended.payment === "현금" && recommended.category === heldClassifications[heldStart + 1].reply.category && recommended.chips[3] === "분류 · " + recommended.category, "new recommendation completion updates actual fields and chips");
    heldClassifications[heldStart].release(); await until(() => heldClassifications[heldStart].sent, "stale input recommendation delivered last");
    await until("__classificationConsumed.length===2");
    check(JSON.stringify(await snap()) === JSON.stringify(recommended), "stale recommendation cannot overwrite newer fields or chips");
    report.recommendations = { responses: heldClassifications.map(item => ({ raw: item.raw, reply: item.reply })), lastPageConsumed: await evaluate("__classificationConsumed") }; holdClassification = false;
    for (const width of [375, 1280]) for (const theme of ["light", "dark"]) for (const tone of ["blue", "emerald", "violet", "amber"]) {
      await page("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width === 375 }); await settings(theme, tone, true); await open(); await replace("amountInput", "₩12,000");
      await evaluate("new Promise(requestAnimationFrame)");
      check(await evaluate("document.documentElement.scrollWidth<=innerWidth&&Array.from(document.querySelectorAll('.abInputReview button,.abAmountActions button')).every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>=44})"), "layout and touch targets " + width + "/" + theme + "/" + tone);
      check(await evaluate("document.querySelector('[data-ab-input-field=amount] .abPrivateAmount')&&Array.from(document.querySelectorAll('.abInputReview .abPrivateAmount')).every(n=>getComputedStyle(n).filter.includes('blur'))"), "amount privacy " + width + "/" + theme + "/" + tone);
      await click("[data-ab-input-field=amount]"); check(await evaluate("document.activeElement===amountInput"), "masked chip focuses actual input " + width + "/" + theme + "/" + tone);
      await replace("amountInput", "-10"); check((await snap()).chips[1] === "금액 · 형식 확인", "invalid privacy chip exposes no digits " + width + "/" + theme + "/" + tone);
      check((await evaluate("window.__abErrors")).length === 0, "no client errors " + width + "/" + theme + "/" + tone); await shot("input-" + width + "-" + theme + "-" + tone);
    }
    await settings(); await open(); await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    check(await evaluate("Array.from(document.querySelectorAll('.abInputReview button,.abAmountActions button')).every(b=>getComputedStyle(b).animationDuration==='0s'&&getComputedStyle(b).transitionDuration==='0s')"), "reduced motion respected");
    await evaluate("document.querySelector('[data-ab-input-field=date]').focus()"); await key("Enter", "Enter", 13);
    check(await evaluate("document.activeElement===txDate&&quickMore.open"), "keyboard activates chip and focuses date");
    await evaluate("window.__tabTargets=Array.from(document.querySelectorAll('.abQuickInputPanel a[href],.abQuickInputPanel button,.abQuickInputPanel input,.abQuickInputPanel select,.abQuickInputPanel textarea,.abQuickInputPanel summary')).filter(n=>!n.disabled&&n.getClientRects().length);__tabTargets.at(-1).focus()");
    await key("Tab", "Tab", 9); check(await evaluate("document.activeElement===__tabTargets[0]"), "Tab stays inside the quick input sheet");
    await key("Tab", "Tab", 9, 8); check(await evaluate("document.activeElement===__tabTargets.at(-1)"), "Shift Tab stays inside the quick input sheet");
    await key("Escape", "Escape", 27); check(await evaluate("!document.body.classList.contains('abQuickInputOpen')&&!!document.activeElement.closest('[data-ab-quick-open]')"), "Escape restores opener focus");
    await page("Network.setCacheDisabled", { cacheDisabled: true }); await go(); await evaluate("sessionStorage.removeItem('abQuickInputDraft:v2:user-bin:house-home')"); await go(); mode = "fail"; await click("[data-ab-quick-open]");
    await until("!document.getElementById('abInputReviewRuntime')"); await replace("amountInput", "1e3"); check(!(await snap()).valid, "amount validation works when review asset fails"); await noSave("failed review asset cannot permit invalid save");
    await replace("amountInput", "9100"); await replace("memoInput", "재시도 전 메모"); mode = "normal"; await key("Escape", "Escape", 27); await click("[data-ab-quick-open]"); await until("document.querySelectorAll('.abInputReview button').length===5"); check((await snap()).chips[1] === "금액 · 9,100원", "review asset retry preserves current input");
    await go(); await evaluate("sessionStorage.removeItem('abQuickInputDraft:v2:user-bin:house-home')"); await go(); mode = "delay"; await click("[data-ab-quick-open]"); await until(() => !!releaseAsset, "delayed review asset requested");
    await replace("catInput", "지연분류"); await replace("smartInput", "어제 점심 12000 국민카드"); await replace("amountInput", "8700");
    check(await evaluate("!document.querySelector('.abInputReview')&&amountInput.value==='8,700'"), "input processing works while review asset is delayed");
    mode = "normal"; releaseAsset(); releaseAsset = null; await until("document.querySelectorAll('.abInputReview button').length===5"); const delayed = await snap(); check(delayed.chips[1] === "금액 · 8,700원" && delayed.chips[3] === "분류 · 지연분류", "late review asset reads completed current fields");
    fx.db.household_members.find(m => m.household_id === "house-home" && m.user_id === "user-bin").role = "viewer"; await go(); check(await evaluate("!document.getElementById('amountInput')&&!document.querySelector('.abInputReview')&&!document.querySelector('.abAmountActions')"), "viewer has no write controls");
  }
} catch (error) { report.failures.push(error.stack); try { report.lastState = await snap(); await shot("failure"); } catch {} }
finally {
  report.passed = report.checks.filter(c => c.passed).length; report.total = report.checks.length; report.saveRequests = saveRequests; report.classifications = classifications;
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
  if (releaseAsset) releaseAsset(); chrome.kill(); for (const task of pending.values()) clearTimeout(task.timer);
  for (const held of heldClassifications) if (!held.sent) held.release();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fx.restore(); delete globalThis.__AB_QA_FIXED_NOW_MS;
}
console.log(`Lucian A native Chrome: ${report.passed}/${report.total} checks passed; ${report.failures.length} failures; report ${join(out, "report.json")}`);
for (const failure of report.failures) console.error(failure);
if (report.failures.length) process.exitCode = 1;
