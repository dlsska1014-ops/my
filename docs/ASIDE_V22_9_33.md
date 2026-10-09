# V22.9.33 QA 결함 수정 적용 안내

이 문서는 `V22.9.33-QA-FIXES` 적용 준비본입니다. 새 동결 `src/index.js`는 **3,259,306 bytes**, SHA-256 `2e5dd9d8de6d7f937770391b25db582799b88994a1bee59384cbbdae7ae3d456`입니다.

기준 운영은 V22.9.32입니다.
- 버전 `cb423505-9159-41c1-a696-ad928ccd2172`
- 배포 `67e184a5-da7c-4f54-9d5d-d27a3a9616c8`
- 소스 SHA-256 `a361b2f6…`
- 기록 `docs/deployments/V22_9_32_2026_10_09.md`

## 변경 결과

- **웹 수정 폼(T1):** 기록 카드의 "수정하기" 폼이 전체 행으로 그려집니다.
  - 운영에서는 V22.8.86부터 금액·날짜·분류가 빈 폼이 열렸습니다. 그대로 저장하면 기록이 덮어써졌습니다.
  - 이 판을 배포하기 전까지는 기록 카드의 "수정하기" 대신 거래 내역 화면의 수정 화면을 쓰는 것이 안전합니다. 그 화면은 전체 행을 읽습니다.
- **보고서 결함 B01~B09:** `00_READ_FIRST_V22_9_33.md`에 요약했습니다. 기능·라우트·API 이름·카카오 응답 형식·DB 스키마는 바뀌지 않습니다.
  - 새로 거절하는 입력: 무한·지수·상한 초과 목표 금액. 웹 빠른 입력에서 문장 속 날짜와 폼 날짜가 다른 경우.
  - 새로 알리는 상황: 한도를 넘는 기록, 읽기 실패.
- **1년 캐시 자산:** `mobile-home-v22933.js`, `mobile-home-shell-v22933.js` 가 새로 생겼습니다. `v22930` 두 주소는 이전 바이트 그대로 계속 내려갑니다.
- **Worker 내보내기 목록:** 바뀌지 않았습니다. 그래서 배포 스크립트의 대조 대상(`named_handlers`)이 같습니다.

## 적용 순서

1. PR 을 main 에 병합합니다. 깨끗한 main checkout 에서 `VERSION.txt`, 위 SHA-256, `npm test`(전체 하네스)를 확인합니다.
2. `node tools/deploy-worker-version.mjs --dry-run`으로 네트워크 없이 로컬 해시·커밋·요청 순서를 확인합니다.
3. 사용자가 토큰을 만들어 업로드합니다. 토큰 권한은 Workers Scripts Edit, 이 계정 한정, 만료일 지정입니다. 사용자가 직접 연 PowerShell 창에서 실행하며, 토큰은 환경변수로만 넘기고 대화·저장소에 남기지 않습니다.
   ```powershell
   cd D:\Github_Kakao_Account\my
   $env:CLOUDFLARE_API_TOKEN = Read-Host "Cloudflare token"
   $env:CLOUDFLARE_ACCOUNT_ID = "58e7954ad3d92f0d39a7492ad4689165"
   node tools/deploy-worker-version.mjs
   ```
   업로드는 버전만 저장하고 배포하지 않습니다. `output/deploy/V22.9.33-QA-FIXES/upload-<버전ID>.json`에서 바인딩 30개·`script_runtime`·handlers 대조 결과를 확인합니다.
4. 승인 후 같은 창에서 `node tools/deploy-worker-version.mjs --promote <버전ID> --legacy-origin https://ttokttok-accountbook.com`을 실행합니다.
   - 승격 뒤 스크립트는 현재 배포, `content/v2` 소스 해시, `/health`를 확인합니다. `/health`는 V22.9.33 이 5번 연속 나와야 합니다.
   - 마지막으로 공개 검사를 실행합니다.
5. 문제가 있으면 승인 후 `node tools/deploy-worker-version.mjs --rollback cb423505-9159-41c1-a696-ad928ccd2172`로 V22.9.32 로 되돌립니다.
6. 결과는 `docs/deployments/V22_9_33_<날짜>.md`에 기록하고, 사용자는 토큰을 폐기합니다.

신규 SQL·테이블·컬럼·인덱스·RLS·ACL·환경변수·Secrets·바인딩·Cron·도메인·관제·Kakao Developers·OpenBuilder·요금제 변경은 없습니다.

## 배포 뒤 확인

- 기록 카드에서 "수정하기"를 열면 금액·날짜·분류가 채워져 있습니다(실제 계정으로 확인할 때는 저장하지 않고 닫아도 됩니다).
- 로그인 전 `/my`의 비밀번호 칸이 스크린리더에서 "비밀번호"로 읽힙니다.
- 홈에서 "지난주 금요일 점심 12000원"을 입력하면 날짜 칸이 지난주 금요일로 바뀝니다.
- 이전 판과 같이 `/health`·`/ready`·공개 검사를 확인합니다. 실제 카카오·OAuth·실기기 확인 항목은 이전 판과 같습니다.
