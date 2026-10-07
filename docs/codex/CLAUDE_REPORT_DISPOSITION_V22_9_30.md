# Claude V22.9.28 점검 리포트 처리 기록

기준은 사용자가 전달한 2026-10-07 리포트입니다. 주장의 심각도와 운영 추정은 그대로 확정된 사실로 취급하지 않습니다. `FIXED`는 코드와 합성 회귀에서 확인한 수정, `ALREADY-FIXED`는 보존한 V22.9.29 수정, `MANUAL-PENDING`은 운영 증거/승인/실제 실행이 필요한 항목, `DEFERRED`는 이번 수정에서 해결하지 않은 범위입니다. 운영 적용 완료라는 뜻으로 `FIXED`를 사용하지 않습니다.

## P1

| 항목 | 상태 | 처리·근거·남은 조건 |
|---|---|---|
| P1-1 자격 변경 후 삭제 재인증 우회 | FIXED | 현재 강한 비밀번호 또는 5분 credential-change 증명을 요구합니다. 기존 Kakao ID 재확인/방금 사용한 1회용 개인 웹 코드만 증명을 발급합니다. 단순 세션, 다른 사용자/용도/ID, 만료·폐기된 version은 거부합니다. 카카오 인앱의 강제 재인증은 외부 Chrome/Safari로 안내합니다. |
| P1-2 첫 사용자 Free 한도 | MANUAL-PENDING | 외부 호출 57회를 첫1/3/25건 총47/46/47회로 줄였고 50회 모사에서 모두 저장·완료 metadata와 NLU background를 확인했습니다. PBKDF2 210,000회와 실제 엣지 CPU1102/iteration 상한은 운영 지표로 확정해야 합니다. Paid 전환은 실행하지 않았습니다. |
| P1-3 큰 금액 분할 | FIXED | 쉼표·천/백+만·억·복합 단위와 한글 금액을 동일 scanner로 읽습니다. 서버/실제 immutable client에 같은 함수를 사용합니다. 애매한 1,5만, 전화·날짜·시간·인원·퍼센트는 금액으로 저장하지 않습니다. 응답은 날짜·종류·건수·합계를 보여줍니다. |
| P1-4 수입/지출 반전 | FIXED | 부분 문자열 대신 명확한 단서와 받은 문맥을 적용합니다. 이자카야/대출이자/무이자/월급날/수입맥주와 판매·받음 예시를 검증했고 금액을 임의로 만들지 않습니다. 사용자가 명시한 구분은 유지합니다. |
| P1-5 DB backup | MANUAL-PENDING | `docs/BACKUP_RECOVERY_RUNBOOK.md`를 준비했습니다. 실제 dump/외부 보관/복구 시험/예약·Pro 선택은 하지 않았습니다. schema-only 또는 앱 CSV를 전체 backup으로 판단하지 않습니다. |
| P1-6 예산 기준 | FIXED | 기존 category-sum 우선·__total 단독 fallback을 유지하며 홈 하루 금액/초과, 카카오, 분석 실제 renderer/pace, 알림·경고에 같은 budgetedExpense 기준을 적용했습니다. 실제 소비자 fixture와 99,600/100,000 경계를 검증했습니다. |

## P2

