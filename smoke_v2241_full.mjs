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
assert((await health.text()).includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX'), 'health version V22.4.1');

let r = await skill('/시작');
assert(r.text.includes('먼저 가계부를 만들어 보세요'), 'new user starts with household creation');
assert(r.qrs.some((q) => q.messageText === '새 가계부 만들기'), 'start has create quick reply');

r = await skill('새 가계부 만들기');
assert(r.text.includes('어떤 용도로'), 'create flow asks type');
assert(r.qrs.length >= 4, 'create type uses guided quick replies');

r = await skill('가계부 종류 가족 생활비');
assert(r.text.includes('가계부 이름'), 'create flow asks name');

r = await skill('우리집 생활비');
assert(r.text.includes('이 이름으로 만들까요'), 'household name confirmation shown');
r = await skill('응');
assert(r.text.includes('가계부를 만들었어요') && r.text.includes('초대코드'), 'household created with invite code');
assert(db.households.length === 1 && db.household_members.some((m) => m.role === 'owner'), 'household and owner membership persisted');

r = await skill('/예산설정');
assert(r.text.includes('어떤 예산'), 'budget setup starts guided root');
assert(r.qrs.some((q) => q.messageText === '카테고리별 예산'), 'budget root has category choice');

await skill('카테고리별 예산');
await skill('예산 카테고리 식비');
r = await skill('100만원');
assert(r.text.includes('1,000,000원') && r.text.includes('설정할까요'), 'budget amount confirmation');
r = await skill('설정하기');
assert(r.text.includes('예산을 설정했어요'), 'guided budget saved');
assert(db.accountbook_budgets.some((b) => b.category === '식비' && b.amount === 1000000), 'category budget persisted');

r = await skill('교통비 예산설정 백만원');
assert(r.text.includes('교통 예산을 설정했어요') && r.text.includes('1,000,000원'), 'direct natural-language budget setting');
assert(db.accountbook_budgets.some((b) => b.category === '교통' && b.amount === 1000000), 'direct budget persisted');

r = await skill('남은예산');
assert(r.text.includes('카테고리별') && r.text.includes('식비') && r.text.includes('교통'), 'budget status shows category amounts');
assert(!r.text.includes('https://'), 'budget status has no repeated website link');
assert(r.qrs.length === 0, 'budget status has no automatic quick replies');

r = await skill('내 예산');
assert(r.text.includes('예산 현황') && r.qrs.length === 0, '내 예산 maps to budget status without quick replies');

await skill('내 이름 설정');
r = await skill('아빠');
assert(r.text.includes('아빠') && r.text.includes('설정했어요'), 'member alias guided setup');

r = await skill('점심 12000원 국민카드');
assert(r.text.includes('결제자: 아빠'), 'saved transaction shows mapped payer');
assert(!r.text.includes('https://'), 'transaction save has no website link');
assert(r.qrs.length === 0, 'normal transaction has no quick replies');
assert(!r.text.includes('\\n'), 'no literal backslash-n in response');

r = await skill('오늘 요약');
assert(r.text.includes('오늘 요약') && r.text.includes('결제자') && r.text.includes('아빠'), 'date summary shows payer totals');
assert(r.text.includes('상세 분석 보기'), 'first summary provides natural website CTA');
const r2 = await skill('오늘 요약');
assert(!r2.text.includes('상세 분석 보기'), 'same CTA suppressed for 24 hours');

r = await skill('/정산');
assert(r.text.includes('정산') && r.text.includes('참여자:') && r.text.includes('1인 기준:'), '/정산 uses settlement response instead of month summary');

r = await skill('도움말');
assert(r.text.includes('가계부 사용법') && r.qrs.length > 0, 'help is guided and concise');
assert(!r.text.includes('https://'), 'help avoids repeated links');

r = await skill('단톡방 연결');
assert(r.text.includes('단톡방 연결 안내'), 'group link guide is returned in direct chat');
assert(!r.text.includes('\\n') && !r.text.includes('https://'), 'group link guide has real newlines and no repeated URL');

r = await skill('별이반짝여');
assert(r.text.includes('정확히 이해하지 못했어요'), 'no-match reply is concise');
assert(r.qrs.length === 0 && !r.text.includes('https://'), 'no-match reply has no quick replies or URL');


// V21.5.2 natural-language intent and smart CTA
r = await skill('닉네임수정');
assert(r.text.includes('표시할 내 이름') && r.text.includes('닉네임 인남으로 변경'), '닉네임수정 starts alias flow');
r = await skill('새별명');
assert(r.text.includes('새별명') && r.text.includes('설정했어요'), 'alias flow saves entered nickname');
r = await skill('닉네임 인남으로 변경');
assert(r.text.includes('인남') && r.text.includes('변경했어요'), 'direct natural-language nickname change');
r = await skill('초대코드');
assert(r.text.includes('초대코드:') && r.text.includes('참여자·초대 관리'), 'invite code includes management CTA');
assert(r.text.includes('https://ttokttok-accountbook.com/my/households?household_id='), 'invite CTA points to scoped household management');
assert((r.text.match(/https:\/\//g) || []).length === 1, 'invite response contains exactly one URL');
r = await skill('구성원 초대');
assert(r.text.includes('구성원 초대하기') && r.text.includes('가계부 참여'), 'natural invite synonym supported');
r = await skill('도움말');
assert(r.text.includes('내 이름 설정'), 'help includes current member-name command');
r = await skill('예산 바꾸기');
assert(r.text.includes('어떤 예산'), 'natural budget-change synonym starts guided setup');
await skill('취소');
r = await skill('이번 달 얼마 썼어');
assert(r.text.includes('이번 달 요약'), 'natural monthly spending question maps to date summary');
r = await skill('가계부 바꾸기');
assert(r.text.includes('가계부를 선택했어요') || r.text.includes('사용할 가계부를 선택') || r.text.includes('내 가계부 목록'), 'natural household switch synonym supported');
r = await skill('단톡 연결');
assert(r.text.includes('단톡방 연결 안내') || r.text.includes('단톡방'), 'natural group-link synonym supported');
r = await skill('정산해줘');
assert(r.text.includes('정산'), 'natural settlement synonym supported');


// V22.1 NLU registry + ambiguity cases
r = await skill('닉네임 변경');
assert(r.text.includes('표시할 내 이름'), '닉네임 변경 long-tail starts alias flow');
await skill('취소');
r = await skill('닉넴 바꿔줘');
assert(r.text.includes('표시할 내 이름'), '닉넴 typo/colloquial starts alias flow');
await skill('취소');
r = await skill('나를 인남이라고 불러줘');
assert(r.text.includes('인남') && r.text.includes('변경했어요'), 'natural direct alias sentence saves alias');
r = await skill('가계부 이름 변경');
assert(!r.text.includes('표시할 내 이름'), 'household name change is not mistaken for member alias');
r = await skill('예산 확인하고 싶어');
assert(r.text.includes('예산 현황'), 'budget status long-tail recognized');
r = await skill('초대 코드 좀 보여줘');
assert(r.text.includes('초대코드:'), 'invite-code conversational phrase recognized');


r = await skill('이름 변경');
assert(r.text.includes('어떤 이름') && r.qrs.length === 2, 'ambiguous name asks target');
r = await skill('초대');
assert(r.text.includes('초대할까요') && r.qrs.length === 2, 'bare invite asks show/join choice');
r = await skill('예산');
assert(r.text.includes('설정할까요') && r.qrs.length === 2, 'bare budget asks set/status choice');
r = await skill('가계부');
assert(r.text.includes('무엇을 하시려는') && r.qrs.length >= 3, 'bare household asks create/join/switch');
r = await skill('식비 50만원');
assert(r.text.includes('어떻게 처리할까요') && r.qrs.some((q) => q.messageText.includes('예산설정')), 'category amount asks expense/budget');

console.log('SMOKE_V222_FULL_OK');
