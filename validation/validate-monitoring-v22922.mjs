import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import app from "../src/index.js";
import monitor, { collectCloudflare } from "../monitoring/worker.mjs";
import { dashboardHtml } from "../monitoring/dashboard.mjs";
import { quotaStatus, monthlyForecast, daysToLimit, freshState, cpuPercent, parseDatabaseMetrics, workersCost, percentile, sanitizeTelemetry } from "../monitoring/model.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const ok=(v,message)=>{assert.ok(v,message);checks++;};
for(const [value,status] of [[0,"normal"],[69999,"normal"],[70000,"warning"],[84999,"warning"],[85000,"upgrade"],[94999,"upgrade"],[95000,"critical"],[100000,"critical"]]) eq(quotaStatus(value,100000).status,status,`quota boundary ${value}`);
eq(quotaStatus(null,100000).status,"unknown","missing usage is unknown");
eq(quotaStatus(0,null).status,"unknown","missing limit is unknown");
eq(quotaStatus(0,100000,{fresh:false}).status,"unknown","stale usage is unknown");
eq(quotaStatus(2000,100000,{forecast:120000}).status,"upgrade","projected overage triggers review");
eq(monthlyForecast(500,"2026-10-01T00:00:00Z","2026-11-01T00:00:00Z","2026-10-01T12:00:00Z"),null,"first partial day cannot support monthly forecast");
eq(monthlyForecast(500,"2026-10-01T00:00:00Z","2026-11-01T00:00:00Z","2026-10-11T00:00:00Z"),1550,"monthly forecast uses billing period");
eq(monthlyForecast(500,"2026-10-01T00:00:00Z","2026-11-01T00:00:00Z","2026-12-01T00:00:00Z"),null,"out-of-period sample rejected");
eq(daysToLimit([{at:"2026-10-01",value:10},{at:"2026-10-02",value:20},{at:"2026-10-03",value:30}],30,100),7,"database growth forecast");
eq(daysToLimit([{at:"2026-10-01",value:10}],10,100),null,"insufficient growth history rejected");
eq(cpuPercent({total:200,idle:150},{total:100,idle:100}),50,"CPU uses counter deltas");
eq(cpuPercent({total:200,idle:150},null),null,"first CPU sample unknown");
eq(cpuPercent({total:20,idle:15},{total:100,idle:100}),null,"counter reset unknown");
eq(freshState({status:"error",last_success_at:new Date().toISOString()},60000).fresh,false,"failed collection cannot use past success as current normal");
eq(freshState({status:"ok",last_success_at:"2020-01-01"},60000).status,"stale","old source explicitly stale");
eq(percentile(Array(29).fill(1)),null,"latency needs sufficient random sample");
eq(percentile(Array.from({length:100},(_,i)=>i+1)),95,"latency percentile");
eq(workersCost(10000000,null),{minimum_usd:5,total_usd:null,complete:false},"missing CPU cannot produce complete cost");
ok(Math.abs(workersCost(11000000,31000000).total_usd-5.32)<0.000001,"request and CPU overage cost");

const raw='pg_database_size_mb{datname="postgres"} 123\npg_database_size_mb{datname="private_db"} 999\nnode_cpu_seconds_total{cpu="0",mode="idle"} 100\nnode_cpu_seconds_total{cpu="0",mode="user"} 20\nprivate_email_metric{email="secret@example.com"} 1\npg_stat_database_numbackends{datname="postgres"} 4';
const parsed=parseDatabaseMetrics(raw);
eq(parsed.database_bytes,123*1024*1024,"only application database size exported");
eq(parsed.cpu_counter,{total:120,idle:100},"only CPU numeric counters exported");
ok(!JSON.stringify(parsed).includes("secret@example.com")&&!JSON.stringify(parsed).includes("private_db"),"metric labels and personal data never exported");
const safe=sanitizeTelemetry({id:"test-id-123",at:Date.now(),route:"skill",method:"POST",status:200,duration_ms:123,db_count:2,db_ms:55,db_failures:0,outcome:"ok",sample_kind:"random",utterance:"private 1234",secret:"never-store",household_id:"private-house"});
ok(!JSON.stringify(safe).includes("private")&&!JSON.stringify(safe).includes("never-store"),"telemetry allowlist drops all raw fields");
assert.throws(()=>sanitizeTelemetry({...safe,at:0}),/invalid_telemetry/);checks++;
assert.throws(()=>sanitizeTelemetry({...safe,route:"/users/private-user"}),/invalid_telemetry/);checks++;

