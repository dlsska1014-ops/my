import app from './src/index.js';

// ---------- 공통 ----------
function assert(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  console.log('PASS:', label);
}
function urlCount(text) { return (text.match(/https?:\/\/\S+/g) || []).length; }

const skillBody = (utterance, userKey, groupKey = '') => {
  const properties = { botUserKey: userKey };
  if (groupKey) properties.botGroupKey = groupKey;
  return JSON.stringify({ userRequest: { utterance, user: { id: userKey, type: 'botUserKey', properties } } });
};

async function post(env, body, headers = { 'content-type': 'application/json' }) {
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', { method: 'POST', headers, body }), env, { waitUntil() {} });
  const raw = await res.text();
  let data = null; try { data = JSON.parse(raw); } catch {}
  return { res, raw, data, text: data?.template?.outputs?.[0]?.simpleText?.text || '', quickReplies: data?.template?.quickReplies };
}

// ---------- 1부: 무DB (환경 미설정) ----------
const envNoDb = { APP_NAME: '똑똑한가계부', PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' };

const health = await app.fetch(new Request('https://ttokttok-accountbook.com/health'), envNoDb, { waitUntil() {} });
const healthText = await health.text();
assert(healthText.includes('V21.4.4-BASELINE-ALIGNMENT-HOTFIX'), '/health has V21.4.4-BASELINE-ALIGNMENT-HOTFIX');

const skillInfo = await app.fetch(new Request('https://ttokttok-accountbook.com/skill-info'), envNoDb, { waitUntil() {} }).then(r => r.text()).catch(() => '');
// P0-2: 라벨 통일
const menuJson = await app.fetch(new Request('https://ttokttok-accountbook.com/kakao-command-menu.json'), envNoDb, { waitUntil() {} }).then(r => r.text());
assert(menuJson.includes('disabled_by_baseline'), 'command JSON quick_replies=disabled_by_baseline');
assert(!menuJson.includes('오늘예산'), 'command JSON has no 오늘예산');
assert(menuJson.includes('가계부 만들기'), 'command JSON leads with 가계부 만들기');

// P0-1: 비 JSON POST는 운영 기본값에서 거래 처리 금지 (안전 응답 200)
const rawDefault = await post(envNoDb, '점심 12000 삼성카드');
assert(rawDefault.res.status === 200 && rawDefault.data?.version === '2.0', 'raw POST returns safe 200 kakao JSON');
assert(!rawDefault.text.includes('저장'), 'raw POST does not reach save flow by default');
const envRawTest = { ...envNoDb, ALLOW_RAW_SKILL_TEST: '1' };
const rawAllowed = await post(envRawTest, '메뉴');
assert(rawAllowed.res.status === 200 && rawAllowed.text.includes('명령'), 'ALLOW_RAW_SKILL_TEST=1 keeps raw test path');

// 도움말: 온보딩 순서 + URL 0 + quickReplies 없음
const help = await post(envNoDb, skillBody('도움말', 'nk-help'));
assert(help.text.includes('처음 시작 순서') && help.text.indexOf('가계부 만들기') < help.text.indexOf('점심 12000원'), 'help leads with 만들기→참여→기록 order');
assert(urlCount(help.text) === 0 && !help.quickReplies, 'help has no URL and no quickReplies');

// 메뉴: 시작(만들기) 그룹이 기록보다 먼저
const menu = await post(envNoDb, skillBody('메뉴', 'nk-menu'));
assert(menu.text.indexOf('가계부 만들기') < menu.text.indexOf('기록 점심'), 'menu lists 가계부 만들기 before 기록');

// V21.4 회귀: 접두어 스트리핑 동등성 + 기록 단독 + 반복 방어
const plain = await post(envNoDb, skillBody('점심 12000원 국민카드', 'nk-a'));
const prefixed = await post(envNoDb, skillBody('기록 점심 12000원 국민카드', 'nk-b'));
assert(plain.text === prefixed.text, '기록-prefix equals plain (no-db route)');
const solo = await post(envNoDb, skillBody('기록', 'nk-c'));
assert(solo.text.includes('입력 예시') && solo.text.includes('가계부 만들기'), '기록 alone → 입력 예시 + 만들기 우선 힌트');
const g1 = await post(envNoDb, skillBody('저녁 20000원 카드', 'nk-g'));
const g2 = await post(envNoDb, skillBody('기록 저녁 20000원 카드', 'nk-g'));
assert(!g1.text.includes('같은 내용') && g2.text.includes('같은 내용'), 'repeat guard on stripped text');

// 캘린더 회귀
const cal = await app.fetch(new Request('https://ttokttok-accountbook.com/my/calendar?month=2026-07&household_id=test'), envNoDb, { waitUntil() {} });
assert(cal.status >= 300 && cal.status < 400 && String(cal.headers.get('location')).includes('view=calendar'), '/my/calendar redirect regression ok');

// ---------- 2부: Supabase 모킹 (신규/기존 사용자) ----------
const envDb = { APP_NAME: '똑똑한가계부', PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com', SUPABASE_URL: 'https://sb.mock', SUPABASE_SERVICE_ROLE_KEY: 'k', KAKAO_REPEAT_GUARD_SECONDS: '2' };
const household = { id: 'h1', name: '우리집', invite_code: 'ABC123', created_at: '2026-01-01T00:00:00Z' };
const writes = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith('https://sb.mock')) return nativeFetch(input, init);
  const u = new URL(url);
  const method = String(init.method || 'GET').toUpperCase();
  const json = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } });
  if (method !== 'GET') { writes.push({ path: u.pathname, method, body: String(init.body || '') }); return json([{ id: 'w' }]); }
  if (u.pathname.includes('/users')) {
    const key = decodeURIComponent(String(u.searchParams.get('kakao_user_key') || ''));
    if (key.includes('newbie')) return json([{ id: key.replace('eq.', ''), kakao_user_key: key, nickname: '신규' }]);
    return json([{ id: 'u1', kakao_user_key: 'test-key', nickname: '기존' }]);
  }
  if (u.pathname.includes('/household_members')) {
    const uid = decodeURIComponent(String(u.searchParams.get('user_id') || ''));
    if (uid.includes('newbie')) return json([]);
    if (String(u.searchParams.get('role') || '') === 'eq.pending') return json([]);
    if (uid.includes('u1')) return json([{ household_id: 'h1', user_id: 'u1', role: 'owner', created_at: '2026-01-01T00:00:00Z' }]);
    return json([{ household_id: 'h1', user_id: 'u1', role: 'owner', nickname: '기존', created_at: '2026-01-01T00:00:00Z' }]);
  }
  if (u.pathname.includes('/households')) return json([household]);
  if (u.pathname.includes('/transactions')) return json([]);
  return json([]);
};

