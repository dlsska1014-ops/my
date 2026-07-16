import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import app, {
  makeMyImportPreviewToken,
  myImportDeterministicTransactionId,
  myImportReasonCounts,
  prepareMyImportEntry,
  renderMyImportPreviewHtml,
  verifyMyImportPreviewToken,
} from './src/index.js';

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const env = { USER_SESSION_SECRET: 'v2264-test-session', MY_IMPORT_TOKEN_SECRET: 'v2264-import-token' };
const basePayload = {
  v: 1,
  exp: Math.floor(Date.now() / 1000) + 600,
  jti: 'preview-job-1',
  user_id: '11111111-1111-4111-8111-111111111111',
  household_id: '22222222-2222-4222-8222-222222222222',
  month: '2026-07',
  skip_duplicates: true,
  parsed: { format: 'table', delimiter: ',', total_rows: 3, accepted_count: 2, mappings: [] },
  ready: [{ row_number: 2, raw: '2026-07-01,12000,점심', warnings: [], row: { household_id: '22222222-2222-4222-8222-222222222222', user_id: '11111111-1111-4111-8111-111111111111', transaction_date: '2026-07-01', type: 'expense', amount: 12000, category: '식비', memo: '점심', payment_method: '카드', source: 'my_import', source_user_key: 'import_v2264:preview-job-1:2' } }],
  outcomes: [],
  reason_counts: {},
};

const token = await makeMyImportPreviewToken(env, basePayload);
ok(token.includes('.'), 'preview token is signed');
eq((await verifyMyImportPreviewToken(env, token))?.jti, 'preview-job-1', 'valid preview token');
eq(await verifyMyImportPreviewToken({ ...env, MY_IMPORT_TOKEN_SECRET: 'wrong' }, token), null, 'wrong secret rejects token');
const expired = await makeMyImportPreviewToken(env, { ...basePayload, exp: Math.floor(Date.now() / 1000) - 1 });
eq(await verifyMyImportPreviewToken(env, expired), null, 'expired preview token rejected');
eq(await verifyMyImportPreviewToken(env, `${token}tampered`), null, 'tampered preview token rejected');

const owner = { id: basePayload.household_id, name: '테스트 가계부', role: 'owner' };
const previewHtml = renderMyImportPreviewHtml({ env, selected: owner, month: '2026-07', payload: basePayload, token });
ok(previewHtml.includes('저장 전 미리보기'), 'preview page title');
ok(previewHtml.includes('아직 거래는 저장되지 않았습니다'), 'preview explains no write');
ok(previewHtml.includes('name="selected_rows"'), 'preview has selectable rows');
ok(previewHtml.includes('선택한 항목 저장'), 'preview has explicit commit button');
ok(previewHtml.includes('30분 뒤 만료'), 'preview explains expiry');
const previewIds = [...previewHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
eq(new Set(previewIds).size, previewIds.length, 'preview has no duplicate element ids');
ok(!/maximum-scale\s*=|user-scalable\s*=\s*no/i.test(previewHtml), 'preview does not lock mobile zoom');
ok(/class="importPick"[^>]*aria-label=/.test(previewHtml), 'row selection checkboxes have accessible labels');

const lookup = new Map([['엄마', [{ user_id: '33333333-3333-4333-8333-333333333333', nickname: '엄마' }]]]);
let prepared = prepareMyImportEntry({ row_number: 7, raw: '엄마 마트', warnings: [], row: { ...basePayload.ready[0].row, _import_spender: '엄마' } }, basePayload.user_id, owner, lookup, 'job-2');
eq(prepared.row.user_id, '33333333-3333-4333-8333-333333333333', 'owner maps exact spender');
eq(prepared.row.source_user_key, 'import_v2264:job-2:7', 'idempotency source key');
prepared = prepareMyImportEntry({ row_number: 8, raw: '타인 마트', warnings: [], row: { ...basePayload.ready[0].row, _import_spender: '없는사람' } }, basePayload.user_id, { ...owner, role: 'member' }, lookup, 'job-3');
eq(prepared.row.user_id, basePayload.user_id, 'member cannot assign another spender');
ok(prepared.warnings.length > 0, 'unresolved spender has warning');
eq(myImportReasonCounts([{ reason_code: 'missing_date' }, { reason_code: 'missing_date' }, { reason_code: 'duplicate' }]), { missing_date: 2, duplicate: 1 }, 'reason aggregation');
const deterministicId = await myImportDeterministicTransactionId('same-job', 3);
eq(deterministicId, await myImportDeterministicTransactionId('same-job', 3), 'same import job and row has stable transaction id');
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deterministicId), 'deterministic transaction id is UUID v4 shaped');

