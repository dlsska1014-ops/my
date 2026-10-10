import { counter, fixture, page, app, BASE, ctx, putSetting, intercept } from './lib-audit-v22934.mjs';
const { ok, eq, done } = counter('V22.9.38 화면 자산·선택 표 검사 통과');
for (const present of [false, true]) await fixture(async fx => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await fetch(`${fx.env.SUPABASE_URL}/rest/v1/accountbook_categories`, { method, ...(method === 'GET' ? {} : { body: '{}' }) });
    eq(response.status, present ? method === 'POST' ? 201 : 200 : 404, `${method}: 분류 표 ${present ? '존재' : '부재'} 모드를 반영한다`);
    if (!present) eq((await response.json()).code, 'PGRST205', '자동 빈 표 생성 전에 실제 누락 오류를 반환한다');
  }
}, { categoriesPresent: present });
await fixture(async fx => {
  putSetting(fx, 'custom_categories:house-home', JSON.stringify([{ id:'settings-local', name:'부재모드분류', type:'expense' }]));
  const restore = intercept(async ({ url }) => {
    if (url.pathname.endsWith('/accountbook_settings') && url.searchParams.get('key')?.startsWith('in.(')) await new Promise(resolve => setTimeout(resolve, 25));
    return null;
  });
  let shown;
  try { shown = await page(fx, '/reserve-plans?household_id=house-home&month=2026-07'); } finally { restore(); }
  eq(shown.status, 200, '선택 표의 빠른 실패와 느린 설정 조회가 겹쳐도 화면이 열린다');
  ok(shown.html.includes('부재모드분류'), '부재 모드에서 설정 저장 분류를 실제로 제공한다');
}, { categoriesPresent: false });
await fixture(async fx => {
  const response = await fetch(`${fx.env.SUPABASE_URL}/rest/v1/accountbook_categories`);
  eq(response.status, process.env.AB_QA_CATEGORIES_ABSENT === '1' ? 404 : 200, '전체 하네스 환경이 기본 픽스처에도 적용된다');
  for (const path of ['/budgets', '/my/settings', '/reserve-plans', '/reports', '/menu']) {
    const shown = await page(fx, path + '?household_id=house-home&month=2026-07');
    ok(shown.html.includes('/assets/accountbook-controls-v22938.js') && shown.html.includes('/assets/accountbook-controls-v22938.css'), `${path}: 지정 화면에서만 새 자산을 주입한다`);
  }
  for (const path of ['/app', '/my/analysis']) {
    const shown = await page(fx, path + '?household_id=house-home&month=2026-07');
    ok(!shown.html.includes('accountbook-controls-v22938'), `${path}: 홈·보호 분석 화면에는 새 자산을 넣지 않는다`);
  }
  for (const extension of ['js', 'css']) {
    const req = new Request(`${BASE}/assets/accountbook-controls-v22938.${extension}`);
    const response = await app.fetch(req, fx.env, ctx);
    eq(response.status, 200, '새 버전 자산을 제공한다');
    ok(response.headers.get('cache-control').includes('immutable'), '자산은 immutable이다');
    eq(response.headers.get('etag'), `"accountbook-controls-v22938-${extension}"`, '버전에 맞는 ETag를 제공한다');
    const head = await app.fetch(new Request(req.url, { method: 'HEAD' }), fx.env, ctx);
    eq(await head.text(), '', 'HEAD는 본문을 보내지 않는다');
  }
  const privatePage = await app.fetch(new Request(`${BASE}/reports?household_id=house-home`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  ok(privatePage.headers.get('cache-control').includes('no-store'), '개인 리포트는 no-store를 유지한다');
});
done();
