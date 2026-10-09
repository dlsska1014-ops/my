# V22.9.33 검증 기록

저장소 자동 검증을 마쳤습니다. 운영 적용은 아직 하지 않았고, 운영 배포와 실제 Cloudflare API 호출도 하지 않았습니다.

- **작업 위치:** git worktree `D:\Github_Kakao_Account\my-v22933`, 브랜치 `codex/v22933-qa-fixes`
- **기준:** V22.9.32 main `1c26463`
- **동결 소스:** SHA-256 `2e5dd9d8de6d7f937770391b25db582799b88994a1bee59384cbbdae7ae3d456`, 3,259,306 bytes, 34,436줄

## 바뀐 범위

V22.9.32 운영 소스(`a361b2f6…`)와 최상위 문장을 구문 트리로 비교했습니다(`tools/compare-worker-statements.mjs`). 1,610개에서 1,619개가 됐고, 순서는 같습니다. 바뀐 문장 36개와 새 문장 9개가 모두 아래 수정에 해당합니다.

| 결함 | 바뀐 곳 |
|---|---|
| B01 목표 금액 | `handleUserGoals`, `normalizeGoal`. 새로 `parseGoalAmountInput`, `storedGoalAmount`, `goalAmountsFromInput`, `MAX_GOAL_AMOUNT`(1,000억), `GOAL_AMOUNT_INVALID` |
| B02 즐겨찾기 | `handleUserFavorites`(엄격한 읽기 + `withHouseholdSettingsRmw`) |
| B03 3개월 평균 | `calculateExtendedAnalytics`, `renderStrategyCards` |
| B04 요일 날짜 | `quickInputDate`, `explicitDateIntent`, `handleAdminAddTransaction`(서버 대조), `MOBILE_HOME_JS_ASSET_PATH`, `MOBILE_HOME_SHELL_JS_ASSET_PATH`, `mobileHomePerformanceAssetResponse`, `AB_HISTORICAL_RUNTIME_ASSETS` |
| B05 조회 완전성 | `fetchPostgrestRows`, `fetchAdminRowsRange`(기본 완전 조회) |
| B05 한도 초과 처리 | 연간 리포트, 전체 백업, 카카오 기간 요약, 챌린지, 자동 리포트, 검색 |
| B05 분석 화면 | 분석·인사이트(부분 허용), 관리자·PC 분석(`fetchAnalysisRowsRange` 와 안내), `formatMessage`(`backup_too_large`) |
| B06 수정 이력 | `fetchTransactionEditHistoryMap`, `appendTransactionEditHistory` |
| B07 챌린지 | `renderMobileV81Html`(홈 표시 조건), `renderReportChallenge`(끝난 챌린지 문구) |
| B08 접근성 이름 | `attachAccessibleControlNames`, `accessibleFieldLabel` |
| B09 간격 | `renderUserLoginHtml`(`form+.hint{margin-top:8px}`) |
| T1 웹 수정 폼 | `handleTransactionEditPage`(전체 행 `getTransactionForUserEdit`) |
| 판 번호 | `APP_VERSION` |

Worker 내보내기 목록은 바뀌지 않았습니다. 그래서 배포 스크립트의 `named_handlers` 대조도 같습니다.

## 결함별 확인

새 검사 `validation/validate-qa-fixes-v22933.mjs`(52개)가 보고서 재현 조건을 실제 경로로 확인합니다. 같은 검사를 V22.9.32 빌드에 돌리면 B01 부터 실패합니다. 수정 전후로 같은 스크립트를 돌린 결과는 다음과 같습니다.

