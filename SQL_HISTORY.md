## V22.9.69 SQL 판단

설명서 허브 변경에는 SQL·스키마·RPC·환경변수·Secret 변경이 없습니다.

## V22.9.67 SQL 판단

버튼 이름·흐름 반복 방지·안내 축약에는 SQL·스키마·RPC·환경변수·Secret 변경이 없습니다.

## V22.9.65 SQL 판단

버튼형 사용 설명서에는 SQL·스키마·RPC·환경변수·Secret 변경이 없습니다.

## V22.9.64 SQL 판단

단톡방 입장 문구·버튼 순서 변경에는 SQL·스키마·RPC·환경변수·Secret 변경이 없습니다.

## V22.9.63 SQL 판단

브랜드·공개 푸터 링크 수정에는 SQL·스키마·RPC·환경변수·Secret 변경이 없습니다. 2026-10-19 운영 Worker 배포에서도 DB migration을 실행하지 않았습니다.

## V22.9.62 SQL 판단

대출 표시 수정에는 SQL 변경이 없습니다. 2026-10-18에 적용한 V61 수명주기 migration을 재실행하거나 되돌리지 않습니다. 잔존 테스트 계정 정리는 별도 승인·대상 검증을 거치는 데이터 정리 작업이며 이 릴리스의 migration이 아닙니다.

## V22.9.61-LIFECYCLE-INTEGRATION 독립 배포 준비본

기존 관제는 유지하고 V61 필수 DB 계약과 복구 준비를 먼저 진행합니다. 이 사본은 my-lucian-contract-v61의 실제 파일 863개를 보존 복사한 별도 배포 준비본입니다. 원본 후보는 변경하지 않았습니다.

전환 모드는 일반 서비스입니다. hold는 /health 외 HTTP와 모든 scheduled 업무를 차단합니다. probe도 일반 요청과 scheduled를 차단하며, 명시적 점검 헤더와 기존 관리자 인증이 함께 있는 HTTP 요청만 원래 인증·CSRF·업무 처리로 전달합니다. 관리자 인증을 우회하거나 다른 사용자의 권한을 추가하지 않습니다. 최종 main 승격이 일반 서비스 재개 동작입니다.

전환용 소스의 변경은 router 진입점 차단과 버전 표기뿐입니다. 이를 제거하면 동결 원본 Worker 바이트와 일치하는지 생성 과정에서 확인합니다. 준비본을 만든 사실은 운영 적용 완료를 의미하지 않습니다. 실제 결과와 SQL·순서·복구·배포 조건은 D:/Github_Kakao_Account/review-artifacts/v61-release-preparation-2026-10-17의 인계 자료를 따릅니다.

## V22.9.61 SQL 상태

별도 V61 후보에서 V60의 실제 파일 853개를 승계하고 새 수명주기 RPC를 Worker에 연결했습니다. 소속 등록·전체 expected 텍스트 CAS·일반/관리자 가져오기·생성 실패 보상 삭제·가져온 거래의 카카오 복구를 대조했습니다. 삭제는 전체 저장값 확인과 조건부 완료 뒤 새 purge를 호출하며 import metadata를 별도 HTTP로 삭제하지 않습니다. 원문·토큰이 없고 값도 확인되지 않은 pending은 자동 해제하지 않습니다.

수명주기 SQL은 승인된 로컬 합성 PostgreSQL에서 검증하는 별도 계약입니다. 구형 관리자 REST 출처 backup_import_v19_3도 직접 쓰기 차단에 포함하며, 새 계약의 삭제 취소는 두 가져오기 출처와 원래 ID를 보존합니다. V60 원본과 이전 증거를 수정하지 않았습니다. 운영 SQL·업로드·배포·커밋·푸시는 실행하지 않았습니다. 운영 적용안은 전체 스키마·전환 조건 확인 전까지 실행을 차단합니다. V61 호환 복구 후보를 사용하며 V44로 단순 복귀하지 않습니다. 정본은 docs/codex/LIFECYCLE_INTEGRATION_V22_9_61.md와 외부 RESULT.json입니다.

## V22.9.60 SQL 상태

이 후보는 R2 SQL과 대출 이력 합계 회귀를 반영한 로컬 준비본입니다. R1 제안은 대체되었으며 운영 적용 대상이 아닙니다. R2는 별도 승인으로 격리 PostgreSQL 17.11에서 검증되었지만 운영 DB는 변경하지 않았습니다. 정본은 `docs/codex/CONTRACT_PREPARATION_V22_9_60.md`입니다. 가져오기·삭제의 DB 원자성 제안은 아직 Worker에 연결하지 않았습니다. 이 후보를 운영에 배포하지 않습니다. SQL 검증, Worker 연결과 복구 후보, 최종 회귀, 운영 CPU·실기기 검증이 남아 있습니다.

