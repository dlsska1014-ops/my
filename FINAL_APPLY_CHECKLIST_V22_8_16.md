# V22.8.16 최종 적용 체크리스트

- [ ] 현재 Worker 코드와 환경변수 이름 목록 백업
- [ ] `node .codex/scripts/verify-repository.mjs` 통과
- [ ] `src/index.js` 전체 교체
- [ ] SQL·환경변수·Kakao Developers·OpenBuilder를 변경하지 않음
- [ ] `/health`에서 `V22.8.16-DARK-SURFACE-CONTRAST-HOTFIX` 확인
- [ ] `/assets/accountbook-shell-v22816.css`의 200·CSS MIME·immutable·ETag 확인
- [ ] 라이트·다크에서 메뉴·자산·적립계획·영수증·가계부 관리·참여자·키워드·백업·시작 안내 확인
- [ ] 입력 컨트롤, 배지, 안내·경고, 주요·보조 버튼의 글자 대비 확인
- [ ] PC와 모바일에서 가로 넘침과 브라우저 오류 확인
- [ ] 기록·영수증·권한·카카오 1:1·그룹 회귀 확인

실패 시 직전 V22.8.15 `src/index.js`로 전체 코드만 롤백합니다.
