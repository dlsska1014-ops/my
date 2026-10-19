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
  await page("Page.enable");await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride",{width:1100,height:850,deviceScaleFactor:1,mobile:false});
  await navigate("/bot-fixture");
  const utterance="브라우저케이크 7534원 현금";
  await type("#utterance",utterance);await click("#chat button");await until(()=>fx.db.transactions.length===1&&active===0,"normal record");
  check(fx.db.transactions[0].raw_text===utterance,"native input saved exact business raw_text");
  await type("#utterance",utterance);await click("#chat button");await until("document.querySelector('#answer').textContent.includes('별도 구매')","duplicate guidance");
  check(fx.db.transactions.length===1,"native ordinary resend adds none");
  await type("#utterance","별도 구매 추가 "+utterance);await click("#chat button");await until("document.querySelector('#choices button')?.textContent==='별도 구매 확정'","candidate button");
  check(fx.db.transactions.length===1,"native candidate does not save");
  const command=await evaluate("document.querySelector('#choices button').dataset.command");
  check(/^별도 구매 확인 [a-f0-9]{16}$/.test(command),"native button uses server confirmation token");
  await screenshot("separate-candidate");await click("#choices button");await until(()=>fx.db.transactions.length===2&&active===0,"separate confirmation");
  check(await evaluate("document.querySelector('#answer').textContent.includes('한 건을 저장했어요')"),"native confirmed response shown");
  await type("#utterance",command);await click("#chat button");await until("document.querySelector('#answer').textContent.includes('이미 처리한')","confirmation replay");
  check(fx.db.transactions.length===2,"native same confirmation adds none");
  const other=fx.db.users.find(u=>u.id!=="user-bin");
  fx.db.household_members=fx.db.household_members.filter(m=>m.household_id!=="house-home");
  fx.db.household_members.push({household_id:"house-home",user_id:"user-bin",role:"owner"},{household_id:"house-home",user_id:other.id,role:"member"});
  fx.db.transactions=[{id:"native-expense",household_id:"house-home",user_id:"user-bin",type:"expense",category:"외식",memo:"합성 공동 지출",amount:100000,transaction_date:"2026-10-01"},{id:"native-refund",household_id:"house-home",user_id:"user-bin",type:"income",category:"환급",memo:"합성 환급",amount:40000,transaction_date:"2026-10-02"}];
  await navigate("/my/settlement/refund-preview?household_id=house-home&month=2026-10");
  check(await evaluate("document.body.textContent.includes('환급 연결 미리보기')"),"actual preview page loaded");
  await select('select[name="expense_id"]',"native-expense");await select('select[name="refund_id"]',"native-refund");await select('select[name="recipient_user_id"]',"user-bin");await type('input[name="amount"]',"40000");
  const submittedBefore=report.submissions.length;
  await click('form[action="/my/settlement/refund-preview"] button');await until(()=>report.submissions.length>submittedBefore&&active===0,"preview POST");await until("!!document.querySelector('[data-refund-preview-digest]')","preview result");
  check(await evaluate("document.body.textContent.includes('30,000원')"),"native original/refund/recipient/amount produces 30000 transfer");
  check(await evaluate("document.body.textContent.includes('반영하지 않았습니다')"),"native preview clearly excludes official completion");
  check(fx.db.transactions.length===2,"native preview creates no transaction");
  check(!report.requests.some(r=>r.method==="POST"&&r.path.endsWith("settlement_refund_links")),"no invented persistence endpoint");
  await screenshot("refund-preview");
  await type('input[name="amount"]',"40001");await click('form[action="/my/settlement/refund-preview"] button');await until("!!document.querySelector('[role=alert]')","over-refund validation");
  check(await evaluate("document.querySelector('input[name=amount]').value==='40001'"),"invalid preview retains input");
  check(fx.db.transactions.length===2,"invalid native preview writes none");
  fx.db.transactions=[{...fx.db.transactions[0],transaction_date:"2026-10-10",amount:300000},{...fx.db.transactions[0],id:"native-future",transaction_date:"2026-10-25",amount:150000}];
  await navigate("/my/analysis?view=report&household_id=house-home&month=2026-10");
  const text=await evaluate("document.body.textContent");
  check(text.includes("450,000원"),"native analysis full monthly total");check(text.includes("20,000원"),"native observed daily average");check(text.includes("620,000원")&&!text.includes("930,000원"),"native current-speed forecast excludes future records");
  await screenshot("observed-report");
  check(report.runtimeErrors.length===0,"no native runtime exceptions");
  report.savedRows=structuredClone(fx.db.transactions);report.pass=true;
} finally {
  writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
  await send("Browser.close").catch(()=>{});chrome.kill();server.close();fx.restore();
}
console.log(`BOT safety Chrome: ${report.checks.length} checks passed`);
