# Local Runtime Test Report — V21.2

## Version

```json
{
  "version": "V21.2-DOMAIN-MOBILE-CALENDAR-SKILL-HOTFIX",
  "mode": "domain-mobile-calendar-skill-hotfix"
}
```

## Tests

- `node --check src/index.js`: PASS
- ES module import/smoke: PASS
- `/health`: PASS
- `/skill` GET 안내 화면: PASS
- `/start-guide`: PASS
- `/menu` 비로그인 redirect: PASS
- ZIP integrity: PASS

## Fix scope

- 도메인 기본값을 `https://ttokttok-accountbook.com` 기준으로 고정
- 사용자 캘린더/분석 이동을 `/my/calendar`, `/my/analysis`로 통일
- `/skill` 브라우저 접속 시 not_found 대신 연결 안내 제공


## V21.3-KAKAO-CHAT-FIRST-QUICKREPLY-BUNDLE
- 카카오톡 안에서 먼저 처리하는 명령어 체계와 quickReplies 바로연결을 보강했습니다.
- `/kakao-command-system`, `/kakao-command-menu.json`을 추가했습니다.
- `/skill` 응답은 기본적으로 `version: "2.0"`, `template.outputs`, `template.quickReplies`를 포함합니다.
- 오픈빌더 스킬 테스트에서 일반 문장 입력도 방어적으로 처리합니다.
