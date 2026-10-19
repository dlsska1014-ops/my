import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {existsSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import app from "../src/index.js";
import {createV2265QaFixture} from "../validation/qa-fixture.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const out=process.argv.includes("--out")?resolve(process.argv[process.argv.indexOf("--out")+1]):"";
if(!out||out===root||out.startsWith(root+"/" )||out.startsWith(root+"\\"))throw new Error("Use --out outside repository");
mkdirSync(out,{recursive:true});
const report={node:process.version,execPath:process.execPath,sourceSha256:createHash("sha256").update(readFileSync(join(root,"src/index.js"))).digest("hex"),checks:[],requests:[],submissions:[],runtimeErrors:[],syntheticOnly:true};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
globalThis.fetch=async()=>{throw new Error("External fetch forbidden");};
globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-10-15T12:00:00+09:00");
const fx=await createV2265QaFixture();fx.env.KAKAO_SKILL_SECRET="synthetic-native-bot-secret";fx.env.SKILL_RATE_LIMIT="10000";fx.db.transactions=[];
fx.db.accountbook_settings.push({key:"kakao_selected_household_v2251:user-bin",value:"house-home"});
const memoryFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{const url=new URL(typeof input==="string"?input:input.url);if(url.hostname!=="mock.supabase.co")throw new Error("External fetch forbidden");report.requests.push({path:url.pathname,method:init.method||"GET"});return memoryFetch(input,init);};
const BASE="https://malhaebook.com";
const botFixture='<!doctype html><html lang="ko"><meta charset="utf-8"><title>합성 카카오 응답 검사</title><style>body{max-width:700px;padding:30px;font:18px system-ui}input,button{font:inherit;min-height:44px;margin:8px}input{width:90%}pre{white-space:pre-wrap}</style><h1>합성 카카오 응답 검사</h1><form id="chat"><label>명령<input id="utterance"></label><button>보내기</button></form><pre id="answer"></pre><div id="choices"></div><script>async function say(text){const response=await fetch("/skill",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bot:{id:"synthetic-native-bot"},userRequest:{utterance:text,user:{id:"kakao_login:2265",type:"botUserKey",properties:{botUserKey:"kakao_login:2265"}}}})});const data=await response.json();document.querySelector("#answer").textContent=data.template.outputs.map(o=>o.simpleText?.text||"").join("\\n");const box=document.querySelector("#choices");box.replaceChildren();for(const reply of data.template.quickReplies||[]){const button=document.createElement("button");button.textContent=reply.label;button.dataset.command=reply.messageText;button.onclick=()=>say(reply.messageText);box.append(button);}}document.querySelector("#chat").onsubmit=e=>{e.preventDefault();say(document.querySelector("#utterance").value);};</script></html>';
let active=0;
const server=createServer(async(req,res)=>{active++;try{
  if(req.url==="/bot-fixture"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(botFixture);return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
  const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(!["host","cookie","content-length","connection","origin","referer","accept-encoding"].includes(key))headers.set(key,String(value));
  headers.set("cookie",fx.cookie);headers.set("origin",BASE);headers.set("x-kakao-skill-secret",fx.env.KAKAO_SKILL_SECRET);
  if(req.method==="POST")report.submissions.push({path:req.url,body:bytes.toString(),before:structuredClone(fx.db.transactions)});
  const response=await app.fetch(new Request(BASE+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{})}),fx.env,{});
  const outgoing={};response.headers.forEach((value,key)=>{if(!["content-length","content-encoding","strict-transport-security"].includes(key))outgoing[key]=value;});
  if(outgoing.location)outgoing.location=outgoing.location.replace(BASE,"http://127.0.0.1:"+server.address().port);
  res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()));
  if(req.method==="POST")Object.assign(report.submissions.at(-1),{status:response.status,after:structuredClone(fx.db.transactions)});
}catch(error){res.writeHead(500);res.end(String(error.stack));}finally{active--;}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const chromePath=["C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(existsSync);
if(!chromePath)throw new Error("Chrome not found");
const chrome=spawn(chromePath,["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-pipe","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost","--user-data-dir="+join(out,"profile"),"about:blank"],{windowsHide:true,stdio:["ignore","ignore","ignore","pipe","pipe"]});
let sequence=0,buffer="";const pending=new Map();
chrome.stdio[4].on("data",chunk=>{buffer+=chunk;for(let end=buffer.indexOf("\0");end>=0;end=buffer.indexOf("\0")){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.method==="Runtime.exceptionThrown")report.runtimeErrors.push(message.params);const task=pending.get(message.id);if(!task)continue;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);}});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(new Error("CDP timeout "+method)),15000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+"\0");});
const target=await send("Target.createTarget",{url:"about:blank"}),session=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
const page=(method,params)=>send(method,params,session.sessionId);
const evaluate=async expression=>{const r=await page("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
async function until(predicate,label){const deadline=Date.now()+12000;while(Date.now()<deadline){if(typeof predicate==="function"?await predicate():await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("Did not complete "+label);}
async function key(key,code=key,modifiers=0){const vk={a:65,Home:36,ArrowDown:40,Tab:9,Enter:13}[key];for(const type of["keyDown","keyUp"])await page("Input.dispatchKeyEvent",{type,key,code,modifiers,...(vk?{windowsVirtualKeyCode:vk}:{}),...(key==="Enter"?{text:"\r"}:{})});}
async function click(selector){const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing control');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of["mousePressed","mouseReleased"])await page("Input.dispatchMouseEvent",{type,button:"left",clickCount:1,...point});}
async function type(selector,text){await click(selector);await key("a","KeyA",2);await page("Input.insertText",{text});check(await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`)===text,"native replacement input "+selector);}
async function select(selector,value){const index=await evaluate(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).findIndex(o=>o.value===${JSON.stringify(value)})`);check(index>=0,"native select option "+selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await key("Home");for(let i=0;i<index;i++)await key("ArrowDown");await key("Tab");check(await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`)===value,"native keyboard selection "+selector);}
async function navigate(path){await page("Page.navigate",{url:origin+path});await until(async()=>active===0&&await evaluate("document.readyState==='complete'"),path);}
async function screenshot(name){const shot=await page("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});writeFileSync(join(out,name+".png"),Buffer.from(shot.data,"base64"));}
try {
  await page("Page.enable");await page("Runtime.enable");await page("Network.enable");report.browser=await send("Browser.getVersion");
  await page("Page.addScriptToEvaluateOnNewDocument",{source:`for(const type of ['pagereveal','pageswap'])addEventListener(type,event=>{const t=event.viewTransition;if(t)for(const phase of ['ready','updateCallbackDone','finished'])t[phase].catch(()=>{});});`});
  const tx=(id,date,amount,extra={})=>({id,household_id:"house-home",user_id:"user-bin",transaction_date:date,type:"expense",category:"외식",memo:"합성 공동 지출",amount,...extra});
  const query="?month=2026-10&household_id=house-home";
  const notice="환급 계산은 미리보기로만 제공합니다. 일반 정산 금액과 완료 이력에는 반영하지 않습니다.";
  async function nav(path){const before=await evaluate("performance.timeOrigin");await page("Page.navigate",{url:origin+path});await until(async()=>active===0&&await evaluate(`performance.timeOrigin!==${before}&&document.readyState==='complete'`),path);await evaluate("document.activeViewTransition?.finished.catch(()=>{})");await evaluate("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");}
  async function theme(value){await evaluate(`localStorage.setItem('ab:appearance:theme',${JSON.stringify(value)})`);await page("Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value}]});}
  function seed(){fx.db.transactions=[tx("observed","2026-10-10",300000),tx("future","2026-10-25",150000),tx("previous","2026-09-10",300000)];fx.db.accountbook_budgets=[{id:"budget",household_id:"house-home",month:"2026-10",category:"식비",amount:700000}];fx.db.accountbook_recurring=[];}
  function settlement(recipient="user-bin"){fx.db.household_members=fx.db.household_members.filter(m=>m.household_id!=="house-home");fx.db.household_members.push({household_id:"house-home",user_id:"user-bin",role:"owner",nickname:"A"},{household_id:"house-home",user_id:"user-wifi",role:"member",nickname:"B"});fx.db.transactions=[tx("expense","2026-10-10",100000),tx("refund","2026-10-11",40000,{type:"income",category:"환급",user_id:recipient})];}
  await nav("/health");
  for(const width of [375,1280])for(const scheme of ["light","dark"]){
    await page("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width===375});await theme(scheme);seed();
    await nav("/my/analysis?view=report&month=2026-10&household_id=house-home");
    let text=await evaluate("document.body.innerText");check(text.includes("지난달 같은 기간 대비 0%"),`Chrome report fair comparison ${width}/${scheme}`);check(text.includes("20,000원")&&text.includes("620,000원")&&text.includes("450,000원"),"report total/observed forecast");
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"report has no viewport overflow");
    await screenshot(`report-${width}-${scheme}`);
    for(const path of ["/budget-alerts","/today-budget","/monthly-forecast","/fixed-preview"]){
      await nav(path+query);text=await evaluate("document.body.innerText");
      check(["450,000원","250,000원","14,706원","20,000원","620,000원"].every(v=>text.includes(v)),`Chrome budget correct numbers ${path}/${width}/${scheme}`);
      check(!text.includes("930,000원"),"no future inflation");
      check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"budget has no viewport overflow");
    }
    await screenshot(`budget-${width}-${scheme}`);
    const mainControl=await evaluate("(()=>{const e=document.querySelector('form.filters button');const r=e.getBoundingClientRect();return {height:r.height,width:r.width};})()");check(mainControl.height>=44&&mainControl.width>=44,"budget query control >=44px");
    await evaluate("document.querySelector('form.filters button').focus()");await key("Tab");check(await evaluate("document.activeElement!==document.body"),"keyboard moves between focusable controls");
    const eye=await evaluate("(()=>{const e=[...document.querySelectorAll('[data-ab-hide-toggle]')].find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);if(e)e.setAttribute('data-d3-visible-eye','');return !!e;})()");check(eye,"existing visible privacy toggle present");
    await click('[data-d3-visible-eye]');await until("document.documentElement.hasAttribute('data-ab-hide-amounts')","privacy hide");
    check(await evaluate("document.body.textContent.includes('620,000원')"),"privacy keeps underlying money text for existing assistive policy");await screenshot(`budget-hidden-${width}-${scheme}`);await click('[data-d3-visible-eye]');await until("!document.documentElement.hasAttribute('data-ab-hide-amounts')","privacy reveal");
    settlement();await nav("/settlement-summary"+query);
    check(await evaluate(`document.body.innerText.includes(${JSON.stringify(notice)})&&document.querySelector('#settlementCopy').innerText.includes('50,000원')`),"ordinary settlement limitation and transfer");
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"settlement no viewport overflow");
    await screenshot(`settlement-${width}-${scheme}`);
    await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}})");
    await click('#copySettlement');await until("!!window.__copied","clipboard promise path");check(await evaluate(`window.__copied.includes(${JSON.stringify(notice)})&&window.__copied.includes('50,000원')`),"actual click clipboard API branch has limitation (OS clipboard stubbed)");
    await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});window.prompt=(title,text)=>{window.__promptCopy={title,text};return null;}");
    await click('#copySettlement');check(await evaluate(`window.__promptCopy.text.includes(${JSON.stringify(notice)})&&window.__promptCopy.text.includes('50,000원')`),"actual click fallback prompt branch has limitation (dialog stubbed)");
    const dimensions=await evaluate("(()=>{const e=document.querySelector('#copySettlement'),r=e.getBoundingClientRect();return {h:r.height,w:r.width}})()");check(dimensions.h>=44&&dimensions.w>=44,"copy touch target >=44px");
    await nav("/my/settlement/refund-preview"+query);await select('select[name="expense_id"]',"expense");await select('select[name="refund_id"]',"refund");await select('select[name="recipient_user_id"]',"user-bin");await type('input[name="amount"]',"40000");
    await click('form[action="/my/settlement/refund-preview"] button');await until("!!document.querySelector('[data-refund-preview-digest]')","refund native POST result");
    check(await evaluate(`document.body.innerText.includes('30,000원')&&document.body.innerText.includes(${JSON.stringify(notice)})`),"refund preview 30000 and limitation");await screenshot(`preview-${width}-${scheme}`);
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"preview no viewport overflow");
  }
  await page("Emulation.setDeviceMetricsOverride",{width:375,height:900,deviceScaleFactor:1,mobile:true});
  seed();fx.db.transactions=[tx("future-only","2026-11-01",300000)];fx.db.accountbook_budgets[0].month="2026-11";
  await nav("/monthly-forecast?month=2026-11&household_id=house-home");check(await evaluate("document.body.innerText.includes('관측 전')&&document.body.innerText.includes('판단 보류')&&!document.body.innerText.includes('정상 흐름')"),"Chrome future states are not numeric zero");await screenshot("future-375-dark");
  fx.db.transactions=[tx("past","2026-09-30",300000)];fx.db.accountbook_budgets[0].month="2026-09";
  await nav("/fixed-preview?month=2026-09&household_id=house-home");check(await evaluate("document.body.innerText.includes('월 전체 실적')&&document.body.innerText.includes('판단 보류')&&!document.body.innerText.includes('오늘은 약')"),"Chrome past is completed performance");
  settlement();await nav("/settlement-summary"+query);const before=report.submissions.length;await click('input[name="confirmed"]');await click('form.complete button');await until(()=>report.submissions.length>before&&active===0,"ordinary completion");await until("document.body.innerText.includes('정산 완료 상태와 이력을 저장했습니다.')","completion page");
  check(await evaluate(`document.body.innerText.includes(${JSON.stringify(notice)})`),"native completion success limitation");
  const history=JSON.parse(fx.db.accountbook_settings.find(r=>r.key==='settlement_history:house-home').value);check(history.at(-1).transfers[0].amount===50000,"actual native completion saved 50000 ordinary transfer");
  await screenshot("completed-375-dark");
  for(const tone of ["blue","emerald","violet","amber"]){
    await evaluate(`localStorage.setItem('ab:appearance:tone',${JSON.stringify(tone)})`);
    await nav("/settlement-summary"+query);
    check(await evaluate(`document.documentElement.getAttribute('data-ab-tone')===${JSON.stringify(tone)}`),"existing tone applied "+tone);
    check(await evaluate(`document.body.innerText.includes(${JSON.stringify(notice)})`),"notice retained in existing tone "+tone);
    check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),"existing tone has no overflow "+tone);
  }
  check(report.runtimeErrors.length===0,"no Chrome runtime exceptions");report.pass=true;
} finally {
  writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
  await send("Browser.close").catch(()=>{});chrome.kill();server.close();fx.restore();
}
console.log(`D3/refund Chrome: ${report.checks.length} checks passed`);
