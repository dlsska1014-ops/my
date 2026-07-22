# V22.8.18 먼저 읽기

이번 버전은 첨부된 UI·UX v1~v4를 현재 가계부에 안전하게 이식한 누적 배포본입니다.

## 적용

1. 현재 Cloudflare Worker 코드를 백업합니다.
2. ZIP의 `src/index.js`를 Worker 전체 소스와 교체합니다.
3. SQL, 환경변수·Secret, Kakao Developers, OpenBuilder는 변경하지 않습니다.
4. 배포 후 `/health`가 `V22.8.18-UIUX-STAGE4-REVIEW-SAFE`인지 확인합니다.
5. `/assets/accountbook-shell-v22818.css`가 200, CSS MIME, immutable, 새 ETag로 응답하는지 확인합니다.
6. `/assets/accountbook-stage4-nav-v22818.js`가 200, JavaScript MIME, immutable, 새 ETag로 응답하는지 확인합니다.

## 꼭 볼 화면

- PC: 홈 사이드바, 전체 메뉴의 기록·리포트·함께·관리 그룹
- 모바일: 홈·거래·정산·분석·예산 하단 5탭과 상단 전체 메뉴
- 화면 설정: 시스템·라이트·다크 및 블루·그린·바이올렛·앰버
- 홈·달력·분석·예산·정산·참여자·영수증·계정보안
- 공개 홈의 AdSense 소유권 메타와 루트 `/ads.txt`

문제가 생기면 직전 V22.8.17 `src/index.js`로 Worker 코드만 전체 롤백합니다.