## V22.9.59 (local · 검토문만 작성)

저장된 v2280 정의의 잔액 검증 블록만 바꾸어 loan·credit_card에 음수를 허용하고 절댓값 9조원 상한을 유지하는 검토 SQL, 원상복구문, 카탈로그 확인문과 적용·실패 대응 절차를 docs/db-review/v22959에 작성했습니다. 줄바꿈 정규화 외 다른 함수 본문·권한·search_path·이력 계약은 유지합니다. 실제 SQL이나 업무 RPC를 실행하지 않았고 RLS·GRANT·환경변수·Secret을 변경하지 않았습니다. 가계부 삭제와 가져오기 상태의 DB 원자성 확장은 설계 검토로만 남깁니다.

## V22.9.58 (local)

SQL·스키마·RPC 정의·RLS·GRANT·인덱스·운영 데이터 변경이나 실행이 없습니다. 관측 계산은 기존 거래 GET의 메타데이터와 메모리 계산을 재사용합니다. 예산/정기 strict 배열 검증만 보강하며 전역 optionalSupabase나 정기 저장·Cron·last_applied_month를 변경하지 않습니다. 정산 완료는 기존 settings RMW 경로이며 새 완료 RPC나 환급 영속 저장을 추가하지 않습니다.

## V22.9.57 (local)

SQL·스키마·RPC 정의·RLS·GRANT·인덱스·운영 데이터와 설정을 변경하거나 실행하지 않습니다. 분석 전용 거래 GET의 동일 요청에 Prefer: count=exact를 사용합니다. 정확한 집계의 DB 비용과 동시 변경 한계를 기록하며 별도 HEAD/COUNT, 운영 max-rows 변경, 새 집계 RPC를 추가하지 않습니다.

## V22.9.56 (local)

새 SQL/RPC/테이블은 만들거나 실행하지 않습니다. V55의 원본별 accountbook_settings 키를 유지하며 같은 가계부 임대와 revision 조건으로 preview 상태·매핑 해시/리비전·기준일·사용 여부만 추가합니다. 원본 텍스트/파일/샘플은 영속 상태에 저장하지 않습니다. 이미 사용했거나 pending인 원본의 보호 상태를 만료나 화면 이동으로 초기화하지 않습니다.

## V22.9.55 (local)

SQL·스키마·RLS·GRANT·RPC 정의·인덱스 변경과 실행은 없습니다. 가져오기는 기존 원자적 RPC를 사용합니다. 결과 불명확 원본의 고정 ID/저장값 해시는 기존 accountbook_settings의 my_import_source_v22955 키로 관리하며 원문을 보관하지 않습니다.

## V22.9.54

SQL 실행과 스키마·RLS·GRANT·RPC 정의·인덱스 변경은 없습니다. 기존 설정·잠금 계약은 외부 fetch를 차단한 메모리 픽스처에서만 검증합니다. 환급 연결에는 DB 수명주기와 완료 최신성을 함께 검증하는 계약이 필요하지만 이번에는 SQL을 작성하거나 적용하지 않습니다. 알려진 nlu_failure_samples 정리는 mock DELETE로만 확인합니다. unrecognized_inputs에는 새 삭제 경로를 추가하지 않습니다.

## V22.9.53

운영 SQL 실행과 스키마·RLS·GRANT·RPC 정의·인덱스 변경은 없습니다. 기존 교체 RPC와 잠금 정의를 그대로 사용하며 로컬 합성 RPC와 SQLite 메모리 검증만 수행합니다.

## V22.9.52

SQL 실행과 스키마·RLS·GRANT·RPC 정의·인덱스 변경은 없습니다. 기존 accountbook_replace_budget_plan_v227을 합성 메모리 픽스처에서 호출합니다. 정상 응답 뒤 같은 대상의 정확한 행 집합을 엄격하게 확인하며 실제 사용자 데이터는 사용하지 않습니다.

## V22.9.51

SQL 실행과 스키마·RLS·GRANT·RPC·인덱스 변경이 없습니다. 기존 로컬 픽스처와 저장 경로만 사용합니다.

## V22.9.50

SQL·스키마·RLS·GRANT·RPC·인덱스 변경과 실행이 없습니다. 기존 거래 저장 경로와 권한 계약을 유지합니다.

## V22.9.49