| 항목 | 상태 | 처리·근거·남은 조건 |
|---|---|---|
| S-1 인증 횟수·timing | FIXED | UA/로그인 이름과 독립인 영구 IP admission, subject+caller 실패 횟수, 삭제/자격 비밀번호 재인증 상한을 적용합니다. 성공이 전체 IP admission을 초기화하지 않습니다. 존재하지 않는 이름도 입장 제한 뒤 같은 강도 KDF를 수행합니다. 서버 오류로 무관한 IP admission을 지우지 않습니다. |
| S-2 FNV local_web | FIXED | FNV-only 로그인·재인증과 강한 identity 덮어쓰기 fallback을 거부합니다. 가입은 기존 legacy 이름을 선점하지 않습니다. 실제 legacy-only 계정 수·소유 확인과 복구는 MANUAL-PENDING이며 금융 행은 유지합니다. |
| S-3 callback 증폭 | FIXED | 서버 서명·만료·사용자·용도에 묶인 state를 external exchange 전에 검사하고 callback IP admission을 적용합니다. cookie/query에 같은 임의 값을 넣은 요청은 exchange하지 않습니다. |
| S-4 병합한 세션 복활 | FIXED | 매 요청의 신선한 users/security snapshot으로 merged-looking 원본 토큰을 거부합니다. 이전 raw ID 토큰을 primary 세션으로 자동 복구하지 않습니다. FK nesting은 기존 관계를 사용하고 오류는 폐쇄적으로 처리합니다. |
| S-5 본문 | FIXED | 일반 폼64KiB, import16MiB의 Content-Length/실제 stream 상한, malformed400/oversize413을 적용합니다. 기존 import 파일 상한은 별도로 유지합니다. |
| K-1 날짜 | FIXED | 1월/12월 상대 월의 연도를 정규화하고 없는 날짜는 저장하지 않습니다. 내일배움카드의 부분 문자열을 날짜로 보지 않습니다. 연도 없는 M/D는 올해로 처리하며 저장 날짜를 보여줍니다. |
| K-2 예산 어순 | FIXED | 세 어순을 예산으로 처리합니다. 금액이 있는 애매한 예산 문장은 지출로 저장하지 않고 설정 안내로 돌립니다. 남은 예산 조회는 정상 유지합니다. |
| K-3 명령어 부분 문자열 | FIXED | 금액+일상 설명은 broad help/reserve/invite/nickname/query에 가로채지 않도록 합니다. 실제 수정/삭제/복구·참여·예산 명령과 날짜 접두 수정은 유지합니다. |
| K-4 숫자·마침표 | FIXED | 전화번호, compact/full date, 퍼센트·시간·인원·설명에 붙은 짧은 번호를 제외하고 종결 마침표를 허용합니다. |
| K-5 같은 행·25초과·재전송 | FIXED | 한 메시지 안 동일2건을 유지하고 한도 초과 batch는 전부 저장하지 않았다고 알립니다. 확인 후 retry는 새 저장/중복 건수를 분리합니다. 동일 메시지 database lease+일괄 duplicate read를 사용합니다. 직접 DB writer/임대 만료 뒤 이미 시작한 write까지 완전한 분산 fencing을 보장하지는 않습니다. |
| K-6 그룹 자동 pending | FIXED | 연결 그룹에서 membership이 없으면 개인 대화 참여 안내만 제공하며 pending 행을 만들지 않습니다. 그룹 응답 규격 보호를 유지합니다. |
| K-7 신규 임대·전역 JSON | DEFERRED | off/observe의 임의 신규 identity 생성은 거부했고 한 request에서 이미 확인한 별칭을 재사용합니다. global alias JSON/lease를 사용자별 정본으로 전환하려면 확인된 schema/RPC·이행 계획이 필요합니다. 전역 lease 장애와 규모 한계는 해결됐다고 표시하지 않습니다. |
| F-1 정기 수정·귀속 | FIXED | 같은 ID를 PATCH하는 수정 UI/경로로 last_applied_month를 유지합니다. blocked/pending/viewer/없는 spender의 자동 적용은 보류합니다. 직접 입력과 정기 등록을 같은 의도로 추정해 제거하지 않고 안내도 항목 ID/월 기준으로 명시합니다. |
| F-2 웹 문장 파서 | FIXED | 공유 scanner/date/type을 실제 자산에 직렬화합니다. 금액 뒤 ISO·짧은 날짜·할인·시간, 억·한글 금액과 모호한 쉼표를 검증했습니다. |
| F-3 월초 UTC | FIXED | client month fallback을 KST로 계산하고 새 immutable 주소를 사용합니다. 이전 자산 바이트는 보존합니다. |
| F-4 중복 안내·수동 분류 | FIXED | create 결과의 duplicate_skipped를 안내하고 수동 category/payment를 keyword 재분류보다 우선합니다. |
| F-5 알림·분석 숫자 | FIXED | 정기 수입 제외, 미예산 지출 제외, 전체 지출 분모의 top4 비율, 실제 금액 초과 판정/85% 경고는 수정했습니다. 두 주요 화면에서 조회 기간·월 전체 기간과 현재 달의 미래일 포함 여부를 명시했습니다. 서로 다른 기간을 같은 수치로 자동 변경하지 않았습니다. |
| I-1 가져오기 | FIXED | 명시 원화 열 우선, 외화-only 거부, 천 단위 쉼표 보존, 선택 월의 연도로 MM/DD 처리, 취소 행 확인 필요/기본 미선택을 적용합니다. 원거래 매칭·환율·취소 정산을 추정하지 않습니다. |
| U-1 이름/가입 UX | FIXED | 웹의 독립 이름 칸에서 영문·숫자5~12자를 초대코드로 거절하는 규칙은 제거했습니다. 첫 화면에 가입/로그인 anchor를 안내하고 로그인 기본·별도 가입 단계와 배치를 유지했습니다. 잘못된 초대코드는 계정 생성 완료·초대 결과를 분리하여 안내하고 이름 오류에서는 이름 필드만 HTML escape하여 복원합니다. |
| O-1 규모·무료 한도 | MANUAL-PENDING | recurring/report cursor, shared invocation50 budget, 1,001 가계부 페이지, 120건 import atomic batch 조회를 구현했습니다. 미완료는 partial이고 월말 원래 날짜를 유지합니다. 현재 Cron 빈도·큐 지연·CPU10ms·Paid/RPC 집계 선택은 운영 확인이 필요합니다. |
| O-2 릴리스 계통 | MANUAL-PENDING | main의 sister-link와 V22.9.26~29 변경을 통합했습니다. 모든 branch push/PRmain, Ubuntu/Windows Node22, SQLite45 CI를 준비했습니다. GitHub publish/main merge·remote CI 결과·branch protection/오래된 PR·branch 정리는 root/운영 확인 대상입니다. |
| O-3 재현성·설정 | MANUAL-PENDING | 실제 schema·RPC definition·FK/RLS/ACL inventory와 backup 범위를 읽기 전용 aside 절차로 준비했습니다. 없는 DDL이나 wrangler/Secrets/크론/계정 설정을 추정해 만들지 않습니다. KAKAO_SKILL_AUTH_REQUIRED 변경도 별도 승인 대상입니다. |
| D-1 방침·계정 탈퇴 | DEFERRED | 실제 처리자/이전·보호책임자·파기/연령·법적 고지와 계정 삭제는 운영 정보·제품 정책·법무 확인이 필요합니다. 현재 계정 탈퇴 endpoint가 없음을 방침에 반영하고 가계부 나가기의 거래 보존과 가계부 영구 삭제를 구분했습니다. 법률 준수 전체는 아직 확인하지 않았습니다. |
| D-2 공개 저장소 | MANUAL-PENDING | 공개 여부·LICENSE·작성자 이메일·식별자 공개 방침은 소유자 결정입니다. private 전환, history rewrite, force push 또는 비밀 설정 변경을 하지 않습니다. `.claude/`와 실제 dump는 commit하지 않습니다. |

