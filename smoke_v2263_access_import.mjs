import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import app, {
  alignImportCells,
  canReadMyHousehold,
  canWriteMyHousehold,
  canonicalImportField,
  createUserHousehold,
  decodeImportUploadBytes,
  getMySelectedHousehold,
  joinHouseholdByCode,
  parseFlexibleImportRecords,
} from './src/index.js';

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), {}, {});
eq((await health.json()).version, 'V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY', 'health version');

const aliasCases = {
  이용일시: 'date', 승인액: 'amount', 입금액: 'income', 출금액: 'expense',
  거래처명: 'memo', 대분류: 'category', 결제계정: 'payment', 담당자: 'spender',
  transactionDate: 'date', transactionAmount: 'amount', merchant: 'memo', paymentMethod: 'payment',
};
for (const [header, field] of Object.entries(aliasCases)) eq(canonicalImportField(header), field, `alias ${header}`);

const parse = (text) => parseFlexibleImportRecords(text, 'household-1', 'user-1', { source: 'test_import', maxRows: 5000 });

let result = parse([
  '2026년 여름 기록',
  '이용일시(KST),승인액(KRW),가맹점명,카드명',
  '2026-07-01 12:30,12,300,편의점,국민카드',
  '2026-07-02,"15,500","점심, 샐러드",현대카드',
].join('\n'));
eq(result.accepted.length, 2, 'CSV preamble and records');
eq(result.rows[0].amount, 12300, 'unquoted thousand comma repaired');
eq(result.rows[0].memo, '편의점', 'unquoted comma keeps merchant alignment');
eq(result.rows[0].payment_method, '국민카드', 'unquoted comma keeps payment alignment');
ok(result.accepted[0].warnings.some((item) => item.includes('복원')), 'repair warning shown');
eq(result.rows[1].memo, '점심, 샐러드', 'quoted comma preserved');

result = parse('거래일\t입금액\t출금액\t내역\t계좌명\n2026-07-03\t2500000\t\t월급\t급여통장\n2026-07-04\t\t4500\t커피\t체크카드');
eq(result.rows.map((row) => row.type), ['income', 'expense'], 'separate income and expense columns');
eq(result.rows.map((row) => row.amount), [2500000, 4500], 'small and large amounts');

result = parse('날짜;구분;금액;내용\n2026.7.5;지출;8,000원;버스');
eq(result.rows[0].amount, 8000, 'semicolon table');
result = parse('날짜|구분|금액|내용\n2026/7/6|수입|3만원|용돈');
eq([result.rows[0].type, result.rows[0].amount], ['income', 30000], 'pipe and Korean amount');

result = parse('거래일: 2026-07-10 | 사용액: 9,900원 | 거래처명: 약국 | 결제계정: 삼성카드');
eq([result.rows[0].amount, result.rows[0].memo, result.rows[0].payment_method], [9900, '약국', '삼성카드'], 'key-value natural import');
result = parse('어제 점심 12000원 국민카드');
eq(result.accepted.length, 1, 'free-form natural sentence');
ok(result.rows[0].transaction_date.length === 10, 'relative date normalized');

result = parse(JSON.stringify({ transactions: [{ transactionDate: '2026-07-12', transactionAmount: '15000', merchant: '마트', paymentMethod: '현대카드' }] }));
eq([result.delimiter, result.rows[0].amount, result.rows[0].memo], ['JSON', 15000, '마트'], 'JSON records');

result = parse('# 시트: 1월\n날짜\t금액\t내용\n2026-01-02\t500\t복사\n# 시트: 2월\n거래일\t출금액\t적요\n2026-02-03\t700\t인쇄');
eq(result.accepted.length, 2, 'multiple sheets and repeated headers');
ok(result.rejected.some((item) => item.reason_code === 'repeated_header'), 'repeated header reason');
ok(result.rejected.some((item) => item.reason_code === 'preamble'), 'sheet marker reason');

