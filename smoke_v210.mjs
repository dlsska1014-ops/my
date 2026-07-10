import app from './src/index.js';
const env={ADMIN_PASSWORD:'pw', PUBLIC_BASE_URL:'https://accountbook.example.com'};
async function check(path, auth=false){
  const res=await app.fetch(new Request('https://service.example.com'+path,{headers: auth?{authorization:'Bearer pw'}:{}}), env, {waitUntil(){}});
  const text=await res.text();
  console.log(path, res.status, text.slice(0,120).replace(/\n/g,' '));
  if(res.status>=500) throw new Error(path+' failed '+res.status);
  return text;
}
await check('/health');
let domain=await check('/domain-migration', true);
if(!domain.includes('accountbook.example.com/skill')) throw new Error('domain public skill missing');
let final=await check('/beta-release-candidate', true);
if(!final.includes('V21.1-GROUP-CHATBOT-LAUNCH-SCALE-BUNDLE')) throw new Error('version missing');
let openbuilder=await check('/openbuilder-final', true);
if(!openbuilder.includes('accountbook.example.com/skill')) throw new Error('openbuilder public base missing');
let commands=await check('/kakao-commands');
if(!commands.includes('accountbook.example.com/skill')) throw new Error('commands public base missing');
// canonical redirect opt-in
let redir=await app.fetch(new Request('https://old.example.workers.dev/my'), {...env, CANONICAL_REDIRECT:'1'}, {waitUntil(){}});
console.log('/my canonical', redir.status, redir.headers.get('location'));
if(redir.status!==308 || !redir.headers.get('location').startsWith('https://accountbook.example.com/my')) throw new Error('canonical redirect failed');
