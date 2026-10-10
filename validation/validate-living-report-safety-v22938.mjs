import { counter, fixture, intercept, page, post, putSetting, settingValue, withClock, failure } from './lib-audit-v22934.mjs';
import { purgeHouseholdData } from '../src/index.js';
const { ok, eq, done } = counter('V22.9.38 리포트 안전성 검사 통과');
const url = '/reports?household_id=house-home&month=2026-07';
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const save = (fx, target, extra = {}) => post(fx, '/my/card-target/save', { household_id: 'house-home', month: '2026-07', asset_id: 'asset-1', target, ...extra });
await withClock('2026-07-15', async () => {
  await fixture(async fx => {
    let html = (await page(fx, '/reports?household_id=house-home&month=2026-06&range=week&week=2026-06-29')).html;
    ok(plain(html).includes('지출 148,000원'), '월을 넘는 마지막 주의 7월 4일 지출도 포함한다');
    html = (await page(fx, url + '&range=week&week=2025-01-06')).html;
    ok(plain(html).includes('7/13(월)부터 한 주'), '선택 월과 겹치지 않는 주를 기본 주로 돌린다');
    fx.db.transactions.push({ ...fx.db.transactions[0], id: 'future-income', transaction_date: '2026-07-20', amount: 999999 });
    html = (await page(fx, url)).html;
    ok(plain(html).includes('수입 3,380,000원'), '현재 월 수입도 오늘까지만 합산한다');
    ok(plain(html).includes('기록 5건'), '기록 수는 기간 내 수입과 지출을 함께 센다');
    html = (await page(fx, url.replace('2026-07', '2026-08'))).html;
    ok(!html.includes('aria-label="달성 배지"') && !plain(html).includes('보다 100% 적게'), '미래 기간은 감소나 달성 배지를 주장하지 않는다');
    await save(fx, '1000');
    html = (await page(fx, url + '&range=week&week=2026-07-06')).html;
    ok(!plain(html).includes('실적 목표 달성') && plain(html).includes('월 정기 예정액'), '주간 보기는 월 목표 달성 배지가 없고 월 정기 예정액으로 표기한다');
    const share = html.match(/<textarea[^>]*id="reportShare"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] || '';
    ok(share.includes('월 정기 예정액 650,000원'), '주간 공유 문구도 월 전체의 정기 예정액임을 명시한다');
  });
  await fixture(async fx => {
    const restore = intercept(({ url: u }) => u.pathname.endsWith('/transactions') && String(u.search).includes('2026-04-01') ? failure() : null);
    let html;
    try { html = (await page(fx, '/reports?household_id=house-home&month=2026-06&range=week&week=2026-06-29')).html; } finally { restore(); }
    ok(plain(html).includes('합계·기록 수·무지출 일수를 확인할 수 없어요'), '월 경계 주의 조회 실패는 불완전한 합계를 숨긴다');
    ok(!html.includes('class="lrBars"') && !plain(html).includes('무지출 7일'), '불러오지 못한 날짜를 무지출로 그리지 않는다');
  });
  for (const bad of ['1e3', '0x1000', '1,00', '1 000', '1000원', '1.5', '-1000']) await fixture(async fx => {
    ok((await save(fx, bad)).location.includes('card_target_invalid'), `${bad}: 엄격하지 않은 목표는 거절한다`);
    eq(settingValue(fx, 'card_targets:house-home'), undefined, '잘못된 목표로 설정을 만들지 않는다');
  });
  await fixture(async fx => {
    await save(fx, '1,000');
    ok((await save(fx, '0')).location.includes('card_target_cleared'), '명시적인 0은 목표를 지운다');
    const raw = JSON.stringify({ 'asset-1': { target: 2000 }, other: { target: 'bad', note: 'preserve' } });
    putSetting(fx, 'card_targets:house-home', raw);
    ok((await save(fx, '3000')).location.includes('card_target_save_failed'), '다른 항목이 잘못된 목표 맵은 저장을 거절한다');
    eq(settingValue(fx, 'card_targets:house-home'), raw, '잘못된 다른 항목도 원문 그대로 보존한다');
    ok(!(await page(fx, url)).html.includes('action="/my/card-target/save"'), '잘못된 저장 맵을 기본값으로 편집하지 않는다');
  });
  for (const role of ['viewer', 'removed']) await fixture(async fx => {
    const restore = intercept(({ url: u, init }) => {
      if (u.pathname.endsWith('/accountbook_claim_operation') && String(init.body).includes('household-settings-rmw:house-home')) {
        if (role === 'removed') fx.db.household_members = fx.db.household_members.filter(m => m.user_id !== 'user-bin' || m.household_id !== 'house-home');
        else fx.db.household_members.find(m => m.user_id === 'user-bin' && m.household_id === 'house-home').role = role;
      }
      return null;
    });
    try { ok((await save(fx, '5000')).location.includes('card_target_write_not_allowed'), `${role}: 잠금 획득 중 권한이 바뀌면 거절한다`); }
    finally { restore(); }
    eq(settingValue(fx, 'card_targets:house-home'), undefined, '권한 변경 후 목표를 쓰지 않는다');
  });
  for (const mode of ['settings', 'preference', 'history', 'recurring']) await fixture(async fx => {
    if (mode === 'preference') putSetting(fx, 'free_report_preference:house-home', '{"enabled":"false"}');
    const restore = intercept(({ url: u }) => {
      if (mode === 'settings' && u.pathname.endsWith('/accountbook_settings') && u.searchParams.get('key')?.startsWith('in.(')) return failure();
      if (mode === 'history' && u.pathname.endsWith('/transactions') && String(u.search).includes('2026-05-01')) return failure();
      if (mode === 'recurring' && u.pathname.endsWith('/accountbook_recurring')) return failure();
      return null;
    });
    let html;
    try { html = (await page(fx, url)).html; } finally { restore(); }
    if (mode === 'settings' || mode === 'preference') {
      ok(!html.includes('action="/my/report-preference/save"'), `${mode}: 설정을 못 읽으면 기본값 저장 폼을 그리지 않는다`);
      ok(!plain(html).includes('등록한 카드가 없어요') && plain(html).includes('카드 설정을 불러오지 못해'), '설정 실패를 등록 카드 없음으로 표현하지 않는다');
    }
    if (mode === 'history') {
      ok(plain(html).includes('이전 기록을 불러오지 못해 비교할 수 없어요'), '기록 조회 실패를 비교 기록 0건으로 말하지 않는다');
      ok(!html.includes('aria-label="달성 배지"') && !plain(html).includes('지난 기간보다 늘어난 생활비 항목이 없어요'), '조회 실패에서 배지와 증가 없음 주장을 숨긴다');
    }
    if (mode === 'recurring') ok(plain(html).includes('정기 항목을 불러오지 못했습니다') && !plain(html).includes('등록한 정기 지출이 없어요'), '정기 조회 실패를 0건으로 말하지 않는다');
  });
  await fixture(async fx => {
    putSetting(fx, 'card_targets:house-home', '{"asset-1":{"target":1000}}');
    putSetting(fx, 'card_targets:house-home-other', '{"other":{"target":2000}}');
    await purgeHouseholdData(fx.env, 'house-home');
    eq(settingValue(fx, 'card_targets:house-home'), undefined, '가계부 삭제는 목표 설정도 지운다');
    ok(settingValue(fx, 'card_targets:house-home-other').includes('2000'), '비슷한 이름의 다른 가계부 설정을 지우지 않는다');
  });
  await fixture(async fx => {
    putSetting(fx, 'card_targets:house-home', '{"asset-1":{"target":1000}}');
    const before = (globalThis.__AB_OPS_EVENTS || []).length;
    const restore = intercept(({ url: u, method }) => method === 'DELETE' && u.searchParams.get('key') === 'eq.card_targets:house-home' ? failure() : null);
    try { await purgeHouseholdData(fx.env, 'house-home'); } finally { restore(); }
    ok(!fx.db.households.some(h => h.id === 'house-home'), '추가 설정 정리 실패가 확정된 가계부 삭제를 실패로 바꾸지 않는다');
    ok(!!settingValue(fx, 'card_targets:house-home'), '정리 실패 시 남은 설정을 확인한다');
    ok((globalThis.__AB_OPS_EVENTS || []).slice(before).some(e => e.kind === 'household_preference_cleanup_pending'), '설정 정리 대기 이벤트를 남긴다');
  });
});
for (const [year, lastDay] of [[2026, 28], [2024, 29]]) await withClock(`${year}-03-31`, () => fixture(async fx => {
  const html = (await page(fx, `/reports?household_id=house-home&month=${year}-03`)).html;
  ok(plain(html).includes(`지난달 1~${lastDay}일 대비`) && !plain(html).includes('지난달 같은 기간(1~31일)'), `${year}: 월말 비교 표시는 2월의 실제 마지막 날을 사용한다`);
  ok(plain(html).includes(`지난달 1일부터 ${lastDay}일까지와 견줍니다. 지난달은 마지막 날까지만 비교합니다.`), `${year}: 평년과 윤년의 실제 비교 범위를 설명한다`);
}));
done();
