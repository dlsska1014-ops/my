import app from './src/index.js';
import assert from 'node:assert/strict';

const db = {
  users: [{ id: 'u1', kakao_user_key: 'k1', nickname: '인남', created_at: '2026-01-01T00:00:00Z' }],
  households: [{ id: 'h1', name: '우리집 생활비', invite_code: 'ABC12345', created_at: '2026-01-01T00:00:00Z' }],
  household_members: [{ household_id: 'h1', user_id: 'u1', role: 'owner', created_at: '2026-01-01T00:00:00Z' }],
  accountbook_settings: [],
  accountbook_budgets: [
    { id: 'b1', household_id: 'h1', month: '2026-07', category: '식비', amount: 1000000, created_at: '2026-07-01T00:00:00Z' },
    { id: 'b2', household_id: 'h1', month: '2026-07', category: '교통', amount: 300000, created_at: '2026-07-01T00:00:00Z' },
  ],
  transactions: [
    { id: 't1', household_id: 'h1', user_id: 'u1', type: 'expense', amount: 12000, category: '식비', memo: '점심', payment_method: '국민카드', transaction_date: '2026-07-10', source: 'kakao', raw_text: '점심 12000원 국민카드', created_at: '2026-07-10T03:00:00Z' },
    { id: 't2', household_id: 'h1', user_id: 'u1', type: 'expense', amount: 5000, category: '카페/간식', memo: '=HYPERLINK("x")', payment_method: '현금', transaction_date: '2026-07-11', source: 'kakao', raw_text: '커피 5000원', created_at: '2026-07-11T03:00:00Z' },
    { id: 't3', household_id: 'h1', user_id: 'u1', type: 'income', amount: 2500000, category: '급여', memo: '월급', payment_method: '통장', transaction_date: '2026-07-01', source: 'web', raw_text: '월급 250만원', created_at: '2026-07-01T03:00:00Z' },
  ],
};

let supabaseCalls = 0;
const clone = (x) => JSON.parse(JSON.stringify(x));
function filterRows(rows, url) {
  let out = rows.slice();
  const ignored = new Set(['select','order','limit','on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const exprs = url.searchParams.getAll(key);
    out = out.filter((row) => exprs.every((expr) => {
      const dot = expr.indexOf('.');
      const op = expr.slice(0, dot), val = decodeURIComponent(expr.slice(dot + 1));
      const actual = String(row[key] ?? '');
      if (op === 'eq') return actual === val;
      if (op === 'gte') return actual >= val;
      if (op === 'lt') return actual < val;
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
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  supabaseCalls++;
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  if (String(init.method || 'GET').toUpperCase() === 'GET') {
    return new Response(JSON.stringify(filterRows(db[table] || [], url)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test',
  USER_SESSION_SECRET: 'secret',
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function session(userId) {
  const exp = Math.floor(Date.now()/1000) + 3600;
  const data = `${userId}|${exp}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.USER_SESSION_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${sig}`;
}

let res = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, {});
let health = await res.json();
assert.equal(health.version, 'V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX');

res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/analysis/app.js'), env, {});
const js = await res.text();
assert.equal(res.status, 200);
assert.match(res.headers.get('content-type') || '', /javascript/);
assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
assert.match(js, /function cell\(v\)/);
assert.match(js, /\^\[=\+\\-@\]/);
new Function(js);

const token = await session('u1');
supabaseCalls = 0;
res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/analysis?household_id=h1&month=2026-07', { headers: { cookie: `ab_user=${encodeURIComponent(token)}` } }), env, {});
const html = await res.text();
assert.equal(res.status, 200);
assert.match(html, /분석 스튜디오|최근 12개월 기록/);
assert.match(html, /window\.__INSIGHT__/);
assert.match(html, /\/my\/analysis\/app\.js/);
assert.match(html, /종합 리포트/);
assert.match(html, /우리집 생활비/);
assert.ok(supabaseCalls <= 11, `too many supabase calls: ${supabaseCalls}`);
const analysisCalls = supabaseCalls;

res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/analysis?view=report&household_id=h1&month=2026-07', { headers: { cookie: `ab_user=${encodeURIComponent(token)}` } }), env, {});
const report = await res.text();
assert.equal(res.status, 200);
assert.match(report, /종합 리포트/);
assert.match(report, /← 분석 스튜디오/);

console.log(JSON.stringify({ ok: true, version: health.version, app_js_bytes: js.length, html_bytes: html.length, analysis_supabase_calls: analysisCalls, total_with_report_calls: supabaseCalls }));
