import app from './src/index.js';
import assert from 'node:assert/strict';

const clone = (v) => JSON.parse(JSON.stringify(v));
const db = {
  users: [
    { id: 'u1', kakao_user_key: 'bot-u1', nickname: 'Bin', created_at: '2026-07-01T00:00:00Z' },
    { id: 'u2', kakao_user_key: 'bot-u2', nickname: '신규', created_at: '2026-07-01T00:00:00Z' },
    { id: 'u3', kakao_user_key: 'bot-u3', nickname: '단독', created_at: '2026-07-01T00:00:00Z' },
  ],
  households: [
    { id: 'h1', name: '은시우네 가계부', invite_code: 'CODE1111', created_at: '2026-07-01T00:00:00Z' },
    { id: 'h2', name: '모임 가계부', invite_code: 'CODE2222', created_at: '2026-07-02T00:00:00Z' },
    { id: 'h3', name: '단독 가계부', invite_code: 'CODE3333', created_at: '2026-07-03T00:00:00Z' },
  ],
  household_members: [
    { household_id: 'h1', user_id: 'u1', role: 'owner', created_at: '2026-07-01T00:00:00Z' },
    { household_id: 'h2', user_id: 'u1', role: 'owner', created_at: '2026-07-02T00:00:00Z' },
    { household_id: 'h3', user_id: 'u3', role: 'owner', created_at: '2026-07-03T00:00:00Z' },
  ],
  accountbook_settings: [],
  accountbook_budgets: [],
  transactions: [],
  accountbook_categories: [],
  payment_assets: [],
};

function parseExpr(expr) {
  const dot = expr.indexOf('.');
  return dot < 0 ? [expr, ''] : [expr.slice(0, dot), decodeURIComponent(expr.slice(dot + 1))];
}
function filterRows(rows, url) {
  let out = rows.slice();
  const ignored = new Set(['select','order','limit','on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const exprs = url.searchParams.getAll(key);
    out = out.filter((row) => exprs.every((expr) => {
      const [op, val] = parseExpr(expr);
      const actual = String(row[key] ?? '');
      if (op === 'eq') return actual === val;
      if (op === 'neq') return actual !== val;
      if (op === 'gte') return actual >= val;
      if (op === 'gt') return actual > val;
      if (op === 'lte') return actual <= val;
      if (op === 'lt') return actual < val;
      if (op === 'is') return val === 'null' ? row[key] == null : true;
      return true;
    }));
  }
  const order = url.searchParams.get('order');
  if (order) {
    const rules = order.split(',').map((x) => x.trim().split('.'));
    out.sort((a,b) => {
      for (const [key, dir] of rules) {
        const av = String(a[key] ?? ''), bv = String(b[key] ?? '');
        if (av === bv) continue;
        return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }
  const limit = Number(url.searchParams.get('limit') || out.length);
  return clone(out.slice(0, limit));
}
function upsert(table, rows, conflictKeys = []) {
  for (const row of rows) {
    let idx = -1;
    if (conflictKeys.length) idx = db[table].findIndex((x) => conflictKeys.every((k) => String(x[k] ?? '') === String(row[k] ?? '')));
    if (idx >= 0) db[table][idx] = { ...db[table][idx], ...clone(row) };
    else db[table].push({ id: row.id || `${table}-${db[table].length + 1}`, created_at: row.created_at || new Date().toISOString(), ...clone(row) });
  }
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  const method = String(init.method || 'GET').toUpperCase();
  db[table] ||= [];
  if (method === 'GET') return new Response(JSON.stringify(filterRows(db[table], url)), { status: 200, headers: { 'content-type':'application/json' } });
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const conflict = String(url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
    upsert(table, rows, conflict);
    const representation = String(new Headers(init.headers || {}).get('prefer') || '').includes('return=representation');
    const result = rows.map((r) => db[table].find((x) => (conflict.length ? conflict.every((k)=>String(x[k])===String(r[k])) : x === r)) || r);
    return new Response(representation ? JSON.stringify(result) : '', { status: 201, headers: { 'content-type':'application/json' } });
  }
  if (method === 'PATCH') {
    const targets = filterRows(db[table], url);
    const ids = new Set(targets.map((x) => x.id || `${x.household_id}|${x.user_id}|${x.key}`));
    db[table] = db[table].map((x) => ids.has(x.id || `${x.household_id}|${x.user_id}|${x.key}`) ? { ...x, ...body } : x);
    return new Response('', { status: 204 });
  }
  if (method === 'DELETE') {
    const targets = filterRows(db[table], url);
    const keys = new Set(targets.map((x) => JSON.stringify(x)));
    db[table] = db[table].filter((x) => !keys.has(JSON.stringify(x)));
    return new Response('', { status: 204 });
  }
  return new Response('{}', { status: 200, headers: { 'content-type':'application/json' } });
};

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test',
  KAKAO_REPEAT_GUARD_SECONDS: '0',
};
function payload(userKey, utterance, groupKey = '') {
  return {
    intent: { id:'i', name:'폴백 블록' },
    userRequest: {
      timezone:'Asia/Seoul', utterance, block:{id:'b',name:'폴백 블록'},
      user:{ id:userKey, type:'botUserKey', properties:{ botUserKey:userKey, ...(groupKey ? { botGroupKey:groupKey } : {}) } },
    },
    bot:{ id:'bot', name:'똑똑한가계부' }, action:{ id:'a', name:'skill', params:{}, detailParams:{}, clientExtra:{} }, contexts:[],
  };
}
async function skill(userKey, utterance, groupKey = '') {
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload(userKey, utterance, groupKey)) }), env, {});
  assert.equal(res.status, 200);
  const j = await res.json();
  return String(j?.template?.outputs?.[0]?.simpleText?.text || '');
}