const rejectionCases = [
  ['날짜,금액,내용\n잘못된날짜,12000,점심', 'invalid_date'],
  ['날짜,금액,내용\n2026-07-01,문자,점심', 'invalid_amount'],
  ['날짜,내용\n2026-07-01,점심', 'missing_amount'],
  ['날짜,입금액,출금액,내용\n2026-07-01,1000,2000,오류', 'both_income_expense'],
  ['날짜,금액,분류\n2026-07-01,12000,식비,남는값', 'column_mismatch'],
];
for (const [input, code] of rejectionCases) {
  result = parse(input);
  eq(result.accepted.length, 0, `${code} is not saved`);
  eq(result.rejected[0]?.reason_code, code, `${code} reason code`);
  ok(Boolean(result.rejected[0]?.reason && result.rejected[0]?.suggestion), `${code} has reason and fix`);
}

const aligned = alignImportCells(['날짜', '금액', '내용', '결제수단'], ['2026-07-01', '1', '234', '점심', '카드']);
eq(aligned.cells, ['2026-07-01', '1,234', '점심', '카드'], 'direct column alignment');

const utf16Text = '날짜\t금액\t내용\n2026-07-01\t12000\t점심';
const utf16Body = Buffer.from(utf16Text, 'utf16le');
const utf16Bytes = new Uint8Array(utf16Body.length + 2);
utf16Bytes.set([0xff, 0xfe]);
utf16Bytes.set(utf16Body, 2);
eq(decodeImportUploadBytes(utf16Bytes), utf16Text, 'UTF-16LE BOM decoding');

for (const role of ['owner', 'admin', 'member', 'viewer']) ok(canReadMyHousehold(role), `${role} can read`);
for (const role of ['pending', 'blocked', '', 'unknown']) ok(!canReadMyHousehold(role), `${role || 'empty'} cannot read`);
for (const role of ['owner', 'admin', 'member']) ok(canWriteMyHousehold(role), `${role} can write`);
for (const role of ['viewer', 'pending', 'blocked', '', 'unknown']) ok(!canWriteMyHousehold(role), `${role || 'empty'} cannot write`);

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
ok(source.includes('V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY'), 'release identifier in source');
ok(source.includes('household_create_compensation_failed'), 'orphan household compensation exists');
ok(source.includes('withHouseholdCreateLock'), 'same user and name creation lock exists');
ok(source.includes('throw new Error("approval_request_failed")'), 'join fails closed');
const joinStart = source.indexOf('async function joinHouseholdByCode');
const joinEnd = source.indexOf('\nasync function getPendingHousehold', joinStart);
const joinSource = source.slice(joinStart, joinEnd);
ok(!joinSource.includes('role: "member"'), 'join failure never falls back to member');
ok(source.indexOf('if (["pending", "blocked"].includes(accessRole))') < source.indexOf('const directAlias = parseDirectMemberAliasCommand', source.indexOf('if (["pending", "blocked"].includes(accessRole))')), 'chat role gate precedes mutation commands');
ok(source.includes('id="v2263MutationGuard"'), 'create/join double-submit guard');
ok(source.includes('행별 원인과 수정 방법'), 'row-level import explanation UI');

