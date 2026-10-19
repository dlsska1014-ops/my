# V22.9.53 예산 저장·자동 안내 검증 기록

작업 폴더는 `D:/Github_Kakao_Account/my-lucian-d-budget`, 브랜치는 `codex/lucian-d-budget`, 버전은 `V22.9.53-LUCIAN-D-BUDGET-SAFETY`입니다. 시작 HEAD는 `bd41cca8efc1af9182d49328ee08d026ea9d9943`이며 새 커밋은 만들지 않습니다. 기존 작업 폴더·로컬 태그에서 V53 사용 이력이 없음을 확인했습니다.

시작 V52 소스 SHA-256은 `50c421542b8d4e882e5f7639bcfdb39b1b8f746345e677bc86fbd1ffa2b400fa`이며 지시문과 일치했습니다. Git 상태·변경/미추적 목록·diff·staged diff·HEAD bundle과 786개 파일의 복구 사본은 `D:/CodexRecovery/lucian-d-budget-fix-20261015-171821`에 보존했습니다. `my-lucian-a` 777개와 `my-lucian-a-prereq` 755개의 시작 해시도 같은 폴더에 있습니다. 기존 V52 검증 기록과 독립 검토 자료는 수정하지 않습니다.

이번 증거 폴더는 `D:/Github_Kakao_Account/review-artifacts/lucian-uxui-2026-10-15/D-budget-fix-v22953-171821`입니다. 아래 상대 증거 경로는 이 폴더를 기준으로 합니다. 구현 작성자는 root 한 명이며 분석과 최종 리뷰는 두 읽기 전용 담당자가 수행합니다.

## P2 저장 지문

수정 전 두 폼에서 재현 A/B의 첫 저장과 오래된 제출이 모두 303으로 성공하고 교체 RPC가 2회 실행됐습니다. A의 지문은 `p1-13-4eddeb7f`, B는 `p1-27-025412e6`으로 유지됐습니다. A는 V51에도 존재한 결함이며 B는 V52에서 정상 허용한 수입·지출 조합에서도 같은 원인이 남아 있음을 보여 줍니다. 두 사례를 모두 V52 신규 결함으로 분류하지 않습니다.

변경 감지용 정규형은 `[저장 유형, 원래 분류명, 정확한 금액]` 행 배열입니다. 유형은 `income`, `expense`, `income-total`, `total`이며 원래 분류명에는 trim·normalizeText·Unicode 정규화를 적용하지 않습니다. 원문 문자열의 ordinal 비교로 분류명·유형·금액 순서대로 정렬하고 JSON 직렬화합니다. 중복 개수·0원·특수 총액 행을 그대로 유지하며 ID·생성 시각·가계부/월 메타데이터를 제외합니다. 가계부/월은 기존 인증 범위와 월별 잠금에서 검증합니다.

금액은 계수와 십진 지수로 표현합니다. `100`, `"100"`, `"0100.00"`, `"1e2"`는 `"1e2"`로 같고, 0과 음의 0은 `"0"`으로 같습니다. 정밀 소수와 큰 정수 문자열을 Number로 먼저 바꾸지 않아 다른 금액이 합쳐지지 않습니다. 숫자·숫자 문자열 이외 값, 잘못된 행과 배열은 조회 실패로 처리합니다. 정규형을 기존 Web Crypto SHA-256 유틸리티로 해시하여 `p2-`와 64자리 소문자 16진수를 발행합니다.

두 폼 생산자와 저장 검증자는 비동기 해시를 엄격 조회의 실패 처리 안에서 await합니다. 입력 계약과 공용 정규화 함수는 바꾸지 않습니다. 구형 p1·누락·잘못된 형식은 유효한 입력에서도 409 `budget_form_stale`로 거절하고, 다른 유효한 p2는 409 `budget_changed`로 거절합니다. 제출 지문을 trim하거나 새 지문으로 교환하지 않으며 원문 입력과 함께 실패 폼에 보존합니다. 사용자는 최신 저장 계획을 명시적으로 다시 열어 비교합니다.

