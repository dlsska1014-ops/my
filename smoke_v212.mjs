import app from './src/index.js';

const env = {
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  APP_NAME: '똑똑한가계부'
};

async function check(path) {
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com' + path), env, { waitUntil() {} });
  const text = await res.text();
  console.log(path, res.status);
  if (!text.includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX') && path === '/health') throw new Error('version mismatch');
  if (path === '/skill' && !text.includes('/skill')) throw new Error('skill get guide missing');
}

await check('/health');
await check('/skill');
await check('/start-guide');
console.log('V21.2 smoke PASS');
