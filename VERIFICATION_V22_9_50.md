# V22.9.50 Lucian A 실제 입력 검증

상태는 repository-complete입니다. codex/lucian-a의 기존 미커밋 B·입력 선행·A 변경을 보존하면서 실제 입력 문제를 수정했습니다. A 비교 기준인 my-lucian-a-prereq의 소스와 보호 경로 446개는 그대로입니다. 이번 수정 전 작업본은 Git 밖 A-native-fix/before의 763개 파일과 초기 Git 상태로 동결했습니다. 커밋·푸시·PR·배포·SQL·환경변수·외부 콘솔 변경은 수행하지 않았습니다.

## 원인과 수정

P1의 금액 변환·저장과 쉼표 자리수 경계의 커서 이동은 V22.9.48에도 있던 선행 결함입니다. A의 새 형식 오류 차단이 실제 입력에서 완료되지 않았던 것으로 구분합니다. 기존 formatter가 숫자 이외 문자를 삭제하고, 뒤 컨트롤러가 변환된 숫자의 유효성을 해제했습니다. A capture 리스너의 마이크로태스크가 target 리스너 뒤에 실행된다는 가정도 성립하지 않았습니다.

P2의 결과 칩 불일치는 A 신규 결함입니다. 한 줄 파싱·통화 정규화 전에 칩을 그렸고, 수동 분류일 때는 추천 완료 이벤트가 생략되어 칩이 이전 값에 남았습니다.

금액 원문 검증 → 허용 형식 정규화 → 실제 필드·유효성·커서 반영 → 미리보기·요약 → 완료 이벤트 → 결과 칩 순서로 처리합니다. 잘못된 문자·부호·소수점은 지우지 않습니다. A는 금액 유효성을 별도로 소유하지 않습니다. 수동 항목·초안·조회 권한·IME·20억원 상한·예산 초과의 비차단 정책은 유지합니다. 고정 대기를 추가하지 않았습니다.

## 실제 입력 전후 결과

| 사례 | 수정 전 현재·선행 작업본 | 수정 후 실제 Chrome |
|---|---|---|
| 1e3 | 13원, valid=true, 요청 1건·새 거래 1건 | 원문 1e3, valid=false, 요청 0건·거래 0건 |
| -10 | 10원, valid=true, 요청 1건·새 거래 1건 | 원문 -10, valid=false, 요청 0건·거래 0건 |
| 1.5 | 15원, valid=true, 요청 1건·새 거래 1건 | 원문 1.5, valid=false, 요청 0건·거래 0건 |
| ₩12,000·8,900원 | 금액은 정상화됐으나 A 칩은 형식 확인에 남음 | 입력 직후 실제 금액·칩·유효성이 일치함 |
| 수동 분류 후 한 줄 입력 | A 칩은 날짜·금액·결제수단의 이전 값에 남음 | 추가 클릭·추천 없이 다섯 칩과 실제 제출값이 일치함 |
| 123 가운데에 9 삽입 | 1,923, 커서 5 | 1,923, 커서 3 |
| 1,234 가운데 숫자 삭제 | 124, 커서 3 | 124, 커서 2 |

수정 전 같은 재현 검사에서 현재 작업본은 25개 중 11개, 선행 작업본은 17개 중 8개가 실패했습니다. native-before-final과 native-prereq-final에 원문·실제 필드·칩·이벤트 순서·요청·행 수를 기록했습니다. 수정 후 최종 근거는 native-final-consumed/report.json이며 초기 220개·중간 228개·233개 보고서는 과정 증거로 구분합니다.

최종 Chrome은 Chrome 155.0.8059.79에서 233/233, 실패 0개입니다. 모든 금액 교체와 한 줄 입력은 Input.insertText, 키 입력과 좌표 클릭을 사용합니다. 기존 합성 dispatchEvent 검사도 별도로 유지했습니다. 모바일 375px·데스크톱 1280px, 라이트·다크와 네 톤, 금액 가리기, 키보드와 Tab·Shift+Tab·Escape, 동작 줄이기와 조회 전용을 검사했습니다.

잘못된 금액을 정상 값으로 수정한 저장, 네 증액·지우기, 20억원 저장·초과 차단, 유효한 예산 초과 지출 저장, 두 커서 경계, 숫자·한글 IME 조합·확정, 수동 다섯 필드, 초안 복원·오류 초안·시트 재개방, 자산 지연·503 실패·재시도를 확인했습니다. 추천 요청 3건에서는 실제 JSON 소비와 Promise 후속 처리 완료를 MessageChannel 작업으로 관찰한 뒤 수동 분류 보호와 새 응답 우선·오래된 응답 무시를 비교했습니다. 서버 전송 완료나 임의 프레임 수를 소비 완료로 간주하지 않습니다.

