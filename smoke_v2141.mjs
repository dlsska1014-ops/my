import app from './src/index.js';

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  KAKAO_REPEAT_GUARD_SECONDS: '2',
};

const nativeFetch = globalThis.fetch;
const household = { id: 'hh1', name: '우리집', invite_code: 'ABC123', created_at: '2026-01-01T00:00:00Z' };
const members = [
  { user_id: 'user1', role: 'owner', created_at: '2026-01-01T00:00:00Z' },
  { user_id: 'user2', role: 'member', created_at: '2026-01-02T00:00:00Z' },
];
const transactions = [
  { id: 't1', household_id: 'hh1', user_id: 'user1', type: 'expense', amount: 120000, category: '식비', memo: '장보기', payment_method: '국민카드', transaction_date: '2026-07-03', source: 'kakao_skill', raw_text: '장보기 120000원', created_at: '2026-07-03T01:00:00Z' },
  { id: 't2', household_id: 'hh1', user_id: 'user2', type: 'expense', amount: 40000, category: '교통', memo: '교통비', payment_method: '현금', transaction_date: '2026-07-04', source: 'kakao_skill', raw_text: '교통비 40000원', created_at: '2026-07-04T01:00:00Z' },
  { id: 't3', household_id: 'hh1', user_id: 'user1', type: 'income', amount: 500000, category: '급여', memo: '월급', payment_method: '', transaction_date: '2026-07-01', source: 'kakao_skill', raw_text: '월급 500000원', created_at: '2026-07-01T01:00:00Z' },
];
const budgets = [
  { id: 'b1', household_id: 'hh1', month: '2026-07', category: '__total', amount: 300000, created_at: '2026-07-01T00:00:00Z' },
  { id: 'b2', household_id: 'hh1', month: '2026-07', category: '식비', amount: 200000, created_at: '2026-07-01T00:00:00Z' },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return nativeFetch(input, init);
  const method = String(init.method || 'GET').toUpperCase();
  const path = url.pathname;

  if (method !== 'GET') return json([]);

  if (path === '/rest/v1/users') {
    if (url.searchParams.has('kakao_user_key')) return json([{ id: 'user1', kakao_user_key: 'test-key', nickname: 'Bin' }]);
    const id = String(url.searchParams.get('id') || '');
    if (id.includes('user2')) return json([{ id: 'user2', kakao_user_key: 'user2-key', nickname: 'Mina', created_at: '2026-01-02T00:00:00Z' }]);
    return json([{ id: 'user1', kakao_user_key: 'user1-key', nickname: 'Bin', created_at: '2026-01-01T00:00:00Z' }]);
  }

  if (path === '/rest/v1/household_members') {
    if (String(url.searchParams.get('role') || '') === 'eq.pending') return json([]);
    const select = String(url.searchParams.get('select') || '');
    const hasHousehold = String(url.searchParams.get('household_id') || '').includes('hh1');
    const hasUser1 = String(url.searchParams.get('user_id') || '').includes('user1');
    if (hasHousehold && hasUser1 && select.includes('role')) return json([{ role: 'owner', created_at: '2026-01-01T00:00:00Z' }]);
    if (hasHousehold && select.includes('user_id')) return json(members);
    if (hasUser1 && select.includes('household_id')) return json([{ household_id: 'hh1', role: 'owner', created_at: '2026-01-01T00:00:00Z' }]);
    return json([]);
  }

  if (path === '/rest/v1/households') return json([household]);
  if (path === '/rest/v1/accountbook_settings') return json([]);
  if (path === '/rest/v1/accountbook_budgets') return json(budgets);
  if (path === '/rest/v1/transactions') {
    const type = String(url.searchParams.get('type') || '');
    return json(type === 'eq.expense' ? transactions.filter((row) => row.type === 'expense') : transactions);
  }
  if (path.includes('reserve') || path.includes('recurring') || path.includes('categories') || path.includes('payment')) return json([]);
  return json([]);
};

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

async function skill(utterance, { userKey = 'test-user', groupKey = '' } = {}) {
  const properties = { botUserKey: userKey };
  if (groupKey) properties.botGroupKey = groupKey;
  const body = JSON.stringify({
    userRequest: {
      utterance,
      user: { id: userKey, type: 'botUserKey', properties },
    },
  });
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body,
  }), env, { waitUntil() {} });
  const data = JSON.parse(await res.text());
  assert(res.status === 200, `${utterance}: HTTP 200`);
  assert(data.version === '2.0', `${utterance}: Kakao version 2.0`);
  return {
    data,
    text: data?.template?.outputs?.[0]?.simpleText?.text || '',
    quickReplies: data?.template?.quickReplies,
  };
}

function assertNormalResponse(result, label) {
  assert(!/https?:\/\//i.test(result.text), `${label}: no automatic URL`);
  assert(!result.quickReplies, `${label}: no default quickReplies`);
}

const healthRes = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, { waitUntil() {} });
const healthText = await healthRes.text();
assert(healthText.includes('V21.4.1-KAKAO-RESPONSE-ROUTING-HOTFIX'), 'health exposes V21.4.1 hotfix');

const budget = await skill('@똑똑한가계부 내 예산', { userKey: 'budget-user' });
assert(budget.text.includes('남은 예산'), '내 예산 routes to budget status');
assert(!budget.text.includes('원하는 메뉴') && !budget.text.includes('사용 가능한 명령'), '내 예산 does not fall into generic menu');
assertNormalResponse(budget, '내 예산');

const group = await skill('/단톡방 연결', { userKey: 'group-user', groupKey: 'group-1' });
assert(group.text.includes('이 단톡방은 아직 가계부와 연결되지 않았어요.'), '단톡방 연결 routes to group status');
assert(group.text.includes('\n\n초대코드'), '단톡방 연결 uses real line breaks');
assert(!group.text.includes('\\n'), '단톡방 연결 has no literal backslash-n');
assertNormalResponse(group, '단톡방 연결');

const settlement = await skill('/정산', { userKey: 'settlement-user' });
assert(settlement.text.includes('정산'), '정산 returns settlement response');
assert(settlement.text.includes('1인 기준') && settlement.text.includes('송금 제안'), '정산 returns 1/N settlement details');
assert(!settlement.text.includes('상위 지출:'), '정산 is not monthly summary');
assertNormalResponse(settlement, '정산');

const summary = await skill('/요약', { userKey: 'summary-user' });
assert(summary.text.includes('요약') && summary.text.includes('상위 지출:'), '요약 remains monthly summary');
assert(!summary.text.includes('송금 제안'), '요약 is separated from settlement');
assertNormalResponse(summary, '요약');

const help = await skill('도움말', { userKey: 'help-user' });
assert(help.text.includes('사용법'), '도움말 returns help');
assertNormalResponse(help, '도움말');

const link = await skill('/링크', { userKey: 'link-user' });
const urlMatches = link.text.match(/https?:\/\/\S+/g) || [];
assert(urlMatches.length === 1, '링크 command returns exactly one URL');
assert(urlMatches[0] === 'https://ttokttok-accountbook.com', '링크 command returns representative domain only');
assert(!link.quickReplies, '링크 command has no default quickReplies');

console.log('SMOKE_V2141_OK');