let res = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, {});
assert.equal((await res.json()).version, 'V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX');

// Direct chat: multiple households must not silently use the newest/first row.
let text = await skill('bot-u1', '시작');
assert.match(text, /사용할 가계부를 선택/);
assert.match(text, /은시우네 가계부/);
assert.match(text, /모임 가계부/);
assert.doesNotMatch(text, /현재 선택 가계부/);

text = await skill('bot-u1', '가계부 선택 2');
assert.match(text, /은시우네 가계부.*선택/s);
const selectedRow = db.accountbook_settings.find((x) => x.key === 'kakao_selected_household_v2251:u1');
assert.equal(selectedRow?.value, 'h1'); // list is newest first: h2=1, h1=2

text = await skill('bot-u1', '점심 15001원 현금');
assert.match(text, /가계부: 은시우네 가계부/);
assert.equal(db.transactions.at(-1)?.household_id, 'h1');

// Unlinked group must never fall back to the personal selected household.
const before = db.transactions.length;
text = await skill('bot-u1', '점심 16001원 현대카드', 'group-unlinked');
assert.match(text, /아직 가계부와 연결되지 않았/);
assert.match(text, /임의로 저장하지 않습니다/);
assert.equal(db.transactions.length, before);

text = await skill('bot-u1', '초대코드', 'group-unlinked-2');
assert.match(text, /초대코드를 확인할 가계부를 선택/);
assert.doesNotMatch(text, /CODE1111|CODE2222/);

// Bind the room explicitly, then save into the linked household only.
text = await skill('bot-u1', '단톡방 연결 CODE2222', 'group-linked');
assert.match(text, /단톡방 연결 완료/);
assert.match(text, /모임 가계부/);
text = await skill('bot-u1', '저녁 17001원 국민카드', 'group-linked');
assert.match(text, /가계부: 모임 가계부/);
assert.equal(db.transactions.at(-1)?.household_id, 'h2');


// Even one historical household must be explicitly confirmed once before code/read/write use.
text = await skill('bot-u3', '시작');
assert.match(text, /카카오 챗봇 계정에서 사용할 가계부를 선택/);
assert.match(text, /단독 가계부/);
assert.doesNotMatch(text, /현재 선택 가계부/);
text = await skill('bot-u3', '초대코드');
assert.match(text, /초대코드를 확인할 가계부|번호 또는 가계부 이름/);
assert.doesNotMatch(text, /CODE3333/);
text = await skill('bot-u3', '1');
assert.match(text, /CODE3333/);
assert.equal(db.accountbook_settings.find((x) => x.key === 'kakao_selected_household_v2251:u3'), undefined);
text = await skill('bot-u3', '가계부 전환');
assert.match(text, /단독 가계부.*선택/s);
text = await skill('bot-u3', '초대코드 보여줘');
assert.match(text, /CODE3333/);

// A truly new chatbot identity must not receive an invite code or phantom household.
text = await skill('bot-u2', '시작');
assert.match(text, /먼저 가계부를 만들어/);
text = await skill('bot-u2', '초대코드');
assert.match(text, /먼저 가계부를 만들어|연결된 가계부가 없/);
assert.doesNotMatch(text, /CODE1111|CODE2222/);

console.log(JSON.stringify({ ok:true, transactions:db.transactions.map((x)=>({household_id:x.household_id,amount:x.amount})), settings:db.accountbook_settings.filter((x)=>String(x.key).includes('kakao_')).map((x)=>({key:x.key,value:x.value})) }, null, 2));
