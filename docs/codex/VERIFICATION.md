## V22.9.61 수명주기 검증

새 RPC/CAS·구형 쓰기 차단·관리자 가져오기·카카오 복구는 validate:lifecycle과 관련 저장 회귀로 확인합니다. 실제 PostgreSQL 결과는 외부 lifecycle/attempt-*에 별도로 기록하며 Node 모형을 실제 SQL 결과로 보고하지 않습니다. 최종 두 하네스·SQLite·Git/ESM·체크섬과 원본 보존 개수는 VERIFICATION_V22_9_61.md가 연결하는 외부 RESULT.json을 확인합니다.

## V22.9.59 검증 방법

`npm run validate:storage-contract`는 Unicode 경계·정확한 저장 확인·구형 토큰·소속/삭제 부분 실패·자산 RPC 존재/부재와 SQL 검토문을 486개 assertion으로 검사합니다. 실제 Worker HTTP와 합성 메모리 DB를 사용하며 실제 SQL을 실행하지 않습니다. 승인된 160/40자 거절 정책 때문에 기존 5 MiB 메모 수용 기대값만 명시적 거절로 바꾸고 입력 상한·전체 분석 검사와 기존 518개 수를 유지합니다.

`node tools/prepare-import-recovery-v22959.mjs --out=<새 절대 경로>`는 실제 추적·미추적 소스를 독립 복사하고 가져오기 쓰기를 차단하여 빌드합니다. `node validation/validate-storage-contract-v22959.mjs --case=recovery --recovery=<복구 후보 절대 경로>`는 같은 토큰·이미 열린 탭·만료/소실 토큰·원래 요청의 지연 완료를 검증합니다.

최종 두 하네스는 기존 하한19,691개에 새486개를 더한20,177개를 보호하며 활성 manifest 540개 경로와 ESM을 확인합니다. Node 22 SQLite 84개와 두 git diff --check도 별도로 실행합니다. 전체 로그는 후보 밖 review-artifacts/v59-local-contract-2026-10-17에 보관합니다.

## V22.9.58 검증 방법

`npm run validate:d3-refund-guidance`는 새575개를 실행합니다. 기존 하한19,116에575개를 더한19,691를 보호하며 검사 목록과 checksum 경로를 줄이지 않습니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_58.sha256의529개입니다.

`npm run validate:d3-refund-native -- --out <저장소 밖 경로>`는 외부 요청을 차단한 합성 Worker/메모리 DB와 Chrome에서 실제 클릭·키보드·HTTP를 검사합니다. OS 클립보드와 대체 대화상자는 모형입니다. 두 전체 모드·SQLite·한글/공백 동일 후보·최종 해시·독립 검토는 VERIFICATION_V22_9_58.md가 연결하는 외부 보고서를 확인합니다.

## V22.9.57 C 검증 방법

`npm run validate:lucian-c`는 새 행동/보호 회귀 621개를 실행합니다. 기존 역할 분리의 부분 자료 검사 3개도 추가합니다. 기존 하한 18,492개에 총 624개를 추가하여 전체 하한은 19,116개이며 기존 검사는 유지합니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_57.sha256입니다.

`npm run validate:lucian-c-native -- --out <저장소 밖 절대 경로>`는 외부 fetch를 차단한 합성 Worker/HTTP 서버와 Chrome CDP의 실제 키·마우스·터치를 검사합니다. 기존 V53~V56 회귀, 두 전체 모드, Node 22 SQLite와 diff 검사를 최종 소스에서 실행합니다. 한글/공백 사본·원본/사본·독립 리뷰 해시와 실제 결과는 VERIFICATION_V22_9_57.md가 연결하는 외부 FINAL_REPORT를 정본으로 사용합니다.

## V22.9.56 검증 방법

`npm run validate:import-mapping`의 새 행동 회귀 407개를 기존 하한 18,085개에 더해 18,492개를 보호합니다. 기존 검사와 manifest 경로는 삭제하지 않습니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_56.sha256입니다.

`npm run validate:import-mapping-native -- --out <저장소 밖 경로> --sheetjs <로컬 0.20.3 스크립트>`는 실제 Chrome DOM/키보드/파일/HTTP/Worker/메모리 RPC를 검사합니다. `npm run measure:import-mapping -- --boundaries --out <증거>`는 같은 입력의 로컬 시간/메모리/분석 완전성을 측정합니다.

최종 빌드에서 일반·분류 표 부재 전체 하네스, Node 22 SQLite, 기존 V55/V54/V53 Chrome을 실행합니다. 소스/한글·공백 검증 사본/독립 리뷰 해시와 실제 수치는 VERIFICATION_V22_9_56.md의 외부 증거에 연결합니다.

## V22.9.55 검증 방법

`npm run validate:import-prerequisites`는 실제 assertion 518개를 전체 하네스에 추가합니다. 기존 하한 17,567개에 518개를 더해 18,085개를 보호하며 기존 검사를 줄이지 않습니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_55.sha256입니다.