const unauth=await monitor.fetch(new Request("https://monitor.example/api/summary"),{},{});
eq(unauth.status,401,"monitor summary requires authentication");
const health=await monitor.fetch(new Request("https://monitor.example/health"),{},{});
eq(health.status,200,"public health contains no private metrics");
eq((await health.json()).storage_configured,false,"public health does not imply a working collector");
const badToken=await monitor.fetch(new Request("https://monitor.example/api/summary",{headers:{authorization:"Bearer wrong"}}),{OPS_MONITOR_TOKEN:"different"},{});
eq(badToken.status,401,"wrong collector token rejected");
const missingDb=await monitor.fetch(new Request("https://monitor.example/api/summary",{headers:{authorization:"Bearer unit-secret"}}),{OPS_MONITOR_TOKEN:"unit-secret"},{});
eq(missingDb.status,503,"missing monitoring storage not normal");
const invalid=await monitor.fetch(new Request("https://monitor.example/internal/telemetry",{method:"POST",headers:{authorization:"Bearer unit-secret"},body:JSON.stringify({...safe,route:"raw-user-id"})}),{OPS_MONITOR_TOKEN:"unit-secret",MONITOR_DB:{}},{});
eq(invalid.status,400,"invalid private route rejected before storage");

const html=dashboardHtml("/ops-monitor");
ok(html.includes("확인 불가")&&html.includes("별도 관제 열기"),"dashboard displays unknown and separate monitor entry");
ok(html.includes("공식 청구 화면")&&html.includes("청구 기간"),"manual billing records disclose source and scope");
ok(html.includes("관리자 전용")&&html.includes("거래 원문과 개인정보"),"dashboard privacy and role boundary explained");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
let scriptRan=false;
const uiContext={document:{hidden:true,addEventListener(){},getElementById:()=>({addEventListener(){scriptRan=true;}})},setInterval(){},console,AbortSignal,Intl,fetch(){throw Error("not expected while hidden");}};
runInNewContext(script,uiContext);
ok(scriptRan,"actual generated dashboard JavaScript parses and binds controls");
const unknownCard=runInNewContext("quotaCard({unit:'bytes',value:null,limit:1000000,ratio:null,status:'unknown',name:'test',scope:'test',source:'test'})",uiContext);
const unknownCardText=unknownCard.replace(/<[^>]*>/g,'');
ok(unknownCardText.includes('사용률 확인 불가')&&!unknownCardText.includes('0%'),"unknown usage text is never rendered as zero percent");

