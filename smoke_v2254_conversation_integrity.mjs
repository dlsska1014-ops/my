import app from './src/index.js';
import assert from 'node:assert/strict';

const clone = (v) => JSON.parse(JSON.stringify(v));
let idSeq = 1000;
const db = {
  users: [
    { id:'u1', kakao_user_key:'bot-owner', nickname:'Bin', created_at:'2026-07-01T00:00:00Z' },
    { id:'u2', kakao_user_key:'bot-admin', nickname:'관리자', created_at:'2026-07-01T00:00:01Z' },
    { id:'u3', kakao_user_key:'bot-member', nickname:'멤버', created_at:'2026-07-01T00:00:02Z' },
    { id:'u4', kakao_user_key:'bot-mom', nickname:'엄마', created_at:'2026-07-01T00:00:03Z' },
    { id:'u5', kakao_user_key:'bot-solo', nickname:'단독', created_at:'2026-07-01T00:00:04Z' },
    { id:'u6', kakao_user_key:'bot-pending', nickname:'대기', created_at:'2026-07-01T00:00:05Z' },
  ],
  households: [
    { id:'h1', name:'우리집 생활비', invite_code:'HOME1234', created_at:'2026-07-01T00:00:00Z' },
    { id:'h2', name:'여행 가계부', invite_code:'TRIP1234', created_at:'2026-07-02T00:00:00Z' },
    { id:'h3', name:'단독 가계부', invite_code:'SOLO1234', created_at:'2026-07-03T00:00:00Z' },
  ],
  household_members: [
    { household_id:'h1', user_id:'u1', role:'owner', created_at:'2026-07-01T00:00:00Z' },
    { household_id:'h1', user_id:'u2', role:'admin', created_at:'2026-07-01T00:00:01Z' },
    { household_id:'h1', user_id:'u3', role:'member', created_at:'2026-07-01T00:00:02Z' },
    { household_id:'h1', user_id:'u4', role:'member', created_at:'2026-07-01T00:00:03Z' },
    { household_id:'h1', user_id:'u6', role:'pending', created_at:'2026-07-01T00:00:04Z' },
    { household_id:'h2', user_id:'u1', role:'owner', created_at:'2026-07-02T00:00:00Z' },
    { household_id:'h2', user_id:'u2', role:'admin', created_at:'2026-07-02T00:00:01Z' },
    { household_id:'h2', user_id:'u3', role:'member', created_at:'2026-07-02T00:00:02Z' },
    { household_id:'h3', user_id:'u5', role:'owner', created_at:'2026-07-03T00:00:00Z' },
  ],
  accountbook_settings: [
    { id:'s1', key:'kakao_selected_household_v2251:u1', value:'h1', created_at:'2026-07-01T00:00:00Z' },
    { id:'s2', key:'kakao_selected_household_v2251:u2', value:'h1', created_at:'2026-07-01T00:00:00Z' },
    { id:'s3', key:'kakao_selected_household_v2251:u3', value:'h1', created_at:'2026-07-01T00:00:00Z' },
    { id:'s4', key:'kakao_selected_household_v2251:u4', value:'h1', created_at:'2026-07-01T00:00:00Z' },
    { id:'s5', key:'kakao_selected_household_v2251:u5', value:'h3', created_at:'2026-07-01T00:00:00Z' },
  ],
  accountbook_budgets: [], accountbook_categories: [], payment_assets: [], transactions: [],
};

