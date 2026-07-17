# V21.5 검증 보고서

검증 버전:

```text
V21.5-GUIDED-ONBOARDING-BUDGET-BUNDLE
```

## 실행 결과

- `node --check src/index.js`: 통과
- ES module import 및 Worker `fetch` export 확인: 통과
- `node smoke_v215.mjs`: 통과
- Smoke 세부 PASS 항목: 55개
- 개인 계정명 문자열 정적 검사: 미검출
- 사용자 응답 핵심 경로의 문자 `\n` 노출 검사: 통과

## Smoke 범위

- 신규 사용자 시작 및 단계형 바로연결
- 가계부 종류·이름 입력과 생성
- 소유자 멤버십 및 초대코드
- 단계형 카테고리 예산 설정
- 자연어 예산 설정: `교통비 예산설정 백만원`
- `남은예산`, `내 예산` 조회
- 일반 예산 조회 quickReplies 미첨부
- 내 이름 설정과 결제자 표시
- 일반 거래 저장 URL·quickReplies 미첨부
- 오늘 요약의 카테고리·결제자 집계
- 상세 분석 CTA 24시간 반복 억제
- `/정산` 전용 응답
- 도움말 링크 억제
- 단톡방 연결 안내 실제 줄바꿈
- 미인식 안내 URL·quickReplies 미첨부

## 소스 확인값

`src/index.js` SHA-256:

```text
82b5dbd5261d335ee25d66cafa3ada4a6f71d14d21f31f982f3e32141b73015e
```

## 참고

실제 Cloudflare·Supabase·Kakao OpenBuilder 운영 환경 배포는 이 로컬 검증과 별도입니다. 배포 후 `FINAL_APPLY_CHECKLIST.md` 순서로 개발 채널과 실제 그룹방 검증이 필요합니다.
