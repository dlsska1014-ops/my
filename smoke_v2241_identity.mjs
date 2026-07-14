import app from './src/index.js';

const db = {
  users: [], households: [], household_members: [], accountbook_settings: [],
  accountbook_budgets: [], transactions: [], accountbook_categories: [],
};
let seq = 1;
const id = (prefix) => `${prefix}-${seq++}`;
const clone = (x) => JSON.parse(JSON.stringify(x));

function cmpFilter(row, key, expressions) {
  for (const expr of expressions) {
    const decoded = decodeURIComponent(expr);
    const dot = decoded.indexOf('.');
    const op = decoded.slice(0, dot);
    const val = decoded.slice(dot + 1);
    const actual = String(row[key] ?? '');
    if (op === 'eq' && actual !== val) return false;
    if (op === 'gte' && actual < val) return false;
    if (op === 'lt' && actual >= val) return false;
  }
  return true;
}

function tableRows(table, url) {
  let rows = db[table] || [];
  const ignored = new Set(['select','order','limit','on_conflict']);
  for (const key of new Set([...url.searchParams.keys()])) {
    if (ignored.has(key)) continue;
    const vals = url.searchParams.getAll(key);
    rows = rows.filter((r) => cmpFilter(r, key, vals));
  }
  const order = url.searchParams.get('order') || '';
  if (order) {
    const rules = order.split(',').map((x) => x.trim().split('.'));
    rows = [...rows].sort((a,b) => {
      for (const [k, dir] of rules) {
        const av = String(a[k] ?? ''), bv = String(b[k] ?? '');
        if (av === bv) continue;
        return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }
  const limit = Number(url.searchParams.get('limit') || rows.length);
  return clone(rows.slice(0, limit));
}

function upsert(table, item, keys) {
  const rows = db[table];
  const idx = rows.findIndex((r) => keys.every((k) => String(r[k] ?? '') === String(item[k] ?? '')));
  const now = new Date().toISOString();
  const row = { ...item, id: item.id || (idx >= 0 ? rows[idx].id : id(table)), created_at: item.created_at || (idx >= 0 ? rows[idx].created_at : now) };
  if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
  else rows.push(row);
  return clone(idx >= 0 ? rows[idx] : rows.at(-1));
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return realFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  const data = init.body ? JSON.parse(init.body) : null;
  let payload = null;
  if (method === 'GET') payload = tableRows(table, url);
  else if (method === 'POST') {
    const items = Array.isArray(data) ? data : [data];
    const saved = [];
    for (const item of items) {
      if (table === 'users') saved.push(upsert(table, item, ['kakao_user_key']));
      else if (table === 'households') saved.push(upsert(table, item, ['id']));
      else if (table === 'household_members') saved.push(upsert(table, item, ['household_id','user_id']));
      else if (table === 'accountbook_settings') saved.push(upsert(table, item, ['key']));
      else if (table === 'accountbook_budgets') saved.push(upsert(table, item, ['household_id','month','category']));
      else if (table === 'transactions') saved.push(upsert(table, item, ['id']));
      else saved.push(upsert(table, item, ['id']));
    }
    payload = saved;
  } else if (method === 'PATCH') {
    const matches = tableRows(table, url);
    for (const match of matches) {
      const idx = db[table].findIndex((r) => r.id === match.id || (table === 'household_members' && r.household_id === match.household_id && r.user_id === match.user_id));
      if (idx >= 0) db[table][idx] = { ...db[table][idx], ...data };
    }
    payload = matches.map((x) => ({ ...x, ...data }));
  } else if (method === 'DELETE') {
    const matches = tableRows(table, url);
    const ids = new Set(matches.map((x) => x.id));
    db[table] = db[table].filter((r) => !ids.has(r.id));
    payload = [];
  }
  return new Response(payload === null ? '' : JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};

const env = {
  APP_NAME: '똑똑한가계부', PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  KAKAO_REPEAT_GUARD_SECONDS: '0',
};

function assert(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  console.log('PASS:', label);
}

async function skill(utterance, userKey = 'user-1', nickname = '인남') {
  const body = JSON.stringify({ userRequest: { utterance, user: { id: userKey, type: 'botUserKey', properties: { botUserKey: userKey, nickname } } } });
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), env, {});
  const data = JSON.parse(await res.text());
  assert(res.status === 200 && data.version === '2.0', `valid skill response: ${utterance}`);
  return { text: data?.template?.outputs?.[0]?.simpleText?.text || '', qrs: data?.template?.quickReplies || [] };
}


const health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, {});
assert((await health.text()).includes('V22.5-RELEASE-CANDIDATE-SELECTIVE-UIUX-MERGE'), 'health version V22.4.1');

const publicPaths = ['/', '/service-guide', '/how-it-works', '/kakao-guide', '/budget-guide', '/group-accountbook', '/security', '/faq', '/about', '/contact', '/privacy', '/terms', '/cookies'];
for (const path of publicPaths) {
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com' + path), env, {});
  const html = await res.text();
  assert(res.status === 200 && html.includes('똑똑한가계부') && html.includes('pubHeader'), `public page ${path}`);
}

let res = await app.fetch(new Request('https://ttokttok-accountbook.com/robots.txt'), env, {});
assert(res.status === 200 && (await res.text()).includes('/sitemap.xml'), 'robots route');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/sitemap.xml'), env, {});
assert(res.status === 200 && (await res.text()).includes('/budget-guide'), 'sitemap route');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/ads.txt'), env, {});
assert(res.status === 404, 'ads.txt disabled without publisher id');
const adsEnv = { ...env, ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456' };
res = await app.fetch(new Request('https://ttokttok-accountbook.com/ads.txt'), adsEnv, {});
assert(res.status === 200 && (await res.text()).includes('pub-1234567890123456'), 'ads.txt generated from publisher id');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/'), adsEnv, {});
let adsHtml = await res.text();
assert(adsHtml.includes('google-adsense-account'), 'adsense verification meta tag');
assert(!adsHtml.includes('pagead2.googlesyndication.com'), 'actual ad script disabled by default');
const activeAdsEnv = { ...adsEnv, ADSENSE_ENABLED: '1', ADSENSE_AUTO_ADS: '1' };
res = await app.fetch(new Request('https://ttokttok-accountbook.com/'), activeAdsEnv, {});
adsHtml = await res.text();
assert(adsHtml.includes('pagead2.googlesyndication.com'), 'ad script can be activated explicitly');

let r = await skill('가계부 생성', 'loop-user', '인남');
assert(r.text.includes('어떤 용도로') && r.text.includes('가족 생활비') && r.text.includes('원하는 가계부 이름'), 'create prompt exposes visible options');
r = await skill('어떤 선택이 있는데', 'loop-user', '인남');
assert(r.text.includes('선택할 수 있는 가계부 종류') && r.text.includes('여행 경비'), 'options request does not loop blindly');
r = await skill('우리집 가계부', 'loop-user', '인남');
assert(r.text.includes('가계부 이름으로 이해') && r.text.includes('이 이름으로 만들까요'), 'name-like kind input enters confirmation');
r = await skill('이 이름으로 만들기', 'loop-user', '인남');
assert(r.text.includes('가계부를 만들었어요') && r.text.includes('초대코드'), 'confirmed name creates household');
assert(db.households.some((h) => h.name === '우리집 가계부'), 'confirmed household name persisted');

r = await skill('가계부 생성', 'direct-user', '다른사용자');
assert(r.text.includes('어떤 용도로'), 'second user create begins');
r = await skill('선택', 'direct-user', '다른사용자');
assert(r.text.includes('1. 가족 생활비') && r.text.includes('5. 직접 입력'), 'bare 선택 shows list');
r = await skill('그냥 가계부', 'direct-user', '다른사용자');
assert(r.text.includes('일반 가계부') && r.text.includes('이 이름으로 만들까요'), 'generic household name gets direct-input confirmation');
r = await skill('종류 다시 선택', 'direct-user', '다른사용자');
assert(r.text.includes('어떤 용도로') && r.text.includes('모임 회비'), 'type reselect recovers flow');
r = await skill('가족', 'direct-user', '다른사용자');
assert(r.text.includes('가족 생활비') && r.text.includes('가계부 이름'), 'natural type synonym accepted');
r = await skill('우리집 생활비', 'direct-user', '다른사용자');
assert(r.text.includes('가계부를 만들었어요'), 'standard type-name flow still works');

r = await skill('점심 12000원 국민카드', 'loop-user', '인남');
assert(r.text.includes('지출 저장') || r.text.includes('저장했어요'), 'natural transaction regression');
r = await skill('닉네임 변경', 'loop-user', '인남');
assert(!r.text.includes('정확히 이해하지 못했어요'), 'NLU alias regression');

console.log('SMOKE_V224_OK');

// V22.4.1 identity stability regression
const beforeMissingIdentityUsers = db.users.length;
let missingIdentityRes = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userRequest: { utterance: '점심 1000원', user: { type: 'botUserKey', properties: {} } } })
}), env, {});
const missingIdentityData = JSON.parse(await missingIdentityRes.text());
assert((missingIdentityData?.template?.outputs?.[0]?.simpleText?.text || '').includes('사용자 식별정보'), 'missing identity returns safe response');
assert(db.users.length === beforeMissingIdentityUsers, 'missing identity does not create fallback user');