## 자동 검사와 산출물

| 검사 | 실제 결과 |
|---|---|
| A 기존·새 입력 처리 계약 | 72개 + 140개가 통과했습니다. |
| 입력 선행·기존 B·E | 300개·161개·192개가 통과했습니다. |
| UX·성능·직렬화·정적 자산 | 59개·165개·56개·128개가 통과했습니다. |
| 일반 전체 하네스 | 자동 검사 15,942개·체크섬 461개, ESM default.fetch와 공백 검사가 통과했습니다. |
| 분류 표 부재 전체 하네스 | 별도 npm run validate:categories-absent 실행에서 15,942개·체크섬 461개와 ESM·공백 검사가 통과했습니다. |
| 네이티브 Chrome | 233개, 실패 0개이며 source SHA가 아래 산출물과 같습니다. |
| SQLite | Node.js v22.23.1의 메모리 SQLite 84개가 통과했습니다. 실패 주입 로그는 검사 시나리오입니다. |
| 독립 리뷰 | 입력 구현·검사·자산 보호를 두 갈래로 검토했습니다. 검증 표와 표시명을 수정했고, 추천 소비 완료 검증 공백도 보완하여 남은 차단 사항이 없습니다. |

최소 하한은 15,940개로 기존 15,783개에서 새 계약 140개·자산 12개·직렬화 5개를 더했습니다. 검사 조건과 성능 예산은 낮추지 않았습니다. 현재 manifest는 기존 454개 경로와 이전 manifest 자체를 보존한 461개이며, 구 manifest와 기존 자산 pin 38개는 변경하지 않았습니다.

소스는 npm run build:worker로 생성한 117개 모듈, 5,419,675바이트입니다. SHA-256은 e7846fd156f880d8b2dc972a09ba9cfdd051155ccfe110b96bb486460c093c2a입니다. 수정 전후 구문 대조에서 1,817 → 1,818개 중 1,802개가 같으며 기존 선언 삭제와 순서 변경은 없습니다. 관련 입력·직렬화·버전·자산 선언만 변경했습니다.

기존 자산 46개는 Worker 응답 본문과 ETag가 모두 같습니다. 새 자산은 mobile-home-v22950.js 51,023바이트, mobile-home-shell-v22950.js 59,853바이트, accountbook-v5-v22950.js 124,811바이트, accountbook-quick-input-v22950.js 8,049바이트입니다. 셸 CSS·테마·목표·분류·분석 자산은 보존합니다. 홈은 수정 전후 정상 35,593바이트·요청 8회, 빈 홈 29,455바이트·9회, 같은 200행 픽스처 39,128바이트·8회이며 no-store·초기 입력 자산 요청 0회를 유지합니다.

## 변경 파일과 증거

주요 구현은 src/modules/client/shared-input-parsers.js, lucian-a-mains.js, legacy-ui-runtime.js, v5-bundle-mains.js와 src/modules/my/mobile-home.js입니다. 직렬화는 theme-home-assets.js·web/html-postprocess.js, 버전·자산 등록은 site-config.js·asset-registry.js·asset-responses.js·historical-runtime-assets.js에 반영했습니다. src/index.js는 생성 파일입니다. 새 검사는 validation/validate-lucian-a-native-contract-v22950.mjs와 tools/check-lucian-a-native.mjs입니다. 기존 검사 주소·ETag 기대값, 하네스·package·manifest와 관련 문서를 함께 갱신했습니다. 이번 작업의 전체 경로 목록은 Git 밖 A-native-fix/release-metrics.json의 changed·added와 새 BUNDLE_FILE_CHECKSUMS_V22_9_50.sha256을 확인합니다. 기존 B·서버 선행 변경은 되돌리지 않았습니다.

원본은 Git 밖 review-artifacts/lucian-uxui-2026-10-15/A-native-fix에 있습니다. native-before-final, native-prereq-final, native-final-consumed의 report.json과 16화면, performance-comparison.json, release-metrics.json, sqlite-final.log, 최종 verify-present-final.log·verify-absent-final.log 및 종료 상태 JSON을 확인합니다. 앞선 ETag 기대값 실패와 중간 검사 기록은 최종 결과와 구분해 남겼습니다. V22.9.49의 실제 입력 완료 주장은 해당 검증 문서와 A 단계 기록 첫머리에서 정정했습니다.

## 남은 실기기 확인

iOS Safari·Android 실제 키보드·카카오톡 인앱, 실제 OS 클립보드, VoiceOver·TalkBack과 운영 응답은 별도 확인 대상입니다. 로컬 Chrome의 에뮬레이션과 메모리 Worker를 실기기·운영 통과로 간주하지 않습니다. 확인 항목은 docs/ASIDE_V22_9_50.md에 기록했습니다.