`npm run validate:import-prerequisites-native -- --out <저장소 밖 경로> --sheetjs <로컬 0.20.3 스크립트>`는 실제 Chrome 파일 입력·키 입력·마우스/키보드·multipart·미리보기·선택·RPC/행을 검증합니다. 모듈/네이티브 FileReader 데이터의 전달 지연만 CDP 모형으로 제어합니다. OS 선택 대화상자와 클립보드, 휴대전화 검사는 아닙니다.

`npm run measure:import-prerequisites -- --repo <검증 대상> --boundaries --out <증거>`는 1/10/120/1,000행 반복 wall/process CPU·호출 수와 상한 메모리/시간을 기록합니다. Node 측정은 Cloudflare Free 한도 통과의 증거가 아닙니다. 전체 두 모드는 최종 manifest와 같은 한글·공백 사본에서 실행하고 실제 수치는 저장소 밖 FINAL_REPORT에 남깁니다.

## V22.9.54 검증 방법

기존 검사 목록에 BOT 진단 92개·관측 기간 87개·상태 177개·환급 미리보기 114개·안내 61개, 총 531개를 추가합니다. 기존 오류 주입 검사에 실제 쓰기 도달 확인 3개도 추가합니다. 하한은 17,567개이며 기존 검사와 성능 예산은 낮추지 않습니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_54.sha256이고 기존 483개 경로를 모두 포함합니다.

빌드 후 `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`를 각각 실행합니다. Node 22의 `node monitoring/test-d1.mjs`, `npm run validate:bot-safety-native -- --out <증거>`, `npm run validate:budget-privacy-native -- --out <증거>`도 실행합니다. 실제 수치·한글/공백 사본·해시·독립 리뷰·보존은 VERIFICATION_V22_9_54.md의 증거를 따릅니다. Chrome 챗봇 페이지는 실제 Worker 응답을 사용하는 합성 UI이며 카카오 앱 검증이 아닙니다.

## V22.9.53 검증 방법

`npm run validate:budget-fingerprint -- --out <저장소 밖 경로>`는 독립 JSON·Node SHA-256 기대값, 두 폼의 A/B·p1 거절·전체 행·RPC·원문 보존과 해시 실패를 검사합니다. `--repo <시작 사본>`으로 수정 전 실패를 재현합니다. 기존 D 서버 521개는 유지합니다.

`npm run validate:budget-privacy-native -- --out <저장소 밖 경로>`는 실제 Chrome 키 입력·눈 아이콘·같은 출처 두 탭과 모든 상태 영역 쓰기 시점을 확인합니다. IME·lifecycle·행 상한용 DOM 준비는 모형으로 구분합니다. 기존 Chrome D·A·V51 검사도 별도로 유지합니다.

두 독립 리뷰 뒤 전체 일반·분류 표 부재 모드와 Node.js 22 SQLite를 실행합니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_53.sha256의 483개 경로이며 기존 477개를 모두 포함합니다. 전체 하한은 17,033개입니다. 실제 결과·소스 해시·독립 리뷰는 VERIFICATION_V22_9_53.md의 증거와 FINAL_RESULT.json을 확인합니다.

## V22.9.52 검증 방법

`npm run validate:lucian-d-budget`는 독립 기대값으로 D0 호환 집계·예산 입력·직접 서버 제출·실패 보존·정확한 전체 행 집합을 검사합니다. `--out <저장소 밖 경로>`를 주면 원문 제출·저장 전후 행·소스 해시를 JSON으로 남깁니다. 새 배열·원시 200행·예약 이름 검증을 기존 최종 100행 제한과 구분합니다.

`npm run validate:lucian-d-native -- --out <저장소 밖 경로>`는 로컬 합성 HTTP 픽스처와 Chrome CDP의 실제 키 입력·문자열 삽입·좌표 클릭·폼 POST를 사용합니다. 실제 문서 전환과 응답 소비를 기다립니다. IME는 CDP 에뮬레이션, pageshow persisted=true 직접 호출은 모형으로 구분하며 실제 OS 클립보드와 실제 보조기기를 검증했다고 기록하지 않습니다.

일반·분류 표 부재 전체 하네스, 기존 Chrome 233개·113개와 Node.js 22 SQLite 84개를 별도로 실행합니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_52.sha256이며 이전 468개 경로를 모두 유지합니다. 새 JS 한 주소만 pin을 추가하며 이전 pin은 변경하지 않습니다. 실제 최종 수치와 실패 후 수정 기록은 VERIFICATION_V22_9_52.md에 기록합니다.

## V22.9.51 검증 방법

