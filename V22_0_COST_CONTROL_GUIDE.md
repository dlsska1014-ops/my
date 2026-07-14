# V22.0 비용 통제 가이드

## 기본값
- 외부 LLM/Workers AI 호출 없음
- 성공 발화 영구 로그 샘플링 0%
- 폴백 영구 로그 비활성
- Cloudflare 기본 Workers Logs만 사용
- Kakao Event API 사용 안 함

## 선택 환경변수
```
NLU_SUCCESS_LOG_SAMPLE_RATE=0
NLU_PERSIST_FALLBACK_LOGS=0
```

초기 운영은 위 기본값을 유지하고, 실제 폴백 분석이 필요할 때만 짧은 기간 동안 샘플링을 올립니다.
