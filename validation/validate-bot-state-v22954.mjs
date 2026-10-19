import { app, BASE, counter, fixture, intercept, failure, putSetting } from "./lib-audit-v22934.mjs";
import { AB_KAKAO_REPEAT_GUARD, AB_KAKAO_INFLIGHT } from "../src/modules/runtime/ops-telemetry.js";
const {ok,eq,deepEq,done}=counter("BOT confirmation state V22.9.54");
globalThis.fetch=async()=>{throw new Error("External fetch forbidden");};
const textOf=body=>(body.template?.outputs||[]).map(o=>o.simpleText?.text||"").join("\n");
async function say(fx,text,{user="kakao_login:2265",room="",context}={}) {
  const jobs=[];
  const payload={bot:{id:"synthetic-bot"},userRequest:{utterance:text,user:{id:user,type:"botUserKey",properties:{botUserKey:user,...(room?{botGroupKey:room}:{})}},...(room?{chat:{type:"botGroupKey",id:room,properties:{botGroupKey:room}}}:{})}};
  const response=await app.fetch(new Request(BASE+"/skill",{method:"POST",headers:{"content-type":"application/json","x-kakao-skill-secret":fx.env.KAKAO_SKILL_SECRET||""},body:JSON.stringify(payload)}),fx.env,context||{waitUntil:job=>jobs.push(job)});
  const body=await response.json();
  return {response,body,text:textOf(body),jobs};
}
const stateRow=fx=>fx.db.accountbook_settings.find(row=>row.key.includes(":separate:"));
const state=fx=>JSON.parse(stateRow(fx)?.value||"null");
async function setup(task) { await fixture(async fx=>{
  AB_KAKAO_REPEAT_GUARD.clear();AB_KAKAO_INFLIGHT.clear();
  fx.env.KAKAO_SKILL_SECRET="synthetic-bot-state-secret";
  fx.db.transactions=[];
  putSetting(fx,"kakao_selected_household_v2251:user-bin","house-home");
  await task(fx);
}); }
async function prepare(fx,text="별도케이크 7530원 현금",options={}) {
  if(!fx.db.transactions.length) await say(fx,text,options);
  const result=await say(fx,"별도 구매 추가 "+text,options);
  ok(state(fx)?.state==="candidate","candidate persisted: "+result.text);
  eq(fx.db.transactions.length,1,"prepare does not save");
  return {result,token:state(fx).confirmation_id,id:state(fx).row.id};
}

