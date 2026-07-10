import mod from './src/index.js';
const env = { APP_NAME:'똑똑한가계부', ADMIN_PASSWORD:'pw', SUPABASE_URL:'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'x' };
async function hit(path, headers={}) {
  const req = new Request('https://example.com'+path, { method:'GET', headers });
  const res = await mod.fetch(req, env, { waitUntil(){} });
  const text = await res.text();
  console.log(path, res.status, text.slice(0,80).replace(/\n/g,' '));
}
await hit('/health');
await hit('/real-user-qa');
await hit('/quick-input-qa');
await hit('/meme-card-content');
await hit('/release-dry-run'); // redirect expected
await hit('/release-dry-run', {authorization:'Bearer pw'});