SQL·스키마·RLS·GRANT·RPC·인덱스 변경과 실행이 없습니다. 입력 UI는 기존 거래 저장 경로와 V22.9.48의 분류 조회를 사용합니다.

## V22.9.48

SQL·스키마·RLS·GRANT·RPC·인덱스 변경과 실행이 없습니다. 기존 REST 조회·설정·분류 로직을 재사용하며 새 저장소나 분류 표를 만들지 않습니다.

## V22.9.47

SQL·스키마·RPC·RLS·GRANT·인덱스를 변경하거나 실행하지 않았습니다. 기존 accountbook_delete_transaction_v227의 deleted=true·id 응답 계약을 그대로 사용하며 QA 픽스처만 기존 계약에 맞췄습니다. 거래 존재 확인은 같은 가계부·정확한 ID의 기존 transactions 읽기 경로를 사용합니다.

## V22.9.45

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 운영 SQL을 실행하지 않았으며 V22.8.46 적용 완료 SQL을 재실행하지 않습니다. 선택 분류 표 부재 상태의 설정 분류 대체를 유지합니다.

## V22.9.44

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 응답 예산과 방 기록 경로의 조회 순서만 바뀝니다.

## V22.9.43

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다.

- 구성원 권한은 기존 `accountbook_settings`에 `household_member_policy_v22943:<가계부 ID>` 한 줄로 저장합니다. 가계부를 삭제하면 Worker가 이 줄을 지웁니다.
- 단톡방 자동 참여는 기존 `household_members`에 `member` 행을 넣거나 `pending`을 `member`로 바꿉니다.
- `household_members.role` 허용값(V22.8.46)은 바꾸지 않았습니다.

## V22.9.41

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 관리자 로그인 복귀와 옛 관리자 화면 내비 스타일은 데이터베이스를 바꾸지 않습니다.

## V22.9.40

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 광고 게이트·생활비 가이드 글·www 정본·관제 알림 채널은 데이터베이스를 바꾸지 않습니다.

## V22.9.39

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 가상 체험과 익명 공개 가이드 검증은 데이터베이스를 읽거나 쓰지 않습니다. 실제 금융 기록을 생성·수정·삭제하지 않았습니다.

## V22.9.38

SQL·스키마·RPC·RLS·GRANT·인덱스 변경은 없습니다. 카드 목표는 기존 `accountbook_settings`의 가계부별 키를 사용합니다. 삭제 RPC 뒤의 추가 키 정리는 Worker에서 같은 설정 잠금 안에 수행하며, 추가 DELETE 실패는 정리 대기 이벤트로 기록합니다. 실제 데이터베이스에는 연결하거나 쓰지 않았습니다.

## V22.9.27

DB 스키마·SQL·RPC·RLS·GRANT·인덱스 변경은 없습니다.
로그인 전 미리보기는 정적 가상 HTML이며 DB 읽기와 쓰기를 수행하지 않습니다. 운영 수동 `accountbook_apply_recurring_v227`의 29~31일 SQL 복원은 이번 범위에서 하지 않습니다.

## V22.9.26

DB 스키마·SQL·RPC·RLS·GRANT·인덱스 변경은 없습니다.
새 회귀 검사는 독립 메모리 픽스처에서 Supabase 503 응답을 흉내 내며 실제 DB에는 연결하지 않습니다.

## V22.9.25

DB 스키마·SQL·RPC·RLS·GRANT·인덱스 변경은 없습니다.
가져오기 회귀 검증에 기존 원자적 가져오기 RPC의 선택적 모형을 추가했습니다.
이 모형은 독립 메모리 픽스처에서만 동작하며 실제 DB에는 연결하지 않습니다.

## V22.9.24

신규 SQL·스키마·RLS·GRANT·RPC·인덱스 변경은 없습니다.
합성 픽스처와 SQLite 메모리에서만 검증하며 실제 거래 데이터와 운영 DB를 변경하지 않습니다.
V22.9.23에서 적용한 관제 D1 스키마는 재실행할 필요가 없습니다.

## V22.9.23

2026-10-01: 신규 관제 D1 `malhaebook-monitor`에 `monitoring/schema.sql`과 동일한
테이블 5개·인덱스 1개를 Cloudflare Console에서 적용하고 sqlite_master로 확인했습니다.
기존 Supabase 테이블과 실제 거래 데이터는 변경하지 않았습니다.

아래에는 이전 버전의 기록을 보존합니다.

## V22.9.22 종합 관제