const loopUsers = db.users.filter((u) => u.kakao_user_key === 'loop-user');
assert(loopUsers.length === 1, 'same botUserKey remains one user');
const loopUser = loopUsers[0];
const loopOwned = db.household_members.filter((m) => m.user_id === loopUser.id && m.role === 'owner');
assert(loopOwned.length === 1, 'explicit household creation creates one owner membership');

// Opening a page must not promote a pending membership.
const loginForm = new FormData(); loginForm.set('nickname', '대기사용자'); loginForm.set('access_code', '1234');
const loginRes = await app.fetch(new Request('https://ttokttok-accountbook.com/my/local-login', { method: 'POST', body: loginForm }), { ...env, USER_SESSION_SECRET: 'test-secret' }, {});
const userCookie = String(loginRes.headers.get('set-cookie') || '').split(';')[0];
const pendingUser = db.users.find((u) => String(u.kakao_user_key || '').startsWith('local_web:') && u.nickname === '대기사용자');
const orphan = upsert('households', { name: '고아 가계부', invite_code: 'ORPHAN01' }, ['id']);
upsert('household_members', { household_id: orphan.id, user_id: pendingUser.id, role: 'pending' }, ['household_id','user_id']);
await app.fetch(new Request(`https://ttokttok-accountbook.com/my?household_id=${encodeURIComponent(orphan.id)}`, { headers: { cookie: userCookie } }), { ...env, USER_SESSION_SECRET: 'test-secret' }, {});
assert(db.household_members.find((m) => m.household_id === orphan.id && m.user_id === pendingUser.id)?.role === 'pending', 'page view does not promote pending user to owner');

