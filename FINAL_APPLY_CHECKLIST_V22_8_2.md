# V22.8.2 최종 적용 체크리스트

## 1. 적용 전

- [ ] 현재 Cloudflare Worker 소스·환경변수 백업
- [ ] 현재 Supabase 데이터 백업
- [ ] V22.8.0 자산 스키마 적용 상태 확인
- [ ] 카카오 설정을 바꾸는 동안 `KAKAO_LOGIN_ENABLED=0` 유지
- [ ] 로컬 로그인 이름·개인 비밀번호로 접속 가능한 계정 1개 확인

V22.8.2는 새 SQL이 없습니다. 기존 스키마를 삭제하거나 다시 만들지 마세요.

## 2. Worker 배포

- [ ] `src/index.js` 전체 반영
- [ ] `/health`에서 `V22.8.2-AUTH-UI-STABILITY` 확인
- [ ] `/my`에서 로컬 로그인·새 계정 만들기 화면 확인
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 세션 Secret 등 기존 운영값 유지

## 3. 카카오 로그인 설정

아래 값은 예시가 아니라 현재 운영 도메인 기준 권장값입니다.

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
KAKAO_REDIRECT_URI=https://ttokttok-accountbook.com/auth/kakao/callback
KAKAO_LOGIN_ENABLED=1
KAKAO_REST_API_KEY=<같은 카카오 앱의 REST API 키>
```

- [ ] 카카오 Developers에서 위 REST API 키와 같은 앱을 선택
- [ ] Web domain에 `https://ttokttok-accountbook.com` 등록
- [ ] Redirect URI에 `https://ttokttok-accountbook.com/auth/kakao/callback`을 글자 하나까지 동일하게 등록
- [ ] `www`, 끝 슬래시, `workers.dev`, Sites 주소가 섞이지 않았는지 확인
- [ ] 카카오 앱에서 Client Secret을 켰다면 `KAKAO_CLIENT_SECRET`을 Secret으로 저장하고 `KAKAO_CLIENT_SECRET_REQUIRED=1` 설정
- [ ] Client Secret을 끈 앱이면 `KAKAO_CLIENT_SECRET_REQUIRED=1`을 사용하지 않음
- [ ] 설정 완료 후에만 `KAKAO_LOGIN_ENABLED=1` 적용

`/kakao-login-check`의 “로컬 설정 일치”는 Worker 환경값끼리 맞는다는 뜻입니다. 카카오 관리자센터에 같은 URI가 실제 등록됐는지는 별도로 확인해야 합니다.

## 4. 로그인 회귀 확인

- [ ] `/my`에 카카오 로그인 버튼이 표시됨
- [ ] 카카오 로그인 시작 후 주소에 `redirect_uri=https://ttokttok-accountbook.com/auth/kakao/callback`이 사용됨
- [ ] 로그인 성공 후 기존 가계부가 보임
- [ ] 카카오 동의 취소 후 자체 안내 화면으로 돌아옴
- [ ] 잘못된/만료된 state 요청이 400 안내로 끝나고 다시 로그인 가능
- [ ] 카카오 설정 일부를 지우면 버튼이 자동으로 숨겨지고 로컬 로그인은 유지됨
- [ ] 카카오 계정 연결 모드가 현재 로그인 계정 외 다른 계정에 연결되지 않음

KOE006이 다시 보이면 즉시 `KAKAO_LOGIN_ENABLED=0`으로 내려 오류 진입을 막은 뒤, 같은 카카오 앱의 Redirect URI를 다시 대조하세요.

## 5. UI·UX 안정화 확인

- [ ] 확인창에서 취소한 뒤 버튼이 계속 눌림
- [ ] 삭제·방출·탈퇴·계정 통합 버튼이 일반 저장 버튼과 다른 위험 색상으로 보임
- [ ] 전체 메뉴에 영수증 기록·자동 리포트가 보임
- [ ] 사이드 메뉴와 전체 메뉴의 백업 링크가 모두 `/my/backup`으로 이동
- [ ] 첫 사용 안내가 가계부 준비 → 첫 기록 → 저장 결과 확인 순서로 표시
- [ ] 결과 확인 후 같은 가계부의 첫 사용 안내가 다시 방해하지 않음
- [ ] 모바일 320/360/390px에서 가로 넘침과 하단 메뉴 겹침 없음

## 6. 핵심 기능 회귀

- [ ] 카카오 한 줄 지출·수입 입력
- [ ] 최근 기록 조회·수정·삭제
- [ ] 카카오 WebView POST 저장과 외부 Origin CSRF 차단
- [ ] 자산 추가·수정·삭제와 가계부 간 격리
- [ ] 예산·정기지출 저장
- [ ] 백업·가져오기 미리보기
- [ ] 미완성 밈·카드 실적 경로 404 유지

## 7. 이상 시 복구

1. 로그인 문제만 있으면 먼저 `KAKAO_LOGIN_ENABLED=0`으로 전환합니다.
2. Worker 코드 문제면 직전 V22.8.1 Worker 버전으로 롤백합니다.
3. V22.8.2는 DB 변경이 없으므로 SQL 롤백은 하지 않습니다.
4. 오류 시각, 접속 호스트, `/kakao-login-check` 상태, 사용한 카카오 앱을 기록합니다. 키·Secret·비밀번호는 기록하거나 공유하지 않습니다.
