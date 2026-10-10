# V22.9.37 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 배포와 실제 Cloudflare API 호출은 하지 않았습니다.

- **작업 위치:** 통합 worktree `D:\Github_Kakao_Account\my-v22937-int`, 브랜치 `claude/v22937-integration`. 묶음별 작업 브랜치 `claude/v22937-audit-{a,b,c,d}`와 관제 브랜치 `claude/v22937-monitor-alerts`를 병합했습니다(충돌 2곳: `src/index.js`는 다시 빌드, `features/budget-alerts-annual-goals.js`는 두 쪽을 합침).
- **기준:** V22.9.36 main `66f22de`(운영은 V22.9.35 `4f9da854…`).
- **동결 소스:** SHA-256 `dcee743d592a526ffb0a54fccf2b96b9007ea602702a550a83a88270bf5b4ae3`, 3,765,689 bytes, 109 모듈(새 모듈 `domain/strict-input.js`).

## 재현

묶음마다 고치기 전 코드(`66f22de`)에서 새 검사를 돌려 결함을 재현했습니다.
- A: 97개 중 70개 실패(나머지는 회귀 보호). B: 99개 중 67개 실패. C: 143개 중 96개 실패. D: 각 절의 첫 항목에서 실패. 관제: 소스 검사 첫 항목에서 실패.

## 새 검사

| 검사 | 검사 수 | 다루는 항목 |
|---|---|---|
| `validate-audit-batch-a-v22937` | 111 | SIM-2·3·4·5·8·9·16·18, T7, T8, D7, D9, D10, D11~D14, N8, N9, N10, 수동 반영 부분 실패 안내·중복 방지 |
| `validate-audit-batch-b-v22937` | 102 | NEW-4, NEW-8, NEW-9, H2, H3, H5, H6, H7, H10, H13, H14, H15 |
| `validate-audit-batch-c-v22937` | 146 | H1·U3·U6, H4, H8, H9, H11, H12, U2, U4, U5, U7, U8, U9, U10(3/4), U11, U12, U13, U14, N12, 자산 주소 7개 |
| `validate-audit-batch-d-v22937` | 220 | 공용 엄격 검증기, N5·D6, T9, T10, SIM-6, SIM-7, N7, N13, 부호가 있는 대출의 부채·순자산 합계 |
| `validate-monitor-alerts-v22937` | 48 | 관제 1.1.0 소스·설정·워크플로, 앱 표본 범위, 전송 실패 이벤트, 저장 실패 분류, cron 실패와 정상 부분 처리 구분 |

바꾼 기존 검사: `validate-kakao-edit-safety-v22934`(T2 "응답을 잃은 삭제" 주입 조건에 감사 RPC 경로 추가, 1줄), 자산 주소 리터럴을 쓰는 검사 33+13+15+3개(v22937 로 교체), `validate-immutable-asset-addresses-v2299`(새 주소 7개와 보존 주소 4개의 해시 고정).

## 통합에서 더 고친 것

- 묶음들이 자기 범위 밖이라 남긴 항목: D7 카카오 "예산 N원" 답장의 분류별 예산 안내(`kakaoTotalBudgetNote`), H9 관리자 `/budgets`의 첫 가계부 대체 제거, U8 `/budget-alert-guide` 테마 스크립트·다크 규칙, U14 역할 전달(`keyword-guide`·`calendar`·`settlement`·`stats` 화면; 분석 화면은 해시로 고정돼 제외), 관리자 반환 경로의 새 메시지 코드 7개(`formatMessage`).
- 관제 gap 5: `scheduled()`가 처리량 제한에 따른 정상 부분 처리(partial, failed=0)를 실패로 던지지 않습니다. 실제 예외와 내부에서 잡아 `failed`로 집계한 오류는 `logWorkerError`로 남긴 뒤 던집니다.

## PR #68 후속 검토