수정 후 A/B의 첫 저장은 303·교체 RPC 1회이며 오래된 제출은 409·추가 RPC 0회입니다. A의 첫 저장 행은 `income 월급=100`이고 B는 `__income:월급=200`, `income 월급=100`입니다. 오래된 제출 뒤에도 이 전체 행 집합이 유지됩니다. 실제 제출·응답·행·RPC 수는 `after/fingerprint-final-count/fingerprint-report.json`에 기록합니다. 같은 370개 검사를 시작 사본에서 실행한 실패 144개는 `before/fingerprint-regression-final/fingerprint-report.json`에 보존합니다. 원래 재현도 `before/fingerprint-repro.json`에 있습니다.

기존 인증·권한·CSRF·명시적 범위·엄격 조회·월별 잠금·쓰기 직전 최신성·전체 교체 RPC·저장 후 정확한 행 재확인은 유지합니다. 조회 실패·잠금 충돌·쓰기 거절·응답 유실·재조회 실패는 기존 D 521개 검사에서 함께 확인합니다.

## P3 금액 가리기와 자동 안내

V52의 새 D 자동 안내는 예약 시점의 금액 문자열을 나중에 삽입했습니다. 두 폼의 실제 Chrome 입력·눈 아이콘 클릭에서 숨김 상태 이후 `1,234원`과 `-1,234원`이 들어가는 것을 재현했습니다. 이는 DOM 상태의 증거이며 실제 VoiceOver/TalkBack 발화를 확인한 것은 아닙니다.

안내는 합계와 일반 메시지를 구분하며 실제 반영 시점에 현재 숨김 상태·최신 계산 결과·리비전·IME·페이지 중단 상태를 확인합니다. 숨김 전환은 대기 합계를 취소하고 기존 합계를 일반 문구로 바꾸지만 오류의 행 번호·허용 상한·입력 안내는 유지합니다. 해제만으로 과거 합계를 재생하지 않습니다. 650ms 묶음·change/focusout의 즉시 예약·입력 계약·행 관리·초점·선택 범위를 유지합니다.

기존 `ab:amount-privacy` 이벤트를 재사용합니다. 실제 두 탭 검사에서 테마의 storage 처리와 E의 DOM 가림 처리 사이에 오래된 안내가 잠깐 남는 것을 발견했습니다. 이벤트의 등록 순서에 의존하지 않도록 HTML의 `data-ab-hide-amounts` 속성 하나만 추가 관찰합니다. 문서 하위 DOM 전체나 storage 전체를 감시하지 않습니다. 같은 상태의 반복 알림은 같은 문구를 다시 삽입하지 않습니다. pagehide는 타이머·관찰자를 정리하고 pageshow는 이전 합계를 지운 뒤 관찰을 재개하고 발화 없이 재계산합니다.

`before/privacy-transition/report.json`과 `after/original-privacy-repro/report.json`은 같은 기존 재현의 전후입니다. 새 Chrome 검사는 실제 같은 출처 두 탭과 눈 아이콘 클릭·신뢰된 storage 이벤트를 사용합니다. IME 중에는 탭 전환 자체가 조합을 확정할 수 있어 두 번째 탭의 실제 localStorage 변경으로 초점을 유지합니다. pagehide/pageshow 직접 호출과 행 상한용 DOM 준비는 모형 검사로 별도 표기합니다. 모든 상태 영역 쓰기와 당시 숨김 상태, DOM 변경·입력·합계·POST·저장 행은 `after/privacy-final-complete/report.json`에 있습니다. 최종 125/125개가 통과했고 런타임 오류는 0개입니다. 두 폼 모두 제출 원문 `8901`이 303으로 저장됐으며 전체 저장 행은 `외식=8901`입니다.

중간 실패 기록도 보존합니다. `after/privacy-first`는 두 탭에서 백그라운드 rAF가 멈춘 도구 문제이며 브라우저 전경 전환과 테스트 전용 백그라운드 제한 해제로 보완했습니다. `privacy-second`·`privacy-third`는 실제 storage 전환 순서와 IME 탭 전환을 드러냈습니다. 좁은 속성 관찰을 적용한 `privacy-attribute`는 109/109를 통과했습니다. 확장 검사의 `privacy-final`·`privacy-row-cap-probe`에서는 직접 복제한 행을 계산 상태에 반영하지 않아 blur 때 안내가 추가되면서 클릭 대상이 이동했습니다. 모형 준비 후 기존 input 이벤트로 동기화하여 최종 125개를 통과했으며 제품 코드는 추가로 바꾸지 않았습니다. 검사 삭제나 오류 무시는 하지 않았습니다.

