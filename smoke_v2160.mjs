import app from './src/index.js';

const env = {
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  APP_NAME: '똑똑한가계부'
};

async function get(path) {
  return app.fetch(new Request('https://ttokttok-accountbook.com' + path), env, { waitUntil() {} });
}

let res = await get('/health');
const health = await res.json();
console.log('/health', res.status, health.version);
if (health.version !== 'V21.6.0-ANALYSIS-STUDIO') throw new Error('version mismatch');

res = await get('/my/analysis/app.js');
const js = await res.text();
console.log('/my/analysis/app.js', res.status, res.headers.get('content-type'));
if (res.status !== 200) throw new Error('analysis app.js failed');
if (!res.headers.get('content-type')?.includes('javascript')) throw new Error('bad content-type');
if (!js.includes('insightClientMain')) throw new Error('client bundle missing');
new Function(js);

res = await get('/my/analysis');
console.log('/my/analysis (no session)', res.status, res.headers.get('location'));
if (![301, 302, 303, 307].includes(res.status)) throw new Error('analysis should redirect without session');

res = await get('/my/analysis?view=report');
console.log('/my/analysis?view=report (no session)', res.status);
if (![200, 301, 302, 303, 307].includes(res.status)) throw new Error('report view broken');

console.log('V21.6.0 smoke PASS');
