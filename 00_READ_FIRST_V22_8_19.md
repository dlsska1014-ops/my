# V22.8.19 먼저 읽기

이번 버전은 UI·UX 4단계 적용 뒤 발견된 전체 색상·대비 회귀를 보정한 누적 배포본입니다.

## 적용

1. 현재 Cloudflare Worker 코드를 백업합니다.
2. ZIP의 `src/index.js`를 Worker 전체 소스와 교체합니다.
3. SQL, 환경변수·Secret, Kakao Developers, OpenBuilder는 변경하지 않습니다.
4. 배포 후 `/health`가 `V22.8.19-COLOR-CONTRAST-HOTFIX`인지 확인합니다.
5. `/assets/accountbook-shell-v22819.css`가 200, CSS MIME, immutable, 새 ETag로 응답하는지 확인합니다.

## 꼭 볼 화면

- `/kakao-commands`, `/backup-safety`, `/household-flow`, `/kakao-group-flow`
- 자산·결제수단, 분석 보고서, 정산, 가계부 전환·관리
- 시스템·라이트·다크 및 블루·그린·바이올렛·앰버
- 공개 페이지와 사업자 정보 하단 문구

문제가 생기면 직전 V22.8.18 `src/index.js`로 Worker 코드만 전체 롤백합니다.
