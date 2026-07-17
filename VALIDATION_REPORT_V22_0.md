# V22.0 검증 보고서

- `node --check src/index.js`: 통과
- ES module import: 통과
- `smoke_v220.mjs`: 통과
- `smoke_v220_full.mjs`: V21.5.2 전체 회귀 + V22.0 롱테일 자연어 통과
- `latency_v2151_450.mjs`: 자연어·그룹멘션·/기록 모두 약 3.9초, HTTP 200
- 닉네임 변경/닉넴 바꿔줘/나를 인남이라고 불러줘: 통과
- 가계부 이름 변경을 사용자 닉네임 변경으로 오인하지 않음: 통과
- 예산 확인하고 싶어/초대 코드 좀 보여줘: 통과
- OpenBuilder 시나리오명·블록명·스킬 URL 변경 없음
- Supabase 스키마 변경 없음
- 외부 LLM/Workers AI 호출 없음
