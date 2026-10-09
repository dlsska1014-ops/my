// Synthetic regression evidence only. No production writes or real user data.
import assert from "node:assert/strict";
import vm from "node:vm";
import app, { moneyTokenSpans, transactionTypeFromText, quickInputDate, parseMobileAmountText, parseMultipleTransactions, parseTransaction, budgetSummary, signedPurposeToken, readPurposeToken, makeCredentialProof, verifyCredentialProof, boundedFormRequest } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
let checks = 0;
const eq = (a,b,label) => {assert.deepEqual(a,b,label);checks++;};
const ok = (a,label) => {assert.ok(a,label);checks++;};
const BASE = "https://malhaebook.com";
async function call(f, method, path, fields = {}, extra = {}) {
  return app.fetch(new Request(BASE+path,{method,headers:{cookie:f.cookie,origin:BASE,"sec-fetch-site":"same-origin","content-type":"application/x-www-form-urlencoded",...extra},...(method === "POST" ? {body:new URLSearchParams(fields)} : {})}),f.env,{waitUntil(){}});
}
const amounts = [
  ["5천만원",50000000],["1,200만원",12000000],["전세 1억 5천만원",150000000],["3억 5000만원",350000000],
  ["월급 1,200만원",12000000],["1.2억",120000000],["3만5000원 마트",35000],["삼만오천원 마트",35000],
  ["점심 12000 2026-07-04",12000],["점심 12000원 (10% 할인)",12000],["점심 12000원 15일",12000],
  ["택시 8500 오후 3시 30분",8500],["01012345678 택시 8000",8000],["20260704 점심 9000",9000],["커피 4500.",4500],
  ["1,5만 커피",0],["1억 보증금",100000000],
  ["캐시백 10000",10000],["중고 판매이백",200],
];
const client = vm.createContext({});
vm.runInContext(`${moneyTokenSpans.toString()}\n${parseMobileAmountText.toString()}\n${quickInputDate.toString()}\n${transactionTypeFromText.toString()}`,client);
for (const [text,expected] of amounts) {
  eq(parseMobileAmountText(text),expected,"mobile amount: "+text);
  eq(vm.runInContext(`parseMobileAmountText(${JSON.stringify(text)})`,client),expected,"serialized amount: "+text);
  const parsed = parseMultipleTransactions(text,{});
  eq(parsed.length,expected ? 1 : 0,"one monetary token: "+text);
  if(expected) eq(parsed[0].amount,expected,"server amount: "+text);
}
for(const text of ["이자카야 35000","대출이자 500000","무이자 할부 노트북 1200000","카드 이자 12000","월급날 치킨 20000","수입맥주 12000"]) {
  eq(parseTransaction(text,{}).type,"expense","expense context: "+text);
  eq(vm.runInContext(`transactionTypeFromText(${JSON.stringify(text)})`,client),"expense","serialized expense: "+text);
}
for(const text of ["판매 18만원","중고 판매이백","세뱃돈 30000","축의금 받음 50000","송금받음 10000","선물 받음 30000"]) eq(transactionTypeFromText(text),"income","received income: "+text);
for(const text of ["용돈 30000","이자 50000","수당 20000","캐시백 10000","월세수입 500000"]) { eq(parseTransaction(text,{}).type,"income","existing unambiguous income vocabulary: "+text);eq(parseMultipleTransactions(text,{}).length,1,"one income row rather than noun-unit split: "+text); }
eq(parseTransaction("캐시백 10000",{params:{type:"expense"}}).type,"expense","explicit transaction type remains authoritative");
eq(parseMultipleTransactions("우유 3000, 우유 3000",{}).length,2,"same-message repeated rows retained");
for(const [text,today,expected] of [["지난달 25일","2026-01-02","2025-12-25"],["다음달 5일","2026-12-02","2027-01-05"],["점심 12000 7/4","2026-10-07","2026-07-04"],["2월 30일","2026-10-07",""],["내일배움카드","2026-10-07",""],["내일 커피","2026-10-07","2026-10-08"],["3일 전 커피 4500","2026-07-15","2026-07-12"],["3일 후 점심 7000","2026-07-15","2026-07-18"],["2주 전 택시 8000","2026-07-15","2026-07-01"],["2주 후 식비 9000","2026-07-15","2026-07-29"]]) {
  eq(quickInputDate(text,today),expected,"explicit date: "+text);
  eq(vm.runInContext(`quickInputDate(${JSON.stringify(text)},${JSON.stringify(today)})`,client),expected,"serialized explicit date: "+text);
}
eq(parseTransaction("2월 30일 커피 4500",{}).ok,false,"invalid explicit date cannot become today");
for(let i=0;i<40;i++) {
  const covered=5000+i*11, outside=500000+i*100, limit=100000;
  const rows=[{type:"expense",category:"식비",amount:covered},{type:"expense",category:"쇼핑",amount:outside},{type:"income",category:"급여",amount:3000000}];
  const summary=budgetSummary(rows,[{category:"식비",amount:limit},{category:"__total",amount:limit*2}]);
  eq(summary.totalBudget,limit,"category-first priority");eq(summary.budgetedExpense,covered,"only configured-category expense");eq(summary.remaining,limit-covered,"unbudgeted expense does not consume allowance");eq(summary.uncoveredExpense,outside,"unbudgeted expense remains visible");
}
{
 const f=await createV2265QaFixture();
 try {
   const proof=await makeCredentialProof(f.env,"user-bin");
   const req=new Request(BASE,{headers:{cookie:"ab_credential_reauth="+encodeURIComponent(proof)}});
   eq(await verifyCredentialProof(req,f.env,"user-bin"),true,"valid scoped credential proof");
   eq(await verifyCredentialProof(req,f.env,"user-wifi"),false,"cross-user proof rejected");
   const deleteProof=await signedPurposeToken(f.env,"household-delete",{user_id:"user-bin",version:1});
   eq(await readPurposeToken(f.env,"credential-change",deleteProof),null,"wrong proof purpose rejected");
   const stale=await signedPurposeToken(f.env,"credential-change",{user_id:"user-bin",version:1},-1);
   eq(await readPurposeToken(f.env,"credential-change",stale),null,"stale proof rejected");
   const before=JSON.stringify(f.db.accountbook_user_identities);
   const deny=await call(f,"POST","/my/backup-login",{login_name:"stolen",access_code:"replacement123",access_code_confirm:"replacement123"});
   eq(deny.status,403,"session-only credential replacement denied");eq(JSON.stringify(f.db.accountbook_user_identities),before,"denied request writes no identity");
   const link=await call(f,"GET","/my/kakao-link");ok(!(link.headers.get("location")||"").includes("kauth.kakao.com"),"session-only identity linking cannot initiate OAuth");
   const state=await signedPurposeToken(f.env,"kakao-oauth",{user_id:"",mode:"login"},-1);
   eq(await readPurposeToken(f.env,"kakao-oauth",state),null,"expired OAuth state denied");
   const large=await app.fetch(new Request(BASE+"/my/local-login",{method:"POST",headers:{origin:BASE,"sec-fetch-site":"same-origin","content-type":"application/x-www-form-urlencoded"},body:"x="+"a".repeat(65537)}),f.env,{});
   eq(large.status,413,"stream-count form cap enforced");
   const malformed=await app.fetch(new Request(BASE+"/my/local-login",{method:"POST",headers:{origin:BASE,"sec-fetch-site":"same-origin","content-type":"multipart/form-data"},body:"bad"}),f.env,{});
   eq(malformed.status,400,"malformed form returns 400");
   const body=await boundedFormRequest(new Request(BASE,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"a=1"}));eq((await body.formData()).get("a"),"1","valid form contract preserved");
 } finally {f.restore();}
}
{
 const f=await createV2265QaFixture();
 Object.assign(f.env,{KAKAO_LOGIN_ENABLED:"1",KAKAO_REST_API_KEY:"synthetic-rest-key",PUBLIC_BASE_URL:BASE,KAKAO_REDIRECT_URI:BASE+"/auth/kakao/callback"});
 const original=globalThis.fetch;let exchanges=0,kakaoId="2265";
 globalThis.fetch=async(input,init)=>{if(String(input).includes("kauth.kakao.com")){exchanges++;return new Response(JSON.stringify({access_token:"synthetic-access"}));}if(String(input).includes("kapi.kakao.com"))return new Response(JSON.stringify({id:kakaoId,properties:{nickname:"synthetic"}}));return original(input,init);};
 const cookies=r=>r.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
 const oauthStart=()=>call(f,"GET","/auth/kakao/start?reauth=credential-change&return_to=%2Fmy%2Fbackup-login");
 try {
   const start=await oauthStart();eq(start.status,303,"current Kakao credential reauth starts through actual router");
   const state=new URL(start.headers.get("location")).searchParams.get("state");
   const completed=await call(f,"GET","/auth/kakao/callback?code=synthetic&state="+encodeURIComponent(state),{}, {cookie:f.cookie+"; "+cookies(start)});
   ok(cookies(completed).includes("ab_credential_reauth="),"current linked Kakao identity grants scoped credential proof");
   const changed=await call(f,"POST","/my/backup-login",{login_name:"audit-current",access_code:"AuditPassword123",access_code_confirm:"AuditPassword123"},{cookie:f.cookie+"; "+cookies(completed)});
   eq(changed.status,303,"scoped Kakao proof permits first strong credential setup");
   const identity=f.db.accountbook_user_identities.find(row=>row.user_id==="user-bin"&&row.provider==="local");eq(identity.credential_iterations,210000,"KDF strength retained");
   const stale=await call(f,"POST","/my/backup-login",{login_name:"audit-stale",access_code:"NewPassword123",access_code_confirm:"NewPassword123"},{cookie:cookies(changed)+"; "+cookies(completed)});eq(stale.status,403,"credential proof cannot be reused after session-version change");
   const normal=await call(f,"POST","/my/backup-login",{login_name:"audit-current",access_code:"NewPassword123",access_code_confirm:"NewPassword123",current_password:"AuditPassword123"},{cookie:cookies(changed)});eq(normal.status,303,"current strong password permits normal credential replacement");
   const next=await call(f,"GET","/app?household_id=house-home",{},{cookie:cookies(normal)});eq(next.status,200,"new session version opens next authenticated request");
   const oldSession=await call(f,"GET","/app?household_id=house-home",{},{cookie:cookies(changed)});eq(oldSession.status,303,"previous session is revoked after credential replacement");
   f.db.__enforce_auth_rate=true;f.db.__rpc_calls.length=0;
   await call(f,"POST","/my/local-login",{login_name:"absent-one",access_code:"SyntheticPassword123"},{"cf-connecting-ip":"192.0.2.30","user-agent":"one"});
   await call(f,"POST","/my/local-login",{login_name:"absent-two",access_code:"SyntheticPassword123"},{"cf-connecting-ip":"192.0.2.30","user-agent":"two"});
   const logged=await call(f,"POST","/my/local-login",{login_name:"audit-current",access_code:"NewPassword123"},{"cf-connecting-ip":"192.0.2.30","user-agent":"three"});eq(logged.status,303,"bounded caller can still log in successfully");
   const admissions=f.db.__rpc_calls.filter(row=>row.name==="accountbook_auth_attempt"&&row.data.p_limit===40);
   eq(new Set(admissions.map(row=>row.data.p_key)).size,1,"changing user-agent or login name keeps one persistent IP admission key");
   ok(!f.db.__rpc_calls.some(row=>row.name==="accountbook_auth_attempt"&&row.data.p_success&&row.data.p_key===admissions[0].data.p_key),"successful normal login cannot reset overall IP admission");
   f.cookie=cookies(normal);
   const mismatchStart=await oauthStart();kakaoId="2266";
   const mismatchState=new URL(mismatchStart.headers.get("location")).searchParams.get("state");
   const mismatch=await call(f,"GET","/auth/kakao/callback?code=synthetic&state="+encodeURIComponent(mismatchState),{},{cookie:f.cookie+"; "+cookies(mismatchStart)});ok(!cookies(mismatch).includes("ab_credential_reauth="),"other Kakao identity cannot establish current-account proof");
   const before=exchanges;await call(f,"GET","/auth/kakao/callback?code=synthetic&state=forged",{},{cookie:f.cookie+"; kakao_oauth_state=forged"});eq(exchanges,before,"forged equal query/cookie state cannot reach token exchange");
   const inapp=await call(f,"GET","/auth/kakao/start?reauth=credential-change",{},{"user-agent":"KAKAOTALK iOS"});eq(inapp.status,403,"unsupported in-app forced reauth is blocked with external-browser guidance");
   const proof=await makeCredentialProof(f.env,"user-bin");f.db.__fail_user_security_reads=true;eq(await verifyCredentialProof(new Request(BASE,{headers:{cookie:"ab_credential_reauth="+encodeURIComponent(proof)}}),f.env,"user-bin"),false,"security lookup outage cannot revive v1 proof");
 }finally{f.restore();}
}
{
 const f=await createV2265QaFixture();const oldNow=globalThis.__AB_QA_FIXED_NOW_MS;globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-07-15T03:00:00Z");
 try{
  f.db.transactions=[{id:"covered",household_id:"house-home",user_id:"user-bin",transaction_date:"2026-07-01",type:"expense",category:"식비",amount:200000,memo:"covered"},{id:"outside",household_id:"house-home",user_id:"user-bin",transaction_date:"2026-07-02",type:"expense",category:"쇼핑",amount:1500000,memo:"outside"}];
  f.db.accountbook_budgets=[{id:"category-budget",household_id:"house-home",month:"2026-07",category:"식비",amount:1000000}];
  f.db.accountbook_settings.push({key:"kakao_selected_household_v2251:user-bin",value:"house-home"});
  const home=await(await call(f,"GET","/app?month=2026-07&household_id=house-home")).text();ok(home.includes('data-ab-num="47058"'),"actual home daily allowance excludes uncovered spending");ok(!home.includes("이번 달 예산을 700,000원 넘겼어요"),"actual home has no false overspend banner");
  const analysis=await(await call(f,"GET","/my/analysis?month=2026-07&household_id=house-home")).text();
  const payload=JSON.parse(analysis.match(/window\.__INSIGHT__=([\s\S]*?);<\/script>/)[1]);
  const js=await(await call(f,"GET","/my/analysis/app.js")).text();
  const budgetFunction=js.match(/function renderBudget\(\) \{[\s\S]*?\n  \}/)[0];
  const helper=js.slice(0,js.indexOf("(function insightClientMain"));
  const nodes={budgetCard:{},budgetBox:{children:[],appendChild(node){this.children.push(node);}}};
  const el=(tag,cls,text)=>({tag,className:cls||"",textContent:text||"",style:{},children:[],appendChild(node){this.children.push(node);}});
  let paceRows=[];
  new Function("BUDGET","ROWS","state","MONTH","$","el","won","sumAmt","ymOf","C","renderPaceChart",helper+"\n"+budgetFunction+"\nrenderBudget();")(payload.budget,payload.rows.map(row=>({date:row[0],income:row[1]===1,amount:row[2],cat:row[3]})),{start:"2026-07-01",end:"2026-07-31",type:"all"},"2026-07",id=>nodes[id],el,n=>Number(n).toLocaleString("ko-KR")+"원",rows=>rows.reduce((sum,row)=>sum+row.amount,0),date=>date.slice(0,7),{crit:"critical",warn:"warning",ex:"normal"},(_host,rows)=>{paceRows=rows;});
  const textContent=node=>[node.textContent||"",...(node.children||[]).map(textContent)].join(" ");const gauge=textContent(nodes.budgetBox);
  ok(gauge.includes("800,000"),"actual analysis renderer retains matching budget remainder");ok(gauge.includes("200,000")&&!gauge.includes("170%"),"actual analysis renderer does not count uncovered expense");eq(paceRows.length,1,"actual analysis pace curve follows configured-category scope");
  const r=await app.fetch(new Request(BASE+"/skill",{method:"POST",headers:{"content-type":"application/json","user-agent":"audit-budget-unique"},body:JSON.stringify({userRequest:{utterance:"남은 예산",user:{id:"kakao_login:2265",properties:{}}}})}),f.env,{waitUntil(){}});const text=(await r.json()).template.outputs.map(o=>o.simpleText?.text||"").join("\n");ok(text.includes("800,000원"),"actual Kakao remaining budget matches web: "+text);ok(text.includes("200,000원"),"actual Kakao budgeted usage matches web");
  const asset=await(await app.fetch(new Request(BASE+"/assets/mobile-home-shell-v22933.js"),{},{})).text();const start=asset.indexOf("function moneyTokenSpans(");const end=asset.indexOf("(function(){var q=");const parsed=vm.createContext({});vm.runInContext(asset.slice(start,end),parsed);eq(vm.runInContext('parseMobileAmountText("전세 1억 5천만원")',parsed),150000000,"actual immutable asset ships the combined-unit scanner");eq(vm.runInContext('quickInputDate("7/4", "2026-10-07")',parsed),"2026-07-04","actual immutable asset ships the date helper");
 }finally{globalThis.__AB_QA_FIXED_NOW_MS=oldNow;f.restore();}
}
{
 const f=await createV2265QaFixture();
 try {
  const login=await(await call(f,"GET","/my",{},{cookie:""})).text();ok(login.includes('href="#signup-start" data-signup-entry'),"first-screen signup anchor is explicit");ok(login.includes('id="loginEntryAnchorRuntime"'),"actual login page ships the disclosure anchor handler");
  const before=f.db.users.length;const created=await call(f,"POST","/my/local-signup",{login_name:"audit-signup-invite",access_code:"AuditSignupPassword123",access_code_confirm:"AuditSignupPassword123",invite_code:"NOT_A_REAL_INVITE"},{cookie:""});eq(f.db.users.length,before+1,"invalid invitation still creates exactly one account");
  const location=created.headers.get("location");ok(location.includes("msg=signup_created_invite_missing")&&!location.includes("err="),"account creation and invitation result are separate success feedback");
  const createdCookie=created.headers.getSetCookie().find(c=>c.startsWith("ab_user="))?.split(";")[0];const message=await(await call(f,"GET",location,{},{cookie:createdCookie})).text();ok(message.includes("가입을 다시 누르지 말고"),"actual signup result guides next household step rather than another signup");
  const bad=await call(f,"POST","/my/create",{household_name:'A"',display_name:"Audit actor"});const back=bad.headers.get("location");ok(back.includes("household_name="),"invalid household name is preserved without password fields");const page=await(await call(f,"GET",back)).text();ok(page.includes('value="A&quot;"'),"actual household form restores escaped attempted name");
  const report=await(await call(f,"GET","/my/analysis?month=2026-07&household_id=house-home&view=report")).text();ok(report.includes("2026-07-01 ~ 2026-07-31 월 전체 기준"),"actual report identifies full-month average and no-spend period");
  const privacy=await(await call(f,"GET","/privacy")).text();ok(privacy.includes("계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지"),"privacy page describes current account deletion limitation");ok(privacy.includes("공동 거래 이력은 보존"),"privacy distinguishes household leave from financial-data deletion");
 }finally{f.restore();}
}
{
 const f=await createV2265QaFixture(), previousNow=globalThis.__AB_QA_FIXED_NOW_MS;
 globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-07-15T03:00:00Z");
 const decode=value=>value.replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
 try {
  f.db.transactions=[];f.db.accountbook_budgets=[{id:"food-only",household_id:"house-home",month:"2026-07",category:"식비",amount:100000}];
  const html=await(await call(f,"GET","/app?month=2026-07&household_id=house-home")).text();
  const script=await(await app.fetch(new Request(BASE+"/assets/mobile-home-shell-v22933.js"),{},{})).text();
  const end=script.indexOf("\n(function mobileShellUiClientMain");ok(end>0,"actual shipped quick-input IIFE boundary exists");
  const afterTag=html.match(/<p[^>]*id="quickAfter"[^>]*>/)[0];
  const afterAttrs=Object.fromEntries([...afterTag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(match=>[match[1],decode(match[2])]));
  function createState() {
   const form={handlers:{},hidden:[],appendChild(node){this.hidden.push(node);},querySelector(selector){return selector==='input[name="month"]'?{value:"2026-07"}:null;},addEventListener(kind,fn){(this.handlers[kind]||=[]).push(fn);}};
   const node=(value="",attrs={})=>({value,textContent:"",attrs,handlers:{},focus(){},getAttribute(key){return this.attrs[key]??null;},setAttribute(key,value){this.attrs[key]=String(value);},setCustomValidity(value){this.validity=value;},addEventListener(kind,fn){(this.handlers[kind]||=[]).push(fn);},closest(){return form;}});
   const fields={smartInput:node(),amountInput:node(),memoInput:node(),payInput:node(),catInput:node(),txDate:node("2026-07-15"),rawTextInput:node(),quickAfter:node("",{...afterAttrs}),type:"expense"};
   const radios={expense:node(),income:node()};for(const [kind,radio]of Object.entries(radios))Object.defineProperty(radio,"checked",{get(){return fields.type===kind;},set(value){if(value)fields.type=kind;}});
   const document={getElementById(id){return fields[id]||null;},createElement(){return node();},addEventListener(){},querySelectorAll(selector){return selector==="#categoryList option"?[{value:"식비"},{value:"쇼핑"}]:selector==="input[name=type]"?Object.values(radios):[];},querySelector(selector){if(selector==="#add form.form")return form;if(selector==="input[name=type][value=income]:checked")return fields.type==="income"?radios.income:null;const match=selector.match(/input\[name=type\]\[value="?(income|expense)"?\]/);return match?radios[match[1]]:null;}};
   vm.runInContext(script.slice(0,end),vm.createContext({document,window:{addEventListener(){}},location:{hash:""},navigator:{},Intl,Date}));
   const fire=(field,kind)=>{for(const fn of field.handlers[kind]||[])fn.call(field,{target:field});};
   return {fields,form,fill(text){fields.smartInput.value=text;fire(fields.smartInput,"input");},manual(id,value){fields[id].value=value;fire(fields[id],"input");},submit(){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of form.handlers.submit||[])fn.call(form,event);return !event.defaultPrevented;},values(){return {household_id:"house-home",month:"2026-07",type:fields.type,transaction_date:fields.txDate.value,amount:fields.amountInput.value,memo:fields.memoInput.value,category:fields.catInput.value,payment_method:fields.payInput.value,raw_text:fields.rawTextInput.value,user_id:"user-bin",return_to:"/app?month=2026-07&household_id=house-home",...Object.fromEntries(form.hidden.map(node=>[node.name,node.value]))};}};
  }
  for(const [text,value]of [["캐시백 10000",10000],["5천만원",50000000],["1,200만원",12000000],["삼만오천원 마트",35000]]) {const state=createState();state.fill(text);eq(Number(state.fields.amountInput.value.replace(/,/g,"")),value,"actual IIFE monetary token: "+text);if(text.startsWith("캐시백"))eq(state.fields.type,"income","actual IIFE cashback income");}
  const invalidAmount=createState();invalidAmount.fill("점심 4500원");invalidAmount.fill("커피 1,5만");eq(invalidAmount.fields.amountInput.value,"","actual IIFE clears stale AUTO amount");eq(invalidAmount.submit(),false,"ambiguous new text cannot accidentally submit old amount");ok(invalidAmount.fields.quickAfter.textContent.includes("금액이 분명하지"),"invalid AUTO amount has visible feedback");
  const before=f.db.transactions.length;await call(f,"POST","/admin/transactions",{...invalidAmount.values(),amount:"4500"});eq(f.db.transactions.length,before,"server also refuses ambiguous stale AUTO amount");
  invalidAmount.manual("amountInput","6500");eq(invalidAmount.submit(),true,"valid deliberate manual amount correction submits");await call(f,"POST","/admin/transactions",invalidAmount.values());eq(f.db.transactions.at(-1).amount,6500,"manual corrected amount is authoritative on actual POST");
  const dateState=createState();dateState.fill("2026-02-30 커피 4500원");eq(dateState.fields.txDate.value,"","actual IIFE clears invalid explicit AUTO date");eq(dateState.submit(),false,"invalid explicit date blocks submit");const oldCount=f.db.transactions.length;await call(f,"POST","/admin/transactions",{...dateState.values(),transaction_date:"2026-07-15"});eq(f.db.transactions.length,oldCount,"server refuses stale default date for invalid explicit text");dateState.manual("txDate","2026-07-14");eq(dateState.submit(),true,"valid explicit manual date correction submits");await call(f,"POST","/admin/transactions",dateState.values());eq(f.db.transactions.at(-1).transaction_date,"2026-07-14","manual date correction is stored");
  const covered=createState();covered.fill("식비 20000원");covered.manual("catInput","식비");ok(covered.fields.quickAfter.textContent.includes("80,000원"),"covered category preview matches budgetSummary");
  const uncovered=createState();uncovered.fill("쇼핑 20000원");uncovered.manual("catInput","쇼핑");ok(uncovered.fields.quickAfter.textContent.includes("차감하지"),"uncovered category preview never subtracts covered allowance");eq(budgetSummary([{type:"expense",category:"쇼핑",amount:20000}],f.db.accountbook_budgets).remaining,100000,"uncovered stored allowance matches preview meaning");
  const otherMonth=createState();otherMonth.fill("식비 20000원");otherMonth.manual("txDate","2026-06-04");ok(otherMonth.fields.quickAfter.textContent.includes("해당 월"),"other-month input defers current-month numeric forecast");ok(!otherMonth.fields.quickAfter.textContent.includes("80,000원"),"other-month forecast does not reduce current allowance");
  const income=createState();income.fill("용돈 30000원");ok(income.fields.quickAfter.textContent.includes("지출 예산을 차감하지"),"income preview preserves expense budget");
  const deliberate=createState();deliberate.fill("식비 4500원");deliberate.manual("amountInput","8500");deliberate.manual("catInput","쇼핑");deliberate.fill("식비 12000원");eq(deliberate.fields.amountInput.value,"8,500","deliberate manual amount survives new AUTO suggestion");eq(deliberate.fields.catInput.value,"쇼핑","deliberate category survives keyword suggestion");
  f.db.accountbook_settings.push({key:"kakao_selected_household_v2251:user-bin",value:"house-home"});
  for(const [text,date]of [["점심 12000 7/4","2026-07-04"],["내일배움카드 5000","2026-07-15"],["3일 전 커피 4500","2026-07-12"],["3일 후 점심 7000","2026-07-18"],["2주 전 택시 8000","2026-07-01"],["2주 후 식비 9000","2026-07-29"]]) {
    eq(parseTransaction(text,{}).transaction_date,date,"actual server date grammar: "+text);const state=createState();state.fill(text);eq(state.fields.txDate.value,date,"actual client date: "+text);
    const response=await app.fetch(new Request(BASE+"/skill",{method:"POST",headers:{"content-type":"application/json","user-agent":"review-date-"+date},body:JSON.stringify({userRequest:{utterance:text,user:{id:"kakao_login:2265",type:"botUserKey",properties:{}}}})}),f.env,{waitUntil(){}});await response.text();eq(f.db.transactions.at(-1).transaction_date,date,"actual /skill stored date: "+text);
  }
  const count=f.db.transactions.length;await app.fetch(new Request(BASE+"/skill",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userRequest:{utterance:"2026-02-30 커피 4500원",user:{id:"kakao_login:2265",type:"botUserKey",properties:{}}}})}),f.env,{waitUntil(){}});eq(f.db.transactions.length,count,"invalid explicit date stores zero on actual /skill");
  const nounBatch=parseMultipleTransactions("내일배움카드 5000, 점심 12000",{});eq(nounBatch.length,2,"ordinary date-like noun batch keeps both entries");ok(nounBatch.every(row=>row.transaction_date==="2026-07-15"),"date-like noun cannot inject tomorrow into later batch clauses");
  const backup=await(await call(f,"GET","/my/backup-login")).text();ok(backup.includes("원래 연결한 카카오 계정으로 본인 확인")&&!backup.includes("??"),"reauth action renders proper UTF-8 Korean");
 } finally {globalThis.__AB_QA_FIXED_NOW_MS=previousNow;f.restore();}
}
console.log(`PASS: V22.9.30 audit corrections (${checks} checks)`);
