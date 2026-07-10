# 최종 적용 체크리스트 — V21.2

## 배포 파일

- `kakao-accountbook-cloudflare-v21.2-domain-mobile-calendar-skill-hotfix.zip`
- 내부 버전: `V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX`

## Cloudflare 환경변수

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
SERVICE_BASE_URL=https://ttokttok-accountbook.com
APP_BASE_URL=https://ttokttok-accountbook.com
CANONICAL_BASE_URL=https://ttokttok-accountbook.com
CANONICAL_REDIRECT=0
```

## 확인 순서

- [ ] `/health`에서 `V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX` 확인
- [ ] `/my` 카카오 로그인 정상 확인
- [ ] `/skill` 브라우저 접속 시 안내 화면 확인
- [ ] OpenBuilder Skill URL을 `https://ttokttok-accountbook.com/skill`로 설정
- [ ] `/start-guide` → 캘린더 클릭 시 `/my/calendar` 화면으로 이동
- [ ] `/menu` → 캘린더/분석/백업이 사용자용 화면으로 이동
- [ ] `/privacy`, `/terms` 정상 확인
- [ ] `/personal-url-audit`에서 개인 계정명 노출 없음 확인

## 주의

현재 운영 서버 `/health`가 `V20.8`로 보이면 최신 ZIP이 아직 배포되지 않은 상태입니다. 이 ZIP을 배포한 뒤 다시 확인하세요.


## V21.3-KAKAO-CHAT-FIRST-QUICKREPLY-BUNDLE
- 카카오톡 안에서 먼저 처리하는 명령어 체계와 quickReplies 바로연결을 보강했습니다.
- `/kakao-command-system`, `/kakao-command-menu.json`을 추가했습니다.
- `/skill` 응답은 기본적으로 `version: "2.0"`, `template.outputs`, `template.quickReplies`를 포함합니다.
- 오픈빌더 스킬 테스트에서 일반 문장 입력도 방어적으로 처리합니다.
