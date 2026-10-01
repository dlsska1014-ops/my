import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import app from '../src/index.js';
import { createV2265QaFixture } from './qa-fixture.mjs';

let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const fixture = await createV2265QaFixture();
fixture.db.__import_rpc_available = true;
// Production import requires UUID user identities; the shared display fixture uses short IDs.
const ownerId = '11111111-1111-4111-8111-111111111111';
for (const rows of Object.values(fixture.db).filter(Array.isArray)) {
  for (const row of rows) {
    if (row.user_id === 'user-bin') row.user_id = ownerId;
    if (row.id === 'user-bin') row.id = ownerId;
  }
}
const ownerCookie = await fixture.cookieFor(ownerId);
const base = 'https://malhaebook.com';
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse('2026-07-15T12:00:00+09:00');
const request = async (path, { method = 'GET', cookie = ownerCookie, body } = {}) => {
  const response = await app.fetch(new Request(base + path, { method, headers: { cookie, origin: base }, body }), fixture.env, { waitUntil() {} });
  return { response, html: await response.text() };
};
try {
  const csv = '날짜,구분,금액,분류,내용,결제수단\n2026-07-16,지출,12000,식비,점심,국민카드\n2026-07-16,지출,7000,쇼핑,환불 확인,국민카드\n2026-07-16,수입,90000,급여,추가 급여,계좌이체';
  const before = fixture.db.transactions.length;
  const preview = await request('/my/import', { method: 'POST', body: new URLSearchParams({ household_id: 'house-home', month: '2026-07', csv_text: csv, skip_duplicates: '1' }) });
  eq(preview.response.status, 200, 'preview succeeds');
  eq(preview.response.headers.get('cache-control'), 'no-store', 'preview stays private');
  eq(fixture.db.transactions.length, before, 'preview does not save records');
  eq((preview.html.match(/class="importPick"/g) || []).length, 3, 'all three candidates remain selectable');
  ok(preview.html.includes('data-amount="12000"') && preview.html.includes('data-amount="7000"'), 'selection data retains actual candidate amounts');
  ok(preview.html.includes('data-review-needed="1"'), 'refund wording is flagged for review');
  ok(preview.html.includes('data-type="expense" data-review-needed="1"'), 'review flag does not turn refund into income');
  ok(preview.html.includes('id="selectedImportIncome">90,000원') && preview.html.includes('id="selectedImportExpense">19,000원'), 'server gives correct initially selected totals');
  ok(preview.html.includes('실제 저장 건수와 금액이 줄어들 수 있습니다'), 'selection total explains duplicate exclusion');
  ok(/<body[^>]*class="[^"]*\babImportPreview\b/.test(preview.html), 'preview styles stay scoped: ' + preview.html.match(/<body[^>]*>/)?.[0]);
  eq((preview.html.match(/<label class="importPickTarget">/g) || []).length, 3, 'each checkbox has a larger label target');
  const inline = [...preview.html.matchAll(/<script(?![^>]*\b(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(inline.some(code => code.includes('selectedImportExpense')), 'preview has selection runtime');
  for (const code of inline) { new Function(code); checks++; }
  const token = preview.html.match(/name="import_token" value="([^"]+)"/)[1];
  const empty = await request('/my/import', { method: 'POST', body: new URLSearchParams({ import_action: 'commit', household_id: 'house-home', month: '2026-07', import_token: token }) });
  ok(empty.html.includes('한 개 이상 선택'), 'empty selection receives actionable error');
  eq(fixture.db.transactions.length, before, 'empty selection does not save');
  const selection = new URLSearchParams({ import_action: 'commit', household_id: 'house-home', month: '2026-07', import_token: token, selected_rows: '2', amount: '999999999', selected_expense: '999999999', 'data-amount': '999999999' });
  const commit = await request('/my/import', { method: 'POST', body: selection });
  eq(commit.response.status, 200, 'selected row saves through existing commit');
  eq(fixture.db.transactions.length, before + 1, 'only the selected candidate is saved');
  const inserted = fixture.db.transactions.at(-1);
  eq(inserted.amount, 12000, 'client display fields cannot change signed transaction amount');
  eq(inserted.household_id, 'house-home', 'commit retains household scope');
  ok(!fixture.db.transactions.some(row => row.memo === '환불 확인'), 'unselected refund candidate is not saved');
  await request('/my/import', { method: 'POST', body: selection });
  eq(fixture.db.transactions.length, before + 1, 'repeated commit cannot duplicate selected transaction');
  const home = await request('/app?month=2026-07&household_id=house-home');
  eq(home.response.status, 200, 'home renders');
  ok(home.html.includes('<details class="homeInsights"'), 'secondary insights can be expanded without JavaScript');
  eq((home.html.match(/class="dailyCell /g) || []).length, 31, 'fold retains every day of the chart');
  ok(home.html.includes('class="abDailyHelp"'), 'calculation explanation has a non-JavaScript fallback');
  ok(home.html.includes('class="homeReportsEdit"'), 'stored home configuration remains reachable');
  ok(!home.html.includes('class="v8-edit"'), 'initial home does not include transaction editors');
  const tx = await request('/app?month=2026-07&household_id=house-home&tab=transactions&type=expense');
  ok(tx.html.includes('data-count="') && tx.html.includes('data-expense="'), 'rail receives authoritative filtered-result totals');
  ok(tx.html.includes('class="v8-editOpen"'), 'transaction rows keep no-JavaScript editing fallback');
  const nav = await request('/assets/accountbook-nav-v22925.js', { cookie: '' });
  new Function(nav.html); checks++;
  ok(nav.html.includes('수정 항목을 불러오는 중입니다') && nav.html.includes('다시 시도'), 'deferred editor explains loading and retry');
  const bundle = await request('/assets/accountbook-v5-v22925.js', { cookie: '' });
  new Function(bundle.html); checks++;
  ok(bundle.html.includes('typeof HTMLElement.prototype.showPopover'), 'popover enhancement checks support');
  const css = await request('/assets/accountbook-shell-v22925.css', { cookie: '' });
  ok(css.html.includes('@container home-reports'), 'report layout responds to actual content width');
  ok(css.html.includes('position-try-fallbacks'), 'help has anchor fallback positioning');
  const viewer = fixture.db.household_members.find(member => member.user_id === 'user-wifi' && member.household_id === 'house-home');
  viewer.role = 'viewer';
  const viewerCookie = await fixture.cookieFor('user-wifi');
  const viewerPage = await request('/app?month=2026-07&household_id=house-home&tab=transactions', { cookie: viewerCookie });
  eq(viewerPage.response.status, 200, 'viewer can read transactions');
  ok(!viewerPage.html.includes('data-ab-edit-src='), 'viewer receives no editable transaction slots');
  const denied = await request('/transactions/edit?id=' + fixture.db.transactions[0].id + '&fragment=1', { cookie: viewerCookie });
  eq(denied.response.status, 403, 'viewer cannot request editable fragment');
  ok(source.includes('const APP_VERSION ='), 'runtime retains version contract');
} finally { fixture.restore(); delete globalThis.__AB_QA_FIXED_NOW_MS; }
console.log(`PASS: UIUX refinement (${checks} checks)`);
