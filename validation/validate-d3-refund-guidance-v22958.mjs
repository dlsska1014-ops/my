import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {parseModule} from "../tools/worker-analysis.mjs";
import {counter, fixture, intercept, failure, page, post, api, withClock, putSetting, skill, beforeBotObservationRenderer} from "./lib-audit-v22934.mjs";
import {computeFairMoM, renderMyAnalysisHtml} from "../src/modules/my/analysis-page.js";
import {buildBudgetAlertPolishModel, renderPendingRecurringList} from "../src/modules/features/budget-alerts-annual-goals.js";
import {fetchBudgets, fetchRecurringStrict} from "../src/modules/domain/budgets.js";
import {buildSettlementModel} from "../src/modules/features/settlement-ops-pages.js";
import {kakaoSettlementParts} from "../src/modules/kakao/simple-commands.js";
// V22.9.72: 카카오 정산 문구는 parts(빈 결과 표식) 로 바뀌었다. 문구만 쓴다.
const kakaoSettlementText=async (...args)=>(await kakaoSettlementParts(...args)).text;
import {kakaoText, kakaoGroupCompatibleResponse} from "../src/modules/kakao/response-builders.js";
const {ok,eq,deepEq,done}=counter("D3 and refund guidance V22.9.58");
globalThis.fetch=async()=>{throw Error("Native external fetch forbidden");};
const tx=(date,amount,extra={})=>({id:"tx-"+date+"-"+amount,household_id:"house-home",user_id:"user-bin",transaction_date:date,type:"expense",category:"외식",memo:"합성 공동 지출",amount,...extra});
const budget=[{category:"식비",amount:700000}];
const model=(rows=[],extra={})=>buildBudgetAlertPolishModel({month:"2026-10",rows,budgets:budget,recurring:[],...extra});
const paths=["/budget-alerts","/today-budget","/monthly-forecast","/fixed-preview"];
const qs="?month=2026-10&household_id=house-home";
const notice="환급 계산은 미리보기로만 제공합니다. 일반 정산 금액과 완료 이력에는 반영하지 않습니다.";
const capture=()=>{const requests=[];intercept(({url,method})=>{requests.push({path:url.pathname,search:url.search,method});});return requests;};
function seed(fx,rows,month="2026-10",amount=700000){fx.db.transactions=structuredClone(rows);fx.db.accountbook_budgets=[{id:"b-d3",household_id:"house-home",month,category:"식비",amount}];fx.db.accountbook_recurring=[];}
function pair(fx,recipient="user-bin"){
 fx.db.household_members=fx.db.household_members.filter(m=>m.household_id!=="house-home");
 fx.db.household_members.push({household_id:"house-home",user_id:"user-bin",role:"owner",nickname:"A"},{household_id:"house-home",user_id:"user-wifi",role:"member",nickname:"B"});
 fx.db.transactions=[tx("2026-10-10",100000,{id:"expense"}),tx("2026-10-11",40000,{id:"refund",user_id:recipient,type:"income",category:"환급",memo:"합성 환급"}),tx("2026-10-12",900000,{id:"salary",type:"income",category:"급여"})];
}
const sha=text=>createHash("sha256").update(text).digest("hex");
const protection=JSON.parse(readFileSync(new URL("./d3-refund-protection-v22958.json",import.meta.url)));
for(const [rel,names] of Object.entries(protection)){
 const source=readFileSync(new URL("../"+rel,import.meta.url),"utf8");const ast=parseModule(source);
// V22.9.75 감사 D-20: 조회 전용·나간 사람 정산 결함을 고치려 buildSettlementModel·handleSettlementHistorySave 를 의도적으로 바꿔 두 지문을 새로 적었다.
 for(const [name,hash]of Object.entries(names)){const node=ast.body.find(n=>n.id?.name===name);ok(!!node,"protected function exists "+name);eq(sha(source.slice(node.start,node.end)),hash,"V57 unchanged contract "+name);}
}
const renderer=readFileSync(new URL("../src/modules/my/analysis-page.js",import.meta.url),"utf8");
const renderNode=parseModule(renderer).body.find(n=>n.id?.name==="renderMyAnalysisHtml");
const renderBlock=renderer.slice(renderNode.start,renderNode.end)+"\n";
// Existing guards include the trailing line break before the next declaration.
eq(sha(beforeBotObservationRenderer(renderBlock)),"db2edc2887985b44fd9456a38b7b5f014c4a8739bc5e0c4bca2ba21626ff4bfd","exact D3 exceptions plus BOT09 preserve original renderer hash");
for(const changed of [renderBlock.replace('  const comparisonDisplay = fairMoMDisplay(fair);\n',''),renderBlock.replace('${comparisonDisplay.expense.cls}','${comparisonDisplay.income.cls}'),renderBlock.replace('  const comparisonDisplay = fairMoMDisplay(fair);','  const comparisonDisplay = fairMoMDisplay(fair);\n  const comparisonDisplay = fairMoMDisplay(fair);')]){assert.throws(()=>beforeBotObservationRenderer(changed));ok(true,"exception normalization refuses missing, altered or repeated expressions");}

