import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parse } from "../tools/vendor/acorn.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root=process.env.AB_INPUT_PREREQ_BASELINE || fileURLToPath(new URL("../",import.meta.url));
const load=path=>import(pathToFileURL(resolve(root,path)));
const worker=await load("src/index.js");
const {CATEGORY_RULES}=await load("src/modules/nlu/category-rules.js");
const {app,fixture,api,post,putSetting,skill,withClock,page,BASE}=await load("validation/lib-audit-v22934.mjs");
let checks=0;
const eq=(a,b,label)=>{assert.equal(a,b,label);checks++;};
const ok=(a,label)=>{assert.ok(a,label);checks++;};
const client=vm.createContext({});
vm.runInContext([worker.moneyTokenSpans,worker.parseMobileAmountText,worker.quickInputDate,worker.explicitDateIntent,worker.transactionTypeFromText].map(fn=>fn.toString()).join("\n"),client);
client.rules=structuredClone(CATEGORY_RULES);
const inBrowser=(name,...args)=>vm.runInContext(name+"("+args.map(arg=>JSON.stringify(arg)).join(",")+")",client);
const cases=[
 ["점심 만두 5000",5000,"expense"],["천원샵 5000",5000,"expense"],["계란 30 구 9000",9000,"expense"],["아이폰 15 케이스 20000",20000,"expense"],
 ["계란 30 알 9000",9000,"expense"],["비타민 60 정 30000",30000,"expense"],["삼천원에 커피 샀어",3000,"expense"],["오천원으로 점심",5000,"expense"],
 ...["부수입","알바비","상여금","성과급","예금이자","주식배당","강의료"].map(word=>[word+" 30000원",30000,"income"]),
 ...["쿠팡 환불 완료","환불됨","환불금","환불 처리","반품"].map(word=>[word+" 34000",34000,"income"]),
 ["남편 용돈 30만원",300000,"expense"],["와이프 용돈 20만원",200000,"expense"],["용돈 지급 10만원",100000,"expense"],["배달 받은 치킨 20000",20000,"expense"],["적금 입금 50만원",500000,"expense"],
 ["어제 점심 12,000원 국민카드",12000,"expense","2026-10-13"],["어제저녁 치킨 20000",20000,"expense","2026-10-13"],["어젯밤 치킨 21000",21000,"expense","2026-10-13"],["어제점심 김밥 5000",5000,"expense","2026-10-13"],["엊그저께 커피 4800",4800,"expense","2026-10-12"],["10-3 마트 52400",52400,"expense","2026-10-03"],
 ["환불 32000",32000,"income"],["부모님 용돈 30만원",300000,"expense"],["용돈 받음 5만원",50000,"income"],["이자카야 30000",30000,"expense"],["판매 수수료 3000",3000,"expense"],["수수료 환급 3000",3000,"income"],
];
await withClock("2026-10-14",async()=>{
 for(const [text,amount,type,date="2026-10-14"] of cases){
  const rows=worker.parseMultipleTransactions(text,{});
  eq(rows.length,1,"one transaction: "+text);eq(rows[0]?.amount,amount,"server amount: "+text);eq(rows[0]?.type,type,"server type: "+text);eq(rows[0]?.transaction_date,date,"server date: "+text);
  eq(inBrowser("parseMobileAmountText",text),amount,"serialized amount: "+text);
  client.text=text;eq(vm.runInContext("transactionTypeFromText(text,rules)",client),type,"serialized type: "+text);
  eq(inBrowser("quickInputDate",text,"2026-10-14")||"2026-10-14",date,"serialized date: "+text);
 }
 for(const text of ["결제 취소 36000","카드 승인취소 37000"]){eq(worker.parseMultipleTransactions(text,{}).length,0,"unconfirmed cancellation writes no row");eq(worker.parseTransaction(text,{}).message,"transaction_type_confirmation_required","cancellation asks for type");}
 eq(worker.parseTransaction("수입 결제 취소 36000",{}).type,"income","explicit cancellation type is allowed");
 eq(worker.parseTransaction("2월 30일 문구 2300",{}).ok,false,"invalid date remains blocked");
 await fixture(async fx=>{
  const before=fx.db.transactions.length;
  const reply=await skill(fx,"결제 취소 36000");eq(fx.db.transactions.length,before,"actual skill cancellation writes zero");ok(reply.includes("저장하지"),"actual skill explains cancellation");
  const normal=await api(fx,"/u/api/input-classification","POST",{household_id:"house-home",type:"expense",memo:"스타벅스"});eq(normal.status,200,"classification available");eq(normal.data.category,"카페/간식","canonical default category");
  putSetting(fx,"category_keywords:house-home",{"expense::회사간식":["스타벅스"]});
  const customRow={id:"input-company-snack",household_id:"house-home",name:"회사간식",type:"expense",sort_order:1,created_at:"2026-10-01T00:00:00Z"};
  fx.db.accountbook_categories.push(customRow);
  putSetting(fx,"custom_categories:house-home",[customRow]);
  const custom=await api(fx,"/u/api/input-classification","POST",{household_id:"house-home",type:"expense",memo:"스타벅스"});eq(custom.data.category,"회사간식","canonical user keyword preserved");eq(Object.keys(custom.data).sort().join(","),"category,household_id,ok","no settings or unrelated data returned");
  const bad=await api(fx,"/u/api/input-classification","POST",{household_id:"not-my-ledger",type:"expense",memo:"스타벅스"});eq(bad.status,404,"no household fallback");
  const missing=await api(fx,"/u/api/input-classification","POST",{type:"expense"});eq(missing.status,400,"scope required");
  const huge=await api(fx,"/u/api/input-classification","POST",{household_id:"house-home",type:"expense",memo:"x".repeat(1001)});eq(huge.status,400,"bounded memo");
  eq(fx.db.transactions.length,before,"classification never stores a transaction");
  const base={household_id:"house-home",month:"2026-10",type:"expense",transaction_date:"2026-10-14",amount:"36000",memo:"결제 취소",raw_text:"결제 취소 36000",user_id:"user-bin",return_to:"/app?household_id=house-home&month=2026-10"};
  const cancelled=await post(fx,"/admin/transactions",base);eq(fx.db.transactions.length,before,"server rejects default type cancellation");ok(new URL("https://malhaebook.com"+cancelled.location).searchParams.get("err")?.includes("취소 내역"),"cancellation refusal survives return_to");
  await post(fx,"/admin/transactions",{...base,type:"income",quick_manual_type:"1"});eq(fx.db.transactions.length,before+1,"explicit manual type saves cancellation");
 });
});
function draftFixture(root, runtime, afterAttrs, storage=new Map()) {
 const source=readFileSync(root+'/src/modules/client/v5-bundle-mains.js','utf8');
 const quick=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='accountbookQuickInputClientMain');
 const names=['DRAFT_KEY','DRAFT_FIELDS','DRAFT_MAX_AGE_MS','validDate','draftStore','draftScope','draftOpened','syncDateDescription','rememberDraft','forgetDraft','restoreDraft','setDate','autoOpen'];
 const extracted=quick.body.body.filter(n=>names.includes(n.id?.name)||n.declarations?.some(d=>names.includes(d.id?.name))).map(n=>source.slice(n.start,n.end)).join('\n');
 const byName=new Map(); let section;
 const form={dispatchEvent(e){for(const fn of this.handlers[e.type]||[])fn(e);},handlers:{},hidden:[],appendChild(n){this.hidden.push(n);byName.set(n.name,n);},querySelector(s){if(s==='input[name="month"]')return {value:'2026-07'};if(s==='input[name="household_id"]')return null;return select(s);},addEventListener(t,f){(this.handlers[t]||=[]).push(f);}};
 function node(value='',name='',type='text',attrs={}) {const n={value,name,type,textContent:'',attrs,handlers:{},classList:{add(){},remove(){}},getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=String(v);},setCustomValidity(v){this.validity=v;},addEventListener(t,f){(this.handlers[t]||=[]).push(f);},closest(){return form;},focus(){},dispatchEvent(e){for(const f of this.handlers[e.type]||[])f.call(this,{...e,target:this});}};if(name)byName.set(name,n);return n;}
 const fields={smartInput:node(),amountInput:node('','amount'),memoInput:node('','memo'),payInput:node('','payment_method'),catInput:node('','category'),txDate:node('2026-07-15','transaction_date','date'),rawTextInput:node('','raw_text','hidden'),quickAfter:node('','','',afterAttrs),type:'expense'};
 const radios={expense:node('expense','','radio'),income:node('income','','radio')};
 for(const [kind,n]of Object.entries(radios))Object.defineProperty(n,'checked',{get(){return fields.type===kind;},set(v){if(v)fields.type=kind;}});
 function select(s){if(s==='form')return form;if(s==='#smartInput')return fields.smartInput;const type=s.match(/\[name="?type"?\](?:\[value="?(income|expense)"?\])?/);if(type)return type[1]?radios[type[1]]:radios[fields.type];const name=s.match(/\[name="?([\w_]+)"?\]/)?.[1];return byName.get(name)||null;}
 section={querySelector:select,getAttribute(key){return key==='data-ab-draft-user'?'user-bin':key==='data-ab-draft-household'?'house-home':null;}};
 const document={getElementById(id){return fields[id]||null;},createElement(){return node();},addEventListener(){},dispatchEvent(){},querySelectorAll(s){return s==='input[name=type]'?Object.values(radios):[];},querySelector(s){if(s==='#add form.form')return form;if(s==='input[name=type][value=income]:checked')return fields.type==='income'?radios.income:null;return select(s);}};
 const Event=class {constructor(type,opts={}){this.type=type;Object.assign(this,opts);}};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[Date.parse('2026-07-15T03:00:00Z')]));}static now(){return Date.parse('2026-07-15T03:00:00Z');}}
 const context=vm.createContext({document,window:{addEventListener(){},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}},location:{pathname:'/app',search:'?month=2026-07&household_id=house-home&quick=1',hash:''},navigator:{},Intl,URLSearchParams,Date:ClockDate,Event,CustomEvent:Event,setTimeout,clearTimeout,section,overlay:null,form});
 vm.runInContext(runtime.slice(0,runtime.indexOf('\n(function mobileShellUiClientMain')),context);
 vm.runInContext('function syncReturnTarget(){};function requestedDate(){return "";}function open(){if(!draftOpened){restoreDraft();draftOpened=true;}};'+extracted,context);
 const fire=(field,type,detail)=>field.dispatchEvent({type,detail});
 return {fields,form,storage,fill(text){fields.smartInput.value=text;fire(fields.smartInput,'input');},manual(id,value){fields[id].value=value;fire(fields[id],'input');},manualType(type){radios[type].checked=true;fire(radios[type],'change');},remember(){vm.runInContext('rememberDraft(form)',context);},restore(){vm.runInContext('autoOpen()',context);},marker(name){return byName.get('quick_manual_'+name)?.value;},canSubmit(){const e={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of form.handlers.submit||[])fn(e);return !e.defaultPrevented;}};
}