- 수동 정기 반영에서 거래 저장 이후의 표식 저장 실패, RPC 이후의 표식 복원 실패, 앞 규칙 저장 이후의 다음 규칙 실패를 재현했습니다. 이미 저장된 거래가 있으면 부분 반영 안내를 표시하고, 재시도할 때 해당 거래가 중복되지 않는지 확인했습니다. 저장 전 조회 실패는 기존 기록 유지 안내를 보존합니다(14개).
- 정기 반영과 자동 리포트가 저장소 오류를 내부에서 잡아 `failed=1`로 반환하면 cron도 실패하도록 고쳤습니다. 처리량 제한으로 `failed=0`인 부분 처리는 정상 종료합니다(9개).
- 음수 대출 잔액은 입력한 부호로 보존하되 부채 합계에서는 절댓값을 차감합니다. 은행 1,000,000원과 대출 ±120,000원의 부채는 120,000원, 순자산은 880,000원이며 새 자산 기록의 합계도 일치합니다(9개).
- DB 용량 499MiB/500MiB의 긴급 경고 이후 수집 오류·오래된 지표·값 누락이 생겨도 해소 알림을 보내거나 중복 방지 기록을 지우지 않습니다. 새 정상 지표로 복구가 확인되면 다른 항목이 확인 불가여도 해소 알림을 한 번 보냅니다(SQLite 12개 추가).
- 이 검토에서는 운영 배포, SQL, Secrets, 외부 설정을 변경하지 않았습니다.
- 외부 접속 검사 워크플로는 `workflow_dispatch`만 남겼습니다. main 병합으로 운영 예약 검사가 시작되지 않으며, 30분 예약 템플릿 적용과 실제 실행은 별도 운영 승인 뒤 진행합니다.

## 바뀐 문장

최초 통합 시점(`5588004`, PR 후속 수정 전)의 `node tools/compare-worker-statements.mjs <V22.9.36 src/index.js> src/index.js` 결과는 최상위 문장 1,660개 → 1,711개, 같은 문장 1,513개, 순서 같음이었습니다. 바뀐 문장은 145개, 새 문장은 53개, 없어진 문장은 2개(`safeCandidatePlanRows`, `deleteKakaoRowById`)였습니다. PR 후속 수정은 위 네 항목이며 Worker 내보내기 목록은 유지합니다.

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_37.sha256`은 V22_9_36 의 357개 경로를 모두 보존하고 새 파일 15개(검사 5, 모듈 1, 묶음 기록 4, 수익화·관제 계획 1, 워크플로 1, 판 문서 3)를 더한 **372개**입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs`가 자동 검사 **9,453개**(하한 9,453), Worker 문법, ESM `default.fetch`, 작업 트리와 스테이징 공백 검사를 통과했습니다.
- **SQLite:** `node monitoring/test-d1.mjs`가 Node.js v22.23.1 에서 **84개**(기존 72개 + 수집 불가 구간의 경고 보존과 정상 복구 12개)를 통과했습니다. 최초 통합 시점에는 `npx wrangler deploy --config monitoring/wrangler.jsonc --dry-run`이 바인딩 12개로 번들을 만들었으며, 이번 검토에서는 배포 명령을 실행하지 않았습니다.
- **화면 실측:** `tools/screen-audit.mjs`(헤드리스 Chrome, 390px, 밝게·어둡게)로 묶음 C 가 로그인·시작 가이드·홈·메뉴의 대비 미달 0 을 확인했습니다.
- **CI:** Ubuntu·Windows 결과는 병합 뒤 배포 기록에 남깁니다.

## 운영과 한계

- 실기기·실제 카카오 대화·OAuth 왕복·관제 메일 수신은 `docs/ASIDE_V22_9_37.md` 4절로 확인합니다.
- 홈 HTML 예산 여유는 6 B(35,834 / 35,840 B)입니다. 홈 마크업을 늘리는 다음 판은 먼저 줄일 곳을 찾아야 합니다.
- U10 인사이트 막대 aria 는 `validate-ux-principles`의 분석 화면 해시 고정 때문에 남겼습니다(BASELINE "분석 화면 고정").
