# V22.8.2 인증·제출 안정화 보고서

- 버전: `V22.8.2-AUTH-UIUX-STABILIZATION`
- 기준: V22.8.1 GUIDED UI·UX FULL OVERHAUL
- 성격: **새 기능 없는 안정화 전용 버전** (`V22_8_2_STABILITY_AUDIT_AND_PLAN.md`의 P0 전체 + 인접 P1 해소)
- 데이터베이스 스키마 변경: 없음

## 1. 카카오 로그인 KOE006 구조적 원인 제거 (P0)

### 변경 전 문제

- `KAKAO_REDIRECT_URI` 미설정 시 사용자가 접속한 호스트(`url.origin`)로 callback을 자동 생성해, 접속 주소(운영 도메인/workers.dev/www/미리보기)에 따라 Redirect URI가 바뀌었고 카카오 앱 등록값과 불일치하면 KOE006이 발생했습니다.
- 로그인 버튼 노출 조건이 REST 키 존재뿐이라 잘못된 설정에서도 버튼이 노출됐습니다.

### 변경 내용

- `getKakaoRedirectUri`: 접속 호스트 기반 자동 생성 금지. 명시값이 없으면 `PUBLIC_BASE_URL` 기준 canonical 주소만 사용.
- `kakaoLoginConfigProblems`: REST 키, `KAKAO_REDIRECT_URI` 명시값, https, `/auth/kakao/callback` 경로를 전부 검사.
- `kakaoLoginAvailable`: 구성 문제가 하나라도 있으면 로그인 버튼 비노출(fail-closed). 활성 상태에서 구성이 깨지면 `kakao_login_config_blocked` 운영 이벤트 기록.
- `/auth/kakao/start`: Redirect URI 호스트와 다른 호스트에서 시작한 로그인은 인가 요청 전에 canonical 호스트로 303 이동 → state 쿠키와 callback 호스트가 항상 일치.
- 로그에는 호스트·경로·실패 단계·추적 코드만 기록하고 키·코드·토큰은 기록하지 않습니다.

## 2. 콜백 오류 세분화와 state 쿠키 정리 (P1)

- callback 오류를 단계별로 구분: 사용자 취소(`access_denied`) / 카카오 제공자 오류 / state 불일치·만료 / 구성 오류 / 토큰 교환 실패 / 프로필 조회 실패 / 계정 저장 실패.
- 각 단계마다 다른 한국어 안내와 재시도·로컬 로그인 경로를 제공하고, 오류 화면에 운영 추적 코드(`K…` 8자리)를 표시합니다.
- 성공·실패·취소 **모든** 종료 경로에서 `kakao_oauth_state`, `kakao_oauth_link_user` 쿠키를 즉시 만료합니다.
- 클라이언트 시크릿: 카카오 앱에서 ON이면 `KAKAO_CLIENT_SECRET` 필수라는 사실을 `/kakao-login-check`와 배포 게이트에 명시(외부 등록 상태는 로컬에서 검증 불가함을 함께 안내).

## 3. 제출 잠금·파괴 동작 안정화 (P0)

- 전역 submit 잠금이 `event.defaultPrevented`를 확인합니다. `confirm()` 취소, 페이지 스크립트의 `preventDefault`, 브라우저 검증 실패 시 더 이상 "저장 중…"으로 잠기지 않습니다.
- 중복 제출은 `preventDefault`로 차단하고, 버튼 비활성화는 제출 데이터 구성 후로 지연해 named submit 값 유실을 방지합니다.
- `pageshow`(뒤로가기/bfcache 복귀) 시 잠긴 폼과 버튼 라벨을 복구합니다.
- danger 클래스 누락으로 전역 파란 버튼 스타일(`!important`)에 덮이던 파괴 버튼을 수정:
  - 정기지출(준비 플랜) 삭제 — danger + 확인 대화상자 추가
  - 가계부에서 나가기 / 가계부 영구 삭제
  - 소비 카드(밈) 삭제
  - 계정 통합 실행
  - 월 전체 예산 삭제(자동 전환)는 secondary로 명시
- 실제 Chromium(390×844)에서 검증: 검증 실패·confirm 취소 시 잠금 없음, 정상 제출 시 1회 잠금, danger 버튼이 붉은 스타일로 렌더링(computed style 확인).

## 4. 점검·운영 화면 정직화 (P0/P1)

- `/kakao-login-check`: 명시 Redirect URI, HTTPS·경로 형식, 허용 호스트 일치, 클라이언트 시크릿, 사용 가능 상태를 fail-closed로 표시. "로컬 구성 검증"과 "카카오 앱 등록값 대조(문자 단위)"를 구분해 KOE006 오탐을 방지.
- `/ops-audit`: 카카오 로그인 활성 시 `KAKAO_REST_API_KEY`·`KAKAO_REDIRECT_URI`를 필수로 판정(비활성일 때만 선택). "카카오 로그인 구성" 체크 행 추가, 전체 `ok` 판정에 반영.
- `/kakao-login-recovery`: 미정의 변수(`origin`) 참조로 항상 500이 나던 서버 오류 수정(회귀 시험 추가).

## 5. 저장 핸들러 방어 (P1)

- `hasBackupLoginIdentity` 전체를 try/catch로 감싸 DB 지연·오류 시에도 예외가 상위 저장 핸들러를 중단시키지 않고 안전한 기본 경로로 진행합니다(운영 이벤트 기록).

## 6. 시험 체계

- 신규 `smoke_v2282_stabilization.mjs` (54건):
  - OAuth 인가 URL 계약: client_id, 명시 redirect_uri, response_type, state 고유성·길이
  - fail-closed: Redirect URI 미설정 시 버튼 비노출·인가 요청 차단
  - 잘못된 호스트 시작 → canonical 호스트 이동(쿼리 보존, stale 호스트에 state 쿠키 미발급)
  - callback: 취소/state 불일치/토큰 실패/프로필 실패 각각의 안내문·상태코드·쿠키 만료
  - **로그인 카나리**: 모의 kauth/kapi로 인가→토큰→프로필→세션 쿠키→가계부 생성 유도까지 전체 왕복 성공 + state 쿠키 만료 확인
  - `/kakao-login-check` fail-closed 표기, `/kakao-login-recovery` 200 회귀
  - submit 잠금(defaultPrevented·pageshow)·danger 버튼 렌더링·`url.origin` callback 파생 금지 정적 검사
- canonical 명령: `./validate_v2282.sh` — 신규 시험 + 기존 13개 스위트 + NLU 4,738건을 한 번에 실행.
- 버전 문자열을 검사하던 기존 6개 시험 파일을 V22.8.2 기준으로 갱신.

## 7. 검증 결과

`./validate_v2282.sh` 전체 통과 (`VALIDATION_REPORT_V22_8_2.md` 참조). 실제 Chromium 제출 잠금·danger 스타일 QA 11건 통과.

## 8. 이번 버전에서 다루지 않은 항목 (후속)

감사 문서의 P1 중 대규모 리팩터링이 필요한 항목은 회귀 위험을 피하기 위해 이번 안정화에서 제외하고 후속 버전으로 미룹니다.

- `normalizeUserFacingUi` 문자열/DOM 후처리의 원본 렌더러 흡수
- 메뉴 정의 단일 route manifest 통합, 경로 canonicalize
- 온보딩 목표 단일화·진행률 이벤트 분리
- 모바일 표의 반응형 카드 전환, 단일 파일 모듈 분리
- SheetJS 자체 호스팅, 스테이징 카카오 앱 실계정 카나리(운영 절차)