기존 Chrome 233개는 npm run validate:lucian-a-native -- --out <저장소 밖 절대 경로>로 유지합니다. 추가 여섯 묶음은 npm run validate:lucian-six-native -- --out <별도 저장소 밖 절대 경로>로 검사합니다. CDP Input.insertText·키 입력·좌표 클릭·실제 폼 제출과 응답 소비·문서 전이를 기다립니다. 클릭 좌표를 읽기 전에는 실제 유한 애니메이션과 문서 전환 완료를 기다립니다. 제품 코드에 지연을 추가하지 않습니다.

npm run validate:lucian-six-fixes는 서버 추가·수정·재시도 충돌·정확한 원 단위 환산을 검사합니다. --out <저장소 밖 경로>를 주면 제출값·저장 행과 소스 해시를 JSON으로 남깁니다. 전체 두 모드와 Node.js 22 SQLite는 별도로 실행합니다. 활성 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_51.sha256의 468개 경로이며 이전 461개 경로를 모두 유지합니다.

최종 일반·분류 표 부재 모드는 각각 16,119개이며 하한도 16,119개로 올렸습니다. Chrome은 기존 233개와 추가 113개, SQLite는 84개입니다. 제출값·실제 행·독립 리뷰·소스 해시는 VERIFICATION_V22_9_51.md를 확인합니다. 실제 뒤로 가기와 BFCache cache-hit를 구분하고, no-store 등의 미복원 사유가 있으면 cache-hit를 통과로 기록하지 않습니다.

## V22.9.50 검증 방법

`npm run validate:lucian-a`는 기존 72개와 제공 Worker 자산을 사용하는 새 계약 검사 140개를 실행합니다. `npm run validate:lucian-a-native -- --out <저장소 밖 절대 경로>`는 실제 Chrome의 Input.insertText·키 입력·좌표 클릭을 사용합니다. 이 검사는 합성 이벤트로 금액을 교체하지 않으며 입력 직후 상태를 확인합니다. 초안·자산·저장 완료는 조건을 관찰하여 기다립니다.

현재 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_50.sha256의 461개 경로입니다. V22.9.49의 454개 경로를 모두 유지하고 이전 manifest 자체와 새 도구·검사·기록을 추가했습니다. 전체 하한은 15,940개이며 이전 하한을 낮추지 않았습니다. 일반·분류 표 부재 모드를 각각 실행하고 Node.js 22 SQLite 검사와 Chrome을 별도로 기록합니다. 실제 전체 검사는 일반·분류 표 부재에서 각각 15,942개·15,942개, Chrome 233개·SQLite 84개입니다. 최종 결과는 VERIFICATION_V22_9_50.md를 확인합니다.

## V22.9.49 검증 방법

현재 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_49.sha256의 454개 경로이며 선행 수정의 446개 경로를 보존합니다. `npm run validate:lucian-a`는 실제 제공 자산으로 입력값·결과 버튼·초점·금액 변경·오류·예산 안내·지연 자산을 검사합니다. 공용 파서와 초안은 `npm run validate:input-prerequisites`로 함께 확인합니다. 일반·분류 표 부재 전체 하네스는 각각 15,785개·15,785개이며 하한은 15,783개입니다. 해시·Chrome 219개·SQLite 84개와 실기기 경계는 VERIFICATION_V22_9_49.md에 기록합니다.

## V22.9.48 검증 방법

현재 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_48.sha256의 446개 경로입니다. B의 440개 경로를 모두 보호합니다. `npm run validate:input-prerequisites`는 공용 파서·실제 서버 쓰기 거절과 사용자 분류·직렬화 런타임·실제 초안 복원 함수를 검증합니다. 전체 하네스는 일반·분류 표 부재 모드를 각각 실행합니다. 실제 개수·해시·Chrome와 SQLite 결과는 VERIFICATION_V22_9_48.md에 기록합니다. 실기기와 운영 확인은 자동 검증과 구분합니다.

## V22.9.47 검증 방법

현재 manifest는 BUNDLE_FILE_CHECKSUMS_V22_9_47.sha256의 440개 경로이며 기존 430개 경로를 모두 보존합니다. B 전용 검사 161개, 직렬화 함수·모듈·새 불변 자산 검사를 포함한 전체 하한은 15,390개입니다.

`npm run validate:lucian-b`는 실제 메모리 RPC와 직렬화된 클라이언트의 대기·취소·재조회·초점을 검사합니다. 독립 리뷰에서 발견한 모달 접근, 정책 문구, 관련 없는 BFCache 재로드, 별도 거래 수정 화면의 요청 복원 회귀도 포함합니다. 최종 단계에서는 `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`를 각각 실행합니다. Node.js 22의 SQLite 84개 검사와 실제 Chrome 상호작용 검사는 별도로 기록합니다. 운영·실기기는 자동 통과로 간주하지 않습니다.

검증 원본·소스 SHA-256·바이트·건수는 VERIFICATION_V22_9_47.md를 확인합니다.

