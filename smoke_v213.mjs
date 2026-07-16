import app from './src/index.js';

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
};

async function hit(path, init = {}, { allowRedirect = false } = {}) {
  const req = new Request('https://ttokttok-accountbook.com' + path, init);
  const res = await app.fetch(req, env, {});
  const text = await res.text();
  console.log(path, res.status, (res.headers.get('location') || text.slice(0, 120)).replace(/\s+/g, ' '));
  if (!res.ok && !(allowRedirect && res.status >= 300 && res.status < 400)) throw new Error(path + ' status ' + res.status);
  return { res, text };
}

// V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX: /health 버전 확인
const health = await hit('/health');
if (!health.text.includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX')) throw new Error('version mismatch on /health');

// 구주소 /my/calendar → /app?view=calendar 리다이렉트 확인
const cal = await hit('/my/calendar?month=2026-07&household_id=test', {}, { allowRedirect: true });
if (cal.res.status < 300 || cal.res.status >= 400) throw new Error('/my/calendar expected 30x, got ' + cal.res.status);
const calLoc = cal.res.headers.get('location') || '';
if (!calLoc.includes('/app') || !calLoc.includes('view=calendar')) throw new Error('/my/calendar redirect target wrong: ' + calLoc);

// /app 응답 확인 (미로그인 시 /my 로그인 화면으로 안전 이동)
const appRes = await hit('/app', {}, { allowRedirect: true });
if (appRes.res.status >= 300 && appRes.res.status < 400) {
  const loc = appRes.res.headers.get('location') || '';
  if (!loc.startsWith('/my')) throw new Error('/app redirect target wrong: ' + loc);
  await hit(loc);
}

await hit('/start-guide');
await hit('/skill', { method: 'GET' });
await hit('/kakao-command-system');
const menu = await hit('/skill', { method: 'POST', body: JSON.stringify({ userRequest: { utterance: '메뉴', user: { id: 'test-bot-user-key', type: 'botUserKey', properties: { botUserKey: 'test-bot-user-key' } } } }) });
if (menu.text.includes('quickReplies')) throw new Error('general menu must not auto-attach quickReplies');
const raw = await hit('/skill', { method: 'POST', body: '점심 12000 삼성카드' });
if (raw.text.includes('quickReplies')) throw new Error('general raw response must not auto-attach quickReplies');
await hit('/kakao-command-menu.json');
console.log('SMOKE_V213_OK');
