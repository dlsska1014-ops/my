# V19.6-KAKAO-COMPLIANCE 운영 적용 체크리스트

## 적용 전

1. 현재 운영 Worker 코드를 별도 파일로 백업
2. Supabase 데이터 JSON 백업 내려받기 (/backup)
3. 환경변수 확인: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `USER_SESSION_SECRET`(권장)

## 적용

4. `kakao-accountbook-cloudflare-v19.3-report-clean-final.zip` 압축 해제 (내부 경로가 정상 슬래시 구조인지 확인)
5. `src/index.js` 전체 복사
6. Cloudflare Workers 편집기에서 기존 코드 전체 삭제 후 새 코드 전체 붙여넣기
7. 저장 후 배포

## 적용 후 확인

8. `/health`에서 `"version":"V19.6-KAKAO-COMPLIANCE"`, `"mode":"kakao-compliance"` 확인
9. `/app` 홈·입력·기록 정상 표시 확인
10. `/analysis` 기본 노출(요약·핵심 인사이트·일별·요일별)과 접힘 영역(도넛·6/12개월·분류변화·반복지출·큰지출) 확인
11. `/my/analysis`가 /analysis와 같은 구조로 보이는지 확인
12. `/calendar` 기록 있는 날짜가 먼저 보이고 전체 달력(히트맵)은 접혀 있는지 확인
13. `/budgets` 이번 달 예산에 <분류 합계 자동> 배지가 보이는지, 직접 설정 시 <직접 설정> 배지와 "자동 산정으로 전환" 버튼이 보이는지, 초과 저장 시 confirm 경고가 뜨는지 확인
14. `/reserve-plans` 분류 직접입력+추천목록, 반복주기별 납부월 칸 확인
15. `/payment-methods` 자산 분석 카드 5종 확인
16. `/households` 내가 참여한 가계부만 보이는지, 참여자 카드 UI 확인
16-1. `/app` 빠른 입력에서 자주 쓰는 항목 칩·오늘/어제 칩이 동작하는지 확인
16-2. `/start-guide` 체크리스트 진행률이 실제 설정 상태와 맞는지 확인
16-3. `/reserve-plans` 이번 달 납부 예정 카드 확인
16-4. `/app` 한 줄 입력("점심 12000 국민카드")이 폼을 채우는지, 저장 시 분류가 자동 추론되는지 확인
16-5. member 계정으로 /app에서 자기 기록만 수정/삭제되는지, viewer는 입력 폼 자체가 안 보이는지 확인
16-6. /analysis 분류 랭킹·일별 그래프 클릭 → 해당 기록 목록으로 이동하는지 확인
16-7. /app 홈 "오늘 쓴 돈 / 오늘 써도 되는 돈" 카드 확인

## 보안 확인 (중요)

17. 일반 계정으로 로그인 후 주소창에서 `?household_id=`에 **다른 가계부 ID**를 넣어
    /budgets, /analysis, /calendar, /reserve-plans, /payment-methods 접근 →
    다른 가계부 데이터가 절대 보이지 않아야 함 (자기 가계부로 대체 표시되면 정상)
18. viewer 권한 계정에서 /budgets, /reserve-plans, /payment-methods에 저장/삭제 버튼이 없는지 확인
19. 참여자 표시 이름 수정 후에도 카카오 고유키가 바뀌지 않는지 확인 (마스킹된 사용자키 동일)

## 문제 발생 시

20. 백업해 둔 이전 Worker 코드로 즉시 롤백
21. `/health`로 롤백 버전 확인 후 원인 분석
