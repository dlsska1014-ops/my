import assert from "node:assert/strict";
import app,{parseFlexibleImportRecords,runRecurringAutoApply,runAutomaticReports,supabase,parseDirectBudgetSetCommand,budgetStageInfo} from "../src/index.js";
import {createV2265QaFixture} from "./qa-fixture.mjs";
let checks=0;const eq=(a,b,s)=>{assert.equal(a,b,s);checks++;};const ok=(a,s)=>{assert.ok(a,s);checks++;};
const BASE="https://malhaebook.com";
const parse=text=>parseFlexibleImportRecords(text,"house-home","user-bin",{importYear:2025});
for(const [text,amount] of [["날짜,외화금액(USD),원화금액(원),내용\n2025-07-04,12.50,18000,coffee",18000],["편의점 3,500",3500],["날짜,금액,내용\n07/04,3500,coffee",3500]]) {
 const result=parse(text);eq(result.rows.length,1,"supported monetary row");eq(result.rows[0].amount,amount,"correct local amount");if(text.startsWith("날짜,금액"))eq(result.rows[0].transaction_date,"2025-07-04","selected import year is preserved");
}
eq(parse("날짜,외화금액(USD),내용\n2025-07-04,12.50,coffee").rows.length,0,"foreign-only amount is rejected rather than rounded into KRW");
eq(parse("date,amount,memo\n2025-07-04,$12.50,coffee").rows.length,0,"explicit foreign currency cell is never silently rounded into KRW");
eq(parse("날짜,외화출금액(USD),원화금액(원),내용\n2026-07-04,12.50,18000,coffee").rows[0].amount,18000,"excluded foreign expense fallback cannot override native KRW amount");
eq(parse("date,amount,currency,memo\n2026-07-04,12.50,USD,coffee").rows.length,0,"explicit USD currency column produces no financial candidate");
eq(parse("date,amount,currency,memo\n2026-07-04,18000,KRW,coffee").rows[0].amount,18000,"explicit KRW currency column remains supported");
const cancellation=parse("날짜,금액,내용\n2025-07-04,3500,승인취소");eq(cancellation.rows[0]._import_needs_confirmation,true,"positive cancellation requires explicit selection");
for(const text of ["식비 예산 80만원 설정","예산 식비 70만원","식비 30만원 예산"])eq(parseDirectBudgetSetCommand(text).category,"식비","budget order: "+text);
eq(budgetStageInfo(99600,100000).stage,"warn","rounded 100 percent is not an overspend");eq(budgetStageInfo(100001,100000).stage,"over","actual overspend remains visible");
const post=(f,path,fields)=>app.fetch(new Request(BASE+path,{method:"POST",headers:{cookie:f.cookie,origin:BASE,"sec-fetch-site":"same-origin","content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(fields)}),f.env,{waitUntil(){}});
{
 const f=await createV2265QaFixture();const old=globalThis.fetch;let calls=0;f.db.__import_rpc_available=true;
 const USER="11111111-1111-4111-8111-111111111111";
 for(const [name,rows] of Object.entries(f.db)) if(Array.isArray(rows)) f.db[name]=JSON.parse(JSON.stringify(rows).replaceAll("user-bin",USER));
 f.cookie=await f.cookieFor(USER);
 globalThis.fetch=async(input,init)=>{if(String(input).includes("mock.supabase")){calls++;if(calls>50)throw Error("synthetic50");}return old(input,init);};
 try{
  const data="날짜,구분,금액,분류,내용\n"+Array.from({length:120},(_,i)=>`2026-07-04,지출,${1000+i},QA,synthetic import ${i}`).join("\n");
  const before=f.db.transactions.length;
  const preview=await post(f,"/my/import",{household_id:"house-home",month:"2026-07",csv_text:data,skip_duplicates:"1"});const html=await preview.text();
  const token=html.match(/name="import_token" value="([^"]+)"/)?.[1];ok(token,"120-row preview is signed");ok(calls<=50,"preview duplicate checks fit50 subrequests");
  const previewData=JSON.parse(Buffer.from(token.split(".")[0],"base64url").toString("utf8"));
  eq(previewData.ready.length,120,"signed preview contains all120 accepted rows");
  calls=0;const fields=new URLSearchParams({import_action:"commit",import_token:token});for(let i=2;i<=121;i++)fields.append("selected_rows",String(i));
  const response=await post(f,"/my/import",fields);const resultHtml=await response.text();eq(response.status,200,"120-row atomic import produces result page");eq(f.db.transactions.length-before,120,"all120 rows committed atomically: "+resultHtml.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(-1700));ok(calls<=50,"commit duplicate and idempotency checks fit50");
  const rule=f.db.accountbook_recurring.find(row=>row.household_id==="house-home");rule.last_applied_month="2026-07";const id=rule.id;calls=0;
  const edit=await post(f,"/admin/recurring/save",{id,household_id:"house-home",month:"2026-07",memo:"edited item",amount:"55000",day_of_month:"31",user_id:USER});eq(edit.status,303,"recurring item edit succeeds");eq(f.db.accountbook_recurring.find(row=>row.id===id).last_applied_month,"2026-07","edit preserves prior applied-month marker");eq(f.db.accountbook_recurring.find(row=>row.id===id).amount,55000,"edit updates in place");
  for(const [csv,amount]of [["날짜,외화출금액(USD),원화금액(원),내용\n2026-07-04,12.50,18000,coffee",18000],["date,amount,currency,memo\n2026-07-04,12.50,USD,coffee",0]]) {
    calls=0;const preview=await post(f,"/my/import",{household_id:"house-home",month:"2026-07",csv_text:csv});const html=await preview.text();const token=html.match(/name="import_token" value="([^"]+)"/)?.[1];ok(token,"currency preview is signed even when rejected");const data=JSON.parse(Buffer.from(token.split(".")[0],"base64url").toString("utf8"));eq(data.ready.length,amount?1:0,"currency preview has only authorized native candidates");if(amount)eq(data.ready[0].row.amount,amount,"currency preview has correct KRW amount");
    const count=f.db.transactions.length;calls=0;await post(f,"/my/import",{import_action:"commit",import_token:token,selected_rows:"2"});eq(f.db.transactions.length-count,amount?1:0,"forged selection cannot commit a rejected USD candidate");
  }
 }finally{f.restore();}
}
{
 const f=await createV2265QaFixture();const old=globalThis.fetch;let calls=0;f.db.__max_rows=1000;
 globalThis.fetch=async(input,init)=>{if(String(input).includes("mock.supabase")){calls++;if(calls>50)throw Error("synthetic50");}return old(input,init);};
 try{
  f.db.households=[];f.db.household_members=[];f.db.accountbook_recurring=[];f.db.transactions=[];
  for(let i=0;i<1001;i++){const id="synthetic-"+String(i).padStart(4,"0");f.db.households.push({id,name:id});if(i<30){f.db.household_members.push({household_id:id,user_id:"user-bin",role:i===29?"blocked":"member"});f.db.accountbook_recurring.push({id:"rule-"+i,household_id:id,user_id:"user-bin",memo:id,amount:1000,day_of_month:31,is_active:true,type:"expense"});}}
  let result;let ticks=0;
  do {calls=0;result=await runRecurringAutoApply(f.env,{today:"2026-07-31",month:"2026-07"});ok(calls<=50,"recurring tick keeps invocation budget");if(result.partial)eq(result.ok,false,"unfinished households are explicitly partial");ticks++;}while(result.partial&&ticks<250);
  ok(ticks<250&&!result.partial,"cursor scans past1000 households without silent truncation");eq(f.db.transactions.length,29,"active members apply; blocked spender is held");ok(f.db.transactions.every(row=>row.transaction_date==="2026-07-31"),"cursor does not change scheduled transaction date");
  calls=0;const before=f.db.transactions.length;await runRecurringAutoApply(f.env,{today:"2026-07-31",month:"2026-07"});eq(f.db.transactions.length,before,"next cycle does not duplicate already applied month");
  calls=0;const shared={...f.env,__AB_DB_BUDGET:{used:0,limit:50}};await runRecurringAutoApply(shared,{today:"2026-08-01",month:"2026-08"});await runAutomaticReports(shared,{today:"2026-08-01"});ok(calls<=50,"recurring and reports share one invocation budget");
  f.db.households=f.db.households.slice(0,30);f.db.transactions=[];for(const rule of f.db.accountbook_recurring)delete rule.last_applied_month;
  f.db.accountbook_settings=f.db.accountbook_settings.filter(row=>row.key!=="cron_recurring_cursor_v22930");
  calls=0;const july=await runRecurringAutoApply(f.env,{today:"2026-07-31"});ok(july.partial,"month-end run retains unfinished cursor");
  let continuation;let remainingTicks=0;
  do{calls=0;continuation=await runRecurringAutoApply(f.env,{today:"2026-08-01"});ok(calls<=50,"cross-month continuation respects shared request budget");remainingTicks++;}while(continuation.partial&&remainingTicks<20);
  eq(continuation.month,"2026-07","August invocation finishes unfinished July first");eq(f.db.transactions.length,29,"month continuation preserves blocked-spender hold and single application");ok(f.db.transactions.every(row=>row.transaction_date==="2026-07-31"),"August catch-up preserves July31 transaction date");
 }finally{f.restore();}
}
{
 const f=await createV2265QaFixture();const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{if(String(input).includes("mock.supabase")){calls++;if(calls>50)throw Error("synthetic50");}return original(input,init);};
 try {
  const USER="11111111-1111-4111-8111-111111111111";
  f.db.users[0].id=USER;f.db.households=[{id:"first-house",name:"first-house"}];f.db.household_members=[{household_id:"first-house",user_id:USER,role:"owner"}];f.db.transactions=[];
  f.db.accountbook_recurring=Array.from({length:20},(_,i)=>({id:"twenty-"+String(i).padStart(2,"0"),household_id:"first-house",user_id:USER,memo:"item "+i,amount:1000+i,day_of_month:31,is_active:true,type:"expense"}));
  const first=await runRecurringAutoApply(f.env,{today:"2026-07-31"});ok(first.partial,"first household remains pending on per-invocation cutoff");eq(first.cursor,"","unfinished first household preserves empty cursor position");ok(calls<=50,"first large household invocation retains budget");
  let result,ticks=0;do{calls=0;result=await runRecurringAutoApply(f.env,{today:"2026-08-01"});ok(calls<=50,"large-household cross-month continuation retains budget");eq(result.month,"2026-07","pending empty-position scope remains July");ticks++;}while(result.partial&&ticks<10);
  ok(!result.partial&&ticks<10,"all20 first-household rules eventually complete");eq(f.db.transactions.length,20,"July rules all save exactly once");eq(new Set(f.db.transactions.map(row=>row.raw_text)).size,20,"every item/month key is distinct");ok(f.db.transactions.every(row=>row.transaction_date==="2026-07-31"),"large household continuation does not move July dates into August");
  const count=f.db.transactions.length;calls=0;await runRecurringAutoApply(f.env,{today:"2026-08-01"});eq(f.db.transactions.length,count,"August cycle does not duplicate completed July entries");
  f.db.accountbook_settings=f.db.accountbook_settings.filter(row=>!row.key.startsWith("free_report_"));
  for(let i=0;i<3;i++){const hid="report-"+i;f.db.households.push({id:hid,name:hid});f.db.accountbook_settings.push({key:"free_report_preference:"+hid,value:JSON.stringify({enabled:true,household_id:hid,monthly:true,weekly:false})});}
  calls=0;const initial=await runAutomaticReports(f.env,{today:"2026-07-31"});ok(initial.partial,"three monthly report preferences leave a pending execution scope");
  calls=0;const finished=await runAutomaticReports(f.env,{today:"2026-08-01"});eq(finished.today,"2026-07-31","resumed report labels its actual execution scope");eq(finished.invocation_date,"2026-08-01","invocation date is recorded separately");ok(finished.ok&&!finished.partial,"pending third report completes on next day");ok(calls<=50,"report resume retains invocation budget");
  const snapshots=f.db.accountbook_settings.filter(row=>row.key.startsWith("free_report_snapshot:")&&row.key.endsWith(":2026-07"));eq(snapshots.length,3,"all three July snapshots are persisted");ok(!f.db.accountbook_settings.some(row=>row.key.startsWith("free_report_snapshot:")&&row.key.endsWith(":2026-08")),"old work is never mislabeled as an August snapshot");
  calls=0;await runAutomaticReports(f.env,{today:"2026-08-01"});eq(f.db.accountbook_settings.filter(row=>row.key.startsWith("free_report_snapshot:")&&row.key.endsWith(":2026-07")).length,3,"daily retry does not duplicate July snapshots");
  f.db.transactions=[];for(const rule of f.db.accountbook_recurring)delete rule.last_applied_month;
  f.db.accountbook_settings=f.db.accountbook_settings.filter(row=>row.key!=="cron_recurring_cursor_v22930");
  let lostResult=false;globalThis.fetch=async(input,init={})=>{if(new URL(String(input)).pathname==="/rest/v1/transactions"&&init.method==="POST"&&!lostResult){calls++;lostResult=true;await original(input,init);throw Error("synthetic committed recurring result lost");}if(String(input).includes("mock.supabase")){calls++;if(calls>50)throw Error("synthetic50");}return original(input,init);};
  calls=0;const unknown=await runRecurringAutoApply(f.env,{today:"2026-07-31"});ok(!unknown.ok&&unknown.partial,"unknown recurring write never reports complete or advances scope");
  let resumed,iterations=0;do{calls=0;resumed=await runRecurringAutoApply(f.env,{today:"2026-08-01"});iterations++;}while(resumed.partial&&iterations<10);eq(f.db.transactions.length,20,"confirmed re-read after lost result does not duplicate or drop an item");ok(f.db.transactions.every(row=>row.transaction_date==="2026-07-31"),"unknown result retains target month through continuation");
  f.db.accountbook_settings=f.db.accountbook_settings.filter(row=>!row.key.startsWith("free_report_snapshot:")&&row.key!=="cron_report_cursor_v22930");
  let outage=false;globalThis.fetch=async(input,init={})=>{const url=new URL(String(input));if(!outage&&url.pathname==="/rest/v1/accountbook_settings"&&String(url.searchParams.get("key")).startsWith("gte.free_report_preference:")){outage=true;return new Response('{"message":"synthetic preference outage"}',{status:503});}if(String(input).includes("mock.supabase")){calls++;if(calls>50)throw Error("synthetic50");}return original(input,init);};
  calls=0;await assert.rejects(runAutomaticReports(f.env,{today:"2026-07-31"}),/Supabase 503/);checks++;ok(JSON.parse(f.db.accountbook_settings.find(row=>row.key==="cron_report_cursor_v22930").value).scopes[0].date==="2026-07-31","first preference-read failure preserves pending execution date before any snapshot");
  let recovered,reportTicks=0;do{calls=0;recovered=await runAutomaticReports(f.env,{today:"2026-08-01"});ok(calls<=50,"failure recovery retains invocation budget");reportTicks++;}while(recovered.partial&&reportTicks<5);eq(f.db.accountbook_settings.filter(row=>row.key.startsWith("free_report_snapshot:")&&row.key.endsWith(":2026-07")).length,3,"preference failure cannot lose the July report scope");
 } finally {f.restore();}
}
console.log(`PASS: V22.9.30 import and bounded cron (${checks} checks)`);
