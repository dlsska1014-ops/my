# V21.1-GROUP-CHATBOT-LAUNCH-SCALE-BUNDLE 보고서

## 목적

그룹 챗봇 승인 이후 신규 챗봇을 새로 제작할 수 있도록 카카오 관리자센터 기준의 블록·발화·주소·트래픽 운영 가이드를 추가했다. 공개 URL은 `PUBLIC_BASE_URL` 기준으로 고정하고, 개인 계정명/개인 주소가 카카오 심사 화면에 섞이지 않도록 점검 경로를 추가했다.

## 추가 경로

- `/group-chatbot-launch`
- `/new-group-chatbot-setup`
- `/kakao-group-chatbot-start`
- `/openbuilder-start-blocks`
- `/group-chatbot-scale`
- `/traffic-scale-readiness`
- `/kakao-traffic-scale`
- `/launch-traffic-check`
- `/personal-url-audit`
- `/public-url-audit`
- `/private-address-check`
- `/personal-handle-clean-check`
- `/kakao-new-bot-config.json`

## 트래픽 수정

- `/skill`은 IP 단위 traffic guard에서 제외했다.
- 카카오 서버 IP/UA에 많은 사용자가 몰릴 수 있으므로 `/skill`은 `botUserKey` 기반 `SKILL_RATE_LIMIT`로 제한한다.
- 기본 `SKILL_RATE_LIMIT`는 60회/분, `TRAFFIC_GUARD_LIMIT`는 240회/분으로 상향했다.
- 기존 중복 저장 방어, 카카오 재전송 방어, 반복 발화 방어는 유지했다.

## 유지한 것

- `/my`, `/app`, `/skill` 핵심 저장 로직
- 권한/가계부 범위 체크
- 빠른입력 분류 보정
- 여러 가계부 생성/참여
- 예산 알림
- 밈 콘텐츠센터
- 하단 사업자 푸터
- Supabase 테이블 구조

## 검증

- `node --check src/index.js`: PASS
- ES module import/smoke: PASS
- `/health`: PASS
- `/group-chatbot-launch`: PASS
- `/group-chatbot-scale`: PASS
- `/personal-url-audit`: PASS
- `/kakao-new-bot-config.json`: PASS
- `/operation-center`: PASS
- 개인 계정명 문자열 정적 검사: PASS
- ZIP 무결성 검사: PASS
