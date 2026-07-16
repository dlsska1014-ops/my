# V22.7 마이그레이션 가이드

## 적용 전

1. 현재 Cloudflare Worker 소스와 환경변수 목록을 백업합니다.
2. Supabase 전체 데이터 또는 최소한 `users`, `households`, `household_members`, `transactions`, `accountbook_settings`, `accountbook_budgets`, `accountbook_recurring`을 백업합니다.
3. `OPERATIONS_DATA_INTEGRITY_AUDIT_V22_6_8.sql`을 조회 전용으로 실행합니다.
4. V22.6.8 마이그레이션을 적용하지 않았다면 `schema_v22_6_8_operations_integrity.sql`을 먼저 적용합니다.
5. 중복 설정 키, 중복 참여행, 소유자 없음·다수, 고아 거래가 있으면 운영 데이터 검토 후 정리합니다.

## 적용 순서

1. Supabase SQL Editor에서 `schema_v22_7_0_auth_atomicity.sql` 전체를 한 번 실행합니다.
2. 실행 결과가 `COMMIT`인지 확인합니다. 중간 오류가 있으면 전체 트랜잭션이 롤백되므로 Worker를 먼저 배포하지 않습니다.
3. 아래 필수 Secret을 운영 고유값으로 설정합니다.

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_SESSION_SECRET`
   - `USER_SESSION_SECRET`
   - `ADMIN_API_TOKEN`
   - `MY_IMPORT_TOKEN_SECRET`

4. DB 관리자 비밀번호가 아직 없을 때만 `ADMIN_PASSWORD`를 최초 부트스트랩용으로 유지합니다.
5. `src/index.js`를 Worker에 배포합니다.
6. `/health`에서 버전 `V22.7.0-AUTH-ATOMICITY-STABILITY`를 확인합니다.
7. `/ready`가 200이고 `ready: true`인지 확인합니다.

## 생성되는 보안 테이블

- `accountbook_user_identities`: 로컬·카카오 로그인 연결
- `accountbook_user_security`: 사용자 세션 버전
- `accountbook_admin_security`: 관리자 비밀번호와 세션 버전
- `accountbook_auth_attempts`: 인증 시도 제한
- `accountbook_transaction_audit`: 거래 수정·삭제 감사

모든 신규 테이블은 RLS를 활성화하고 public/anon/authenticated 권한을 제거합니다. V22.7 함수 실행 권한은 `service_role`에만 부여합니다.

## 함수 적용 확인

마이그레이션에는 총 13개 함수가 있습니다.

- `accountbook_auth_attempt`
- `accountbook_create_local_user_v227`
- `accountbook_set_local_identity_v227`
- `accountbook_link_kakao_identity_v227`
- `accountbook_purge_household_v227`
- `accountbook_replace_budget_plan_v227`
- `accountbook_apply_recurring_v227`
- `accountbook_merge_users_v227`
- `accountbook_update_transaction_v227`
- `accountbook_delete_transaction_v227`
- `accountbook_bulk_transactions_v227`
- `accountbook_import_transactions_v227`
- `accountbook_leave_household_v227`

## 배포 후 데이터 확인

1. 기존 카카오 계정으로 로그인하고 기존 가계부 목록이 그대로 보이는지 확인합니다.
2. 개인 비밀번호를 저장한 뒤 같은 가계부 옵션 화면으로 복귀하는지 확인합니다.
3. 테스트 거래의 지출자를 변경하고 `accountbook_transaction_audit`에 update 행이 생기는지 확인합니다.
4. 백업 CSV의 `지출자` 열에는 이름만 있고 UUID가 없는지 확인합니다.
5. 미리보기 가져오기 후 선택한 행만 저장되고 같은 토큰 재전송이 중복 저장되지 않는지 확인합니다.
6. 테스트 가계부 삭제 후 관련 거래·설정·리포트·카카오 임시 상태가 남지 않는지 확인합니다.

## 롤백

- 오류가 있으면 새 쓰기를 중지하고 V22.7 배포 전 Worker 소스로 되돌립니다.
- 신규 테이블이나 함수를 즉시 DROP하지 않습니다. 데이터·세션 연동 상태를 확인한 뒤 별도 변경 계획으로 제거합니다.
- V22.7에서 비밀번호를 변경한 계정은 이전 Worker의 약한 호환 저장 방식과 다를 수 있으므로 로그인 복구 테스트 없이 코드만 롤백하지 않습니다.
- 데이터가 변경된 뒤에는 배포 전 백업과 거래 감사 로그를 기준으로 복원 범위를 결정합니다.
