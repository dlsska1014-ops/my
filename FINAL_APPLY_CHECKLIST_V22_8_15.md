# V22.8.15 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.15-DARK-AUTH-SURFACE-CONTRAST` 확인
- [ ] `/assets/accountbook-shell-v22815.css`의 200·CSS MIME·immutable·ETag 확인
- [ ] 라이트·다크 로그인과 내 계정·보안의 텍스트·안내·버튼 대비 확인
- [ ] 홈·메뉴·분석·예산·정산·설정의 다크모드 회귀 확인
- [ ] PC와 모바일에서 가로 넘침과 브라우저 오류 확인
- [ ] 기록·영수증·권한·카카오 1:1·그룹 회귀 확인

실패 시 직전 V22.8.14 `src/index.js`로 전체 코드만 롤백합니다.
