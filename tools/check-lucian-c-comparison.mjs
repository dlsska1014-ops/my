import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import app from "../src/index.js";
import {insightPaceComparison} from "../src/modules/client/insight-main.js";
import {createV2265QaFixture} from "../validation/qa-fixture.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const out=process.argv.includes("--out")?resolve(process.argv[process.argv.indexOf("--out")+1]):"";
if(!out||out===root||out.startsWith(root+"/")||out.startsWith(root+"\\"))throw Error("Use --out outside repository");
mkdirSync(out,{recursive:true});
const report={node:process.version,execPath:process.execPath,workerSha256:createHash("sha256").update(readFileSync(join(root,"src/index.js"))).digest("hex"),checks:[],requests:[],responses:[],runtimeErrors:[],snapshots:[],syntheticOnly:true};
const check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
function contrast(a,b){const luminance=value=>{const numbers=value.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});return numbers[0]*0.2126+numbers[1]*0.7152+numbers[2]*0.0722;};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
globalThis.fetch=async()=>{throw Error("External fetch forbidden");};
globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-10-15T03:00:00Z");
const fx=await createV2265QaFixture(),memory=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{const url=new URL(typeof input==="string"?input:input.url);if(url.hostname!=="mock.supabase.co")throw Error("External fetch forbidden");report.requests.push({path:url.pathname,query:url.search,method:init.method||"GET",prefer:new Headers(init.headers||{}).get("prefer")});return memory(input,init);};
fx.db.accountbook_settings.push({key:"kakao_selected_household_v2251:user-bin",value:"house-home"});
const row=(id,date,amount,extra={})=>({id,transaction_date:date,amount,household_id:"house-home",user_id:"user-bin",type:"expense",category:"식비",memo:"합성 점심",payment_method:"현금",...extra});
const first=[row("c1","2026-10-10",300000),row("future","2026-10-25",150000),row("p1","2026-09-10",300000)];
function setup(rows=first,{month="2026-10",budgetCategory="__total",budgetAmount=1000000,now="2026-10-15T03:00:00Z",cap=Infinity,omit=false}={}){
 fx.db.transactions=structuredClone(rows);fx.db.accountbook_budgets=budgetAmount?[{id:"c-budget",household_id:"house-home",month,category:budgetCategory,amount:budgetAmount}]:[];
 fx.db.__transaction_max_rows=cap;fx.db.__omit_count_header=omit;globalThis.__AB_QA_FIXED_NOW_MS=Date.parse(now);
}
let active=0;
const server=createServer(async(req,res)=>{active++;try{
 const response=await app.fetch(new Request("https://malhaebook.com"+req.url,{headers:{cookie:fx.cookie}}),fx.env,{}),bytes=Buffer.from(await response.arrayBuffer()),headers={};
 response.headers.forEach((value,key)=>{if(!["content-length","content-encoding","strict-transport-security"].includes(key))headers[key]=value;});
 if(headers.location)headers.location=headers.location.replace("https://malhaebook.com","http://127.0.0.1:"+server.address().port);
 report.responses.push({path:req.url,status:response.status,cache:headers["cache-control"],bytes:bytes.length});res.writeHead(response.status,headers);res.end(bytes);
 }catch(error){res.writeHead(500);res.end(String(error.stack));}finally{active--;}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const chromePath=["C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(existsSync);if(!chromePath)throw Error("Chrome not found");
const chrome=spawn(chromePath,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-timer-throttling","--disable-renderer-backgrounding","--remote-debugging-pipe","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost","--user-data-dir="+join(out,"profile"),"about:blank"],{windowsHide:true,stdio:["ignore","ignore","ignore","pipe","pipe"]});
let sequence=0,buffer="",navigation=0;const pending=new Map();
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout "+method));},15000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+"\0");});
chrome.stdio[4].on("data",chunk=>{buffer+=chunk;for(let end=buffer.indexOf("\0");end>=0;end=buffer.indexOf("\0")){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==="Runtime.exceptionThrown")report.runtimeErrors.push(message.params);const task=pending.get(message.id);if(!task)continue;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}});
const target=await send("Target.createTarget",{url:"about:blank"}),session=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
const page=(method,params)=>send(method,params,session.sessionId);
const evaluate=async expression=>{const result=await page("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));return result.result.value;};
async function until(predicate,label="condition"){const end=Date.now()+12000;while(Date.now()<end){if(typeof predicate==="function"?await predicate():await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error("Not reached: "+label);}
async function navigate(path="/my/analysis?household_id=house-home&month=2026-10"){
 const token=++navigation;await page("Page.navigate",{url:origin+path+(path.includes("?")?"&":"?")+"qa="+token});
 await until(async()=>active===0&&await evaluate(`location.search.includes('qa=${token}')&&document.readyState==='complete'&&!!document.querySelector('#kpis b')`),path);
 await evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
}
async function key(key,code=key){for(const type of ["keyDown","keyUp"])await page("Input.dispatchKeyEvent",{type,key,code,windowsVirtualKeyCode:({ArrowLeft:37,ArrowRight:39,Home:36,End:35,Tab:9,Enter:13})[key]||0});}
async function point(selector,text){return evaluate(`(()=>{const candidates=Array.from(document.querySelectorAll(${JSON.stringify(selector)}));const e=candidates.find(e=>(!${JSON.stringify(text||"")}||e.textContent.includes(${JSON.stringify(text||"")}))&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height);if(!e)throw Error('missing visible control '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);}
async function click(selector,text){const p=await point(selector,text);for(const type of["mousePressed","mouseReleased"])await page("Input.dispatchMouseEvent",{type,button:"left",clickCount:1,...p});}
async function screenshot(name){const shot=await page("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});writeFileSync(join(out,name+".png"),Buffer.from(shot.data,"base64"));}
async function chooseDay(day,touch=false){const p=await evaluate(`(()=>{const e=document.querySelector('[data-pace-hit]');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+(${day}-1)/30*r.width,y:r.y+r.height/2};})()`);if(touch){await page("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p]});await page("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}else await page("Input.dispatchMouseEvent",{type:"mouseMoved",...p});await until(`document.querySelector('#paceDate').value==='${day}'`,"selected date "+day);}
async function state(){return evaluate("({kpis:document.querySelector('#kpis').innerText,insights:document.querySelector('#insights').innerText,readout:document.querySelector('#paceReadout')?.innerText,table:document.querySelector('#paceTable')?.innerText,payload:window.__INSIGHT__,budget:document.querySelector('#budgetBox').innerText,hidden:document.querySelector('#budgetCard').hidden})");}
try{
 report.chrome=await send("Browser.getVersion");await page("Page.enable");await page("Runtime.enable");await page("Accessibility.enable");await page("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 setup();await navigate();let s=await state();report.snapshots.push({name:"observed-300k",...s});
 check(s.kpis.includes("450,000원")&&s.kpis.includes("20,000원")&&s.kpis.includes("대비 0%"),"Chrome retains monthly450000, observed average20000 and fair0%");
 check(!s.insights.includes("50% 증가"),"actual full DOM insights reject future delta");
 const normalized=s.payload.rows.map(a=>({date:a[0],income:a[1]===1,amount:a[2],cat:a[3]}));
 const pure=insightPaceComparison({month:s.payload.month,today:s.payload.today,rows:normalized,budget:s.payload.budget,dataStart:s.payload.start,dataEnd:"2026-10-31",receipt:s.payload.receipt});
 await chooseDay(15);s=await state();check(s.readout.includes("300,000원")&&s.readout.includes("같은 금액"),"mouse tooltip and readout match model");
 check(pure.points[14].current===300000&&pure.points[14].difference===0,"pure and real browser model agree");
 await click("#paceTable summary");check(await evaluate("document.querySelector('[data-pace-date=\"2026-10-15\"]').innerText.includes('300,000원')"),"table agrees with selected point");
 check(await evaluate("document.querySelector('#paceReadout').innerText===document.querySelector('.paceTip').innerText"),"tooltip and persistent readout use same lines");
 await evaluate("document.querySelector('#paceDate').focus()");await key("Home");check(await evaluate("document.querySelector('#paceDate').value==='1'"),"native keyboard Home");await key("ArrowRight");check(await evaluate("document.querySelector('#paceDate').value==='2'"),"native keyboard ArrowRight");await key("ArrowLeft");check(await evaluate("document.querySelector('#paceDate').value==='1'"),"native keyboard ArrowLeft");await key("End");check((await state()).readout.includes("관측 전"),"native End selects future reason");
 check(await evaluate("document.querySelector('#paceDate').matches(':focus-visible')&&getComputedStyle(document.querySelector('#paceDate')).outlineStyle!=='none'"),"range has visible keyboard focus");
 await until(async()=>{const ax=await page("Accessibility.getFullAXTree");report.sliderAx=ax.nodes.find(n=>n.role?.value==="slider");return ax.nodes.some(n=>n.role?.value==="slider"&&n.description?.value.includes("관측 전"));},"AX selected description after native key");check(true,"Chrome accessibility slider exposes selected unavailable state in description");
 await page("Emulation.setDeviceMetricsOverride",{width:1180,height:850,deviceScaleFactor:1,mobile:false});await until("document.querySelector('#paceDate')===document.activeElement&&document.querySelector('#paceDate').value==='31'","resize focus and date");check(true,"native resize keeps selection and range focus");
 await chooseDay(10);await click("#panelBtn");await click("#catChips button","식비");check((await state()).readout.includes("300,000원"),"category filter retains monthly cumulative scope and chosen day");
 await click("#periodChips button","지난달");check((await state()).hidden,"period chip keeps chart outside base month hidden");await click("#periodChips button","이번 달");check(!(await state()).hidden,"base month period shows chart again");
 await click("#typeSeg button","수입");check((await state()).hidden,"income segment hides pace card");await click("#typeSeg button","전체");check(!(await state()).hidden,"all mode preserves expense cumulative semantics");
 const navigator=await evaluate("Array.from(document.querySelectorAll('a[href]')).find(a=>a.href.includes('/my/analysis?')&&a.href.includes('month=2026-09')&&!a.href.includes('view=report'))?.getAttribute('href')");check(!!navigator,"month navigator has distinct previous base-month URL");
 await click(`a[href=${JSON.stringify(navigator)}]`);await until("window.__INSIGHT__?.month==='2026-09'&&!!document.querySelector('#kpis b')","actual month navigator");check((await state()).payload.month==="2026-09","native month navigation loads different base month");check((await state()).hidden,"navigated month without budget keeps existing hidden-card condition");
 setup([row("small","2026-10-02",20000),row("future2","2026-10-25",180000),row("prev2","2026-09-02",30000)],{now:"2026-10-03T03:00:00Z"});await navigate();s=await state();check(s.kpis.includes("200,000원")&&s.kpis.includes("6,667원")&&s.kpis.includes("대비 -33%"),"second observed regression in real Chrome DOM");
 setup([row("cat-a","2026-10-01",20000),row("cat-b","2026-09-01",30000),row("outside-a","2026-10-01",90000,{category:"쇼핑"}),row("outside-b","2026-09-01",80000,{category:"쇼핑"})],{budgetCategory:"식비"});await navigate();s=await state();check(s.budget.includes("대상 분류 지출: 식비"),"category scope visible in actual card");check(s.readout.includes("20,000원")&&s.readout.includes("30,000원"),"both months follow current category budget");
 setup(first,{omit:true});await navigate();s=await state();check(s.kpis.includes("확인 보류")&&!s.insights.includes("무지출"),"missing metadata withholds actual average and no-spend");check(!await evaluate("document.querySelector('[data-pace-series=previous]')"),"missing metadata never draws previous comparison line");
 setup(Array.from({length:1500},(_,i)=>row("cap-"+i,"2026-10-01",1)),{cap:100});const countBefore=report.requests.length;await navigate();s=await state();check(s.payload.receipt.status==="response-cap"&&s.payload.rows.length===100,"actual cap100 response distinguished from complete1500");check(report.requests.slice(countBefore).filter(r=>r.path.endsWith("/transactions")&&r.prefer==="count=exact").length===1,"synthetic cap analysis uses one existing GET; shared notifications are recorded separately");check(await evaluate("!!document.querySelector('[data-insight-incomplete]')&&!document.querySelector('#reportChallenge')"),"whole partial DOM withholds forecast and challenge achievement");
 setup(first,{month:"2026-11"});await navigate("/my/analysis?household_id=house-home&month=2026-11");s=await state();check(s.readout.includes("관측 전")&&s.kpis.includes("확인 보류"),"future month observed state in Chrome");
 setup([row("march","2025-03-31",31000),row("feb","2025-02-28",28000)],{month:"2025-03"});await navigate("/my/analysis?household_id=house-home&month=2025-03");s=await state();check(s.readout.includes("비교할 날짜 없음"),"completed March31 never extends February28");
 setup([]);await navigate();s=await state();check(s.readout.includes("0원")&&s.readout.includes("같은 금액"),"actual empty complete month is zero");
 setup([],{month:"2026-08"});await navigate("/my/analysis?household_id=house-home&month=2026-08&p=d7");s=await state();check(s.kpis.includes("미수신")&&!s.kpis.includes("0원")&&!s.kpis.includes("0건"),"past-base recent7 is unavailable throughout actual KPI DOM");check(await evaluate("document.querySelector('#txList').innerText.includes('수신하지 못했습니다')&&document.querySelector('#csvBtn').disabled"),"actual out-of-range list/CSV cannot imply empty successful data");await click("#resetBtn");check((await state()).kpis.includes("0원")&&await evaluate("!document.querySelector('#csvBtn').disabled"),"return to valid base month restores genuine zero and CSV");
 setup([row("tiny-current","2026-10-10",25),row("tiny-previous","2026-09-10",75)],{budgetAmount:200});await navigate();
 await page("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});await page("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});await page("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 await chooseDay(10,true);check((await state()).readout.includes("25원")&&(await state()).readout.includes("75원"),"CDP touch selects same cumulative values");
 await click("#paceTable summary");check(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"375px document has no horizontal overflow");
 check(await evaluate("document.querySelector('.paceTableScroll').scrollWidth>document.querySelector('.paceTableScroll').clientWidth"),"375px table scroll exposes all seven columns");
 await evaluate("document.querySelector('.paceTableScroll').scrollLeft=9000");check(await evaluate("document.querySelector('.paceTableScroll').scrollLeft>0"),"table can scroll to final comparison-state column");
 for(const id of["paceTableSummary","paceTableScroll"]){await evaluate(`document.querySelector('#${id}').focus()`);const scrollBefore=await evaluate("document.querySelector('.paceTableScroll').scrollLeft");await page("Emulation.setDeviceMetricsOverride",{width:id==="paceTableSummary"?390:375,height:812,deviceScaleFactor:1,mobile:true});await until(`document.activeElement.id==='${id}'&&document.querySelector('#paceDate').value==='10'`,"table resize focus "+id);check(await evaluate("document.querySelector('.paceTableScroll').scrollLeft")>0&&scrollBefore>0,"native resize retains table focus/date/scroll "+id);}
 check(await evaluate("document.querySelector('#paceDate').getBoundingClientRect().height>=44&&document.querySelector('#paceTable summary').getBoundingClientRect().height>=44"),"new controls preserve 44px targets");
 check(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),"reduced-motion browser mode remains active");
 const noPrivacyValues=await evaluate("Array.from(document.querySelectorAll('#budgetCard svg [data-ab-num-unit]')).map(n=>n.textContent)");
 await click("[data-ab-hide-toggle]");await until("document.documentElement.hasAttribute('data-ab-hide-amounts')&&Array.from(document.querySelectorAll('#budgetCard svg [data-ab-num-unit]')).every(n=>n.classList.contains('abPrivateAmount'))","SVG privacy");
 check(await evaluate("Array.from(document.querySelectorAll('#budgetCard svg [data-ab-num-unit]')).every(n=>getComputedStyle(n).filter!=='none')"),"unitless SVG axes and endpoint are visually masked");
 await chooseDay(14,true);await until("document.querySelector('#paceReadout .abPrivateAmount')","dynamic masking");check(await evaluate("Array.from(document.querySelectorAll('#paceReadout .abPrivateAmount,.paceTip .abPrivateAmount,.paceTable td .abPrivateAmount')).every(n=>getComputedStyle(n).filter!=='none')"),"dynamic tooltip, difference and table amounts remain masked");
 check(await evaluate("Array.from(document.querySelectorAll('#budgetCard svg text')).filter(n=>n.textContent.endsWith('일')).every(n=>!n.classList.contains('abPrivateAmount'))"),"privacy does not mask dates");
 check(await evaluate("document.querySelector('#paceDate').getAttribute('aria-valuetext').includes('25원')&&document.querySelector('#paceReadout').getAttribute('aria-live')==='off'"),"privacy retains existing assistive-value policy without pointer live announcements");
 await evaluate("document.querySelector('#paceDate').scrollIntoView({block:'center'})");await screenshot("375-light-hidden");
 await click("[data-ab-hide-toggle]");await until("!document.documentElement.hasAttribute('data-ab-hide-amounts')&&!document.querySelector('#budgetCard .abPrivateAmount')","privacy off");
 check(JSON.stringify(noPrivacyValues)===JSON.stringify(await evaluate("Array.from(document.querySelectorAll('#budgetCard svg [data-ab-num-unit]')).map(n=>n.textContent)")),"SVG original text survives privacy cycle");
 for(const theme of["light","dark"])for(const tone of["blue","emerald","violet","amber"]){
  await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.setItem('ab:appearance:tone',${JSON.stringify(tone)});`);await navigate();
  check(await evaluate(`document.documentElement.getAttribute('data-ab-resolved-theme')===${JSON.stringify(theme)}`),"real theme "+theme+"/"+tone);
  const colors=await evaluate("({line:getComputedStyle(document.querySelector('[data-pace-series=current]')).stroke,previous:getComputedStyle(document.querySelector('[data-pace-series=previous]')).stroke,text:getComputedStyle(document.querySelector('.paceSelection')).color,background:getComputedStyle(document.querySelector('#budgetCard')).backgroundColor,tone:document.documentElement.getAttribute('data-ab-tone')})");report.snapshots.push({name:theme+"-"+tone,colors});
  check(colors.line!==colors.previous,"line colors and dash styles remain distinct "+theme+"/"+tone);
  check(colors.tone===tone,"real appearance tone "+tone);
  check(contrast(colors.text,colors.background)>=4.5,"actual text contrast >=4.5 "+theme+"/"+tone);
  check(contrast(colors.line,colors.background)>=3&&contrast(colors.previous,colors.background)>=3,"both actual series contrast >=3 "+theme+"/"+tone);
  check(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"375px theme has no overflow "+theme+"/"+tone);
  await evaluate("document.querySelector('#paceDate').scrollIntoView({block:'center'})");await screenshot("375-"+theme+"-"+tone);
 }
 await page("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});await navigate();await evaluate("document.querySelector('#budgetCard').scrollIntoView({block:'center'})");await screenshot("desktop-dark");
 check(report.runtimeErrors.length===0,"all actual pages have no browser runtime exception");
 check(report.responses.filter(r=>r.path.startsWith('/my/analysis?')).every(r=>r.cache?.includes('no-store')),"all personal summary responses retain no-store");
 report.pass=true;
}finally{
 if(!report.pass){report.failureState=await evaluate("({active:document.activeElement?.outerHTML,range:document.querySelector('#paceDate')?.outerHTML,focusVisible:document.querySelector('#paceDate')?.matches(':focus-visible'),outline:document.querySelector('#paceDate')&&getComputedStyle(document.querySelector('#paceDate')).outline,readout:document.querySelector('#paceReadout')?.innerText,htmlWidth:document.documentElement.scrollWidth,innerWidth})").catch(()=>null);await screenshot("failure").catch(()=>{});}
 writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");await send("Browser.close").catch(()=>{});chrome.kill();server.close();fx.restore();
}
console.log(`Lucian C Chrome: ${report.checks.length} checks passed`);
