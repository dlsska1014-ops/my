import { MONITOR_VERSION, PRICING_VERIFIED_AT, DAY, numberOrNull, quotaStatus, monthlyForecast, daysToLimit, freshState, cpuPercent, percentile, sanitizeTelemetry } from "./model.mjs";
import { dashboardHtml } from "./dashboard.mjs";

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
const json = (data,status=200) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, "content-type": "application/json; charset=utf-8" } });
const html = body => new Response(body, { headers: { ...HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" } });

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
}
async function equal(a,b) {
  const [x,y] = await Promise.all([digest(String(a)),digest(String(b))]);
  let diff = 0;
  for(let i=0;i<x.length;i++) diff |= x[i]^y[i];
  return diff === 0;
}
export async function bearerAllowed(request,env) {
  return Boolean(env.OPS_MONITOR_TOKEN) && equal(request.headers.get("authorization") || "",`Bearer ${env.OPS_MONITOR_TOKEN}`);
}
async function sign(data,secret) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data)))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function cookieAllowed(request,env) {
  if (!env.OPS_MONITOR_TOKEN) return false;
  const raw=(request.headers.get("cookie")||"").match(/(?:^|;\s*)__Host-ab_monitor=([^;]+)/)?.[1] || "";
  const [data,sig]=raw.split(".");
  const exp=Number(data?.split("-")[0]);
  if (!sig || !Number.isFinite(exp) || exp<Date.now() || exp>Date.now()+8*DAY || raw.length>220) return false;
  return equal(sig,await sign(data,env.OPS_MONITOR_TOKEN));
}
async function readBounded(response,max=262144) {
  const reader=response.body?.getReader();
  if(!reader) return "";
  const chunks=[];
  let bytes=0;
  try {
    while(true) {
      const part=await reader.read();
      if(part.done) break;
      bytes+=part.value.byteLength;
      if(bytes>max) throw new Error("payload_too_large");
      chunks.push(part.value);
    }
  } catch(e) { await reader.cancel().catch(()=>{}); throw e; }
  const all=new Uint8Array(bytes);
  let offset=0;
  for(const part of chunks){all.set(part,offset);offset+=part.length;}
  return new TextDecoder().decode(all);
}
async function requestJson(request,max=16384) { return JSON.parse(await readBounded(request,max)); }
const failureCode = error => /not_connected|unauthorized|forbidden|timeout|payload_too_large|invalid_|truncated|graphql|unsupported|empty|delivery_failed|metrics_unavailable|http_\d+/.exec(String(error?.message||error))?.[0] || "collection_failed";

async function writeCollector(env,name,task,now) {
  const at=now.toISOString();
  try {
    const value=await task();
    const encoded=JSON.stringify(value);
    const bucket=new Date(Math.floor(now.getTime()/300000)*300000).toISOString();
    await env.MONITOR_DB.batch([
      env.MONITOR_DB.prepare("INSERT INTO collector_state(name,last_attempt_at,last_success_at,status,error_code,payload) VALUES(?,?,?,'ok',NULL,?) ON CONFLICT(name) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,status='ok',error_code=NULL,payload=excluded.payload").bind(name,at,at,encoded),
      env.MONITOR_DB.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,?) ON CONFLICT(source,bucket) DO UPDATE SET collected_at=excluded.collected_at,payload=excluded.payload").bind(name,bucket,at,encoded)
    ]);
  } catch(error) {
    const code=failureCode(error);
    await env.MONITOR_DB.prepare("INSERT INTO collector_state(name,last_attempt_at,status,error_code) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,status=excluded.status,error_code=excluded.error_code").bind(name,at,code==="not_connected"?"not_connected":"error",code).run();
  }
}

async function fetchJson(url,init={}) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error(`http_${response.status}`);
  return JSON.parse(await readBounded(response));
}