| 결함 | 수정 전(V22.9.32) | 수정 후 |
|---|---|---|
| B01 | `fund amount "1e309"` 가 200 이고 모은 금액이 `null`(다음 조회 0원)이 됩니다. "1.5"·"0x10"·"1e3"·2,000,000,001 도 저장됩니다. | 11가지 입력 모두 400, 모은 금액 12,345원 유지. "2,000,000원" 표기는 받습니다. |
| B02 | 읽기 503 뒤 추가하면 새 항목 하나만 남습니다. | 503 으로 거절하고 기존 2개를 유지합니다. 깨진 JSON 도 덮어쓰지 않습니다. 조회 실패는 503 입니다. |
| B03 | [0원, 0원, 30,000원] 평균이 30,000원입니다. | 10,000원입니다. 카드에 "기록이 있는 3개월"을 적습니다. |
| B04 | 웹 "지난주 금요일"은 빈 날짜(→오늘)입니다. | 2026-10-09 기준 2026-10-02 입니다. 웹·카카오가 2,464가지 조합에서 같고, 폼 날짜가 다르면 서버가 저장하지 않습니다. |
| B05 | 2만 건을 넘는 해는 일부만 합계를 냅니다. 전체 백업은 10만 건에서 조용히 잘립니다. | 연간 리포트는 이유를 알립니다. 4만 건을 넘는 백업은 `backup_too_large` 이고, 카카오 기간 요약과 검색도 이유를 알립니다. |
| B06 | 읽기 503 뒤 이력이 새 항목 하나로 덮입니다. | 수정은 저장되고 기존 이력은 유지됩니다. 다음 수정에서 합칩니다. |
| B07 | `enabled:false` 챌린지가 홈에 그려집니다. | 끄면 홈 카드가 없고, 켜면 있습니다. 끝난 챌린지는 리포트에 끝난 날짜와 함께 나옵니다. |
| B08 | "비밀번호" 칸이 "개인 접속코드"로 읽힙니다(5칸). | 다섯 칸 모두 화면 라벨로 읽히고, 라벨과 어긋나는 aria-label 은 0개입니다. |
| B09 | 안내 `margin-top:-4px` 가 버튼과 4px 겹칩니다. | `form+.hint{margin-top:8px}` 로 8px 간격을 둡니다. |
| T1 | 운영처럼 select 한 칸만 돌려주면 폼이 금액 0·빈 날짜·빈 분류로 열립니다. | 금액 3,200,000원·날짜·분류·메모·결제수단이 채워집니다. 금액만 바꿔 저장하면 나머지 칸은 그대로입니다. |

B04 의 대조 조합은 기준일 32일, 주 범위 표현 11가지, 요일 7가지입니다. 기준일에는 연말·윤년 2월이 들어 있습니다.

기존 검사 가운데 의도한 변경에 맞춰 고친 것은 이렇습니다.
- `validate-screen-cleanup-v22892`: 거래 탭 분류 칸이 aria-label 대신 보이는 라벨 "분류로 보기"로 이름이 붙습니다.
- `validate-immutable-asset-addresses-v2299`: v22933 주소 두 개를 고정했고, v22930 두 개는 보존된 바이트 그대로입니다.
- 현재 홈 셸 자산 내용을 읽는 검사 네 개(`audit-corrections-v22930`, `category-rules-single-source-v2296`, `performance-v22811`, `share-target-shortcuts-v2298`)가 v22933 주소를 읽습니다.

## 전체 검증

- **새 manifest:** `BUNDLE_FILE_CHECKSUMS_V22_9_33.sha256` 은 V22_9_32 의 332개 경로를 모두 보존하고 새 파일을 더한 **337개**입니다. 새 파일은 판 문서 3개, 감사 결과 문서, 새 검사입니다.
- **전체 하네스:** `node .codex/scripts/verify-repository.mjs` 가 자동 검사 **8,452개**(하한 8,452), Worker 문법, ESM `default.fetch`, 작업 트리와 스테이징 공백 검사를 통과했습니다.
- **SQLite:** Node.js v22.23.1 에서 `node monitoring/test-d1.mjs` 의 45개를 별도로 통과했습니다.
- **CI:** Ubuntu·Windows 결과는 병합 뒤 이 기록에 덧붙입니다.

## 함께 한 감사

여섯 영역을 읽기 전용으로 감사했습니다. 영역은 설정 읽기-수정-쓰기, 금액·입력 검증, 가계부 생성·참여, 집계·날짜·잘림, 화면·접근성, 거래·가져오기·반복입니다. 찾은 결함과 고칠 순서는 `docs/codex/AUDIT_FINDINGS_V22_9_33.md`에 있습니다. 이 판에는 보고서 결함과 T1 만 넣었습니다. 나머지는 영향이 크지만 고칠 곳이 넓어 다음 판에서 따로 검증합니다.

## 운영과 한계

- **T1 의 과거 영향:** 이 결함은 V22.8.86 부터 운영에 있었습니다. 그 사이 웹 "수정하기"로 저장한 기록이 비었거나 바뀌었을 수 있습니다. DB 감사 테이블로 찾을 수 있지만, 이 판은 데이터를 고치지 않습니다.
- **픽스처의 `select=` 처리:** `db.__honor_select` 는 아직 새 검사의 T1 부분만 켭니다.
- **배포:** 이 판은 배포 스크립트로 적용합니다. 토큰이 필요한 업로드·승격은 사용자가 직접 실행합니다.
