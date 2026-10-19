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
      report.submissions.push({ action: data.get("import_action"), source: data.get("input_source"), mappingDelta: data.get("mapping_delta"), previousTokenPresent: !!data.get("previous_import_token"), revision: data.get("input_revision"), hasFile: !!data.get("csv_file"), textSha256: sha(Buffer.from(String(data.get("csv_text") || ""))), tokenSha256: token ? sha(Buffer.from(token)) : "", picks: data.getAll("selected_rows"), ready: payload?.ready.map(e => ({ id: e.row.id, amount: e.row.amount, spender: e.row.user_id, location: e.source_location })), before: structuredClone(fx.db.transactions) });
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
  const previous = await evaluate("window.__importDocument"); fx.db.transactions = []; fx.db.accountbook_settings = fx.db.accountbook_settings.filter(r => !r.key.startsWith("my_import_source_"));
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

const mappingText = (memo = "연결 테스트") => `날짜,구분,금액,새값,내용\n2026-07-01,지출,5000,9000,${memo}`;
const token = async () => evaluate("document.querySelector('#myImportCommitForm [name=import_token]')?.value");
const payload = async () => verifyMyImportPreviewToken(fx.env, await token());
async function waitPreview(old = "") { await until(`!!document.querySelector('#myImportCommitForm') && document.querySelector('#myImportCommitForm [name=import_token]').value!==${JSON.stringify(old)}`, "new signed mapping preview"); await until("!document.querySelector('#myImportWorkspace').hasAttribute('aria-busy')"); }
async function key(key, code, vk) { for (const type of ["keyDown", "keyUp"]) await page("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk }); }
async function selectField(index, optionIndex) {
  const selector = `.importMappingPick[data-section="1"][data-column="${index}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const firstEnabled = await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].findIndex(o=>!o.disabled)`);
  await key("Home", "Home", 36);
  for (let i = firstEnabled; i < optionIndex; i++) await key("ArrowDown", "ArrowDown", 40);
  await key("Enter", "Enter", 13);
}
async function changeAmount() { await selectField(2, 10); await selectField(3, 2); }
try {
  await page("Page.enable"); await page("Runtime.enable");
  await page("Fetch.enable", { patterns: [{ urlPattern: "https://cdn.sheetjs.com/*", requestStage: "Request" }] });
  await page("Page.addScriptToEvaluateOnNewDocument", { source: `window.__importDocument=crypto.randomUUID();window.__mappingHeld=[];window.__holdImport=false;window.__failImport=false;window.__dropImport=false;window.__corruptImport=false;const nativeFetch=window.fetch;window.fetch=async function(input,opts){if(String(input)==='/my/import'&&window.__failImport)throw new TypeError('synthetic offline request');const response=await nativeFetch(input,opts);if(String(input)==='/my/import'&&window.__holdImport)await new Promise(resolve=>window.__mappingHeld.push(resolve));if(String(input)==='/my/import'&&window.__dropImport){window.__dropImport=false;await response.text();throw new TypeError('synthetic lost response after dispatch')}if(String(input)==='/my/import'&&window.__corruptImport){window.__corruptImport=false;return new Response(new ReadableStream({start(c){c.error(new TypeError('synthetic lost body'))}}),{status:response.status,headers:response.headers})}return response;};` });
  await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate();
  const filePath = join(out, "mapping.csv"); writeFileSync(filePath, mappingText());
  const documentId = await evaluate("window.__importDocument");
  await file("#myImportFile", filePath); await click("#myImportSubmit"); await waitPreview();
  const first = await payload(), firstToken = await token();
  check(await evaluate(`window.__importDocument===${JSON.stringify(documentId)} && document.querySelector('#myImportFile').files.length===1`), "initial analysis retains the actual File and document");
  check(first.ready[0].row.amount === 5000, "initial actual token uses auto amount");
  check(await evaluate("document.querySelectorAll('.importMappingRow').length===5 && document.querySelector('.importMappingPick[data-column=\"3\"]').value===''") , "unknown source column is exposed with its index");
  const requestsBeforeEdit = report.submissions.length;
  await changeAmount();
  check(await evaluate("document.querySelector('#commitImport').disabled"), "mapping edit immediately fences current save form");
  check(report.submissions.length === requestsBeforeEdit, "mapping changes make no automatic request or save");
  await click("[data-import-reanalyze]"); await waitPreview(firstToken);
  const second = await payload();
  check(second.ready[0].row.amount === 9000 && second.jti === first.jti && second.mapping_revision !== first.mapping_revision, "reanalysis returns recalculated amount and new revision with same fixed-ID family");
  check(fx.db.transactions.length === 0, "reanalysis writes no transactions");
  check(await evaluate("![...document.querySelectorAll('.importPick')].some(p=>p.checked) && document.querySelector('#commitImport').disabled"), "changed results require a fresh row selection");
  await activate("#selectAllImport");
  await evaluate("document.querySelector('.importTypePick').focus()"); await key("Home", "Home", 36); await key("ArrowDown", "ArrowDown", 40); await key("Enter", "Enter", 13);
  check(await evaluate("document.querySelector('#selectedImportIncome').textContent.includes('9,000')"), "actual row type change refreshes selected income");
  await screenshot("mapping-desktop");
  await click("#commitImport"); await until("!!document.querySelector('[data-import-next]')", "actual commit result");
  check(fx.db.transactions.length === 1 && fx.db.transactions[0].amount === 9000 && fx.db.transactions[0].type === "income", "actual saved row agrees with remapping and user type override");
  check(fx.db.transactions[0].id === second.ready[0].row.id, "actual saved fixed ID is the signed candidate");
  check(await evaluate(`window.__importDocument===${JSON.stringify(documentId)} && document.querySelector('#myImportFile').files.length===1`), "save retains original source in current tab");
  // A changed row type conflicts with the original candidate on a following batch; no duplicate ID is minted.
  await click("[data-import-next]"); await until("!!document.querySelector('#myImportCommitForm')");
  check((await payload()).mapping_locked === true, "following batch shows server mapping lock");
  check(await evaluate("[...document.querySelectorAll('.importMappingPick')].every(s=>s.disabled)"), "used mapping controls are read-only");

  await navigate(); await insert("#myImportText", mappingText("변경 없음")); await click("#myImportSubmit"); await waitPreview();
  const unchanged = await payload(), unchangedToken = await token(); await click("[data-import-reanalyze]"); await until(() => active === 0); await until("!document.querySelector('#myImportWorkspace').hasAttribute('aria-busy')");
  check(JSON.stringify((await payload()).ready) === JSON.stringify(unchanged.ready), "unchanged reanalysis preserves full values and fixed IDs");
  check((await payload()).mapping_revision === unchanged.mapping_revision, "unchanged reanalysis preserves mapping revision");
  check(await evaluate("document.querySelector('#myImportText').value.includes('변경 없음')"), "textarea source remains exact");

  await navigate(); await insert("#myImportText", mappingText("원본 A")); await evaluate("window.__holdImport=true"); await click("#myImportSubmit"); await until("window.__mappingHeld.length===1", "late source A response held");
  await insert("#myImportText", mappingText("원본 B").replace('9000','8000')); await evaluate("window.__holdImport=false"); await click("#myImportSubmit"); await waitPreview();
  const sourceB = await token(); await evaluate("window.__mappingHeld.splice(0).forEach(fn=>fn())");
  check(await token() === sourceB && (await payload()).ready[0].row.raw_text.includes("원본 B"), "late source A cannot overwrite source B token or rows");
  await changeAmount(); await evaluate("window.__holdImport=true"); await click("[data-import-reanalyze]"); await until("window.__mappingHeld.length===1", "late mapping A response held");
  await selectField(3, 10); await selectField(2, 2); await evaluate("window.__holdImport=false;window.__mappingHeld.splice(0).forEach(fn=>fn())");
  check(await token() === sourceB && await evaluate("document.querySelector('#commitImport').disabled"), "late mapping response cannot enable or replace edited candidates");
  await click("[data-import-reanalyze]"); await waitPreview(sourceB);
  check((await payload()).ready[0].row.amount === 5000, "new mapping edit recovers after an ignored in-flight response");

  await navigate(); await insert("#myImportText", mappingText("ネットワーク再試行")); await click("#myImportSubmit"); await waitPreview();
  const networkBefore = await token(); await changeAmount(); await evaluate("window.__failImport=true"); await click("[data-import-reanalyze]"); await until("!document.querySelector('#myImportWorkspace').hasAttribute('aria-busy')");
  check(await token() === networkBefore && await evaluate("document.querySelector('.importMappingPick[data-column=\"3\"]').value==='amount' && document.querySelector('#myImportText').value.includes('再試行')"), "network failure retains source, delta and original candidate");
  check(fx.db.transactions.length === 0, "network failure stores no rows"); await evaluate("window.__failImport=false"); await click("[data-import-reanalyze]"); await waitPreview(networkBefore); check((await payload()).ready[0].row.amount === 9000, "explicit retry uses retained mapping");

  const wide = ["날짜","금액",...Array.from({length:90},(_,i)=>'임의열'+i)].join(',')+'\n'+['2026-07-01','5000',...Array(90).fill('<img src=x onerror=window.__injected=1>')].join(',');
  await navigate(); await insert("#myImportText", wide); await click("#myImportSubmit"); await waitPreview();
  check(await evaluate("document.querySelectorAll('.importMappingRow').length===64 && !window.__injected"), "bounded unknown-column metadata escapes HTML");
  await click("[data-import-offset]"); await until("document.querySelector('.importMappingPick[data-column=\"64\"]')!==null");
  check((await payload()).ready[0].row.amount === 5000, "column pagination preserves full-table analysis");

  await navigate(); await insert("#myImportText", mappingText('두 탭')); await click("#myImportSubmit"); await waitPreview();
  const staleToken = await token();
  const newTarget = await send("Target.createTarget", { url: origin + "/my/backup?household_id=house-home&month=2026-07" });
  const newSession = await send("Target.attachToTarget", { targetId: newTarget.targetId, flatten: true });
  const otherEval = async expression => { const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},newSession.sessionId); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
  await until(async()=>otherEval("!!document.querySelector('#myImportForm')?.__abImportSource"), 'second real browser tab');
  await otherEval(`document.querySelector('#myImportText').value=${JSON.stringify(mappingText('두 탭'))};document.querySelector('#myImportText').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#myImportForm').requestSubmit()`);
  await until(async()=>otherEval("!!document.querySelector('#myImportCommitForm')"), 'second tab preview');
  check(await otherEval("document.querySelector('[name=import_token]').value") !== staleToken, 'second real tab has independent latest token');
  await send('Target.activateTarget',{targetId:target.targetId});
  await evaluate('window.__corruptImport=true'); await click('#commitImport'); await until("document.querySelector('#commitImport').disabled && !document.querySelector('#myImportWorkspace').hasAttribute('aria-busy')", 'stale tab server rejection with lost 409 body');
  check(fx.db.transactions.length===0, 'stale real tab cannot save after another initial preview');
  await send('Target.closeTarget',{targetId:newTarget.targetId});

  // Use the preserved HTML POST fallback to test source loss and explicit reselection.
  await navigate();
  const recovered = join(out,'reselect.csv');writeFileSync(recovered,mappingText('파일 재선택'));await file('#myImportFile',recovered);
  await page('Page.addScriptToEvaluateOnNewDocument',{source:'window.__mappingFallbackDocument=crypto.randomUUID()'});
  await evaluate("HTMLFormElement.prototype.submit.call(document.querySelector('#myImportForm'))");
  await until("!!document.querySelector('[data-import-reselect]') && !!document.querySelector('#myImportCommitForm')", 'legacy standalone preview');
  check(await evaluate("document.querySelector('#myImportText').value==='' && document.querySelector('#myImportFile').files.length===0"), 'standalone preview honestly has no source');
  await evaluate("document.querySelector('[data-import-reselect]').open=true");
  await file('#myImportFile',recovered);await click('#myImportSubmit');
  await until("document.querySelectorAll('.importMappingPick').length===5", 'reselected source upgrades to mapping preview');
  check((await payload()).ready[0].row.amount===5000, 'explicit same-file reselection recovers actual analysis');

  await navigate(); await insert('#myImportText',mappingText('취소')); await click('#myImportSubmit');await waitPreview();const cancelToken=await token();await changeAmount();
  await evaluate('window.__holdImport=true');await click('[data-import-reanalyze]');await until('window.__mappingHeld.length===1','cancel held response');await click('[data-import-cancel]');await evaluate('window.__holdImport=false;window.__mappingHeld.splice(0).forEach(fn=>fn())');
  check(await token()===cancelToken && await evaluate("document.querySelector('#commitImport').disabled"),'canceled late analysis cannot restore save eligibility');
  await click('[data-import-reanalyze]');await waitPreview(cancelToken);check((await payload()).ready[0].row.amount===9000,'cancel preserves mapping for explicit retry');

  await navigate();await insert('#myImportText',mappingText('불명확 재확인'));await click('#myImportSubmit');await waitPreview();const unknownPayload=await payload();
  await evaluate("document.querySelector('.importTypePick').focus()");await key('End','End',35);await key('Enter','Enter',13);
  const memoryFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>String(input).includes('/rpc/accountbook_import_transactions_v227')?new Response('{"message":"synthetic unresolved"}',{status:503}):memoryFetch(input,init);
  await click('#commitImport');await until("document.querySelector('#commitImport')?.textContent.includes('같은 고정 ID')",'explicit unresolved retry form');
  check(fx.db.transactions.length===0 && await evaluate("!document.querySelector('[data-import-next]')"),'unknown save exposes no new-analysis next batch');
  check(await evaluate("document.querySelector('.importTypePick').value==='income' && document.querySelector('.importPick').checked"),'unknown retry retains original row selection and type override');
  globalThis.fetch=memoryFetch;await click('#commitImport');await until("!!document.querySelector('[data-import-next]')",'exact fixed-ID retry resolves');
  check(fx.db.transactions.length===1 && fx.db.transactions[0].id===unknownPayload.ready[0].row.id && fx.db.transactions[0].type==='income','explicit retry stores exact fixed ID and original user type once');

  for(const loss of ['drop','body']) {
    await navigate();await insert('#myImportText',mappingText('응답 유실 '+loss));await click('#myImportSubmit');await waitPreview();const originalRequest=await payload();
    await evaluate("document.querySelector('.importTypePick').focus()");await key('End','End',35);await key('Enter','Enter',13);
    const memory=globalThis.fetch;globalThis.fetch=async(input,init)=>String(input).includes('/rpc/accountbook_import_transactions_v227')?new Response('{"message":"synthetic pending"}',{status:503}):memory(input,init);
    await evaluate(`window.__holdImport=true;window.${loss==='drop'?'__dropImport':'__corruptImport'}=true`);await click('#commitImport');await until('window.__mappingHeld.length===1','post-dispatch response held '+loss);
    check(await evaluate("[...document.querySelectorAll('.importPick,.importTypePick,#selectAllImport,#clearImport')].every(e=>e.disabled)"),'selection/type controls are locked after dispatch '+loss);
    await evaluate("document.querySelector('.importTypePick').value='expense';document.querySelector('.importPick').checked=false;window.__holdImport=false;window.__mappingHeld.splice(0).forEach(fn=>fn())");
    await until("document.querySelector('#commitImport').textContent.includes('같은 고정 ID') && !document.querySelector('#myImportWorkspace').hasAttribute('aria-busy')",'lost response exact retry '+loss);
    check(await evaluate("!document.querySelector('#commitImport').disabled && document.querySelector('.importPick').checked && document.querySelector('.importTypePick').value==='income'"),'lost response restores sent selection/type snapshot '+loss);
    check(fx.db.transactions.length===0,'lost response never assumes storage success '+loss);
    globalThis.fetch=memory;await click('#commitImport');await until("!!document.querySelector('[data-import-next]')",'lost response retry resolves '+loss);
    check(fx.db.transactions.length===1 && fx.db.transactions[0].id===originalRequest.ready[0].row.id && fx.db.transactions[0].type==='income','lost response retry preserves exact original ID/value '+loss);
  }

  for (const width of [375,1280]) for (const theme of ["light","dark"]) {
    await page("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
    await navigate(); await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('abHideAmounts','1')`); await navigate();
    await insert("#myImportText", mappingText('표본 $12.50 9000')); await click("#myImportSubmit"); await waitPreview();
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), "mapping viewport has no horizontal page overflow "+width+'/'+theme);
    check(await evaluate("[...document.querySelectorAll('.importMappingPick')].every(e=>e.getBoundingClientRect().height>=44)"), "mapping controls retain 44px targets "+width+'/'+theme);
    check(await evaluate("document.documentElement.hasAttribute('data-ab-hide-amounts') && [...document.querySelectorAll('.importMappingSampleValue')].every(e=>getComputedStyle(e).display==='none' && e.getAttribute('aria-hidden')==='true')"), "all bare-number/foreign/memo samples are masked visually and in accessibility "+width+'/'+theme);
    check(await evaluate("!/[0-9],[0-9]{3}|\\$12/.test(document.querySelector('#myImportMappingStatus').textContent)"), "mapping status leaks no amount "+width+'/'+theme);
    await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    check(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), "reduced-motion setting is exercised "+width+'/'+theme);
    await screenshot('mapping-'+width+'-'+theme);
  }
  check(report.responses.filter(r=>r.path==='/my/import').every(r=>r.cache?.includes('no-store')), "all import response modes retain no-store");
  report.browserTransitionErrors = report.runtimeErrors.filter(event => /InvalidStateError: Transition was aborted because of invalid state/.test(event.exceptionDetails?.exception?.description || ""));
  check(report.runtimeErrors.length===report.browserTransitionErrors.length,"no mapping runtime exceptions");
  report.savedRows=structuredClone(fx.db.transactions); report.rpcWrites=fx.db.__rpc_calls.filter(r=>r.name==='accountbook_import_transactions_v227').length; report.pass=true;
} finally {
  if (!report.pass) {
    report.failureDom = await evaluate("({url:location.href,ready:document.readyState,bound:document.querySelector('#myImportCommitForm')?.dataset.abImportBound,picks:[...document.querySelectorAll('.importPick')].map(e=>({checked:e.checked,value:e.value})),active:document.activeElement?.outerHTML,body:document.body.innerText.slice(-3000)})").catch(String);
    await screenshot("failure").catch(() => {});
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await send("Browser.close").catch(() => {}); chrome.kill(); await new Promise(resolve => server.close(resolve)); fx.restore();
}
console.log(`PASS: V22.9.56 mapping Chrome (${report.checks.length} checks)`);
