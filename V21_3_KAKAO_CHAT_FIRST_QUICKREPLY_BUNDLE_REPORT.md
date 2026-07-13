# V21.3 KAKAO CHAT FIRST QUICKREPLY BUNDLE REPORT

## Version
- `V21.3-KAKAO-CHAT-FIRST-QUICKREPLY-BUNDLE`
- mode: `kakao-chat-first-quickreply-bundle`
- public domain: `https://ttokttok-accountbook.com`

## Purpose
카카오 오픈챗봇/그룹챗봇을 처음 쓰는 사용자 기준으로, 웹 이동보다 카카오톡 안에서 먼저 처리되는 명령어 체계와 바로연결(quickReplies)을 보강했다.

## Applied changes
- `/skill` 응답에 `quickReplies` 바로연결 후보를 기본 포함.
- 저장/수정/삭제/예산/초대/가계부/밈/도움말 상황별 빠른 메뉴 후보를 자동 구성.
- `/`, `/메뉴`, `메뉴`, `전체메뉴`, `명령어` 입력 시 카톡 안에서 직관적 명령어 목록을 응답.
- `/요약`, `/오늘예산` 같은 슬래시형 명령어도 인식되도록 보정.
- 오픈빌더 스킬 테스트 창에 실수로 일반 문장만 넣어도 테스트 발화로 처리하도록 방어.
- `새가계부 만들기 여행비` 명령으로 채팅에서 새 가계부를 생성하고 초대코드를 안내.
- `가계부전환` 명령으로 사용자의 참여 가계부 목록과 초대코드를 카톡 메시지로 안내.
- `/kakao-command-system`, `/chat-command-guide`, `/quickreply-guide` 안내 경로 추가.
- `/kakao-command-menu.json` 카탈로그 JSON 추가.

## Unchanged
- `/my`, `/app`, `/skill` POST 저장 핵심 흐름 유지
- 권한/가계부 범위 유지
- 빠른입력 분류 보정 유지
- 여러 가계부 생성/참여 기존 웹 흐름 유지
- 중복 저장 방어 유지
- 예산 알림 유지
- 밈 콘텐츠센터 유지
- 하단 사업자 푸터 유지
- Supabase 테이블 구조 변경 없음

## Verification
- `node --check src/index.js`: PASS
- ES module import/smoke: PASS
- `/health`: PASS
- `/skill` GET: PASS
- `/skill` POST menu payload: PASS
- `/skill` POST raw text test fallback + quickReplies: PASS
- `/kakao-command-system`: PASS
- `/kakao-command-menu.json`: PASS
- ZIP integrity: PASS
