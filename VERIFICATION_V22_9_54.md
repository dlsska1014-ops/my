# V22.9.54 검증 기록

작업 경로 `D:/Github_Kakao_Account/my-bot-safety`, 브랜치 `codex/bot-safety`, Node.js v22.23.1, 버전 `V22.9.54-BOT-SAFETY`입니다. 시작 Worker SHA-256은 `0d20bc76e1abebdab746dbef9c465d0b76cb3492ef7c43366c4c3975519a0370`입니다. 원본 네 경로의 시작 manifest, staged/unstaged diff, 미추적/삭제 목록과 792개 복구 파일을 저장소 밖 `D:/Github_Kakao_Account/review-artifacts/bot-safety-2026-10-16`에 보존했습니다.

새 검사는 진단 92개·관측 87개·상태 177개·환급 미리보기 114개·안내 61개, 총 531개이며 전체 목록에 연결했습니다. 하한은 기존 17,033개에서 17,567개로 올렸습니다. 기존 검사·성능 예산·V53 p2 지문·privacy·불변 자산/pin을 유지합니다. 과거 체크섬 경로 483개를 모두 새 활성 manifest에 포함합니다.

`runtime-result.json`과 `npm-runtime.jsonl`은 부모와 npm 하위 Node 프로세스가 v22.23.1을 사용했음을 기록합니다. 실제 실행 파일은 `C:/Users/백인남-PC/AppData/Local/hermes/node/node.exe`입니다. `path-before.json`의 한글 및 공백 경로에서 prototype 검사 ENOENT가 각각 재현됐습니다. `fileURLToPath`를 적용한 전후와 최종 동일 사본의 전체 두 모드 결과는 최종 증거에 기록합니다.

중간 검증의 첫 실패도 보존합니다. 별도 구매 쓰기 준비의 latency 예산 실패는 새 후보 검사를 일반 저장에 무조건 추가한 원인을 제거하고 기존 단계와 안전하게 병렬화하여 해소했습니다. 독립 리뷰가 재현한 중복 행의 미전송 UUID marker와 늦은 cleanup의 후속 marker 삭제는 실제 ID 매핑 및 조건부 삭제로 수정하고 상태 회귀에 추가했습니다. 첫 Chrome 입력 실패는 테스트의 Ctrl+A 가상 키 코드 누락이었으며 실제 입력값을 검사하도록 보완했습니다. 관측 검사의 추가 HTML 인증이 합성 IP 제한에 도달한 경우에는 테스트 fixture 한도 안에서 독립 인증을 확인하도록 보완했습니다. 제품의 권한·가드는 완화하지 않았습니다. 첫 전체 실행은 V45 hotfix의 100ms 첫 그룹 정상 안내에서 실패했습니다. 같은 잠금 안에서 이미 확인한 소유자 역할을 재사용하고 첫 사용 이력 성공을 거래 쓰기 전에 요구하면서 writer 준비와 병렬화했습니다. 중간 100ms 재현은 약 3.9초이며 b1 62개를 통과했습니다. 이력 지연·거절 시 거래와 pending marker를 쓰지 않는 8개 검사를 상태 회귀에 추가했습니다. 이후 조건부 marker 저장으로 복구 조회를 안전하게 병렬화하면서 첫 이력 저장은 기존처럼 writer 준비 전에 순차 완료하도록 단순화했습니다. 이 선행 조건을 같은 8개로 다시 확인했습니다.

두 번째 전체 실행은 관측 표시를 바꾼 renderMyAnalysisHtml의 과거 고정 해시에서 중단됐습니다. 허용된 평균·예측 표시식 두 곳만 역변환하면 원래 db2edc… 해시와 일치함을 확인하여 기존 고정 해시는 유지했습니다. polish 76개·UX 59개·광고 게이트 1,762개가 같은 개수로 통과했습니다. 검사 제외나 새 기대 해시로의 단순 교체는 하지 않았습니다.

세 번째 전체 실행은 일반 카카오 기록 DB 호출이 12회에서 14회로 늘어나는 지점에서 중단됐습니다. 요청마다 수정 세션·선택 가계부·대화 흐름을 한 번에 조회하고 기존 marker의 서버 fp·ids가 일치할 때만 교체하는 조건부 저장을 적용했습니다. 없던 marker는 ignore-duplicates 삽입만 허용하고 비교 실패 시 거래를 보내지 않습니다. pending 설정 조회와 writer 획득을 병렬화해 기존 호출 12회·깊이 6을 유지했습니다. 기존 serial-depth 53개·core-write 105개·편집 130개·수정 안전 67개·쓰기 무결성 28개와 새 충돌/응답 소실 회귀 16개가 통과했습니다.

네 번째 전체 실행은 이력 병렬화와 복구 조회 병렬화가 함께 적용되어 기존 120ms 동기 거절 사례의 경계가 달라진 곳에서 중단됐습니다. 불필요해진 이력 병렬화를 제거하고 기존 선행 성공 순서를 유지했습니다. 하한·응답 예산·V45 기대 동작은 변경하지 않았으며 b1 62개와 상태 177개가 다시 통과했습니다.

