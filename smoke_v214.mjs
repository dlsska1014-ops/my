import app from './src/index.js';

const env = {
  APP_NAME: '똑똑한가계부',
  PUBLIC_BASE_URL: 'https://ttokttok-accountbook.com',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
};

function assert(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  console.log('PASS:', label);
}

async function skill(utterance, userKey = 'test-bot-user-key') {
  const body = JSON.stringify({ userRequest: { utterance, user: { id: userKey, type: 'botUserKey', properties: { botUserKey: userKey } } } });
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com/skill', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), env, {});
  const data = JSON.parse(await res.text());
  const text = data?.template?.outputs?.[0]?.simpleText?.text || '';
  if (res.status !== 200 || data.version !== '2.0') throw new Error('bad skill response for ' + utterance);
  return text;
}

async function hit(path, { allowRedirect = false } = {}) {
  const res = await app.fetch(new Request('https://ttokttok-accountbook.com' + path), env, {});
  const text = await res.text();
  if (!res.ok && !(allowRedirect && res.status >= 300 && res.status < 400)) throw new Error(path + ' status ' + res.status);
  return { res, text };
}

// 버전
const health = await hit('/health');
assert(health.text.includes('V21.4.1-KAKAO-RESPONSE-ROUTING-HOTFIX'), '/health has V21.4.1-KAKAO-RESPONSE-ROUTING-HOTFIX');

// 1. "기록 점심 12000원 국민카드" → 접두어 제거 후 기존 "점심 12000원 국민카드"와 동일 결과
const plain = await skill('점심 12000원 국민카드', 'user-a');
const prefixed = await skill('기록 점심 12000원 국민카드', 'user-b');
assert(plain === prefixed, '기록-prefixed record equals plain record response');

// 2. "기록" 단독 → 입력 예시 안내 (최근 조회 아님)
const solo = await skill('기록', 'user-c');
assert(solo.includes('입력 예시'), '기록 alone returns input example guide');
assert(!solo.includes('최근 기록'), '기록 alone is not a recent-records response');

// 3. "수정 01번 금액 13000원" → 기존 번호수정("01번 금액 13000원")과 동일 동작
const editPlain = await skill('01번 금액 13000원', 'user-d');
const editPrefixed = await skill('수정 01번 금액 13000원', 'user-e');
assert(editPlain === editPrefixed, '수정-prefixed edit equals plain numbered edit response');

// "수정" 단독 → 수정가이드
const editSolo = await skill('수정', 'user-f');
assert(editSolo.includes('수정가이드'), '수정 alone returns edit guide');

// 4. "오늘 기록" → 조회 계열 유지 (스트리핑 미적용: 입력 예시/수정가이드로 새지 않음)
const todayList = await skill('오늘 기록', 'user-g');
assert(!todayList.includes('입력 예시') && !todayList.includes('수정가이드'), '오늘 기록 is not stripped into a guide response');
// "기록 오늘" 역순 입력 → 조회로 오인되지 않아야 함 ("오늘"로 스트리핑되어도 조회 응답 아님)
const reversed = await skill('기록 오늘', 'user-h');
assert(!reversed.includes('오늘 기록 목록') && !reversed.includes('최근 기록'), '기록 오늘 is not misread as a recent/today query');

// 5. 요약 / 남은예산 / 정산 회귀 없음
const summary = await skill('요약', 'user-i');
const budget = await skill('남은예산', 'user-i');
const settle = await skill('정산', 'user-i');
assert(summary.length > 0 && budget.length > 0 && settle.length > 0, '요약/남은예산/정산 respond');
assert(budget.includes('예산'), '남은예산 keeps budget guide');
assert(settle !== summary && settle.includes('정산'), '정산 is separated from 요약');

// 6. 같은 발화 2회 연속 → 반복 발화 방어 유지 (접두어 유무 무관, 스트리핑 후 텍스트로 dedup)
const first = await skill('저녁 20000원 카드', 'user-j');
const second = await skill('기록 저녁 20000원 카드', 'user-j');
assert(second.includes('같은 내용'), 'repeat guard fires on same content even with 기록 prefix');
assert(!first.includes('같은 내용'), 'first send is not guarded');

// 도움말: 드롭다운 안내 한 줄 포함
const help = await skill('도움말', 'user-k');
assert(help.includes('"/" 를 입력하면 명령어 목록이 열립니다.'), 'help mentions "/" command dropdown');

// V21.3 캘린더 회귀
const cal = await hit('/my/calendar?month=2026-07&household_id=test', { allowRedirect: true });
const calLoc = cal.res.headers.get('location') || '';
assert(cal.res.status >= 300 && cal.res.status < 400 && calLoc.includes('/app') && calLoc.includes('view=calendar'), '/my/calendar still redirects to home calendar');

console.log('SMOKE_V214_OK');
