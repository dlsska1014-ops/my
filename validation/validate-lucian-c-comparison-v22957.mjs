import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import app from "../src/index.js";
import {insightObservedWindow, insightPeriodCoverage, insightPaceComparison} from "../src/modules/client/insight-main.js";
import {fetchPostgrestRows} from "../src/modules/data/households-members-rows.js";
import {supabase} from "../src/modules/data/supabase-client.js";
import {parseModule} from "../tools/worker-analysis.mjs";
import {counter, fixture, intercept, failure, page, withClock} from "./lib-audit-v22934.mjs";
import {insightBrowser} from "./lib-insight-browser.mjs";
const {ok, eq, deepEq, done} = counter("Lucian C comparison V22.9.57");
globalThis.fetch = async () => { throw Error("External fetch forbidden"); };
const report = {node:process.version, execPath:process.execPath, workerSha256:createHash("sha256").update(readFileSync(new URL("../src/index.js",import.meta.url))).digest("hex"),pagination:[],routes:[],syntheticOnly:true};
const complete = {status:"complete"};
const bounds = {dataStart:"2025-11-01",dataEnd:"2026-10-31",receipt:complete};
const budget = {total:1000000,basis:"total",cats:[]};
const r = (date,amount,extra={}) => ({date,amount,income:false,cat:"식비",pay:"현금",who:"사용자",memo:"점심",...extra});
const options = (rows=[],extra={}) => ({month:"2026-10",today:"2026-10-15",rows,budget,...bounds,...extra});
const model = (rows=[],extra={}) => insightPaceComparison(options(rows,extra));
const json = value => JSON.parse(JSON.stringify(value));
const data = (rows=[],extra={}) => ({month:"2026-10",today:"2026-10-15",start:bounds.dataStart,budget,receipt:complete,rows:rows.map(row=>[row.date,row.income?1:0,row.amount,row.cat,row.pay,row.memo,row.who]),...extra});
const bundleResponse = await app.fetch(new Request("https://malhaebook.com/my/analysis/app.js"),{},{}), script=await bundleResponse.text();
eq(bundleResponse.headers.get("cache-control"),"public, max-age=600","analysis dynamic bundle retains cache contract");
eq(bundleResponse.headers.get("etag"),null,"analysis bundle does not pretend to be immutable");
const prefix=script.slice(0,script.indexOf("(function insightClientMain")), pure=vm.createContext({});vm.runInContext(prefix,pure);
for(const name of ["insightPeriodCoverage","insightObservedWindow","insightPaceComparison"]) eq(typeof pure[name],"function","real HTTP bundle serializes "+name);

// The baseline protects unaffected functions, variable initializers, URL, filters,
// bars, donut, weekdays, names, list and CSV rather than merely blessing a hash.
const protection=JSON.parse(readFileSync(new URL("./insight-c-protection-v22957.json",import.meta.url))), source=readFileSync(new URL("../src/modules/client/insight-main.js",import.meta.url),"utf8");
const found=new Map();
function walk(node){if(!node||typeof node!=="object")return;const name=node.type==="VariableDeclarator"?node.id?.name:/^Function/.test(node.type)?node.id?.name:null;if(name&&protection.protectedDeclarations[name]){let block=source.slice(node.start,node.end);if(name==="renderAll")block=block.replace("    if (renderUnreceivedRange()) { syncUrl(); return; }\n","");found.set(name,createHash("sha256").update(block).digest("hex"));}for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==="object")walk(value);}}
walk(parseModule(source));
for(const [name,hash]of Object.entries(protection.protectedDeclarations)) eq(found.get(name),hash,"V56 protected declaration "+name);

