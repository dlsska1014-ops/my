# 똑똑한가계부 Cloudflare Bundle — V21.5.2

현재 버전:

```text
V21.5.2-NATURAL-INTENT-SMART-CTA-HOTFIX
```

공개 도메인:

```text
https://ttokttok-accountbook.com
```

Kakao OpenBuilder Skill URL:

```text
https://ttokttok-accountbook.com/skill
```

## V21.5.2 추가 개선

- `닉네임수정`, `닉네임 변경`, `별명 설정`, `표시명 변경` 인식
- `닉네임 인남으로 변경` 한 문장 처리
- `초대코드`, `구성원 초대`, `초대 방법` 응답에 참여자·초대 관리 URL 1개 제공
- 예산 변경·가계부 전환·단톡방 연결·정산·날짜별 지출 질문 동의어 보강
- 미인식 안내를 의도별 예시로 개선
- OpenBuilder 블록·발화·스킬 URL 변경 없음

## 이번 버전 핵심

- 처음 사용자를 위한 단계형 시작 흐름
- 카카오톡에서 새 가계부 생성 및 초대코드 참여
- 가계부 종류 선택과 이름 입력
- 전체 월 예산·카테고리별 예산 설정
- `식비 예산설정 백만원` 같은 자연어 직접 설정
- 현재 사용액·잔여액·카테고리별 사용률 조회
- 카카오 사용자와 가계부 표시명 매핑
- 날짜별 수입·지출·카테고리·결제자 요약
- 일반 거래 응답의 반복 링크와 quickReplies 제거
- 가치가 분명한 전환 지점에서만 홈페이지 CTA 제공
- 대화 단계는 Supabase `accountbook_settings`에 30분 동안 저장

## 지원 예시

```text
시작
새 가계부 만들기
초대코드로 참여
예산 설정
식비 예산설정 100만원
남은예산
내 이름 설정
점심 12000원 국민카드
오늘 요약
어제 요약
이번 주 요약
단톡방 연결 ABC123
```

## 유지한 구조

- `/my`, `/app`, `/skill` 기존 핵심 저장 흐름
- 가계부 권한과 범위 제한
- 중복 저장 방어와 사용자 단위 레이트리밋
- 기존 Supabase 테이블 구조
- 공개 도메인 및 카카오 로그인

별도 테이블 마이그레이션은 없습니다. 단계 상태와 CTA 억제 정보는 기존 `accountbook_settings`를 사용합니다.

## 중요 문서

- `KAKAO_OPENBUILDER_UTTERANCES.md`: 봇 입장·도움말·폴백·대표 명령 설정
- `OPENCHATBOT_CHAT_FIRST_SETUP.md`: 채팅 우선 UX 원칙
- `V21_5_GUIDED_ONBOARDING_BUDGET_BUNDLE_REPORT.md`: 구현 범위와 검증 결과
- `FINAL_APPLY_CHECKLIST.md`: 배포·OpenBuilder 적용 체크리스트

## 로컬 검증

```text
node --check src/index.js
node smoke_v2152.mjs
```

## 배포 후 확인

1. `/health`에서 `V21.5-GUIDED-ONBOARDING-BUDGET-BUNDLE` 확인
2. OpenBuilder Skill URL과 폴백 블록 연결 확인
3. 신규 사용자 `/시작`부터 첫 기록까지 실제 그룹방 테스트
4. 일반 기록 응답에 링크와 quickReplies가 없는지 확인
5. 홈페이지 CTA가 동일 사용자·가계부·종류 기준으로 24시간 내 반복되지 않는지 확인
