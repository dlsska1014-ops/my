// Browser integration checks against isolated fixtures; never contacts production.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { createV2265QaFixture } from '../validation/qa-fixture.mjs';

const args = process.argv.slice(2);
const out = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : '../releases/uiux-v22925-browser');
mkdirSync(out, { recursive: true });
const fixture = await createV2265QaFixture();
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse('2026-07-15T12:00:00+09:00');
let cookie = fixture.cookie, fragmentDelay = 0, fragmentFailure = false;
const server = createServer(async (req, res) => {
  try {
    if (req.url.includes('fragment=1')) {
      if (fragmentDelay) await new Promise(r => setTimeout(r, fragmentDelay));
      if (fragmentFailure) { res.writeHead(503); res.end('fixture failure'); return; }
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers(req.headers);
    headers.set('cookie', cookie);
    if (headers.has('origin')) headers.set('origin', 'https://malhaebook.com');
    const response = await app.fetch(new Request('https://malhaebook.com' + req.url, {
      method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    }), fixture.env, { waitUntil() {} });
    res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([name]) => name !== 'content-encoding')));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const originTool = readFileSync(new URL('./screen-audit.mjs', import.meta.url), 'utf8');
const findChrome = Function('existsSync', 'process', originTool.slice(originTool.indexOf('function findChrome()'), originTool.indexOf('// ── 1.')) + ';return findChrome;')(existsSync, process);
const openBrowser = Function('spawn', originTool.slice(originTool.indexOf('function openBrowser('), originTool.indexOf('const wait =')) + ';return openBrowser;')(spawn);
const measureScreen = Function('WIDTH', originTool.slice(originTool.indexOf('const MEASURE ='), originTool.indexOf('// ── 3.')) + ';return MEASURE;');
const chromePath = findChrome();
assert.ok(chromePath, 'Chrome/Edge is required');
const browser = openBrowser(chromePath, join(out, 'profile'));
let checks = 0;
const results = [], errors = [];
const check = (value, label) => { assert.ok(value, label); checks++; results.push(label); };
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => browser.send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Runtime.enable');
  // The shared CDP pipe resolves responses only. Capture runtime failures in-page.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)))` });
  const evaluate = async source => {
    const r = await cdp('Runtime.evaluate', { expression: source, awaitPromise: true, returnByValue: true });
    assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  async function until(source, label) {
    for (let i = 0; i < 60; i++) { if (await evaluate(source)) return; await wait(100); }
    throw Error('Timeout: ' + label);
  }
  async function navigate(path) {
    await cdp('Page.navigate', { url: base + path });
    await until(`document.readyState==='complete'&&!!document.querySelector('main')`, path);
    await wait(350);
  }
  async function shot(name) {
    await wait(180);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  const q = 'month=2026-07&household_id=house-home';
  for (const theme of ['light', 'dark']) {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)})` });
    for (const width of [360, 390, 768, 1440]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
      await navigate('/app?' + q);
      await until(`!!document.querySelector('.abHelpButton')`, 'popover enhancement');
      check(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `${theme}/${width}: home fits viewport`);
      check(await evaluate(`!document.querySelector('.homeInsights').open`), `${theme}/${width}: chart fold starts closed`);
      check(await evaluate(`document.querySelector('.homeInsights .readableTrendGrid').children.length===31`), `${theme}/${width}: chart retains all days`);
      await evaluate(`document.querySelector('.homeInsights>summary').click()`);
      check(await evaluate(`document.querySelector('.homeInsights').open`), `${theme}/${width}: chart can be opened`);
      await evaluate(`document.querySelector('.homeInsights>summary').click();document.querySelector('.abHelpButton').click()`);
      check(await evaluate(`!!document.querySelector('.abHelpPopover:popover-open')`), `${theme}/${width}: calculation help opens`);
      const helpBounds = await evaluate(`(()=>{let r=document.querySelector('.abHelpPopover').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`);
      check(helpBounds.left >= -1 && helpBounds.right <= helpBounds.width + 1 && helpBounds.top >= -1 && helpBounds.bottom <= helpBounds.height + 1, `${theme}/${width}: help stays onscreen`);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await evaluate(`document.querySelector('[data-ab-quick-open]').click()`);
      await until(`document.querySelector('.abQuickInputOverlay')?.getAttribute('aria-hidden')==='false'`, 'quick input');
      check(await evaluate(`!document.querySelector('.abHelpPopover:popover-open')`), `${theme}/${width}: quick input dismisses help`);
      await evaluate(`let input=document.getElementById('smartInput');input.value='점심 12000 국민카드';input.dispatchEvent(new Event('input',{bubbles:true}))`);
      await wait(80);
      check(await evaluate(`document.querySelector('.abQuickValue b').textContent.includes('12,000원')`), `${theme}/${width}: parsed amount preview`);
      await evaluate(`document.getElementById('amountInput').value='15000';document.getElementById('amountInput').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('memoInput').value='수정한 점심';document.getElementById('memoInput').dispatchEvent(new Event('input',{bubbles:true}))`);
      await wait(50);
      check(await evaluate(`document.querySelector('.abQuickValue b').textContent.includes('15,000원')&&document.querySelector('.abQuickValue small').textContent==='수정한 점심'`), `${theme}/${width}: manual corrections update preview`);
      if (width === 390) await shot('quick-' + theme);
      await navigate('/app?' + q + '&tab=transactions');
      await until(`!!document.querySelector('.v8-tx-main')`, 'transaction rows');
      check(await evaluate(`innerWidth<1320||!!document.querySelector('.abTransactionRail')`), `${theme}/${width}: transaction rail uses summary mode`);
      const beforeForms = await evaluate(`document.querySelectorAll('form.v8-edit').length`);
      await evaluate(`window.__qaOpener=document.querySelector('.v8-tx-main');__qaOpener.focus();__qaOpener.click()`);
      check(await evaluate(`document.querySelector('.abTxDetail').open`), `${theme}/${width}: row opens detail dialog`);
      check(await evaluate(`document.querySelectorAll('form.v8-edit').length===${beforeForms}`), `${theme}/${width}: viewing does not fetch editor`);
      await evaluate(`document.querySelector('[data-ab-tx-edit]').click()`);
      await until(`!!document.querySelector('.abTxDetail form.v8-edit')`, 'deferred editor');
      check(await evaluate(`document.querySelectorAll('.abTxDetail form.v8-edit').length===1`), `${theme}/${width}: editor is moved, not duplicated`);
      check(await evaluate(`document.querySelectorAll('.abTxDetail .abTxField').length===6`), `${theme}/${width}: editor fields have visible labels`);
      check(await evaluate(`document.querySelector('.abTxDetail').contains(document.activeElement)`), `${theme}/${width}: editor focus stays in dialog`);
      check(await evaluate(`document.activeElement===document.querySelector('.abTxDetail select[name="type"]')`), `${theme}/${width}: first edit field receives focus`);
      for (let i = 0; i < 14; i++) {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        check(await evaluate(`document.querySelector('.abTxDetail').contains(document.activeElement)`), `${theme}/${width}: Tab ${i + 1} stays in dialog`);
      }
      check(await evaluate(`document.querySelector('.abTxDetail form.v8-edit').action.endsWith('/admin/update')&&!!document.querySelector('.abTxDetail [formaction="/admin/delete"]')`), `${theme}/${width}: save and delete endpoints retained`);
      if (width === 390) await shot('edit-' + theme);
      const bounds = await evaluate(`(()=>{let r=document.querySelector('.abTxDetail').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})()`);
      check(bounds, `${theme}/${width}: dialog fits viewport`);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
      await wait(80);
      const escaped = await evaluate(`({open:document.querySelector('.abTxDetail').open,focus:document.activeElement===__qaOpener,active:document.activeElement.outerHTML.slice(0,150)})`);
      check(!escaped.open && escaped.focus, `${theme}/${width}: Escape restores opener focus ${JSON.stringify(escaped)}`);
      check(await evaluate(`!document.body.classList.contains('abTxDetailOpen')&&!!__qaOpener.parentElement.querySelector('.v8-editSlot form')`), `${theme}/${width}: closing restores editor and scrolling`);
      await evaluate(`__qaOpener.click();document.querySelector('[data-ab-tx-edit]').click()`);
      await wait(50);
      check(await evaluate(`document.activeElement===document.querySelector('.abTxDetail select[name="type"]')`), `${theme}/${width}: reopening a loaded editor focuses first field`);
      await evaluate(`document.querySelector('[data-ab-tx-close]').click()`);
      await wait(50);
      if (width === 1440) await shot('transactions-' + theme);
      errors.push(...await evaluate(`window.__qaErrors`));
    }
  }

  // A delayed response must not steal focus after the sheet closes.
  await navigate('/app?' + q + '&tab=transactions');
  fragmentDelay = 700;
  await evaluate(`window.__qaOpener=document.querySelector('.v8-tx-main');__qaOpener.click();document.querySelector('[data-ab-tx-edit]').click()`);
  await wait(100);
  await evaluate(`document.querySelector('.abTxDetail').close()`);
  await wait(900);
  check(await evaluate(`document.activeElement===__qaOpener&&!document.querySelector('.abTxDetail').open`), 'late editor response preserves restored focus');
  fragmentDelay = 0;
  await navigate('/app?' + q + '&tab=transactions');
  fragmentFailure = true;
  await evaluate(`document.querySelector('.v8-tx-main').click();document.querySelector('[data-ab-tx-edit]').click()`);
  await until(`!!document.querySelector('.abTxDetail .abEditStatus')?.textContent.includes('못했습니다')`, 'editor failure');
  check(await evaluate(`!!document.querySelector('.abTxDetail .v8-editOpen')`), 'failed editor keeps full-page fallback');
  fragmentFailure = false;
  await evaluate(`Array.from(document.querySelectorAll('.abTxDetail button')).find(b=>b.textContent==='다시 시도').click()`);
  await until(`!!document.querySelector('.abTxDetail form.v8-edit')`, 'editor retry');
  check(true, 'failed editor can retry');

  await navigate('/app?' + q + '&tab=transactions&q=' + encodeURIComponent('주유'));
  check(await evaluate(`document.querySelector('.abTransactionRail .abTransactionSummary>b').textContent.includes('1')&&document.querySelector('.abTransactionRail').textContent.includes('주유')`), 'desktop rail summarizes the filtered result');
  fixture.db.household_members.find(m => m.user_id === 'user-wifi' && m.household_id === 'house-home').role = 'viewer';
  cookie = await fixture.cookieFor('user-wifi');
  await navigate('/app?' + q + '&tab=transactions');
  await evaluate(`document.querySelector('.v8-tx-main').click()`);
  check(await evaluate(`document.querySelector('.abTxDetail').open&&document.querySelector('[data-ab-tx-edit]').hidden`), 'viewer detail remains read-only');
  check(await evaluate(`!document.querySelector('[data-ab-edit-src]')`), 'viewer has no deferred editor capability');
  check(await evaluate(`let row=document.querySelector('.v8-tx-main');row.getAttribute('aria-label').includes(row.querySelector('strong').textContent)&&row.getAttribute('aria-label').includes('2026-07')`), 'viewer accessible name retains amount and date');
  cookie = fixture.cookie;

  const fallbackScript = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `HTMLElement.prototype.showPopover=undefined;HTMLDialogElement.prototype.showModal=undefined` });
  await navigate('/app?' + q);
  check(await evaluate(`!!document.querySelector('details.abDailyHelp')&&!document.querySelector('.abHelpButton')`), 'unsupported Popover API retains native disclosure');
  await navigate('/app?' + q + '&tab=transactions');
  await evaluate(`document.querySelector('.v8-tx-main').click()`);
  await until(`!!document.querySelector('form.v8-edit')`, 'unsupported dialog fallback editor');
  check(await evaluate(`!document.querySelector('.abTxDetail')&&document.querySelector('details.v8-editWrap').open`), 'unsupported dialog retains native transaction editor');
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: fallbackScript.identifier });

  const csv = '날짜,구분,금액,분류,내용,결제수단\n2026-07-16,지출,12000,식비,점심,국민카드\n2026-07-16,지출,7000,쇼핑,환불 확인,국민카드\n2026-07-16,수입,90000,급여,추가 급여,계좌이체';
  const response = await app.fetch(new Request('https://malhaebook.com/my/import', { method: 'POST', headers: { cookie, origin: 'https://malhaebook.com' }, body: new URLSearchParams({ household_id: 'house-home', month: '2026-07', csv_text: csv, skip_duplicates: '1' }) }), fixture.env, { waitUntil() {} });
  const preview = await response.text();
  check(response.status === 200 && preview.includes('myImportCommitForm'), 'real import route produces preview');
  // Serve the same HTML through the fixture server, retaining local asset URLs.
  const previewPath = '/__qa_import_preview';
  const previewListener = async (req, res) => { if (req.url === previewPath) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(preview); } };
  // Swap the single request handler; no production endpoint is added.
  const originalListener = server.listeners('request')[0];
  server.removeListener('request', originalListener);
  server.on('request', (req, res) => req.url === previewPath ? previewListener(req, res) : originalListener(req, res));
  await navigate(previewPath);
  check(await evaluate(`document.querySelectorAll('.importPick').length===3&&document.getElementById('selectedImportExpense').textContent==='19,000원'&&document.getElementById('selectedImportIncome').textContent==='90,000원'`), 'initial selected income and expense are accurate');
  await evaluate(`let p=Array.from(document.querySelectorAll('.importPick')).find(p=>p.dataset.reviewNeeded==='1');p.checked=false;p.dispatchEvent(new Event('change',{bubbles:true}))`);
  check(await evaluate(`document.getElementById('selectedImportExpense').textContent==='12,000원'&&document.getElementById('selectedImportCount').textContent==='2건 선택'`), 'deselecting review row updates selected totals');
  await evaluate(`document.getElementById('reviewImportRows').click()`);
  check(await evaluate(`Array.from(document.querySelectorAll('.importPick')).filter(p=>!p.closest('tr').hidden).length===1&&document.querySelectorAll('.importPick:checked').length===2`), 'review filter preserves selection');
  await evaluate(`document.getElementById('clearImport').click()`);
  check(await evaluate(`document.getElementById('commitImport').disabled&&document.getElementById('selectedImportExpense').textContent==='0원'`), 'clearing selection disables commit');
  await evaluate(`document.getElementById('selectAllImport').click();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
  check(await evaluate(`!document.getElementById('commitImport').disabled&&document.getElementById('selectedImportExpense').textContent==='19,000원'`), 'select all and back-forward restore correct totals');
  await shot('import-preview-dark');
  errors.push(...await evaluate(`window.__qaErrors`));
  for (const theme of ['light', 'dark']) {
    const themeScript = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)})` });
    for (const width of [360, 390, 768, 1440]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
      await navigate(previewPath);
      check(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `${theme}/${width}: import preview fits viewport`);
      const measure = await evaluate(measureScreen(width));
      check(measure.contrast.length === 0, `${theme}/${width}: import preview text contrast ${measure.contrast.join('; ')}`);
      check(await evaluate(`Array.from(document.querySelectorAll('.importPickTarget')).every(e=>e.getBoundingClientRect().height>=44)`), `${theme}/${width}: import selections have 44px targets`);
      if (width === 390) { await evaluate(`document.querySelector('.importSelectionSummary').scrollIntoView()`); await shot('import-mobile-' + theme); }
      errors.push(...await evaluate(`window.__qaErrors`));
    }
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript.identifier });
  }
  check(errors.length === 0, 'no page runtime errors: ' + errors.join('; '));
  console.log(`PASS: UIUX browser audit (${checks} checks)`);
} finally {
  browser.close(); server.close(); fixture.restore(); delete globalThis.__AB_QA_FIXED_NOW_MS;
  writeFileSync(join(out, 'results.json'), JSON.stringify({ checks, results, errors }, null, 2) + '\n');
}
