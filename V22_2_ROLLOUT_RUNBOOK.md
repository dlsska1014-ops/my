# V22.2 배포 순서

1. 현재 Worker 배포 스냅샷을 보관합니다.
2. V22.2 `src/index.js`를 배포합니다.
3. `/health`에서 `V22.2-NLU-ANALYSIS-STUDIO-UIUX-BUNDLE`을 확인합니다.
4. `/my/analysis`에서 분석 스튜디오를 확인합니다.
5. `/my/analysis?view=report`에서 기존 종합 리포트를 확인합니다.
6. 모바일에서 기간칩·상세필터·검색·도넛 범례·더 보기·CSV를 확인합니다.
7. 카카오 단톡방에서 자연어 거래·닉네임 변경·초대코드·예산·요약 회귀 테스트를 합니다.
8. OpenBuilder와 Supabase 스키마는 변경하지 않습니다.
9. 오류 시 이전 V22.1 Worker로 롤백합니다.
