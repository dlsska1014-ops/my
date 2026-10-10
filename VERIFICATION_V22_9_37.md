# V22.9.37 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 배포와 실제 Cloudflare API 호출은 하지 않았습니다.

- **작업 위치:** 통합 worktree `D:\Github_Kakao_Account\my-v22937-int`, 브랜치 `claude/v22937-integration`. 묶음별 작업 브랜치 `claude/v22937-audit-{a,b,c,d}`와 관제 브랜치 `claude/v22937-monitor-alerts`를 병합했습니다(충돌 2곳: `src/index.js`는 다시 빌드, `features/budget-alerts-annual-goals.js`는 두 쪽을 합침).
- **기준:** V22.9.36 main `66f22de`(운영은 V22.9.35 `4f9da854…`).
- **동결 소스:** SHA-256 `12c2d1671819bb1d2336ecc49bc7fd9d92be14f7b1454de507f0ab667a4f9130`, 3,764,542 bytes, 109 모듈(새 모듈 `domain/strict-input.js`).

## 재현

묶음마다 고치기 전 코드(`66f22de`)에서 새 검사를 돌려 결함을 재현했습니다.
- A: 97개 중 70개 실패(나머지는 회귀 보호). B: 99개 중 67개 실패. C: 143개 중 96개 실패. D: 각 절의 첫 항목에서 실패. 관제: 소스 검사 첫 항목에서 실패.

## 새 검사

| 검사 | 검사 수 | 다루는 항목 |
|---|---|---|
| `validate-audit-batch-a-v22937` | 97 | SIM-2·3·4·5·8·9·16·18, T7, T8, D7, D9, D10, D11~D14, N8, N9, N10 |
| `validate-audit-batch-b-v22937` | 102 | NEW-4, NEW-8, NEW-9, H2, H3, H5, H6, H7, H10, H13, H14, H15 |
| `validate-audit-batch-c-v22937` | 146 | H1·U3·U6, H4, H8, H9, H11, H12, U2, U4, U5, U7, U8, U9, U10(3/4), U11, U12, U13, U14, N12, 자산 주소 7개 |
| `validate-audit-batch-d-v22937` | 211 | 공용 엄격 검증기, N5·D6, T9, T10, SIM-6, SIM-7, N7, N13 |
| `validate-monitor-alerts-v22937` | 39 | 관제 1.1.0 소스·설정·워크플로, 앱 표본 범위, 전송 실패 이벤트, 저장 실패 분류 |

바꾼 기존 검사: `validate-kakao-edit-safety-v22934`(T2 "응답을 잃은 삭제" 주입 조건에 감사 RPC 경로 추가, 1줄), 자산 주소 리터럴을 쓰는 검사 33+13+15+3개(v22937 로 교체), `validate-immutable-asset-addresses-v2299`(새 주소 7개와 보존 주소 4개의 해시 고정).

## 통합에서 더 고친 것

- 묶음들이 자기 범위 밖이라 남긴 항목: D7 카카오 "예산 N원" 답장의 분류별 예산 안내(`kakaoTotalBudgetNote`), H9 관리자 `/budgets`의 첫 가계부 대체 제거, U8 `/budget-alert-guide` 테마 스크립트·다크 규칙, U14 역할 전달(`keyword-guide`·`calendar`·`settlement`·`stats` 화면; 분석 화면은 해시로 고정돼 제외), 관리자 반환 경로의 새 메시지 코드 7개(`formatMessage`).
- 관제 gap 5: `scheduled()`가 부분 처리(partial)를 더 이상 실패로 던지지 않고, 실제 예외는 `logWorkerError`로 남긴 뒤 던집니다.

## 바뀐 문장

`node tools/compare-worker-statements.mjs <V22.9.36 src/index.js> src/index.js`: 최상위 문장 1,660개 → 1,711개, 같은 문장 1,513개, 순서 같음. 바뀐 문장 145개, 새 문장 53개, 없어진 문장 2개(`safeCandidatePlanRows`, `deleteKakaoRowById`). 전부 위 묶음 기록의 항목입니다. Worker 내보내기 목록은 같습니다.

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_37.sha256`은 V22_9_36 의 357개 경로를 모두 보존하고 새 파일 15개(검사 5, 모듈 1, 묶음 기록 4, 수익화·관제 계획 1, 워크플로 1, 판 문서 3)를 더한 **372개**입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs`가 자동 검사 **9,421개**(하한 9,421), Worker 문법, ESM `default.fetch`, 작업 트리와 스테이징 공백 검사를 통과했습니다.
- **SQLite:** `node monitoring/test-d1.mjs`가 Node.js v22.23.1 에서 **72개**(1.0.1 의 45개 + 알림 발송·토큰·요금제 만료·오류 건수 27개)를 통과했습니다. `npx wrangler deploy --config monitoring/wrangler.jsonc --dry-run`이 바인딩 12개로 번들을 만들었습니다.
- **화면 실측:** `tools/screen-audit.mjs`(헤드리스 Chrome, 390px, 밝게·어둡게)로 묶음 C 가 로그인·시작 가이드·홈·메뉴의 대비 미달 0 을 확인했습니다.
- **CI:** Ubuntu·Windows 결과는 병합 뒤 배포 기록에 남깁니다.

## 운영과 한계

- 실기기·실제 카카오 대화·OAuth 왕복·관제 메일 수신은 `docs/ASIDE_V22_9_37.md` 4절로 확인합니다.
- 홈 HTML 예산 여유는 6 B(35,834 / 35,840 B)입니다. 홈 마크업을 늘리는 다음 판은 먼저 줄일 곳을 찾아야 합니다.
- U10 인사이트 막대 aria 는 `validate-ux-principles`의 분석 화면 해시 고정 때문에 남겼습니다(BASELINE "분석 화면 고정").