const first=[r("2026-10-10",300000),r("2026-10-25",150000),r("2026-09-10",300000)];
const m=model(first);deepEq([m.points[14].current,m.points[14].previous,m.points[14].difference,m.points[14].percent],[300000,300000,0,0],"observed graph excludes future expense");
deepEq(json(pure.insightPaceComparison(options(first))),json(m),"pure module and actual serialized model are identical");
eq(m.points[15].current,null,"future point is null, not zero");eq(m.points[30].previousDate,null,"September 31 is not synthesized");
for(const [status,extra]of [["before",{start:"2026-11-01",end:"2026-11-30"}],["complete",{start:"2026-10-01",end:"2026-10-31"}],["complete",{start:"2026-09-01",end:"2026-09-30"}],["unreceived",{start:"2026-10-01",end:"2026-11-01",today:"2026-12-01"}],["unreceived",{start:"2025-10-31",end:"2025-11-02"}]]){
 const observed=insightObservedWindow({start:"2026-10-01",end:"2026-10-31",today:"2026-10-15",...bounds,...extra});eq(observed.status,status,"observed window bounds "+JSON.stringify(extra));
}
deepEq(insightObservedWindow({start:"2026-10-01",end:"2026-10-31",today:"2026-10-15",...bounds}),{start:"2026-10-01",end:"2026-10-15",span:15,status:"complete"},"observation has explicit dates and denominator");
for(const status of ["unknown","response-cap","limit","inconsistent"]){const point=model(first,{receipt:{status}}).points[14];deepEq([point.current,point.previous,point.difference,point.percent],[null,null,null,null],status+" is never a numeric zero");eq(point.status,status,status+" reaches comparison model");}
eq(model(first,{truncated:true}).points[14].status,"limit","truncated takes precedence over a claimed complete receipt");
eq(insightPeriodCoverage({...bounds,start:"2026-10-01",end:"2026-11-01"}),"unreceived","coverage validates upper bound");
for(const [month,days,previousMonth,previousDays]of [["2024-02",29,"2024-01",31],["2025-02",28,"2025-01",31],["2024-03",31,"2024-02",29],["2025-03",31,"2025-02",28],["2026-04",30,"2026-03",31],["2026-01",31,"2025-12",31]]){
 const monthRows=Array.from({length:days},(_,i)=>r(month+"-"+String(i+1).padStart(2,"0"),100));
 const previousRows=Array.from({length:previousDays},(_,i)=>r(previousMonth+"-"+String(i+1).padStart(2,"0"),200));
 const result=model([...monthRows,...previousRows],{month,today:"2026-12-31",dataStart:"2023-01-01",dataEnd:"2026-12-31"});
 eq(result.points.length,days,"only real dates in "+month);eq(result.previousMonth,previousMonth,"previous month "+month);
 for(const point of result.points){eq(point.current,point.day*100,month+" actual current "+point.day);eq(point.previous,point.day<=previousDays?point.day*200:null,month+" matching calendar day "+point.day);}
}
const empty=model();deepEq([empty.points[14].current,empty.points[14].previous,empty.points[14].difference,empty.points[14].percent],[0,0,0,null],"real empty complete months are zero, zero percent is not fabricated");
deepEq([model([r("2026-10-10",700)]).points[14].difference,model([r("2026-10-10",700)]).points[14].percent],[700,null],"0 to positive exposes difference without infinite rate");
eq(model([r("2026-09-10",700)]).points[14].difference,-700,"positive to zero shows a decrease");
eq(model([r("2026-10-10",700),r("2026-10-10",900,{income:true})]).points[14].current,700,"ordinary income never subtracts expenses");
eq(model(first,{dataStart:"2026-10-01"}).points[14].previousStatus,"unreceived","prior month outside lower bound is unavailable");
eq(model(first,{dataEnd:"2026-10-10"}).points[14].currentStatus,"unreceived","current month outside upper bound is unavailable");
deepEq([model([r("2026-10-25",150000)]).points[14].current,model(first,{today:"2026-09-30"}).points[0].current],[0,null],"future-only current month differs from a future month");
for(const [today,day]of [["2026-10-15",15],["2026-10-16",16],["2026-12-31",31]])eq(model([],{today}).observedDay,day,"observation end "+today);
const categoryRows=[r("2026-10-01",100),r("2026-09-01",70),r("2026-10-01",9999,{cat:"쇼핑"}),r("2026-09-01",9999,{cat:"구형 분류"}),r("2026-10-01",35,{cat:"상위"}),r("2026-09-01",25,{cat:"상위"})];
const categoryBudget={total:1000,basis:"category",cats:[["식비",0],["상위",0]]};
deepEq([model(categoryRows,{budget:categoryBudget}).points[14].current,model(categoryRows,{budget:categoryBudget}).points[14].previous],[135,95],"both months use selected current budget categories, including legacy policy");

