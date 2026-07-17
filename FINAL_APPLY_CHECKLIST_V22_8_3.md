# V22.8.3 최종 적용 체크리스트

## 1. 적용 전

- [ ] 현재 Cloudflare Worker 코드와 환경변수 백업
- [ ] 현재 Supabase 데이터 백업
- [ ] `schema_v22_8_0_asset_dashboard_complete.sql` 적용 상태 확인
- [ ] 로컬 로그인으로 접속 가능한 운영 테스트 계정 확인
- [ ] 카카오 설정 대조가 끝날 때까지 `KAKAO_LOGIN_ENABLED=0` 유지

V22.8.3은 새 SQL이 없습니다. 기존 스키마를 삭제하거나 다시 적용하지 마세요.

## 2. Worker 적용

- [ ] `src/index.js` 전체 교체 후 배포
- [ ] `/health`에서 `V22.8.3-REVIEWED-STABILITY` 확인
- [ ] 기존 Supabase·세션 Secret·관리자 환경값 유지
- [ ] `/my` 로컬 로그인과 새 계정 화면 확인

## 3. 카카오 관리자 설정

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
KAKAO_REDIRECT_URI=https://ttokttok-accountbook.com/auth/kakao/callback
KAKAO_LOGIN_ENABLED=1
KAKAO_REST_API_KEY=<같은 카카오 앱의 REST API 키>
```

- [ ] REST API 키가 선택한 카카오 앱의 값인지 확인
- [ ] Web domain에 `https://ttokttok-accountbook.com` 등록
- [ ] Redirect URI를 `https://ttokttok-accountbook.com/auth/kakao/callback`과 글자 하나까지 동일하게 등록
- [ ] `www`, 끝 슬래시, `workers.dev`, Sites 주소가 섞이지 않았는지 확인
- [ ] Client Secret을 켠 앱이면 Secret 저장 후 `KAKAO_CLIENT_SECRET_REQUIRED=1` 설정
- [ ] 설정 완료 후에만 `KAKAO_LOGIN_ENABLED=1` 적용

`/kakao-login-check`는 Worker 내부 설정 일치만 확인합니다. 카카오 관리자센터 등록 여부는 운영자가 별도로 확인해야 합니다.

## 4. 로그인 실사용 확인

- [ ] 카카오 로그인 버튼 표시
- [ ] authorize 요청의 `redirect_uri`가 고정 callback과 일치
- [ ] 로그인 성공 후 기존 가계부 표시
- [ ] 새 사용자는 가계부 만들기·참여 흐름으로 이동
- [ ] 동의 취소 시 자체 안내와 다른 로그인 방법 표시
- [ ] 잘못된 state, token, profile 오류가 단계별 한국어 안내와 오류 코드로 종료
- [ ] 오류 뒤 다시 로그인 가능하고 임시 쿠키가 남지 않음
- [ ] 카카오 설정 일부 제거 시 버튼이 숨겨지고 로컬 로그인은 유지

## 5. 제출·UI 안정성 확인

- [ ] 확인창 취소 후 버튼이 잠기지 않음
- [ ] 저장 중 뒤로가기를 해도 버튼과 문구가 복원됨
- [ ] 여러 버튼이 있는 폼에서 실제 누른 버튼만 잠김
- [ ] 가계부 생성·참여 버튼이 한 번만 잠기고 문구가 정상 복원됨
- [ ] 삭제·방출·탈퇴·통합 버튼이 위험 색상과 확인 문구로 표시
- [ ] 모바일 320/360/390px에서 가로 넘침과 하단 메뉴 겹침 없음

## 6. 핵심 회귀

- [ ] 카카오 한 줄 수입·지출 저장과 최근 기록 조회·수정·삭제
- [ ] 카카오 WebView POST 저장과 외부 Origin CSRF 차단
- [ ] 가계부 생성·참여·전환·삭제 및 참여자 권한
- [ ] 자산 추가·수정·삭제와 가계부 간 격리
- [ ] 예산·정기지출·정산·영수증·자동 리포트
- [ ] 백업·가져오기 미리보기와 중복 제외
- [ ] 미완성 밈·카드 실적 경로 404 유지

## 7. 장애 시

1. 카카오 로그인 문제면 `KAKAO_LOGIN_ENABLED=0`으로 즉시 비활성화합니다.
2. 오류 화면의 `K`로 시작하는 추적 코드, 시각, 접속 호스트, 실패 단계를 기록합니다.
3. 키·Secret·비밀번호·카카오 응답 원문은 기록하거나 공유하지 않습니다.
4. Worker 문제면 직전 안정 버전으로 롤백합니다.
5. V22.8.3은 DB 변경이 없으므로 SQL 롤백은 하지 않습니다.

