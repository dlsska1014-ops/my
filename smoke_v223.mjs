import app from './src/index.js';
import assert from 'node:assert/strict';

const db = { users: [{id:'u1',kakao_user_key:'u-key',nickname:'인남',created_at:'2026-01-01T00:00:00Z'}], households: [{id:'h1',name:'우리집',invite_code:'ABC12345',created_at:'2026-01-01T00:00:00Z'}], household_members: [{household_id:'h1',user_id:'u1',role:'owner',created_at:'2026-01-01T00:00:00Z'}], accountbook_settings: [], accountbook_budgets: [], transactions: [], accountbook_categories: [] };
let seq = 1;
const rpcCalls = [];
const realFetch = globalThis.fetch;
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function rows(table, url){
  let out = (db[table] || []).slice();
  for (const key of new Set([...url.searchParams.keys()])) {
    if (['select','order','limit','on_conflict'].includes(key)) continue;
    for (const expr of url.searchParams.getAll(key)) {
      const i = expr.indexOf('.'), op = expr.slice(0,i), val = decodeURIComponent(expr.slice(i+1));
      out = out.filter(r => op === 'eq' ? String(r[key] ?? '') === val : true);
    }
  }
  return clone(out.slice(0, Number(url.searchParams.get('limit') || out.length)));
}
globalThis.fetch = async (input, init={}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  if (url.pathname.includes('/rpc/')) { rpcCalls.push({path:url.pathname, body:init.body ? JSON.parse(init.body) : null}); return new Response('{}', {status:200,headers:{'content-type':'application/json'}}); }
  if (method === 'GET') return new Response(JSON.stringify(rows(table,url)), {status:200,headers:{'content-type':'application/json'}});
  const data = init.body ? JSON.parse(init.body) : {};
  if (method === 'POST') {
    const list = Array.isArray(data) ? data : [data];
    for (const item of list) {
      if (!db[table]) db[table] = [];
      const row = {...item, id:item.id || `${table}-${seq++}`, created_at:item.created_at || new Date().toISOString()};
      db[table].push(row);
    }
    return new Response(JSON.stringify(list), {status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('[]', {status:200,headers:{'content-type':'application/json'}});
};

const env = { APP_NAME:'똑똑한가계부', PUBLIC_BASE_URL:'https://ttokttok-accountbook.com', SUPABASE_URL:'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'x', KAKAO_REPEAT_GUARD_SECONDS:'0', CRON_SECRET:'cron-test', NLU_METRICS_ENABLED:'1', NLU_PERSIST_FAILURE_SAMPLES:'1', NLU_STORE_REDACTED_TEXT:'1' };
const ctx = { jobs: [], waitUntil(p){ this.jobs.push(Promise.resolve(p)); } };
function payload(utterance){ return JSON.stringify({ userRequest:{ utterance, block:{name:'폴백 블록'}, user:{id:'u-key',type:'botUserKey',properties:{botUserKey:'u-key',nickname:'인남'}}}}); }

let res = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, ctx);
const h = await res.json();
assert.equal(h.version, 'V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX');

res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:payload('시작')}), env, ctx);
assert.equal(res.status,200);
assert.equal(res.headers.get('x-accountbook-version'),'V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX');
assert.ok(res.headers.get('x-accountbook-nlu-result'));
assert.ok(res.headers.get('x-accountbook-request-id'));

res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:payload('이름 변경')}), env, ctx);
assert.equal(res.status,200);
assert.ok(['clarify','fallback'].includes(res.headers.get('x-accountbook-nlu-result')));

res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:payload('연락처 010-1234-5678 test@example.com 이상한요청')}), env, ctx);
assert.equal(res.status,200);
assert.ok(['clarify','fallback'].includes(res.headers.get('x-accountbook-nlu-result')));

res = await app.fetch(new Request('https://ttokttok-accountbook.com/nlu-ops.json'), env, ctx);
assert.equal(res.status,401);
res = await app.fetch(new Request('https://ttokttok-accountbook.com/nlu-ops.json?key=cron-test'), env, ctx);
assert.equal(res.status,200);
const ops = await res.json();
assert.equal(ops.ok,true);
assert.ok(ops.runtime.total >= 3);
res = await app.fetch(new Request('https://ttokttok-accountbook.com/nlu-ops?key=cron-test'), env, ctx);
assert.equal(res.status,200);
assert.match(await res.text(),/자연어 운영·학습 센터/);

const runtime = await app.fetch(new Request('https://ttokttok-accountbook.com/nlu-runtime.json'), env, ctx);
const runtimeJson = await runtime.json();
assert.equal(runtimeJson.runtime.ops.aggregate_metrics_enabled,true);
assert.equal(runtimeJson.runtime.ops.failure_samples_enabled,true);

await Promise.allSettled(ctx.jobs);
assert.ok(rpcCalls.some(x=>x.path.endsWith('/record_nlu_metric')));
assert.ok(rpcCalls.some(x=>x.path.endsWith('/record_nlu_failure_sample')));
const samples = rpcCalls.filter(x=>x.path.endsWith('/record_nlu_failure_sample')).map(x=>x.body?.p_redacted_sample || '').join(' ');
assert.ok(!samples.includes('010-1234-5678'));
assert.ok(!samples.includes('test@example.com'));
assert.ok(samples.includes('[전화번호]') || samples.includes('[이메일]'));
console.log(JSON.stringify({ok:true,version:h.version,rpc_calls:rpcCalls.length,runtime_ops:runtimeJson.runtime.ops}));
