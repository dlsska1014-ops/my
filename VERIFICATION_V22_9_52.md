# V22.9.52 D 예산 검증 기록

로컬 판정은 **repository-complete**입니다. D0 호환 집계와 두 예산 폼의 저장 전 미리보기를 구현하고 필수 로컬 검증을 완료했습니다. 실기기 확인과 운영 적용은 이 판정에 포함하지 않습니다.

작업 폴더는 `D:/Github_Kakao_Account/my-lucian-d-budget`, 브랜치는 `codex/lucian-d-budget`, 버전은 `V22.9.52-LUCIAN-D-BUDGET-PREVIEW`입니다. HEAD는 원본과 같은 `bd41cca8efc1af9182d49328ee08d026ea9d9943`이며 새 커밋은 없습니다.

최종 `src/index.js` SHA-256은 `50c421542b8d4e882e5f7639bcfdb39b1b8f746345e677bc86fbd1ffa2b400fa`이고 크기는 5,704,659바이트입니다. 원본은 V22.9.51, SHA-256 `7f30dffa3bff21c98f68466ea871842714113467e0e1dc677a10f96da6bd8e54`입니다. 생성 파일을 직접 편집하지 않고 `src/modules`의 119개 모듈을 `npm run build:worker`로 연결했습니다.

## 시작 작업본과 범위

원본 `my-lucian-a`의 Git 상태·브랜치·HEAD·diff·변경/미추적 목록과 승계 대상 777개 파일의 경로·해시를 저장소 밖 `D:/CodexRecovery/lucian-d-budget-20261015-142215`에 보존했습니다. 이 문서에서 ‘증거 폴더’는 그 경로를 뜻합니다. `base-HEAD.bundle`, `working-tree/`, `start-diff.patch`, `start-status.txt`, `files.json`, `start.json`으로 복구할 수 있습니다. `.env`·인증 정보·node_modules·.git은 사본에 포함하지 않았습니다.

별도 worktree를 만든 뒤 승계 파일 전체의 해시 일치와 삭제 상태 0개를 확인했습니다. 마지막 원본 재대조에서도 변경된 파일은 0개입니다. `my-lucian-a-prereq`와 과거 증거도 수정하지 않았습니다. 최종 작업본은 786개 파일이며 승계 V51과 비교한 변경·신규 파일은 39개이고 삭제한 파일은 없습니다. [전체 변경 파일·이전/최종 해시](D:/CodexRecovery/lucian-d-budget-20261015-142215/final-changes.json)와 [최종 Git 상태](D:/CodexRecovery/lucian-d-budget-20261015-142215/final-status.txt)를 보존합니다.

구현 작성자는 root 한 명이며 독립 분석·리뷰는 두 읽기 전용 담당자가 수행했습니다. D 가져오기·C 분석 비교·정기 반영 D-1/D-2·새 디자인 체계·설정 자동 저장·키워드 칩 재구현은 진행하지 않았습니다.

## D0 재현과 집계 정책

소스 수정 전에 [입력·집계 계약](docs/codex/LUCIAN_D_BUDGET_2026_10_15.md)을 기록했습니다. 현재 `LEGACY_CATEGORY_SPLITS`의 다섯 매핑만 사용합니다. 식비는 외식·배달·편의점을 포함하고, 장보기·카페/간식을 포함하지 않습니다. 교통/차량은 교통·택시·주유/충전·차량관리를 포함합니다. 교통 자체는 독립 분류입니다.

합성 거래 64,500원에서 대상 거래의 합집합은 50,500원인데 수정 전에는 16,500원으로 계산됐습니다. 수정 후 식비 행은 상위 이름 자체 1,000원과 외식 12,000원·배달 13,000원·편의점 2,000원을 포함해 28,000원입니다. 교통/차량 행은 22,500원, 독립 교통 행은 3,000원입니다. 행별 사용액은 겹칠 수 있으며 이를 화면에 설명합니다. 전체 대상 지출은 합집합으로 한 번만 계산하고 입력한 배분액 합계 240,000원과 대상 밖 지출 14,000원은 유지합니다.

이름 비교에는 기존 `normalizeText`를 사용합니다. 사용자 분류가 상위 이름과 정규화 후 같으면 같은 호환 묶음으로 해석하며 기존 거래·예산을 재분류하거나 삭제하지 않습니다. 분류예산 합계 우선·`__total` 대체와 종류별 양수 수입 우선·`__income` 중복 제외 규칙을 보존했습니다. 홈·사용 내역·예산 화면·카카오 안내에 같은 집계를 적용했습니다. 분석에는 기존 소비자가 사용하는 대상 분류 데이터만 전달하며 분석 클라이언트와 비교 UI는 변경하지 않았습니다.

