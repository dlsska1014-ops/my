import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import worker, { collect, collectUsage, deliverAlerts, summary } from "./worker.mjs";
import { dashboardHtml } from "./dashboard.mjs";

// 시험 시계를 달 가운데 정오에 고정한다(흐르기는 한다). 실제 시계로 돌리면 UTC 하루 첫 5분(09:00~09:05 KST)에
// collectCloudflare 의 until(now-5분)이 전날이라 일간 요청이 unknown 이 되어 전체 normal 검사가 실패했다
// (V22.9.93 main CI 41254522862). 그 5분의 동작은 파일 끝에서 따로 본다.
const RealDate=Date;
const clockStart=RealDate.parse("2026-06-15T12:00:00.000Z"), realStart=RealDate.now();
const testNow=()=>clockStart+RealDate.now()-realStart;
globalThis.Date=class extends RealDate {
  constructor(...args){if(args.length)super(...args);else super(testNow());}
  static now(){return testNow();}
};

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("schema.sql",import.meta.url),"utf8"));
const db={
  prepare(sql) {
    const statement=sqlite.prepare(sql);
    let args=[];
    const api={bind(...values){args=values;return api;},async all(){return {results:statement.all(...args)};},async first(){return statement.get(...args)||null;},run(){const data=statement.run(...args);return {success:true,meta:{changes:data.changes}};}};
    return api;
  },
  async batch(statements) {sqlite.exec("BEGIN");try{const values=[];for(const s of statements)values.push(s.run());sqlite.exec("COMMIT");return values;}catch(e){sqlite.exec("ROLLBACK");throw e;}}
};
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const eq=(value,expected,message)=>{assert.deepEqual(value,expected,message);checks++;};
const now=new Date();
const env={MONITOR_DB:db,OPS_MONITOR_TOKEN:"sqlite-test-secret",CF_ANALYTICS_TOKEN:"only-a-test",CF_ACCOUNT_ID:"test-account",APP_WORKER_NAME:"test-app",APP_ORIGIN:"https://app.example",SUPABASE_ORG_ID:"test-org",CF_PLAN:"free",SUPABASE_PLAN:"free",PLAN_VERIFIED_AT:now.toISOString(),ACCOUNTBOOK:{async fetch(){return new Response(JSON.stringify({ok:true,metrics:{database_bytes:30*1024**2,connections:5,max_connections:60,cpu_counter:{total:100,idle:80}}}));}}};
const originalFetch=globalThis.fetch;
let graphFails=false, uptimeFails=false, webhookFails=false, tokenExpiresInDays=null, appErrors=0, d1Reply=null;
const hooks=[];
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input.url);
  if(url.hostname==="hooks.example") { if(webhookFails) return new Response("down",{status:500}); hooks.push(JSON.parse(String(init?.body))); return new Response("ok"); }
  if(url.hostname==="api.cloudflare.com") {
    if(url.pathname==="/client/v4/user/tokens/verify") return new Response(JSON.stringify({success:true,result:{id:"t",status:"active",expires_on:tokenExpiresInDays===null?null:new Date(Date.now()+tokenExpiresInDays*86400000).toISOString()}}));
    if(String(init?.body).includes('d1AnalyticsAdaptiveGroups')&&!graphFails) return new Response(JSON.stringify(d1Reply||{data:{viewer:{accounts:[{usage:[{sum:{rowsRead:450000,rowsWritten:4000}}],storage:[{dimensions:{databaseId:'fixture'},max:{databaseSizeBytes:1048576}}]}]}}}));
    if(graphFails)return new Response('{"errors":[{"message":"test failure"}]}');
    return new Response(JSON.stringify({data:{viewer:{accounts:[{today:[{sum:{requests:20000,errors:0,subrequests:20},dimensions:{status:"success"}}],hour:[{sum:{requests:100,errors:0,subrequests:1}}],app:[{sum:{requests:19000,errors:appErrors,subrequests:19}}]}]}}}));
  }
  return new Response(JSON.stringify(url.pathname==="/ready"?{ready:!uptimeFails}:{alive:true,version:"fixture"}));
};
const req=(path,init={})=>new Request("https://monitor.example"+path,{...init,headers:{authorization:"Bearer sqlite-test-secret","content-type":"application/json",...init.headers}});
try {
  await collect(env,now);
  let result=await summary(env,now.getTime());
  eq(result.states.cloudflare.status,"ok","real SQLite persists successful provider collection");
  eq(result.quotas[1].value,30*1024**2,"database logical size persisted");
  eq(result.quotas[1].limit,500*1024**2,"free project size allowance used");
  eq(result.states.d1.status,"ok","D1 account usage persisted");
  eq(result.quotas.find(q=>q.key==="d1_reads").value,450000,"D1 reads counted across account");
  eq(result.quotas.find(q=>q.key==="d1_writes").limit,100000,"D1 write cap displayed");
  eq(result.quotas.find(q=>q.key==="d1_storage").value,1048576,"D1 conservative daily maximum displayed");
  eq(result.database.cpu_percent,null,"first persisted CPU sample unknown");
  eq(result.quotas.find(q=>q.key==="egress").status,"unknown","missing billing usage cannot appear normal");
  ok(result.unknown.length>0,"global status reports missing data");
  eq(result.application.telemetry_status,"not_connected","missing application telemetry explicitly unobserved");
  ok(result.unknown.includes("앱 요청 표본 미관측 또는 갱신 지연"),"unobserved application is included in global unknown state");
  const monthStart=new Date(now);monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const monthEnd=new Date(monthStart);monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1);
  for(const key of ["egress","cached_egress","storage"]) eq((await worker.fetch(req("/api/manual",{method:"POST",body:JSON.stringify({key,value:1024,scope:"organization",period_start:monthStart.toISOString(),period_end:monthEnd.toISOString()})}),env,{})).status,200,"normal billing values seeded through authenticated route");
  result=await summary(env);
  ok(result.quotas.every(q=>q.status==="normal"),"all provider and billing quota metrics can be normal in no-telemetry case");
  eq(result.status,"unknown","missing application observations prevent false global normal despite healthy quotas");
  const later=new Date(now.getTime()+300000);
  env.ACCOUNTBOOK.fetch=async()=>new Response(JSON.stringify({ok:true,metrics:{database_bytes:30*1024**2,connections:6,max_connections:60,cpu_counter:{total:200,idle:130}}}));
  await collect(env,later);
  result=await summary(env,later.getTime());
  eq(result.database.cpu_percent,50,"separate persisted samples support CPU delta");
  graphFails=true;
  await collect(env,new Date(later.getTime()+300000));
  result=await summary(env,later.getTime()+300000);
  eq(result.states.cloudflare.status,"error","provider failure stored");
  eq(result.quotas[0].value,null,"past successful quota is not reused as current normal after failure");
  ok(result.states.cloudflare.last_success_at!==null,"last known success retained for diagnosis");
  const telemetry={id:"test-event-123",at:Date.now(),route:"skill",method:"POST",status:200,duration_ms:100,db_count:2,db_ms:30,db_failures:0,outcome:"saved",sample_kind:"random",utterance:"never store"};
  for(let i=0;i<2;i++)eq((await worker.fetch(req("/internal/telemetry",{method:"POST",body:JSON.stringify(telemetry)}),env,{})).status,202,"event insert accepted");
  eq(sqlite.prepare("SELECT COUNT(*) AS n FROM telemetry").get().n,1,"retry deduplicated by event ID");
  const stored=sqlite.prepare("SELECT * FROM telemetry").get();
  ok(!JSON.stringify(stored).includes("never store"),"SQLite payload contains only allowlisted columns");
  result=await summary(env);
  eq(result.application.telemetry_status,"ok","recent accepted application sample is observable");
  sqlite.prepare("UPDATE telemetry SET at=?").run(Date.now()-2*3600000);
  result=await summary(env);
  eq(result.application.telemetry_status,"stale","old application telemetry explicitly stale");
  ok(result.notes.some(note=>note.includes("카카오 p95 표본 부족"))&&!result.unknown.some(item=>item.includes("p95")),"insufficient latency samples are a note, not an unknown item (1.1.0)");
  sqlite.prepare("UPDATE telemetry SET at=?").run(Date.now());
  for(let i=0;i<80;i++) await worker.fetch(req("/internal/telemetry",{method:"POST",body:JSON.stringify({...telemetry,id:`cap-event-${i}`})}),env,{});
  ok(sqlite.prepare("SELECT COUNT(*) AS n FROM telemetry").get().n<=10,"global diagnostic cap protects monitoring storage write budget");
  const login=await worker.fetch(req("/internal/ticket",{method:"POST"}),env,{});
  const {ticket}=await login.json();
  const accept=await worker.fetch(new Request("https://monitor.example/session",{method:"POST",body:new URLSearchParams({ticket})}),env,{});
  eq(accept.status,303,"one-use ticket creates separate monitor session");
  ok(accept.headers.get("set-cookie").includes("HttpOnly")&&accept.headers.get("set-cookie").includes("Secure"),"monitor session protected cookie");
  const replay=await worker.fetch(new Request("https://monitor.example/session",{method:"POST",body:new URLSearchParams({ticket})}),env,{});
  eq(replay.status,401,"one-use ticket cannot be replayed");
  const cookie=accept.headers.get("set-cookie").split(";")[0];
  const csrf=await worker.fetch(new Request("https://monitor.example/api/plans",{method:"POST",headers:{cookie,origin:"https://evil.example"},body:JSON.stringify({cloudflare:"paid",supabase:"pro"})}),env,{});
  eq(csrf.status,403,"cross-origin setting write rejected");
  const internal=await worker.fetch(new Request("https://monitor.example/internal/ticket",{method:"POST",headers:{cookie,origin:"https://monitor.example"}}),env,{});
  eq(internal.status,403,"browser session cannot invoke internal collector routes");
  const page=await worker.fetch(new Request("https://monitor.example/",{headers:{cookie}}),env,{});
  eq(page.status,200,"separate session reads monitoring dashboard");
  eq(page.headers.get("cache-control"),"no-store","monitor pages are never cached");
  const beginning=new Date(now);beginning.setUTCDate(1);beginning.setUTCHours(0,0,0,0);
  const ending=new Date(beginning);ending.setUTCMonth(ending.getUTCMonth()+1);
  const manual=await worker.fetch(req("/api/manual",{method:"POST",body:JSON.stringify({key:"egress",value:1024**3,scope:"organization",period_start:beginning.toISOString(),period_end:ending.toISOString()})}),env,{});
  eq(manual.status,200,"valid organization billing record stored");
  const invalidScope=await worker.fetch(req("/api/manual",{method:"POST",body:JSON.stringify({key:"egress",value:1,scope:"project",period_start:beginning.toISOString(),period_end:ending.toISOString()})}),env,{});
  eq(invalidScope.status,400,"project subtotal cannot masquerade as organization total");
  const plans=await worker.fetch(req("/api/plans",{method:"POST",body:JSON.stringify({cloudflare:"paid",supabase:"pro"})}),env,{});
  eq(plans.status,200,"verified plan metadata stored without billing action");
  result=await summary(env);
  eq(result.quotas.find(q=>q.key==="database_size").limit,null,"Pro physical disk allowance is not compared with logical database size");
  eq(result.plans.cloudflare,"paid","manual plan verification used");
  sqlite.prepare("UPDATE manual_usage SET verified_at=? WHERE key='egress'").run(new Date(Date.now()-2*86400000).toISOString());
  result=await summary(env);
  eq(result.quotas.find(q=>q.key==="egress").status,"unknown","old manual billing record explicitly unknown");
  sqlite.prepare("INSERT INTO telemetry(id,at,route,method,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,slot) VALUES('expired-record',?,'web','GET',200,1,0,0,0,'ok','random','expired-slot')").run(Date.now()-8*86400000);
  sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES('retention-test',?,?, '{}')").run(new Date(Date.now()-32*86400000).toISOString(),new Date(Date.now()-32*86400000).toISOString());
  const midnight=new Date(now);midnight.setUTCDate(midnight.getUTCDate()+1);midnight.setUTCHours(0,0,0,0);
  await collect(env,midnight);
  eq(sqlite.prepare("SELECT COUNT(*) AS n FROM telemetry WHERE id='expired-record'").get().n,0,"hourly cleanup removes old request observations");
  eq(sqlite.prepare("SELECT COUNT(*) AS n FROM samples WHERE source='retention-test'").get().n,0,"daily cleanup removes old aggregates");
  ok(sqlite.prepare("SELECT COUNT(*) AS n FROM telemetry").get().n>0,"retention cleanup preserves recent request observations");
  // ── 1.1.0 알림 발송·토큰 만료·요금제 만료·오류 건수 ───────────────────────────
  graphFails=false;
  const mails=[];const pending=[];
  const alertEnv={...env,ALERT_EMAIL:{async send(message){mails.push(message);}},ALERT_TO:"ops@example.com",ALERT_FROM:"monitor@app.example",ALERT_WEBHOOK_URL:"https://hooks.example/alert"};
  const runScheduled=async(e,at)=>{await worker.scheduled({scheduledTime:at.getTime()},e,{waitUntil:p=>pending.push(p)});await Promise.all(pending.splice(0));};
  const base=new Date(now);base.setUTCHours(base.getUTCHours()+1,10,0,0);
  uptimeFails=true;
  await runScheduled(alertEnv,base);
  eq(mails.length,1,"critical uptime failure is emailed once");
  eq(hooks.length,1,"webhook receives the same alert");
  ok(mails[0].raw.includes("Subject: =?UTF-8?B?")&&mails[0].raw.includes("Content-Transfer-Encoding: base64")&&mails[0].to==="ops@example.com"&&mails[0].from==="monitor@app.example","alert email is a raw RFC 5322 message from ALERT_FROM to ALERT_TO");
  ok(hooks[0].text.includes("서비스 접속 또는 DB 준비 상태 실패")&&hooks[0].text.includes("/ops-monitor"),"alert text names the failing check and the dashboard");
  ok(sqlite.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'alert:%'").get().n>=1,"sent alert remembered for deduplication");
  eq(sqlite.prepare("SELECT status FROM collector_state WHERE name='alerts'").get().status,"ok","alert delivery recorded as a collector state");
  await runScheduled(alertEnv,new Date(base.getTime()+300000));
  eq(mails.length,1,"same critical alert is not resent within 6 hours");
  await runScheduled(alertEnv,new Date(base.getTime()+7*3600000));
  eq(mails.length,2,"still-active critical alert is resent after 6 hours");
  uptimeFails=false;
  // 1.2.0(V44:G-3): 해소는 5분 수집 3번 연속(10분 이상) 정상일 때만 판정한다. 정상 한 번·두 번으로는 해소 메일이 없다.
  const uptimeRecord=()=>JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().map(row=>row.value).find(value=>JSON.parse(value).title==="서비스 접속 또는 DB 준비 상태 실패")||"null");
  await runScheduled(alertEnv,new Date(base.getTime()+7*3600000+300000));
  await runScheduled(alertEnv,new Date(base.getTime()+7*3600000+600000));
  eq(mails.length,2,"one or two healthy checks are not yet a recovery (1.2.0 flapping guard)");
  await runScheduled(alertEnv,new Date(base.getTime()+7*3600000+900000));
  eq(mails.length,3,"recovery of a critical alert is sent once, on the third consecutive healthy check");
  ok(hooks.at(-1).text.includes("[해소] 서비스 접속 또는 DB 준비 상태 실패"),"recovery message names the recovered alert");
  eq(uptimeRecord()?.sent_at,new Date(base.getTime()+7*3600000).toISOString(),"the recovered alert keeps its last send time (1.2.0: no deletion on recovery)");
  await runScheduled(alertEnv,new Date(base.getTime()+7*3600000+1200000));
  eq(mails.length,3,"nothing new means nothing sent");
  uptimeFails=true; webhookFails=true;
  const failingEnv={...alertEnv,ALERT_EMAIL:{async send(){throw Object.assign(new Error("sender domain is not verified"),{code:"E_SENDER_NOT_VERIFIED"});}}};
  await runScheduled(failingEnv,new Date(base.getTime()+8*3600000));
  const failedCode=String(sqlite.prepare("SELECT error_code FROM collector_state WHERE name='alerts'").get().error_code);
  ok(failedCode.startsWith("delivery_failed")&&failedCode.includes("email:E_SENDER_NOT_VERIFIED")&&failedCode.includes("webhook:"),`every channel failing is recorded as delivery_failed with the per-channel cause (1.1.1): ${failedCode}`);
  eq(uptimeRecord()?.sent_at,new Date(base.getTime()+7*3600000).toISOString(),"failed delivery records no new send, so the next run retries");
  webhookFails=false;
  await runScheduled(failingEnv,new Date(base.getTime()+8*3600000+300000));
  ok(hooks.at(-1).text.includes("[긴급] 서비스 접속 또는 DB 준비 상태 실패 · 해소 뒤 다시 생김")&&uptimeRecord()?.sent_at===new Date(base.getTime()+8*3600000+300000).toISOString(),"retry succeeds through the remaining channel, flagged as a recurrence after the recovery mail");
  uptimeFails=false;
  await runScheduled(env,new Date(base.getTime()+9*3600000));
  eq(sqlite.prepare("SELECT error_code FROM collector_state WHERE name='alerts'").get().error_code,"not_connected","no alert channel is recorded as not_connected");
  let r=await summary(env,base.getTime()+9*3600000);
  ok(r.unknown.includes("알림 발송 채널 미연결(ALERT_TO 또는 ALERT_WEBHOOK_URL)"),"missing alert channel is a visible unknown item");
  eq(r.delivery.channels.length,0,"summary reports no alert channels");
  ok(r.notes.some(note=>note.includes("p95 표본 부족")),"sparse p95 samples stay a note");
  tokenExpiresInDays=10;
  const hourly=new Date(base);hourly.setUTCHours(hourly.getUTCHours()+10,0,0,0);
  await runScheduled(alertEnv,hourly);
  r=await summary(alertEnv,hourly.getTime());
  ok(r.token.expires_on&&r.token.days_left<=10&&r.token.days_left>=9,"analytics token expiry is collected hourly");
  ok(r.alerts.some(a=>a.title==="Cloudflare 분석 토큰 만료 임박"&&a.status==="warning"),"token expiring within 30 days raises a warning");
  ok(hooks.at(-1).text.includes("분석 토큰 만료 임박"),"token warning is delivered");
  sqlite.prepare("UPDATE settings SET value=? WHERE key='plans'").run(JSON.stringify({cloudflare:"free",supabase:"free",verified_at:new Date(hourly.getTime()-8*86400000).toISOString()}));
  r=await summary(alertEnv,hourly.getTime());
  eq(r.plans.stale,true,"plan record older than 7 days is stale");
  eq(r.plans.cloudflare,"free","stale plan record still names the last verified plan");
  eq(r.quotas.find(q=>q.key==="worker_requests").limit,100000,"stale plan record keeps the last known limit instead of null");
  ok(r.alerts.some(a=>a.title==="요금제 확인 기록 만료")&&r.notes.some(note=>note.includes("요금제 확인 기록이 7일을 넘었습니다")),"stale plan record raises a reminder and a note");
  appErrors=25;
  await collect(alertEnv,new Date(hourly.getTime()+300000));
  r=await summary(alertEnv,hourly.getTime()+300000);
  ok(r.alerts.some(a=>a.title==="앱 Worker 런타임 오류(오늘)"&&a.status==="critical"),"20 or more app runtime errors today is critical even at low traffic");
  appErrors=0;
  const brokenEnv={...alertEnv,ACCOUNTBOOK:{async fetch(){return new Response(JSON.stringify({ok:false,error_code:"metrics_unavailable"}),{status:503});}}};
  await collect(brokenEnv,new Date(hourly.getTime()+600000));
  eq(sqlite.prepare("SELECT error_code FROM collector_state WHERE name='database'").get().error_code,"metrics_unavailable","the app's real database error code survives a 503 (was http_503)");
  // PR #68: a disappearing quota alert is not a recovery if its source cannot be measured.
  sqlite.prepare("DELETE FROM settings WHERE key LIKE 'alert:%'").run();
  sqlite.prepare("UPDATE settings SET value=? WHERE key='plans'").run(JSON.stringify({cloudflare:"free",supabase:"free",verified_at:now.toISOString()}));
  const quotaAt=new Date(now);
  const seedDatabase=(status,payload,at,successAt=at)=>sqlite.prepare("UPDATE collector_state SET status=?,payload=?,last_attempt_at=?,last_success_at=?,error_code=? WHERE name='database'").run(status,JSON.stringify(payload),at.toISOString(),successAt.toISOString(),status==="error"?"metrics_unavailable":null);
  const quotaRecord=()=>sqlite.prepare("SELECT key,value FROM settings WHERE key LIKE 'alert:%'").all().find(row=>JSON.parse(row.value).title==="DB 논리 용량");
  seedDatabase("ok",{database_bytes:499*1024**2},quotaAt);
  const high=await deliverAlerts(alertEnv,quotaAt);
  ok(high.titles.includes("DB 논리 용량")&&quotaRecord(),"critical DB quota is delivered and remembered");
  const criticalRecord=quotaRecord().value;
  for(const missing of ["error","stale","missing-value"]) {
    const at=new Date(quotaAt.getTime()+300000);
    seedDatabase(missing==="error"?"error":"ok",missing==="missing-value"?{}:{database_bytes:499*1024**2},at,missing==="stale"?new Date(at.getTime()-3600000):at);
    const unavailable=await deliverAlerts(alertEnv,at);
    eq(unavailable.recovered,0,`${missing} database evidence never sends a false recovery`);
    eq(quotaRecord()?.value,criticalRecord,`${missing} database evidence preserves the critical dedupe record`);
  }
  const stillHighAt=new Date(quotaAt.getTime()+600000);
  seedDatabase("ok",{database_bytes:499*1024**2},stillHighAt);
  eq((await deliverAlerts(alertEnv,stillHighAt)).sent,0,"a returning critical DB measurement stays deduplicated within six hours");
  const healthyAt=new Date(quotaAt.getTime()+900000);
  seedDatabase("ok",{database_bytes:30*1024**2},healthyAt);
  ok((await summary(alertEnv,healthyAt.getTime())).unknown.length>0,"unrelated unknown collectors remain in the recovery fixture");
  eq((await deliverAlerts(alertEnv,healthyAt)).recovered,0,"one fresh normal DB check is not yet a recovery (1.2.0 flapping guard)");
  const secondHealthyAt=new Date(healthyAt.getTime()+300000);
  seedDatabase("ok",{database_bytes:30*1024**2},secondHealthyAt);
  eq((await deliverAlerts(alertEnv,secondHealthyAt)).recovered,0,"two fresh normal DB checks are not yet a recovery");
  const confirmedAt=new Date(healthyAt.getTime()+600000);
  seedDatabase("ok",{database_bytes:30*1024**2},confirmedAt);
  eq((await deliverAlerts(alertEnv,confirmedAt)).recovered,1,"three consecutive fresh normal DB checks confirm recovery despite unrelated unknown collectors");
  ok(hooks.at(-1).text.includes("[해소] DB 논리 용량")&&JSON.parse(quotaRecord().value).resolved_at===confirmedAt.toISOString()&&JSON.parse(quotaRecord().value).sent_at===JSON.parse(criticalRecord).sent_at,"confirmed recovery is delivered and the record keeps its last send time (1.2.0)");
  eq((await deliverAlerts(alertEnv,confirmedAt)).recovered,0,"confirmed DB recovery is sent only once");
  // UTC 하루 첫 5분: collectCloudflare 는 now-5분 까지만 세므로 그날 값이 아직 없다. 전날 값을 오늘 값으로 보이지 않는다.
  graphFails=false;
  const firstMinutes=new Date(now);firstMinutes.setUTCDate(firstMinutes.getUTCDate()+2);firstMinutes.setUTCHours(0,2,0,0);
  await collect(env,firstMinutes);
  result=await summary(env,firstMinutes.getTime());
  eq(result.quotas.find(q=>q.key==="worker_requests").value,null,"first five UTC minutes show no daily request value instead of yesterday's total");
  const afterFirstMinutes=new Date(firstMinutes.getTime()+5*60000);
  await collect(env,afterFirstMinutes);
  result=await summary(env,afterFirstMinutes.getTime());
  eq(result.quotas.find(q=>q.key==="worker_requests").value,20000,"daily request value returns once the window reaches the new UTC day");
  // ── 1.5.0(V22.9.94) C-6 그날 D1 사용량이 빈 것 · R-4 앱 예약 실행 경보 ─────────────────
  // 시각은 모두 인자로 준다(위 고정 시계·실제 시각과 무관하게 같은 결과). 새 저장소에서 보고, 이 구간의 실패는 모아 한 번에 보인다.
  {
    const misses=[];
    const want=(value,message)=>{checks++;if(!value)misses.push(message);};
    const freshDb=()=>{
      const store=new DatabaseSync(":memory:");
      store.exec(readFileSync(new URL("schema.sql",import.meta.url),"utf8"));
      return {store,db:{
        prepare(sql){const statement=store.prepare(sql);let args=[];const api={bind(...values){args=values;return api;},async all(){return {results:statement.all(...args)};},async first(){return statement.get(...args)||null;},run(){const data=statement.run(...args);return {success:true,meta:{changes:data.changes}};}};return api;},
        async batch(statements){store.exec("BEGIN");try{const values=[];for(const s of statements)values.push(s.run());store.exec("COMMIT");return values;}catch(e){store.exec("ROLLBACK");throw e;}}
      }};
    };
    const renderDash=data=>{
      const script=dashboardHtml("").match(/<script>([\s\S]*?)<\/script>/)[1];
      const elements=new Map();
      const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:"",textContent:"",value:"",disabled:false,addEventListener(){},querySelector(){return {disabled:false};}});return elements.get(id);};
      const context=vm.createContext({document:{hidden:true,addEventListener(){},getElementById:element},setInterval(){},console,AbortSignal,fetch(){throw new Error("not expected while hidden");}});
      vm.runInContext(script,context);
      context.__summary=JSON.parse(JSON.stringify(data));
      vm.runInContext("render(__summary)",context);
      return element("content").innerHTML;
    };
    const H=3600000, M=60000, at=t=>new Date(t).toISOString();

    // C-6: Cloudflare 가 그날 D1 사용량·저장 용량 행을 아직 주지 않은 것(UTC 하루 첫 몇 분·집계 지연)은 실패가 아니라 데이터 대기다.
    const c6=freshDb();
    const c6Env={...env,MONITOR_DB:c6.db};
    const c6At=Date.parse("2026-06-16T00:01:00.000Z");
    const storage=[{dimensions:{databaseId:"fixture"},max:{databaseSizeBytes:1048576}}];
    const d1State=()=>c6.store.prepare("SELECT status,error_code,payload FROM collector_state WHERE name='d1'").get()||null;
    const quota=(data,key)=>data.quotas.find(q=>q.key===key)||{};
    d1Reply={data:{viewer:{accounts:[{usage:[],storage}]}}};
    await collect(c6Env,new Date(c6At));
    let d1Row=d1State(), r6=await summary(c6Env,c6At);
    want(d1Row?.status==="ok"&&d1Row.error_code===null,`C-6: 빈 사용량 배열은 수집 실패(empty_result)가 아니라 정상 수집이다: ${d1Row?.status} ${d1Row?.error_code}`);
    want(quota(r6,"d1_reads").value===0&&quota(r6,"d1_writes").value===0&&quota(r6,"d1_reads").status==="normal",`C-6: 빈 사용량은 읽기·쓰기 0(데이터 대기)이다: ${quota(r6,"d1_reads").value}/${quota(r6,"d1_writes").value}`);
    want(quota(r6,"d1_storage").value===1048576&&quota(r6,"d1_storage").status==="normal","C-6: 저장 용량 지표는 그대로 남는다");
    want(!r6.unknown.some(item=>item.startsWith("관제 저장소 사용량 수집")),`C-6: 빈 사용량 때문에 수집기가 확인되지 않은 항목에 오르지 않는다: ${r6.unknown.join(",")}`);
    let d1Payload=null; try { d1Payload=JSON.parse(d1Row?.payload||"null"); } catch(_) { d1Payload=null; }
    want(d1Payload?.usage_pending===true&&d1Payload?.storage_pending===undefined,"C-6: 저장한 값에 사용량 대기 표시만 있다");
    d1Reply={data:{viewer:{accounts:[{usage:[],storage:[]}]}}};
    await collect(c6Env,new Date(c6At+5*M));
    d1Row=d1State(); r6=await summary(c6Env,c6At+5*M);
    want(d1Row?.status==="ok"&&quota(r6,"d1_storage").value===null&&quota(r6,"d1_storage").status==="unknown"&&quota(r6,"d1_reads").value===0,`C-6: 저장 용량 행도 아직 없으면 저장 용량만 확인 불가(null)이고 수집은 정상이다: ${d1Row?.status} ${quota(r6,"d1_storage").value}`);
    // 수집 상태의 error_code 는 failureCode 가 줄인 값이다(empty_result → empty, unsupported_fields → unsupported, graphql_error → graphql).
    for(const [label,reply,code] of [["계정 없음",{data:{viewer:{accounts:[]}}},"empty"],["사용량 칸이 배열이 아님",{data:{viewer:{accounts:[{usage:null,storage}]}}},"empty"],["저장 용량 칸이 배열이 아님",{data:{viewer:{accounts:[{usage:[],storage:{}}]}}},"empty"],["숫자가 아닌 사용량",{data:{viewer:{accounts:[{usage:[{sum:{rowsRead:"many",rowsWritten:1}}],storage}]}}},"unsupported"],["숫자가 아닌 저장 용량",{data:{viewer:{accounts:[{usage:[],storage:[{max:{databaseSizeBytes:"big"}}]}]}}},"unsupported"],["GraphQL 오류",{errors:[{message:"bad"}]},"graphql"]]) {
      d1Reply=reply;
      await collect(c6Env,new Date(c6At+10*M));
      d1Row=d1State();
      want(d1Row?.status==="error"&&d1Row.error_code===code,`C-6 ${label}: 모양이 틀린 응답은 그대로 실패(${code})다: ${d1Row?.status} ${d1Row?.error_code}`);
    }
    d1Reply=null;
    c6.store.close();

    // R-4: 앱 예약 실행(매일 09:10 KST) 기록을 이용 현황 요청(55분마다)에 실어 받고, 실패·일부 처리·26시간 누락이면 주의로 알린다.
    const r4=freshDb();
    const SAMPLE=JSON.parse(readFileSync(new URL("../validation/usage-summary-sample-v22982.json",import.meta.url),"utf8"));
    let appHttp=200, cronBody;
    const appCalls=[];
    const r4App={async fetch(input,init){
      const request=new Request(input,init);
      if(new URL(request.url).pathname!=="/internal/ops-usage") return new Response(JSON.stringify({ok:true,metrics:{database_bytes:30*1024**2,connections:5,max_connections:60,cpu_counter:{total:100,idle:80}}}));
      appCalls.push({cron:request.headers.get("x-ab-monitor-cron"),authorization:request.headers.get("authorization")});
      const body=appHttp===200?{ok:true,usage:SAMPLE}:{ok:false,error_code:appHttp===503?"rpc_missing":"unauthorized"};
      if(cronBody!==undefined) body.cron=cronBody;
      return new Response(JSON.stringify(body),{status:appHttp,headers:{"content-type":"application/json"}});
    }};
    const r4Env={MONITOR_DB:r4.db,OPS_MONITOR_TOKEN:"sqlite-test-secret",ACCOUNTBOOK:r4App,APP_ORIGIN:"https://app.example",CF_PLAN:"free",SUPABASE_PLAN:"free",PLAN_VERIFIED_AT:"2026-06-16T00:00:00.000Z"};
    const setting=key=>{const row=r4.store.prepare("SELECT value FROM settings WHERE key=?").get(key);return row?JSON.parse(row.value):null;};
    // 이용 현황은 직전 시도 뒤 55분이 지나야 묻는다. 경우마다 시도 기록을 지워 그 시각에 바로 묻게 한다.
    const ask=async t=>{r4.store.prepare("DELETE FROM settings WHERE key='usage'").run();await collectUsage(r4Env,new Date(t));};
    const cronAlerts=data=>(data.alerts||[]).filter(a=>String(a.title).startsWith("앱 예약 실행"));
    const cronUnknown=data=>(data.unknown||[]).filter(item=>String(item).startsWith("앱 예약 실행"));
    const t0=Date.parse("2026-06-16T01:00:00.000Z");
    const lastRun="2026-06-16T00:10:02.000Z";
    const cronOk={ok:true,last_run_at:lastRun,last_status:"ok",last_error:null,version:"V22.9.94-REVIEW-FIXES",rev:4};
    // 1) 옛 앱(답에 cron 없음)
    await ask(t0-2*H);
    want(appCalls.length===1&&appCalls[0].cron==="1"&&appCalls[0].authorization==="Bearer sqlite-test-secret",`R-4: 이용 현황 요청에 x-ab-monitor-cron: 1 을 싣는다: ${JSON.stringify(appCalls[0])}`);
    want(setting("cron")===null&&setting("usage")?.status==="ok","R-4: 답에 cron 이 없으면(앱 V22.9.93 이하) 'cron' 행을 쓰지 않고 이용 현황은 그대로 적는다");
    let r=await summary(r4Env,t0-2*H+M);
    want(r.cron?.status==="never"&&!cronAlerts(r).length&&!cronUnknown(r).length,`R-4: 기록이 없으면 '수집 전'이고 경고·확인되지 않은 항목이 없다: ${r.cron?.status}`);
    // 2) 정상
    cronBody=cronOk;
    await ask(t0);
    want(isDeepStrictEqual(setting("cron"),{status:"ok",error_code:null,last_attempt_at:at(t0),last_success_at:at(t0),data:{last_run_at:lastRun,last_status:"ok",last_error:null,version:"V22.9.94-REVIEW-FIXES",rev:4}}),`R-4: 앱이 보낸 예약 실행 기록을 settings 'cron' 한 행에 적는다: ${JSON.stringify(setting("cron"))}`);
    want(setting("usage")?.status==="ok","R-4: 같은 답의 이용 현황도 정상으로 적는다");
    r=await summary(r4Env,t0+M);
    want(r.cron?.status==="ok"&&r.cron?.fresh===true&&r.cron?.missed===false&&!cronAlerts(r).length&&!cronUnknown(r).length,`R-4: 마지막 실행이 정상이면 경고가 없다: ${JSON.stringify(r.cron)}`);
    const alertingView=await summary(r4Env,t0+M,{alerting:true});
    want(isDeepStrictEqual(alertingView.cron,r.cron)&&isDeepStrictEqual(alertingView.alerts,r.alerts),"R-4: 알림 판정 범위와 화면 범위의 예약 실행 판정이 같다");
    // 3) 실패·일부 처리·26시간 누락(관제가 기록을 받은 시각과 마지막 실행 시각의 차이)
    for(const [label,body,title,parts] of [
      ["실패",{...cronOk,last_status:"error",last_error:"recurring:db_503"},"앱 예약 실행 실패",["recurring:db_503","2026-06-16 09:10 KST"]],
      ["일부 처리",{...cronOk,last_status:"partial",last_error:"recurring:page_cap"},"앱 예약 실행 일부 처리",["recurring:page_cap"]],
      ["마지막 실행 27시간 전",{...cronOk,last_run_at:at(t0+H-27*H)},"앱 예약 실행 누락",["26시간"]],
      ["실행 기록 없음",{ok:true,last_run_at:null,last_status:null,last_error:null,version:null,rev:2},"앱 예약 실행 누락",["기록이 없습니다"]],
      ["마지막 실행 25시간 전",{...cronOk,last_run_at:at(t0+H-25*H)},null,[]],
    ]) {
      cronBody=body;
      await ask(t0+H);
      r=await summary(r4Env,t0+H+M);
      const hit=cronAlerts(r);
      want(title===null?hit.length===0&&r.cron?.status==="ok":hit.length===1&&hit[0].title===title&&hit[0].status==="warning"&&parts.every(part=>String(hit[0].message).includes(part)),`R-4 ${label}: ${title||"경고 없음"} (받음 ${JSON.stringify(hit)} · ${r.cron?.status})`);
    }
    // 4) 130분 넘게 새 기록을 받지 못하면 경고 대신 확인되지 않은 항목(다른 수집기처럼 확인할 수 없는 것을 정상·해소로 보지 않는다)
    cronBody={...cronOk,last_status:"error",last_error:"recurring:db_503"};
    await ask(t0+2*H);
    r=await summary(r4Env,t0+2*H+129*M);
    want(r.cron?.status==="error"&&cronAlerts(r).length===1,"R-4: 130분 안의 기록은 그대로 판정한다");
    r=await summary(r4Env,t0+2*H+131*M);
    want(r.cron?.status==="stale"&&!cronAlerts(r).length&&isDeepStrictEqual(cronUnknown(r),["앱 예약 실행 기록 확인 지연(stale)"]),`R-4: 130분 넘게 새 기록이 없으면 경고 대신 확인되지 않은 항목이다: ${r.cron?.status} · ${cronUnknown(r).join(",")}`);
    // 5) 앱이 기록을 읽지 못함(cron.ok false)·계약 밖 값: 마지막 자료와 성공 시각은 지키고 상태·코드만 적는다
    const kept=setting("cron");
    cronBody={ok:false,error_code:"db_503"};
    await ask(t0+3*H);
    let row=setting("cron");
    want(row?.status==="error"&&row.error_code==="db_503"&&row.last_attempt_at===at(t0+3*H)&&row.last_success_at===kept?.last_success_at&&isDeepStrictEqual(row.data,kept?.data),`R-4: 앱이 기록을 읽지 못하면 마지막 자료·성공 시각을 지키고 상태·코드만 적는다: ${JSON.stringify(row)}`);
    r=await summary(r4Env,t0+3*H+M);
    want(r.cron?.status==="error"&&r.cron?.error_code==="db_503"&&cronAlerts(r).length===1,`R-4: 마지막 성공이 130분 안이면 그 자료로 판정하고 최근 확인 실패 코드를 함께 보인다: ${JSON.stringify(r.cron)}`);
    r=await summary(r4Env,t0+4*H+11*M);
    want(r.cron?.status==="stale"&&isDeepStrictEqual(cronUnknown(r),["앱 예약 실행 기록 확인 지연(db_503)"]),`R-4: 그 뒤 130분 넘게 성공이 없으면 앱이 보낸 코드가 확인되지 않은 항목에 보인다: ${cronUnknown(r).join(",")}`);
    for(const [label,body] of [["모르는 결과",{...cronOk,last_status:"weird"}],["시각 꼴이 아님",{...cronOk,last_run_at:"어제"}],["객체가 아님","ok"],["코드 꼴이 아님",{ok:false,error_code:"Bad Code!"}]]) {
      cronBody=body;
      await ask(t0+5*H);
      row=setting("cron");
      want(row?.status==="error"&&row.error_code==="invalid_reply"&&isDeepStrictEqual(row.data,kept?.data),`R-4 ${label}: invalid_reply 로 적고 마지막 자료는 지킨다: ${JSON.stringify(row)}`);
    }
    cronBody={...cronOk,last_error:"<script>",version:"v1 bad",rev:-1};
    await ask(t0+5*H+M);
    row=setting("cron");
    want(row?.status==="ok"&&row.data?.last_error===null&&row.data?.version===null&&row.data?.rev===null&&row.data?.last_status==="ok","R-4: 덧붙은 칸(오류 코드·판·rev)이 꼴에 맞지 않으면 그 칸만 버린다");
    // 6) 이용 현황이 503(rpc_missing)이어도 답에 붙은 기록은 따로 적고, 401 은 본문을 읽지 않는다
    appHttp=503; cronBody=cronOk;
    await ask(t0+6*H);
    want(setting("usage")?.error_code==="rpc_missing"&&setting("cron")?.status==="ok"&&setting("cron")?.last_success_at===at(t0+6*H),"R-4: 이용 현황이 503(rpc_missing)이어도 답에 붙은 예약 실행 기록은 따로 적는다");
    appHttp=401; cronBody={...cronOk,last_status:"error"};
    await ask(t0+7*H);
    want(setting("usage")?.error_code==="unauthorized"&&setting("cron")?.last_attempt_at===at(t0+6*H)&&setting("cron")?.data?.last_status==="ok","R-4: 401 답은 본문을 읽지 않아 예약 실행 기록을 바꾸지 않는다");
    appHttp=200;
    // 7) 5분 예약 실행 경로: 알림 판정은 이용 현황 수집보다 먼저 돈다. 같은 경고는 24시간에 한 번, 정상 3번(10분 이상)이면 해소(주의라 해소 메일 없음)
    const alertEnv4={...r4Env,ALERT_WEBHOOK_URL:"https://hooks.example/cron"};
    const pending4=[];
    const tick=async t=>{await worker.scheduled({scheduledTime:t},alertEnv4,{waitUntil:p=>pending4.push(p)});await Promise.all(pending4.splice(0));};
    const mark=hooks.length;
    const sentTexts=()=>hooks.slice(mark).map(h=>String(h.text));
    const a0=t0+10*H;
    cronBody={...cronOk,last_run_at:at(a0-50*M),last_status:"error",last_error:"recurring:db_503"};
    r4.store.prepare("DELETE FROM settings WHERE key='usage'").run();
    await tick(a0);
    want(appCalls.at(-1)?.cron==="1"&&setting("cron")?.data?.last_status==="error"&&setting("cron")?.last_attempt_at===at(a0),"R-4: 5분 예약 실행이 이용 현황 요청으로 예약 실행 기록을 받아 적는다");
    want(sentTexts().length===0,"R-4: 이번 실행의 알림 판정은 새 기록을 받기 전에 돌았다(다음 5분 실행에서 판정)");
    await tick(a0+5*M);
    want(sentTexts().length===1&&sentTexts()[0].includes("앱 예약 실행 실패")&&sentTexts()[0].includes("recurring:db_503"),`R-4: 다음 5분 실행에서 실패 경고를 보낸다: ${sentTexts().join(" | ").slice(0,160)}`);
    for(const offset of [10*M,15*M,60*M]) await tick(a0+offset);
    want(sentTexts().length===1,"R-4: 같은 실패 경고는 바로 다시 보내지 않는다");
    await tick(a0+23*H);
    await tick(a0+23*H+5*M);
    want(sentTexts().length===1,"R-4: 실패가 이어져도 24시간 안에는 다시 보내지 않는다");
    await tick(a0+24*H+10*M);
    want(sentTexts().length===2&&sentTexts()[1].includes("앱 예약 실행 실패"),"R-4: 24시간이 지나도 실패가 이어지면 하루에 한 번 다시 보낸다");
    cronBody={...cronOk,last_run_at:at(a0+24*H-50*M)};
    r4.store.prepare("DELETE FROM settings WHERE key='usage'").run();
    await tick(a0+24*H+15*M);
    for(const offset of [20,25,30]) await tick(a0+24*H+offset*M);
    const failRecord=r4.store.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().map(x=>JSON.parse(x.value)).find(x=>x.title==="앱 예약 실행 실패");
    want(failRecord?.resolved_at===at(a0+24*H+30*M)&&sentTexts().length===2,`R-4: 정상 기록이 5분 판정 3번(10분 이상) 이어지면 해소로 적고, 주의라 해소 메일은 보내지 않는다: ${JSON.stringify(failRecord)}`);
    // 8) 화면·판
    let html=renderDash(await summary(r4Env,a0+24*H+31*M));
    want(html.includes('앱 예약 실행 <span class="badge normal">정상</span>')&&html.includes("마지막 실행")&&html.includes("V22.9.94-REVIEW-FIXES")&&html.includes("rev 4"),"R-4 화면: 정상이면 마지막 실행 시각·판·rev 와 '정상'을 보인다");
    cronBody={...cronOk,last_run_at:at(t0+40*H-50*M),last_status:"error",last_error:"recurring:db_503"};
    await ask(t0+40*H);
    html=renderDash(await summary(r4Env,t0+40*H+M));
    want(html.includes('앱 예약 실행 <span class="badge warning">실패</span>')&&html.includes("recurring:db_503"),"R-4 화면: 실패면 '실패'와 오류 코드를 보인다");
    html=renderDash(await summary(r4Env,t0+40*H+131*M));
    want(html.includes('앱 예약 실행 <span class="badge unknown">확인 지연</span>'),"R-4 화면: 130분 넘게 새 기록이 없으면 '확인 지연'");
    cronBody={...cronOk,last_run_at:at(t0+41*H-27*H)};
    await ask(t0+41*H);
    html=renderDash(await summary(r4Env,t0+41*H+M));
    want(html.includes('앱 예약 실행 <span class="badge warning">누락</span>'),"R-4 화면: 26시간 넘게 실행이 없으면 '누락'");
    const blank=freshDb();
    const blankView=await summary({...r4Env,MONITOR_DB:blank.db},t0);
    html=renderDash(blankView);
    want(html.includes('앱 예약 실행 <span class="badge unknown">수집 전</span>')&&blankView.cron?.status==="never","R-4 화면: 기록이 없으면 '수집 전'");
    const states=html.slice(html.indexOf("<h2>수집 연결 상태</h2>"),html.indexOf("<h2>최근 요청 표본</h2>"));
    want(states.length>0&&!states.includes("예약 실행"),"R-4 화면: 수집 연결 상태 표에는 예약 실행 줄을 더하지 않는다(수집기가 아니다)");
    blank.store.close();
    const health=await (await worker.fetch(new Request("https://monitor.example/health"),r4Env,{})).json();
    want(health.version==="1.5.0",`관제 판은 1.5.0 이다: ${health.version}`);
    r4.store.close();
    assert.equal(misses.length,0,`V22.9.94 관제(C-6·R-4) 검사 실패 ${misses.length}건:\n- ${misses.join("\n- ")}`);
  }
  console.log(`PASS: monitor D1 integration (${checks} checks)`);
} finally {globalThis.fetch=originalFetch;globalThis.Date=RealDate;sqlite.close();}
