import app from './src/index.js';

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
};

async function hit(path, init={}) {
  const req = new Request('https://ttokttok-accountbook.com' + path, init);
  const res = await app.fetch(req, env, {});
  const text = await res.text();
  console.log(path, res.status, text.slice(0, 160).replace(/\s+/g,' '));
  if (!res.ok) throw new Error(path + ' status ' + res.status);
  return {res, text};
}

await hit('/health');
await hit('/skill', {method:'GET'});
await hit('/kakao-command-system');
const menu = await hit('/skill', {method:'POST', body: JSON.stringify({ userRequest:{ utterance:'메뉴', user:{ id:'test-bot-user-key', type:'botUserKey', properties:{botUserKey:'test-bot-user-key'} } } })});
if (!menu.text.includes('quickReplies')) throw new Error('quickReplies missing for menu');
const raw = await hit('/skill', {method:'POST', body:'점심 12000 삼성카드'});
if (!raw.text.includes('quickReplies')) throw new Error('quickReplies missing for raw');
await hit('/kakao-command-menu.json');
console.log('SMOKE_V213_OK');
