# V22.8.17 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.17-ADSENSE-V2-UX-REVIEW-SAFE` 확인
- [ ] 홈과 `/privacy`의 `google-adsense-account` 메타가 정확히 한 번인지 확인
- [ ] `/ads.txt`가 정확한 판매자 한 줄·`text/plain`인지 확인
- [ ] 개인 `/app`, `/my/analysis`, `/receipts`와 관리자 화면에 광고 코드가 없는지 확인
- [ ] `/assets/accountbook-shell-v22817.css`의 200·CSS MIME·immutable·ETag 확인
- [ ] 라이트·다크와 블루·그린·바이올렛·앰버에서 홈 달력·분석 확인
- [ ] PC·모바일·태블릿에서 가로 넘침, 메뉴 접기, 터치 크기, 브라우저 오류 확인
- [ ] 기록·영수증·권한·카카오 1:1·그룹 회귀 확인

실패 시 직전 V22.8.16 `src/index.js`로 전체 코드만 롤백합니다.
