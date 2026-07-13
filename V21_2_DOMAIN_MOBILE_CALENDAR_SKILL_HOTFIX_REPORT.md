# V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX 보고서

## 배경

공개 도메인 `https://ttokttok-accountbook.com`에서 카카오 로그인이 정상 동작했지만, 운영 서버 `/health`는 아직 `V20.8`로 표시되어 최신 번들이 배포되지 않은 상태였습니다. 또한 시작가이드/메뉴에서 캘린더를 누르면 사용자 모바일 화면이 아니라 PC용 웹 화면으로 이동하는 문제가 확인되었습니다.

## 반영 내용

1. 실제 공개 도메인 기본값을 `https://ttokttok-accountbook.com`으로 고정했습니다.
2. `/skill` GET 요청에 카카오 스킬 연결 안내 화면을 추가했습니다.
3. `/calendar`와 `/analysis`는 로그인 사용자일 경우 각각 `/my/calendar`, `/my/analysis`로 이동하도록 보정했습니다.
4. 통합 내비게이션과 전체 메뉴의 사용자용 분석/캘린더/백업 링크를 `/my/...` 기준으로 정리했습니다.
5. 기존 그룹 챗봇 런칭/대량 트래픽/개인 주소 점검 구조는 유지했습니다.

## 변경하지 않은 것

- `/my`, `/app`, `/skill` POST 저장 로직
- 가계부 권한/범위 체크
- 빠른입력 분류 보정
- 여러 가계부 생성/참여
- 중복 저장 방어
- 예산 알림
- 밈 콘텐츠센터
- Supabase 테이블 구조

## 검증

- `node --check src/index.js`: PASS
- ES module import/smoke: PASS
- `/health`: PASS
- `/skill` GET: PASS
- `/start-guide`: PASS
- ZIP 무결성: PASS
