# V22.9.24 적용 안내

2026-10-01에 사용자 승인 후 앱 V22.9.24와 관제 1.0.1의 운영 배포를 완료했습니다.
삭제된 가계부의 설정 대체 저장, 설정 취소 실패 안내, 관제 SSO와 부분 DB 지표 판정을 수정합니다.

1. `node .codex/scripts/verify-repository.mjs`와 `node monitoring/test-d1.mjs`를 실행합니다.
2. 승인 후 현재 앱과 관제 Worker의 전체 소스·설정·배포 ID를 백업합니다. 이번 배포의 백업은 완료했습니다.
3. 기존 관제 설정으로 `monitoring/worker.mjs`를 번들링해 전체 배포합니다.
4. 기존 앱 설정·Secrets·서비스 바인딩·도메인·Cron을 보존하고 `src/index.js` 전체를 번들링 없이 교체합니다.
5. `node tools/verify-deployment-v22920.mjs --legacy-origin https://ttokttok-accountbook.com`으로 실제 V22.9.24와 최신 자산을 확인합니다.
6. 기존 관리자 로그인에서 별도 관제를 열고 자동 제출·관제 쿠키와 대시보드 접근을 확인합니다.

신규 SQL·환경변수·Secret·외부 콘솔 설정 변경은 없습니다. 기존 D1 스키마를 다시 실행하지 않습니다.
CSS·JavaScript 본문은 동일하므로 현재 immutable 자산 주소를 유지합니다.
문제가 발생하면 백업한 앱과 관제 소스로 전체 복구하고 운영 데이터를 수정하지 않습니다.

상세 점검 결과와 수동 확인 범위는 `VERIFICATION_V22_9_24.md`에 기록합니다.
