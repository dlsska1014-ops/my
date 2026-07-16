# V22.6.1 계정 통합 세션·가계부 목록 복구 보고서

## 증상

계정 통합 후 웹 화면에 `Bin (통합됨)`처럼 보조 계정이 표시되고, 실제 주 계정이 보유하거나 참여한 가계부 목록이 0건으로 나타났다. 사용자는 기존 가계부에 진입할 수 없고 신규 생성·초대 참여 화면만 볼 수 있었다.

## 원인

V22.4.1 계정 통합은 거래, 참여 역할, 별칭, 로그인 연결을 주 계정으로 이전하고 보조 사용자 행은 이력용으로 보존한다. 그러나 통합 전에 발급된 `ab_user` 쿠키는 보조 사용자 ID를 계속 담고 있었다. 기존 웹 경로는 이 세션 ID를 그대로 `household_members.user_id` 조회에 사용하여 이미 참여정보가 제거된 보조 계정에서 0건을 반환했다.

## 수정

1. 서명 검증만 수행하는 `verifyRawUserSession()`과 실제 업무 사용자 ID를 반환하는 `verifyUserSession()`을 분리했다.
2. 통합 표시 계정이면 `resolveEffectiveUserId()`가 주 계정 ID를 찾는다.
3. V22.6.1 이후 통합은 `identity_merge_redirect:<secondary_id>` 영구 포인터를 저장한다.
4. 과거 통합은 기존 `identity_merge_audit:*:<secondary_id>` 감사 기록을 조회하여 복구한다.
5. GET/HEAD 사용자 경로는 주 계정 쿠키를 자동 재발급하고 같은 주소로 한 번 이동한다.
6. POST 요청은 이동시키지 않고 본문을 그대로 처리하면서 주 계정 ID로 생성·참여·거래·설정을 저장한다.
7. 통합 사용자 매핑은 Worker 인스턴스에서 10분 캐시하되, 통합 표시 계정의 매핑 조회 실패는 음성 캐시하지 않아 다음 요청에서 재시도한다.

## 적용 경로

`verifyUserSession()`을 사용하는 모든 웹 사용자 경로에 공통 적용된다. 주요 경로는 다음과 같다.

- `/my`, `/my/households`, `/app`
- `/my/analysis`, `/my/calendar`, `/my/settings`, `/my/premium`
- `/my/create`, `/my/join`, `/my/transactions`, `/my/update`, `/my/delete`
- 예산·분류·정기지출·프로필·백업 관련 사용자 경로
- `/households`, `/keyword-guide`, `/payment-methods`, `/reserve-plans`

## 변경하지 않은 부분

- OpenBuilder 시나리오·블록·Skill URL
- Supabase 테이블과 컬럼 구조
- 카카오 챗봇 계정 선택·단톡방 연결 규칙
- 거래·예산·정산·분석·프리미엄 기능
- V22.6 미완성 기능 숨김 정책

## 운영 결과 기대

과거 보조 계정 세션으로 접속해도 한 번의 자동 이동 후 주 계정 세션으로 바뀌고, 기존 가계부 목록과 주 계정 닉네임이 표시된다. 기존 가계부가 있는 사용자는 신규 시작 화면으로 떨어지지 않는다.