// Full, unmodified serialized client; no observation-only return injection.
for(const [rows,today,monthly,average,comparison]of [[first,"2026-10-15","450,000원","20,000원","대비 0%"],[[r("2026-10-02",20000),r("2026-10-25",180000),r("2026-09-02",30000)],"2026-10-03","200,000원","6,667원","대비 -33%"]]){
 const browser=insightBrowser(script,data(rows,{today})), text=browser.get("kpis").textContent;
 ok(text.includes(monthly),"full DOM monthly total retained "+monthly);ok(text.includes(average),"full DOM observed average "+average);ok(text.includes(comparison),"full DOM fair comparison "+comparison);
 ok(!browser.get("insights").textContent.includes("50% 증가")&&!browser.get("insights").textContent.includes("567% 증가"),"full DOM insights exclude future delta");
 eq(browser.get("txCount").textContent,"2건","full DOM list retains future row");
 browser.get("csvBtn").click();ok(browser.blobs[0].text.includes("2026-10-25"),"CSV retains future expense");
 const point=browser.get("paceReadout").textContent;ok(point.includes("같은 금액")||point.includes("지출 감소"),"date readout uses observed model");
 const slider=browser.get("paceDate");slider.focus();slider.fire("keydown",{key:"Home"});eq(slider.value,"1","Home selects first real day");slider.fire("keydown",{key:"ArrowRight"});eq(slider.value,"2","ArrowRight selects next real day");slider.fire("keydown",{key:"End"});eq(slider.value,"31","End selects last real day");ok(browser.get("paceReadout").textContent.includes("관측 전"),"future selection has reason");
 browser.events.get("resize")();browser.flush();eq(browser.get("paceDate").value,"31","resize retains selected date");eq(browser.document.activeElement,browser.get("paceDate"),"resize restores range focus");
 for(const id of ["paceTableSummary","paceTableScroll"]){browser.get("paceTable").open=true;browser.get("paceTableScroll").scrollLeft=315;browser.get(id).focus();browser.events.get("resize")();browser.flush();eq(browser.document.activeElement,browser.get(id),"resize restores "+id+" focus");eq(browser.get("paceTableScroll").scrollLeft,315,"resize restores table horizontal position");}
}
for(const [status,extra]of [["unknown",{receipt:{status:"unknown"}}],["response-cap",{receipt:{status:"response-cap"}}],["limit",{truncated:true}],["before",{month:"2026-11"}]]){
 const browser=insightBrowser(script,data(first,extra));ok(browser.get("kpis").textContent.includes("확인 보류"),status+" average withheld in full DOM");ok(!browser.get("insights").textContent.includes("무지출"),status+" never fabricates no-spend achievement");
}
const pastBounds=insightBrowser(script,data(first,{month:"2026-08"}),"?p=d7");ok(pastBounds.get("kpis").textContent.includes("조회 범위 밖"),"past base month recent7 upper bound is not a real zero average");
ok(!pastBounds.get("kpis").textContent.includes("0원")&&!pastBounds.get("kpis").textContent.includes("0건"),"unreceived period never presents genuine zero totals/counts");ok(pastBounds.get("txList").textContent.includes("수신하지 못했습니다")&&pastBounds.get("trendChart").textContent.includes("수신하지 못했습니다"),"unreceived charts/list are not successful empty results");eq(pastBounds.get("csvBtn").disabled,true,"unreceived period does not export an apparently complete empty CSV");
pastBounds.events.get("resize")();pastBounds.flush();ok(pastBounds.get("trendChart").textContent.includes("수신하지 못했습니다"),"resize retains unreceived graph state");
const futureOnly=insightBrowser(script,data([r("2026-10-25",180000)]));ok(futureOnly.get("kpis").textContent.includes("180,000원"),"future-only monthly expense retained");eq(futureOnly.get("kpis").children[3].children[1].textContent,"0원","future-only observed average is genuinely zero");
const completedEmpty=insightBrowser(script,data([]));eq(completedEmpty.get("kpis").children[3].children[1].textContent,"0원","completed empty read is genuinely zero");
for(const search of ["?t=all","?c="+encodeURIComponent("식비"),"?pm="+encodeURIComponent("현금"),"?w="+encodeURIComponent("사용자"),"?min=200000&max=310000","?q="+encodeURIComponent("점심")]){
 const filteredRows=[...first,r("2026-10-12",90000,{cat:"쇼핑",pay:"카드",who:"다른 사람",memo:"여행"}),r("2026-09-12",30000,{cat:"쇼핑",pay:"카드",who:"다른 사람",memo:"여행"})];
 const browser=insightBrowser(script,data(filteredRows),search);
 ok(browser.get("kpis").textContent.includes(search==="?t=all"?"대비 +18%":"대비 0%"),"same dimPass on both observed periods "+search);
 const comparison=browser.get("kpis").children[0].textContent;ok(comparison.includes(search==="?t=all"?"2026-10-15 390,000원 / 2026-09-01 ~ 2026-09-15 330,000원":"2026-10-15 300,000원 / 2026-09-01 ~ 2026-09-15 300,000원"),"exact filtered comparison numerator and denominator "+search);
 ok(browser.get("paceReadout").textContent.includes("390,000원"),"cumulative chart remains unfiltered "+search);
 browser.flush();ok(browser.urls.at(-1).includes(search.slice(1).split("=")[0]),"URL keeps filter meaning "+search);
}
const income=insightBrowser(script,data(first),"?t=income");eq(income.get("budgetCard").hidden,true,"income mode keeps pace card hidden");
eq(insightBrowser(script,data(first,{budget:{total:0,cats:[]}})).get("budgetCard").hidden,true,"no budget keeps existing card condition");
eq(insightBrowser(script,data(first),"?p=prevMonth").get("budgetCard").hidden,true,"previous-month period chip does not become month navigator");
const categoryDom=insightBrowser(script,data(categoryRows,{budget:categoryBudget}));ok(categoryDom.get("budgetBox").textContent.includes("식비, 상위"),"category scope visible beside chart and table");ok(categoryDom.get("paceReadout").textContent.includes("135원")&&categoryDom.get("paceReadout").textContent.includes("95원"),"category chart matches pure model");
const march=insightBrowser(script,data([r("2025-03-31",31000),r("2025-02-28",28000)],{month:"2025-03",start:"2024-04-01"}));
ok(march.get("kpis").textContent.includes("2025-02-28 28,000원")&&march.get("kpis").textContent.includes("31일"),"KPI retains previous-month-end clamp and current31-day denominator");
ok(march.get("paceReadout").textContent.includes("비교할 날짜 없음"),"graph same-date absence stays distinct from KPI clamp");
const previousHuge=insightBrowser(script,data([r("2026-10-01",50),r("2026-09-01",9000000)]));ok(Number(previousHuge.get("budgetBox").querySelector("svg").getAttribute("data-pace-y-max"))>9000000,"axis contains actually displayed previous line");

