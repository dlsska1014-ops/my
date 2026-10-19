import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import vm from "node:vm";
import app, { verifyMyImportPreviewToken } from "../src/index.js";
import { createV2265QaFixture } from "../validation/qa-fixture.mjs";
const option = name => process.argv[process.argv.indexOf(name) + 1];
const root = resolve(fileURLToPath(new URL("../", import.meta.url))), out = resolve(option("--out"));
if (!process.argv.includes("--out") || out === root || out.startsWith(root + "\\") || out.startsWith(root + "/")) throw Error("Use --out outside repository");
if (!process.argv.includes("--sheetjs")) throw Error("Use --sheetjs <local pinned 0.20.3 script>");
mkdirSync(out, { recursive: true });
const sheetjs = readFileSync(resolve(option("--sheetjs")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { node: { execPath: process.execPath, version: process.version }, workerSha256: sha(readFileSync(join(root, "src/index.js"))), sheetjsSha256: sha(sheetjs), checks: [], submissions: [], runtimeErrors: [], responses: [], scope: "Real headless Chrome, DOM.setFileInputFiles, native text insertion and mouse/keyboard, real multipart HTTP/Worker/memory RPC. CDP-controlled delayed module/FileReader delivery. OS picker, OS clipboard and physical phones excluded." };
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
globalThis.fetch = async () => { throw Error("Chrome fixture native fetch blocked"); };
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-16T12:00:00+09:00");
const USER = "11111111-1111-4111-8111-111111111111", MEMBER = "22222222-2222-4222-8222-222222222222", BASE = "https://malhaebook.com";
const fx = await createV2265QaFixture();
for (const [key, rows] of Object.entries(fx.db)) if (Array.isArray(rows)) fx.db[key] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", USER).replaceAll("user-wifi", MEMBER));
fx.cookie = await fx.cookieFor(USER); fx.db.__import_rpc_available = true;
const text = amount => `날짜,구분,금액,내용\n2026-07-01,지출,${amount},합성 구매 ${amount}`;
const csvPath = join(out, "bank.csv"); writeFileSync(csvPath, text(7654));
const otherCsv = join(out, "bank-b.csv"); writeFileSync(otherCsv, text(7655));
const badXls = join(out, "corrupt.xls"); writeFileSync(badXls, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
const sandbox = { console, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Buffer };
vm.runInNewContext(sheetjs.toString(), sandbox);
for (const amount of [8761, 8762]) {
  const workbook = sandbox.XLSX.utils.book_new();
  sandbox.XLSX.utils.book_append_sheet(workbook, sandbox.XLSX.utils.aoa_to_sheet([["날짜", "구분", "금액", "내용"], ["2026-07-01", "지출", amount, "엑셀 합성 " + amount]]), "합성 시트");
  writeFileSync(join(out, "excel-" + amount + ".xlsx"), Buffer.from(sandbox.XLSX.write(workbook, { bookType: "xlsx", type: "array" })));
}
let active = 0;
const server = createServer(async (req, res) => {
  active++;
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks), headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (!["host", "content-length", "cookie", "connection", "accept-encoding", "origin", "referer"].includes(key)) headers.set(key, String(value));
    headers.set("cookie", fx.cookie); headers.set("origin", BASE);
    const request = new Request(BASE + req.url, { method: req.method, headers, ...(body.length ? { body } : {}) });
    if (req.method === "POST" && req.url === "/my/import") {
      const data = await request.clone().formData();
      const token = String(data.get("import_token") || "");
      const payload = token ? await verifyMyImportPreviewToken(fx.env, token) : null;
      report.submissions.push({ action: data.get("import_action"), source: data.get("input_source"), revision: data.get("input_revision"), hasFile: !!data.get("csv_file"), textSha256: sha(Buffer.from(String(data.get("csv_text") || ""))), tokenSha256: token ? sha(Buffer.from(token)) : "", picks: data.getAll("selected_rows"), ready: payload?.ready.map(e => ({ id: e.row.id, amount: e.row.amount, spender: e.row.user_id, location: e.source_location })), before: structuredClone(fx.db.transactions) });
    }
    const response = await app.fetch(request, fx.env, { waitUntil() {} }), bytes = Buffer.from(await response.arrayBuffer()), outgoing = {};
    response.headers.forEach((value, key) => { if (!["content-length", "content-encoding", "strict-transport-security"].includes(key)) outgoing[key] = value; });
    if (outgoing.location) outgoing.location = outgoing.location.replace(BASE, "http://127.0.0.1:" + server.address().port);
    report.responses.push({ path: req.url, status: response.status, cache: outgoing["cache-control"] });
    if (req.method === "POST" && req.url === "/my/import") Object.assign(report.submissions.at(-1), { status: response.status, after: structuredClone(fx.db.transactions) });
    res.writeHead(response.status, outgoing); res.end(bytes);
  } catch (error) { res.writeHead(500, { "content-type": "text/plain" }); res.end(String(error.stack)); }
  finally { active--; }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!chromePath) throw Error("Chrome not found");
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-pipe", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--user-data-dir=" + join(out, "profile"), "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
let sequence = 0, buffer = "", holdModule = false; const pending = new Map(), heldModules = [];
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout " + method)); }, 15000);
  pending.set(id, { resolve, reject, timer }); chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
});
const fulfillModule = event => send("Fetch.fulfillRequest", { requestId: event.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: sheetjs.toString("base64") }, event.sessionId);
chrome.stdio[4].on("data", chunk => {
  buffer += chunk;
  for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.method === "Runtime.exceptionThrown") report.runtimeErrors.push(message.params);
    if (message.method === "Fetch.requestPaused") { if (holdModule) heldModules.push(message); else fulfillModule(message).catch(() => {}); }
    const task = pending.get(message.id); if (!task) continue;
    pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result);
  }
});
const target = await send("Target.createTarget", { url: "about:blank" }), session = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
const page = (method, params) => send(method, params, session.sessionId);
const evaluate = async expression => { const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)); return result.result.value; };
async function until(predicate, label = "condition") { const end = Date.now() + 12000; while (Date.now() < end) { if (typeof predicate === "function" ? await predicate() : await evaluate(predicate)) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error("Not reached: " + label); }
async function navigate() {
  const previous = await evaluate("window.__importDocument"); fx.db.transactions = [];
  await page("Page.navigate", { url: origin + "/my/backup?household_id=house-home&month=2026-07" });
  await until(`window.__importDocument!==${JSON.stringify(previous) || "undefined"} && !!document.querySelector('#myImportForm')?.__abImportSource`, "new backup document initialized"); await until(() => active === 0);
}
async function click(selector) {
  const point = await evaluate(`(async()=>{await document.activeViewTransition?.finished.catch(()=>{});await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await page("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  for (const type of ["mousePressed", "mouseReleased"]) await page("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point });
}
async function activate(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (const type of ["keyDown", "keyUp"]) await page("Input.dispatchKeyEvent", { type, key: " ", code: "Space", windowsVirtualKeyCode: 32, text: type === "keyDown" ? " " : "" });
}
async function insert(selector, value) { await click(selector); for (const type of ["keyDown", "keyUp"]) await page("Input.dispatchKeyEvent", { type, key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }); await page("Input.insertText", { text: value }); }
async function file(selector, path) { const doc = await page("DOM.getDocument"); const node = await page("DOM.querySelector", { nodeId: doc.root.nodeId, selector }); await page("DOM.setFileInputFiles", { nodeId: node.nodeId, files: path ? [path] : [] }); }
async function screenshot(name) {
  await evaluate("(async()=>{await window.__importTransition?.finished.catch(()=>{});await document.activeViewTransition?.finished.catch(()=>{});await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()");
  const result = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); writeFileSync(join(out, name + ".png"), Buffer.from(result.data, "base64"));
}
async function save(expected, selector = "#myImportSubmit") {
  const count = report.submissions.length, before = fx.db.transactions.length;
  await click(selector); await until("!!document.querySelector('#myImportCommitForm')", "preview document"); await until(() => active === 0);
  const token = await evaluate("document.querySelector('[name=import_token]').value"); const payload = await verifyMyImportPreviewToken(fx.env, token);
  check(payload.ready.length === 1 && payload.ready[0].row.amount === expected, "Chrome selected source gives correct signed preview " + expected);
  check(fx.db.transactions.length === before, "Chrome preview stores no rows");
  await activate("#clearImport"); check(await evaluate("document.querySelector('#commitImport').disabled"), "keyboard empty row selection blocks commit");
  await activate("#selectAllImport"); check(await evaluate("document.querySelector('.importPick').checked"), "keyboard actual row selection restored");
  await click("#commitImport"); await until(() => report.submissions.length >= count + 2 && active === 0, "commit HTTP consumed"); await until("!document.querySelector('#myImportCommitForm')", "result document");
  check(fx.db.transactions.length === before + 1, "Chrome actual memory row added exactly once");
  const stored = fx.db.transactions.at(-1); check(stored.id === payload.ready[0].row.id && stored.user_id === USER && stored.amount === expected, "Chrome actual fixed ID/spender/amount agree");
  check(report.submissions.at(-1).status === 200, "Chrome actual commit POST completes");
}
try {
  await page("Page.enable"); await page("Runtime.enable");
  await page("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.sheetjs.com/*", requestStage: "Request" }] });
  await page("Page.addScriptToEvaluateOnNewDocument", { source: `window.__importDocument=crypto.randomUUID();window.__readerHold=false;window.__readerQueue=[];const NativeReader=window.FileReader;window.FileReader=class extends NativeReader{set onload(fn){super.onload=e=>{if(window.__readerHold)window.__readerQueue.push(()=>fn(e));else fn(e)}}};for(const type of ['pagereveal','pageswap'])addEventListener(type,e=>{if(e.viewTransition){window.__importTransition=e.viewTransition;for(const name of ['ready','updateCallbackDone','finished'])e.viewTransition[name].catch(()=>{});}});` });
  await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(); await insert("#myImportText", text(4321)); await file("#myImportFile", csvPath); await save(7654);
  check(report.submissions.at(-2).source === "file" && !report.submissions.at(-2).textSha256.includes("4321"), "explicit file source submitted");
  await navigate(); await file("#myImportFile", csvPath); await insert("#myImportText", text(4322)); await save(4322);
  check(report.submissions.at(-2).source === "text" && !report.submissions.at(-2).hasFile, "paste excludes stale original file from multipart");
  // Delayed library completion, followed by selection of a different CSV.
  await navigate(); holdModule = true; await file("#myImportFile", join(out, "excel-8761.xlsx")); await until(() => heldModules.length > 0, "module download held");
  await file("#myImportFile", otherCsv); holdModule = false; await Promise.all(heldModules.splice(0).map(fulfillModule)); await until("!!window.XLSX", "module late completion");
  check(await evaluate("document.querySelector('[name=input_source]').value==='file' && !document.querySelector('#myImportText').value.includes('8761')"), "late Excel A module cannot replace CSV B"); await save(7655);
  // Real FileReader data and real SheetJS; only event delivery timing is controlled.
  await navigate(); await evaluate("window.__readerHold=true"); await file("#myImportFile", join(out, "excel-8761.xlsx")); await until("window.__readerQueue.length===1", "Excel A native reader delivery held");
  await insert("#myImportText", text(4323)); await evaluate("window.__readerHold=false;window.__readerQueue.splice(0).forEach(fn=>fn())");
  check(await evaluate("document.querySelector('#myImportText').value.includes('4323') && document.querySelector('[name=input_source]').value==='text'"), "late reader cannot overwrite pasted B"); await save(4323);
  await navigate(); await file("#myImportFile", join(out, "excel-8762.xlsx")); await until("document.querySelector('[name=input_source]').value==='converted'", "real workbook conversion");
  check(await evaluate("document.querySelector('#myImportFile').files.length===1"), "converted TSV and original workbook share one source revision"); await save(8762);
  check(!report.submissions.at(-2).hasFile && report.submissions.at(-2).source === "converted", "converted multipart sends exactly text representation");
  await navigate(); await insert("#myImportText", text(4324)); await file("#myImportFile", badXls); await until("document.querySelector('#myImportFileStatus').textContent.includes('기존 입력')", "conversion failure");
  const failedCount = report.submissions.length; await click("#myImportSubmit"); check(report.submissions.length === failedCount, "conversion error prevents POST");
  check(await evaluate("document.querySelector('#myImportText').value.includes('4324')"), "conversion failure preserves old paste");
  await insert("#myImportText", text(4325)); await save(4325);
  await navigate(); await click('.cgOpen[data-card="kb"]'); await file("#cgFile", csvPath); await save(7654, "#cgGo");
  await navigate(); await click('.cgOpen[data-card="kb"]'); await evaluate("window.__readerHold=true"); await file("#cgFile", join(out, "excel-8761.xlsx")); await until("window.__readerQueue.length===1", "modal A reader held");
  await file("#cgFile", otherCsv); await evaluate("window.__readerHold=false;window.__readerQueue.splice(0).forEach(fn=>fn())");
  check(await evaluate("!document.querySelector('#cgGo').disabled && document.querySelector('#cgStatus').textContent.includes('bank-b.csv')"), "modal late A does not replace B"); await save(7655, "#cgGo");
  await navigate(); await insert("#myImportText", text(4326)); await click('.cgOpen[data-card="kb"]'); await evaluate("window.__readerHold=true"); await file("#cgFile", join(out, "excel-8761.xlsx")); await until("window.__readerQueue.length===1", "modal cancel reader held");
  await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await evaluate("window.__readerHold=false;window.__readerQueue.splice(0).forEach(fn=>fn())");
  check(await evaluate("document.querySelector('#cgModal').hidden && document.querySelector('#myImportText').value.includes('4326')"), "modal cancel preserves original and invalidates late conversion"); await save(4326);
  await navigate(); await click('.cgOpen[data-card="kb"]'); await file("#cgFile", join(out, "excel-8761.xlsx")); await until("!document.querySelector('#cgGo').disabled", "modal real conversion"); await save(8761, "#cgGo");
  for (const width of [375, 1280]) for (const theme of ["light", "dark"]) {
    await page("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await navigate(); await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('abHideAmounts','1')`); await navigate();
    check(await evaluate(`document.documentElement.getAttribute('data-ab-resolved-theme')===${JSON.stringify(theme)}`), "actual theme " + width + "/" + theme);
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), "backup no horizontal overflow " + width + "/" + theme);
    await insert("#myImportText", text(9901 + width)); await click("#myImportSubmit"); await until("!!document.querySelector('#myImportCommitForm')");
    check(await evaluate("document.documentElement.hasAttribute('data-ab-hide-amounts') && !!document.querySelector('.abPrivateAmount')"), "preview retains amount masking " + width + "/" + theme);
    check(await evaluate("!!document.querySelector('#importDateBasis') && document.querySelector('[data-label=행]').textContent.includes('행')"), "date basis and original physical location present");
    await screenshot("preview-" + width + "-" + theme);
  }
  check(report.responses.filter(r => ["/my/import", "/my/backup?household_id=house-home&month=2026-07"].includes(r.path)).every(r => r.cache?.includes("no-store")), "all personal HTML responses retain no-store");
  report.browserTransitionErrors = report.runtimeErrors.filter(event => /InvalidStateError: Transition was aborted because of invalid state\. Page already revealed/.test(event.exceptionDetails?.exception?.description || ""));
  check(report.runtimeErrors.length === report.browserTransitionErrors.length, "no import runtime exceptions; browser transition aborts recorded separately");
  report.savedRows = structuredClone(fx.db.transactions); report.rpcWrites = fx.db.__rpc_calls.filter(r => r.name === "accountbook_import_transactions_v227").length; report.pass = true;
} finally {
  if (!report.pass) {
    report.failureDom = await evaluate("({url:location.href,ready:document.readyState,bound:document.querySelector('#myImportCommitForm')?.dataset.abImportBound,picks:[...document.querySelectorAll('.importPick')].map(e=>({checked:e.checked,value:e.value})),active:document.activeElement?.outerHTML,body:document.body.innerText.slice(-3000)})").catch(String);
    await screenshot("failure").catch(() => {});
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await send("Browser.close").catch(() => {}); chrome.kill(); await new Promise(resolve => server.close(resolve)); fx.restore();
}
console.log(`PASS: V22.9.55 import Chrome (${report.checks.length} checks)`);