const random=Math.random;
for(const mode of ["works","fails","waitUntilThrows"]) {
  const fixture=await createV2265QaFixture();
  const jobs=[];
  const events=[];
  try {
    Math.random=()=>0;
    fixture.env.OPS_MONITOR_TOKEN="fixture-monitor-secret";
    fixture.env.OPS_MONITOR={async fetch(input,init){events.push(JSON.parse(init.body));if(mode==="fails")throw Error("synthetic monitor outage");return new Response('{"ok":true}',{status:202});}};
    const context={waitUntil(job){jobs.push(job);if(mode==="waitUntilThrows")throw Error("synthetic invalid context");}};
    const before=fixture.db.transactions.length;
    const requests=["/my/analysis?month=2026-07&household_id=house-home","/app?month=2026-07&household_id=house-home"];
    const responses=await Promise.all(requests.map(path=>app.fetch(new Request("https://malhaebook.com"+path,{headers:{cookie:fixture.cookie}}),fixture.env,context)));
    eq(responses.map(r=>r.status),[200,200],`monitor ${mode} does not alter web responses`);
    await Promise.all(jobs);
    eq(events.length,2,`monitor ${mode} emits one sample per request`);
    ok(events.every(e=>e.db_count>0&&e.route==="web"),`request DB counts recorded ${mode}`);
    ok(events.every(e=>!JSON.stringify(e).includes("house-home")&&!JSON.stringify(e).includes("fixture-monitor-secret")),`no secrets or household IDs ${mode}`);
    ok(!fixture.env.__AB_MONITOR_REQUEST,`shared environment never receives request context ${mode}`);
    eq(fixture.db.transactions.length,before,`read-only monitoring changes no transactions ${mode}`);
    const unauthorized=await app.fetch(new Request("https://malhaebook.com/ops-monitor/api/summary"),fixture.env,context);
    eq(unauthorized.status,401,"ordinary browser cannot read monitor data");
    const probe=await app.fetch(new Request("https://malhaebook.com/internal/ops-metrics",{headers:{authorization:`Bearer ${fixture.env.ADMIN_API_TOKEN}`}}),fixture.env,context);
    eq(probe.status,401,"admin API token cannot substitute for internal collector token");
  } finally {Math.random=random;fixture.restore();}
}
const source=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const originalFetch=globalThis.fetch;
const probeEnv={OPS_MONITOR_TOKEN:"probe-test",SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"fixture-only"};
try {
  globalThis.fetch=async(url,init)=>{
    eq(url,"https://fixture.supabase.co/customer/v1/privileged/metrics","only fixed provider metrics endpoint queried");
    ok(init.headers.authorization.startsWith("Basic "),"metrics credential uses provider-supported Basic auth");
    return new Response(raw);
  };
  const probe=await app.fetch(new Request("https://malhaebook.com/internal/ops-metrics",{headers:{authorization:"Bearer probe-test"}}),probeEnv,{});
  eq(probe.status,200,"authenticated application metrics probe succeeds without application DB writes");
  const data=await probe.json();
  eq(data.metrics,parsed,"real application probe and monitor parser agree");
  ok(!JSON.stringify(data).includes("fixture-only")&&!JSON.stringify(data).includes("secret@example.com"),"probe strips credentials and raw labels");
  globalThis.fetch=async()=>new Response('private provider error text',{status:503});
  const failed=await app.fetch(new Request("https://malhaebook.com/internal/ops-metrics",{headers:{authorization:"Bearer probe-test"}}),probeEnv,{});
  eq(failed.status,503,"provider error is reported as failed collection");
  ok(!(await failed.text()).includes('private provider'),"provider error body is never exposed");
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    calls++;
    if(JSON.parse(init.body).query.includes('cpuTimeUs')) return new Response(JSON.stringify({errors:[{message:'Unknown field cpuTimeUs'}]}));
    const groups=[{sum:{requests:12,errors:1,subrequests:3},dimensions:{status:'success'}}];
    return new Response(JSON.stringify({data:{viewer:{accounts:[{today:groups,hour:groups,app:groups}]}}}));
  };
  const cf=await collectCloudflare({CF_ANALYTICS_TOKEN:'test-only',CF_ACCOUNT_ID:'fixture',APP_WORKER_NAME:'fixture'},new Date('2026-10-01T12:00:00Z'));
  eq(calls,2,"unsupported CPU field retries with documented basic metrics");
  eq(cf.app.cpu_ms,null,"missing CPU aggregate remains unknown");
  eq(cf.today.requests,12,"provider sampling is not extrapolated twice");
  globalThis.fetch=async()=>new Response(JSON.stringify({data:{viewer:{accounts:[{today:[{sum:{requests:120,errors:0,subrequests:2}}],hour:[{sum:{requests:20,errors:0,subrequests:1}}],app:[]}]}}}));
  const emptyApp=await collectCloudflare({CF_ANALYTICS_TOKEN:'test-only',CF_ACCOUNT_ID:'fixture',APP_WORKER_NAME:'fixture'},new Date('2026-10-01T12:00:00Z'));
  eq(emptyApp.today.requests,120,"empty app results do not discard account usage");
  eq(emptyApp.app.requests,null,"empty app results remain unobserved instead of zero normal");
  globalThis.fetch=async()=>{
    const groups=[{sum:{requests:3,errors:3,subrequests:0},dimensions:{status:'exceededResources'}}];
    return new Response(JSON.stringify({data:{viewer:{accounts:[{today:groups,hour:groups,app:groups}]}}}));
  };
  const limited=await collectCloudflare({CF_ANALYTICS_TOKEN:'test-only',CF_ACCOUNT_ID:'fixture',APP_WORKER_NAME:'fixture'},new Date('2026-10-01T12:00:00Z'));
  eq(limited.app.resource_limit_errors,3,"documented generic resource limits are counted");
  eq(limited.app.cpu_limit_errors,0,"generic resource limits are not mislabeled as CPU-only");
} finally {globalThis.fetch=originalFetch;}
ok(source.includes('"/internal/ops-metrics"')&&source.includes('"/ops-monitor"'),"monitor routes present");
ok(source.includes("ctx.waitUntil(persistence)")&&source.includes("No original URL, IDs"),"nonblocking privacy boundary present");
console.log(`PASS: monitoring reliability (${checks} checks)`);
