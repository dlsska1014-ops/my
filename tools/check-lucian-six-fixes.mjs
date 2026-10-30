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
let currentCookie=fx.cookie,writeResponses=0,deleteResponses=0;const submitted=[];let uncertainNext=false,rejectReconcile=false;const fixtureFetch=globalThis.fetch;globalThis.fetch=async(input,init={})=>{const url=new URL(String(input?.url||input)),method=String(init.method||"GET");if(url.pathname==="/rest/v1/transactions"&&method==="POST"&&uncertainNext){uncertainNext=false;const r=await fixtureFetch(input,init);rejectReconcile=true;throw new TypeError("fixture lost response after commit");}if(rejectReconcile&&method==="GET"&&url.pathname==="/rest/v1/transactions"&&url.searchParams.has("id")){rejectReconcile=false;throw new TypeError("fixture read unavailable");}return fixtureFetch(input,init);};
let mode = "normal", releaseAsset = null, saveRequests = 0, classifications = 0;
let holdClassification = false;
const heldClassifications = [];
const BASE = "https://malhaebook.com", home = "/app?month=2026-07&household_id=house-home";
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (!["host", "content-length", "cookie", "connection", "accept-encoding", "origin", "referer"].includes(key)) headers.set(key, String(value));
    headers.set("cookie", currentCookie); headers.set("origin", BASE); headers.set("user-agent", "Lucian-A-native-regression");
    if (req.method === "POST" && req.url === "/admin/transactions") {saveRequests++;submitted.push(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())));}
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
    res.writeHead(response.status, outgoing); res.end(bytes);if(req.method==="POST"&&req.url==="/admin/transactions")writeResponses++;if(req.method==="POST"&&req.url==="/admin/delete")deleteResponses++;
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
    if(message.method === "Runtime.bindingCalled" && message.params.name === "__reportPageShow") {
      if(!report.pageShows)report.pageShows=[];report.pageShows.push(JSON.parse(message.params.payload));
    }
    if(message.method === "Page.backForwardCacheNotUsed") {
      if(!report.backForwardCacheNotUsed)report.backForwardCacheNotUsed=[];report.backForwardCacheNotUsed.push(message.params);
    }
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
  await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");
  await evaluate("document.activeViewTransition?.finished.catch(()=>{})");
  const point = await evaluate(`(()=>{const b=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.getClientRects().length&&b.getBoundingClientRect().width>0);if(!b)throw Error('missing click target');b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2-(window.visualViewport?.offsetLeft||0),y:r.y+r.height/2-(window.visualViewport?.offsetTop||0)}})()`);
  await page("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await page("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  if(!report.clicks)report.clicks=[];
  report.clicks.push({selector,point,focus:await evaluate(`({viewport:{top:visualViewport.offsetTop,left:visualViewport.offsetLeft,height:visualViewport.height,scrollY},id:document.activeElement?.id,tag:document.activeElement?.tagName,hit:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,500)})`)});
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
  preId = (await page("Page.addScriptToEvaluateOnNewDocument", { source: `(${observeClassificationConsumption.toString()})();window.__documentId=crypto.randomUUID();window.__abErrors=[];window.__inputOrder=[];addEventListener('error',e=>__abErrors.push(e.message));addEventListener('unhandledrejection',e=>__abErrors.push(String(e.reason)));localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('ab:appearance:tone',${JSON.stringify(tone)});localStorage.setItem('abHideAmounts',${hide ? "'1'" : "'0'"});document.addEventListener('input',e=>{if(!['amountInput','smartInput'].includes(e.target.id))return;const observe=phase=>__inputOrder.push({phase,target:e.target.id,value:e.target.value,amount:document.getElementById('amountInput')?.value,chip:document.querySelector('[data-ab-input-field=amount]')?.textContent,valid:document.getElementById('amountInput')?.validity.valid});observe('capture');queueMicrotask(()=>observe('capture-microtask'));},true);document.addEventListener('ab:quick-update',()=>__inputOrder.push({phase:'complete',amount:document.getElementById('amountInput')?.value,chip:document.querySelector('[data-ab-input-field=amount]')?.textContent}));` })).identifier;
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
const scopedKey = "abQuickInputDraft:v2:user-bin:house-home";
const keys = () => evaluate("Object.fromEntries(Object.keys(sessionStorage).filter(k=>k.startsWith('abQuickInputDraft')).map(k=>[k,JSON.parse(sessionStorage.getItem(k))]))");
const state = () => evaluate(`({amount:amountInput.value,memo:memoInput.value,category:catInput.value,payment:payInput.value,date:txDate.value,type:document.querySelector('#add input[name=type]:checked').value,raw:rawTextInput.value,smart:smartInput.value,valid:amountInput.validity.valid,error:amountInput.validationMessage,caret:[amountInput.selectionStart,amountInput.selectionEnd],manual:Object.fromEntries([...document.querySelectorAll('#add [name^=quick_manual_]')].map(e=>[e.name,e.value])),request:document.querySelector('#add [name=request_id]')?.value,description:document.querySelector('#abQuickInputDescription')?.textContent,chips:[...document.querySelectorAll('.abInputReview button')].map(e=>e.textContent),conflict:document.querySelector('.abQuickConflict')?.textContent,link:document.querySelector('.abQuickConflict a')?.getAttribute('href')})`);
async function navigate(path) {
  await page("Page.navigate", {url:"http://127.0.0.1:"+server.address().port+path});
  await until("document.readyState==='complete'&&!!document.getElementById('abV5Search')");
}
async function readySheet() {
  await until("document.body.classList.contains('abQuickInputOpen')&&document.querySelectorAll('.abInputReview button').length===5");
  await evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.target?.closest?.('.abQuickInputPanel')).map(a=>a.finished.catch(()=>{})))");
}
async function manualDateNative() {
  if (!await evaluate("quickMore.open")) await click("#quickMore summary");
  const before = await evaluate("txDate.value");
  await click("#txDate"); await key("ArrowUp", "ArrowUp", 38);
  const selected = await evaluate("txDate.value");
  check(!!selected && selected !== before, "native date segment selection changes actual date");
  return selected;
}
async function fresh() {
  currentCookie = fx.cookie; mode = "normal"; fx.db.transactions = structuredClone(original);
  await navigate(home); await evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('abQuickInputDraft')).forEach(k=>sessionStorage.removeItem(k))");
  await navigate(home); await click("[data-ab-quick-open]"); await readySheet();
}
async function smart(text) {
  await replace("smartInput", text);
  await until(`window.__classificationConsumed.some(v=>v===${JSON.stringify(text)})||document.querySelector('#add [name=quick_manual_category]').value==='1'`,"classification response consumed");
  await until(`JSON.parse(sessionStorage.getItem(${JSON.stringify(scopedKey)})||'{}').raw_text===${JSON.stringify(text)}`,"scoped draft saved");
}
async function submit(label) {
  const previous = await evaluate("window.__documentId"), completed = writeResponses;
  const count = saveRequests;
  await click("#add button[type=submit]");
  await until(()=>writeResponses>completed,label+" response completed");
  await until(`document.readyState==='complete'&&window.__documentId!==${JSON.stringify(previous)}&&!!document.getElementById('abV5Search')`,label+" redirect consumed");
  return saveRequests-count;
}
async function observe(label, detail={}) {report.observations.push({label,...detail,state:await state(),drafts:await keys(),submitted:structuredClone(submitted),rows:structuredClone(fx.db.transactions.filter(r=>!original.some(o=>o.id===r.id)))});}
try {
  report.chrome = await send("Browser.getVersion");
  await page("Page.enable"); await page("Runtime.enable"); await page("Network.enable");
  await page("Runtime.addBinding", {name:"__reportPageShow"});
  await page("Page.addScriptToEvaluateOnNewDocument", {source:"addEventListener('pageshow',e=>window.__reportPageShow(JSON.stringify({persisted:e.persisted,path:location.pathname})))"});
  await settings(); await page("Emulation.setDeviceMetricsOverride",{width:375,height:844,deviceScaleFactor:1,mobile:true});
  for(const [raw,amount] of [["점심 0만원",null],["점심 0.0만원",null],["점심 0억원",null],["점심 -₩1000",null],["점심 −1000원",null],["점심 ₩-1000원",null],["점심 1.5.0원",null],["점심 5000원.",5000],["주유 1.5만원.",15000]]) {
    await fresh();await smart(raw);const before=await state(),requests=saveRequests,count=fx.db.transactions.length;
    if(before.valid) await submit('review boundary '+raw);
    else {await click('#add button[type=submit]');await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");}
    if(amount===null)check(saveRequests===requests&&fx.db.transactions.length===count&&!before.valid,'zero sign currency and malformed decimal store zero '+raw);
    else check(saveRequests===requests+1&&fx.db.transactions.length===count+1&&fx.db.transactions.at(-1).amount===amount,'sentence punctuation preserves exact amount '+raw);
    await observe('review amount boundary',{raw,before,requests:saveRequests-requests,newRows:fx.db.transactions.length-count});
  }
  await fresh();await smart('커피 5000원 국민카드');await replace('catInput','');await replace('payInput','');await replace('memoInput','');
  await navigate(home+'&quick=1');await readySheet();let cleared=await state();
  check(cleared.category===''&&cleared.payment===''&&cleared.memo===''&&cleared.manual.quick_manual_category==='1'&&cleared.manual.quick_manual_payment==='1','explicit empty memo category payment restore as manual empties');
  const clearedCount=fx.db.transactions.length;await submit('explicit empty fields');const clearedRow=structuredClone(fx.db.transactions.at(-1));
  check(fx.db.transactions.length===clearedCount+1&&clearedRow.memo===''&&clearedRow.category===''&&clearedRow.payment_method==='','explicit empty fields remain empty in actual saved row');
  await observe('explicit empty fields saved',{before:cleared,saved:clearedRow});
  if(!process.argv.includes('--review-corrections-only')) {
  if (!process.argv.includes("--retry-only")) {
  for(const raw of ["1,,000",",1000","1000,","1e3","-10","1.5","0","2,000,000,001"]) {
    await fresh(); await replace("amountInput",raw); await evaluate("amountInput.setSelectionRange(1,Math.min(3,amountInput.value.length))");
    const before=await state(), requests=saveRequests, count=fx.db.transactions.length;
    await click('[data-ab-amount-add="1000"]'); const after=await state();
    check(after.amount===raw&&!after.valid&&JSON.stringify(after.caret)===JSON.stringify(before.caret),"increment preserves invalid source validity and selection "+raw);
    await click('#add button[type=submit]'); await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    check(saveRequests===requests&&fx.db.transactions.length===count,"invalid increment submits and stores zero "+raw);
    await observe("invalid increment",{raw,before,after,requests:saveRequests-requests,newRows:fx.db.transactions.length-count});
  }
  for(const [raw,amount] of [["점심 -10원",null],["점심 1.5원",null],["점심 1.5만원",15000],["점심 1.5 만원",15000],["점심 0.5천원",500],["점심 0.29백원",29]]) {
    await fresh(); await smart(raw); const before=await state(), requests=saveRequests, count=fx.db.transactions.length;
    if(amount===null){await click('#add button[type=submit]');await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");check(!before.valid&&saveRequests===requests&&fx.db.transactions.length===count,"natural invalid source stores zero "+raw);}
    else {await submit(raw);check(fx.db.transactions.at(-1).amount===amount&&fx.db.transactions.length===count+1,"natural exact won amount stored "+raw);}
    await observe("natural-language boundary",{raw,before,requests:saveRequests-requests,newRows:fx.db.transactions.length-count});
  }
  await fresh(); await smart("커피 5000원 국민카드"); const homeDraft=await keys();
  await navigate('/app?month=2026-07&household_id=house-trip&quick=1');await readySheet();
  check((await state()).amount==="","other household does not restore home draft");check((await keys())[scopedKey]?.amount==="5,000","home draft survives other household");
  await observe("cross household isolated",{before:homeDraft});
  await navigate(home+'&quick=1');await readySheet();check((await state()).amount==="5,000","return to household restores its draft");
  await navigate('/app?month=2026-07&household_id=house-trip&quick=1');await readySheet();
  await replace('smartInput','숙소 50000원 현금');await until("window.__classificationConsumed.includes('숙소 50000원 현금')");
  const tripKey='abQuickInputDraft:v2:user-bin:house-trip';await until(`JSON.parse(sessionStorage.getItem(${JSON.stringify(tripKey)})||'{}').amount==='50,000'`);
  await navigate(home+'&quick=1');await readySheet();check((await state()).amount==='5,000'&&(await keys())[tripKey]?.amount==='50,000',"both household drafts remain independently recoverable");
  // Choosing a spender must not change the authenticated draft identity.
  await click('#quickMore summary'); await click('#spenderInput').catch(()=>{});
  await evaluate("const s=document.querySelector('#add select[name=user_id]');if(s){s.focus();}");await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);
  await replace('memoInput','다른 지출자를 고른 초안');await until(`JSON.parse(sessionStorage.getItem(${JSON.stringify(scopedKey)})||'{}').memo==='다른 지출자를 고른 초안'`);
  check(Object.keys(await keys()).filter(k=>k.includes(':v2:')).every(k=>k.includes(':user-bin:')),"spender selection is not authentication identity");
  currentCookie=await fx.cookieFor('user-wifi');await navigate(home+'&quick=1');await readySheet();check((await state()).amount==="","different authenticated user does not restore first user draft");
  check((await keys())[scopedKey]?.amount==='5,000',"different user does not delete first user draft");
  await observe("different user isolated");
  currentCookie='';await page('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+home});await until("document.readyState==='complete'&&location.pathname==='/my'");
  check((await keys())[scopedKey]?.amount==='5,000',"signed-out page preserves scoped draft");
  currentCookie=fx.cookie;await navigate(home+'&quick=1');await readySheet();check((await state()).memo==='다른 지출자를 고른 초안',"same user login restores original draft");
  await fresh();await smart('어제 커피 5000원 국민카드');await navigate('/app?month=2026-08&household_id=house-home&quick=1&date=2026-08-03');await readySheet();
  let restored=await state();check(restored.date==='2026-07-14'&&restored.description.includes('2026-08-03')&&restored.description.includes('2026-07-14'),"month and explicit calendar conflict retain and describe draft date");
  await observe('calendar and draft date conflict');
  await fresh();await smart('커피 5000원 국민카드');await navigate(home+'&quick=1');await readySheet();
  await smart('택시 12000원 현금');let expected=await state();check(expected.memo==='택시'&&expected.category==='택시'&&expected.payment==='현금',"automatic restored fields follow new sentence");
  const count=fx.db.transactions.length;await submit('updated automatic fields');let saved=fx.db.transactions.at(-1);
  check(saved.amount===12000&&saved.memo===expected.memo&&saved.category===expected.category&&saved.payment_method===expected.payment&&fx.db.transactions.length===count+1,"automatic chips fields submission and saved row agree");
  check(!(await keys())[scopedKey],"confirmed matching submission clears scoped draft");await observe('automatic draft stored',{before:expected,saved});
  await fresh();await smart('커피 5000원 국민카드');
  await replace('memoInput','직접 메모');await replace('catInput','직접 분류');await replace('payInput','직접 결제');
  const manualSelectedDate = await manualDateNative();await replace('amountInput','');await navigate(home+'&quick=1');await readySheet();
  restored=await state();check(restored.amount===''&&restored.manual.quick_manual_amount==='1'&&!restored.valid,"explicitly cleared amount stays empty and manual after restore");
  await smart('택시 12000원 현금');restored=await state();check(restored.amount===''&&restored.memo==='직접 메모'&&restored.category==='직접 분류'&&restored.payment==='직접 결제'&&restored.date===manualSelectedDate&&restored.manual.quick_manual_date==='1',"manual values and cleared amount survive new sentence");
  await observe('manual and explicit empty draft');
  await replace('amountInput','1,,000');await navigate(home+'&quick=1');await readySheet();restored=await state();check(restored.amount==='1,,000'&&!restored.valid&&restored.manual.quick_manual_amount==='1',"invalid original text and error survive restore");
  await observe('invalid draft restored');
  await fresh();await smart('커피 6500원 국민카드');await navigate(home);await click('[data-ab-quick-open]');await readySheet();check((await state()).amount==='6,500',"normal button after refresh restores draft once");
  await replace('amountInput','7500');await click('[data-ab-quick-close]');await click('[data-ab-quick-open]');check((await state()).amount==='7,500',"close and reopen retain current edit");await observe('normal entry and reopen');
  await navigate(home+'&msg=unrelated');await click('[data-ab-quick-open]');await readySheet();check((await state()).amount==='7,500',"unrelated success message cannot delete draft");
  await observe('unrelated success preserves draft');
  await navigate(home);const currentDraft=(await keys())[scopedKey];
  await navigate(home+'&saved_rid='+currentDraft.request_id+'&saved_qd='+crypto.randomUUID()+'#quick');await readySheet();
  check((await state()).amount==='7,500',"old or unrelated submission token cannot clear newer draft");
  await click('[data-ab-quick-close]');await click('[data-ab-quick-open]');check((await state()).amount==='7,500',"hash entry reopens without applying an older draft");
  }
  let restored;
  await fresh();await smart('커피 7000원 국민카드');uncertainNext=true;let before=await state();await submit('unknown save');await readySheet();
  check(fx.db.transactions.filter(r=>r.id===before.request).length===1&&fx.db.transactions.find(r=>r.id===before.request).amount===7000,"unknown response stored one original row");
  await replace('amountInput','12000');const beforeRetry=await state(), requests=saveRequests;report.observations.push({label:'before conflicting retry',beforeRetry,drafts:await keys()});await submit('conflicting retry');await readySheet();restored=await state();
  check(saveRequests===requests+1&&restored.amount==='12,000'&&restored.request===before.request,"edited retry retains amount and original request identity");
  check(restored.conflict?.includes('초안을 보존')&&restored.link?.includes(before.request),"conflict remains with explicit existing record edit route");
  check((await keys())[scopedKey]?.amount==='12,000'&&fx.db.transactions.find(r=>r.id===before.request).amount===7000&&fx.db.transactions.filter(r=>r.id===before.request).length===1,"conflicting retry changes no row and preserves draft");
  await observe('unknown then edited retry',{before,beforeRetry,requests:saveRequests-requests});
  await replace('amountInput','7000');await submit('exact retry');check(!(await keys())[scopedKey]&&fx.db.transactions.filter(r=>r.id===before.request).length===1,"exact retry confirms one row and only its submitted draft");
  await fresh();await smart('어제 점심 12000 국민카드');let date=await state();check(date.description.includes(date.date)&&date.manual.quick_manual_date==='0',"natural date updates description without manual marker");
  await replace('txDate','');date=await state();check(!date.description.includes('2026-07-15 기록')&&date.description.includes('거래일을 확인'),"empty date description promises no specific storage date");
  const selectedDate=await manualDateNative();date=await state();check(date.description.includes(selectedDate)&&date.manual.quick_manual_date==='1',"manual date description matches actual date");await observe('date description');
  // The original unscoped format is quarantined rather than assigned to this user/ledger.
  await fresh();await evaluate(`sessionStorage.setItem('abQuickInputDraft',JSON.stringify({at:Date.now(),amount:'9999',memo:'legacy'}));sessionStorage.removeItem(${JSON.stringify(scopedKey)})`);await navigate(home+'&quick=1');await readySheet();
  check((await state()).amount===''&&!!(await keys()).abQuickInputDraft,"legacy draft is neither adopted nor deleted");
  await smart('택시 6000원 현금');await navigate(home);await evaluate(`const k=${JSON.stringify(scopedKey)},d=JSON.parse(sessionStorage.getItem(k));d.at=Date.now()-1800001;sessionStorage.setItem(k,JSON.stringify(d))`);await navigate(home+'&quick=1');await readySheet();check((await state()).amount==='',"expired draft is not restored");
  const member=fx.db.household_members.find(m=>m.household_id==='house-home'&&m.user_id==='user-bin'), role=member.role;member.role='viewer';
  await navigate(home+'&quick=1');check(!await evaluate("document.querySelector('#add form')"),"read-only user receives no draft write form");member.role=role;
  const blockedStorage=(await page('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'sessionStorage',{get(){throw Error('fixture storage denied')}})"})).identifier;
  await navigate(home+'&quick=1');await readySheet();await replace('amountInput','1200');check((await state()).amount==='1,200',"storage access failure keeps numeric input usable");await page('Page.removeScriptToEvaluateOnNewDocument',{identifier:blockedStorage});
  // V22.9.90(사용자 피드백 2026-10-30 "삭제하면 … 바로 삭제되게하고 되돌리기를 5초 유지해줘"): 웹 삭제는 누르면 바로 보낸다. V22.9.47 의 5초 대기와
  // 대기 중 되돌리기(Tab·마우스 멈춤, 다른 폼·실제 이동·뒤로 가기 때 보내기 전 취소)를 실제 Chrome 으로 보던 장면은 그 동작이 없어져 뺐다.
  // 즉시 전송·결과 모름 처리는 validate-lucian-b-v22947(가짜 DOM, 실제 함수), 되돌리기(/my/restore·알림 5초)는 validate-user-feedback-v22990 이 보고,
  // 실제 브라우저의 삭제 → 되돌리기는 RELEASE-CHECKLIST V22.9.90 절의 사람 확인이다.
  await page('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  // Visual and focus checks use actual Tab input at every requested width/theme.
  for(const width of [320,360,375,768,1280,1440])for(const theme of ['light','dark']){
    await settings(theme);await page('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await fresh();await smart('어제 점심 12000 국민카드');
    const metrics=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.abInputReview button,.abAmountActions button')].map(b=>b.getBoundingClientRect().height)})");
    check(!metrics.overflow&&metrics.buttons.every(h=>h>=44),'layout and 44px targets '+width+'/'+theme);
    let escaped=false;for(let n=0;n<30;n++){await key('Tab','Tab',9);escaped ||= !await evaluate("!!document.activeElement.closest('.abQuickInputPanel')");}check(!escaped,'native Tab stays inside sheet '+width+'/'+theme);
    if(width===320||width===1440)await shot('six-'+width+'-'+theme);
  }
  for(const tone of ['blue','emerald','violet','amber'])for(const theme of ['light','dark']){
    await settings(theme,tone,true);await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await fresh();await smart('커피 5000원 국민카드');
    check(await evaluate("document.documentElement.getAttribute('data-ab-resolved-theme')=== '"+theme+"'&&document.documentElement.getAttribute('data-ab-tone')==='"+tone+"'&&!!document.querySelector('.abInputReview button')"),'tone privacy reduced-motion input '+tone+'/'+theme);
  }
  check((await evaluate('window.__abErrors')).length===0,'native run has no browser runtime errors');
  }
} catch(error){report.failures.push(error.stack);report.error=String(error.stack);try{await shot('failure');report.debug={state:await state(),drafts:await keys(),invalid:await evaluate("[...document.querySelectorAll('#add input,#add select,#add button')].map(e=>({name:e.name,value:e.value,valid:e.validity?.valid,message:e.validationMessage,disabled:e.disabled}))")};}catch{}console.error(error.stack);}
finally {
  report.passed=report.checks.filter(c=>c.passed).length;report.total=report.checks.length;report.submitted=submitted;report.saveRequests=saveRequests;report.deleteResponses=deleteResponses;
  writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));console.log(`Lucian six native Chrome: ${report.passed}/${report.total} checks passed; ${report.failures.length} failures`);
  chrome.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fx.restore();delete globalThis.__AB_QA_FIXED_NOW_MS;if(report.failures.length)process.exitCode=1;
}