// Admin audit and explicit identity merge.
const mergeHh = upsert('households', { name: '통합 테스트 가계부', invite_code: 'MERGE001' }, ['id']);
const primary = upsert('users', { kakao_user_key: 'primary-bot-key', nickname: 'Bin' }, ['kakao_user_key']);
const secondary = upsert('users', { kakao_user_key: 'kakao_login:999', nickname: '아빠' }, ['kakao_user_key']);
upsert('household_members', { household_id: mergeHh.id, user_id: primary.id, role: 'owner' }, ['household_id','user_id']);
upsert('household_members', { household_id: mergeHh.id, user_id: secondary.id, role: 'owner' }, ['household_id','user_id']);
upsert('transactions', { household_id: mergeHh.id, user_id: primary.id, amount: 1000, type: 'expense', transaction_date: '2026-07-13' }, ['id']);
const secondaryTx = upsert('transactions', { household_id: mergeHh.id, user_id: secondary.id, amount: 2000, type: 'expense', transaction_date: '2026-07-13' }, ['id']);
const adminEnv = { ...env, ADMIN_PASSWORD: 'admin-pass', ADMIN_SESSION_SECRET: 'admin-secret' };
const adminForm = new FormData(); adminForm.set('password', 'admin-pass');
const adminLogin = await app.fetch(new Request('https://ttokttok-accountbook.com/login', { method: 'POST', body: adminForm }), adminEnv, {});
const adminCookie = String(adminLogin.headers.get('set-cookie') || '').split(';')[0];
const auditRes = await app.fetch(new Request(`https://ttokttok-accountbook.com/identity-audit?household_id=${encodeURIComponent(mergeHh.id)}`, { headers: { cookie: adminCookie } }), adminEnv, {});
const auditHtml = await auditRes.text();
assert(auditRes.status === 200 && auditHtml.includes('소유자가 2명'), 'identity audit detects multiple owners');
const mergeForm = new FormData();
mergeForm.set('household_id', mergeHh.id); mergeForm.set('primary_user_id', primary.id); mergeForm.set('secondary_user_id', secondary.id); mergeForm.set('confirm_text', '통합');
const mergeRes = await app.fetch(new Request('https://ttokttok-accountbook.com/admin/identity/merge', { method: 'POST', headers: { cookie: adminCookie }, body: mergeForm }), adminEnv, {});
assert(mergeRes.status === 303, 'identity merge redirects after completion');
assert(db.transactions.find((t) => t.id === secondaryTx.id)?.user_id === primary.id, 'secondary transactions reassigned to primary');
assert(!db.household_members.some((m) => m.user_id === secondary.id), 'secondary memberships removed');
assert(db.household_members.some((m) => m.household_id === mergeHh.id && m.user_id === primary.id && m.role === 'owner'), 'primary owner membership retained');
assert(String(db.users.find((u) => u.id === secondary.id)?.kakao_user_key || '').startsWith('merged:'), 'secondary user preserved as merged audit account');

console.log('SMOKE_V2241_IDENTITY_OK');
