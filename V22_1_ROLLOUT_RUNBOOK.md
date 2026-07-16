# V22.1 적용 순서

1. 기존 Worker 버전과 OpenBuilder 설정을 캡처합니다.
2. `src/index.js`를 배포합니다.
3. `/health`에서 `V22.1-NLU-CLARIFICATION-EVAL-OPS-BUNDLE`을 확인합니다.
4. `/nlu-intents.json`에서 21개 Registry 의도를 확인합니다.
5. 아래 문장을 실제 그룹방에서 시험합니다.
   - 닉넴 바꿔줘
   - 이름 변경
   - 초대
   - 예산
   - 식비 50만원
   - 이번 달 얼마 썼어
6. `node nlu_eval_v221.mjs`와 기존 smoke/latency 시험을 실행합니다.
7. OpenBuilder는 변경하지 않습니다.
8. 선택 로그 테이블은 운영 지표가 필요할 때만 적용합니다.

## 롤백 기준
- 핵심 거래 저장 실패
- p99가 카카오 제한에 접근
- 금전 문장 오실행
- 폴백률 급증