const userId = basePayload.user_id;
const householdId = basePayload.household_id;
const mockDb = {
  users: [{ id: userId, nickname: '가져오기 사용자', kakao_user_key: 'local_web:import-user', created_at: '2026-07-01T00:00:00Z' }],
  households: [{ id: householdId, name: '가져오기 테스트', invite_code: 'IMP2264', created_at: '2026-07-01T00:00:00Z' }],
  household_members: [{ household_id: householdId, user_id: userId, role: 'owner', created_at: '2026-07-01T00:00:00Z' }],
  transactions: [],
  accountbook_settings: [],
};
const originalFetch = globalThis.fetch;
let transactionPosts = 0;
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
    const found = rows.filter((row) => matches(row, url)).slice(0, Number(url.searchParams.get('limit') || rows.length || 100));
    return new Response(JSON.stringify(clone(found)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'POST') {
    const body = JSON.parse(String(init.body || '{}'));
    const incoming = Array.isArray(body) ? body : [body];
    const saved = incoming.map((row, index) => ({ id: row.id || `${table}-${rows.length + index + 1}`, created_at: new Date().toISOString(), ...row }));
    rows.push(...saved);
    if (table === 'transactions') transactionPosts += saved.length;
    return new Response(JSON.stringify(clone(saved)), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
};
const mockEnv = { SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', ...env, MY_IMPORT_LIMIT: '120' };
const sessionCookie = async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${exp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(mockEnv.USER_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString('base64url')}`)}`;
};
const cookie = await sessionCookie();
const previewForm = new FormData();
previewForm.set('import_action', 'preview');
previewForm.set('household_id', householdId);
previewForm.set('month', '2026-07');
previewForm.set('skip_duplicates', '1');
previewForm.set('csv_text', '날짜,구분,금액,분류,내용,결제수단\n2026-07-10,지출,12000,식비,점심,국민카드\n2026-07-11,지출,5000,카페,커피,현금');
let response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/import', { method: 'POST', headers: { cookie }, body: previewForm }), mockEnv, {});
let page = await response.text();
eq(response.status, 200, 'preview request succeeds');
eq(transactionPosts, 0, 'preview performs no transaction write');
ok(page.includes('저장 전 미리보기'), 'preview route renders preview');
const tokenMatch = page.match(/name="import_token" value="([^"]+)"/);
ok(Boolean(tokenMatch?.[1]), 'preview includes signed commit token');
const selectedValues = [...page.matchAll(/name="selected_rows" value="(\d+)"/g)].map((match) => match[1]);
eq(selectedValues.length, 2, 'preview exposes two selectable rows');

const commitForm = new FormData();
commitForm.set('import_action', 'commit');
commitForm.set('import_token', tokenMatch[1]);
commitForm.append('selected_rows', selectedValues[0]);
response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/import', { method: 'POST', headers: { cookie }, body: commitForm }), mockEnv, {});
page = await response.text();
eq(response.status, 200, 'commit request succeeds');
eq(transactionPosts, 1, 'only selected row is inserted');
ok(page.includes('저장 완료'), 'commit result is rendered');
ok(page.includes('선택한 행') && page.includes('<b>1</b>'), 'commit result includes selected count');
ok(String(mockDb.transactions[0]?.source_user_key || '').startsWith('import_v2264:'), 'stored row keeps idempotency key');

response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/import', { method: 'POST', headers: { cookie }, body: commitForm }), mockEnv, {});
page = await response.text();
eq(response.status, 200, 'replayed commit returns a safe result');
eq(transactionPosts, 1, 'replayed commit does not insert again');
ok(page.includes('중복 제외'), 'replayed commit is reported as duplicate');

const tamperedForm = new FormData();
tamperedForm.set('import_action', 'commit');
tamperedForm.set('import_token', `${tokenMatch[1]}x`);
tamperedForm.set('household_id', householdId);
response = await app.fetch(new Request('https://ttokttok-accountbook.com/my/import', { method: 'POST', headers: { cookie }, body: tamperedForm }), mockEnv, {});
eq(response.status, 303, 'tampered commit token redirects safely');
ok(String(response.headers.get('location') || '').includes('import_preview_expired'), 'tampered token receives recovery code');
eq(transactionPosts, 1, 'tampered token performs no write');

globalThis.fetch = originalFetch;

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
ok(source.includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX'), 'release identifier');
ok(source.includes('MY_IMPORT_TOKEN_SECRET'), 'dedicated import token secret supported');
ok(source.includes('my_import_preview'), 'preview operations event');
ok(source.includes('my_import_commit'), 'commit operations event');
ok(source.includes('import_v2264:'), 'import idempotency key');
ok(source.includes('1. 분석 미리보기'), 'two-step import UI');

const health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), {}, {});
eq((await health.json()).version, 'V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX', 'health version');

console.log(`SMOKE_V2264_IMPORT_PREVIEW_OPERATIONS_OK assertions=${assertions}`);
