import worker from './src/index.js';
const env = { APP_NAME: '똑똑한가계부', ADMIN_PASSWORD: 'test-admin' };
async function check(path, expectStatus = 200) {
  const res = await worker.fetch(new Request('https://example.test' + path), env, { waitUntil(){} });
  if (res.status !== expectStatus) throw new Error(`${path} status ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error(`${path} empty response`);
  return text;
}
await check('/health');
await check('/meme-content-center');
await check('/meme-motion-guide');
await check('/meme-review-check');
await check('/meme-share-kit');
const catalog = await check('/meme-card-catalog.json');
if (!catalog.includes('V20.9-MEME-CONTENT-PUBLISH-BUNDLE')) throw new Error('catalog version missing');
console.log('V20.9 smoke PASS');