## P3와 추가 사항

| 리포트 범위 | 상태 | 처리·사유 |
|---|---|---|
| CSP dead allowlist/unsafe-inline/camera, Web Analytics 차단 | MANUAL-PENDING | 자동 삽입·현재 CSP는 aside에서 확인합니다. 확인 없이 analytics 허용 origin을 넓히거나 외부 콘솔을 바꾸지 않습니다. |
| SheetJS SRI·공유 inline 정적화 | DEFERRED | 정확한 vendor bytes/hash·실기기 import 동작이 필요합니다. 새 core runtime의 version/바이트 pin만 갱신하고 전 화면 script 구조를 바꾸지 않습니다. |
| health/ready 공개 정보·probe 부하, Bearer CSRF 심층화 | DEFERRED | 이번 수정의 IP auth admission/body cap과 구분합니다. 공개 진단 정책·API CORS는 호환성/운영 정책 확인 후 별도로 바꿉니다. |
| admin return_to | FIXED | backslash·외부 origin을 거부하며 same-origin 경로를 유지합니다. |
| public QA/debug | DEFERRED | 기존 QA flag/admin 보호를 보존했습니다. 모든 오래된 QA/public alias 삭제는 운영 문서와 링크 inventory를 확인한 별도 범위입니다. |
| merged 이름 표지·appUserId 표시 | DEFERRED | 기존 identity/표시 이름 이행 범위를 검토해야 합니다. 새 raw merged 세션 거부로 인증 위험은 먼저 닫았습니다. |
| 삭제 후 cursor/home-layout preference | FIXED | 확인된 가계부 ID에 한정해 두 prefix를 정리합니다. cleanup 실패는 운영 event로 남기며 관계 데이터 삭제를 다시 실행하지 않습니다. |
| blocked leave/rejoin | FIXED | 차단 행을 없애는 leave를 막아 재참여로 차단을 해제하지 않습니다. 해제는 관리자 결정입니다. |
| ownership 이전·invite 회전·모든 멤버의 invite 조회 | DEFERRED | 새로운 권한·수명주기 제품 선택이며 이번 결함 수정에서 추가하지 않습니다. |
| 가계부 선택 중 입력·할인/단위·작은 부분 문자열 | DEFERRED | parser의 주요 금액/date/명령 오인은 수정했습니다. 선택 session UX와 모든 복합 할인·금액 우선순위를 완전 해결했다고 주장하지 않습니다. |
| 가계부 생성 보상 삭제 | ALREADY-FIXED | V22.9.29의 uncertain-write 재조회·확정된 거부만 보상하는 기준을 보존했습니다. |
| 정기 금액 상한·예산 bulk invalid/clamp·budget copy 덮어쓰기 | FIXED | 정기 금액20억 상한·bulk invalid/too-large 거부·current budget이 있으면 chat copy 거부를 적용했습니다. |
| favorite 동시 추가·오래된 form·goal progress | DEFERRED | 기존 lease/strict read를 보존합니다. 모든 편집 form의 revision과 지표 설계까지 확장하지 않습니다. 51번째 목표의 조용한 버림은 명시적으로 거부하도록 수정했습니다. |
| 기본 challenge 재시작 | FIXED | 조회한 월의 시작일을 기본 anchor로 사용하고 실제 설정한 기간은 유지합니다. |
| 2000 이전 연간 링크·surrogate truncation·__total 표현 | DEFERRED | 지원 연도 정책·전체 텍스트 길이 계약·category-first 정책의 용어 변경을 별도 범위로 남깁니다. |
| search/analysis 대용량 상한 | DEFERRED | search50와 추가 결과 안내는 V22.9.29를 보존했습니다. 기존 수집 상한을 없애거나 초과 결과를 전체라고 주장하지 않습니다. 분석 집계 RPC는 DEFERRED입니다. |
| 모바일 길이·터치·예산 폼 배치 | DEFERRED | 동작·44px/대비 기존 검증을 유지하며 전면 화면 재배치를 하지 않습니다. |
| canonical/sitemap/별칭·숨김 밈·dead code/긴 줄 | DEFERRED | 공개 URL 이행과 구조 정리는 별도 작업으로 남깁니다. 결함 수정과 섞어 기능/호환 경로를 제거하지 않습니다. |
| 테스트·CI·문서 drift | FIXED | runtime 회귀3개, 현실적 limiter/max-row 옵션/identity RPC fixture, Node22 engines/npm test, Windows CI/SQLite, 현재 문서·manifest를 추가했습니다. 기존 문자열 검사·브라우저 감사 전체를 대체하지 않습니다. skill의 오래된 receipt/count 문구는 범위 밖이므로 수정하지 않았습니다. |
| PBKDF2 권고·Unicode/SQL lower | DEFERRED | 강도는210,000회 유지합니다. 최신 권고·플랫폼 비용·이름 정규화 이행은 실제 운영 증거와 migration 계획을 확인해야 합니다. |