await withClock("2026-10-15",async()=>{
 const current=[tx("2026-10-10",300000),tx("2026-10-25",150000)],previous=[tx("2026-09-10",300000)];
 const fair=computeFairMoM("2026-10",current,previous),m=model(current);
 deepEq([fair.expense,m.spent,m.observedSpent,m.avgDaily,m.forecastExpense,m.remainingBudget,m.dailyAllowance,m.status],[0,450000,300000,20000,620000,250000,14706,"ok"],"correct baseline independent expected values");
 for(const [a,b,kind,rate,difference]of [[0,0,"unchanged",null,0],[500,0,"difference",null,500],[0,500,"percent",-100,-500],[500,500,"percent",0,0]])for(const type of ["expense","income"]){
  const result=computeFairMoM("2026-10",a?[tx("2026-10-01",a,{type})]:[],b?[tx("2026-09-01",b,{type})]:[])[type+"Comparison"];
  deepEq([result.kind,result.rate,result.difference],[kind,rate,difference],type+" zero denominator contract "+a+"/"+b);
 }
 const outside=computeFairMoM("2026-10",[...current,tx("2026-08-01",999999)], [...previous,tx("2026-10-01",999999),tx("2026-09-25",999999)]);
 eq(outside.expense,0,"both explicit date ranges exclude outside rows");
 eq(computeFairMoM("2026-09",[tx("2026-09-30",100)],[tx("2026-08-31",100)]).expense,0,"past comparison uses both complete months rather than equal day counts");
 for(const [rows,prior]of [[null,[]],[[],null],[[tx("2026-02-30",1)],[]],[[tx("bad",1)],[]],[[tx("2026-10-01",null)],[]]])eq(computeFairMoM("2026-10",rows,prior).state,"unavailable","invalid or unread rows are not zeros");
 for(const status of ["unknown","response-cap","limit","inconsistent"]){eq(computeFairMoM("2026-10",[],[],{currentReceipt:{status}}).state,"unavailable","current receipt "+status);eq(computeFairMoM("2026-10",[],[],{previousReceipt:{status}}).state,"unavailable","previous receipt "+status);deepEq([model(current,{receipt:{status}}).avgDaily,model(current,{receipt:{status}}).forecastExpense],[null,null],"budget receipt "+status);}
 deepEq([model([]).observedSpent,model([]).avgDaily,model([]).forecastExpense],[0,0,0],"complete empty current month is observed zero");
 deepEq([model([tx("2026-10-25",150000)]).spent,model([tx("2026-10-25",150000)]).forecastExpense],[150000,0],"future-only current month has true observed zero");
 const exhausted=model(current,{budgets:[{category:"식비",amount:450000}]});eq(exhausted.dailyAllowance,0,"zero allowance is a real amount");
 const past=model([tx("2026-09-30",300000)],{month:"2026-09"});deepEq([past.currentDay,past.avgDaily,past.forecastExpense,past.pendingRecurring,past.pendingRecurringTotal,past.afterPendingForecast,past.dailyAllowance],[30,10000,300000,null,null,null,null],"past month is completed performance and deferred recurring");
 const future=model([tx("2026-11-01",300000)],{month:"2026-11"});deepEq([future.currentDay,future.avgDaily,future.forecastExpense,future.pendingRecurringTotal,future.afterPendingForecast,future.status],[0,null,null,null,null,"before"],"future has no observation or presumed pending");
 eq(computeFairMoM("2026-11",[tx("2026-11-01",300000)],current).state,"before","future comparison omitted");
 ok(renderPendingRecurringList(past).includes("보류")&&!renderPendingRecurringList(past).includes("대기 중인 정기지출이 없습니다"),"deferred list is not an empty pending list");
 const unionBudgets=[{category:"식비",amount:200000},{category:"외식",amount:100000},{category:"식비",amount:200000},{category:"우리 분류",amount:200000},{category:"__total",amount:9000000}];
 const unionRows=[tx("2026-10-10",100000),tx("2026-10-11",50000,{category:"식비"}),tx("2026-10-12",30000,{category:"우리 분류"}),tx("2026-10-25",50000),tx("2026-10-13",800000,{category:"여행"})];
 const rules=[{id:"r1",type:"expense",category:"외식",amount:40000,last_applied_month:"2026-09",memo:"합성 공동 지출",day_of_month:10},{id:"r2",type:"expense",category:"식비",amount:10000,last_applied_month:"2026-09"},{id:"r3",type:"expense",category:"우리 분류",amount:20000},{id:"r4",type:"expense",category:"여행",amount:90000},{id:"r5",type:"income",category:"외식",amount:90000},{id:"r6",type:"expense",category:"외식",amount:90000,is_active:false}];
 const union=model(unionRows,{budgets:unionBudgets,recurring:rules});
 deepEq([union.totalBudget,union.spent,union.observedSpent,union.budget.uncoveredExpense,union.pendingRecurringTotal,union.pendingRecurring.length],[700000,230000,180000,800000,70000,3],"same legacy/custom union, duplicate budget allocations and recurring without double count");
 eq(union.afterPendingForecast,442000,"unrounded observed ratio plus every pending item, no similarity deduplication");
 eq(model(unionRows,{budgets:[{category:"__total",amount:2000000}]}).observedSpent,980000,"total fallback covers all expense categories");
 const low=model([tx("2026-10-25",600000)]);eq(low.status,"warning","future registered amount can cause full-month warning");eq(low.forecastExpense,0,"monthly warning is not a pace warning");
 const over=model([tx("2026-10-25",800000)],{month:"2026-10"});eq(over.status,"over","monthly over-budget is retained");ok(over.statusMessage.includes("미래"),"monthly warning explains future registered records");
 const unknown=model(current,{recurring:null});deepEq([unknown.forecastExpense,unknown.pendingState,unknown.pendingRecurringTotal,unknown.afterPendingForecast],[620000,"unavailable",null,null],"recurring-only failure preserves observed forecast");
 for(const input of [{rows:null},{budgets:null},{rows:{}},{budgets:{}}]){assert.throws(()=>model([] ,input),/budget_observation_read_invalid/);ok(true,"non-array model input refuses zero substitution");}
 await fixture(async fx=>{
  seed(fx,[...current,...previous]);const requests=capture();
  const p=await page(fx,"/my/analysis?view=report"+qs.replace("?","&"));eq(p.status,200,"actual mobile report");ok(p.html.includes("지난달 같은 기간 대비 0%"),"actual report comparison is zero");ok(p.html.includes("620,000원")&&p.html.includes("20,000원")&&p.html.includes("450,000원"),"report preserves existing forecast and monthly total");
  const before=requests.length;
  for(const path of paths){const result=await page(fx,path+qs);eq(result.status,200,path+" actual HTTP");for(const value of ["450,000원","250,000원","14,706원","20,000원","620,000원"])ok(result.html.includes(value),path+" correct value "+value);ok(!result.html.includes("930,000원"),path+" future excluded only from pace");}
  eq(requests.slice(before).filter(r=>r.path.endsWith("transactions")).length,4,"one existing transaction GET per budget route");
  ok(!requests.some(r=>r.method==="HEAD"),"no extra HEAD/count request");
  const notifications=await api(fx,"/u/api/notifications"+qs);eq(notifications.status,200,"actual notification HTTP");ok(!notifications.data.notifications.some(n=>n.key.startsWith("budget-warn:")),"no false pace alert");deepEq([notifications.data.budget_observation.observed_spent,notifications.data.budget_observation.average,notifications.data.budget_observation.forecast],[300000,20000,620000],"same actual API observation model");
  fx.env.ADMIN_PASSWORD="synthetic-d3-password";fx.env.ADMIN_SESSION_SECRET="synthetic-d3-admin";const login=await post(fx,"/login",{password:fx.env.ADMIN_PASSWORD},{cookie:""});
  const pc=await page(fx,"/analysis"+qs+"&legacy=1",{cookie:fx.cookie+"; "+login.setCookie.match(/ab_admin=[^;]+/)[0]});eq(pc.status,200,"PC real HTTP");ok(pc.html.includes("지난달 대비 +50%"),"PC retains full-month comparison");
 });
 for(const type of ["expense","income"])for(const [a,b,expected]of [[0,0,"변동 없음 (양쪽 0원)"],[500,0,"500원 증가 (지난달 0원)"],[0,500,"지난달 같은 기간 대비 -100%"]])await fixture(async fx=>{
  seed(fx,[...(a?[tx("2026-10-01",a,{type})]:[]),...(b?[tx("2026-09-01",b,{type})]:[])]);const result=await page(fx,"/my/analysis?view=report"+qs.replace("?","&"));ok(result.html.includes(expected),type+" actual zero comparison "+a+"/"+b);ok(!result.html.includes("지난달 같은 기간 대비 +100%"),"no fabricated percentage");
 });
 await fixture(async fx=>{
  seed(fx,[tx("2026-10-10",40000),tx("2026-10-11",260000),tx("2026-10-25",150000)]);
  fx.db.accountbook_budgets=unionBudgets.map((b,i)=>({...b,id:"pending-budget-"+i,household_id:"house-home",month:"2026-10"}));
  fx.db.accountbook_recurring=[{...rules[0],household_id:"house-home"},{...rules[1],household_id:"house-home",memo:"별도 대기"}];
  // The 40,000-won rule deliberately resembles the directly recorded expense.
  // There is no transaction/rule link, so it must remain in the assumption.
  for(const path of paths){
   const result=await page(fx,path+qs);eq(result.status,200,path+" current nonempty pending HTTP");
   ok(result.html.includes('<span>정기지출 대기</span><b>50,000원</b>'),path+" recurring union counted once");
   ok(result.html.includes("관측 속도 예상에 대기 목록을 모두 더한 가정값 670,000원"),path+" explicit additional assumption amount");
   const list=result.html.match(/<ul class="recList">([\s\S]*?)<\/ul>/)?.[1]||"";eq((list.match(/<li>/g)||[]).length,2,path+" does not deduplicate a similar recorded expense");
  }
  const n=await api(fx,"/u/api/notifications"+qs);eq(n.status,200,"current nonempty pending notification HTTP");
  deepEq([n.data.budget_observation.forecast,n.data.budget_observation.pending_total,n.data.budget_observation.after_pending_assumption],[620000,50000,670000],"API observation and additional assumption remain distinct");
  const pending=n.data.notifications.filter(item=>item.key==="recurring-pending:2026-10");eq(pending.length,1,"current pending retains monthly notification key");ok(pending[0].body.includes("50,000원"),"actual pending notification amount");ok(!n.data.notifications.some(item=>item.key==="budget-warn:2026-10"),"additional pending assumption does not become a pace warning");
 });
 await fixture(async fx=>{
  seed(fx,[tx("2026-10-01",150000),tx("2026-10-11",50000)],"2026-10",300000);
  for(const path of paths){const result=await page(fx,path+qs);eq(result.status,200,path+" true pace warning HTTP");ok(result.html.includes("413,333원")&&result.html.includes("월말 초과 예상"),path+" observed pace warning remains enabled");}
  const n=await api(fx,"/u/api/notifications"+qs);eq(n.status,200,"true pace notification HTTP");const warning=n.data.notifications.find(item=>item.key==="budget-warn:2026-10");ok(warning?.title==="이대로면 월말 예산 초과 예상"&&warning.body.includes("413,333원"),"true pace warning has actual observed forecast");ok(!n.data.notifications.some(item=>item.key==="budget-over:2026-10"),"pace warning is separate from whole-month over-budget");
 });
 for(const month of ["2026-09","2026-11"])await fixture(async fx=>{
  seed(fx,[tx(month+"-01",300000)],month);fx.db.accountbook_recurring=[{...rules[0],household_id:"house-home"}];
  for(const path of paths){const result=await page(fx,path+"?month="+month+"&household_id=house-home");eq(result.status,200,path+" non-current HTTP");ok(result.html.includes("판단 보류"),path+" pending unavailable is visible");ok(!result.html.includes("정상 흐름")&&!result.html.includes("오늘은 약"),path+" no current behavior instruction");ok(result.html.includes(month==="2026-09"?"월 전체 실적":"관측 전"),path+" noncurrent meaning");}
  const n=await api(fx,"/u/api/notifications?month="+month+"&household_id=house-home");eq(n.data.budget_observation.pending_state,"deferred","API deferred pending");ok(!n.data.notifications.some(n=>n.key.startsWith("recurring-pending:")),"no historical/future pending notification");
 });
 await fixture(async fx=>{seed(fx,[tx("2026-10-25",450000)],"2026-10",450000);for(const path of paths){const result=await page(fx,path+qs);ok(result.html.includes('<span>오늘 사용 가능</span><b>0원</b>'),path+" true zero allowance rendered");}});
 // Independent failed reads, malformed results and intermediate-page failures.
 for(const table of ["transactions","accountbook_budgets","accountbook_recurring"])for(const mode of ["503","null","object","empty","partial"]){
  if(mode==="partial"&&table!=="transactions")continue;
  for(const path of [paths[0],"/u/api/notifications"])await fixture(async fx=>{
   seed(fx,mode==="partial"?Array.from({length:1100},(_,i)=>tx("2026-10-01",1,{id:"page-"+i})):current);fx.db.transactions.push(tx("2026-10-02",1,{category:"미분류",id:"uncat"}));
   intercept(({url,method})=>{if(method!=="GET"||!url.pathname.endsWith("/"+table))return;if(mode==="partial"&&!Number(url.searchParams.get("offset")))return;return mode==="503"||mode==="partial"?failure(503,"synthetic independent read failure"):new Response(mode==="null"?"null":mode==="object"?"{}":"[]",{headers:{"content-type":"application/json","content-range":"*/0","preference-applied":"count=exact"}});});
   const result=path.startsWith("/u/")?await api(fx,path+qs):await page(fx,path+qs);
   if(table==="accountbook_recurring"&&mode!=="empty"){
    eq(result.status,200,"recurring-only failure keeps other data "+mode+path);
    if(path.startsWith("/u/")){eq(result.data.budget_observation.pending_state,"unavailable","API keeps recurring failure");eq(result.data.budget_observation.after_pending_assumption,null,"unknown pending is not zero");ok(result.data.notifications.some(n=>n.key.startsWith("uncat:")),"unrelated classification notification remains");}
    else ok(result.html.includes("정기 항목을 조회하지 못해")&&result.html.includes("620,000원"),"page preserves forecast while pending unavailable");
   }else if(mode==="empty"){eq(result.status,200,"successful empty read "+table+path);}
   else if(path.startsWith("/u/")){ok(result.status>=400&&!result.data?.ok,"API failure is controlled "+table+mode);}else ok(result.status>=400&&result.html.includes("안전모드")&&!result.html.includes('<div class="metric">'),"failed read never a successful budget zero "+table+mode);
  });
 }
 for(const mode of ["cap","missing-count"])for(const path of [paths[0],"/my/analysis?view=report","/u/api/notifications"])await fixture(async fx=>{
  seed(fx,Array.from({length:1500},(_,i)=>tx("2026-10-01",1,{id:"cap-"+i})));fx.db.__transaction_max_rows=mode==="cap"?100:Infinity;fx.db.__omit_count_header=mode==="missing-count";
  const url=path+(path.includes("?")?"&":"?")+"month=2026-10&household_id=house-home";const result=path.startsWith("/u/")?await api(fx,url):await page(fx,url);
  ok(result.status>=400,"incomplete receipt blocks successful observation "+path+mode);
 });
 for(const reader of [fetchBudgets,fetchRecurringStrict])for(const body of ["null","{}","[]"])await fixture(async fx=>{intercept(({url,method})=>method==="GET"&&url.pathname.endsWith(reader===fetchBudgets?"accountbook_budgets":"accountbook_recurring")?new Response(body):undefined);if(body==="[]")deepEq(await reader(fx.env,"house-home","2026-10",{strict:true}),[],"strict reader accepts successful empty");else {await assert.rejects(()=>reader(fx.env,"house-home","2026-10",{strict:true}));ok(true,"strict reader rejects "+body);}});
 // Refund guidance does not change computations, completion snapshots, or reads.
 for(const recipient of ["user-bin","user-wifi"])for(const mode of ["equal","ratio","headcount","item"])await fixture(async fx=>{
  pair(fx,recipient);const original=structuredClone(fx.db.transactions);const requests=capture();
  const preview=await post(fx,"/my/settlement/refund-preview",{household_id:"house-home",month:"2026-10",mode,expense_id:"expense",refund_id:"refund",recipient_user_id:recipient,amount:"40000"});eq(preview.status,200,"explicit preview "+recipient+mode);ok(preview.text.includes((recipient==="user-bin"?"30,000원":"70,000원"))&&preview.text.includes(notice),"preview amount and limitation");
  eq(requests.filter(r=>r.method!=="GET").length,0,"preview persistent writes zero");deepEq(fx.db.transactions,original,"preview changes no original or income");
  for(const path of ["/settlement-summary","/split-summary","/meeting-settlement"]){const result=await page(fx,path+qs+"&mode="+mode);eq(result.status,200,"ordinary alias "+path+mode);ok(result.html.includes(notice),"ordinary result always explains limitation");const copy=result.html.match(/id="settlementCopy">([\s\S]*?)<\/div>/)[1];ok(copy.includes(notice)&&copy.includes("50,000원"),"copied area includes 50000 and limitation");ok(result.html.includes('name="confirmed" value="yes" required/> 참여자와 환급 미리보기 계산이 포함되지 않은 금액'),"completion checkbox describes unchanged ordinary amount");}
  const ordinary=await page(fx,"/settlement-summary"+qs+"&mode="+mode);const digest=ordinary.html.match(/name="preview_digest" value="([^"]+)"/)[1];const values={household_id:"house-home",month:"2026-10",mode,confirmed:"yes",preview_digest:digest};
  const saved=await post(fx,"/my/settlement/save",values);ok(saved.location.includes("settlement_completed"),"ordinary completion succeeds after preview");
  const history=JSON.parse(fx.db.accountbook_settings.find(r=>r.key==="settlement_history:house-home").value);eq(history.at(-1).total_expense,100000,"ordinary stored expense excludes income");eq(history.at(-1).transfers[0].amount,50000,"ordinary stored transfer stays 50000");ok(!("refundLinks" in history.at(-1)),"no new refund persistence field");
  const duplicate=await post(fx,"/my/settlement/save",values);ok(duplicate.location.includes("settlement_already_completed"),"completion duplicate unchanged");eq(JSON.parse(fx.db.accountbook_settings.find(r=>r.key==="settlement_history:house-home").value).length,history.length,"duplicate adds no history");
  for(const location of [saved.location,duplicate.location,"/settlement-summary"+qs+"&err=settlement_save_failed"]){const result=await page(fx,location);ok(result.html.includes(notice)&&result.html.includes("50,000원"),"success/duplicate/error/history reentry keeps limitation and amount");}
  const blocked=await post(fx,"/my/settlement/refund-preview",{...values,expense_id:"expense",refund_id:"refund",recipient_user_id:recipient,amount:"40000"});eq(blocked.status,409,"completed preview blocked");ok(blocked.text.includes(notice),"completed-month response explains preview limitation");
 });
 for(const role of ["owner","admin","member","viewer","blocked"])await fixture(async fx=>{
  pair(fx);fx.db.household_members.find(m=>m.user_id==="user-bin"&&m.household_id==="house-home").role=role;
  const result=await page(fx,"/settlement-summary"+qs);const link='href="/my/settlement/refund-preview?';eq(result.html.includes(link),["owner","admin"].includes(role),"preview link follows role "+role);
  if(["member","viewer"].includes(role))ok(result.html.includes("소유자·관리자가 환급 미리보기를 확인할 수 있습니다."),"read role explanation "+role);
  const preview=await page(fx,"/my/settlement/refund-preview"+qs);eq(preview.status,["owner","admin"].includes(role)?200:403,"direct preview permission "+role);
 });
 for(const kind of ["empty","refund-only","salary-link","too-much","cross-month","wrong-receiver"] )await fixture(async fx=>{
  pair(fx);if(kind==="empty")fx.db.transactions=[];if(kind==="refund-only")fx.db.transactions=fx.db.transactions.filter(r=>r.id==="refund");if(kind==="cross-month")fx.db.transactions.find(r=>r.id==="refund").transaction_date="2026-09-30";
  const requests=capture();const ordinary=await page(fx,"/settlement-summary"+qs);eq(ordinary.status,200,"ordinary income/empty always supported "+kind);ok(ordinary.html.includes(notice),"empty/error ordinary guidance "+kind);
  const preview=await post(fx,"/my/settlement/refund-preview",{household_id:"house-home",month:"2026-10",mode:"equal",expense_id:"expense",refund_id:kind==="salary-link"?"salary":"refund",recipient_user_id:kind==="wrong-receiver"?"user-wifi":"user-bin",amount:kind==="too-much"?"40001":"40000"});eq(preview.status,400,"invalid explicit preview rejected "+kind);ok(preview.text.includes(notice),"invalid input still explains limitation");eq(requests.filter(r=>r.method!=="GET").length,0,"invalid preview writes zero");
 });
 for(const kind of ["normal","empty","refund-only","zero-balance","long"] )await fixture(async fx=>{
  pair(fx);if(kind==="empty")fx.db.transactions=[];if(kind==="refund-only")fx.db.transactions=fx.db.transactions.filter(r=>r.id==="refund");if(kind==="zero-balance")fx.db.transactions.push(tx("2026-10-10",100000,{id:"other",user_id:"user-wifi"}));if(kind==="long")for(const member of fx.db.household_members)member.nickname="긴 참여자 이름 ".repeat(100);
  const requests=capture();const text=await kakaoSettlementText(fx.env,{id:"house-home",name:"합성 가계부"});const safe=(await kakaoText(text).json()).template.outputs[0].simpleText.text;ok(safe.includes("일반 정산 금액과 완료 이력에는 반영하지 않습니다."),"Kakao limitation survives safe length "+kind);ok(safe.length<=960,"existing Kakao safe-text length "+kind);eq(requests.filter(r=>r.path.endsWith("transactions")).length,1,"Kakao uses single existing transaction read "+kind);eq(requests.filter(r=>r.method!=="GET").length,0,"Kakao guidance writes zero");if(kind==="zero-balance")ok(text.includes("정산 차액 없음")&&!text.includes(": 정산 완료"),"zero balance is not saved completion");
  const replies=[{label:"예산",action:"message",messageText:"남은 예산"}];
  const direct=await (await kakaoGroupCompatibleResponse(kakaoText(text,replies),{userRequest:{user:{id:"synthetic-direct"}}})).json();
  ok(Array.isArray(direct.template.quickReplies),"1:1 keeps existing replies "+kind);
  const group=await (await kakaoGroupCompatibleResponse(kakaoText(text,replies),{userRequest:{chat:{id:"synthetic-group",type:"botGroupKey",properties:{botGroupKey:"synthetic-group"}}}})).json();
  ok(!Object.hasOwn(group.template,"quickReplies"),"group removes unsupported replies "+kind);
  ok(group.template.outputs.every(o=>!o.commerceCard&&!o.carousel),"group keeps supported output types "+kind);
  ok(String(group.template.outputs[0].simpleText?.text || group.template.outputs[0].textCard?.description || "").includes("일반 정산 금액과 완료 이력에는 반영하지 않습니다."),"group limitation retained after compatibility and length "+kind);
  eq(requests.filter(r=>r.path.endsWith("transactions")).length,1,"response compatibility adds no data read "+kind);
 });
});
for(const [clock,month,expectedDays,forecast]of [["2026-10-03","2026-10",3,206667],["2026-10-01","2026-10",1,620000],["2026-10-31","2026-10",31,20000],["2024-02-29","2024-02",29,20000],["2025-03-31","2025-03",31,20000],["2026-01-31","2026-01",31,20000]])await withClock(clock,async()=>{
 const current=[tx(month+"-01",20000),tx(month+"-28",180000)];const m=model(current,{month});eq(m.currentDay,expectedDays,"calendar observation days "+clock);eq(m.avgDaily,Math.round((expectedDays<28?20000:200000)/expectedDays),"calendar average "+clock);
 if(expectedDays<28)eq(m.forecastExpense,forecast,"forecast rounds only at final won "+clock);
});
await withClock("2026-10-03",async()=>{const rows=[tx("2026-10-02",20000),tx("2026-10-25",180000)];const fair=computeFairMoM("2026-10",rows,[tx("2026-09-02",30000)]);eq(fair.expense,-33,"October3 comparison");eq(model(rows).spent,200000,"October3 monthly total");eq(model(rows).avgDaily,6667,"October3 average");});
for(const [clock,month,prev,previousEnd]of [["2024-03-31","2024-03","2024-02","29"],["2025-03-31","2025-03","2025-02","28"],["2026-05-31","2026-05","2026-04","30"],["2026-01-31","2026-01","2025-12","31"]])await withClock(clock,async()=>{eq(computeFairMoM(month,[tx(month+"-01",100)],[tx(prev+"-"+previousEnd,100)]).expense,0,"previous shorter month clamps "+clock);});
for(const [instant,expected]of [["2026-10-15T14:59:59.999Z",15],["2026-10-15T15:00:00.000Z",16],["2026-10-31T15:00:00.000Z",31]]){const previous=globalThis.__AB_QA_FIXED_NOW_MS;globalThis.__AB_QA_FIXED_NOW_MS=Date.parse(instant);try{eq(model([]).currentDay,expected,"KST date transition "+instant);}finally{globalThis.__AB_QA_FIXED_NOW_MS=previous;}}
done();
