# V22.3 점진 배포 런북

## 1. 기본 배포
1. Worker `src/index.js` 배포
2. `/health`에서 `V22.3-NLU-OPS-LEARNING-ROLLOUT-BUNDLE` 확인
3. `/nlu-ops` 관리자 접속 확인
4. 자연어 거래·닉네임·초대코드·예산·요약 회귀시험

이 단계에서는 별도 SQL과 환경변수를 적용하지 않아도 된다.

## 2. 저비용 집계 활성화
`schema_v22_3_nlu_ops_optional.sql` 적용 후:

```
NLU_METRICS_ENABLED=1
NLU_PERSIST_FAILURE_SAMPLES=0
NLU_STORE_REDACTED_TEXT=0
```

시간대별 의도·결과·응답시간 합계만 저장한다.

## 3. 실패 표현 학습 활성화
개인정보 검토 후 제한 기간 동안만:

```
NLU_PERSIST_FAILURE_SAMPLES=1
NLU_STORE_REDACTED_TEXT=1
NLU_FAILURE_SAMPLE_RATE=0.25
NLU_FAILURE_RETENTION_DAYS=14
```

초기에는 25% 샘플링을 권장한다. 사용자 키는 저장하지 않는다.

## 4. 개선 루프
반복 실패 샘플 확인 → 의도/오타/모호성 분류 → Intent Registry 보강 → 평가 데이터 추가 → 전체 회귀 → 개발방 → 내부 그룹방 → 운영 배포.

## 운영 게이트
- 핵심 저장 성공률 99.9% 이상
- 폴백률 3% 이하 목표
- 오류율 0.1% 이하 목표
- p95 3초 이하, p99 4.5초 이하 목표
- 금전 오실행 0건
