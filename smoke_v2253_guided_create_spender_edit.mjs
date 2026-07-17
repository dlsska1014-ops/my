import app from './src/index.js';
import assert from 'node:assert/strict';

const clone = (v) => JSON.parse(JSON.stringify(v));
const db = {
  users: [
    { id:'u1', kakao_user_key:'bot-owner', nickname:'Bin', created_at:'2026-07-01T00:00:00Z' },
    { id:'u2', kakao_user_key:'bot-mom', nickname:'엄마', created_at:'2026-07-01T00:00:01Z' },
  ],
  households: [{ id:'h1', name:'우리집 생활비', invite_code:'HOME1234', created_at:'2026-07-01T00:00:00Z' }],
  household_members: [
    { household_id:'h1', user_id:'u1', role:'owner', created_at:'2026-07-01T00:00:00Z' },
    { household_id:'h1', user_id:'u2', role:'member', created_at:'2026-07-01T00:00:01Z' },
  ],
  accountbook_settings: [{ id:'s1', key:'kakao_selected_household_v2251:u1', value:'h1', created_at:'2026-07-01T00:00:00Z' }],
  accountbook_budgets: [], accountbook_categories: [], payment_assets: [], transactions: [],
};
let idSeq = 100;

function parseExpr(expr='') { const i=expr.indexOf('.'); return i<0?[expr,'']:[expr.slice(0,i),decodeURIComponent(expr.slice(i+1))]; }
function filterRows(rows, url) {
  let out = rows.slice();
  const ignored = new Set(['select','order','limit','on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const exprs=url.searchParams.getAll(key);
    out=out.filter((row)=>exprs.every((expr)=>{ const [op,val]=parseExpr(expr); const actual=String(row[key]??'');
      if(op==='eq') return actual===val; if(op==='neq') return actual!==val; if(op==='gte') return actual>=val;
      if(op==='gt') return actual>val; if(op==='lte') return actual<=val; if(op==='lt') return actual<val;
      if(op==='is') return val==='null'?row[key]==null:true; return true; }));
  }
  const order=url.searchParams.get('order');
  if(order){ const rules=order.split(',').map((x)=>x.trim().split('.')); out.sort((a,b)=>{ for(const [k,d] of rules){const av=String(a[k]??''),bv=String(b[k]??''); if(av===bv)continue; return(av<bv?-1:1)*(d==='desc'?-1:1);}return 0;}); }
  return clone(out.slice(0,Number(url.searchParams.get('limit')||out.length)));
}
function rowKey(row){ return row.id || `${row.household_id||''}|${row.user_id||''}|${row.key||''}`; }

const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname!=='mock.supabase.co') return realFetch(input,init);
  const table=url.pathname.split('/').filter(Boolean).at(-1); db[table] ||= [];
  const method=String(init.method||'GET').toUpperCase();
  if(method==='GET') return new Response(JSON.stringify(filterRows(db[table],url)),{status:200,headers:{'content-type':'application/json'}});
  const body=init.body?JSON.parse(String(init.body)):null;
  if(method==='POST'){
    const incoming=(Array.isArray(body)?body:[body]).map((r)=>clone(r));
    const conflict=String(url.searchParams.get('on_conflict')||'').split(',').filter(Boolean);
    const saved=[];
    for(const row of incoming){
      let idx=conflict.length?db[table].findIndex((x)=>conflict.every((k)=>String(x[k]??'')===String(row[k]??''))):-1;
      if(idx>=0){ db[table][idx]={...db[table][idx],...row}; saved.push(clone(db[table][idx])); }
      else { const full={ id:row.id||`${table}-${++idSeq}`, created_at:row.created_at||new Date().toISOString(), ...row }; db[table].push(full); saved.push(clone(full)); }
    }
    const repr=String(new Headers(init.headers||{}).get('prefer')||'').includes('return=representation');
    return new Response(repr?JSON.stringify(saved):'',{status:201,headers:{'content-type':'application/json'}});
  }
  if(method==='PATCH'){
    const targets=filterRows(db[table],url); const keys=new Set(targets.map(rowKey)); const updated=[];
    db[table]=db[table].map((x)=>{ if(!keys.has(rowKey(x))) return x; const n={...x,...clone(body)}; updated.push(clone(n)); return n; });
    const repr=String(new Headers(init.headers||{}).get('prefer')||'').includes('return=representation');
    return new Response(repr?JSON.stringify(updated):'',{status:repr?200:204,headers:{'content-type':'application/json'}});
  }
  if(method==='DELETE'){
    const targets=filterRows(db[table],url); const keys=new Set(targets.map(rowKey)); db[table]=db[table].filter((x)=>!keys.has(rowKey(x)));
    return new Response('',{status:204});
  }
  return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
};