## V22.9.45 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_45.sha256`의 422개 경로입니다. 직전 415개 경로를 보존하고 새 검사기·판 문서 3개·직전 manifest·감사·인계 문서 2개를 더합니다. 새 회귀 검사는 224개이며 전체 하한은 15,005개입니다.

`npm run validate:audit-hotfix`는 B-1·C-1·G-1·G-18·G-16의 회귀를 검사합니다. 항목별 `--case=` 검사로 수정 전 실패와 수정 후 통과를 확인합니다. `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`를 각각 실행하며 Node.js 22의 `node monitoring/test-d1.mjs`를 별도로 실행합니다. 실제 개수와 소스 SHA-256은 `VERIFICATION_V22_9_45.md`에 기록합니다.

## V22.9.44 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_44.sha256`의 415개 경로입니다. V22.9.43의 410개 경로를 보존하고 새 파일 5개를 더했습니다: 검사기 1개, 판 문서 3개, 직전 manifest. 일반·분류 표 부재 모드 각각 14,781개, Node.js v22.23.1 SQLite 84개가 통과했습니다.

`npm run validate:kakao-latency`는 다음을 공식 카카오 요청 모양으로 검사합니다(36개).

- 방 기록의 잠금 4종·순서와 준비 쓰기 없음
- 100ms 지연에서의 순차 깊이 예산
- 응답 예산 먼저 답하기·중복 방지·뒤에서 마치기·실제 지연 기록
- `waitUntil`이 없을 때의 평소 답
- 소스 계약

## V22.9.43 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_43.sha256`의 410개 경로입니다.

- V22.9.41의 404개 경로(운영 V22.9.42의 399개를 모두 포함)를 보존합니다.
- 새 파일 6개를 더했습니다: 검사기 1개, 판 문서 3개, 직전 manifest 2개.

일반·분류 표 부재 모드 각각 14,745개, Node.js v22.23.1 SQLite 84개가 통과했습니다. `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`를 실행합니다.

`npm run validate:room-autojoin`은 156개를 검사합니다.

- 연결된 단톡방의 승인 없는 참여와 승인 대기 승격, 방 재연결
- 보호: 나간 사람·내보낸 사람, 조회 전용·이용 제한, 인증 없는 요청
- 소유자의 구성원 권한(카카오·웹)
- 기록만일 때 카카오·웹 수정 차단과 기록 추가 허용
- 권한을 읽지 못할 때 막힌 쪽 동작
- 가계부 삭제 때 권한 줄 정리
- 공식 가이드 모양 요청(`chat.properties.botGroupKey`)의 새 방 준비·참여와 수상한 키 거절
- 소스 계약

## V22.9.41 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_41.sha256`의 404개 경로이며 V22.9.40의 399개 경로를 모두 보존하고 새 파일 5개(검사기 1개·판 문서 3개·직전 manifest)를 더합니다. 일반·분류 표 부재 모드 각각 14,573개, Node.js v22.23.1 SQLite 84개가 통과했습니다. `node .codex/scripts/verify-repository.mjs`와 `npm run validate:categories-absent`로 확인합니다.

`npm run validate:admin-return`은 세션 없는 관리자 전용 화면의 `return_to` 복귀, 로그인 폼·로그인 뒤 복귀, 옛 관리자 화면의 인라인 내비 스타일과 사용자 화면의 불변을 검사합니다(55개).

## V22.9.40 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_40.sha256`의 399개 경로이며 V22.9.39의 386개 경로를 모두 보존하고 새 파일 13개(검사기 5개·패키지 기록 4개·판 문서 3개·직전 manifest)를 더합니다. 일반·분류 표 부재 모드 각각 14,517개, Node.js v22.23.1 SQLite 84개가 통과했습니다. `node .codex/scripts/verify-repository.mjs`와 `--categories-absent` 모드를 모두 실행하고 실제 개수를 `VERIFICATION_V22_9_40.md`에 기록합니다. Node.js 22에서 `node monitoring/test-d1.mjs`도 별도로 실행합니다.

`npm run validate:polish`는 화면 다듬기·감사 잔여(U9·U10·H11·D14), `npm run validate:ads-gate`는 광고 게이트(기본 review 바이트 동일·live 허용 화면만 광고), `npm run validate:www-canonical`은 www → 정본 308(CANONICAL_REDIRECT 무관), `npm run validate:ui-perf`는 리포트 기간 내비게이터·셸 CSS 최신 규칙·Link preload 머리·홈 Speculation-Rules 머리, `npm run validate:public-articles`는 생활비 가이드 글 12편의 길이·고유성·링크·검색 메타를 확인합니다.

아래 이전 버전의 수치는 해당 시점 기록입니다.

## V22.9.39 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_39.sha256`의 386개 경로이며 V22.9.38의 380개 경로를 모두 보존하고 새 파일 6개를 더합니다. 일반·분류 표 부재 모드 각각 10,846개, Node.js v22.23.1 SQLite 84개가 통과했습니다. `node .codex/scripts/verify-repository.mjs`와 `--categories-absent` 모드를 모두 실행하고 실제 개수를 `VERIFICATION_V22_9_39.md`에 기록합니다. Node.js 22에서 `node monitoring/test-d1.mjs`도 별도로 실행합니다.

