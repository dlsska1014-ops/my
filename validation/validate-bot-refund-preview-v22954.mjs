import assert from "node:assert/strict";
import { counter, fixture, intercept, failure, page, post, putSetting } from "./lib-audit-v22934.mjs";
import { buildSettlementModel } from "../src/modules/features/settlement-ops-pages.js";
import { buildSettlementRefundPreview, settlementRefundPreviewDigest } from "../src/modules/features/settlement-refund-preview.js";
const {ok,eq,deepEq,done}=counter("BOT refund preview V22.9.54");
globalThis.fetch=async()=>{throw new Error("External fetch forbidden");};
const members=[{user_id:"A",nickname:"A",role:"owner"},{user_id:"B",nickname:"B",role:"member"}];
const expense={id:"expense",household_id:"house",user_id:"A",type:"expense",category:"외식",amount:100000,transaction_date:"2026-10-01"};
const refund={id:"refund",household_id:"house",user_id:"A",type:"income",category:"환급",amount:40000,transaction_date:"2026-10-02"};
const link={expense_id:"expense",refund_id:"refund",recipient_user_id:"A",amount:40000};
const options={householdId:"house",month:"2026-10",mode:"equal",refundLinks:[link]};
const base=buildSettlementModel([expense,refund],members);
eq(base.transfers[0].amount,50000,"unlinked refund excluded");
eq(buildSettlementModel([expense,{...refund,category:"급여"}],members).transfers[0].amount,50000,"wages excluded");
for(const receiver of ["A","B"]) {
  const model=buildSettlementRefundPreview([expense,{...refund,user_id:receiver}],members,{...options,refundLinks:[{...link,recipient_user_id:receiver}]});
  deepEq(model.transfers,[{from:"B",to:"A",amount:receiver==="A"?30000:70000}],"explicit receiver "+receiver);
  eq(model.totalExpense,60000,"net total");eq(model.previewOnly,true,"preview-only result");
}
for(const amount of [1,3333,40000,100000]) for(const mode of ["equal","ratio","headcount","item"]) {
  const rows=[expense,{...refund,amount:100000}];
  const input={...options,mode,weights:{A:2,B:1},itemParticipants:{expense:["A","B"]},refundLinks:[{...link,amount}]};
  const model=buildSettlementRefundPreview(rows,members,input);
  eq(model.people.reduce((s,p)=>s+p.paid,0),100000-amount,"cash conserved "+mode+amount);
  eq(model.people.reduce((s,p)=>s+p.share,0),100000-amount,"burden conserved "+mode+amount);
  eq(model.people.reduce((s,p)=>s+p.balance,0),0,"balances conserved "+mode+amount);
  eq(model.transfers.reduce((s,t)=>s+t.amount,0),model.people.filter(p=>p.balance>0).reduce((s,p)=>s+p.balance,0),"transfers conserved "+mode+amount);
}
const item=buildSettlementRefundPreview([expense,refund],members,{...options,mode:"item",itemParticipants:{expense:["B"]}});
deepEq(item.people.map(p=>[p.user_id,p.share]).sort(),[["A",0],["B",60000]],"item participants preserved");
const remainder=buildSettlementRefundPreview([{...expense,amount:11},{...refund,amount:4}],members,{...options,mode:"item",refundLinks:[{...link,amount:4}]});
deepEq(remainder.people.map(p=>p.share).sort(),[3,4],"integer remainder after partial refund");
const multiple=[expense,refund,{...refund,id:"refund2",amount:60000}];
eq(buildSettlementRefundPreview(multiple,members,{...options,refundLinks:[link,{...link,refund_id:"refund2",amount:60000}]}).totalExpense,0,"several refund payments consume original exactly");
for(const [name,rows,people,input] of [
  ["missing original",[refund],members,options],
  ["foreign household",[{...expense,household_id:"foreign"},refund],members,options],
  ["cross month",[expense,{...refund,transaction_date:"2026-09-30"}],members,options],
  ["wrong receiver",[expense,refund],members,{...options,refundLinks:[{...link,recipient_user_id:"B"}]}],
  ["missing receiver",[expense,refund],members,{...options,refundLinks:[{...link,recipient_user_id:""}]}],
  ["salary",[expense,{...refund,category:"급여"}],members,options],
  ["over refund",[expense,refund],members,{...options,refundLinks:[{...link,amount:40001}]}],
  ["over original",[{...expense,amount:30000},refund],members,options],
  ["duplicate link",[expense,refund],members,{...options,refundLinks:[link,link]}],
  ["blocked receiver",[expense,refund],[{...members[0],role:"blocked"},members[1]],options],
  ["fractional amount",[expense,refund],members,{...options,refundLinks:[{...link,amount:1.5}]}],
  ["completed month",[expense,refund],members,{...options,completed:true}],
]) {assert.throws(()=>buildSettlementRefundPreview(rows,people,input));ok(true,"reject "+name);}
const digest=await settlementRefundPreviewDigest([expense,refund],members,options);
for(const changed of [
  [[expense,{...refund,amount:41000}],members,options],
  [[expense,refund],[members[0],{...members[1],role:"viewer"}],options],
  [[expense,refund],members,{...options,refundLinks:[{...link,amount:20000}]}],
]) ok(await settlementRefundPreviewDigest(...changed)!==digest,"preview digest includes records/members/links");

for(const kind of ["A","B","invalid","history","read-failure","viewer"]) await fixture(async fx=>{
  const users=fx.db.household_members.filter(m=>m.household_id==="house-home").map(m=>m.user_id);
  const receiver=kind==="B"?users.find(id=>id!=="user-bin"):"user-bin";
  fx.db.transactions=[{...expense,household_id:"house-home",user_id:"user-bin"},{...refund,household_id:"house-home",user_id:receiver}];
  if(kind==="history")putSetting(fx,"settlement_history:house-home",JSON.stringify([{month:"2026-10",completed_at:new Date().toISOString()}]));
  if(kind==="viewer")fx.db.household_members.find(m=>m.user_id==="user-bin"&&m.household_id==="house-home").role="viewer";
  const writes=[];
  intercept(({url,method})=>{if(["POST","PATCH","DELETE"].includes(method))writes.push({method,path:url.pathname});if(kind==="read-failure"&&method==="GET"&&url.pathname.endsWith("transactions"))return failure(503,"synthetic read failure");});
  const response=await post(fx,"/my/settlement/refund-preview",{household_id:"house-home",month:"2026-10",mode:"equal",expense_id:"expense",refund_id:"refund",recipient_user_id:receiver,amount:kind==="invalid"?"40001":"40000"});
  if(["A","B"].includes(kind)) {eq(response.status,200,"actual preview response "+kind);ok(response.text.includes("data-refund-preview-digest"),"actual server preview calculated");ok(response.text.includes("반영하지 않았습니다"),"preview does not claim official save");ok(!response.text.includes('action="/my/settlement/complete"'),"no completion form in preview");}
  else {ok(response.status!==200 || !response.text.includes("data-refund-preview-digest"),"unsafe preview not accepted "+kind);}
  eq(writes.length,0,"preview has no persistent mutation "+kind);
  eq(fx.db.transactions.length,2,"no recreated refund or negative transaction "+kind);
});
done();