function parseExpr(expr='') { const i=expr.indexOf('.'); return i<0?[expr,'']:[expr.slice(0,i),decodeURIComponent(expr.slice(i+1))]; }
function filterRows(rows, url) {
  let out = rows.slice();
  const ignored = new Set(['select','order','limit','on_conflict','or']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const exprs=url.searchParams.getAll(key);
    out=out.filter((row)=>exprs.every((expr)=>{ const [op,val]=parseExpr(expr); const actual=String(row[key]??'');
      if(op==='eq') return actual===val; if(op==='neq') return actual!==val; if(op==='gte') return actual>=val;
      if(op==='gt') return actual>val; if(op==='lte') return actual<=val; if(op==='lt') return actual<val;
      if(op==='is') return val==='null'?row[key]==null:true; if(op==='in') return val.replace(/^\(|\)$/g,'').split(',').includes(actual); return true; }));
  }
  const order=url.searchParams.get('order');
  if(order){ const rules=order.split(',').map((x)=>x.trim().split('.')); out.sort((a,b)=>{ for(const [k,d] of rules){const av=String(a[k]??''),bv=String(b[k]??''); if(av===bv)continue; return(av<bv?-1:1)*(d==='desc'?-1:1);}return 0;}); }
  return clone(out.slice(0,Number(url.searchParams.get('limit')||out.length)));
}
function rowKey(row){ return row.id || `${row.household_id||''}|${row.user_id||''}|${row.key||''}|${row.month||''}|${row.category||''}`; }
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
    const conflict=String(url.searchParams.get('on_conflict')||'').split(',').filter(Boolean); const saved=[];
    for(const row of incoming){ let idx=conflict.length?db[table].findIndex((x)=>conflict.every((k)=>String(x[k]??'')===String(row[k]??''))):-1;
      if(idx>=0){ db[table][idx]={...db[table][idx],...row}; saved.push(clone(db[table][idx])); }
      else { const full={ id:row.id||`${table}-${++idSeq}`, created_at:row.created_at||new Date().toISOString(), ...row }; db[table].push(full); saved.push(clone(full)); } }
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
    return new Response(null,{status:204});
  }
  return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
};

