import app from './src/index.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
let seq = 1;
const now = new Date().toISOString();
const db = {
  users: [
    { id: 'primary-1', kakao_user_key: 'kakao_login:111', nickname: 'Bin', created_at: now },
    { id: 'secondary-1', kakao_user_key: 'merged:secondary-1:1', nickname: 'Bin (통합됨)', created_at: now },
    { id: 'primary-2', kakao_user_key: 'kakao_login:222', nickname: '주계정2', created_at: now },
    { id: 'secondary-2', kakao_user_key: 'merged:secondary-2:2', nickname: '보조계정2 (통합됨)', created_at: now },
    { id: 'primary-3', kakao_user_key: 'kakao_login:333', nickname: '최종 주계정', created_at: now },
    { id: 'secondary-3b', kakao_user_key: 'merged:secondary-3b:3', nickname: '중간 계정 (통합됨)', created_at: now },
    { id: 'secondary-3a', kakao_user_key: 'merged:secondary-3a:4', nickname: '최초 계정 (통합됨)', created_at: now },
  ],
  households: [
    { id: 'household-1', name: '기존 가족 가계부', invite_code: 'ABCDEFGH', created_at: now },
    { id: 'household-3', name: '연쇄 통합 가계부', invite_code: 'CHAIN333', created_at: now },
  ],
  household_members: [
    { household_id: 'household-1', user_id: 'primary-1', role: 'owner', created_at: now },
    { household_id: 'household-3', user_id: 'primary-3', role: 'owner', created_at: now },
  ],
  accountbook_settings: [
    {
      id: 'setting-legacy',
      key: `identity_merge_audit:${new Date().toISOString()}:secondary-1`,
      value: JSON.stringify({ primary_user_id: 'primary-1', secondary_user_id: 'secondary-1', merged_at: now, version: 'V22.4.1' }),
      created_at: now,
    },
    {
      id: 'setting-direct',
      key: 'identity_merge_redirect:secondary-2',
      value: JSON.stringify({ primary_user_id: 'primary-2', secondary_user_id: 'secondary-2', merged_at: now, version: 'V22.6.1' }),
      created_at: now,
    },
    {
      id: 'setting-chain-a',
      key: 'identity_merge_redirect:secondary-3a',
      value: JSON.stringify({ primary_user_id: 'secondary-3b', secondary_user_id: 'secondary-3a', merged_at: now, version: 'V22.6.1' }),
      created_at: now,
    },
    {
      id: 'setting-chain-b',
      key: 'identity_merge_redirect:secondary-3b',
      value: JSON.stringify({ primary_user_id: 'primary-3', secondary_user_id: 'secondary-3b', merged_at: now, version: 'V22.6.1' }),
      created_at: now,
    },
  ],
  transactions: [],
  accountbook_budgets: [],
  accountbook_categories: [],
  accountbook_recurring: [],
};

