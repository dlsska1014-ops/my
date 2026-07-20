# V22.8.12 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과 확인
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.12-ACCESSIBLE-THEME-CONTRAST` 확인
- [ ] 새 CSS·JavaScript의 200·MIME·immutable·ETag 확인
- [ ] 시스템·라이트·다크와 네 컬러톤 선택·새로고침 유지 확인
- [ ] PC·iPhone·Android 홈·분석·입력·하단 메뉴 확인
- [ ] 기록·정산·예산·영수증·카카오 1:1·그룹 회귀 확인

실패 시 V22.8.11 `src/index.js`로 전체 코드만 롤백합니다.
