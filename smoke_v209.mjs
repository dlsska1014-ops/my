import worker from './src/index.js';
const env = { APP_NAME: '똑똑한가계부', ADMIN_PASSWORD: 'test-admin' };
async function check(path, expectStatus = 200) {
  const res = await worker.fetch(new Request('https://example.test' + path), env, { waitUntil(){} });
  if (res.status !== expectStatus) throw new Error(`${path} status ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error(`${path} empty response`);
  if (expectStatus === 404 && !/noindex/.test(res.headers.get('x-robots-tag') || '')) throw new Error(`${path} missing noindex`);
  return text;
}
const health = await check('/health');
if (!health.includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX')) throw new Error('health version missing');
await check('/meme-content-center', 404);
await check('/meme-motion-guide', 404);
await check('/meme-review-check', 404);
await check('/meme-share-kit', 404);
await check('/meme-card-catalog.json', 404);
console.log('V20.9 smoke PASS');
