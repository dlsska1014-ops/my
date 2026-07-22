# V22.8.20 먼저 읽기

이번 버전은 V22.8.19 색상·대비와 AdSense 심사 경계를 유지하면서 Claude 브랜치의 카카오 수정 V4, 삭제 복구 수정, 웹 제출 인라인 피드백을 선별 통합한 누적 배포본입니다.

## 적용

1. 현재 Cloudflare Worker 코드를 백업합니다.
2. 검증된 `src/index.js`를 Worker 전체 소스와 교체합니다.
3. SQL, 환경변수·Secret, Kakao Developers, OpenBuilder는 변경하지 않습니다.
4. 배포 후 `/health`가 `V22.8.20-KAKAO-EDIT-INLINE-FEEDBACK`인지 확인합니다.
5. 카카오 1:1과 그룹에서 기록 보기, 수정, 삭제, 삭제 복구를 확인합니다.
6. 웹 저장·참여·관리 폼의 결과 안내가 제출한 위치 근처에 표시되는지 확인합니다.

V22.8.19의 `/assets/accountbook-shell-v22819.css`, 컬러톤, 다크모드 및 AdSense 공개/개인 화면 경계는 그대로 유지합니다. 문제가 생기면 V22.8.19 Worker 소스로 코드만 전체 롤백합니다.