수정 전 증거는 `before-evidence/report.json`, 입력 경계 전후 비교는 `contract-before-after.json`에 있습니다. 원래 `1.5`가 2원으로 저장되던 경로, 불일치 배열과 원시 201행이 빈 계획으로 저장되던 경로, 예약 지출 이름과 수입/지출 네임스페이스 충돌을 구분해 기록했습니다.

## 입력·미리보기·저장 경계

순수 함수 `createBudgetPlanContract`를 서버와 브라우저에 명시적으로 주입합니다. 빈 금액은 0원이고 양수 행만 저장합니다. 원 단위 정수·행당 20억원·안전한 정수 범위를 검사합니다. 소수 원·부호·지수·잘못된 쉼표를 반올림하거나 다른 금액으로 바꾸지 않습니다. 공용 거래/카카오 파서는 변경하지 않았고 정확한 단위 스캐너를 주입하여 `50만`·`1.5만원`·`0.5천원`·`0.29백원`을 유지했습니다.

이름은 공백 제거·수입 60자/지출 80자 절단·다시 공백 제거 순서로 기존 RPC의 저장 이름과 맞춥니다. 같은 종류·정규화 이름·양수 금액은 한 번만 반영하고 다른 양수 금액은 전체 저장을 거절합니다. 수입과 지출의 키는 구분합니다. 빈 지출 이름의 유효 금액은 제외 안내와 함께 합계에서 빼며 잘못된 금액은 이름과 무관하게 먼저 오류로 판정합니다. 빈 수입 이름은 현재 행 순서에 따른 기본 이름을 표시합니다.

**이번에 추가한 저장 경계**는 이름/금액 배열 불일치, 원시 입력 합계 200행 초과, 예약 지출 이름 `__total`·`__income`·`__income:*`의 거절입니다. 기존 최종 양수 고유 계획 100행 제한과 구분합니다. 일반 기존 행은 정규화 이름이 같아도 편집기에 모두 표시합니다.

`/my/settings #budgetBulkForm`과 `/budgets #budgetPlanForm`에 예상 수입·계획한 지출·계획상 차액을 표시합니다. 음수 차액은 저장 가능하며 실제 수입을 예상 수입 대신 넣지 않습니다. 특수 총액 행은 숨은 값으로 더하지 않고 전체 교체 시 제외된다고 저장 전에 안내합니다. 저장된 요약은 편집값과 분리합니다. 초기화·행 추가/제거·이름 변경·정정·재진입·pageshow를 처리하고 커서·선택·초점·조합 중 입력을 보존합니다. 세 출력의 `aria-live`는 off이고 전용 상태 영역만 650ms 뒤 묶어서 안내합니다.

인증·관리 권한·CSRF·가계부/월·엄격 조회·원래 fingerprint·월별 잠금·쓰기 직전 최신성 검사와 기존 `accountbook_replace_budget_plan_v227` 호출을 유지했습니다. 정상 저장은 303이며, 유효한 범위의 입력 오류는 422, 충돌은 409, 읽기/쓰기 실패·결과 불명확은 503으로 원문과 원래 지문을 재표시합니다. 정상 RPC 뒤 엄격 조회 1회를 추가해 대상 월의 정확한 전체 행 집합을 확인합니다. 편집 중 요청은 늘지 않습니다. JS/자산 실패 시에도 명시적 native POST와 서버 검증으로 저장합니다.

## 최종 검증