await setup(async fx=>{
  const p=await prepare(fx);
  eq(p.result.body.template.quickReplies[0].messageText,"별도 구매 확인 "+p.token,"direct button carries server token");
  await say(fx,"예");eq(fx.db.transactions.length,1,"plain yes cannot confirm");
  const results=await Promise.all([say(fx,"별도 구매 확인 "+p.token),say(fx,"별도 구매 확인 "+p.token)]);
  eq(fx.db.transactions.length,2,"concurrent confirmations add exactly one");
  eq(fx.db.transactions.filter(r=>r.id===p.id).length,1,"fixed ID used");
  await say(fx,"별도 구매 확인 "+p.token);
  eq(fx.db.transactions.length,2,"same confirmation replay adds none");
  ok(results.some(r=>/저장했어요/.test(r.text)),"confirmed result acknowledged");
});
for(const scenario of ["cancel","expire","changed","original-edit","original-delete","role-viewer","role-blocked","wrong-household","wrong-user","wrong-room","lock-failure","state-failure"]) await setup(async fx=>{
  const p=await prepare(fx);
  const oldNow=Date.now;
  let undo=()=>{};
  try {
    if(scenario==="cancel") await say(fx,"별도 구매 취소 "+p.token);
    if(scenario==="expire") Date.now=()=>state(fx).expires_at;
    if(scenario==="changed") {const changed=state(fx);changed.row.amount++;stateRow(fx).value=JSON.stringify(changed);}
    if(scenario==="original-edit") fx.db.transactions[0].memo="바뀐 원거래";
    if(scenario==="original-delete") fx.db.transactions=[];
    if(scenario.startsWith("role-")) fx.db.household_members.find(m=>m.user_id==="user-bin"&&m.household_id==="house-home").role=scenario.slice(5);
    if(scenario==="wrong-household") {
      fx.db.households.push({id:"house-other",name:"다른 집",invite_code:"OTHER1"});
      fx.db.household_members.push({household_id:"house-other",user_id:"user-bin",role:"owner"});
      putSetting(fx,"kakao_selected_household_v2251:user-bin","house-other");
    }
    if(scenario==="lock-failure") undo=intercept(({url,init})=>url.pathname.endsWith("accountbook_claim_operation")&&JSON.parse(init.body).p_key.startsWith("household-settings-rmw:")?new Response(JSON.stringify([{acquired:false}])):undefined);
    if(scenario==="state-failure") undo=intercept(({url,method,init})=>url.pathname.endsWith("accountbook_settings")&&method==="POST"&&String(init.body).includes("submitting")?failure(400,"synthetic state rejection"):undefined);
    const before=fx.db.transactions.length;
    await say(fx,"별도 구매 확인 "+p.token,{...(scenario==="wrong-user"?{user:"unrelated-synthetic-user"}:{}),...(scenario==="wrong-room"?{room:"unrelated-room"}:{})});
    eq(fx.db.transactions.length,before,"unsafe confirmation writes zero: "+scenario);
    ok(!fx.db.transactions.some(r=>r.id===p.id),"candidate ID not written: "+scenario);
  } finally {Date.now=oldNow;undo();}
});
for(const mode of ["response-lost-committed","response-lost-pending","confirmed-state-failure","definite-failure"]) await setup(async fx=>{
  const p=await prepare(fx);
  let postCount=0,lateWrite;
  const undo=intercept(async({url,method,init,forward})=>{
    if(method==="POST"&&url.pathname.endsWith("transactions")) {
      postCount++;
      if(mode==="response-lost-committed") {await forward();throw new TypeError("synthetic response lost");}
      if(mode==="response-lost-pending") {lateWrite=forward;throw new TypeError("synthetic response lost before observation");}
      if(mode==="definite-failure") return failure(400,"synthetic definite rejection");
    }
    if(mode==="confirmed-state-failure"&&method==="POST"&&url.pathname.endsWith("accountbook_settings")&&String(init.body).includes('\\"confirmed\\"')) return failure(400,"synthetic status failure");
  });
  await say(fx,"별도 구매 확인 "+p.token);
  const stable=state(fx).row.id;
  for(let i=0;i<3;i++) await say(fx,"별도 구매 확인 "+p.token);
  if(mode==="response-lost-pending") {
    eq(postCount,1,"unknown confirmation never issues another POST");
    await say(fx,"별도 구매 추가 별도케이크 7530원 현금");
    eq(state(fx).row.id,stable,"unknown cannot mint new ID");
    eq(fx.db.transactions.length,1,"unknown remains pending without false success");
    await lateWrite();
    await say(fx,"별도 구매 확인 "+p.token);
  }
  undo();
  if(mode!=="definite-failure") {
    eq(fx.db.transactions.length,2,"recovery preserves one separate purchase: "+mode);
    eq(fx.db.transactions.filter(r=>r.id===p.id).length,1,"one fixed record after recovery");
  } else eq(fx.db.transactions.length,1,"definite rejection stores no separate transaction");
  eq(state(fx).row.id,stable,"confirmation ID remains stable after storage failures");
});
await setup(async fx=>{
  const first=await prepare(fx);
  await say(fx,"별도 구매 취소 "+first.token);
  const second=await prepare(fx);
  ok(first.token!==second.token,"new candidate has distinct token");
  await say(fx,"별도 구매 확인 "+first.token);
  eq(fx.db.transactions.length,1,"old button cannot confirm replacement candidate");
  await say(fx,"별도 구매 확인 "+second.token);
  eq(fx.db.transactions.length,2,"new candidate can confirm");
});
await setup(async fx=>{
  putSetting(fx,"kakao_group_links",JSON.stringify({"room-a":{household_id:"house-home",linked_by:"user-bin"},"room-b":{household_id:"house-home",linked_by:"user-bin"}}));
  const p=await prepare(fx,"별도케이크 7530원 현금",{room:"room-a"});
  ok(!p.result.body.template.quickReplies,"group has no quick replies");
  ok(p.result.text.includes("별도 구매 확인 "+p.token),"group has short explicit confirmation command");
  await say(fx,"별도 구매 확인 "+p.token,{room:"room-b"});
  eq(fx.db.transactions.length,1,"other linked room cannot use token");
  await say(fx,"별도 구매 확인 "+p.token,{room:"room-a"});
  eq(fx.db.transactions.length,2,"same linked room confirms");
});
await setup(async fx=>{
  let deferred;
  const undo=intercept(({url,method,forward})=>{if(method==="POST"&&url.pathname.endsWith("transactions")){deferred=forward;return failure(504,"synthetic uncertain write");}});
  await say(fx,"미확정케이크 7530원 현금");undo();
  const pending=fx.db.accountbook_settings.find(r=>r.key.includes(":pending_write:"));
  ok(JSON.parse(pending.value).rows.length===1,"normal write preserves full expected row before POST");
  await say(fx,"별도 구매 추가 미확정케이크 7530원 현금");
  eq(state(fx),null,"unresolved original cannot create candidate");
  await deferred();
  await say(fx,"별도 구매 추가 미확정케이크 7530원 현금");
  ok(state(fx)?.state==="candidate","resolved original permits candidate");
  eq(fx.db.transactions.length,1,"recovery does not duplicate original");
});
// A duplicate-only response must leave recoverable actual IDs if cleanup fails.
await setup(async fx=>{
  await say(fx,"정리경계 7511원 현금");
  const old=Date.now;Date.now=()=>old()+9000;
  const undo=intercept(({url,method})=>method==="DELETE"&&url.pathname.endsWith("accountbook_settings")&&url.searchParams.get("key")?.includes(":pending_write:")?failure(400,"synthetic cleanup failure"):undefined);
  try {
    await say(fx,"정리경계 7511원 현금");
    const pending=JSON.parse(fx.db.accountbook_settings.find(r=>r.key.includes(":pending_write:")).value);
    ok(pending.ids.every(id=>fx.db.transactions.some(r=>r.id===id)),"duplicate cleanup failure retains actual stored IDs");
    await say(fx,"다른기록 8511원 현금");
    eq(fx.db.transactions.length,2,"duplicate cleanup failure does not strand later ordinary record");
  }finally{undo();Date.now=old;}
});
// A delayed cleanup of A must never delete the pending IDs for a later B.
await setup(async fx=>{
  const undoFirst=intercept(({url,method})=>method==="DELETE"&&url.pathname.endsWith("accountbook_settings")?failure(400,"keep confirmed A marker"):undefined);
  await say(fx,"선행기록 7512원 현금");undoFirst();
  let lateClear;
  const undoClear=intercept(({url,method,forward})=>{if(method==="DELETE"&&url.pathname.endsWith("accountbook_settings")&&url.searchParams.get("key")?.includes(":pending_write:")){lateClear=forward;throw new TypeError("synthetic delayed cleanup");}});
  await say(fx,"별도 구매 추가 선행기록 7512원 현금");undoClear();
  ok(typeof lateClear==="function","conditional recovery DELETE was captured");
  let lateB;
  const undoB=intercept(({url,method,forward})=>{if(method==="POST"&&url.pathname.endsWith("transactions")){lateB=forward;throw new TypeError("synthetic pending B");}});
  await say(fx,"후행기록 8512원 현금");undoB();
  const pendingKey=fx.db.accountbook_settings.find(r=>r.key.includes(":pending_write:")).key;
  const before=fx.db.accountbook_settings.find(r=>r.key===pendingKey).value;
  await lateClear();
  eq(fx.db.accountbook_settings.find(r=>r.key===pendingKey)?.value,before,"late A cleanup cannot erase B marker");
  const old=Date.now;Date.now=()=>old()+121000;
  try{await say(fx,"후행기록 8512원 현금");await lateB();}finally{Date.now=old;}
  deepEq(fx.db.transactions.map(r=>r.amount).sort((a,b)=>a-b),[7512,8512],"late cleanup and late B preserve one fixed record");
});
await setup(async fx=>{
  await say(fx,"부분원본 7513원 현금");
  let late;
  const undo=intercept(({url,method,forward})=>{if(method==="POST"&&url.pathname.endsWith("transactions")){late=forward;throw new TypeError("synthetic partial batch");}});
  await say(fx,"부분원본 7513원 현금 / 부분신규 8513원 현금");undo();
  const pending=JSON.parse(fx.db.accountbook_settings.find(r=>r.key.includes(":pending_write:")).value);
  eq(pending.rows.length,2,"partial duplicate mapping includes existing and fresh stable IDs");
  eq(pending.rows.filter(r=>fx.db.transactions.some(saved=>saved.id===r.id)).length,1,"only fresh ID remains unconfirmed");
  await late();await say(fx,"부분원본 7513원 현금 / 부분신규 8513원 현금");
  eq(fx.db.transactions.length,2,"partial duplicate recovery adds no new IDs");
});
await setup(async fx=>{
  const p=await prepare(fx,"2026-10-01 과거별도 7514원 현금");
  fx.env.KAKAO_RESPONSE_BUDGET_MS="200";
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const undo=intercept(async({url,method,forward})=>{if(method==="POST"&&url.pathname.endsWith("transactions")){await gate;return forward();}});
  const result=await say(fx,"별도 구매 확인 "+p.token);
  eq(result.body.template.quickReplies[0].messageText,"별도 구매 조회 "+p.token,"delayed confirmation uses safe status lookup");
  release();await Promise.allSettled(result.jobs);undo();
  const status=await say(fx,"별도 구매 조회 "+p.token);
  eq(status.body.template.quickReplies[0].messageText,"2026-10-01 기록 보기","status lookup restores persisted original date");
  eq(fx.db.transactions.length,2,"status lookup adds no record");
});
await setup(async fx=>{
  const old=Date.now;let now=old();Date.now=()=>now;
  try {
    await say(fx,"경계케이크 7531원 현금");
    fx.db.transactions[0].created_at=new Date(now).toISOString();
    const base=now;
    for(const ms of [7999,8000,8001,119999,120000]) {now=base+ms;await say(fx,"경계케이크 7531원 현금");eq(fx.db.transactions.length,1,"ordinary guard at "+ms);}
    now=base+120001;await say(fx,"경계케이크 7531원 현금");eq(fx.db.transactions.length,2,"ordinary window expires strictly after 120s");
  }finally{Date.now=old;}
});
await setup(async fx=>{
  const text="쌍둥이케이크 7532원 현금 / 쌍둥이케이크 7532원 현금";
  await say(fx,text);eq(fx.db.transactions.length,2,"two identical entries in first message preserved");
  await say(fx,text);eq(fx.db.transactions.length,2,"immediate bulk replay adds none");
  const old=Date.now;Date.now=()=>old()+9000;
  try{await say(fx,text);eq(fx.db.transactions.length,2,"bulk replay after 8s adds none");}finally{Date.now=old;}
});

