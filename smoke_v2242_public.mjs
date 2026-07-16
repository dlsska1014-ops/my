import app from './src/index.js';
const env = { APP_NAME:'똑똑한가계부', PUBLIC_BASE_URL:'https://ttokttok-accountbook.com' };
function assert(v, label){ if(!v) throw new Error('FAIL: '+label); console.log('PASS:', label); }
const health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), env, {});
assert((await health.text()).includes('V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX'), 'health version');
const paths = ['/', '/service-guide','/how-it-works','/kakao-guide','/budget-guide','/group-accountbook','/security','/faq','/about','/contact','/privacy','/terms','/cookies','/site-map'];
for (const path of paths){
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com'+path), env, {});
  const html = await res.text();
  assert(res.status===200 && html.includes('pubHeader'), 'public '+path);
  assert(!/OpenBuilder|오픈빌더/.test(html), 'no internal platform term '+path);
  assert(!html.includes('거래 입력, 로그인, 온보딩 단계에는 광고'), 'no rigid ad placement promise '+path);
  assert(html.includes('abBusinessFooterInner'), 'compact business footer '+path);
}
let res = await app.fetch(new Request('https://ttokttok-accountbook.com/about'), env, {});
let html = await res.text();
assert(html.includes('누구나 꾸준히 쓸 수 있는 가계부') && html.includes('가족·부부 공동지출'), 'about value proposition');
assert(!html.includes('<h2>사업자 정보</h2>'), 'no duplicated business card');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/sitemap.xml'), env, {});
const xml = await res.text();
assert(res.status===200 && xml.includes('<?xml-stylesheet') && xml.includes('/site-map') && !xml.includes('<script'), 'sitemap xml clean styled');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/sitemap.xsl'), env, {});
const xsl = await res.text();
assert(res.status===200 && xsl.includes('XML 사이트맵') && xsl.includes('noindex,follow') && !xsl.includes('<!DOCTYPE html>'), 'sitemap stylesheet valid structure');
assert((res.headers.get('content-type')||'').includes('application/xml'), 'sitemap stylesheet content-type');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/cookies'), env, {});
html = await res.text();
assert(html.includes('Google 광고 및 데이터 이용 안내') && html.includes('Google 개인정보처리방침'), 'cookie official links');
assert(!html.includes('광고 맞춤설정 관리'), 'no misleading settings button');
res = await app.fetch(new Request('https://ttokttok-accountbook.com/privacy'), env, {});
html = await res.text();
assert(!html.includes('OpenBuilder') && !html.includes('초기 광고를 배치하지'), 'privacy public language');
console.log('SMOKE_V2242_OK');
