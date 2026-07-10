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

## V21.3-HOME-CALENDAR-MERGE
- `/my/calendar` 별도 캘린더 페이지를 없애고 홈 화면 `/app` 안으로 통합했습니다.
- 캘린더 접근 경로: `https://ttokttok-accountbook.com/app?view=calendar` (구주소 `/my/calendar`는 자동 이동)
- 홈 통계 카드 아래 "📅 캘린더" 버튼으로 캘린더를 열고, 날짜를 누르면 같은 페이지 피드에 그날 기록만 표시됩니다.
- 날짜 선택 상태에서는 빠른입력 날짜가 그 날짜로 프리셋됩니다.
- 이전달/다음달 이동 시 캘린더 뷰(`view=calendar`)가 유지됩니다.
- 시작가이드/전체메뉴/분석 화면의 캘린더 링크를 모두 홈 캘린더로 교체했습니다.
- 미사용 죽은 코드(`renderMyDashboardHtml`, `handleMyCalendarPage`, `renderMyCalendarHtml`)를 정리했습니다.
- `/skill` 저장, 권한 체크, 예산 알림, 밈 콘텐츠센터는 변경하지 않았습니다.

## V21.4-KAKAO-COMMANDS
- 카카오 그룹 챗봇 대표 명령어(드롭다운) 도입을 지원합니다. (관리자센터 등록표는 `KAKAO_OPENBUILDER_UTTERANCES.md` 참고)
- `/skill` 파서에 선행 명령어 스트리핑을 추가했습니다: `기록 점심 12000원 국민카드` → `점심 12000원 국민카드`, `수정 01번 금액 13000원` → `01번 금액 13000원`.
- `기록`/`수정` 단독 입력은 스트리핑하지 않고 각각 입력 예시 안내/수정가이드로 응답합니다. (`기록` 단독은 기존 최근 조회에서 입력 안내로 역할 변경)
- `오늘 기록`은 조회 그대로 유지됩니다.
- 반복 발화 방어(dedup) 키가 스트리핑 후 텍스트 기준으로 생성되어, 접두어 유무가 달라도 같은 내용 연속 전송을 막습니다.
- 도움말에 `"/" 를 입력하면 명령어 목록이 열립니다.` 한 줄을 추가했습니다.
- simpleText 중심 응답, 멱등/재전송 방어, 레이트리밋은 그대로입니다.
