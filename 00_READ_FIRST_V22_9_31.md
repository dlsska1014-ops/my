# V22.9.31 공동방 첫 기록

버전은 `V22.9.31-GROUP-FIRST-RECORD`입니다. 미연결 단톡방에서 인증된 첫 거래 입력으로 공동 가계부를 자동 준비합니다. 첫 입력자는 소유자가 되고 같은 방의 다음 기록 참여자는 기존 역할·나가기 이력이 없을 때에만 member로 참여합니다. A·B·C 방은 별도 가계부를 사용하며 같은 사용자의 ID와 개인 선택 상태를 보존합니다.

운영 적용 정본은 `docs/ASIDE_V22_9_31.md`입니다. 이전에 전달한 V22.9.30 aside와 새 checkout·버전·소스 해시를 혼용하지 않습니다. Worker는 검증된 `src/index.js` 전체로 교체하며 이 저장소 작업에서 운영에 배포하지 않습니다.

새 SQL·환경변수·Secrets·Kakao Developers·OpenBuilder·요금제 변경은 없습니다. 기존 V22.9.29 정기 forward 함수의 적용 여부를 확인하고 미적용이면 별도 승인으로 SQL-first 순서를 완료한 뒤 Worker를 교체합니다. 기존 rollback과 immutable 자산 바이트를 보존합니다.

검증 결과는 `VERIFICATION_V22_9_31.md`, 보호 기준은 `BASELINE.md`, 운영 한계는 `KNOWN-ISSUES.md`, 실제 카카오·실기기 항목은 `RELEASE-CHECKLIST.md`를 확인합니다. 도입 전 무표식 해제 방의 구분, 미확정 sent 단계 복구와 만료 후 원격 commit의 펜싱 한계를 자동 성공으로 간주하지 않습니다.