`npm run validate:public-guides`는 공개 문서·HEAD·리디렉션·noindex·메타데이터·가상 계산과 입력 처리를 확인합니다. `npm run preview:public`은 익명 문서만 여는 로컬 서버입니다. 공개 UI는 브라우저에서 390px·1280px로 확인하고 저장소 밖에 증거를 보관합니다. 로그인·실제 거래·외부 전송을 이 미리보기에서 수행하지 않습니다.

아래 이전 버전의 수치는 해당 시점 기록입니다.

## V22.9.38 검증 방법

현재 manifest는 `BUNDLE_FILE_CHECKSUMS_V22_9_38.sha256`의 380개 경로이며, 전체 하네스 하한은 9,591개입니다. 일반·부재 모드 각각 9,591개와 Node.js v22.23.1 SQLite 84개를 통과했습니다. 아래 이전 버전의 수치는 해당 시점 기록입니다.

`node .codex/scripts/verify-repository.mjs`와 `node .codex/scripts/verify-repository.mjs --categories-absent`를 모두 실행합니다. 부재 모드는 분류 REST의 모든 메서드에 404/PGRST205를 반환하며, 정상 표 동작 양성 사례와 모드 시험만 명시적으로 존재 모드를 선택합니다. CI는 OS와 표 모드의 4개 조합입니다.

브라우저 검증은 `node tools/screen-audit.mjs --out <저장소 밖 절대 경로> --pages budgets,settings,reserve,reports,reportsWeek,menu --width 390 --shots --interactions`를 사용합니다. 1280px도 확인합니다. 출력 폴더 아래의 snap 경로인지 검증한 뒤에만 기존 스냅샷을 정리합니다. 결과·정확한 해시와 검사 수는 `VERIFICATION_V22_9_38.md`에 기록합니다.

## V22.9.37의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_37.sha256`의 372개 파일을 사용하고, 자동 검사 하한은 9,453개입니다.

- **묶음별 검사:** `npm run validate:audit-batch`(A·B·C·D, 579개)와 `npm run validate:monitor-alerts`(48개). 묶음 C 의 검사는 `AB_AUDIT_SOFT=1`로 실패를 모아 볼 수 있습니다(재현 확인용).
- **관제:** `node monitoring/test-d1.mjs`(SQLite, 84개)는 Node.js 22 에서 따로 돌립니다. `npx wrangler deploy --config monitoring/wrangler.jsonc --dry-run`으로 번들을 확인합니다.
- **화면 실측:** `node tools/screen-audit.mjs --pages login,startGuide,home,menu --schemes light,dark --shots`로 다크 로그인 대비(U4)를 봅니다.
- **교훈:** 네 묶음을 병렬로 고칠 때 모듈 소유를 나누고 `src/index.js`는 통합에서 다시 빌드했습니다. 해시로 고정된 화면(`renderMyAnalysisHtml`)과 검사가 글자 그대로 박아 둔 호출 문자열(`renderUnifiedNav("stats", …`)은 통합에서 되돌리거나 자리를 옮겼습니다.

## V22.9.36의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_36.sha256`의 357개 파일을 사용하고, 자동 검사 하한은 8,795개입니다.

- **운영 조건 흉내:** 새 검사 `validate-kakao-category-fallback-v22936`는 `intercept`로 `accountbook_categories` 조회에 PostgREST 404(PGRST205)·503 을 돌려주어, 운영처럼 표가 없는 조건에서 카카오 새 기록이 저장되는지 봅니다. `npm run validate:kakao-category-fallback`.
- **교훈:** `/ready`가 "선택 표 없음"을 알려 왔는데도 픽스처에는 표가 있어 아무 검사도 그 조건을 보지 않았습니다. 운영과 픽스처가 다른 점은 목록으로 두고 검사에서 흉내 냅니다.

## V22.9.35의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_35.sha256`의 352개 파일을 사용하고, 자동 검사 하한은 8,769개입니다.

- **운영 런타임 상한:** `validation/qa-fixture.mjs`는 불러오는 순간 `SubtleCrypto`의 `deriveBits`·`deriveKey`에 Cloudflare Workers 와 같은 PBKDF2 상한(100,000)을 겁니다. 상한을 넘는 요청은 `NotSupportedError`로 거절됩니다.
- **새 검사:** `npm run validate:signup-kdf`가 상한 아래의 가입·로그인·관리자 비밀번호 변경과 소스의 반복 횟수를 확인합니다.
- **교훈:** Node 에서 통과한 런타임 동작(암호화 상한, CPU 시간)은 Workers 운영의 근거가 되지 않습니다. 운영 런타임에만 있는 제한은 픽스처에 흉내를 넣어 검사합니다.