export async function collectCloudflare(env,now) {
  if(!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) throw new Error("not_connected");
  const until=new Date(now.getTime()-5*60000);
  const start=new Date(until);start.setUTCHours(0,0,0,0);
  const account=JSON.stringify(env.CF_ACCOUNT_ID);
  const queryRange=(alias,from,to,script="")=>`${alias}: workersInvocationsAdaptive(limit:100,filter:{datetime_geq:${JSON.stringify(from.toISOString())},datetime_lt:${JSON.stringify(to.toISOString())}${script?`,scriptName:${JSON.stringify(script)}`:""}}){sum{requests errors subrequests cpuTimeUs} dimensions{status}}`;
  const query=`query{viewer{accounts(filter:{accountTag:${account}}){${queryRange("today",start,until)} ${queryRange("hour",new Date(until.getTime()-3600000),until)} ${queryRange("app",start,until,env.APP_WORKER_NAME)}}}}`;
  const send=q=>fetchJson("https://api.cloudflare.com/client/v4/graphql",{method:"POST",headers:{authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({query:q})});
  let body=await send(query);
  if(body.errors?.some(e=>String(e.message||"").includes("cpuTimeUs"))) body=await send(query.replaceAll(" cpuTimeUs",""));
  if(body.errors?.length) throw new Error("graphql_error");
  const data=body.data?.viewer?.accounts?.[0];
  if(!data) throw new Error("empty_result");
  const totals=rows=>{
    if(!Array.isArray(rows)) throw new Error("unsupported_fields");
    if(rows.length>=100) throw new Error("truncated_result");
    if(!rows.length) return {requests:null,errors:null,subrequests:null,cpu_ms:null,cpu_limit_errors:null,resource_limit_errors:null,observed:false};
    const result=rows.reduce((out,row)=>{
      for(const key of ["requests","errors","subrequests"]){const value=numberOrNull(row.sum?.[key]);if(value===null)throw new Error("unsupported_fields");out[key]+=value;}
      return out;
    },{requests:0,errors:0,subrequests:0});
    result.cpu_ms=rows.every(row=>numberOrNull(row.sum?.cpuTimeUs)!==null)?rows.reduce((n,row)=>n+row.sum.cpuTimeUs,0)/1000:null;
    result.cpu_limit_errors=rows.filter(row=>row.dimensions?.status==="exceededCpu").reduce((n,row)=>n+row.sum.requests,0);
    result.resource_limit_errors=rows.filter(row=>row.dimensions?.status==="exceededResources").reduce((n,row)=>n+row.sum.requests,0);
    result.observed=true;
    return result;
  };
  return { today:totals(data.today),hour:totals(data.hour),app:totals(data.app),period_start:start.toISOString(),period_end:until.toISOString(),scope:"account",includes_monitor:true,sampled:true };
}

async function collectD1(env,now) {
  if(!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) throw new Error("not_connected");
  const day=JSON.stringify(now.toISOString().slice(0,10));
  const query=`query{viewer{accounts(filter:{accountTag:${JSON.stringify(env.CF_ACCOUNT_ID)}}){usage:d1AnalyticsAdaptiveGroups(limit:1,filter:{date_geq:${day},date_leq:${day}}){sum{rowsRead rowsWritten}} storage:d1StorageAdaptiveGroups(limit:100,filter:{date_geq:${day},date_leq:${day}}){dimensions{databaseId} max{databaseSizeBytes}}}}}`;
  const body=await fetchJson("https://api.cloudflare.com/client/v4/graphql",{method:"POST",headers:{authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({query})});
  if(body.errors?.length) throw new Error("graphql_error");
  const data=body.data?.viewer?.accounts?.[0];
  if(!data||!Array.isArray(data.usage)||!Array.isArray(data.storage)||!data.usage.length||!data.storage.length) throw new Error("empty_result");
  if(data.storage.length>=100) throw new Error("truncated_result");
  const rowsRead=data.usage.length?numberOrNull(data.usage[0].sum?.rowsRead):0;
  const rowsWritten=data.usage.length?numberOrNull(data.usage[0].sum?.rowsWritten):0;
  if(rowsRead===null||rowsWritten===null) throw new Error("unsupported_fields");
  const sizes=data.storage.map(row=>numberOrNull(row.max?.databaseSizeBytes));
  if(sizes.some(size=>size===null)) throw new Error("unsupported_fields");
  return {rows_read:rowsRead,rows_written:rowsWritten,storage_bytes:sizes.reduce((a,b)=>a+b,0),day:now.toISOString().slice(0,10),scope:"account",storage_measure:"sum_of_daily_database_maxima",sampled:true};
}

export async function collectUptime(env,now) {
  const origin=new URL(env.APP_ORIGIN);
  if(origin.protocol!=="https:") throw new Error("invalid_origin");
  const checks=await Promise.all(["/health","/ready"].map(async path=>{
    const start=Date.now();
    try {
      const response=await fetch(origin.origin+path,{signal:AbortSignal.timeout(7000),redirect:"manual"});
      if(!response.ok) return {path,status:response.status,duration_ms:Date.now()-start,ok:false,error_code:`http_${response.status}`};
      const body=JSON.parse(await readBounded(response,32768));
      return {path,status:response.status,duration_ms:Date.now()-start,ok:response.ok&&(path==="/ready"?body.ready===true:body.alive===true),version:typeof body.version==="string"?body.version.slice(0,60):null};
    } catch(error) {return {path,status:null,duration_ms:Date.now()-start,ok:false,error_code:failureCode(error)};}
  }));
  return { checks, checked_at:now.toISOString(), same_provider:true };
}

async function collectDatabase(env) {
  if(!env.ACCOUNTBOOK || !env.OPS_MONITOR_TOKEN) throw new Error("not_connected");
  const response=await env.ACCOUNTBOOK.fetch("https://accountbook.internal/internal/ops-metrics",{headers:{authorization:`Bearer ${env.OPS_MONITOR_TOKEN}`},signal:AbortSignal.timeout(10000)});
  const text=await readBounded(response,32768);
  // 1.1.0: 앱의 503 본문에는 실제 원인(not_connected·invalid_origin·metrics_unavailable 등)이 있다. 상태 코드만 던지면 그 원인이 사라진다.
  let body=null; try { body=JSON.parse(text); } catch(_) { body=null; }
  if(!response.ok) throw new Error(body?.error_code ? `${body.error_code}` : `http_${response.status}`);
  if(!body||!body.ok) throw new Error(body?.error_code || "collection_failed");
  return body.metrics;
}

// 1.1.0: 분석 토큰의 만료일. README 4단계는 1년 만료 토큰을 권하지만 아무도 만료일을 보지 않았다.
async function collectToken(env) {
  if(!env.CF_ANALYTICS_TOKEN) throw new Error("not_connected");
  const body=await fetchJson("https://api.cloudflare.com/client/v4/user/tokens/verify",{headers:{authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`}});
  const result=body?.result;
  if(!body?.success||!result||typeof result.status!=="string") throw new Error("unsupported_fields");
  return {status:result.status,expires_on:typeof result.expires_on==="string"?result.expires_on:null};
}

async function collectSupabasePlan(env) {
  if(!env.SUPABASE_MANAGEMENT_TOKEN) throw new Error("not_connected");
  const data=await fetchJson(`https://api.supabase.com/v1/organizations/${encodeURIComponent(env.SUPABASE_ORG_ID)}`,{headers:{authorization:`Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`}});
  if(!["free","pro","team","enterprise","platform"].includes(data.plan)) throw new Error("unsupported_plan");
  return {plan:data.plan,scope:"organization"};
}

export async function collect(env,now=new Date()) {
  if(!env.MONITOR_DB) throw new Error("storage_not_connected");
  await Promise.all([
    writeCollector(env,"uptime",()=>collectUptime(env,now),now),
    writeCollector(env,"database",()=>collectDatabase(env),now),
    writeCollector(env,"cloudflare",()=>collectCloudflare(env,now),now),
    writeCollector(env,"d1",()=>collectD1(env,now),now)
  ]);
  if(now.getUTCMinutes()<5) await writeCollector(env,"supabase_plan",()=>collectSupabasePlan(env),now);
  if(now.getUTCMinutes()<5) await writeCollector(env,"token",()=>collectToken(env),now);
  // Indexed bounded deletion: retention 30 days for aggregates, 7 days for diagnostic samples.
  if(now.getUTCMinutes()<5) await env.MONITOR_DB.batch([
    env.MONITOR_DB.prepare("DELETE FROM telemetry WHERE id IN (SELECT id FROM telemetry WHERE at < ? ORDER BY at LIMIT 1000)").bind(now.getTime()-7*DAY),
    env.MONITOR_DB.prepare("DELETE FROM settings WHERE key LIKE 'ticket:%' AND CAST(value AS INTEGER) < ?").bind(now.getTime())
  ]);
  if(now.getUTCHours()===0&&now.getUTCMinutes()<5) await env.MONITOR_DB.prepare("DELETE FROM samples WHERE (source,bucket) IN (SELECT source,bucket FROM samples WHERE bucket < ? LIMIT 2000)").bind(new Date(now.getTime()-30*DAY).toISOString()).run();
}

export async function summary(env,now=Date.now()) {
  const rows=(await env.MONITOR_DB.prepare("SELECT * FROM collector_state").all()).results;
  const settings=(await env.MONITOR_DB.prepare("SELECT * FROM settings WHERE key='plans'").all()).results;
  const plans=settings[0]?JSON.parse(settings[0].value):{cloudflare:env.CF_PLAN||"unknown",supabase:env.SUPABASE_PLAN||"unknown",verified_at:env.PLAN_VERIFIED_AT||null};
  const states=Object.fromEntries(rows.map(row=>[row.name,{...freshState(row,row.name==="supabase_plan"?2*3600000:20*60000,now),data:row.payload?JSON.parse(row.payload):null}]));
  for(const name of ["cloudflare","database","uptime","supabase_plan","d1"]) if(!states[name]) states[name]={...freshState(null,0,now),data:null};
  const planFresh=Number.isFinite(Date.parse(plans.verified_at))&&now-Date.parse(plans.verified_at)>=-60000&&now-Date.parse(plans.verified_at)<7*DAY;
  // 1.1.0: 확인 기록이 7일을 넘어도 마지막으로 확인한 요금제의 한도는 계속 비교한다. 예전에는 8일째부터 모든 한도가
  // null 이 되어 한도 경고가 전부 꺼졌다(2026-10-08 부터 운영이 그 상태였다). 대신 "재확인 필요"를 참고와 주의로 알린다.
  const planStale=!planFresh&&(plans.cloudflare!=="unknown"||plans.supabase!=="unknown");
  const cfPlan=plans.cloudflare||"unknown";
  const sbPlan=states.supabase_plan.fresh?states.supabase_plan.data.plan:(plans.supabase||"unknown");
  const quotas=[];
  const cf=states.cloudflare;
  const cfFresh=cf.fresh&&cf.data?.period_start?.slice(0,10)===new Date(now).toISOString().slice(0,10);
  const end=Date.parse(cf.data?.period_end||"");
  const reset=new Date(end);reset.setUTCHours(24,0,0,0);
  const forecast=cfFresh&&numberOrNull(cf.data?.today.requests)!==null&&numberOrNull(cf.data?.hour.requests)!==null?cf.data.today.requests+cf.data.hour.requests*Math.max(0,reset.getTime()-end)/3600000:null;
  quotas.push({key:"worker_requests",name:"Workers 일간 요청",unit:"requests",scope:"Cloudflare 계정 전체 · 관제 포함",source:"Cloudflare GraphQL",value:cfFresh?cf.data?.today.requests:null,limit:cfPlan==="free"?100000:null,plan:cfPlan,forecast,period_start:cf.data?.period_start,period_end:cf.data?.period_end,reset_at:Number.isFinite(reset.getTime())?reset.toISOString():null,...quotaStatus(cf.data?.today.requests,cfPlan==="free"?100000:null,{fresh:cfFresh,forecast})});
  const db=states.database;
  const previous=(await env.MONITOR_DB.prepare("SELECT collected_at,payload FROM samples WHERE source='database' AND collected_at < ? ORDER BY bucket DESC LIMIT 1").bind(db.last_success_at||"").first());
  const cpu=db.fresh?cpuPercent(db.data?.cpu_counter,previous?JSON.parse(previous.payload).cpu_counter:null):null;
  const history=(await env.MONITOR_DB.prepare("SELECT collected_at,payload FROM samples WHERE source='database' AND bucket >= ? ORDER BY bucket LIMIT 3000").bind(new Date(now-7*DAY).toISOString()).all()).results;
  const dbCap=sbPlan==="free"?500*1024*1024:sbPlan==="pro"?8*1024*1024*1024:null;
  const days=daysToLimit(history.map(row=>({at:row.collected_at,value:JSON.parse(row.payload).database_bytes})),db.data?.database_bytes,dbCap);
  // Pro disk allowance differs from logical database size; no incorrect cross-comparison.
  const dbLimit=sbPlan==="free"?dbCap:null;
  const dbQuota=quotaStatus(db.data?.database_bytes,dbLimit,{fresh:db.fresh});
  if(dbQuota.status==="normal"&&days!==null&&days<=7) dbQuota.status="upgrade";
  quotas.push({key:"database_size",name:"DB 논리 용량",unit:"bytes",scope:"Supabase 프로젝트",source:"Supabase Metrics",value:db.fresh?numberOrNull(db.data?.database_bytes):null,limit:dbLimit,plan:sbPlan,days_to_limit:sbPlan==="free"?days:null,...dbQuota});
  const d1=states.d1;
  const d1Fresh=d1.fresh&&d1.data?.day===new Date(now).toISOString().slice(0,10);
  for(const [key,name,field,limit,unit] of [["d1_reads","관제 저장소 포함 D1 읽기","rows_read",5000000,"rows"],["d1_writes","관제 저장소 포함 D1 쓰기","rows_written",100000,"rows"],["d1_storage","D1 저장 용량 · 일간 최대 합계","storage_bytes",5*1024**3,"bytes"]]) {
    const cap=cfPlan==="free"?limit:null;
    quotas.push({key,name,unit,scope:"Cloudflare 계정 전체",source:"Cloudflare D1 GraphQL",value:d1Fresh?d1.data?.[field]:null,limit:cap,...quotaStatus(d1.data?.[field],cap,{fresh:d1Fresh})});
  }
  const manual=(await env.MONITOR_DB.prepare("SELECT * FROM manual_usage ORDER BY key").all()).results;
  for(const [key,name,freeCap,paidCap] of [["egress","Supabase 전송량",5*1024**3,250*1024**3],["cached_egress","Supabase 캐시 전송량",5*1024**3,250*1024**3],["storage","Supabase 파일 저장 용량",1024**3,100*1024**3]]) {
    const row=manual.find(r=>r.key===key);
    const fresh=Boolean(row)&&now-Date.parse(row.verified_at)<DAY&&now>=Date.parse(row.period_start)&&now<Date.parse(row.period_end);
    const limit=sbPlan==="free"?freeCap:sbPlan==="pro"?paidCap:null;
    const predicted=key==="storage"?null:row?monthlyForecast(row.value,row.period_start,row.period_end,row.verified_at):null;
    quotas.push({key,name,unit:"bytes",scope:"Supabase 조직 전체",source:"공식 청구 화면 · 수동 확인",value:fresh?row.value:null,last_verified_at:row?.verified_at||null,limit,forecast:predicted,period_start:row?.period_start,period_end:row?.period_end,...quotaStatus(row?.value,limit,{fresh,forecast:predicted})});
  }
  const events=(await env.MONITOR_DB.prepare("SELECT route,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,at FROM telemetry WHERE at >= ? ORDER BY at DESC LIMIT 1000").bind(now-DAY).all()).results;
  const random=events.filter(e=>e.sample_kind==="random");
  const skillRandom=random.filter(e=>e.route==="skill");
  const incidents=events.filter(e=>e.sample_kind==="incident"||e.status>=500||e.outcome==="error"||e.db_failures>0);
  const lastObserved=events.length?Math.max(...events.map(e=>e.at)):null;
  const telemetryStatus=lastObserved===null?"not_connected":now-lastObserved>3600000?"stale":"ok";
  const alerts=quotas.filter(q=>["warning","upgrade","critical"].includes(q.status)).map(q=>({status:q.status,title:q.name,message:q.status==="upgrade"?"증가 추세와 한도를 확인하고 해당 서비스의 요금제 전환을 검토하세요.":q.status==="critical"?"한도에 근접했습니다. 요청 제한과 용량 확보를 함께 검토하세요.":"사용량 증가 추세를 확인하세요."}));
  if(cf.fresh&&cf.data.hour.requests>=100&&cf.data.hour.errors/cf.data.hour.requests>=0.01) alerts.push({status:cf.data.hour.errors/cf.data.hour.requests>=0.05?"critical":"warning",title:"Workers 런타임 오류 증가",message:"최근 1시간의 계정 전체 런타임 오류입니다. 앱이 반환한 HTTP 오류 및 카카오 처리 실패와 별도로 확인하세요."});
  // 1.1.0: 계정 전체 요청 100건 미만이면 오류율 경고가 영영 꺼져 있었다. 앱 Worker 의 오늘 런타임 오류는 건수로 본다.
  if(cfFresh&&numberOrNull(cf.data.app?.errors)!==null&&cf.data.app.errors>=3) alerts.push({status:cf.data.app.errors>=20?"critical":"warning",title:"앱 Worker 런타임 오류(오늘)",message:`오늘 앱 Worker 런타임 오류가 ${cf.data.app.errors}건입니다. Workers Logs 와 /ops-events 에서 원인을 확인하세요.`});
  if(cf.fresh&&cf.data.app.cpu_limit_errors>0) alerts.push({status:"upgrade",title:"앱 Worker의 CPU 제한 초과",message:"CPU 한도와 코드 처리량을 확인하세요. 유료 전환 또는 처리량 축소가 필요한 근거입니다."});
  if(cf.fresh&&cf.data.app.resource_limit_errors>0) alerts.push({status:"upgrade",title:"앱 Worker의 리소스 제한 초과",message:"CPU·시작 시간·무료 한도 등 리소스 제한이 관측됐습니다. 제한 종류와 코드 처리량을 확인한 뒤 요금제 전환을 검토하세요."});
  if(states.uptime.fresh&&states.uptime.data.checks.some(c=>!c.ok)) alerts.unshift({status:"critical",title:"서비스 접속 또는 DB 준비 상태 실패",message:"최근 접속 검사 결과를 확인하세요. 요금제 한도와 앱 오류를 구분해야 합니다."});
  if(cpu!==null&&cpu>=85) alerts.push({status:"warning",title:"DB CPU 사용률 상승",message:"쿼리 지연과 연결 수를 함께 확인하세요."});
  if(db.fresh&&numberOrNull(db.data?.connections)!==null&&numberOrNull(db.data?.max_connections)>0&&db.data.connections/db.data.max_connections>=0.85) alerts.push({status:"warning",title:"DB 연결 수 포화 위험",message:"연결 사용량과 쿼리 처리 시간을 확인하세요."});
  const skillP95=percentile(skillRandom.map(e=>e.duration_ms));
  if(skillP95!==null&&skillP95>=3500) alerts.push({status:"warning",title:"카카오 응답 지연",message:"표본 p95가 3.5초 이상입니다. DB 지연과 저장 오류를 확인하세요."});
  if(incidents.some(e=>e.outcome==="error"||e.status>=500||e.db_failures>0)) alerts.push({status:"warning",title:"최근 처리 실패 기록",message:"최근 24시간의 오류 표본을 확인하세요. 실패 횟수는 관제 누락 가능성이 있는 최소 관측값입니다."});
  const unknown=quotas.filter(q=>q.status==="unknown").map(q=>q.name);
  if(cpu===null) unknown.push(db.fresh&&db.data?.cpu_counter ? "DB CPU 비교 표본 부족 또는 카운터 초기화" : "DB CPU 지표 미관측 또는 갱신 지연");
  if(!db.fresh||numberOrNull(db.data?.connections)===null||!(numberOrNull(db.data?.max_connections)>0)) unknown.push("DB 연결 수 또는 최대 연결 수 미관측");
  if(!db.fresh||numberOrNull(db.data?.memory_available_bytes)===null||!(numberOrNull(db.data?.memory_total_bytes)>0)) unknown.push("DB 메모리 지표 미관측");
  if(telemetryStatus!=="ok") unknown.push("앱 요청 표본 미관측 또는 갱신 지연");
  // 1.1.0: p95 표본 부족은 낮은 트래픽에서 정상이다. "확인 불가"가 아니라 참고 사항으로 둔다(예전에는 이 둘 때문에 전체 상태가 늘 확인 불가였다).
  const notes=[];
  if(skillP95===null) notes.push("카카오 p95 표본 부족(하루 무작위 표본 30건 미만)");
  if(percentile(random.filter(e=>e.route==="web").map(e=>e.duration_ms))===null) notes.push("웹 p95 표본 부족(하루 무작위 표본 30건 미만)");
  if(planStale) { notes.push(`요금제 확인 기록이 7일을 넘었습니다(마지막 확인 ${String(plans.verified_at||"").slice(0,10)||"없음"}). 마지막 확인 요금제의 한도로 비교합니다.`); alerts.push({status:"warning",title:"요금제 확인 기록 만료",message:"공식 Billing 에서 Workers·Supabase 요금제를 다시 확인하고 관제 화면에 저장하세요. 그동안은 마지막 확인 요금제의 한도로 비교합니다."}); }
  if(!cfFresh||numberOrNull(cf.data?.app.requests)===null) unknown.push("앱 Worker 공급자 지표 미관측");
  // 1.1.0: 알림 발송·토큰 만료 상태. 두 수집기는 행이 없으면(아직 한 번도 돌지 않음) 조용히 넘기고, 있으면 다른 수집기와 같이 본다.
  const delivery=states.alerts?{status:states.alerts.status,error_code:states.alerts.error_code,last_success_at:states.alerts.last_success_at,last_attempt_at:states.alerts.last_attempt_at,data:states.alerts.data}:{status:"not_connected",error_code:null,last_success_at:null,last_attempt_at:null,data:null};
  const tokenData=states.token?.data||null;
  const tokenDaysLeft=tokenData?.expires_on&&Number.isFinite(Date.parse(tokenData.expires_on))?Math.floor((Date.parse(tokenData.expires_on)-now)/DAY):null;
  if(tokenData&&tokenData.status!=="active") alerts.push({status:"critical",title:"Cloudflare 분석 토큰 비활성",message:`토큰 상태가 ${tokenData.status}입니다. 새 토큰(Account Analytics Read)을 만들어 CF_ANALYTICS_TOKEN 을 교체하세요.`});
  else if(tokenDaysLeft!==null&&tokenDaysLeft<=30) alerts.push({status:tokenDaysLeft<=7?"critical":"warning",title:"Cloudflare 분석 토큰 만료 임박",message:`${String(tokenData.expires_on).slice(0,10)} 만료(D-${Math.max(0,tokenDaysLeft)})입니다. 새 토큰을 만들어 CF_ANALYTICS_TOKEN 을 교체하세요.`});
  const stateLabels={cloudflare:"Cloudflare 수집",database:"DB 수집",uptime:"접속 검사",supabase_plan:"요금제 자동 확인",d1:"관제 저장소 사용량 수집",token:"분석 토큰 만료 확인",alerts:"알림 발송"};
  for(const [name,state] of Object.entries(states)) if(!state.fresh&&!(name==="supabase_plan"&&sbPlan!=="unknown")&&!(name==="token"&&state.status==="stale"&&tokenData)) unknown.push(name==="alerts"&&state.error_code==="not_connected"?"알림 발송 채널 미연결(ALERT_TO 또는 ALERT_WEBHOOK_URL)":`${stateLabels[name]||name}${state.error_code?`(${state.error_code})`:""}`);
  return {version:MONITOR_VERSION,generated_at:new Date(now).toISOString(),status:alerts.some(a=>a.status==="critical")?"critical":alerts.some(a=>a.status==="upgrade")?"upgrade":alerts.length?"warning":unknown.length?"unknown":"normal",plans:{cloudflare:cfPlan,supabase:sbPlan,verified_at:plans.verified_at,stale:planStale},states,quotas,alerts,unknown,notes,
    delivery:{...delivery,channels:[env.ALERT_EMAIL&&env.ALERT_TO?"email":null,env.ALERT_WEBHOOK_URL?"webhook":null].filter(Boolean)},
    token:{status:tokenData?.status||null,expires_on:tokenData?.expires_on||null,days_left:tokenDaysLeft,checked_at:states.token?.last_success_at||null},
    database:{cpu_percent:cpu,connections:db.fresh?numberOrNull(db.data?.connections):null,max_connections:db.fresh?numberOrNull(db.data?.max_connections):null,memory_used_percent:db.fresh&&numberOrNull(db.data?.memory_available_bytes)!==null&&db.data?.memory_total_bytes?100*(1-db.data.memory_available_bytes/db.data.memory_total_bytes):null},
    application:{telemetry_status:telemetryStatus,last_observed_at:lastObserved===null?null:new Date(lastObserved).toISOString(),random_samples:random.length,skill_random_samples:skillRandom.length,skill_p95_ms:skillP95,web_p95_ms:percentile(random.filter(e=>e.route==="web").map(e=>e.duration_ms)),incident_count:incidents.length,recent:events.slice(0,30),truncated:events.length===1000,sample_rate:0.02,sample_bucket_max_per_kind:10,provider_requests:cfFresh?cf.data.app.requests:null,provider_runtime_errors:cfFresh?cf.data.app.errors:null},
    database_history:history.filter((_,i)=>i%Math.max(1,Math.ceil(history.length/48))===0).map(r=>({at:r.collected_at,value:JSON.parse(r.payload).database_bytes})),
    pricing:{verified_at:PRICING_VERIFIED_AT,workers_base_usd:5,supabase_pro_base_usd:25,currency:"USD",estimate_complete:false,note:"사용량 기반 추가 요금, CPU 합계, 추가 프로젝트·컴퓨트, 세금과 환율을 포함한 실제 청구액은 공식 Billing에서 확인해야 합니다."},
    limitations:["Cloudflare 관제와 앱은 같은 계정의 요청 한도 및 플랫폼 장애를 공유합니다.","GraphQL 집계는 샘플링·반영 지연이 있을 수 있으며 청구서 수치와 차이가 날 수 있습니다.","앱 요청은 2% 무작위 표본과 별도 오류 표본을 수집합니다. 저장은 계정 전체에서 5분마다 유형별 최대 10건으로 제한되며 누락이 발생할 수 있습니다.","앱 지연은 무작위 표본에서 산출합니다. 표본 30건 미만이면 p95를 산출하지 않습니다.","DB 성장 예측은 최소 3개 표본과 2일 이상의 기록이 쌓인 뒤 표시합니다.","수동 청구 사용량은 24시간 뒤 확인 불가로 전환합니다. 원문 발화·사용자·가계부·거래 값은 관제에 저장하지 않습니다."]};
}

async function manualUsage(request,env) {
  const body=await requestJson(request);
  if(!["egress","cached_egress","storage"].includes(body.key)||body.scope!=="organization") return json({ok:false,error:"invalid_usage_scope"},400);
  const value=numberOrNull(body.value);
  const start=Date.parse(body.period_start);
  const end=Date.parse(body.period_end);
  if(value===null||value>1024**5||![start,end].every(Number.isFinite)||end<=start||end-start>35*DAY||Date.now()<start||Date.now()>=end) return json({ok:false,error:"invalid_usage_period"},400);
  await env.MONITOR_DB.prepare("INSERT INTO manual_usage(key,value,period_start,period_end,verified_at,scope) VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,period_start=excluded.period_start,period_end=excluded.period_end,verified_at=excluded.verified_at,scope=excluded.scope").bind(body.key,value,new Date(start).toISOString(),new Date(end).toISOString(),new Date().toISOString(),"organization").run();
  return json({ok:true});
}

// ── 1.1.0 알림 발송 ────────────────────────────────────────────────────────────
// 경고는 그동안 관리자가 화면을 열 때만 계산됐다. 이제 매 수집 뒤 summary() 를 돌려 새 경고를 이메일(send_email 바인딩)과
// 웹훅으로 보낸다. 같은 경고는 등급별 간격 안에서 다시 보내지 않고, 긴급 경고가 사라지면 "해소"를 한 번 보낸다.
// 발송 기록은 D1 settings 의 alert:* 행이며, 발송에 실패하면 기록을 남기지 않아 다음 수집 때 다시 시도한다.
const ALERT_RESEND_MS={critical:6*3600000,upgrade:12*3600000,warning:24*3600000};
const ALERT_LABELS={critical:"긴급",upgrade:"전환 검토",warning:"주의"};
function alertKey(title) { let hash=2166136261; for(const c of String(title)) hash=Math.imul(hash^c.charCodeAt(0),16777619); return `alert:${(hash>>>0).toString(16)}`; }
function base64Utf8(text) { const bytes=new TextEncoder().encode(text); let binary=""; for(let i=0;i<bytes.length;i+=0x4000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x4000)); return btoa(binary); }
export function rawAlertEmail({from,to,subject,text,now}) {
  const domain=String(from).split("@")[1]||"localhost";
  return [`From: ${from}`,`To: ${to}`,`Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,`Date: ${now.toUTCString()}`,`Message-ID: <${crypto.randomUUID()}@${domain}>`,"MIME-Version: 1.0","Content-Type: text/plain; charset=utf-8","Content-Transfer-Encoding: base64","",base64Utf8(text).replace(/.{76}/g,"$&\r\n"),""].join("\r\n");
}
export function renderAlertText(result,due,recovered,now,origin="") {
  const kst=new Date(now.getTime()+9*3600000).toISOString().replace("T"," ").slice(0,16)+" KST";
  const lines=[`말해가계부 관제 ${kst} · 전체 상태 ${ALERT_LABELS[result.status]||result.status}`,""];
  for(const alert of due) lines.push(`[${ALERT_LABELS[alert.status]||alert.status}] ${alert.title}`,`  ${alert.message}`);
  for(const prev of recovered) lines.push(`[해소] ${prev.title}`);
  if(result.unknown?.length) lines.push("",`확인되지 않은 항목: ${result.unknown.join(", ")}`);
  lines.push("",`관제 화면: ${origin?`${origin}/ops-monitor`:"/ops-monitor"}`,"이 메일은 5분 수집마다 새 경고가 있을 때만 발송되며, 같은 경고는 긴급 6시간·전환 검토 12시간·주의 24시간 안에 다시 보내지 않습니다.");
  return lines.join("\n");
}
async function sendAlertEmail(env,subject,text,now) {
  const from=env.ALERT_FROM||`monitor@${new URL(env.APP_ORIGIN).hostname}`;
  const raw=rawAlertEmail({from,to:env.ALERT_TO,subject,text,now});
  let message={from,to:env.ALERT_TO,raw};
  try { const mod=await import("cloudflare:email"); message=new mod.EmailMessage(from,env.ALERT_TO,raw); } catch(_) { /* Node 검사: 바인딩 흉내가 평범한 객체를 받는다 */ }
  await env.ALERT_EMAIL.send(message);
}
export async function deliverAlerts(env,now=new Date()) {
  const channels=[env.ALERT_EMAIL&&env.ALERT_TO?"email":null,env.ALERT_WEBHOOK_URL?"webhook":null].filter(Boolean);
  if(!channels.length) throw new Error("not_connected");
  const result=await summary(env,now.getTime());
  const active=result.alerts.filter(alert=>ALERT_RESEND_MS[alert.status]);
  const rows=(await env.MONITOR_DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'alert:%'").all()).results;
  const remembered=new Map(rows.map(row=>{ try { return [row.key,JSON.parse(row.value)]; } catch(_) { return [row.key,{}]; } }));
  const due=[];const statements=[];
  for(const alert of active) {
    const key=alertKey(alert.title);
    const previous=remembered.get(key);
    remembered.delete(key);
    const sentAt=Date.parse(previous?.sent_at||"");
    if(previous&&previous.status===alert.status&&Number.isFinite(sentAt)&&now.getTime()-sentAt<ALERT_RESEND_MS[alert.status]) continue;
    due.push(alert);
    statements.push(env.MONITOR_DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,JSON.stringify({title:alert.title,status:alert.status,sent_at:now.toISOString()})));
  }
  const recovered=[];
  for(const [key,previous] of remembered) { statements.push(env.MONITOR_DB.prepare("DELETE FROM settings WHERE key=?").bind(key)); if(previous?.status==="critical") recovered.push(previous); }
  if(!due.length&&!recovered.length) { if(statements.length) await env.MONITOR_DB.batch(statements); return {channels,sent:0,recovered:0,active:active.length,status:result.status}; }
  const counts=["critical","upgrade","warning"].map(status=>`${ALERT_LABELS[status]} ${due.filter(a=>a.status===status).length}`).join(" · ");
  const subject=`[말해가계부 관제] ${due.length?counts:"해소 "+recovered.length}`;
  const text=renderAlertText(result,due,recovered,now,env.APP_ORIGIN||"");
  const delivered=[];const failures=[];
  if(channels.includes("email")) { try { await sendAlertEmail(env,subject,text,now); delivered.push("email"); } catch(error) { failures.push(`email:${failureCode(error)}`); } }
  if(channels.includes("webhook")) { try { const response=await fetch(env.ALERT_WEBHOOK_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:`${subject}\n${text}`}),signal:AbortSignal.timeout(8000)}); if(!response.ok) throw new Error(`http_${response.status}`); delivered.push("webhook"); } catch(error) { failures.push(`webhook:${failureCode(error)}`); } }
  if(!delivered.length) throw new Error(`delivery_failed ${failures.join(" ")}`);
  if(statements.length) await env.MONITOR_DB.batch(statements);
  return {channels,delivered,failures,sent:due.length,recovered:recovered.length,active:active.length,status:result.status,titles:due.map(alert=>alert.title).slice(0,10)};
}

export default {
  async scheduled(controller,env,ctx) {
    const now=new Date(Number.isFinite(Number(controller?.scheduledTime))?Number(controller.scheduledTime):Date.now());
    ctx.waitUntil((async()=>{ await collect(env,now); await writeCollector(env,"alerts",()=>deliverAlerts(env,now),now); })());
  },
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.pathname==="/health"&&request.method==="GET") return json({ok:true,version:MONITOR_VERSION,storage_configured:Boolean(env.MONITOR_DB)});
    try {
      const bearer=await bearerAllowed(request,env);
      const cookie=await cookieAllowed(request,env);
      if(url.pathname==="/session"&&request.method==="POST") {
        const form=new URLSearchParams(await readBounded(request,2048));
        const ticket=form.get("ticket")||"";
        if(!/^[a-f0-9-]{36}$/.test(ticket)||!env.MONITOR_DB) return json({ok:false,error:"invalid_ticket"},401);
        const row=await env.MONITOR_DB.prepare("DELETE FROM settings WHERE key=? RETURNING value").bind(`ticket:${ticket}`).first();
        if(!row||Number(row.value)<Date.now()) return json({ok:false,error:"expired_ticket"},401);
        const data=`${Date.now()+7*DAY}-${crypto.randomUUID()}`;
        return new Response(null,{status:303,headers:{...HEADERS,location:"/", "set-cookie":`__Host-ab_monitor=${data}.${await sign(data,env.OPS_MONITOR_TOKEN)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800`}});
      }
      if(!bearer&&!cookie) {
        if(url.pathname==="/"&&request.method==="GET") return html("<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>말해가계부 관제 로그인</title><body><h1>말해가계부 종합 관제</h1><p>관리자 화면에서 관제를 열어 로그인해 주세요. 관제 세션은 앱과 별도로 7일 동안 유지됩니다.</p><a href=\"https://malhaebook.com/ops-monitor/open\">관리자 인증 후 관제 열기</a></body></html>");
        return json({ok:false,error:"admin_required"},401);
      }
      if(!env.MONITOR_DB) return json({ok:false,error:"storage_not_connected"},503);
      if(request.method!=="GET"&&!bearer&&request.headers.get("origin")!==url.origin) return json({ok:false,error:"origin_required"},403);
      if(url.pathname.startsWith("/internal/")&&!bearer) return json({ok:false,error:"internal_auth_required"},403);
      if(url.pathname==="/internal/telemetry"&&request.method==="POST") {
        const data=sanitizeTelemetry(await requestJson(request));
        let hash=2166136261; for(const c of data.id) hash=Math.imul(hash^c.charCodeAt(0),16777619);
        const slot=`${Math.floor(data.at/300000)}:${data.sample_kind}:${(hash>>>0)%10}`;
        await env.MONITOR_DB.prepare("INSERT OR IGNORE INTO telemetry(id,at,route,method,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,slot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(...Object.values(data),slot).run();
        return json({ok:true},202);
      }
      if(url.pathname==="/internal/ticket"&&request.method==="POST") {
        const ticket=crypto.randomUUID();
        await env.MONITOR_DB.prepare("INSERT INTO settings(key,value) VALUES(?,?)").bind(`ticket:${ticket}`,String(Date.now()+60000)).run();
        return json({ok:true,ticket});
      }
      if(url.pathname==="/api/manual"&&request.method==="POST") return manualUsage(request,env);
      if(url.pathname==="/api/plans"&&request.method==="POST") {
        const data=await requestJson(request);
        if(!["free","paid","unknown"].includes(data.cloudflare)||!["free","pro","team","enterprise","unknown"].includes(data.supabase)) return json({ok:false,error:"invalid_plan"},400);
        await env.MONITOR_DB.prepare("INSERT INTO settings(key,value) VALUES('plans',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({cloudflare:data.cloudflare,supabase:data.supabase,verified_at:new Date().toISOString()})).run();
        return json({ok:true});
      }
      if(url.pathname==="/api/summary"&&request.method==="GET") return json(await summary(env));
      if((url.pathname==="/"||url.pathname==="/dashboard")&&request.method==="GET") return html(dashboardHtml(url.searchParams.get("base")==="/ops-monitor"?"/ops-monitor":""));
      return json({ok:false,error:"not_found"},404);
    } catch(error) {return json({ok:false,error:failureCode(error)},/invalid_|SyntaxError/.test(String(error))?400:503);}
  }
};