- Supabase 스키마·RLS·RPC·인덱스 변경은 없습니다.
- 신규 관제 전용 D1의 테이블과 인덱스를 `monitoring/schema.sql`로 준비했습니다.
- 로컬 메모리 SQLite에서만 적용·검증했으며 운영 D1 SQL은 아직 실행하지 않았습니다.
- 승인 후 신규 저장소에만 적용하며 사용자 거래 테이블에 적용하지 않습니다.

# SQL 적용 이력과 현재 판정

## V22.9.21

- 신규 SQL·스키마·RLS·RPC·인덱스 변경은 없습니다.
- Worker의 상태 조회 실패 처리와 중복 확인 동시성만 변경합니다.
- 실제 사용자 데이터 정리나 재생성은 수행하지 않습니다.

## V22.9.20

- 신규 SQL·스키마·RLS·RPC·인덱스 변경은 없습니다.
- 이름·공개 도메인·카카오 콜백 설정을 전환하며 기존 사용자와 가계부 데이터를 유지합니다.
- DB 변경 없이 검증된 `src/index.js` 전체로 교체합니다.
- 운영 변수와 외부 콘솔 적용 순서는 `00_READ_FIRST_V22_9_20.md`를 따릅니다.

## V22.8 기록

V22.8.x 절 36개는 2026-10-19 에 `docs/archive/SQL_HISTORY_V22_8.md` 로 옮겼습니다.

## 최근 버전

| 버전 | 업데이트 때 SQL 실행 | 비고 |
|---|---:|---|
| V22.8.20 | 없음 | 카카오 수정·삭제·복구 V4·웹 인라인 피드백 |
| V22.8.19 | 없음 | 전체 색상·대비 회귀 보정 |
| V22.8.17 | 없음 | AdSense 심사 안전·V2 홈/달력/분석 UX |
| V22.8.16 | 없음 | 사용자 화면 전체 대비 |
| V22.8.15 | 없음 | 다크 인증 화면 대비 |
| V22.8.14 | 없음 | 홈 전체 조회 버튼 대비 |
| V22.8.13 | 없음 | 다크모드 전체 보정 |
| V22.8.12 | 없음 | 접근성 테마·대비 |
| V22.8.11 | 없음 | 홈 UX 셸 확장 |
| V22.8.10 | 없음 | 홈 성능·공통 자원 |
| V22.8.9 | 없음 | 계정·가계부 보안 분리 |
| V22.8.8 | 없음 | UX 피드백 |
| V22.8.7 | 없음 | 카카오 그룹 응답 |
| V22.8.6 | 없음 | 영수증 안정화 |
| V22.8.5 | 없음 | 모바일 접근·메뉴 |
| V22.8.4 | 없음 | UI·성능 재검증 |
| V22.8.3 | 없음 | 안정화 병합 |
| V22.8.2 | 없음 | 인증 안정화 |
| V22.8.1 | 없음 | UI·UX 개편 |
| V22.8.0 | 있음 | 자산·결제수단 기반 스키마 |

과거 SQL 원본은 과거 배포본의 신규 설치·장애 복구 자료입니다. V22.8.20 적용을 위해 실행하지 않습니다. 성능 인덱스는 운영 행 수와 실행 계획에서 병목이 확인될 때만 별도 버전으로 검토합니다.
## V22.9.37 판단

감사 결함 묶음은 Worker 코드만 바꿉니다. 새 SQL 은 없습니다.

- 카카오 삭제·수정이 기존 감사 RPC(`accountbook_delete_transaction_v227`, `accountbook_update_transaction_v227`)를 타면서 `accountbook_transaction_audit.actor_kind`에 새 값 `kakao`가 쌓입니다. 이 열에는 제약이 없습니다.
- 수동 정기 반영은 자격 없는 지출자 규칙이 섞였을 때만 기존 RPC 대신 규칙별 삽입을 씁니다(새 RPC 없음).
- 관제 D1 은 기존 `settings` 표에 `alert:*` 행을 더 씁니다(스키마 변경 없음).

## V22.9.36 판단

카카오 분류 표 대체는 Worker 코드만 바꿉니다. 새 SQL 은 없습니다.

- `accountbook_categories` 표는 운영 DB 에 없는 선택 표이며 이 판에서도 만들지 않습니다. 사용자 분류는 `accountbook_settings`의 `custom_categories:<가계부>`·`category_keywords:<가계부>`로 충분합니다.
- 표 존재 여부와 카카오 기록 수는 읽기 전용 조회로 확인합니다(`docs/ASIDE_V22_9_36.md` 2절).

## V22.9.35 판단

가입 해시 수정은 Worker 코드만 바꿉니다. 새 SQL 은 없습니다.

