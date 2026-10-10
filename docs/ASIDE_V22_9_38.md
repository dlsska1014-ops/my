# V22.9.38 운영 적용 안내

저장소 준비본이며 운영 배포를 실행하지 않았습니다. PR #68의 main 병합과 CI 성공은 이미 확인했으며, 이번 리포트·입력 도구 변경은 새 PR과 CI 검토 대상입니다.

1. `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`, `node monitoring/test-d1.mjs`를 확인합니다.
2. `tools/deploy-worker-version.mjs`의 기존 절차로 앱 소스를 업로드하고 바인딩·런타임·소스·내보내기를 대조합니다. 운영 승격은 사용자의 별도 승인 뒤 수행합니다.
3. SQL·Secrets·환경변수·Kakao Developers·OpenBuilder 변경은 필요하지 않습니다. 관제 Worker와 외부 예약 검사 활성화는 이번 작업에서 수행하지 않습니다.
4. 배포 후 월을 넘는 주간 리포트, 카드 목표 저장·삭제, 메뉴 검색, 분류 자유 입력, 정기 항목 수정과 복사 실패 안내를 실제 기기에서 확인합니다. 카드 목표는 예상치이며 카드사 혜택을 보장하지 않습니다.
5. 가계부 삭제의 `household_preference_cleanup_pending` 이벤트가 있으면 삭제된 id의 정확한 `card_targets:<id>` 키만 승인된 운영 점검에서 확인합니다. 추가 설정 정리는 삭제 RPC와 단일 트랜잭션이 아닙니다.
