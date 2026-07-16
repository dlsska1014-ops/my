import app from './src/index.js';

const MOCK_DELAY_MS = 450;
const db = {
  users: [{ id: 'user-id-1', kakao_user_key: 'user-1', nickname: '인남', created_at: new Date().toISOString() }],
  households: [{ id: 'house-1', name: '우리집 생활비', invite_code: 'ABC123', created_at: new Date().toISOString() }],
  household_members: [{ id: 'member-1', household_id: 'house-1', user_id: 'user-id-1', role: 'owner', created_at: new Date().toISOString() }],
  accountbook_settings: [
    { id: 'setting-group', key: 'kakao_group_links', value: JSON.stringify({ 'group-1': { household_id: 'house-1', household_name: '우리집 생활비', invite_code: 'ABC123' } }), created_at: new Date().toISOString() },
    { id: 'setting-alias', key: 'member_aliases:house-1', value: JSON.stringify({ 'user-id-1': '아빠' }), created_at: new Date().toISOString() },
    { id: 'setting-selected', key: 'kakao_selected_household_v2251:user-id-1', value: 'house-1', created_at: new Date().toISOString() },
  ],
  accountbook_budgets: [], transactions: [], accountbook_categories: [],
};
let seq = 1;
const clone = (x) => JSON.parse(JSON.stringify(x));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function cmpFilter(row, key, expressions) {
  for (const expr of expressions) {
    const decoded = decodeURIComponent(expr); const dot = decoded.indexOf('.');
    const op = decoded.slice(0,dot); const val = decoded.slice(dot+1); const actual = String(row[key] ?? '');
    if (op === 'eq' && actual !== val) return false;
    if (op === 'gte' && actual < val) return false;
    if (op === 'lt' && actual >= val) return false;
  }
  return true;
}
function tableRows(table, url) {
  let rows = db[table] || []; const ignored = new Set(['select','order','limit','on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue; rows = rows.filter((r) => cmpFilter(r,key,url.searchParams.getAll(key)));
  }
  const order = url.searchParams.get('order') || '';
  if (order) { const rules = order.split(',').map((x)=>x.trim().split('.')); rows=[...rows].sort((a,b)=>{for(const [k,dir] of rules){const av=String(a[k]??''),bv=String(b[k]??'');if(av===bv)continue;return(av<bv?-1:1)*(dir==='desc'?-1:1);}return 0;}); }
  return clone(rows.slice(0, Number(url.searchParams.get('limit') || rows.length)));
}
function upsert(table,item,keys){const rows=db[table];const idx=rows.findIndex((r)=>keys.every((k)=>String(r[k]??'')===String(item[k]??'')));const now=new Date().toISOString();const row={...item,id:item.id||(idx>=0?rows[idx].id:`${table}-${seq++}`),created_at:item.created_at||(idx>=0?rows[idx].created_at:now)};if(idx>=0)rows[idx]={...rows[idx],...row};else rows.push(row);return clone(idx>=0?rows[idx]:rows.at(-1));}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init={}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  await delay(MOCK_DELAY_MS);
  const method=String(init.method||'GET').toUpperCase(); const table=url.pathname.split('/').filter(Boolean).at(-1); const data=init.body?JSON.parse(init.body):null; let payload=null;
  if(method==='GET') payload=tableRows(table,url);
  else if(method==='POST'){const items=Array.isArray(data)?data:[data];const saved=[];for(const item of items){if(table==='users')saved.push(upsert(table,item,['kakao_user_key']));else if(table==='household_members')saved.push(upsert(table,item,['household_id','user_id']));else if(table==='accountbook_settings')saved.push(upsert(table,item,['key']));else saved.push(upsert(table,item,['id']));}payload=saved;}
  else if(method==='PATCH'){payload=[];} else if(method==='DELETE'){payload=[];}
  return new Response(payload===null?'':JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};
const env={APP_NAME:'똑똑한가계부',PUBLIC_BASE_URL:'https://ttokttok-accountbook.com',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',KAKAO_REPEAT_GUARD_SECONDS:'0'};
async function run(utterance, group=false){
  const properties={botUserKey:'user-1',nickname:'인남'}; if(group) properties.botGroupKey='group-1';
  const payload={userRequest:{utterance,user:{id:'user-1',type:'botUserKey',properties}}};
  const started=Date.now();
  const res=await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),env,{});
  const elapsed=Date.now()-started; const data=JSON.parse(await res.text()); const text=data?.template?.outputs?.[0]?.simpleText?.text||'';
  console.log(JSON.stringify({utterance,group,elapsed,status:res.status,header:res.headers.get('x-kakao-skill-latency-ms'),text:text.slice(0,100)},null,2));
  if(res.status!==200||!text.includes('저장했어요')) throw new Error('save failed');
  if(elapsed>=4500) throw new Error(`latency too high: ${elapsed}`);
}
await run('점심 15000원 현대카드', false);
await run('@똑똑한가계부 점심 16000원 현금', true);
await run('/기록 점심 17000원 국민카드', true);
console.log('LATENCY_V2151_OK');
