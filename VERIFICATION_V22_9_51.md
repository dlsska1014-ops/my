# V22.9.51 검증 기록

완료 상태는 **repository-complete**입니다. `my-lucian-a`의 `codex/lucian-a`에서 여섯 수정 묶음을 로컬 구현·빌드·검증했습니다. 운영 적용과 실기기 확인은 이 상태에 포함하지 않습니다. 구현과 생성 파일의 작성자는 root 한 명이며, 두 독립 담당자는 읽기 전용 분석과 리뷰만 수행했습니다.

시작 작업 트리 770개 파일과 Git 상태·binary diff를 저장소 밖에 보존했습니다. 시작 파일의 삭제는 0개이며 기존 미커밋 B·선행·A 변경을 포함한 상태에서 수정했습니다. `my-lucian-a-prereq`와 이전 검토 증거는 수정하지 않았습니다. 시작 소스 SHA-256은 `e7846fd156f880d8b2dc972a09ba9cfdd051155ccfe110b96bb486460c093c2a`입니다.

최종 버전은 `V22.9.51-LUCIAN-INPUT-INTEGRITY`이며 Node.js는 **v22.23.1**, Chrome은 **155.0.8059.79**입니다. `src/modules/`의 117개 모듈을 `npm run build:worker`로 연결했으며 생성 파일을 직접 수정하지 않았습니다.

```text
src/index.js SHA-256
7f30dffa3bff21c98f68466ea871842714113467e0e1dc677a10f96da6bd8e54
크기: 5,682,070바이트
```

| 검증 | 최종 결과 | 원본 기록 |
|---|---:|---|
| 전체 일반 모드 | 16,119개 통과, 체크섬 468개 | [일반 모드 로그](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/verify-present-final.log) |
| 전체 분류 표 부재 모드 | 16,119개 통과, 체크섬 468개 | [분류 표 부재 로그](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/verify-absent-final.log) |
| 기존 네이티브 Chrome | 233/233개 통과 | [기존 Chrome 기록](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/reviewed-native233/report.json) |
| 추가 네이티브 Chrome | 113/113개 통과 | [추가 Chrome 기록](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/final-native-six/report.json) |
| 서버 입력·저장 경계 | 163개 통과, 전체 하네스에 포함됨 | [제출값·저장 행](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/server-reviewed/server-regression.json) |
| Node.js 22 SQLite | 84개 통과 | [SQLite 로그](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/sqlite-reviewed.log) |
| 빌드·문법·직렬화·불변 자산 | 19·117·58·140개 통과, 전체 하네스에 포함됨 | 위 전체 로그에 기록했습니다. |
| 작업 트리·스테이징 공백, ESM 진입점 | 모두 통과 | 위 전체 로그에 기록했습니다. |