## V22.9.34의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_34.sha256`의 348개 파일을 사용하고, 자동 검사 하한은 8,744개입니다.

**새 검사**
- 새 검사 6개는 `validation/lib-audit-v22934.mjs`의 공용 도구를 씁니다.
- `npm run validate:audit-fixes`로 한 번에 실행합니다.

**픽스처**
- 같은 기본 키로 거래를 넣으면 409(23505)로 거절합니다(`db.__strict_primary_keys = false`로 끌 수 있습니다).
- `db.__lose_next_transaction_response`로 "저장은 되고 응답만 잃는" 상황을 만듭니다.

**원형 오염 정적 검사**
- `validate-proto-safety-v22934`가 저장소 안의 acorn 으로 `src/modules`를 읽습니다.
- 빈 객체 맵을 계산된 키로 쓰는 곳을 찾으면 실패합니다.

**바뀐 문장 확인**
- 소스 바이트를 바꾼 판이므로 `node tools/compare-worker-statements.mjs <V22.9.33 src/index.js> src/index.js`로 바뀐 최상위 문장을 확인합니다.

## V22.9.33의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_33.sha256`의 337개 파일을 사용하고, 자동 검사 하한은 8,452개입니다.

새 검사 `validate-qa-fixes-v22933.mjs`(52개)는 보고서 결함 B01~B09 와 웹 수정 폼(T1)을 실제 경로로 재현합니다. T1 부분은 픽스처의 `db.__honor_select = true`로 운영 PostgREST 처럼 select 한 칸만 돌려받습니다.

소스 바이트를 바꾼 판이므로 `node tools/compare-worker-statements.mjs <V22.9.32 src/index.js> src/index.js`로 바뀐 최상위 문장을 확인합니다.

## V22.9.32의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_32.sha256`의 332개 파일을 사용하고 자동 검사 하한은 8,394개입니다. 이전 199개 경로를 보존하고 모듈·도구·검증·계획 문서 133개를 더했습니다. 하네스는 먼저 빌드 동일성(모듈 → `src/index.js`)을 보고, 이어서 모듈 단독 문법·import/export 표시, 클라이언트 직렬화 자체 완결, 초기화 순서, 배포 스크립트(가짜 Cloudflare API)를 확인합니다.

모듈을 고친 뒤에는 `npm run build:worker`로 표시와 `src/index.js`를 함께 갱신합니다. 소스 바이트를 바꾸는 정리라면 `node tools/compare-worker-statements.mjs <이전 src/index.js> src/index.js --allow-changed <이름>`으로 의도한 문장만 바뀌었는지 PR에서 확인합니다. `node monitoring/test-d1.mjs`의 SQLite 45개는 Node.js 22에서 별도로 실행합니다. 배포 스크립트의 실제 API 동작은 하네스가 아니라 운영 적용 기록에서 확인합니다.

## V22.9.31의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_31.sha256`의 199개 파일을 사용하고 자동 검사 하한은 8,000개입니다. 이전 7,079개 기준을 낮추지 않고 승인된 그룹 정책 단언 1개와 새 공동방 runtime 859개를 추가했습니다. 과거 manifest와 불변 자산 바이트는 보존합니다.

`npm run validate:group-first`는 실제 합성 Skill 요청과 PostgREST/작업 임대 모사로 같은 사용자의 A/B/C 동일 발화, 같은 방의 두 사용자·동시 첫 입력·실제 거래 저장, 역할 관리·수동 승인, 무인증/legacy 경계, strict/malformed/null 읽기, 단계별 unknown/late write, 저장 중 bind/unbind/leave/purge 경합과 나가기·삭제 후 차단을 확인합니다. 첫1·3·25건은 NLU background를 수집하여 실제 fetch를 세고 50회를 넘으면 거절합니다.

그룹·보안·UX·성능·개인 첫 기록·개인 호출 예산을 먼저 실행한 뒤 `node .codex/scripts/verify-repository.mjs`를 실행합니다. `node monitoring/test-d1.mjs`의 SQLite 45개는 Node.js 22에서 별도로 실행하고 실제 버전을 기록합니다. 최종 결과·동결 hash·운영 미확인 항목은 `VERIFICATION_V22_9_31.md`에 기록합니다. 실제 Supabase·카카오·5초 latency·엣지 CPU와 만료 후 원격 commit은 합성 통과로 주장하지 않습니다.

아래에는 이전 버전의 검증 기록을 보존합니다.

