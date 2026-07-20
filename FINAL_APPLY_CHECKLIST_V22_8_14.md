# V22.8.14 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.14-HOME-FEED-BUTTON-CONTRAST` 확인
- [ ] `/assets/accountbook-shell-v22814.css`의 200·CSS MIME·immutable·ETag 확인
- [ ] 홈 기록 11건 이상에서 `전체 N건 조회` 버튼 확인
- [ ] 라이트·다크와 블루·그린·바이올렛·앰버 확인
- [ ] 기록·영수증·권한·카카오 1:1·그룹 회귀 확인

실패 시 직전 V22.8.13 `src/index.js`로 전체 코드만 롤백합니다.
