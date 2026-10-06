# 말해가계부 V22.9.26 적용 안내

공개 페이지 푸터에 함께 운영하는 한국어 생활 계산기 링크를 추가했습니다.
저장소 검증은 2026-10-06에 마쳤으며 운영 배포는 사용자 승인 후 진행합니다.

1. `node .codex/scripts/verify-repository.mjs`로 배포 파일 체크섬과 회귀 검사를 확인합니다.
2. `npm run validate:sister-link`로 푸터 링크 검사 44개만 따로 실행할 수 있습니다.
3. 검증한 `src/index.js` 전체를 앱 Worker에 교체합니다. 관제 Worker 재배포와 SQL·환경변수·Secret·카카오 설정 변경은 없습니다.
4. 배포 후 `node tools/verify-deployment-v22920.mjs --origin https://malhaebook.com`으로 버전과 공개 경로를 확인하고 공개 페이지 푸터의 "생활 계산기" 링크를 눈으로 확인합니다.

동작과 수동 확인 범위는 `VERIFICATION_V22_9_26.md`, `RELEASE-CHECKLIST.md`에서 확인합니다.