Node.js는 **v22.23.1**, Chrome은 **155.0.8059.79**입니다. 모두 로컬 합성 데이터로 검사했습니다. 검사 수를 줄이거나 성능 상한을 높이지 않았고 전체 하한은 16,119개에서 실제 결과인 16,652개로 올렸습니다. 활성 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_52.sha256`이며 이전 468개 경로를 모두 유지한 477개 경로입니다.

| 명령 | 결과 |
|---|---:|
| `node .codex/scripts/verify-repository.mjs` | 16,652개·체크섬 477개·ESM·공백 검사 통과 |
| `npm run validate:categories-absent` | 16,652개·체크섬 477개·ESM·공백 검사 통과 |
| `npm run validate:lucian-d-budget` | 서버·집계·입력 계약 521개 통과 |
| `npm run validate:lucian-d-native -- --out <증거 경로>` | 실제 Chrome 139/139, 실패·런타임 오류 0개 |
| `npm run validate:lucian-a-native -- --out <증거 경로>` | 기존 Chrome 233/233 통과 |
| `npm run validate:lucian-six-native -- --out <증거 경로>` | V51 여섯 수정 Chrome 113/113 통과 |
| `node monitoring/test-d1.mjs` | SQLite 메모리 84개 통과 |
| `npm run validate:build-identity` | 19개 통과 |
| `npm run validate:module-syntax` | 128개 통과 |
| `npm run validate:client-serialization` | 61개 통과 |
| `npm run validate:init-order` | 13개 통과 |

전체 하네스에는 A 72+140개, 입력 선행 300개, B 161개, E 192개, 보안·성능·불변 자산·V51 여섯 수정 회귀가 포함됩니다. 별도 Chrome 총 485개를 전체 16,652개에 중복 합산하지 않습니다. SQLite의 실패 주입 로그는 합성 오류를 의도적으로 검사한 것이며 실제 메일·웹훅·운영 서비스에 연결하지 않았습니다.

최종 생성 파일의 전체 결과는 `verify-present-generated.log`·`verify-absent-generated.log`에 있습니다. 문서·하한·체크섬 동기화 뒤 재실행한 기록은 `verify-present-final.log`·`verify-absent-final.log`입니다. 각 로그의 `.json`에 명령·시작/종료 시각·종료 코드를 보존합니다. 서버는 `final-server-generated/server-budget-report.json`, Chrome은 `native-d-generated/`·`native233-generated/`·`native-six-generated/`, SQLite는 `sqlite-generated.log`를 확인합니다. 모두 최종 소스 해시와 대응합니다.

서버 521개는 독립적으로 명시한 기대 행·합계와 제출값·전체 저장 전후 행·다른 월/가계부 보존·쓰기 횟수를 비교합니다. 거절된 직접 제출은 쓰기 0회이며 정상 저장은 정확한 전체 계획을 한 번 교체합니다. Chrome은 키 입력·`Input.insertText`·좌표 클릭·native POST·새 문서 응답 소비로 편집값 → 표시 합계 → 제출값 → 저장 행 → 재렌더를 연결했습니다. 두 폼 모두 편집 구간의 추가 DB 요청과 자동 저장은 0회였습니다.

320·375·768·1280px의 라이트/다크 캡처와 최종 DOM을 보존했습니다. 네 톤의 오류 대비 4.5:1 이상, 44px 대상·Tab 초점·가로 넘침·금액 가리기·모션 줄이기·레거시 정리 후 미리보기 보존을 확인했습니다. 실제 이력 복귀와 모형의 pageshow 호출을 구분합니다. IME는 CDP 에뮬레이션이며 실제 OS 클립보드·화면 읽기 프로그램·실기기 검사를 대신하지 않습니다.

## 독립 리뷰와 실패 후 수정

계약 담당자는 이름 절단 뒤 공백으로 예약 이름 검사를 우회하는 P1, 별칭 행이 잘못된 배분액을 쓰는 P2, `localeCompare` 동률로 원문 집합을 다르게 판정하는 P2를 지적했습니다. 런타임 담당자는 output의 암묵적 status가 지연 안내와 별개로 발화하는 P2를 지적했습니다. root가 수정하고 관련 회귀를 추가했습니다. 계약 담당자의 별도 합성 assertion 55개와 재검토가 통과했고 두 담당자 모두 최종 차단 사유가 없다고 보고했습니다. 리뷰 범위와 결과는 증거 폴더 `independent-review.md`에 기록합니다.

리뷰의 함수 동결 해시 이후에는 APP_VERSION과 빌드 export 표기만 정리했습니다. 최종 생성 파일과 서버/브라우저 증거의 SHA를 독립 재확인했습니다. 문장 비교에서 공통 선언 1,798개가 동일하고 변경 20개·추가 12개이며 제거·기존 공통 선언 순서 변경은 없습니다. 실제 변경 이름은 `statement-comparison.json`에 있습니다.

기존 전체 검사 세 곳은 새 동작과 맞지 않는 기대값 때문에 처음 실패했습니다. 실제 동작 증거를 강화했으며 과거 실패 로그도 보존했습니다.

- interrupted-save의 지문 없는 제출을 성공으로 보던 검사를 실제 폼 지문·303 메시지·정확한 최종 행까지 검사하도록 바꿨습니다. 26개에서 29개로 늘었습니다.
- budget-basis-income-ia의 오래된 Set 코드 문자열 검사는 중첩·합집합·대상 밖 지출·배분액의 독립 기대값으로 바꿨습니다. 89개를 유지합니다.
- launch-review의 행 상한 코드 문자열 검사를 실제 101행 제출·422·쓰기 0회·기존 전체 계획 보존으로 바꿨습니다. 125개를 유지합니다.

Chrome 도구의 bootstrap 응답 대기·테마 키·콤보 종료·응답 소비·문서 전환·안정된 클릭 위치를 보완했습니다. JS 비활성 분기는 rAF에 의존하지 않습니다. 기존 CSS 전환의 ready/updateCallbackDone/finished promise는 pagereveal/pageswap에서 개별 관찰하며 전역 오류를 무시하지 않습니다. 마지막 독립 재검토에서 전환 47건 모두 fulfilled, `Runtime.exceptionThrown` 0건과 139/139를 확인했습니다. 제품에 임의 지연이나 전역 예외 무시를 추가하지 않았습니다.

## 자산·요청·크기 보존

이전 정적 자산 URL **52개**의 본문·ETag·모든 응답 헤더와 기존 **46개 pin**이 동일합니다. 새 주소 `/assets/accountbook-budget-preview-v22952.js`만 추가했고 현재 pin은 47개입니다. 새 JS는 21,775바이트, SHA-256 `ff0696632937cbc2ff8812b47d4812cf9137b39f20455f1cd01d57c7589efffb`, ETag `"accountbook-budget-preview-v22952-js"`입니다. 두 폼에서만 로드하며 개인 HTML의 `no-store`를 유지합니다. `final-assets-generated/protected-assets-result.json`에 전후 비교를 보존했습니다.

| 합성 페이지 | HTML 바이트 이전 → 현재 | 서버 데이터 요청 이전 → 현재 | 자산 URL 수 이전 → 현재 |
|---|---:|---:|---:|
| `/my/settings` | 57,175 → 58,203 | 7 → 7 | 7 → 8 |
| `/budgets` | 52,419 → 53,642 | 8 → 8 | 7 → 8 |
| `/app` 기준 홈 | 35,660 → 35,720 | 8 → 8 | 6 → 6 |
| `/app` 빈 홈 | 29,522 → 29,582 | 9 → 9 | 6 → 6 |
| `/app` 합성 200행 | 38,894 → 38,965 | 8 → 8 | 6 → 6 |
| `/my` 303 이동 | 0 → 0 | 2 → 2 | 0 → 0 |

초기 서버 렌더 요청과 Chrome의 기존 알림/즐겨찾기 bootstrap 요청은 구분했습니다. bootstrap 완료 뒤 편집 구간의 추가 요청은 0회입니다. 기준/빈 홈 35KiB·200행 홈 44KiB와 `/my` 4회·`/app` 9회 제한을 유지했습니다. 홈·빠른 입력에 새 자산 요청은 없습니다. 실측 전체는 `performance-comparison.json`에 있습니다.

주요 구현 파일은 `domain/budgets.js`, `domain/budget-plan-contract.js`, `client/lucian-d-budget.js`, `my/groups-budget-bulk.js`, `my/settings-page.js`, `admin/budget-center-recurring.js`입니다. 홈/분석의 대상 분류 전달·정본 안내·자산 등록·MANIFEST·버전·문서·검증 도구와 생성 결과도 갱신했습니다. 최종 모듈은 UTF-8·BOM 없음·LF·단일 마지막 개행을 유지했습니다.

## 남은 확인과 외부 변경

iOS Safari·Android Chrome·카카오톡 인앱·실제 OS 클립보드·VoiceOver/TalkBack·실제 BFCache persisted=true 복원은 미확인입니다. [수동 확인 절차](docs/ASIDE_V22_9_52.md)에 따라 실제 환경에서 확인할 때만 완료로 기록합니다. 개인정보 `no-store`를 완화하지 않았고 기존 V51의 미확인 항목도 유지합니다.

커밋·푸시·PR·병합·업로드·배포·운영 SQL·스키마/RLS/RPC 정의·환경변수·Secret·외부 콘솔 변경은 실행하지 않았습니다. 이번 변경에 필요한 SQL·환경변수·외부 설정도 없습니다. D 가져오기와 C 분석은 별도 지시가 있을 때만 진행합니다.