function assert(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function decodeFilter(expr) {
  return decodeURIComponent(String(expr || ''));
}

function likeRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function rowMatches(row, key, expr) {
  const decoded = decodeFilter(expr);
  const dot = decoded.indexOf('.');
  const op = dot >= 0 ? decoded.slice(0, dot) : 'eq';
  const val = dot >= 0 ? decoded.slice(dot + 1) : decoded;
  const actual = String(row[key] ?? '');
  if (op === 'eq') return actual === val;
  if (op === 'like' || op === 'ilike') {
    const rx = likeRegex(val);
    return op === 'ilike' ? rx.test(actual.toLowerCase()) : rx.test(actual);
  }
  if (op === 'gte') return actual >= val;
  if (op === 'lte') return actual <= val;
  if (op === 'lt') return actual < val;
  if (op === 'gt') return actual > val;
  return true;
}

function tableRows(table, url) {
  let rows = clone(db[table] || []);
  const ignored = new Set(['select', 'order', 'limit', 'on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const vals = url.searchParams.getAll(key);
    rows = rows.filter((r) => vals.every((v) => rowMatches(r, key, v)));
  }
  const order = String(url.searchParams.get('order') || '');
  if (order) {
    const rules = order.split(',').map((x) => x.trim().split('.'));
    rows.sort((a, b) => {
      for (const [key, dir] of rules) {
        const av = String(a[key] ?? '');
        const bv = String(b[key] ?? '');
        if (av === bv) continue;
        return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }
  const limit = Number(url.searchParams.get('limit') || rows.length || 0);
  return rows.slice(0, Number.isFinite(limit) ? limit : rows.length);
}

function upsert(table, item, keys) {
  const rows = db[table] || (db[table] = []);
  const idx = rows.findIndex((r) => keys.every((k) => String(r[k] ?? '') === String(item[k] ?? '')));
  const row = {
    ...(idx >= 0 ? rows[idx] : {}),
    ...item,
    id: item.id || (idx >= 0 ? rows[idx].id : `${table}-${seq++}`),
    created_at: item.created_at || (idx >= 0 ? rows[idx].created_at : new Date().toISOString()),
  };
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  return clone(row);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  const data = init.body ? JSON.parse(init.body) : null;
  let payload = null;
  if (method === 'GET') {
    payload = tableRows(table, url);
  } else if (method === 'POST') {
    const items = Array.isArray(data) ? data : [data];
    const saved = [];
    for (const item of items) {
      if (table === 'users') saved.push(upsert(table, item, ['kakao_user_key']));
      else if (table === 'households') saved.push(upsert(table, item, ['id']));
      else if (table === 'household_members') saved.push(upsert(table, item, ['household_id', 'user_id']));
      else if (table === 'accountbook_settings') saved.push(upsert(table, item, ['key']));
      else saved.push(upsert(table, item, ['id']));
    }
    payload = saved;
  } else if (method === 'PATCH') {
    const matches = tableRows(table, url);
    for (const match of matches) {
      const rows = db[table] || [];
      const idx = rows.findIndex((r) => r.id === match.id || (table === 'household_members' && r.household_id === match.household_id && r.user_id === match.user_id));
      if (idx >= 0) rows[idx] = { ...rows[idx], ...data };
    }
    payload = matches.map((x) => ({ ...x, ...data }));
  } else if (method === 'DELETE') {
    const matches = tableRows(table, url);
    const sigs = new Set(matches.map((x) => `${x.id || ''}|${x.household_id || ''}|${x.user_id || ''}`));
    db[table] = (db[table] || []).filter((r) => !sigs.has(`${r.id || ''}|${r.household_id || ''}|${r.user_id || ''}`));
    payload = [];
  }
  return new Response(JSON.stringify(payload ?? []), { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  USER_SESSION_SECRET: 'session-secret',
};

function base64UrlEncode(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sessionToken(userId) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${exp}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.USER_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = base64UrlEncode(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return `${data}.${sig}`;
}

function cookieHeaderFromSetCookie(setCookie) {
  return String(setCookie || '').split(';')[0];
}

let health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, {});
assert((await health.text()).includes('V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY'), 'health exposes V22.8.2 with V22.6.1 recovery');

const staleLegacy = await sessionToken('secondary-1');
let res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/households', {
  headers: { cookie: `ab_user=${encodeURIComponent(staleLegacy)}` },
}), env, {});
assert(res.status === 303, 'legacy stale session is redirected once for recovery');
assert(res.headers.get('x-accountbook-session-recovered') === '1', 'recovery response is marked');
assert((res.headers.get('set-cookie') || '').includes('ab_user='), 'recovery response reissues user cookie');

const recoveredCookie = cookieHeaderFromSetCookie(res.headers.get('set-cookie'));
res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/households', {
  headers: { cookie: recoveredCookie },
}), env, {});
const householdHtml = await res.text();
assert(res.status === 200, 'recovered session opens household list');
assert(householdHtml.includes('기존 가족 가계부'), 'existing household is visible after recovery');
assert(!householdHtml.includes('Bin (통합됨)님'), 'merged secondary nickname is not used');

res = await app.fetch(new Request('https://ttokttok-accountbook.com/my', {
  headers: { cookie: recoveredCookie }, redirect: 'manual',
}), env, {});
assert(res.status === 303 && String(res.headers.get('location') || '').startsWith('/app?'), '/my enters an existing household instead of showing first-start page');


const staleChain = await sessionToken('secondary-3a');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/households', {
  headers: { cookie: `ab_user=${encodeURIComponent(staleChain)}` },
}), env, {});
assert(res.status === 303, 'multi-step merged session starts recovery');
const chainCookie = cookieHeaderFromSetCookie(res.headers.get('set-cookie'));
res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/households', { headers: { cookie: chainCookie } }), env, {});
const chainHtml = await res.text();
assert(chainHtml.includes('연쇄 통합 가계부'), 'multi-step merge chain resolves to final primary account');

const staleDirect = await sessionToken('secondary-2');
const form = new URLSearchParams({
  household_name: '새 모임 가계부',
  display_name: '주계정2',
  access_code: 'recovery2261',
  access_code_confirm: 'recovery2261',
  return_to: '/my/households',
});
res = await app.fetch(new Request('https://ttokttok-accountbook.com/my/create', {
  method: 'POST',
  headers: { cookie: `ab_user=${encodeURIComponent(staleDirect)}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: form,
  redirect: 'manual',
}), env, {});
assert(res.status === 303, 'POST with stale session completes without losing form body');
const created = db.households.find((h) => h.name === '새 모임 가계부');
assert(!!created, 'new household is created');
assert(db.household_members.some((m) => m.household_id === created.id && m.user_id === 'primary-2'), 'POST writes membership to primary account');
assert(!db.household_members.some((m) => m.household_id === created.id && m.user_id === 'secondary-2'), 'POST never recreates secondary membership');

console.log('SMOKE_V2261_IDENTITY_SESSION_RECOVERY_OK');