광고·후원·유료 구독·커뮤니티·결제는 제공된 수익화 분석의 맥락으로만 보존하며 활성화하지 않았습니다. 운영 backup, 비용 전환과 계정 탈퇴를 ‘무료 제공’이나 ‘후원’ 문구로 대체하지 않습니다.

## 독립 재검토에서 발견한 직접 결함

2026-10-08 KST에 실제 서버/배포 IIFE 경계에서 추가 발견된 11개 항목을 보완했습니다. 캐시백의 단위 경계·기존 수입 어휘, 외화 expense fallback과 currency 열, empty cursor의 이전 월·report execution-scope queue, 실제 서버의 짧은 날짜/내일 단어 경계, business/auth 장애 검증의 분리, UTF-8 본인 확인 문구, AUTO 금액·날짜 invalidity와 수동 수정/submit·POST 차단, 실제 분류·월·수입 기준 preview를 검증했습니다. covered 범위를 확정할 수 없으면 숫자를 추정하지 않고 저장 후 확인을 안내합니다.

첫 가계부20개 지정일31일 항목의 월 경계·unknown 결과와 report3개/최초 preference 읽기 실패 재개를 검증했고, 임대·조회 예산과 기존 HTML35KiB/44KiB를 올리지 않았습니다. 이것은 새 회귀의 코드 증거이며 운영 PostgreSQL·가입 CPU·실기기 적용을 완료했다는 뜻이 아닙니다.

최종 closure에서 남은 상대 날짜 우선순위도 수정했습니다. `3일 전/후`와 `2주 전/후`는 실제 서버·배포 IIFE·`/skill`에서 동일한 날짜로 처리하며, 공유 입력 검증은 전체 IIFE를 실행해 빠진 의존 함수로 인한 검증 오류를 해소했습니다. Chrome320·독립38의 동결 소스 증거와 마지막 상대 날짜 회귀는 `VERIFICATION_V22_9_30.md`에 구분했습니다.
