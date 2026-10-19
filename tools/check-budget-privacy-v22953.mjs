import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createV2265QaFixture } from "../validation/qa-fixture.mjs";

const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--out")) throw new Error("Use --out <directory outside repository>.");
const out=resolve(option("--out")),repository=resolve(fileURLToPath(new URL("../",import.meta.url)));
const rel=relative(repository,out);if(!rel||(!rel.startsWith("..")&&!isAbsolute(rel)))throw new Error("Evidence must be outside repository.");
mkdirSync(out,{recursive:true});
const worker=process.argv.includes("--worker")?resolve(option("--worker")):join(repository,"src/index.js");
const app=(await import(pathToFileURL(worker))).default;
const report={node:process.version,sourceSha256:createHash("sha256").update(readFileSync(worker)).digest("hex"),checks:[],failures:[],records:[],submitted:[],requests:[],runtimeErrors:[]};
const check=(value,label)=>{report.checks.push({label,passed:!!value});if(!value)report.failures.push(label);};
const equal=(a,b,label)=>check(JSON.stringify(a)===JSON.stringify(b),label+" actual="+JSON.stringify(a));
globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-07-15T12:00:00+09:00");
const fx=await createV2265QaFixture();
const original=structuredClone(fx.db.accountbook_budgets),BASE="https://malhaebook.com";
let failAsset=false,saveResponses=0,inject="",activeHttp=0,scriptExecutionDisabled=false,bootstrapEpoch=0;
const completedBootstrap=new Map();
const fixtureFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{const url=new URL(String(input?.url||input));report.requests.push({path:url.pathname,method:init.method||"GET"});if(inject==="reject"&&url.pathname.endsWith("/accountbook_replace_budget_plan_v227")){inject="";return new Response(JSON.stringify({message:"synthetic refusal"}),{status:400,headers:{"content-type":"application/json"}});}return fixtureFetch(input,init);};
const server=createServer(async(req,res)=>{
  activeHttp++;const requestEpoch=bootstrapEpoch;
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if(failAsset&&req.url.startsWith("/assets/accountbook-budget-preview-")){res.writeHead(503,{"content-type":"text/plain","cache-control":"no-store"});res.end("synthetic asset unavailable");return;}
    const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(!["host","content-length","cookie","connection","accept-encoding","origin","referer"].includes(key))headers.set(key,String(value));
    headers.set("cookie",fx.cookie);headers.set("origin",BASE);
    if(req.method==="POST"&&req.url.startsWith("/my/budget-bulk/save"))report.submitted.push({body:[...new URLSearchParams(Buffer.concat(chunks).toString())],before:structuredClone(fx.db.accountbook_budgets)});
    const init={method:req.method,headers};if(chunks.length)init.body=Buffer.concat(chunks);
    const response=await app.fetch(new Request(BASE+req.url,init),fx.env,{}),bytes=Buffer.from(await response.arrayBuffer()),outgoing={};
    response.headers.forEach((value,key)=>{if(!["content-length","content-encoding","strict-transport-security"].includes(key))outgoing[key]=value;});
    if(outgoing.location)outgoing.location=outgoing.location.replace(BASE,"http://127.0.0.1:"+server.address().port);
    res.writeHead(response.status,outgoing);res.end(bytes);
    const requestPath=new URL(req.url,BASE).pathname;if(["/u/api/notifications","/u/api/favorites"].includes(requestPath)){if(!completedBootstrap.has(requestEpoch))completedBootstrap.set(requestEpoch,new Set());completedBootstrap.get(requestEpoch).add(requestPath);}
    if(req.method==="POST"&&req.url.startsWith("/my/budget-bulk/save")){saveResponses++;Object.assign(report.submitted.at(-1),{status:response.status,error:response.headers.get("x-budget-error"),location:outgoing.location,after:structuredClone(fx.db.accountbook_budgets)});}
  }catch(error){res.writeHead(500,{"content-type":"text/plain"});res.end(String(error.stack));}finally{activeHttp--;}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const chromePath=process.argv.includes("--chrome")?option("--chrome"):["C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(existsSync);
if(!chromePath)throw new Error("Chrome not found");
const chrome=spawn(chromePath,["--headless=new","--disable-background-timer-throttling","--disable-renderer-backgrounding","--disable-backgrounding-occluded-windows","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-pipe","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost","--user-data-dir="+join(out,"profile"),"about:blank"],{windowsHide:true,stdio:["ignore","ignore","ignore","pipe","pipe"]});
let sequence=0,buffer="";const pending=new Map();
chrome.stdio[4].on("data",chunk=>{buffer+=chunk;for(let end=buffer.indexOf("\0");end>=0;end=buffer.indexOf("\0")){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==="Runtime.exceptionThrown")report.runtimeErrors.push(message.params);if(message.method==="Runtime.bindingCalled"&&message.params.name==="__budgetNativeTransition"){report.nativeTransitionEvents ||= [];report.nativeTransitionEvents.push(JSON.parse(message.params.payload));}const task=pending.get(message.id);if(!task)continue;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);}});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout "+method));},15000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+"\0");});
const target=await send("Target.createTarget",{url:"about:blank"}),session=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
const page=(method,params)=>send(method,params,session.sessionId);
const evaluate=async expression=>{const r=await page("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(predicate,label="condition"){const deadline=Date.now()+12000;while(Date.now()<deadline){if(typeof predicate==="function"?await predicate():await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("Did not complete "+label);}
async function key(key,code=key,virtualKey,modifiers=0){for(const type of["keyDown","keyUp"])await page("Input.dispatchKeyEvent",{type,key,code,...(key==="Enter"?{text:"\r",unmodifiedText:"\r"}:{}),...(virtualKey?{windowsVirtualKeyCode:virtualKey}:{}),modifiers});}
async function click(selector) {
  await page("Page.bringToFront");
  if(scriptExecutionDisabled){
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const type of["mousePressed","mouseReleased"])await page("Input.dispatchMouseEvent",{type,button:"left",clickCount:1,...point});
    return;
  }
  await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");
  await evaluate("document.activeViewTransition?.finished.catch(()=>{})");
  const point=await evaluate(`(async()=>{
    const element=document.querySelector(${JSON.stringify(selector)});
    if(!element)throw Error('missing click target '+${JSON.stringify(selector)});
    element.scrollIntoView({block:'center',behavior:'instant'});
    let previous='',stable=0;
    for(let frame=0;frame<180;frame++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      const hit=document.elementFromPoint(x,y),position=[x,y,scrollX,scrollY].join('|');
      stable=position===previous&&hit&&(hit===element||element.contains(hit))?stable+1:0;
      if(stable>=2)return{x,y,hit:hit.tagName};
      previous=position;
    }
    throw Error('click target did not settle '+${JSON.stringify(selector)});
  })()`);
  report.clicks ||= [];report.clicks.push({selector,point});
  for(const type of["mousePressed","mouseReleased"])await page("Input.dispatchMouseEvent",{type,button:"left",clickCount:1,x:point.x,y:point.y});
}
async function replace(selector,text){await key("Escape","Escape",27);await click(selector);await key("a","KeyA",65,2);if(text)await page("Input.insertText",{text});else await key("Backspace","Backspace",8);}
async function navigate(path,ready=true){bootstrapEpoch++;const before=await evaluate("performance.timeOrigin");await page("Page.navigate",{url:origin+path});await until(`performance.timeOrigin!==${before}&&document.readyState==='complete'&&!!document.querySelector('#budgetBulkForm,#budgetPlanForm')`,"budget document");if(ready)await until("!!document.querySelector('form[data-budget-preview-ready]')","preview asset");await until(()=>activeHttp===0&&completedBootstrap.get(bootstrapEpoch)?.size===2,"existing notification/favorite bootstrap responses");await evaluate("document.activeViewTransition?.finished.catch(()=>{})");await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");}
const current=()=>evaluate(`({totals:Object.fromEntries([...document.querySelectorAll('[data-budget-total]')].map(e=>[e.dataset.budgetTotal,e.textContent])),state:document.querySelector('[data-budget-preview]')?.dataset.state,errors:document.querySelector('[data-budget-errors]')?.textContent,values:[...document.querySelectorAll('#incomeRows input,#expenseRows input')].map(e=>({name:e.name,value:e.value,valid:e.validity.valid,caret:e.selectionStart})),fingerprint:document.querySelector('[name=plan_fingerprint]')?.value,active:document.activeElement?.name,live:document.querySelector('[data-budget-live]')?.textContent})`);
const capture=async name=>{writeFileSync(join(out,name+".png"),Buffer.from((await page("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})).data,"base64"));writeFileSync(join(out,name+".html"),await evaluate("document.documentElement.outerHTML"));};
async function submit(){bootstrapEpoch++;const count=saveResponses,before=await evaluate("performance.timeOrigin");await click('form[action="/my/budget-bulk/save"] button[type="submit"]');await until(()=>Promise.resolve(saveResponses>count),"POST response");await until(`performance.timeOrigin!==${before}&&document.readyState==='complete'&&!!document.querySelector('form[data-budget-preview-ready]')`,"POST render");await until(()=>activeHttp===0&&completedBootstrap.get(bootstrapEpoch)?.size===2,"POST notification/favorite bootstrap responses");await evaluate("document.activeViewTransition?.finished.catch(()=>{})");}
const budgetRows=()=>fx.db.accountbook_budgets.filter(row=>row.household_id==="house-home"&&row.month==="2026-07").map(({category,amount})=>({category,amount})).sort((a,b)=>a.category.localeCompare(b.category));
await page("Page.enable");await page("Runtime.enable");await page("Network.enable");report.browser=await send("Browser.getVersion");
// DevTools viewport/media/script emulation can legitimately skip a native CSS
// cross-document transition. Observe all three lifecycle promises, including
// ready (not just finished), and retain those outcomes separately from uncaught
// application exceptions. This instrumentation never changes product styles.
await page("Runtime.addBinding",{name:"__budgetNativeTransition"});
await page("Page.addScriptToEvaluateOnNewDocument",{source:`
  for(const type of ['pagereveal','pageswap'])addEventListener(type,event=>{
    const transition=event.viewTransition;if(!transition)return;
    for(const phase of ['ready','updateCallbackDone','finished'])transition[phase].then(
      ()=>window.__budgetNativeTransition(JSON.stringify({type,phase,status:'fulfilled'})),
      error=>window.__budgetNativeTransition(JSON.stringify({type,phase,status:'rejected',name:error.name,message:error.message}))
    );
  });
`});
const amountSelector = '#expenseRows [name="budget_amount"]';
const eye = '.abNavMobileTop [data-ab-hide-toggle]';
const quiet = () => new Promise(resolve => setTimeout(resolve, 750));
const hidden = () => evaluate("document.documentElement.hasAttribute('data-ab-hide-amounts')");
const liveText = () => evaluate("document.querySelector('[data-budget-live]').textContent");
async function observe() {
  await evaluate(`(() => {
    const live = document.querySelector('[data-budget-live]');
    window.__privacyEvents = [];
    const record = (kind, text) => window.__privacyEvents.push({kind,text,hidden:document.documentElement.hasAttribute('data-ab-hide-amounts'),at:performance.now()});
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
    Object.defineProperty(live,'textContent',{configurable:true,get(){return descriptor.get.call(this)},set(value){record('write',String(value));descriptor.set.call(this,value)}});
    new MutationObserver(records => records.forEach(m => record('mutation',live.textContent))).observe(live,{childList:true,subtree:true,characterData:true});
    window.addEventListener('ab:amount-privacy',()=>record('privacy',live.textContent));
    window.addEventListener('pagehide',e=>record('pagehide:'+e.persisted,live.textContent));
    window.addEventListener('pageshow',e=>record('pageshow:'+e.persisted,live.textContent));
  })()`);
}
async function retain(path, kind) {
  const events=await evaluate("window.__privacyEvents"), snapshot=await current();
  // Inspect every actual write, not merely the final string. E may subsequently
  // wrap the text, so mutation notifications are retained as additional evidence.
  const leaks=events.filter(e=>e.hidden&&/예상 수입 [\d,]+원|계획한 지출 [\d,]+원|계획상 차액 -?[\d,]+원/.test(e.text));
  check(leaks.length===0,path+" "+kind+" no monetary summary at any hidden transition");
  report.records.push({path,kind,events,snapshot});
  await evaluate("window.__privacyEvents=[]");
}
async function setPrivacy(value) { if(await hidden()!==value)await click(eye);equal(await hidden(),value,"eye sets current privacy "+value); }
try {
  await page("Emulation.setDeviceMetricsOverride",{width:375,height:900,deviceScaleFactor:1,mobile:false});
  const secondTarget=await send("Target.createTarget",{url:"about:blank"});
  const secondSession=await send("Target.attachToTarget",{targetId:secondTarget.targetId,flatten:true});
  const other=(method,params)=>send(method,params,secondSession.sessionId);
  const otherEval=async expression=>{const r=await other("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
  await other("Page.enable");await other("Runtime.enable");
  await other("Page.addScriptToEvaluateOnNewDocument",{source:`for(const type of ['pagereveal','pageswap'])addEventListener(type,e=>{if(e.viewTransition)for(const name of ['ready','updateCallbackDone','finished'])e.viewTransition[name].catch(()=>{});});`});
  await other("Emulation.setDeviceMetricsOverride",{width:375,height:900,deviceScaleFactor:1,mobile:false});
  async function otherEye(){
    await other("Page.bringToFront");
    const point=await otherEval(`(async()=>{await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));const e=document.querySelector(${JSON.stringify(eye)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    for(const type of["mousePressed","mouseReleased"])await other("Input.dispatchMouseEvent",{type,button:"left",clickCount:1,...point});
  }
  for(const path of["/my/settings","/budgets"]){
    const url=path+"?household_id=house-home&month=2026-07";
    fx.db.accountbook_budgets=[{id:"legacy",household_id:"house-home",month:"2026-07",category:"__total",amount:67890}];
    await navigate(url);await setPrivacy(false);await observe();
    const startRequests=report.requests.length,startSubmissions=report.submitted.length;
    await replace(amountSelector,"1234");await setPrivacy(true);await quiet();
    check(!(await liveText()).includes("1,234"),path+" immediate hide removes pending numeric summary");
    equal((await current()).totals,{income:"0원",expense:"1,234원",net:"-1,234원"},path+" privacy leaves calculated totals unchanged");
    check(await evaluate("[...document.querySelectorAll('[data-budget-total] .abPrivateAmount,.abBudgetLegacy .abPrivateAmount')].length===4&&[...document.querySelectorAll('[data-budget-total] .abPrivateAmount,.abBudgetLegacy .abPrivateAmount')].every(e=>getComputedStyle(e).filter==='blur(10px)')"),path+" visible totals and legacy amount retain blur");
    await retain(path,"input then eye click");
    await setPrivacy(false);await replace(amountSelector,"2345");await quiet();check((await liveText()).includes("2,345원"),path+" visible latest summary announced after debounce");
    await setPrivacy(true);check(!(await liveText()).includes("2,345"),path+" already announced total cleared synchronously");await retain(path,"already announced then hide");
    for(const value of[false,true,false,true])await setPrivacy(value);
    await quiet();check(!(await liveText()).includes("2,345"),path+" rapid toggles never replay old summary");await retain(path,"rapid toggles");
    await replace(amountSelector,"3456");await quiet();check(!(await liveText()).includes("3,456"),path+" hidden edit uses general notice");await retain(path,"hidden input");
    await setPrivacy(false);await quiet();check(!(await liveText()).includes("3,456"),path+" reveal alone does not replay hidden edit");
    await replace(amountSelector,"4001");await key("a","KeyA",65,2);await page("Input.insertText",{text:"4002"});
    await new Promise(resolve=>setTimeout(resolve,150));
    check(!(await liveText()).includes("4,001")&&!(await liveText()).includes("4,002"),path+" totals remain debounced during native typing");
    await quiet();check((await liveText()).includes("4,002원")&&!(await liveText()).includes("4,001"),path+" one pending notice uses latest calculated totals");await retain(path,"650ms latest-result batching");
    await replace(amountSelector,"4567");await quiet();check((await liveText()).includes("4,567원")&&!(await liveText()).includes("3,456"),path+" new visible edit announces latest sum");await retain(path,"reveal then new edit");
    // Real same-origin tab; the second tab clicks the existing eye control. No
    // synthetic StorageEvent or manual privacy event is used for this branch.
    equal(report.requests.length,startRequests,path+" single-tab editing makes zero data requests");
    await other("Page.navigate",{url:origin+url});
    await until(async()=>await otherEval("document.readyState==='complete'&&!!document.querySelector('[data-ab-hide-toggle]')"),"second real tab ready");
    await until(()=>activeHttp===0,"second tab bootstrap");
    const afterOtherBootstrap=report.requests.length;
    await evaluate("window.__storageEvents=[];window.addEventListener('storage',e=>window.__storageEvents.push({key:e.key,newValue:e.newValue,trusted:e.isTrusted,url:e.url}))");
    await otherEye();await until(()=>hidden(),"real storage hide");await quiet();
    check(!(await liveText()).includes("4,567"),path+" other tab clears already announced summary");
    const storage=await evaluate("window.__storageEvents");check(storage.some(e=>e.key==="abHideAmounts"&&e.newValue==="1"&&e.trusted),path+" actual trusted same-origin storage synchronization");report.records.push({path,kind:"real two-tab storage",storage});await retain(path,"other tab hide");
    await otherEye();await until(async()=>!(await hidden()),"real storage reveal");
    await replace(amountSelector,"5678");await otherEye();await until(()=>hidden(),"pending summary real storage hide");await quiet();await retain(path,"other tab cancels pending summary");
    await replace(amountSelector,"2000000001");await quiet();const errorText=await liveText();
    check(errorText.includes("1행")&&errorText.includes("20억원"),path+" numeric row and amount-limit error remains while hidden");await setPrivacy(false);await setPrivacy(true);equal(await liveText(),errorText,path+" privacy preserves validation instruction exactly");await retain(path,"error guidance");
    await setPrivacy(false);await replace(amountSelector,"6789");await quiet();
    const stable=await liveText();await otherEval("localStorage.setItem('unrelated-budget-qa','1')");await quiet();equal(await liveText(),stable,path+" unrelated storage key does not change live notice");
    await click('#expenseRows [name="budget_category"]');await key("a","KeyA",65,2);await page("Input.imeSetComposition",{text:"외",selectionStart:1,selectionEnd:1});
    equal((await current()).state,"composing",path+" browser IME model enters composition");
    // Change real shared storage from the other tab without foregrounding it:
    // switching native tab focus can itself commit Chrome's IME composition.
    const selection=await evaluate("({start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,name:document.activeElement.name})");
    await otherEval("localStorage.setItem('abHideAmounts','1')");await until(()=>hidden(),"IME remote hide");
    check(!(await liveText()).includes("6,789"),path+" IME hide clears preceding total");
    await otherEval("localStorage.setItem('abHideAmounts','0')");await until(async()=>!(await hidden()),"IME remote reveal");await quiet();
    equal(await evaluate("({start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,name:document.activeElement.name})"),selection,path+" privacy preserves active composition selection");
    equal((await current()).state,"composing",path+" reveal does not calculate uncommitted composition");check(!(await liveText()).includes("6,789"),path+" reveal during IME does not replay total");await retain(path,"IME model privacy");
    await page("Input.insertText",{text:"외식"});await quiet();equal((await current()).state,"valid",path+" confirmed composition calculates normally");
    // Lifecycle model explicitly distinguished from real navigation and actual
    // persisted=true BFCache restoration, which remains a manual requirement.
    await replace(amountSelector,"7890");
    await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");await quiet();
    check(!(await liveText()).includes("7,890"),path+" pagehide model cancels pending total");
    await evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));localStorage.setItem('abHideAmounts','1');document.documentElement.setAttribute('data-ab-hide-amounts','')");await quiet();
    check(!(await liveText()).includes("6,789")&&!(await liveText()).includes("7,890"),path+" pageshow model clears old total before later theme restoration");
    await retain(path,"lifecycle model with late privacy attribute");
    // All editing and privacy actions above preserve stored values and make no
    // budget POST. The second tab has normal bootstrap reads, separately counted.
    equal(report.submitted.length,startSubmissions,path+" editing and privacy make zero automatic saves");
    equal(report.requests.length,afterOtherBootstrap,path+" two-tab privacy and editing make zero additional data requests");
    equal(budgetRows(),[{category:"__total",amount:67890}],path+" all privacy actions preserve stored row set");
    report.records.push({path,kind:"request accounting",editingStart:startRequests,totalRequests:report.requests.length,requests:report.requests.slice(startRequests)});
    await navigate(url);check(await hidden(),path+" real reentry honors initially hidden state");await observe();await replace(amountSelector,"8901");await quiet();await retain(path,"initially hidden after real reentry");
    // Seed the row-cap boundary as a DOM model, then use the real add button.
    // Reset restores the actual initial rows before the native save below.
    await evaluate("(()=>{const container=document.querySelector('#expenseRows'),template=container.firstElementChild;while(document.querySelectorAll('#incomeRows [name=income_name],#expenseRows [name=budget_category]').length<200)container.appendChild(template.cloneNode(true));container.querySelector('[name=budget_amount]').dispatchEvent(new Event('input',{bubbles:true}));})()");
    await quiet();
    await click('[data-add="expense"]');await quiet();
    report.records.push({path,kind:"row-cap model",snapshot:await current(),events:await evaluate("window.__privacyEvents"),rows:await evaluate("document.querySelectorAll('#incomeRows [name=income_name],#expenseRows [name=budget_category]').length")});
    check((await liveText()).includes("200행"),path+" row-cap model retains numeric instruction");
    await setPrivacy(false);await setPrivacy(true);check((await liveText()).includes("200행"),path+" row-cap instruction survives privacy transitions");
    await evaluate("document.querySelector('#budgetBulkForm,#budgetPlanForm').reset()");await replace(amountSelector,"8901");await quiet();
    await capture(path==="/budgets"?"budgets-hidden":"settings-hidden");
    equal((await current()).values.find(e=>e.name==="budget_amount").value,"8901",path+" privacy retains actual submitted value");
    await submit();equal(budgetRows(),[{category:"외식",amount:8901}],path+" native hidden form saves exact unchanged amount");
    equal((await current()).totals.expense,"8,901원",path+" saved plan rerenders same sum");
    equal(report.submitted.at(-1).body.filter(([key])=>key==="budget_amount")[0][1],"8901",path+" native POST retains amount bytes");
    await setPrivacy(false);
  }
  check(report.runtimeErrors.length===0,"no uncaught browser runtime errors");
}catch(error){report.failures.push(error.stack);try{await capture("failure");report.debug=await current();report.lastEvents=await evaluate("window.__privacyEvents");}catch{}console.error(error.stack);}
finally{report.passed=report.checks.filter(c=>c.passed).length;report.total=report.checks.length;writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");console.log(`V22.9.53 privacy Chrome: ${report.passed}/${report.total} checks passed; ${report.failures.length} failures`);chrome.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fx.restore();delete globalThis.__AB_QA_FIXED_NOW_MS;if(report.failures.length)process.exitCode=1;}