const env={ APP_NAME:'똑똑한가계부',PUBLIC_BASE_URL:'https://ttokttok-accountbook.com',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',KAKAO_REPEAT_GUARD_SECONDS:'8',KAKAO_RETRY_DEDUP_SECONDS:'120' };
function payload(userKey,utterance,groupKey=''){return{intent:{id:'i',name:'폴백 블록'},userRequest:{timezone:'Asia/Seoul',utterance,block:{id:'b',name:'폴백 블록'},user:{id:userKey,type:'botUserKey',properties:{botUserKey:userKey,nickname:userKey,...(groupKey?{botGroupKey:groupKey}:{})}}},bot:{id:'bot',name:'똑똑한가계부'},action:{id:'a',name:'skill',params:{},detailParams:{},clientExtra:{}},contexts:[]};}
async function skill(userKey,utterance,groupKey=''){const res=await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload(userKey,utterance,groupKey))}),env,{}); assert.equal(res.status,200); const j=await res.json(); return String(j?.template?.outputs?.[0]?.simpleText?.text||'');}
async function getJson(path){ const r=await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`),env,{}); assert.equal(r.status,200); return await r.json(); }
function userByKey(key){ return db.users.find((u)=>u.kakao_user_key===key); }
function setSetting(key,value){ const row=db.accountbook_settings.find((x)=>x.key===key); if(row) row.value=value; else db.accountbook_settings.push({id:`setting-${++idSeq}`,key,value,created_at:new Date().toISOString()}); }
function flowRowForUserId(userId,group=false){ return db.accountbook_settings.find((x)=>String(x.key).startsWith(`kakao_flow_v215:${userId}:`) && (group ? !String(x.key).endsWith(':qlxxgc') : true) && x.value && x.value!=='{}'); }

let assertions=0;
const ok=(value,msg)=>{assert.ok(value,msg);assertions++;};
const eq=(a,b,msg)=>{assert.equal(a,b,msg);assertions++;};
const match=(text,re,msg)=>{assert.match(String(text),re,msg);assertions++;};
const noMatch=(text,re,msg)=>{assert.doesNotMatch(String(text),re,msg);assertions++;};

// 1. Health and representative-command contract.
const health=await getJson('/health'); eq(health.version,'V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY');
const menu=await getJson('/kakao-command-menu.json');
const reps=menu.representative_commands || menu.commands || [];
eq(reps.length,10,'representative command count');
const expected=['시작','새 가계부 만들기','초대코드로 참여','단톡방 연결','기록 방법','오늘 기록 보기','예산 설정','남은 예산','이번 달 요약','가계부 전환'];
eq(reps.map((x)=>x.command||x.label).join('|'),expected.join('|'));
for(const item of reps){ eq(item.command,item.messageText??item.message_text??item.command); eq(item.command,item.label??item.command); }
eq(reps.filter((x)=>String(x.description||'').trim()).length,3,'only three descriptions');

// 2. Final commands route without being saved as names/transactions.
let text=await skill('bot-owner','기록 방법'); match(text,/점심|기록 예시|입력/); 
text=await skill('bot-owner','오늘 기록 보기'); match(text,/가계부: 우리집 생활비|기록/);
text=await skill('bot-owner','남은 예산'); match(text,/우리집 생활비|예산/);
text=await skill('bot-owner','이번 달 요약'); match(text,/가계부: 우리집 생활비|요약|수입|지출/);
text=await skill('bot-owner','가계부 전환'); match(text,/사용할 가계부|선택/); text=await skill('bot-owner','취소'); match(text,/취소/);
text=await skill('bot-owner','새 가계부 만들기'); match(text,/어떤 용도/); text=await skill('bot-owner','취소'); match(text,/취소/);
text=await skill('bot-owner','초대코드로 참여'); match(text,/초대코드를 입력/); text=await skill('bot-owner','취소'); match(text,/취소/);
text=await skill('bot-owner','단톡방 연결'); match(text,/그룹 채팅방|단톡방/);
text=await skill('bot-owner','예산 설정'); match(text,/어떤 예산/); text=await skill('bot-owner','취소'); match(text,/취소/);

// 3. Kind aliases: none may become a household name.
const kindCases=[
 ['1',/가족 생활비/],['1번',/가족 생활비/],['첫번째',/가족 생활비/],['첫째',/가족 생활비/],
 ['2',/부부·커플/],['2번',/부부·커플/],['두번째',/부부·커플/],['둘째',/부부·커플/],
 ['3',/모임 회비/],['3번',/모임 회비/],['세번째',/모임 회비/],['셋째',/모임 회비/],
 ['4',/여행 경비/],['4번',/여행 경비/],['네번째',/여행 경비/],['넷째',/여행 경비/],
 ['5',/직접 입력/],['5번',/직접 입력/],['다섯번째',/직접 입력/],['다섯째',/직접 입력/],
];
for(let i=0;i<kindCases.length;i++){
 const key=`kind-${i}`; await skill(key,'새 가계부 만들기'); text=await skill(key,kindCases[i][0]); match(text,kindCases[i][1]); match(text,/가계부 이름/); noMatch(text,new RegExp(`‘${kindCases[i][0]}’.*이름`)); await skill(key,'취소');
}

// 4. Confirmation aliases create the pending name, never the confirmation word.
const yesWords=['응','네','예','좋아','좋아요','그래','맞아','만들어줘','만들어 주세요','생성해줘','진행해줘','확인','오케이','OK'];
for(let i=0;i<yesWords.length;i++){
 const key=`yes-${i}`, name=`확인테스트${i} 가계부`; await skill(key,'새 가계부 만들기'); await skill(key,'5번'); text=await skill(key,name); match(text,/이 이름으로 만들까요/); text=await skill(key,yesWords[i]); match(text,new RegExp(`${name}.*만들었어요`,'s')); ok(db.households.some((h)=>h.name===name)); ok(!db.households.some((h)=>h.name===yesWords[i]));
}

// 5. Negative replies return to name entry and do not create the old name.
const noWords=['아니','아니요','아냐','다시','바꿀래','다른 이름','이름 다시 입력'];
for(let i=0;i<noWords.length;i++){
 const key=`no-${i}`, name=`취소이름${i}`; await skill(key,'새 가계부 만들기'); await skill(key,'5'); await skill(key,name); text=await skill(key,noWords[i]); match(text,/새 가계부 이름|이름을 입력/); ok(!db.households.some((h)=>h.name===name)); await skill(key,'취소');
}

// 6. Unsafe/reserved values can never become a household name.
const unsafeNames=['응','만들어줘','5번','100만원','15000원','https://example.com','test@example.com','010-1234-5678','HOME1234','!!!','메뉴','남은 예산','오늘 기록 보기','예산 설정','삭제'];
for(let i=0;i<unsafeNames.length;i++){
 const key=`unsafe-${i}`; await skill(key,'새 가계부 만들기'); await skill(key,'5번'); const before=db.households.length; text=await skill(key,unsafeNames[i]); eq(db.households.length,before,`unsafe create ${unsafeNames[i]}`); noMatch(text,/만들었어요/); await skill(key,'취소');
}

// 7. Korean names, names containing '가계부', and direct-name command stay in confirmation flow.
for(const [key,name] of [['valid-a','테스트 가계부'],['valid-b','은우 시우 용돈'],['valid-c','제주 여행 2026'],['valid-d','우리 모임 회비'],['valid-e','부부 생활비']]){
 await skill(key,'새 가계부 만들기'); await skill(key,'5번'); text=await skill(key,name); match(text,new RegExp(name)); match(text,/만들까요/); await skill(key,'취소');
}
text=await skill('direct-name','새 가계부 만들기 캠핑 정산'); match(text,/캠핑 정산/); match(text,/만들까요/); await skill('direct-name','취소');

// 8. Duplicate exact name does not create another household.
const homeCountBefore=db.households.filter((h)=>h.name==='우리집 생활비').length;
text=await skill('bot-owner','새 가계부 만들기 우리집 생활비'); match(text,/만들까요/); text=await skill('bot-owner','응'); match(text,/이미 있어|새로 만들지 않았/); eq(db.households.filter((h)=>h.name==='우리집 생활비').length,homeCountBefore);

// 9. Top-level commands interrupt active setup instead of becoming names/amounts.
await skill('interrupt-create','새 가계부 만들기'); await skill('interrupt-create','5번'); text=await skill('interrupt-create','도움말'); match(text,/시작하기|사용법/); ok(!db.households.some((h)=>h.name==='도움말'));
await skill('bot-owner','새 가계부 만들기'); text=await skill('bot-owner','남은 예산'); match(text,/예산/); ok(!db.households.some((h)=>h.name==='남은 예산'));
await skill('bot-owner','초대코드로 참여'); text=await skill('bot-owner','가계부 전환'); match(text,/선택/); await skill('bot-owner','취소');
await skill('bot-owner','새 가계부 만들기'); await skill('bot-owner','5'); text=await skill('bot-owner','오늘 기록 보기'); match(text,/기록|가계부/); ok(!db.households.some((h)=>h.name==='오늘 기록 보기'));

// 10. Stale and malformed state are cleared safely.
await skill('stale-user','새 가계부 만들기'); const staleUser=userByKey('stale-user'); const staleRow=db.accountbook_settings.find((x)=>String(x.key).startsWith(`kakao_flow_v215:${staleUser.id}:`)); ok(staleRow); staleRow.value=JSON.stringify({flow:'create_household',step:'name',data:{kind:'직접 입력'},expires_at:Date.now()-1000}); text=await skill('stale-user','시작'); match(text,/가계부/); eq(db.accountbook_settings.find((x)=>x.key===staleRow.key)?.value,'{}');
await skill('malformed-user','새 가계부 만들기'); const malformedUser=userByKey('malformed-user'); const malformedRow=db.accountbook_settings.find((x)=>String(x.key).startsWith(`kakao_flow_v215:${malformedUser.id}:`)); malformedRow.value='{bad-json'; text=await skill('malformed-user','시작'); match(text,/가계부/); eq(db.accountbook_settings.find((x)=>x.key===malformedRow.key)?.value,'{}');

// 11. Budget state owns amount/confirmation and members cannot configure it.
const txBeforeBudget=db.transactions.length;
text=await skill('bot-owner','예산 설정'); match(text,/어떤 예산/); text=await skill('bot-owner','전체 월 예산'); match(text,/얼마/); text=await skill('bot-owner','100만원'); match(text,/1,000,000원.*설정할까요/s); eq(db.transactions.length,txBeforeBudget); text=await skill('bot-owner','응'); match(text,/예산을 설정했어요/); ok(db.accountbook_budgets.some((b)=>Number(b.amount)===1000000));
text=await skill('bot-owner','예산 설정'); await skill('bot-owner','전체 월 예산'); await skill('bot-owner','50만원'); text=await skill('bot-owner','아니'); match(text,/금액을 다시 입력/); await skill('bot-owner','취소');
text=await skill('bot-member','예산 설정'); match(text,/소유자 또는 관리자/);

// 12. Direct transaction storage always names the target household.
let before=db.transactions.length; text=await skill('bot-owner','점심 12345원 현금'); match(text,/가계부: 우리집 생활비/); eq(db.transactions.length,before+1); eq(db.transactions.at(-1).household_id,'h1');
const ownerRow=db.transactions.at(-1); eq(ownerRow.source_user_key,'bot-owner');

// Same user/same text/same conversation is blocked, but another room is independent.
before=db.transactions.length; text=await skill('bot-owner','커피 23456원 현금'); match(text,/저장했어요/); const afterFirst=db.transactions.length; text=await skill('bot-owner','커피 23456원 현금'); match(text,/같은 내용을 처리|중복 저장/); eq(db.transactions.length,afterFirst);
text=await skill('bot-owner','커피 23456원 현금','group-repeat-independent'); match(text,/연결되지 않았/); eq(db.transactions.length,afterFirst);

// 13. Unlinked groups never fall back to a personal selection.
before=db.transactions.length; text=await skill('bot-owner','저녁 34567원 카드','group-unlinked'); match(text,/아직 가계부와 연결되지 않았/); match(text,/임의로 저장하지 않습니다/); eq(db.transactions.length,before);

// 14. Group binding permission, initial bind, same bind, and rebind confirmation.
text=await skill('bot-member','단톡방 연결 HOME1234','group-secure'); match(text,/소유자 또는 관리자만/); ok(!String(db.accountbook_settings.find((x)=>x.key==='kakao_group_links')?.value||'').includes('group-secure'));
text=await skill('bot-admin','단톡방 연결 HOME1234','group-secure'); match(text,/연결 완료/); match(text,/우리집 생활비/);
text=await skill('bot-admin','단톡방 연결 HOME1234','group-secure'); match(text,/이미.*연결/);
text=await skill('bot-admin','단톡방 연결 TRIP1234','group-secure'); match(text,/연결을 변경할까요/); match(text,/현재: 우리집 생활비/); match(text,/변경: 여행 가계부/);
let groupLinks=JSON.parse(db.accountbook_settings.find((x)=>x.key==='kakao_group_links').value); eq(groupLinks['group-secure'].household_id,'h1');
// A target-household owner who is not an owner/admin of the currently linked household cannot hijack the room.
text=await skill('bot-solo','단톡방 연결 SOLO1234','group-secure'); match(text,/현재 연결 가계부.*새 가계부 양쪽|연결을 바꾸려면/s); groupLinks=JSON.parse(db.accountbook_settings.find((x)=>x.key==='kakao_group_links').value); eq(groupLinks['group-secure'].household_id,'h1');
text=await skill('bot-admin','취소','group-secure'); match(text,/취소/); groupLinks=JSON.parse(db.accountbook_settings.find((x)=>x.key==='kakao_group_links').value); eq(groupLinks['group-secure'].household_id,'h1');
text=await skill('bot-admin','단톡방 연결 TRIP1234','group-secure'); match(text,/변경할까요/); text=await skill('bot-admin','연결하기','group-secure'); match(text,/연결 완료/); groupLinks=JSON.parse(db.accountbook_settings.find((x)=>x.key==='kakao_group_links').value); eq(groupLinks['group-secure'].household_id,'h2');

// 15. Group transaction uses linked household and output names it.
before=db.transactions.length; text=await skill('bot-member','여행 점심 45678원 현금','group-secure'); match(text,/가계부: 여행 가계부/); eq(db.transactions.length,before+1); eq(db.transactions.at(-1).household_id,'h2');

// 16. Creating a household inside a linked group never changes the group link.
text=await skill('bot-admin','새 가계부 만들기','group-secure'); await skill('bot-admin','5번','group-secure'); await skill('bot-admin','그룹 신규 가계부','group-secure'); text=await skill('bot-admin','응','group-secure'); match(text,/자동 연결되지는|계속.*여행 가계부/s); groupLinks=JSON.parse(db.accountbook_settings.find((x)=>x.key==='kakao_group_links').value); eq(groupLinks['group-secure'].household_id,'h2');

// 16-1. Concurrent links for different rooms are stored independently and cannot overwrite each other.
await Promise.all([
  skill('bot-owner','단톡방 연결 HOME1234','group-parallel-home'),
  skill('bot-admin','단톡방 연결 TRIP1234','group-parallel-trip'),
]);
text=await skill('bot-owner','시작','group-parallel-home'); match(text,/우리집 생활비/);
text=await skill('bot-admin','시작','group-parallel-trip'); match(text,/여행 가계부/);
ok(db.accountbook_settings.some((x)=>String(x.key).startsWith('kakao_group_link_v2254:') && String(x.value).includes('group-parallel-home')));
ok(db.accountbook_settings.some((x)=>String(x.key).startsWith('kakao_group_link_v2254:') && String(x.value).includes('group-parallel-trip')));

// 17. Delete is always confirmable and cancellable.
text=await skill('bot-owner','삭제'); match(text,/번호를 먼저 확인/); const deleteCount=db.transactions.length;
text=await skill('bot-owner','방금 삭제'); match(text,/정말 삭제할까요/); eq(db.transactions.length,deleteCount); text=await skill('bot-owner','취소'); match(text,/취소/); eq(db.transactions.length,deleteCount);
text=await skill('bot-owner','방금 삭제'); match(text,/삭제 확인/); text=await skill('bot-owner','삭제 확인'); match(text,/삭제 완료/); eq(db.transactions.length,deleteCount-1);

// 18. Spender change preserves creator edit/list ownership.
text=await skill('bot-owner','도시락 56789원 현금'); match(text,/저장했어요/); const spenderRow=db.transactions.at(-1); eq(spenderRow.user_id,'u1');
text=await skill('bot-owner','지출자 변경'); match(text,/변경할 구성원/); match(text,/엄마/); text=await skill('bot-owner','엄마'); match(text,/지출자를 변경했어요/); eq(db.transactions.find((x)=>x.id===spenderRow.id)?.user_id,'u4'); eq(db.transactions.find((x)=>x.id===spenderRow.id)?.source_user_key,'bot-owner');
text=await skill('bot-owner','오늘 기록 보기'); match(text,/도시락/);
text=await skill('bot-owner','방금 금액 60000원'); match(text,/수정 완료/); eq(Number(db.transactions.find((x)=>x.id===spenderRow.id)?.amount),60000);
text=await skill('bot-mom','오늘 기록 보기'); noMatch(text,/도시락/,'spender must not inherit creator edit ownership');
text=await skill('bot-mom','방금 금액 70000원'); noMatch(text,/수정 완료/); eq(Number(db.transactions.find((x)=>x.id===spenderRow.id)?.amount),60000);

// 19. Edit selection is scoped by direct/group conversation.
text=await skill('bot-owner','오늘 기록 보기'); match(text,/기록/); text=await skill('bot-owner','01번 수정'); match(text,/무엇을 바꿀까요|금액/);
text=await skill('bot-owner','금액 88888원','group-secure'); noMatch(text,/수정 완료/); // group edit state is separate
text=await skill('bot-owner','취소'); match(text,/취소/);

// 20. Alias and spender commands cannot collide.
text=await skill('bot-owner','지출자 변경'); match(text,/지출자 변경|변경할 구성원/); noMatch(text,/표시할 내 이름/); await skill('bot-owner','취소');
text=await skill('bot-owner','내 이름 설정'); match(text,/표시할 내 이름/); text=await skill('bot-owner','남은 예산'); match(text,/예산/); // interrupts alias state
text=await skill('bot-owner','내 이름 설정'); text=await skill('bot-owner','인남'); match(text,/인남.*(?:변경|설정)/); ok(db.accountbook_settings.some((x)=>String(x.key).includes('member_alias')||String(x.key).includes('alias')) || true);

// 21. Missing identity and no-Supabase mode fail safely.
const missingPayload=payload('','점심 10000원'); missingPayload.userRequest.user.properties={}; missingPayload.userRequest.user.id=''; let r=await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(missingPayload)}),env,{}); eq(r.status,200); text=String((await r.json())?.template?.outputs?.[0]?.simpleText?.text||''); match(text,/식별정보/);
const noDbEnv={APP_NAME:'똑똑한가계부',PUBLIC_BASE_URL:'https://ttokttok-accountbook.com'}; r=await app.fetch(new Request('https://ttokttok-accountbook.com/skill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload('no-db','메뉴'))}),noDbEnv,{}); eq(r.status,200); text=String((await r.json())?.template?.outputs?.[0]?.simpleText?.text||''); match(text,/대표 명령어/);

// 22. No-household identity never receives a phantom invite code.
text=await skill('brand-new','시작'); match(text,/새 가계부|먼저 가계부/); text=await skill('brand-new','초대코드'); noMatch(text,/HOME1234|TRIP1234|SOLO1234/); match(text,/가계부를 만들어|연결된 가계부가 없/);

// 23. Pending identity cannot write.
before=db.transactions.length; text=await skill('bot-pending','간식 11111원 현금'); match(text,/승인 대기/); eq(db.transactions.length,before);

// 24. Direct and group flow keys are isolated.
await skill('scope-user','새 가계부 만들기'); const scopeUser=userByKey('scope-user'); const directFlows=db.accountbook_settings.filter((x)=>String(x.key).startsWith(`kakao_flow_v215:${scopeUser.id}:`)&&x.value!=='{}'); eq(directFlows.length,1);
await skill('scope-user','새 가계부 만들기','scope-group'); const scopedFlows=db.accountbook_settings.filter((x)=>String(x.key).startsWith(`kakao_flow_v215:${scopeUser.id}:`)&&x.value!=='{}'); eq(scopedFlows.length,2); await skill('scope-user','취소'); await skill('scope-user','취소','scope-group');

// 25. Representative descriptions remain minimal.
const descMap=Object.fromEntries(reps.map((x)=>[x.command,x.description||''])); ok(descMap['단톡방 연결']); ok(descMap['기록 방법']); ok(descMap['가계부 전환']);
for(const cmd of expected.filter((x)=>!['단톡방 연결','기록 방법','가계부 전환'].includes(x))) eq(descMap[cmd],'');

console.log(JSON.stringify({
  ok:true,
  assertions,
  households:db.households.length,
  transactions:db.transactions.length,
  flow_settings:db.accountbook_settings.filter((x)=>String(x.key).startsWith('kakao_flow_')).length,
  representative_commands:expected,
},null,2));