const env={ APP_NAME:'똑똑한가계부',PUBLIC_BASE_URL:'https://ttokttok-accountbook.com',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',KAKAO_REPEAT_GUARD_SECONDS:'0' };
function payload(userKey,utterance){return{intent:{id:'i',name:'폴백 블록'},userRequest:{timezone:'Asia/Seoul',utterance,block:{id:'b',name:'폴백 블록'},user:{id:userKey,type:'botUserKey',properties:{botUserKey:userKey,nickname:userKey}}},bot:{id:'bot',name:'똑똑한가계부'},action:{id:'a',name:'skill',params:{},detailParams:{},clientExtra:{}},contexts:[]};}
async function skill(userKey,utterance){const res=await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload(userKey,utterance))}),env,{});assert.equal(res.status,200);const j=await res.json();return String(j?.template?.outputs?.[0]?.simpleText?.text||'');}

let res=await app.fetch(new Request('https://ttokttok-accountbook.com/health'),env,{});
assert.equal((await res.json()).version,'V22.8.6-RECEIPT-SCREEN-OPTIMIZATION');

// 5번은 이름이 아니라 직접 입력 종류 선택이다.
let text=await skill('bot-new','/새 가계부 만들기'); assert.match(text,/어떤 용도/);
text=await skill('bot-new','5번'); assert.match(text,/직접 입력 가계부/); assert.match(text,/가계부 이름을 정해/); assert.doesNotMatch(text,/‘5번’.*이름/);
text=await skill('bot-new','테스트 가계부'); assert.match(text,/테스트 가계부/);
text=await skill('bot-new','응'); assert.match(text,/테스트 가계부.*만들었어요/s); assert.doesNotMatch(text,/‘응’/);
assert.ok(db.households.some((h)=>h.name==='테스트 가계부'));
assert.ok(!db.households.some((h)=>h.name==='응'||h.name==='만들어줘'||h.name==='5번'));

// 만들어줘도 기존 확인 이름으로 생성하며 새 이름으로 오해하지 않는다.
text=await skill('bot-new2','새 가계부 만들기');
text=await skill('bot-new2','5'); assert.match(text,/가계부 이름을 정해/);
text=await skill('bot-new2','두번째 테스트'); assert.match(text,/이 이름으로 만들까요/);
text=await skill('bot-new2','만들어줘'); assert.match(text,/두번째 테스트.*만들었어요/s); assert.ok(db.households.some((h)=>h.name==='두번째 테스트'));

// 이름 입력 단계의 확인어는 이름으로 저장하지 않는다.
text=await skill('bot-new3','새 가계부 만들기');
text=await skill('bot-new3','5번');
text=await skill('bot-new3','만들어줘'); assert.match(text,/가계부 이름을 2~40자로 입력/); assert.ok(!db.households.some((h)=>h.name==='만들어줘'));

// 방금 저장한 기록의 지출자 변경 단계.
text=await skill('bot-owner','점심 180000원 현금'); assert.match(text,/지출 저장/); assert.equal(db.transactions.at(-1).user_id,'u1');
text=await skill('bot-owner','지출자 변경'); assert.match(text,/지출자 변경/); assert.match(text,/엄마/); assert.doesNotMatch(text,/금액과 내용을 한 문장/);
text=await skill('bot-owner','엄마'); assert.match(text,/지출자를 변경했어요/); assert.match(text,/지출자: 엄마/); assert.equal(db.transactions.at(-1).user_id,'u2');

// 번호/최근 기록과 이름을 한 문장으로 직접 변경.
text=await skill('bot-owner','커피 5000원 현금'); assert.equal(db.transactions.at(-1).user_id,'u1');
text=await skill('bot-owner','방금 지출자 엄마로 변경'); assert.match(text,/지출자를 변경했어요/); assert.equal(db.transactions.at(-1).user_id,'u2');

console.log(JSON.stringify({ok:true,households:db.households.map((h)=>h.name),transactions:db.transactions.map((t)=>({memo:t.memo,amount:t.amount,user_id:t.user_id}))},null,2));
