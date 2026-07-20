# 똑똑한 가계부 V22.8.10 경량 누적 배포본

이 배포본은 V22.8.9까지의 계정·가계부 보안 분리, 카카오 그룹 응답 기준, 영수증 안정화와 분석 화면 보호를 모두 유지하면서 홈 화면 속도와 ZIP 구성을 정리한 누적본입니다.

부분 패치가 아닙니다. `src/index.js` 한 파일을 기존 Cloudflare Worker 코드와 전체 교체합니다.

## 이번 버전 핵심

| 개선 | V22.8.9 기준 | V22.8.10 | 결과 |
|---|---:|---:|---:|
| `/my` 데이터 요청 | 7회 | 4회 | 43% 감소 |
| `/app` 홈 데이터 요청 | 16회 | 9회 | 44% 감소 |
| 개인 홈 HTML | 106,841 bytes | 24,490 bytes | 77% 감소 |
| 배포 ZIP 항목 | 374개 | 경량 구성 | 과거 개별 로그·중복 검증본 제외 |

홈의 공통 CSS·JavaScript 약 82KB는 버전이 붙은 정적 경로로 분리했습니다. 처음 한 번 받은 뒤 브라우저가 1년 동안 재사용하므로 화면을 다시 열 때 개인 HTML만 새로 받습니다.

데이터 조회는 다음처럼 정리했습니다.

- 가계부 목록을 가계부마다 한 번씩 읽지 않고 ID 묶음으로 한 번에 조회
- 참여자 프로필을 참여자마다 읽지 않고 ID 묶음으로 한 번에 조회
- 홈에서 예산·표시 이름·정기지출·결제수단 설정을 한 번에 조회
- 예산의 설정값과 테이블값을 직렬 조회하지 않고 동시에 조회
- 짧은 거래 목록 뒤에 비어 있는 다음 페이지를 한 번 더 요청하던 동작 제거
- `/my`가 바로 홈으로 이동할 때 사용하지 않는 사용자 프로필 재조회 제거

## 적용 판단

| 항목 | 적용 여부 | 작업 |
|---|---:|---|
| Cloudflare Worker `src/index.js` | 필요 | 전체 교체 |
| Supabase SQL | 불필요 | 신규 SQL·스키마·RPC 없음 |
| 기존 SQL 재실행 | 금지 | 이번 업데이트와 무관 |
| Cloudflare 환경변수 | 변경 없음 | 기존 값 유지 |
| Kakao Developers | 변경 없음 | 기존 앱 키·Redirect URI 유지 |
| OpenBuilder | 변경 없음 | 기존 Skill URL·블록 유지 |

이번 쿼리 묶기는 기존 `id`, `key`, `household_id`, `month`, `transaction_date` 필드만 사용합니다. 신규 SQL은 필요하지 않습니다. 운영 데이터가 커진 뒤에도 느리다면 추측으로 인덱스를 추가하지 않고 Supabase 실행 계획을 먼저 확인하는 것이 다음 단계입니다.

## 적용 순서

1. 현재 Worker 코드와 환경변수를 백업합니다.
2. ZIP의 `src/index.js`를 기존 Worker 코드와 전체 교체합니다.
3. SQL은 실행하지 않습니다.
4. 배포 후 `/health`, `/my`, `/app`, `/my/households`, `/receipts`, `/my/analysis`, `/skill`을 확인합니다.
5. 브라우저 개발자 도구에서 `/assets/mobile-home-v22810.css`와 `.js`가 200으로 한 번 로드되고 이후 캐시되는지 확인합니다.
6. 가계부 전환, 기록 저장, 예산 표시, 참여자 표시 이름이 기존과 같은지 확인합니다.

## 자동 검증

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
npm run build
npm run validate
```

- 영수증·보호 화면: 55개
- 카카오 1:1·그룹 응답: 18개
- 가계부·계정 보안 분리: 43개
- UX 원칙·분석 고정: 55개
- 홈 성능·경량 자원: 32개
- 합계: 203개 자동 확인과 빌드 ESM 검증

## ZIP 정리 원칙

최신 ZIP에는 배포에 필요한 현재 코드, 현재 검증, 적용 문서, 누적 변경 이력, 카카오·UX 프로젝트 메모만 넣습니다. 과거 버전의 개별 소스, 반복 체크섬, 이미지, 빌드 폴더, 원본 학습 ZIP, 오래된 검증 로그는 넣지 않습니다.

과거 적용 방식과 변경 이력은 삭제하지 않고 다음 문서에 합쳤습니다.

- `CHANGELOG.md`: 버전별 누적 변경
- `HISTORY_INDEX.md`: 버전 계보와 원본 보관 위치
- `SQL_HISTORY.md`: 과거 SQL의 성격과 이번 버전 실행 여부
- `DEPLOYMENT_MATRIX.md`: SQL·index.js·환경변수·카카오 작업 판정
- `docs/kakao-manual/PROJECT_MEMORY_V22_8_10.md`: 카카오 매뉴얼 기반 보호 기준

## 롤백

V22.8.10은 DB 변경이 없습니다. 문제가 생기면 V22.8.9 `src/index.js`로 코드만 되돌리고 SQL은 롤백하지 않습니다. V22.8.10의 정적 자원 경로는 버전에 묶여 있어 이전 코드로 되돌리면 이전 화면 동작으로 함께 복귀합니다.
