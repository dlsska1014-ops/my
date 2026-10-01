# 말해가계부 V22.9.25 적용 안내

홈·거래 상세·빠른 입력·가져오기·데스크톱 요약 패널을 개선했습니다.
사용자 승인 후 2026-10-01에 앱 V22.9.25를 운영에 100% 배포했습니다.

1. `node .codex/scripts/verify-repository.mjs`로 배포 파일 체크섬과 회귀 검사를 확인합니다.
2. `node monitoring/test-d1.mjs`, `npm run audit:uiux`, `npm run audit:responsive`로 추가 검사를 수행합니다.
3. 검증한 `src/index.js` 전체를 앱 Worker에 교체했습니다. 관제 Worker 재배포와 SQL·환경변수·Secret·카카오 설정 변경은 없었습니다.
4. 공개 준비 상태와 최신 자산 주소·본문 검사 116개, 운영 소스 일치와 기존 설정 보존을 확인했습니다. 로그인 후 실제 쓰기 동작과 모바일 실기기는 별도로 확인합니다.

앱 배포 ID는 `5a0c7faa-a9a3-4b3f-9373-5b565e3d2bc7`입니다. 변경과 운영 확인 기록은 [PR #52](https://github.com/dlsska1014-ops/my/pull/52)로 제출했습니다.

동작과 수동 확인 범위는 `VERIFICATION_V22_9_25.md`, `RELEASE-CHECKLIST.md`에서 확인합니다.