for(const room of ["","deferred-room"]) for(const outcome of ["success","definite","unknown"]) await setup(async fx=>{
  if(room) putSetting(fx,"kakao_group_links",JSON.stringify({[room]:{household_id:"house-home",linked_by:"user-bin"}}));
  fx.env.KAKAO_RESPONSE_BUDGET_MS="200";
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const undo=intercept(async({url,method,forward})=>{
    if(url.pathname.endsWith("transactions")&&method==="POST") {await gate;if(outcome==="definite")return failure(400,"synthetic definite");if(outcome==="unknown")throw new TypeError("synthetic uncertain");return forward();}
  });
  const response=await say(fx,"2026-10-01 지난기록 7533원 현금",{room});
  eq(response.response.headers.get("x-accountbook-nlu-result"),"deferred","delayed response state");
  ok(response.text.includes("2026-10-01 기록 보기"),"deferred route uses input date");
  ok(!response.text.includes("저장했어요"),"deferred result is not success");
  if(room) ok(!response.body.template.quickReplies,"deferred group no quick replies");
  else eq(response.body.template.quickReplies[0].messageText,"2026-10-01 기록 보기","direct deferred lookup button");
  release();await Promise.allSettled(response.jobs);undo();
  eq(fx.db.transactions.length,outcome==="success"?1:0,"background outcome "+outcome);
  eq(response.body.template.outputs.length,1,"no automatic final notification appended");
});
for (const outcome of ["success","failure"]) await setup(async fx=>{
  fx.env.KAKAO_RESPONSE_BUDGET_MS="200";
  let release, historyStarted=false, prepared=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const undo=intercept(async({url,method,init,forward})=>{
    if(url.pathname.endsWith("accountbook_settings") && method==="POST" && String(init.body).includes("kakao_first_record_history_v22928:")) {
      historyStarted=true; await gate;
      return outcome==="failure" ? failure(400,"synthetic history failure") : forward();
    }
    if(url.pathname.endsWith("accountbook_settings") && method==="GET" && String(url.searchParams.get("key")).includes("pending_write:")) prepared=true;
  });
  try {
    const result=await say(fx,"첫구매 7560원 현금",{user:"synthetic-first-history-"+outcome,room:"first-history-room-"+outcome});
    ok(historyStarted && !prepared,"first-use history must succeed before writer preparation");
    eq(fx.db.transactions.length,0,"no transaction before required history succeeds");
    eq(fx.db.accountbook_settings.filter(row=>row.key.includes(":pending_write:")).length,0,"no pending marker before required history succeeds");
    release();await Promise.allSettled(result.jobs);
    eq(fx.db.transactions.length,outcome==="success"?1:0,"history outcome gates first record: "+outcome);
  } finally {release();undo();}
});
await setup(async fx=>{
  const key="kakao_edit_v2254:house-home:pending_write:user-bin";
  const foreign=JSON.stringify({fp:"other-inflight",ids:[crypto.randomUUID()],at:Date.now()});
  const undo=intercept(({url,method,init})=>{
    if(method==="POST" && url.pathname.endsWith("accountbook_settings") && JSON.parse(init.body).key===key) putSetting(fx,key,foreign);
  });
  try {
    const result=await say(fx,"조건부생성 7561원 현금");
    eq(fx.db.transactions.length,0,"stale absent snapshot cannot overwrite another action or send a transaction");
    eq(fx.db.accountbook_settings.find(row=>row.key===key).value,foreign,"insert conflict preserves newer pending marker");
    ok(!result.text.includes("저장했어요"),"conditional insert conflict is not success");
  } finally {undo();}
});
for(const race of ["delete","replace"]) await setup(async fx=>{
  const key="kakao_edit_v2254:house-home:pending_write:user-bin";
  const original={id:crypto.randomUUID(),household_id:"house-home",user_id:"user-bin",transaction_date:"2026-10-01",type:"expense",amount:7511,category:"외식",memo:"기존확정",payment_method:"현금",source:"kakao_skill",raw_text:"기존확정 7511원 현금"};
  fx.db.transactions=[original];
  putSetting(fx,key,JSON.stringify({fp:"confirmed-old",ids:[original.id],rows:[original],at:Date.now()}));
  const replacement=JSON.stringify({fp:"newer-unknown",ids:[crypto.randomUUID()],at:Date.now()});
  const undo=intercept(({url,method})=>{
    if(method==="PATCH" && url.pathname.endsWith("accountbook_settings") && url.searchParams.get("key")==="eq."+key){
      if(race==="delete") fx.db.accountbook_settings=fx.db.accountbook_settings.filter(row=>row.key!==key);
      else putSetting(fx,key,replacement);
    }
  });
  try {
    await say(fx,"조건부교체 7562원 현금");
    eq(fx.db.transactions.length,1,"stale marker "+race+" does not send a transaction");
    eq(fx.db.accountbook_settings.find(row=>row.key===key)?.value,race==="replace"?replacement:undefined,"conditional update never recreates or replaces a newer marker");
  } finally {undo();}
});
for(const value of ["",null]) await setup(async fx=>{
  putSetting(fx,"kakao_edit_v2254:house-home:pending_write:user-bin",value);
  const result=await say(fx,"빈표식호환 7563원 현금");
  eq(fx.db.transactions.length,1,"legacy empty marker is safely conditionally replaced");
  ok(result.text.includes("저장했어요"),"legacy empty marker keeps normal save response");
});
await setup(async fx=>{
  let lost=false;
  const undo=intercept(async({url,method,init,forward})=>{
    if(!lost && method==="POST" && url.pathname.endsWith("accountbook_settings") && String(JSON.parse(init.body).key).includes(":pending_write:")) {
      lost=true;await forward();throw new TypeError("synthetic marker response loss");
    }
  });
  const old=Date.now;
  try {
    await say(fx,"표식응답소실 7564원 현금");
    eq(fx.db.transactions.length,0,"unknown pending persistence does not send a transaction");
    const id=JSON.parse(fx.db.accountbook_settings.find(row=>row.key.includes(":pending_write:")).value).ids[0];
    Date.now=()=>old()+9000;
    await say(fx,"표식응답소실 7564원 현금");
    eq(fx.db.transactions.length,1,"marker persistence retry completes once");
    eq(fx.db.transactions[0].id,id,"marker response loss keeps the original fixed ID");
  } finally {Date.now=old;undo();}
});
for(const failureMode of ["unavailable","duplicate"]) await setup(async fx=>{
  const undo=intercept(({url,method})=>{
    if(method==="GET" && url.pathname.endsWith("accountbook_settings") && String(url.searchParams.get("key")).startsWith("in.(kakao_edit_v4:")) {
      if(failureMode==="unavailable") return failure(503,"synthetic routing read failure");
      return new Response(JSON.stringify([{key:"kakao_selected_household_v2251:user-bin",value:"house-home"},{key:"kakao_selected_household_v2251:user-bin",value:"house-other"}]));
    }
  });
  try {await say(fx,"경로조회실패 7565원 현금");eq(fx.db.transactions.length,0,"routing snapshot "+failureMode+" is never an empty success");}
  finally {undo();}
});
done();