## V22.9.27의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_27.sha256`의 174개 파일을 사용하며 자동 검사 하한은 5,662개입니다.
신규 `validation/validate-prelogin-preview-v22927.mjs` 73개는 로그인 전 가상 기능 미리보기, 기존 로그인·가입·`return_to`, 로그인·가입·OAuth 오류 순서와 focusable 입력 대상·단일 alert·가입 열림 상태, 기본 CTA의 기본·hover·focus 흰 글자, no-store·CSP·쿠키 없음, 48KiB HTML 예산, Help·메뉴 URL 없음, 신규·기존 웹 명령의 단일 URL, 그룹 QuickReplies 금지를 확인합니다.
전체 하네스 5,662개·체크섬 174개와 운영 소스 일치, /health·/ready·정적 자산 16개·80개, 공개 응답의 1440px·390px 격리 렌더를 부모 작업에서 확인했습니다. 결과는 `VERIFICATION_V22_9_27.md`에 기록합니다. SQLite·실기기·실제 인증 왕복·Kakao 앱 확인을 자동 통과로 보지 않으며 채널 홈은 기존 카드를 읽기 전용 확인한 범위만 기록합니다.

## V22.9.26의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_26.sha256`의 170개 파일을 사용하며 자동 검사 하한은 5,589개입니다.
라우터 await·안전 실패 회귀 검사 47개, 출시 점검 수정(카카오·인증·시간·가져오기·예산·헤더) 83개, 코드리뷰 후속 125개와 cold/warm 직렬 깊이 보호 6개를 포함합니다. 독립 메모리 픽스처가 Supabase 503·네트워크 끊김·레이트리밋 거부를 흉내 내며 실제 DB에 연결하지 않습니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 하네스 밖에서 별도로 실행하고 실제 실행 시점의 소스 해시와 Node.js 버전을 기록합니다. 결과는 `VERIFICATION_V22_9_26.md`에 기록합니다.

## V22.9.25의 검증 방법

당시 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_25.sha256`을 사용했으며 자동 검사 하한은 5,327개였습니다.
홈·거래 상세·가져오기 회귀 검사 42개를 추가했습니다. `npm run audit:uiux`는 설치된 Chrome 또는 Edge에서 독립 메모리 픽스처를 사용합니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 별도로 실행합니다. 결과는 `VERIFICATION_V22_9_25.md`에 기록합니다.
사용자 승인 후 앱 V22.9.25를 운영에 배포했으며 공개 검사 116개, 운영 소스 일치와 설정 보존을 확인했습니다. 배포 ID와 남은 수동 검증도 같은 문서에 기록합니다.

## V22.9.24

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_24.sha256`을 사용하며 자동 검사 하한은 5,285개입니다.
신규 설정 범위·취소·관제 SSO·DB 부분 지표 검사 121개를 포함합니다.
`node monitoring/test-d1.mjs`는 Node.js 22 SQLite 메모리 검증 45개를 별도로 수행합니다.
공개 배포 검사는 현재 릴리스 소스에서 자산 주소를 읽어 운영 자산의 바이트까지 비교합니다.
운영 배포 ID와 실제 점검 결과, 남은 수동 검증은 `VERIFICATION_V22_9_24.md`에 기록합니다.

## V22.9.23의 검증 기록

당시 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_23.sha256`을 사용했으며 자동 검사 하한은 5,164개였습니다.
이름 구분자·역할 표시·immutable 자산·반응형 레이아웃·Workers 런타임·실제 공급자 지표 회귀 37개를 추가했습니다.
브라우저 감사와 Node.js 22 SQLite 45개 검사는 별도로 실행합니다. 최신 기록은 `VERIFICATION_V22_9_23.md`입니다.

아래에는 이전 버전의 기록을 보존합니다.

## V22.9.22 종합 관제

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_22.sha256`을 사용하며 자동 검사 하한은 5,127개입니다.
관제 인증·허용 목록·수집 장애·리소스 한도 83개를 추가했습니다. Node.js 22에서는
`node monitoring/test-d1.mjs`로 실제 SQLite의 45개 검사를 별도로 실행합니다.
Wrangler 사전 검사는 실제 운영 수집 성공을 의미하지 않습니다. 최신 결과는 `VERIFICATION_V22_9_22.md`에 기록합니다.
아래 내용은 이전 검증 기록입니다.

# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다.
현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_20.sha256`의 V22.9.20 파일 133개와
자동 검사 4,966개 이상, Worker 문법, ESM 진입점, Git 공백 오류를 확인합니다.
이름·도메인·카카오 콜백 전환과 월초·월말 하루 환산 검사가 포함됩니다.
운영 점검은 `00_READ_FIRST_V22_9_20.md`와 `RELEASE-CHECKLIST.md`를 따릅니다.
아래 상세 목록은 V22.8.78 당시의 검증 기록이며 최신 검사 수는 하네스 실행 결과로 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_74.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 카드사 가져오기·로그인 대기·영수증 제거 110개
4. 카카오 그룹 22개
5. 카카오 수정·삭제·복구 V4 130개
6. 가계부·운영 보안 89개
7. 참여자 역할 스키마 20개
8. UX·분석 보호 56개
9. 사용자 화면·홈 버튼·테마·성능 161개
10. AdSense 심사·V2·UI V5 공통 셸 262개
11. UI V5 권한·범위·저장 안정화 41개
12. 핵심 쓰기·권한 스모크 110개
13. UI/UX 1~4단계 218개
14. 리포트 대시보드 UX 60개
15. 홈 우측 기록·챌린지 보정 68개
16. 챌린지·최근 기록 UI/UX 76개
17. 계정·런타임 신뢰성 16개
18. 기능·UI 신뢰성 48개
19. 모바일 화면 보정 69개
20. 모바일 전체 탭 점검 102개
21. 앱 아이콘 자원 38개
22. 웹 매니페스트 64개
23. 테마 글자 대비 49개
24. 거래 삭제 동작 15개
25. 역할별 화면·빈 상태 203개
26. 조작 영역·접근성 278개
27. 카카오 메모·중복 방지 57개
28. 금액 파싱 77개
29. 수정·삭제·복구 왕복 58개
30. 본문 바로가기 178개
31. 스킬 인증·삭제 SQL 49개
32. 예산 재검토·다크 대비 18개
33. ESM import와 `default.fetch`
34. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 2,691개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 카드사 가져오기·로그인 대기 | `npm run validate:card-import` |
| 카카오 | `npm run validate:kakao-group` |
| 카카오 수정·복구 | `npm run validate:kakao-edit` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| 참여자 역할 스키마 | `npm run validate:member-role-schema` |
| UX·분석 보호 | `npm run validate:ux-principles` |
| 접근성 테마·홈 셸·성능 | `npm run validate:performance` |
| AdSense 심사·V2·UI V5 공통 셸 | `npm run validate:adsense-v2` |
| UI V5 권한·범위·저장 안정화 | `npm run validate:v5` |
| 핵심 쓰기·권한 스모크 | `npm run validate:core-write` |
| UI/UX 1단계 | `npm run validate:uiux-stage1` |
| UI/UX 2단계 | `npm run validate:uiux-stage2` |
| UI/UX 3단계 | `npm run validate:uiux-stage3` |
| UI/UX 4단계 | `npm run validate:uiux-stage4` |
| 리포트 대시보드 UX | `npm run validate:report-dashboard` |
| 홈 우측 기록·챌린지 보정 | `npm run validate:home-rail-challenge` |
| 챌린지·최근 기록 UI/UX | `npm run validate:challenge-activity-ux` |
| 계정·런타임 신뢰성 | `npm run validate:account-runtime` |
| 기능·UI 신뢰성 | `npm run validate:functional-ui` |
| 모바일 화면 보정 | `npm run validate:mobile-surface` |
| 모바일 전체 탭 점검 | `npm run validate:mobile-audit` |
| 앱 아이콘 자원 | `npm run validate:app-icon` |
| 웹 매니페스트 | `npm run validate:web-manifest` |
| 테마 글자 대비 | `npm run validate:theme-contrast` |
| 거래 삭제 동작 | `npm run validate:tx-delete` |
| 역할별 화면·빈 상태 | `npm run validate:role-surface` |
| 조작 영역·접근성 | `npm run validate:tap-target` |
| 카카오 메모·중복 방지 | `npm run validate:kakao-memo` |
| 금액 파싱 | `npm run validate:amount-parse` |
| 수정·삭제·복구 왕복 | `npm run validate:edit-restore` |
| 본문 바로가기 | `npm run validate:skip-to-content` |
| 스킬 인증·삭제 SQL | `npm run validate:skill-auth-purge` |
| 예산 재검토·다크 대비 | `npm run validate:budget-dark-contrast` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, `/health`·`/ready`, 챌린지 인라인 저장, 신규 계정 생성·재로그인과 실기기 반응형·모바일 화면은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. V22.8.78에는 신규 SQL이 없으며 기존 V22.6.8·V22.7.0·V22.7.1과 V22.8.46 SQL은 다시 실행하지 않습니다.
## V22.9.30

현재 정본은 `BUNDLE_FILE_CHECKSUMS_V22_9_30.sha256`의 195개와 동적으로 합산하는 `.codex/scripts/verify-repository.mjs`의 실측 7,079개입니다. `npm test` 또는 `node .codex/scripts/verify-repository.mjs`로 실행하며 Node22를 사용합니다. 새 audit-corrections378, startup-budget40, import-cron477과 main sister-link44가 전체 하네스에 포함됩니다. 기존 검사와 checksum coverage를 줄이지 않습니다.

SQLite45는 실제 Node.js v22.23.1에서 별도로 확인했고 CI도 Node22 Ubuntu/Windows에서 실행하도록 준비했습니다. 운영·실기기 결과와 코드 검증은 `VERIFICATION_V22_9_30.md`와 `docs/ASIDE_V22_9_30.md`에 구분합니다. `.agents` 스킬의 제거된 receipt 명령과 오래된 count는 범위 밖으로 보고하며 현재 package scripts/하네스 결과를 따릅니다.