// 신규 사용자(가계부 없음): 기록 시도 → 온보딩 1단계 안내, 저장/생성 없음
writes.length = 0;
const onboard = await post(envDb, skillBody('점심 12000원 국민카드', 'newbie-1'));
assert(onboard.text.includes('1단계') && onboard.text.includes('가계부 만들기'), 'fresh user record attempt → onboarding step 1 (만들기)');
assert(onboard.text.indexOf('가계부 만들기') < onboard.text.indexOf('기록하기'), 'onboarding order: 만들기 before 기록');
assert(urlCount(onboard.text) === 1 && onboard.text.includes('/my/households'), 'onboarding has exactly 1 URL (/my/households)');
assert(writes.length === 0, 'fresh user record attempt causes zero DB writes');

// 신규 사용자: 요약도 온보딩으로
const onboard2 = await post(envDb, skillBody('요약', 'newbie-2'));
assert(onboard2.text.includes('1단계'), 'fresh user 요약 → onboarding');

// P0-4: 생성/참여/전환은 안내형 (기존 사용자 기준, DB 쓰기 0)
writes.length = 0;
const create = await post(envDb, skillBody('새가계부 만들기 여행비', 'exist-1'));
assert(create.text.includes('가계부 만들기 안내') && urlCount(create.text) === 1 && create.text.includes('/my/households'), '가계부 만들기 → 안내 + URL 1개');
const join = await post(envDb, skillBody('가계부참여 ZZZ999', 'exist-2'));
assert(join.text.includes('참여 안내') && urlCount(join.text) === 1, '가계부 참여 → 안내 + URL 1개');
const sw = await post(envDb, skillBody('가계부전환', 'exist-3'));
assert(sw.text.includes('전환') && urlCount(sw.text) === 1, '가계부 전환 → 안내 + URL 1개');
assert(writes.length === 0, '생성/참여/전환 안내는 DB 쓰기 0회');

// 단톡방 연결(그룹방)은 기존 기능 유지 (쓰기 허용)
writes.length = 0;
const bind = await post(envDb, skillBody('단톡방 연결 ABC123', 'newbie-3', 'group-9'));
assert(bind.text.includes('단톡방 연결 완료'), '단톡방 연결 still works in group room');
assert(writes.length > 0, '단톡방 연결 performs its writes (supported feature)');

// 기존 사용자 조회 응답 URL 0개
const sum = await post(envDb, skillBody('요약', 'exist-4'));
assert(urlCount(sum.text) === 0, '요약 has no URL');
const bud = await post(envDb, skillBody('남은예산', 'exist-5'));
assert(urlCount(bud.text) === 0 && bud.text.includes('예산'), '남은예산 responds with no URL');
const budCompat = await post(envDb, skillBody('오늘예산', 'exist-6'));
assert(budCompat.text === bud.text || budCompat.text.includes('예산'), '오늘예산 stays as hidden compat alias to budget');

// 초대코드: 단톡방 연결 안내 포함, 직접 참여 명령 안내 없음
const invite = await post(envDb, skillBody('초대코드', 'exist-7'));
assert(invite.text.includes('단톡방 연결 ABC123'), '초대코드 guides 단톡방 연결');
assert(!invite.text.includes('가계부 참여 ABC123'), '초대코드 no longer suggests in-chat join');

globalThis.fetch = nativeFetch;
console.log('SMOKE_V2144_OK');
