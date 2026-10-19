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
const chrome=spawn(chromePath,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-pipe","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost","--user-data-dir="+join(out,"profile"),"about:blank"],{windowsHide:true,stdio:["ignore","ignore","ignore","pipe","pipe"]});
let sequence=0,buffer="";const pending=new Map();
chrome.stdio[4].on("data",chunk=>{buffer+=chunk;for(let end=buffer.indexOf("\0");end>=0;end=buffer.indexOf("\0")){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==="Runtime.exceptionThrown")report.runtimeErrors.push(message.params);if(message.method==="Runtime.bindingCalled"&&message.params.name==="__budgetNativeTransition"){report.nativeTransitionEvents ||= [];report.nativeTransitionEvents.push(JSON.parse(message.params.payload));}const task=pending.get(message.id);if(!task)continue;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);}});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout "+method));},15000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+"\0");});
const target=await send("Target.createTarget",{url:"about:blank"}),session=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
const page=(method,params)=>send(method,params,session.sessionId);
const evaluate=async expression=>{const r=await page("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(predicate,label="condition"){const deadline=Date.now()+12000;while(Date.now()<deadline){if(typeof predicate==="function"?await predicate():await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("Did not complete "+label);}
async function key(key,code=key,virtualKey,modifiers=0){for(const type of["keyDown","keyUp"])await page("Input.dispatchKeyEvent",{type,key,code,...(key==="Enter"?{text:"\r",unmodifiedText:"\r"}:{}),...(virtualKey?{windowsVirtualKeyCode:virtualKey}:{}),modifiers});}
async function click(selector) {
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
try{
  for(const path of["/my/settings","/budgets"]){
    const url=path+"?household_id=house-home&month=2026-07",label=path==="/budgets"?"budgets":"settings";
    fx.db.accountbook_budgets=original.filter(row=>!(row.household_id==="house-home"&&row.month==="2026-07"));
    await page("Emulation.setDeviceMetricsOverride",{width:375,height:900,deviceScaleFactor:1,mobile:false});await navigate(url);
    equal((await current()).totals,{income:"0원",expense:"0원",net:"0원"},path+" empty initial preview");
    check(await evaluate("[...document.querySelectorAll('[data-budget-total]')].every(e=>e.getAttribute('aria-live')==='off')&&document.querySelectorAll('[data-budget-live][aria-live=polite]').length===1"),path+" visible output statuses are not additional live regions");
    const startRequests=report.requests.length,startWrites=report.submitted.length;
    await replace('#incomeRows [name="income_amount"]',"1,000");await replace('#expenseRows [name="budget_amount"]',"1.5만원");
    equal((await current()).totals,{income:"1,000원",expense:"15,000원",net:"-14,000원"},path+" native values produce negative preview");
    check(await evaluate("!!document.querySelector('[data-budget-preview]')&&document.querySelector('[data-budget-preview-state]').textContent.includes('저장할 수')"),path+" preview survives legacy cleanup and negative plan is allowed");
    for(const text of["1e3","-10","1.5","1.5원","1,,000",",1000","1000,","abc","2,000,000,001"]){await replace('#expenseRows [name="budget_amount"]',text);const s=await current();check(s.state==="invalid"&&s.values.find(e=>e.name==="budget_amount").value===text&&s.totals.expense==="계산 보류",path+" raw invalid input preserved "+text);await click('form[action="/my/budget-bulk/save"] button[type="submit"]');equal(report.submitted.length,startWrites,path+" invalid input submits zero requests "+text);}
    await replace('#expenseRows [name="budget_amount"]',"12000");check((await current()).values.find(e=>e.name==="budget_amount").valid,path+" direct correction clears custom validity");
    await key("Home","Home",36);await key("ArrowRight","ArrowRight",39);await page("Input.insertText",{text:"5"});
    equal((await current()).values.find(e=>e.name==="budget_amount").value,"152000",path+" middle insertion preserves exact raw edit");
    await key("ArrowRight","ArrowRight",39,8); // Shift selection through a native key event.
    await replace('#expenseRows [name="budget_amount"]',"1.5만원");
    await click('[data-add="income"]');equal(await evaluate("document.querySelectorAll('#incomeRows [name=income_name]').length"),3,path+" add creates exactly one row");
    await replace('#incomeRows > :nth-child(3) [name="income_name"]',"");await replace('#incomeRows > :nth-child(3) [name="income_amount"]',"500");
    check(await evaluate("document.querySelector('#incomeRows > :nth-child(3) [data-budget-row-note]').textContent.includes('부수입')"),path+" default income name shown by current row position");
    await click('#incomeRows > :nth-child(1) [data-budget-remove]');check(await evaluate("document.querySelector('#incomeRows > :nth-child(2) [data-budget-row-note]').textContent.includes('상여/성과급')"),path+" removing prior row changes default name consistently");
    await click('[data-add="expense"]');const count=await evaluate("document.querySelectorAll('#expenseRows [name=budget_category]').length");
    await replace(`#expenseRows > :nth-child(${count}) [name="budget_category"]`,"/외식");await replace(`#expenseRows > :nth-child(${count}) [name="budget_amount"]`,"15000");
    equal((await current()).totals,{income:"500원",expense:"15,000원",net:"-14,500원"},path+" normalized identical duplicate counted once");
    await replace(`#expenseRows > :nth-child(${count}) [name="budget_amount"]`,"16000");check((await current()).state==="invalid",path+" conflicting duplicate is invalid");
    await click(`#expenseRows > :nth-child(${count}) [data-budget-remove]`);check((await current()).state==="valid",path+" removing conflict clears errors and validity");
    equal(report.requests.length,startRequests,path+" editing makes zero additional data requests");equal(report.submitted.length,startWrites,path+" editing makes zero autosaves");
    report.editing ||= [];report.editing.push({page:path,dataBefore:startRequests,dataAfter:report.requests.length,additionalDataRequests:report.requests.length-startRequests,saveBefore:startWrites,saveAfter:report.submitted.length,autosaves:report.submitted.length-startWrites});
    // CDP composition is browser emulation, distinct from a physical Korean IME.
    await click('#expenseRows [name="budget_category"]');await key("a","KeyA",65,2);await page("Input.imeSetComposition",{text:"외",selectionStart:1,selectionEnd:1});
    check((await current()).state==="composing",path+" composition is pending rather than a confirmed error");await page("Input.insertText",{text:"외식"});check((await current()).state==="valid",path+" composition commit recalculates without replacing focus");
    const beforeSubmit=await current();await submit();const rows=budgetRows();equal(rows,[{category:"__income:상여/성과급",amount:500},{category:"외식",amount:15000}].sort((a,b)=>a.category.localeCompare(b.category)),path+" actual native form stores explicit expected complete plan");
    equal((await current()).totals,{income:"500원",expense:"15,000원",net:"-14,500원"},path+" rerender matches preview and actual stored rows");report.records.push({path,beforeSubmit,submitted:report.submitted.at(-1),rows,after:await current()});
    await replace('#expenseRows [name="budget_amount"]',"0");await submit();check(!budgetRows().some(row=>row.category==="외식"),path+" changing an existing row to zero removes it after whole replacement");
    await replace('#expenseRows [name="budget_amount"]',"700");inject="reject";const fp=(await current()).fingerprint;await submit();const failure=await current();check(failure.values.find(e=>e.name==="budget_amount").value==="700"&&failure.fingerprint===fp,path+" failed native submission preserves raw editor and fingerprint");
    check(await evaluate("document.querySelector('[data-budget-reload]').href.includes("+JSON.stringify(path)+")"),path+" failure provides explicit correct reload route");await submit();check(budgetRows().some(row=>row.category==="외식"&&row.amount===700),path+" corrected retry can save after failure");
    // Browser reset and pageshow probes are deliberately classified as model
    // events; navigation/re-entry above uses real document transitions.
    await replace('#expenseRows [name="budget_amount"]',"900");await evaluate("document.querySelector('#budgetBulkForm,#budgetPlanForm').reset()");equal((await current()).totals.expense,"700원",path+" form reset restores original displayed editor");
    await navigate(url);equal((await current()).totals.expense,"700원",path+" real reentry reflects saved plan");
    for(const scope of[{house:"house-home",month:"2026-08",amount:"300"},{house:"house-trip",month:"2026-07",amount:"400"}]){
      const before=structuredClone(fx.db.accountbook_budgets.filter(row=>!(row.household_id===scope.house&&row.month===scope.month)));
      await navigate(path+"?household_id="+scope.house+"&month="+scope.month);
      await replace('#expenseRows [name="budget_amount"]',scope.amount);await submit();
      equal(fx.db.accountbook_budgets.filter(row=>!(row.household_id===scope.house&&row.month===scope.month)),before,path+" scope switch preserves all other stored rows "+scope.house+"/"+scope.month);
      check(fx.db.accountbook_budgets.some(row=>row.household_id===scope.house&&row.month===scope.month&&row.category==="외식"&&row.amount===Number(scope.amount)),path+" native switch saves only chosen scope");
    }
    await navigate(url);await replace('#expenseRows [name="budget_amount"]',"901");
    await navigate(path+"?household_id=house-home&month=2026-08");
    const history=await page("Page.getNavigationHistory"),previous=history.entries[history.currentIndex-1],timeOrigin=await evaluate("performance.timeOrigin");
    await page("Page.navigateToHistoryEntry",{entryId:previous.id});
    await until(`performance.timeOrigin!==${timeOrigin}&&document.readyState==='complete'&&!!document.querySelector('form[data-budget-preview-ready]')`,"real history return");
    const restored=await current(),restoredAmount=restored.values.find(e=>e.name==="budget_amount").value;
    check(["901","700"].includes(restoredAmount)&&restored.totals.expense===(restoredAmount==="901"?"901원":"700원"),path+" actual history restoration recalculates observed browser values");
    report.records.push({path,kind:"actual history restoration",restored,navigation:await evaluate("({type:performance.getEntriesByType('navigation')[0]?.type})")});
    // Model-only restore probe, separately retained from the real history event.
    await evaluate("document.querySelector('#expenseRows [name=budget_amount]').value='321';window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
    equal((await current()).totals.expense,"321원",path+" model pageshow restore recalculates current field");
    await navigate(url);
    for(const width of[320,375,768,1280])for(const theme of["light","dark"]){
      await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('ab:appearance:tone','blue')`);await page("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:false});await navigate(url);
      const layout=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,theme:document.documentElement.getAttribute('data-ab-resolved-theme'),preview:!!document.querySelector('[data-budget-preview]'),targets:[...document.querySelectorAll('[data-budget-remove]')].map(e=>e.getBoundingClientRect().height),cut:[...document.querySelectorAll('[data-budget-preview] output,[data-budget-row-note]')].filter(e=>e.getClientRects().length).some(e=>e.scrollWidth>e.clientWidth+1)})");
      check(!layout.overflow&&!layout.cut&&layout.preview&&layout.theme===theme&&layout.targets.every(h=>h>=44),path+" layout theme and 44px controls "+width+"/"+theme);await click('[data-budget-preview]');await capture(label+"-"+width+"-"+theme);
    }
    for(const tone of["blue","emerald","violet","amber"])for(const theme of["light","dark"]){
      await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('ab:appearance:tone',${JSON.stringify(tone)})`);await navigate(url);
      await replace('#expenseRows [name="budget_amount"]',"1.5");
      const contrast=await evaluate(`(()=>{const root=document.querySelector('[data-budget-preview]'),error=root.querySelector('[data-budget-errors]');const rgb=s=>(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);const lum=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const bg=lum(getComputedStyle(root).backgroundColor),fg=lum(getComputedStyle(error).color);return{ratio:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05),theme:document.documentElement.getAttribute('data-ab-resolved-theme'),tone:document.documentElement.getAttribute('data-ab-tone'),invalid:root.dataset.state,off:[...root.querySelectorAll('output')].every(e=>e.getAttribute('aria-live')==='off')};})()`);
      check(contrast.ratio>=4.5&&contrast.theme===theme&&contrast.tone===tone&&contrast.invalid==="invalid"&&contrast.off,path+" error contrast and non-live totals "+tone+"/"+theme);
      if(tone==="blue")await capture(label+"-invalid-"+theme);
      await replace('#expenseRows [name="budget_amount"]',"700");
    }
    await click('#expenseRows [name="budget_amount"]');await key("Tab","Tab",9);check(await evaluate("document.activeElement!==document.body&&getComputedStyle(document.activeElement).outlineStyle!=='none'"),path+" native Tab retains visible focus");
    await evaluate("localStorage.setItem('abHideAmounts','1')");await page("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});await navigate(url);await replace('#expenseRows [name="budget_amount"]',"1000");
    check(await evaluate("document.documentElement.hasAttribute('data-ab-hide-amounts')&&!!document.querySelector('[data-budget-total] .abPrivateAmount')&&getComputedStyle(document.querySelector('[data-budget-total] .abPrivateAmount')).filter.includes('blur')&&matchMedia('(prefers-reduced-motion: reduce)').matches"),path+" dynamic preview respects privacy and reduced motion");await evaluate("localStorage.setItem('abHideAmounts','0')");
    failAsset=true;await page("Network.setCacheDisabled",{cacheDisabled:true});await navigate(url,false);check(await evaluate("!document.querySelector('form[data-budget-preview-ready]')"),path+" asset failure leaves native form usable");await replace('#expenseRows [name="budget_amount"]',"1200");const n=saveResponses,fallbackOrigin=await evaluate("performance.timeOrigin");await click('form[action="/my/budget-bulk/save"] button[type="submit"]');await until(()=>saveResponses>n,"fallback native POST");await until(`performance.timeOrigin!==${fallbackOrigin}&&document.readyState==='complete'`,"fallback response document");await until(()=>activeHttp===0,"fallback bootstrap");await evaluate("document.activeViewTransition?.finished.catch(()=>{})");check(budgetRows().some(row=>row.amount===1200&&row.category==="외식"),path+" asset failure native POST still verifies and saves");failAsset=false;await page("Network.setCacheDisabled",{cacheDisabled:false});
    scriptExecutionDisabled=true;await page("Emulation.setScriptExecutionDisabled",{value:true});await page("Page.navigate",{url:origin+url});await until("document.readyState==='complete'&&!!document.querySelector('form[action=\"/my/budget-bulk/save\"]')","no script form");await replace('#expenseRows [name="budget_amount"]',"1300");const nojs=saveResponses,nojsOrigin=await evaluate("performance.timeOrigin");await click('form[action="/my/budget-bulk/save"] button[type="submit"]');await until(()=>saveResponses>nojs,"no JS native POST");await until(`performance.timeOrigin!==${nojsOrigin}&&document.readyState==='complete'`,"no JS response document");await until(()=>activeHttp===0,"no JS bootstrap");await evaluate("document.activeViewTransition?.finished.catch(()=>{})");await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");check(budgetRows().some(row=>row.amount===1300&&row.category==="외식"),path+" JavaScript-disabled native form preserves server validation");await page("Emulation.setScriptExecutionDisabled",{value:false});scriptExecutionDisabled=false;
  }
  check(report.runtimeErrors.length===0,"no uncaught browser runtime errors");
}catch(error){report.failures.push(error.stack);try{await capture("failure");report.debug=await current();}catch{}console.error(error.stack);}
finally{report.passed=report.checks.filter(c=>c.passed).length;report.total=report.checks.length;writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");console.log(`Lucian D native Chrome: ${report.passed}/${report.total} checks passed; ${report.failures.length} failures`);chrome.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fx.restore();delete globalThis.__AB_QA_FIXED_NOW_MS;if(report.failures.length)process.exitCode=1;}