다섯 번째 전체 실행은 V26 오류 주입 사례가 앞선 503의 불명확 marker를 재사용해 다음 400 주입에 도달하지 못한 지점에서 중단됐습니다. 세 오류의 합성 설정 상태를 각각 독립적으로 복원하고 실제 transaction POST 주입에 도달했음을 3개 더 확인했습니다. 기존 사용자 응답 assertion은 유지했고 88개가 통과했습니다. 제품의 불명확 상태 차단은 변경하지 않았습니다. 하한에도 이 3개를 추가했습니다.

최종 build·두 전체 모드·SQLite·Chrome·독립 리뷰·해시·보존 결과는 아래 최종 실행 절에 기록합니다. 로그는 실행 명령·cwd·시각·exitCode를 담은 JSON과 함께 증거 폴더에 있습니다. 전체 수치에 개별 재실행을 중복 합산하지 않습니다. 확인 경로와 자동 후속 통지, 읽기 전용 환급 미리보기와 실제 정산 반영을 구분합니다.

## 최종 실행

최종 Worker는 `d5ab47a1a28d75d2806bd362c4480421f584e54f61704c432caa02cd01960cc4`이며 5,771,826바이트·121개 모듈입니다. 신규 정적 자산은 없으며 과거 48개 immutable 본문·전체 헤더·ETag와 pin을 대조했습니다. 원본 my 753개·my-lucian-a 777개·my-lucian-a-prereq 755개·my-lucian-d-budget 792개 파일과 HEAD/Git 상태, V53 staged/unstaged diff·index·미추적/삭제 목록이 시작과 일치했습니다.

| 검증 | 실행 명령과 증거 |
|---|---|
| 빌드 | `npm run build:worker`, `build-final.log` |
| 최종 일반 전체 | `node .codex/scripts/verify-repository.mjs`, `verify-final-present.log` |
| 최종 분류 표 부재 전체 | `npm run validate:categories-absent`, `verify-final-absent.log` |
| SQLite | `node monitoring/test-d1.mjs`, `sqlite-final.log`: 84개 통과 |
| 변경 Chrome | `node tools/check-bot-safety-v22954.mjs --out <증거>/chrome-bot-final`, `chrome-bot-final.log`: 29개 통과 |
| V53 privacy Chrome | `node tools/check-budget-privacy-v22953.mjs --out <증거>/chrome-privacy-final`, `chrome-privacy-final.log`: 125/125개 통과 |
| 공백 오류 | `git diff --check`, `git diff --cached --check`, `diff-final.log`·`cached-final.log` |
| 경로 전후 | `path-before.json`·`path-after.json`: 한글/공백 경로 각각 ENOENT에서 18개 통과로 변경됐습니다. |

두 최종 전체 모드는 `D:/Github_Kakao_Account/review-artifacts/bot-safety-2026-10-16/최종 한글 space/저장소` 사본에서 실행합니다. 원래 작업 경로의 파일과 활성 manifest가 바이트 단위로 일치하는지 `final-copy.json`에서 확인합니다. 실제 두 전체 결과·개수·체크섬 496개·ESM 진입점·소스 해시의 최종 판정은 같은 증거 폴더의 `FINAL_REPORT.md`와 `FINAL_RESULT.json` 및 로그를 확인합니다. 개별/리뷰 재실행을 전체 개수에 중복 합산하지 않습니다.

`full-count-delta.json`은 V53 실제 로그 17,034개와 최종 결과를 validator별로 대조합니다. 새 BOT 회귀 531개 외에 기존 오류 주입 도달 3개·문서의 명령 존재 검사 5개·모듈 문법 2개가 증가합니다. 기존 assertion과 검사명·성능 예산을 삭제하거나 낮추지 않습니다. 일반 기록은 기존 12회·깊이 6을 유지합니다.

새 Chrome은 실제 Worker가 만든 QR를 합성 HTML에서 입력/클릭하고 실제 환급/분석 페이지를 엽니다. 실제 카카오 클라이언트 검증은 아닙니다. 최종 소스 해시는 모든 Chrome·SQLite 로그의 시작/종료와 일치합니다. 독립 읽기 전용 리뷰와 비승인 변경 탐지는 `independent-review.md`, 네 원본·변경 경로·금지 파일·불변 응답 보존은 `preservation-result.json`·`final-changes.json`·`asset-preservation.json`을 확인합니다.

BOT별 구현·미완료 범위는 [항목별 보고](docs/codex/BOT_SAFETY_2026_10_16.md), 운영 및 실기기 후속은 [수동 확인](docs/ASIDE_V22_9_54.md)을 확인합니다. BOT-06은 영속 환급 연결과 실제 완료 반영이 미구현인 부분 완료입니다. 미배포이며 운영 SQL·스키마·RLS·RPC 정의·Secret·환경변수·콘솔·커밋·푸시·PR·병합·업로드·배포를 실행하지 않았습니다.