const originalFetch = globalThis.fetch;
const mockDb = {
  users: [
    { id: 'mixed-user', nickname: '조회 사용자', kakao_user_key: 'local_web:mixed', created_at: '2026-07-01T00:00:00Z' },
    { id: 'join-user', nickname: '대기 사용자', kakao_user_key: 'local_web:join', created_at: '2026-07-01T00:00:00Z' },
  ],
  households: [
    { id: 'join-hh', name: '초대 가계부', invite_code: 'JOIN1234', created_at: '2026-07-01T00:00:00Z' },
    { id: 'view-hh', name: '조회 가계부', invite_code: 'VIEW1234', created_at: '2026-07-02T00:00:00Z' },
  ],
  household_members: [],
};
let mockId = 10;
let failMemberPost = false;
const clone = (value) => JSON.parse(JSON.stringify(value));
const matches = (row, url) => {
  for (const [key, expr] of url.searchParams.entries()) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    const [operator, ...rest] = String(expr).split('.');
    const expected = decodeURIComponent(rest.join('.'));
    if (operator === 'eq' && String(row[key] ?? '') !== expected) return false;
  }
  return true;
};
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'mock.supabase.co') return originalFetch(input, init);
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  const method = String(init.method || 'GET').toUpperCase();
  const rows = mockDb[table] || (mockDb[table] = []);
  if (method === 'GET') {
    let found = rows.filter((row) => matches(row, url));
    const limit = Number(url.searchParams.get('limit') || found.length);
    found = found.slice(0, limit);
    return new Response(JSON.stringify(clone(found)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'POST') {
    if (table === 'household_members' && failMemberPost) return new Response('forced member failure', { status: 500 });
    const body = JSON.parse(String(init.body || '{}'));
    const incoming = Array.isArray(body) ? body : [body];
    const saved = incoming.map((row) => ({ id: row.id || `${table}-${mockId++}`, created_at: row.created_at || new Date().toISOString(), ...row }));
    for (const row of saved) {
      const conflict = table === 'household_members' ? rows.findIndex((item) => item.household_id === row.household_id && item.user_id === row.user_id) : -1;
      if (conflict >= 0) rows[conflict] = row;
      else rows.push(row);
    }
    return new Response(JSON.stringify(clone(saved)), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'DELETE') {
    mockDb[table] = rows.filter((row) => !matches(row, url));
    return new Response('', { status: 200 });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
};

const mockEnv = { SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', USER_SESSION_SECRET: 'session-secret' };
failMemberPost = true;
await assert.rejects(() => createUserHousehold(mockEnv, 'owner-fail', '원자성 테스트', '사용자'));
assertions += 1;
ok(!mockDb.households.some((item) => item.name === '원자성 테스트'), 'owner membership failure removes orphan household');

await assert.rejects(() => joinHouseholdByCode(mockEnv, 'join-user', 'JOIN1234'), /approval_request_failed/);
assertions += 1;
ok(!mockDb.household_members.some((item) => item.user_id === 'join-user'), 'join failure never grants membership');
failMemberPost = false;
const joined = await joinHouseholdByCode(mockEnv, 'join-user', 'JOIN1234');
eq(joined.join_role, 'pending', 'successful join remains pending');

mockDb.household_members.push(
  { household_id: 'view-hh', user_id: 'mixed-user', role: 'viewer', created_at: '2026-07-02T00:00:00Z' },
  { household_id: 'join-hh', user_id: 'mixed-user', role: 'pending', created_at: '2026-07-03T00:00:00Z' },
);
let access = await getMySelectedHousehold(mockEnv, 'mixed-user', '');
eq(access.selected?.id, 'view-hh', 'pending membership never becomes default selection');
eq(access.households.map((item) => item.id), ['view-hh'], 'readable list excludes pending membership');
access = await getMySelectedHousehold(mockEnv, 'mixed-user', 'join-hh');
eq(access.restricted?.role, 'pending', 'explicit pending selection returns restricted status');
eq(access.selected, null, 'explicit pending selection exposes no readable household');

const sessionCookie = async (userId) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${exp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(mockEnv.USER_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
  const encoded = Buffer.from(signature).toString('base64url');
  return `ab_user=${encodeURIComponent(`${data}.${encoded}`)}`;
};
let response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/backup?household_id=view-hh', { headers: { cookie: await sessionCookie('mixed-user') } }), mockEnv, {});
let page = await response.text();
eq(response.status, 200, 'viewer can open read-only backup page');
ok(page.includes('조회 전용 권한'), 'viewer backup explains read-only role');
ok(page.includes('CSV·TSV·TXT·JSON'), 'rendered import page advertises supported text formats');
ok(/id="myImportFile"[^>]*disabled/.test(page), 'viewer import file control is disabled');

response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/settings?household_id=view-hh', { headers: { cookie: await sessionCookie('mixed-user') } }), mockEnv, {});
page = await response.text();
eq(response.status, 403, 'viewer settings mutation screen is denied');
ok(page.includes('관리자 권한이 필요한 화면'), 'viewer settings has recovery guidance');

response = await app.fetch(new Request('https://ttokttok-accountbook.com/app?household_id=join-hh', { headers: { cookie: await sessionCookie('join-user') } }), mockEnv, {});
page = await response.text();
eq(response.status, 403, 'pending app data screen is denied');
ok(page.includes('참여 승인 대기 중'), 'pending app shows approval state');
ok(!page.includes('JOIN1234'), 'pending app never exposes invite code');

response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/households', { headers: { cookie: await sessionCookie('mixed-user') } }), mockEnv, {});
page = await response.text();
eq(response.status, 200, 'household list renders for mixed access user');
ok(page.includes('v2263MutationGuard'), 'rendered create and join forms include double-submit guard');
globalThis.fetch = originalFetch;

console.log(`SMOKE_V2263_ACCESS_IMPORT_OK assertions=${assertions}`);
