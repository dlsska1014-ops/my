# V20.2 Traffic Duplicate Safety Bundle

## Version
V20.2-TRAFFIC-DUPLICATE-SAFETY-BUNDLE

## Scope
V20.1 운영센터 번들 위에 중복 저장 방지, 대량 입력 제한, 카카오 반복 발화 방어, 저장소 지연 안내를 묶어 추가했습니다.

## Added
- `/ops-duplicates`, `/duplicate-safety`: 중복 저장·대량 입력 안전센터
- 쓰기성 직접 저장 createManualTransaction 1차 중복 방어
- 카카오 재전송/반복 발화 메모리 가드
- CSV 가져오기 1회 처리 제한 `MY_IMPORT_LIMIT`
- 카카오 다중 입력 1회 처리 제한 `KAKAO_BULK_LIMIT`
- `/ops-snapshot.json` duplicates 섹션 추가
- DB/Supabase 지연 시 사용자용 `db_delay` 안내

## Environment knobs
- `DUPLICATE_GUARD_SECONDS` 기본 90
- `KAKAO_RETRY_DEDUP_SECONDS` 기본 120
- `KAKAO_REPEAT_GUARD_SECONDS` 기본 8
- `MY_IMPORT_LIMIT` 기본 120
- `KAKAO_BULK_LIMIT` 기본 25
- `DUPLICATE_GUARD_DISABLED=1`이면 직접 저장 중복 방어 비활성화

## Not changed
- `/my`, `/app`, `/skill` 핵심 저장·권한 구조
- 여러 가계부 생성/참여
- 예산 알림
- 하단 사업자 푸터
- Supabase 테이블 구조

## Verification
- node --check src/index.js PASS
- ES module import PASS
- /health, /ops-duplicates, /ops-snapshot.json smoke test PASS
- ZIP integrity PASS