await withClock("2026-07-15",()=>fixture(async fx=>{
 const html=(await page(fx,"/app?month=2026-07&household_id=house-home")).html;
 const runtimePath=html.match(/\/assets\/mobile-home-shell-v\d+\.js/)[0];
 const runtime=await(await app.fetch(new Request(BASE+runtimePath),fx.env,{})).text();
 const attrs=Object.fromEntries([...html.match(/<p[^>]*id="quickAfter"[^>]*>/)[0].matchAll(/([a-z-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&quot;/g,'"')]));
 for(const text of ["결제 취소 36000","2월 30일 문구 2300"]){
  const state=draftFixture(root,runtime,attrs);state.fill(text);state.remember();
  ok(!!JSON.parse(state.storage.get("abQuickInputDraft:v2:user-bin:house-home")).raw_text,"draft retains parser source");
  const restored=draftFixture(root,runtime,attrs,state.storage);restored.restore();
  eq(restored.fields.rawTextInput.value,text,"actual draft restore replays parser source");
  eq(restored.marker("date"),"0","draft autoOpen does not turn inferred date into manual choice");
  eq(restored.marker("type"),"0","draft autoOpen does not confirm default type");
  eq(restored.canSubmit(),false,"restored cancellation or impossible date remains blocked");
 }
 const state=draftFixture(root,runtime,attrs);state.fill("어제 점심 12000");state.remember();
 const restored=draftFixture(root,runtime,attrs,state.storage);restored.restore();
 eq(restored.fields.txDate.value,"2026-07-14","automatic draft date retained");eq(restored.marker("date"),"0","automatic draft date marker retained");
 restored.fill("7월 3일 택시 4000");eq(restored.fields.txDate.value,"2026-07-03","automatic restored date follows new sentence");
 restored.fill("2월 30일 문구 2300");eq(restored.fields.txDate.value,"","impossible date after draft restore is not replaced by earlier date");eq(restored.canSubmit(),false,"impossible date after draft restore remains blocked");
 const manual=draftFixture(root,runtime,attrs);manual.fill("결제 취소 36000");manual.manual("txDate","2026-07-05");manual.manualType("income");manual.remember();
 const chosen=draftFixture(root,runtime,attrs,manual.storage);chosen.restore();
 eq(chosen.marker("date"),"1","draft manual date choice retained");eq(chosen.marker("type"),"1","draft manual type choice retained");
 eq(chosen.fields.type,"income","draft chosen type retained");eq(chosen.fields.txDate.value,"2026-07-05","draft chosen date retained");eq(chosen.canSubmit(),true,"explicit restored choice allows cancellation");
 chosen.fill("7월 3일 택시 4000");eq(chosen.fields.type,"income","restored manual type survives another parse");eq(chosen.fields.txDate.value,"2026-07-05","restored manual date survives another parse");
}));

console.log(`Lucian A prerequisites V22.9.48: ${checks} checks passed`);
