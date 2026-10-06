# 말해가계부 V22.9.26 적용 안내

2026-10-06 출시 점검에서 확인한 라우터 안전 실패와 결함 16건(카카오 예산 오저장, 요일 UTC 밀림, 정기지출 말일 적용, 가져오기 제목행 오인, 설정 덮어쓰기, 예산 폼 잘림, 인증 횟수 제한 우회 등)을 고쳤습니다. 운영 배포 전입니다.

1. `node .codex/scripts/verify-repository.mjs`로 배포 파일 체크섬과 회귀 검사를 확인합니다.
2. `node monitoring/test-d1.mjs`, `node tools/screen-audit.mjs --shots`, `npm run audit:uiux`, `npm run audit:responsive`로 추가 검사를 수행합니다.
3. 사용자 승인 후 검증한 `src/index.js` 전체를 앱 Worker에 교체합니다. 관제 Worker·SQL·환경변수·Secret·카카오 설정 변경은 없습니다. V5 번들·모바일 셸 JS·분류 규칙 JS는 새 `-v22926` immutable 주소를 씁니다.
4. 배포 후 `/health`의 `version`이 `V22.9.26-LAUNCH-HARDENING`인지 확인하고 `node tools/verify-deployment-v22920.mjs --origin https://malhaebook.com --legacy-origin https://ttokttok-accountbook.com`으로 공개 검사 116개를 다시 확인합니다.
5. 공개 출시 전에 Workers 요금제(요청당 CPU 10ms 한도)와 Supabase API의 Max rows 설정을 판단합니다. 근거와 남은 위험은 `KNOWN-ISSUES.md`, 수동 확인 항목은 `RELEASE-CHECKLIST.md`를 따릅니다.

동작과 검증 범위는 `VERIFICATION_V22_9_26.md`에서 확인합니다.
