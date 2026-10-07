import assert from "node:assert/strict";
import app from "../src/index.js";
import {createV2265QaFixture} from "./qa-fixture.mjs";
let checks=0, sequence=0;
const eq=(a,b,s)=>{assert.equal(a,b,s);checks++;};
const ok=(a,s)=>{assert.ok(a,s);checks++;};
const textOf=body=>body.template?.outputs?.map(o=>o.simpleText?.text||"").join("\n")||"";
for(const variant of [{count:1},{count:3},{count:25},{count:25,mixed:true}]) {
 const count=variant.count;
 const f=await createV2265QaFixture();f.env.KAKAO_SKILL_SECRET="synthetic-audit-secret";
 if(count===25) Object.assign(f.env,{NLU_METRICS_ENABLED:"1",NLU_PERSIST_FAILURE_SAMPLES:"1",NLU_FAILURE_SAMPLE_RATE:"1"});
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{if(String(input).includes("mock.supabase.co")){calls++;if(calls>50)throw new Error("synthetic_subrequest_limit50");}return original(input,init);};
 const key="audit-first-"+(++sequence);
 const utterance=Array.from({length:count},(_,i)=>"커피 "+(4500+i)).join(", ");
 const skill=async(text,auth=true)=>{
   calls=0;
   const jobs=[];
   const r=await app.fetch(new Request("https://malhaebook.com/skill",{method:"POST",headers:{"content-type":"application/json","user-agent":key,...(auth?{"x-kakao-skill-secret":f.env.KAKAO_SKILL_SECRET}:{})},body:JSON.stringify({userRequest:{utterance:text,user:{id:key,type:"botUserKey",properties:variant.mixed?{botUserKey:key,appUserId:"987000000"+sequence}:{}}}})}),f.env,{waitUntil(job){jobs.push(job);}});
   const background=await Promise.allSettled(jobs);
   if(count===25) ok(background.every(job=>job.status==="fulfilled"),"enabled NLU background jobs settle without rejected promises");
   return {text:textOf(await r.json()),calls};
 };
 try {
  const before=f.db.transactions.length;
  const first=await skill(utterance);
  console.log(`startup ${count}${variant.mixed?" bot+app":""}: ${first.calls} total subrequests including collected background`);
  eq(f.db.transactions.length-before,count,`${count}: complete cold first batch`);ok(first.calls<=50,`${count}: cold subrequest50 cap`);
  ok(!first.text.includes("확인이 지연"),`${count}: confirmed first result`);
  const marker=f.db.accountbook_settings.find(r=>r.key.startsWith("kakao_first_record_v22928:"));eq(JSON.parse(marker?.value||"{}").state,"complete",`${count}: completion metadata stored`);
  const repeat=await skill(utterance+" ");eq(f.db.transactions.length-before,count,`${count}: retry does not duplicate`);ok(repeat.calls<=50,`${count}: warm subrequest50 cap`);
  const another=await skill("우유 3000, 우유 3000");eq(f.db.transactions.length-before,count+2,`${count}: legitimate identical same-message entries`);ok(another.calls<=50,`${count}: repeated rows within budget`);
 } finally {f.restore();}
}
{
 const f=await createV2265QaFixture();f.env.KAKAO_SKILL_AUTH_MODE="off";
 try {
  const before=f.db.users.length;
  const r=await app.fetch(new Request("https://malhaebook.com/skill",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userRequest:{utterance:"커피 4500",user:{id:"untrusted-audit",type:"botUserKey",properties:{}}}})}),f.env,{waitUntil(){}});
  eq(f.db.users.length,before,"untrusted off/observe cannot provision identity");eq(r.status,200,"untrusted identity receives safe guidance");
 }finally{f.restore();}
}
console.log(`PASS: V22.9.30 startup subrequest budget (${checks} checks)`);
