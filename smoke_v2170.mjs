import app from './src/index.js';

const env = {
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  APP_NAME: '똑똑한가계부'
};

async function get(path) {
  return app.fetch(new Request('https://ttokttok-accountbook.com' + path), env, { waitUntil() {} });
}

// 버전
let res = await get('/health');
const health = await res.json();
console.log('/health', res.status, health.version);
if (!/^V21\.7\./.test(String(health.version))) throw new Error('version mismatch');

// 분석 스튜디오 번들
res = await get('/my/analysis/app.js');
const js = await res.text();
if (res.status !== 200 || !js.includes('insightClientMain')) throw new Error('analysis bundle broken');
new Function(js);
console.log('/my/analysis/app.js OK');

// 레거시 화면 → 통합 화면 리다이렉트
const redirects = [
  ['/', '/my'],
  ['/manage', '/my'],
  ['/admin', '/my'],
  ['/admin-view', '/my'],
  ['/ledger?month=2026-07&household_id=h1', '/app?month=2026-07&household_id=h1&feed=all#feed'],
  ['/analysis?month=2026-07&household_id=h1', '/my/analysis?month=2026-07&household_id=h1&view=report'],
  ['/calendar?month=2026-07', '/app?month=2026-07&view=calendar#calendar'],
  ['/budgets?month=2026-07', '/my/settings?month=2026-07'],
];
for (const [from, to] of redirects) {
  res = await get(from);
  const loc = res.headers.get('location') || '';
  console.log(from, '->', res.status, loc);
  if (![301, 302, 303, 307, 308].includes(res.status)) throw new Error('expected redirect for ' + from);
  if (loc !== to) throw new Error(`redirect target mismatch for ${from}: ${loc}`);
}

// PWA
res = await get('/manifest.webmanifest');
const manifest = await res.json();
console.log('/manifest.webmanifest', res.status, manifest.name, manifest.display);
if (manifest.start_url !== '/my' || manifest.display !== 'standalone') throw new Error('manifest invalid');
if (!manifest.icons || manifest.icons.length < 2) throw new Error('manifest icons missing');

res = await get('/sw.js');
const sw = await res.text();
if (res.status !== 200 || !sw.includes('addEventListener')) throw new Error('sw.js broken');
console.log('/sw.js OK');

for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png']) {
  res = await get(icon);
  const buf = new Uint8Array(await res.arrayBuffer());
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  console.log(icon, res.status, buf.length + 'B', 'png=' + isPng);
  if (res.status !== 200 || !isPng) throw new Error(icon + ' broken');
}

// PWA 메타 주입 확인 (아무 HTML 화면)
res = await get('/privacy');
const html = await res.text();
if (res.status === 200 && !html.includes('rel="manifest"')) throw new Error('PWA head not injected');
console.log('PWA head injection OK');

console.log('V21.7.0 smoke PASS');