// Same stopping policy as the old GETs. Exact count may save the terminal empty
// page; it must never expand pages to accommodate an upstream cap.
const env={SUPABASE_URL:"https://mock.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"synthetic-key"};
async function pagination({n=1500,cap=1000,change,analysis=true}={}){
 const old=globalThis.fetch, requests=[];
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input),offset=Number(url.searchParams.get("offset")||0),limit=Number(url.searchParams.get("limit"));
  const request={method:init.method||"GET",offset,limit,prefer:new Headers(init.headers).get("prefer")};requests.push(request);
  const length=Math.min(limit,cap,Math.max(0,n-offset)),rows=Array.from({length},(_,i)=>({id:"row-"+(offset+i)}));
  const headers={"content-type":"application/json","content-range":length?`${offset}-${offset+length-1}/${n}`:`*/${n}`,"range-unit":"items","preference-applied":"count=exact"};
  const altered=change?.({rows,headers,offset,requests})||{};
  return new Response(altered.body??JSON.stringify(rows),{status:altered.status||200,headers});
 };
 try{return {value:await fetchPostgrestRows(env,"/rest/v1/transactions?household_id=eq.synthetic",{limit:9001,analysisReceipt:analysis}),requests};}finally{globalThis.fetch=old;}
}
for(const [n,before,after,status]of [[0,1,1,"complete"],[1500,2,2,"complete"],[8999,9,9,"complete"],[9000,10,9,"complete"],[9001,10,10,"complete"],[9500,10,10,"limit"]]){
 const legacy=await pagination({n,analysis:false}),current=await pagination({n});
 eq(legacy.requests.length,before,"baseline GET count "+n);eq(current.requests.length,after,"C GET count "+n);eq(current.value.receipt.status,status,"exact metadata state "+n);eq(current.value.rows.length,Math.min(n,9001),"returned row limit "+n);ok(current.requests.every(req=>req.method==="GET"&&req.prefer==="count=exact"),"same GET only, never HEAD/count endpoint "+n);report.pagination.push({n,before,after,receipt:current.value.receipt});
}
const capped=await pagination({n:1500,cap:100});deepEq([capped.requests.length,capped.value.rows.length,capped.value.receipt.status],[1,100,"response-cap"],"synthetic upstream100 cap never creates 15 requests");
for(const [name,change,expected]of [
 ["missing",({headers})=>{delete headers["content-range"];},"unknown"],
 ["unknown total",({headers})=>{headers["content-range"]="0-999/*";},"unknown"],
 ["malformed",({headers})=>{headers["content-range"]="nonsense";},"unknown"],
 ["wrong range",({headers})=>{headers["content-range"]="1-1000/1500";},"inconsistent"],
 ["missing row",({rows})=>{rows.pop();},"inconsistent"],
 ["wrong unit",({headers})=>{headers["range-unit"]="bytes";},"inconsistent"],
 ["planned",({headers})=>{headers["preference-applied"]="count=planned";},"inconsistent"],
 ["changed total",({headers,offset})=>{if(offset)headers["content-range"]="1000-1499/1501";},"inconsistent"],
 ["duplicate",({rows,offset})=>{if(offset)rows[0].id="row-0";},"inconsistent"],
 ["missing id",({rows})=>{rows[0].id="";},"inconsistent"],
 ["contradictory empty",()=>({body:"[]"}),"inconsistent"],
 ]) {const result=await pagination({change});eq(result.value.receipt.status,expected,"metadata "+name);ok(result.requests.length<=2,"metadata "+name+" adds no request");}
