# V22.3 검증 보고서

## 버전
`V22.3-NLU-OPS-LEARNING-ROLLOUT-BUNDLE`

## 자동 검증
- `node --check src/index.js`: 통과
- `node smoke_v223.mjs`: 통과
- `node static_v223.mjs`: 통과
- `node smoke_v223_full.mjs`: 통과
- V22.2 분석 스튜디오 회귀 `smoke_v222.mjs`: 통과
- V22.2 전체 기능 회귀 `smoke_v222_full.mjs`: 통과
- V22.1 전체 기능 회귀 `smoke_v221_full.mjs`: 통과
- NLU 합성·혼동 평가: 4,738 / 4,738 통과
- Supabase 요청당 450ms 지연 시험: 자연어·그룹멘션·`/기록` 약 3.9초 통과
- 선택 RPC 호출·실패 샘플 비식별 테스트: 통과
- `/nlu-ops` 관리자 인증과 JSON 비인증 차단: 통과

## 개인정보 검증
- 전화번호 마스킹: 통과
- 이메일 마스킹: 통과
- URL·초대코드·긴 숫자 마스킹 코드 포함
- 실패 샘플에 사용자 키·가계부 ID 컬럼 없음
- 영구 로그 기본 비활성

## 기존 구조 보존
- `KAKAO_OPENBUILDER_UTTERANCES.md` SHA-256 동일: 예
- `schema_v22_1_nlu_metrics_optional.sql` SHA-256 동일: 예

## 주의사항
- 메모리 집계는 Worker 인스턴스 재시작 시 초기화됩니다.
- 선택 영구 집계를 켜면 `/skill` 요청당 추가 RPC가 발생합니다. 초기에는 집계만 제한 운영하고 실제 30만 사용자 단계에서는 Queues·Analytics Engine·배치 집계로 전환 검토가 필요합니다.
- 4,738건 평가는 합성·수동 혼동 데이터이며 실제 운영 정확도를 의미하지 않습니다.
