# V22.0 NLU Foundation Low-Cost Bundle

## 목표
- 30만 사용자 규모를 고려한 중앙 Intent Registry 기반 자연어 처리
- 외부 LLM/Workers AI를 실시간 요청 경로에서 사용하지 않는 저비용 구조
- OpenBuilder 시나리오명·블록명·스킬 URL·Supabase 스키마 변경 없음

## 적용
- 한국어 띄어쓰기·축약·오타·말투 정규화
- 닉네임/초대/예산/가계부 전환/단톡방/정산/요약/기록/도움말/웹링크 의도 Registry
- 닉네임 변경, 닉넴 바꿔줘, 나를 인남이라고 불러 등 롱테일 지원
- 의미 기반 폴백과 제한적 quickReplies
- 응답 헤더에 버전·의도·요청 ID·지연시간 추가
- /nlu-intents.json 운영 점검 경로 추가
- 외부 AI 호출 0, 성공 요청 영구 로그 기본 0%

## 비용 안전장치
- NLU_SUCCESS_LOG_SAMPLE_RATE 기본 0
- NLU_PERSIST_FALLBACK_LOGS 기본 0
- 원문 발화 영구 저장 기본 비활성
- Event API 미사용
- 별도 Supabase Log Drain 미사용
