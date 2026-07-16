import app from './src/index.js';

const env = {
  APP_NAME: '똑똑한가계부',
  ADMIN_PASSWORD: 'pw',
  PUBLIC_BASE_URL: 'https://accountbook.example.com',
};

async function req(path, auth=false, extraEnv={}) {
  const headers = auth ? { authorization: 'Bearer pw' } : {};
  const res = await app.fetch(new Request('https://service.example.com' + path, { headers }), { ...env, ...extraEnv }, { waitUntil(){} });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

const checks = [];
checks.push(['/health', await req('/health')]);
checks.push(['/group-chatbot-launch', await req('/group-chatbot-launch', true)]);
checks.push(['/group-chatbot-scale', await req('/group-chatbot-scale', true)]);
checks.push(['/personal-url-audit', await req('/personal-url-audit', true)]);
checks.push(['/kakao-new-bot-config.json', await req('/kakao-new-bot-config.json')]);
checks.push(['/operation-center', await req('/operation-center', true)]);
for (const [path, r] of checks) {
  if (r.status < 200 || r.status >= 400) throw new Error(`${path} status ${r.status}: ${r.text.slice(0,120)}`);
}
if (!checks[0][1].text.includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX')) throw new Error('version mismatch');
if (!checks[1][1].text.includes('신규 그룹 챗봇 제작 기준')) throw new Error('group launch text missing');
if (!checks[2][1].text.includes('그룹 챗봇 대량 트래픽 준비')) throw new Error('scale text missing');
if (!checks[3][1].text.includes('개인 주소 제거 점검')) throw new Error('personal audit text missing');
if (!checks[4][1].text.includes('accountbook.example.com/skill')) throw new Error('config skill url missing');
if (!checks[5][1].text.includes('신규 그룹 챗봇 제작')) throw new Error('operation center link missing');

const redir = await req('/my', false, { CANONICAL_REDIRECT: '1', PUBLIC_BASE_URL: 'https://accountbook.example.com' });
if (redir.status !== 308 && redir.status !== 303) {
  // 308 expected if origin host differs; allow 303 only if route-level redirect wins in future.
  throw new Error(`canonical redirect unexpected status ${redir.status}`);
}
console.log('V21.1 smoke PASS');