- 새 해시의 반복 횟수는 100,000 입니다. `accountbook_create_local_user_v227`·`accountbook_set_local_identity_v227`는 `p_credential_iterations`가 100,000 이상이면 받으므로 그대로 씁니다.
- 기존 로컬 계정의 반복 횟수 분포와 V22.9.34 점검 계정이 생기지 않았는지는 읽기 전용 조회로 확인합니다(`docs/ASIDE_V22_9_35.md` 2절).

## V22.9.34 판단

감사 결함 수정은 Worker 코드와 1년 캐시 자산 주소만 바꿉니다. 새 SQL·스키마·인덱스·RLS·GRANT·RPC 는 없습니다.

- 웹 빠른 입력과 카카오 새 기록은 서버가 정한 UUID 를 `transactions.id`로 넣고 `on_conflict=id`(ignore-duplicates)로 중복을 무시합니다. 운영 표가 명시적 id 를 받는지 배포 전에 읽기 전용으로 확인합니다(`docs/ASIDE_V22_9_34.md` 2절).
- 가져오기·기록 수정·예산 계획의 잠금은 기존 `accountbook_operation_locks`를 씁니다(`transaction-import:<가계부>`, `transaction-edit:<기록>`, `budget-plan:<가계부>:<월>`).
- SQL 이 있으면 더 나은 방식(수정 RPC 의 비교 후 저장, `client_request_id` 칸, 가져오기 RPC 안의 잠금)은 `docs/codex/AUDIT_FINDINGS_V22_9_34.md`에 기록만 했습니다.

## V22.9.33 판단

QA 결함 수정은 Worker 코드와 1년 캐시 자산 주소만 바꿉니다. 새 SQL·스키마·인덱스·RLS·GRANT·RPC 가 없고 기존 SQL 파일을 그대로 보존합니다. 즐겨찾기·거래 수정 이력의 읽기-수정-쓰기는 기존 `accountbook_operation_locks` 기반 가계부 설정 잠금(`withHouseholdSettingsRmw`)을 씁니다.

## V22.9.32 판단

모듈 분리와 배포 스크립트는 저장소 구조와 배포 절차만 바꿉니다. 새 SQL·스키마·인덱스·RLS·GRANT·RPC가 없고, 기존 `01_FIX_RECURRING_MONTH_END_V22_9_29.sql`과 rollback 파일을 그대로 보존합니다. 배포 스크립트는 Cloudflare Workers API만 호출하며 Supabase에 접근하지 않습니다.

## V22.9.31 판단

공동방 첫 기록은 기존 settings의 UNIQUE key, household_members의 UNIQUE(household_id,user_id)와 작업 임대 RPC를 재사용하므로 새 SQL·스키마·인덱스·RLS·GRANT·RPC 변경을 추가하지 않습니다. 자동 참여의 ignore-duplicates INSERT는 기존 제한 역할을 덮어쓰지 않습니다. done/retired/나가기 표식은 기존 V22.8.71 purge의 명시적 설정 prefix 밖에 있으므로 삭제 이후에도 보존합니다. 합성 fixture는 이 실제 prefix 규칙을 모사하며 임의 household ID substring 전체를 삭제하지 않습니다.

기존 `01_FIX_RECURRING_MONTH_END_V22_9_29.sql`과 `02_ROLLBACK_RECURRING_MONTH_END_V22_9_29.sql`을 그대로 보존합니다. 적용 여부 확인과 별도 승인된 정기 forward 함수의 SQL-first 순서를 마친 뒤 V22.9.31 Worker 전체를 교체합니다. 이 작업에서는 SQL·라이브 금융 쓰기·운영 콘솔 변경을 실행하지 않습니다.

## V22.9.30 판단

새 SQL·schema·index를 만들거나 실행하지 않았습니다. V22.9.29의 `01_FIX_RECURRING_MONTH_END_V22_9_29.sql`과 `02_ROLLBACK_RECURRING_MONTH_END_V22_9_29.sql`을 그대로 보존했습니다. 별도 승인된 forward 함수 하나를 먼저 적용한 뒤 V22.9.30 Worker 전체를 교체해야 합니다. 테이블/금융 행/기존 반영월/ACL 변경을 추가하지 않습니다.

기존 users/security FK nesting, 실제 RLS/ACL·RPC 정의와 legacy-only 계정 수는 읽기 전용 metadata/집계 점검으로 확인합니다. 정의가 없는 RPC나 baseline dump를 추정해 생성하지 않습니다. 실제 dump/복구는 `docs/BACKUP_RECOVERY_RUNBOOK.md`의 별도 운영 작업입니다.