## 자산과 보호 범위

변경된 D 런타임만 `/assets/accountbook-budget-preview-v22953.js`로 제공합니다. 새 자산은 24,071바이트이며 SHA-256은 `63cc3b79b6549d57f73312109fb5589d7c0a71c644bdf41f93d65f1ae749af1c`입니다. V52 D 본문을 historical 자산에 고정하고 기존 47개 pin을 유지합니다. E·테마 자산을 다시 발행하지 않습니다. 과거 불변 응답의 본문·헤더·ETag와 pin 비교는 `artifact-comparison.json`, 페이지 크기·요청 비교는 `performance-comparison.json`을 확인합니다.

최종 생성 파일 SHA-256은 `0d20bc76e1abebdab746dbef9c465d0b76cb3492ef7c43366c4c3975519a0370`이며 5,731,096바이트입니다. 모듈 119개를 `npm run build:worker`로 연결했습니다. 생성 파일 직접 편집·D0 매핑·입력 계약·가져오기·C 분석·전체 감사·새 화면 개편·설정 자동 저장은 수행하지 않았습니다.

## 최종 검증과 완료 판정

새 지문 검사 370개, 설정 안전 검사 57개(기존 대비 p1 거절 8개 추가), 기존 D 서버 검사 521개와 새 pin 검사 3개를 전체 하네스에 포함합니다. 전체 하한은 기존 16,652개에서 17,033개로 올리며 과거 체크섬 경로 477개를 모두 보존합니다. 서버 검사는 전체 검사 수에 다시 더하지 않습니다.

두 독립 읽기 전용 리뷰는 같은 최종 소스를 검토했고 차단할 결함이 없다고 판단했습니다. P2 담당자는 지문 370개·설정 안전 57개·추가 경계값 46개를 독립 실행했습니다. P3 담당자는 125개 Chrome 기록·실제 storage·입력 및 저장 행·53개 불변 응답·47개 기존 pin을 확인했습니다. `independent-review.md`에 범위와 결과를 남깁니다. 최종 판정은 아래 실제 로그의 종료 코드·검사 수·소스 해시로 확인합니다. 로그의 동명 JSON에는 명령·시작/종료 시각·종료 코드·현재 작업본 소스 SHA-256이 있습니다. 시작 사본을 대상으로 한 검사의 대상 해시는 해당 보고서 안에 별도로 기록됩니다.

| 검증 | 명령과 증거 |
|---|---|
| 지문 370개 | `npm run validate:budget-fingerprint -- --out <증거>/after/fingerprint-final-count`, `fingerprint-final-count.log` |
| 기존 D 서버 521개 | `npm run validate:lucian-d-budget -- --out <증거>/after/server`, `server-final.log` |
| 신규 privacy Chrome 125개 | `npm run validate:budget-privacy-native -- --out <증거>/after/privacy-final-complete`, `privacy-final-complete.log` |
| 기존 Chrome D·A·V51 | `validate:lucian-d-native`, `validate:lucian-a-native`, `validate:lucian-six-native`; `native-d.log`, `native-a.log`, `native-six.log` |
| 일반 전체 | `node .codex/scripts/verify-repository.mjs`, `verify-present.log` |
| 분류 표 부재 전체 | `npm run validate:categories-absent`, `verify-absent.log` |
| SQLite 메모리 | Node.js v22.23.1의 `node monitoring/test-d1.mjs`, `sqlite.log` |
| 독립 리뷰·보존·최종 파일 | `independent-review.md`, `artifact-comparison.json`, 복구 폴더의 `final-changes.json`·`final-manifest.json` |

실제 완료 수치와 `repository-complete` 판정은 증거 폴더의 `FINAL_RESULT.json`에 기록합니다. Git diff와 스테이징 공백·빌드 동일성·직렬화·ESM 진입점·불변 자산 검사를 통과해야 완료입니다.

iOS Safari·Android Chrome·카카오톡 인앱·OS 클립보드·VoiceOver/TalkBack·실제 BFCache `persisted=true` 복원은 [수동 확인](docs/ASIDE_V22_9_53.md)으로 남습니다. 개인 HTML의 no-store를 유지합니다. 커밋·푸시·PR·병합·업로드·배포·운영 SQL·스키마/RLS/RPC 정의·환경변수·Secret·외부 콘솔 변경은 실행하지 않습니다.