시작 전체 검사 15,942개를 유지하고 서버·입력 163개, 직렬화 2개, 새 자산 pin 12개를 추가했습니다. 하한은 15,940개에서 16,119개로 올렸습니다. 활성 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_51.sha256`이며 이전 461개 경로를 모두 포함합니다.

| 수정 묶음 | 수정 전 재현 | 수정 후 실제 입력·제출·저장 결과 |
|---|---|---|
| 1. 초안 범위 | 집에서 입력한 `커피 5000원 국민카드`가 여행에 복원되고 여행 가계부에 5,000원 1행을 생성했습니다. | 여행의 금액·메모는 비어 있고 새 행은 0개였습니다. 집으로 돌아오면 5,000원을 복원했습니다. 두 가계부의 초안을 각각 유지했고 다른 사용자·로그아웃·조회 전용·만료·저장소 실패도 검사했습니다. |
| 2. 결과 불명확 뒤 수정 재시도 | 7,000원 저장 후 응답·재조회 실패를 주입하고 12,000원으로 재전송하면 성공 안내와 초안 삭제가 발생했습니다. 저장 행은 7,000원 1개였습니다. | 두 번의 폼 POST 뒤에도 7,000원 1행을 유지했습니다. 12,000원 필드·칩·동일 request_id·초안을 보존하고 `request_conflict` 및 기존 기록 수정 링크를 표시했습니다. 같은 ID·같은 내용은 한 행만 유지하며 전체 저장 필드의 차이도 검사했습니다. |
| 3. 금액 계약 | `1,,000`·`,1000`·`1000,`에 +1천을 누르면 다른 유효 금액으로 바뀌어 저장됐습니다. `점심 -10원`은 10원, `점심 1.5원`은 2원으로 저장됐고 서버도 `1.5`·`1 000`을 변환했습니다. | 잘못된 원문·오류·선택 범위를 유지하고 증액 뒤 저장 요청과 새 행은 모두 0개였습니다. 서버 추가·수정도 거절했습니다. `1.5만원`·`1.5 만원`·`0.5천원`·`0.29백원`은 각각 15,000·15,000·500·29원으로 정확히 저장했습니다. 0원·20억원·상한 초과·부호·지수·통화·직접 정정도 검사했습니다. |
| 4. 초안 상태와 재진입 | 복원 뒤 `택시 12000원 현금`으로 바꿔도 커피·카페/간식·국민카드가 저장됐습니다. 지운 금액이 살아났고 일반 버튼 재진입은 복원하지 않았습니다. | 필드·칩·제출값·실제 행이 12,000원·택시·택시·현금으로 일치했습니다. 여섯 수동 표식과 명시적 빈 값을 유지했고 메모·분류·결제수단을 지운 실제 저장 행도 모두 빈 문자열이었습니다. 일반·quick=1·hash 첫 진입, 재열기, 실패·충돌·무관한 성공을 검사했습니다. |
| 5. 삭제 대기와 이벤트 순서 | 빠른 입력을 실제 클릭하면 URL은 유지되지만 행이 복원되고 5초 안내와 작동하지 않는 되돌리기가 남았습니다. 삭제 POST는 0회였습니다. | 같은 문서의 시트 열기 뒤 대기를 유지하고 정상 만료 시 삭제 요청 1회로 정확한 행 1개만 삭제했습니다. 후속 처리기가 막은 폼 제출은 대기를 유지했습니다. 되돌리기·포인터·Tab 초점 정지·실제 이동에서는 요청 0회와 행 보존·안내 정리를 확인했습니다. 실제 BFCache cache-hit는 아래 제한을 따릅니다. |
| 6. 날짜 설명 | `어제 점심 12000 국민카드`의 실제 날짜·칩은 2026-07-14이고 상단 설명은 2026-07-15였습니다. | 실제 필드·칩·설명이 2026-07-14로 일치했습니다. 자연어·직접 날짜 선택·오늘/어제·복원·달력 진입을 검사했습니다. 달력 2026-08-03과 초안 2026-07-14가 충돌하면 두 날짜와 유지한 거래일을 알렸습니다. 빈 날짜는 특정 저장일을 약속하지 않습니다. |

수정 전 원본은 증거 폴더의 `before-drafts/draft-report.json`, `before-retry/retry-report.json`, `before-increment-native/report.json`, `before-smart/smart-input.json`, `server-report-before.json`, `before-pending/report.json`에 있습니다. 수정 후 JSON에는 원문, 실제 필드와 칩, 수동 표식, request_id, 제출 내용, 요청·행 수와 실제 저장된 행을 기록했습니다. 수정 전 증거는 덮어쓰지 않았습니다.

초안·서버 금액·재시도는 V48에서도, 자연어 금액은 V49에서도 재현된 기존 결함입니다. 증액·날짜 설명은 기존 A/선행 경로에 남아 있었고 B 리스너는 V48·V49·V50에서 같았습니다. 여섯 문제를 V50 신규 회귀로 일괄 분류하지 않습니다.

독립 리뷰는 두 갈래 모두 최종 추가 조치 없음으로 마쳤습니다. `input_analysis`는 이번 구현 중 생긴 문장 종결 마침표 회귀와 기존의 명시적 0·부호/통화 조합 누락을 지적했습니다. `draft_event_analysis`는 수동으로 비운 분류·결제수단이 서버에서 재추론되는 문제를 지적했습니다. 수정 직전 실패를 `review-corrections-before/report.json`에 보존하고 root가 수정했습니다. 이후 서버 163개와 Chrome 113개 및 실제 빈 값 저장 행으로 재검증했습니다. [독립 리뷰 기록](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/independent-review.md)에 범위와 결과를 남겼습니다.

Chrome은 CDP `Input.insertText`, 키 입력, 좌표 클릭과 실제 폼 제출을 사용했습니다. 완료 판단은 응답 소비·문서 전환·상태 전이에 연결했습니다. 클릭 전에는 유한 애니메이션과 `document.activeViewTransition.finished`를 기다렸으며 제품에 지연을 추가하지 않았습니다. 실제 5초 타이머의 정지·취소 검사는 실제 시간을 기다렸습니다. 320·360·375·768·1280·1440px, 라이트·다크, blue·emerald·violet·amber, Tab 초점, 금액 가리기, 모션 줄이기를 확인했고 가로 넘침과 초점 이탈이 없었으며 대상 버튼 높이는 44px 이상이었습니다.

실제 뒤로 가기에서는 `navigation.type=back_forward`, `pageshow.persisted=false`, 삭제 요청 0회와 행 보존을 확인했습니다. Chrome의 `Page.backForwardCacheNotUsed`는 `MainResourceHasCacheControlNoStore`, `JsNetworkRequestReceivedCacheControlNoStoreResource`, `BrowsingInstanceNotSwapped`, `CacheControlNoStoreHTTPOnlyCookieModified`를 기록했습니다. 개인정보 HTML의 `no-store`를 유지했으며 실제 BFCache cache-hit를 통과로 기록하지 않았습니다. `persisted=true`의 재로드·타이머 재생 방지는 기존 B 모형 검사로 확인했고 실제 캐시 복원은 [실기기 절차](docs/ASIDE_V22_9_51.md)에 미확인으로 남겼습니다.

| 성능 픽스처 | 이전 → 현재 HTML | 이전 → 현재 데이터 요청 |
|---|---:|---:|
| 기준 홈 | 35,593 → 35,660바이트 | 8 → 8회 |
| 빈 홈 | 29,455 → 29,522바이트 | 9 → 9회 |
| 200행 홈 | 38,803 → 38,870바이트 | 8 → 8회 |
| `/my` 정본 이동 | 303 응답을 유지했습니다. | 2 → 2회 |

기준·빈 홈 35KiB와 부하 홈 44KiB, `/my` 4회·`/app` 9회 예산을 유지했습니다. 초기 quick-input 자산 요청을 추가하지 않았습니다. V50까지 존재한 자산 **50개**의 본문·ETag와 기존 **42개 pin**을 모두 보존했습니다. 변경된 네 JS만 v22951 주소를 사용하며 현재 pin은 46개입니다. [성능 비교](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/performance-comparison.json)와 [이전 자산 비교](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/protected-assets-result.json)를 보존했습니다.

주요 구현 파일은 `client/v5-bundle-mains.js`, `client/shared-input-parsers.js`, `client/lucian-a-mains.js`, `client/lucian-b-mains.js`, `admin/transactions-households.js`, `domain/transactions-core.js`, `my/mobile-home.js`, `my/transactions.js`, `nlu/amount-parser.js`, `settings/payment-assets.js`입니다. 자산 등록·응답·과거 자산, 버전·문서·검증 도구와 생성 파일도 함께 갱신했습니다. 시작 작업 트리와 대조한 [전체 변경 파일과 해시](../review-artifacts/lucian-uxui-2026-10-15/A-six-fixes-2026-10-15T03-26-58-579Z/final-changes.json)에서 기존 변경과 이번 수정의 기준을 확인할 수 있습니다.

커밋·푸시·PR·병합·업로드·배포·SQL 실행·스키마/RLS/RPC·환경변수·Secret·외부 콘솔 변경은 수행하지 않았습니다. iOS Safari·Android Chrome·카카오톡 인앱·OS 클립보드·VoiceOver·TalkBack과 실제 BFCache cache-hit는 미확인입니다. 기존 다크 알림 배지 대비, 운영 카카오·관제, D 예산·가져오기와 C 분석은 별도 후속 항목으로 유지합니다.