for(const [name,change]of [["second page failure",({offset})=>offset?{status:503,body:"failed"}:{}],["non-array JSON",()=>({body:"{}"})],["invalid JSON",()=>({body:"not json"})],["empty body",()=>({body:""})]]){await assert.rejects(()=>pagination({change}));ok(true,name+" propagates rather than becoming successful empty data");}
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('[]',{headers:{"content-range":"*/0"}});try{deepEq(await supabase(env,"/rest/v1/transactions"),[],"ordinary JSON caller contract retained");const result=await supabase(env,"/rest/v1/transactions",{analysisGetResponse:true});eq(result.meta.contentRange,"*/0","explicit GET metadata retained");}finally{globalThis.fetch=oldFetch;}

await withClock("2026-10-15",async()=>{
 await fixture(async fx=>{
  fx.db.transactions=first.map((row,i)=>({id:"route-"+i,household_id:"house-home",user_id:"user-bin",transaction_date:row.date,type:"expense",amount:row.amount,category:row.cat,memo:row.memo,payment_method:row.pay}));
  fx.db.accountbook_budgets=[{id:"route-budget",household_id:"house-home",month:"2026-10",category:"__total",amount:1000000}];
  const requests=[];intercept(({url,method,init})=>{requests.push({path:url.pathname,search:url.search,method,prefer:new Headers(init.headers||{}).get("prefer")});});
  const response=await app.fetch(new Request("https://malhaebook.com/my/analysis?month=2026-10&household_id=house-home",{headers:{cookie:fx.cookie}}),fx.env,{});
  const result={status:response.status,html:await response.text()};eq(result.status,200,"actual summary route");ok(response.headers.get("cache-control").includes("no-store"),"personal analysis HTML remains no-store");
  const payload=JSON.parse(result.html.match(/window\.__INSIGHT__=([\s\S]*?);<\/script>/)[1]);eq(payload.receipt.status,"complete","same GET metadata reaches actual payload");const browser=insightBrowser(script,payload);ok(browser.get("kpis").textContent.includes("450,000원")&&browser.get("kpis").textContent.includes("20,000원"),"route payload and full bundle agree");
  ok(!requests.some(req=>req.method==="HEAD"),"actual summary adds no HEAD");eq(requests.filter(req=>req.path.endsWith("/transactions")).length,1,"actual fixture has only one existing transaction GET");report.routes.push({requests,receipt:payload.receipt});
 });
 for(const [n,cap,omit,expected,gets]of [[0,Infinity,false,"complete",1],[8999,Infinity,false,"complete",9],[9000,Infinity,false,"complete",9],[9001,Infinity,false,"limit",10],[1500,100,false,"response-cap",1],[0,Infinity,true,"unknown",1]])await fixture(async fx=>{
  fx.db.transactions=Array.from({length:n},(_,i)=>({id:"bound-"+i,household_id:"house-home",user_id:"user-bin",transaction_date:"2026-10-01",type:"expense",amount:1}));
  fx.db.__transaction_max_rows=cap;fx.db.__omit_count_header=omit;const requests=[];intercept(({url,method})=>{requests.push({path:url.pathname,method});});
  const result=await page(fx,"/my/analysis?month=2026-10&household_id=house-home");const payload=JSON.parse(result.html.match(/window\.__INSIGHT__=([\s\S]*?);<\/script>/)[1]);
  eq(payload.receipt.status,expected,"actual HTTP receipt "+n+"/"+cap+"/"+omit);eq(requests.filter(req=>req.path.endsWith("/transactions")).length,gets,"actual transaction GET pages "+n+"/"+cap+"/"+omit);
  eq(result.html.includes("data-insight-incomplete"),expected!=="complete","whole HTML completeness notice "+n+"/"+cap+"/"+omit);
  if(expected!=="complete")ok(!result.html.includes('id="reportChallenge"')&&!result.html.includes('data-ab-celebrate='),"partial HTML never declares challenge or zero-spend achievement");
 });
 await fixture(async fx=>{
  fx.db.transactions=[{id:"own",household_id:"house-home",user_id:"user-bin",transaction_date:"2026-10-01",type:"expense",amount:1},{id:"other-private",household_id:"other-household",user_id:"other-user",transaction_date:"2026-10-01",type:"expense",amount:999999,memo:"other-household-private"}];
  const result=await page(fx,"/my/analysis?month=2026-10&household_id=house-home");ok(!result.html.includes("other-household-private"),"metadata read never widens household scope");
 });
 for(const [instant,day]of [["2026-10-15T14:59:59.999Z",15],["2026-10-15T15:00:00.000Z",16],["2026-12-31T15:00:00.000Z",1]]){
  const before=globalThis.__AB_QA_FIXED_NOW_MS;globalThis.__AB_QA_FIXED_NOW_MS=Date.parse(instant);
  try{await fixture(async fx=>{const month=instant.startsWith("2026-12")?"2027-01":"2026-10";const result=await page(fx,"/my/analysis?month="+month+"&household_id=house-home");const payload=JSON.parse(result.html.match(/window\.__INSIGHT__=([\s\S]*?);<\/script>/)[1]);eq(Number(payload.today.slice(8)),day,"KST HTTP payload boundary "+instant);});}finally{globalThis.__AB_QA_FIXED_NOW_MS=before;}
 }
 for(const mode of ["get failure","partial page failure","non-array","malformed"]){await fixture(async fx=>{
  if(mode==="partial page failure")fx.db.transactions=Array.from({length:1500},(_,i)=>({id:"fail-"+i,household_id:"house-home",user_id:"user-bin",transaction_date:"2026-10-01",type:"expense",amount:1}));
  intercept(({url,method})=>{if(method!=="GET"||!url.pathname.endsWith("/transactions"))return;return mode==="partial page failure"&&!Number(url.searchParams.get("offset"))?undefined:mode.includes("failure")?failure(503,"synthetic read failure"):new Response(mode==="non-array"?"{}":"invalid-json");});
  const result=await page(fx,"/my/analysis?month=2026-10&household_id=house-home");ok(!result.html.includes("window.__INSIGHT__="),mode+" preserves safeHtmlRoute instead of partial successful comparison");
 });}
});
const outIndex=process.argv.indexOf("--out");if(outIndex>=0){const directory=resolve(process.argv[outIndex+1]);mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,"regression.json"),JSON.stringify(report,null,2)+"\n");}
done();
