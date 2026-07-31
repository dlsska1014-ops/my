# V22.8.58 챌린지·최근 기록 UI/UX 적용 안내

버전: `V22.8.58-CHALLENGE-ACTIVITY-UX`

## 적용 파일

- `src/index.js` 전체 교체
- 신규 SQL 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder 변경 없음

## 적용 순서

1. 현재 운영 Worker 전체 소스를 별도 파일로 백업합니다.
2. 이 패키지의 `src/index.js` 전체를 복사해 운영 소스와 교체합니다.
3. 저장 후 배포합니다.
4. 저장소 루트에서 아래 명령으로 공개 상태를 확인합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\10_VERIFY_AFTER_DEPLOY_V22_8_58.ps1
```

5. 로그인 홈을 새로고침한 뒤 `RELEASE-CHECKLIST.md`의 V22.8.58 수동 항목을 확인합니다.

## 이번 변경

- 7일 이하 챌린지: 요일·날짜별 성공·지출·오늘·예정 칸
- 8일 이상 챌린지: 달성률 퍼센트 자동 전환
- 홈·사이드바 챌린지의 동일 계산과 사이드바 카드 위계 보정
- 우측 최근 기록의 분류별 SVG 아이콘, 날짜별 건수·합계, 실제 분류 배지
- 키보드 포커스·접근성 이름·색상 외 상태 표시
- 홈 초기 HTML 35KiB 이하 유지
- `v22858` immutable 셸·V5 자산

우측 기록은 1320px 이상에서만 표시됩니다. 오늘은 아직 끝나지 않은 날이므로 다음 날부터 완료 무지출일로 계산합니다.
