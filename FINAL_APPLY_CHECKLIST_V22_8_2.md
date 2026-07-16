# V22.8.2 최종 적용 체크리스트

## 1. 적용 전

- [ ] 현재 Cloudflare Worker 소스와 환경변수 백업
- [ ] 현재 Supabase 데이터 백업
- [ ] 기존 V22.8.0 SQL 적용 상태 확인 (이번 버전은 SQL 변경 없음)
- [ ] KOE006 오류 화면에서 "왜 에러가 발생하나요?"를 열어 실제 전송된 Redirect URI 기록

## 2. 환경변수 (카카오 로그인을 켤 경우 전부 필수)

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
KAKAO_REDIRECT_URI=https://ttokttok-accountbook.com/auth/kakao/callback
KAKAO_LOGIN_ENABLED=1
KAKAO_REST_API_KEY=<운영 카카오 앱의 REST API 키>
KAKAO_CLIENT_SECRET=<해당 앱에서 클라이언트 시크릿이 ON이면 필수, OFF면 생략>
```

- [ ] `KAKAO_REDIRECT_URI` 미설정 시 로그인 버튼이 자동 비노출됨(fail-closed)을 이해했는지 확인
- [ ] 카카오 Developers의 **동일한 REST API 키가 속한 앱**에 `https://ttokttok-accountbook.com/auth/kakao/callback`을 문자 단위로 등록 (https, www 유무, 끝 슬래시, 철자)
- [ ] 카카오 앱의 클라이언트 시크릿 ON/OFF 상태와 `KAKAO_CLIENT_SECRET` 설정 여부 일치 확인
- [ ] 운영과 스테이징은 카카오 앱·키 분리

## 3. 배포

- [ ] `src/index.js`를 기존 Worker에 반영
- [ ] `/health`가 `V22.8.2-AUTH-UIUX-STABILIZATION`을 반환하는지 확인
- [ ] `/kakao-login-check`에서 전 항목 "정상" 확인 (버튼을 켠 경우)
- [ ] `/ops-audit`의 "카카오 로그인 구성" 행 정상 확인

## 4. 카카오 로그인 확인 (버튼을 켠 경우)

- [ ] 운영 도메인에서 카카오 로그인 → 세션 → /my 진입 연속 성공
- [ ] workers.dev 주소에서 `/auth/kakao/start` 접근 시 운영 도메인으로 이동 후 정상 로그인
- [ ] 카카오 동의 화면에서 취소 → "취소했습니다" 안내와 다른 접속 방법 노출
- [ ] 실패 화면에 오류 코드(K…)가 표시되고 운영 이벤트에 같은 코드 기록 확인
- [ ] 로그인 후 브라우저에 `kakao_oauth_state` 쿠키가 남아 있지 않은지 확인

## 5. 제출·파괴 동작 확인

- [ ] 가계부 영구 삭제: confirm 취소 후 버튼이 "저장 중…"으로 잠기지 않음
- [ ] 저장 중 뒤로가기 후 복귀 시 버튼 정상 복구
- [ ] 정기지출 삭제 버튼이 붉은 danger 스타일 + 확인 대화상자
- [ ] 가계부 나가기·영구 삭제·계정 통합 버튼이 danger 스타일
- [ ] 같은 저장 버튼 연타 시 중복 저장 없음

## 6. 핵심 기능 회귀

- [ ] 카카오 한 줄 지출·수입 입력, 최근 기록 조회·수정·취소
- [ ] WebView POST 저장, CSRF 차단
- [ ] 자산·정기지출·예산 저장과 가계부 간 격리
- [ ] 백업·복구 미리보기
- [ ] 미완성 카드 혜택·밈 직접 경로 비노출

## 7. 이상 시 복구

1. 이전 Worker 버전 V22.8.1로 롤백한다.
2. 데이터베이스 스키마는 변경하지 않았으므로 SQL 롤백은 없다.
3. 카카오 로그인 문제만 있는 경우 `KAKAO_LOGIN_ENABLED=0`으로 버튼만 즉시 비노출하고 로컬 로그인을 유지한다.
4. 문제 화면·오류 코드(K…)·계정 역할·가계부 ID·발생 시각을 기록한 뒤 재현한다.
