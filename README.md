# kakao-accountbook-cloudflare-v21.3.1-kakao-skill-test-hotfix

카카오 스킬 테스트 400 응답을 줄이기 위한 V21.3.1 핫픽스입니다. 기준 도메인은 `https://ttokttok-accountbook.com`입니다.

# 똑똑한가계부 Cloudflare Bundle

현재 기준 버전: `V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX`

## 공개 도메인

- 대표 주소: `https://ttokttok-accountbook.com`
- 사용자 첫 화면: `https://ttokttok-accountbook.com/my`
- Kakao OpenBuilder Skill URL: `https://ttokttok-accountbook.com/skill`
- 개인정보 안내: `https://ttokttok-accountbook.com/privacy`
- 이용약관: `https://ttokttok-accountbook.com/terms`

## 이번 핫픽스

- 실제 도메인 `https://ttokttok-accountbook.com`을 기본 공개 주소로 고정했습니다.
- 브라우저에서 `/skill`을 열었을 때 `not_found` 대신 카카오 스킬 연결 안내 화면이 보이도록 했습니다. 실제 카카오 호출은 기존처럼 `POST /skill`을 사용합니다.
- 로그인 사용자가 시작가이드/전체메뉴/통합 내비게이션에서 `캘린더`를 눌렀을 때 PC용 `/calendar`가 아니라 모바일 사용자 화면 `/my/calendar`로 이동하도록 정리했습니다.
- 로그인 사용자가 `/calendar`, `/analysis`로 직접 접근해도 각각 `/my/calendar`, `/my/analysis`로 돌려보내도록 안전 리다이렉트를 추가했습니다.
- V21.1 그룹 챗봇/대량 트래픽/개인 주소 점검 구조는 유지했습니다.

## 배포 후 확인

1. `/health`에서 `V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX` 확인
2. `/skill`을 브라우저에서 열면 안내 화면 확인
3. `/start-guide`에서 캘린더 클릭 시 `/my/calendar` 이동 확인
4. `/menu`에서 분석/캘린더/백업이 사용자용 `/my/...`로 이동하는지 확인
5. OpenBuilder Skill URL은 `https://ttokttok-accountbook.com/skill`로 사용


## V21.3-KAKAO-CHAT-FIRST-QUICKREPLY-BUNDLE
- 카카오톡 안에서 먼저 처리하는 명령어 체계와 quickReplies 바로연결을 보강했습니다.
- `/kakao-command-system`, `/kakao-command-menu.json`을 추가했습니다.
- `/skill` 응답은 기본적으로 `version: "2.0"`, `template.outputs`, `template.quickReplies`를 포함합니다.
- 오픈빌더 스킬 테스트에서 일반 문장 입력도 방어적으로 처리합니다.
