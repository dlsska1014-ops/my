# V22.6.8 마이그레이션 가이드

## 권장 순서

1. Cloudflare Worker 소스와 Supabase 운영 데이터를 백업합니다.
2. 쓰기가 적은 시간대를 선택합니다.
3. `OPERATIONS_DATA_INTEGRITY_AUDIT_V22_6_8.sql`을 조회 전용으로 실행해 결과를 저장합니다.
4. 중복 후보가 있으면 실제 거래·참여·계정 관계를 확인하고 보존할 행을 사람이 결정합니다. 이 번들은 자동 삭제 SQL을 제공하지 않습니다.
5. 중복 결과가 0행인지 다시 확인합니다. 소유자 없음/다수와 고아 데이터는 별도 복구 대상으로 기록합니다.
6. `schema_v22_6_8_operations_integrity.sql` 전체를 실행합니다. 트랜잭션 안에서 실행되며 조건 위반 시 전체가 롤백됩니다.
7. 아래 확인 SQL로 인덱스와 RPC를 확인합니다.
8. `src/index.js`를 배포하고 `/health`와 Cron 수동 테스트를 진행합니다.

## 적용 확인 SQL

```sql
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'accountbook_settings_key_unique_v2268',
    'users_kakao_user_key_unique_v2268',
    'household_members_household_user_unique_v2268',
    'households_invite_code_unique_v2268',
    'transactions_receipt_fingerprint_unique_v2268',
    'transactions_recurring_identity_unique_v2268'
  )
order by indexname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('accountbook_claim_operation', 'accountbook_release_operation')
order by routine_name;
```

인덱스 6개와 함수 2개가 보여야 합니다.

## Worker 확인

```text
GET /health
GET /cron/recurring/apply?key=CRON_SECRET&month=YYYY-MM&today=YYYY-MM-DD
GET /cron/reports/generate?key=CRON_SECRET&today=YYYY-MM-DD
```

- `/health`: 버전 `V22.6.8-OPERATIONS-DATA-INTEGRITY`, 무결성 프로필 `atomic-dedup-and-cron-lease`
- Cron: `lock_mode: database`, `failed: 0`
- 같은 Cron 동시 호출: 한 실행만 처리되고 다른 응답은 `skipped_run: true`
- 같은 영수증 연속 저장: 거래 1건, 두 번째 요청은 중복 안내
- 같은 정산 완료 연속 저장: 완료 이력 1건

## 실패 시

- 감사 SQL 결과가 남아 있으면 마이그레이션을 강제로 우회하지 않습니다.
- 마이그레이션이 중단되면 트랜잭션이 롤백됐는지 확인하고 원인을 정리한 뒤 처음부터 다시 실행합니다.
- Worker가 `memory-fallback`을 반환하면 RPC 이름, 서비스 역할 권한, Supabase 스키마 캐시를 확인합니다.
- 새 Worker에 문제가 있으면 V22.6.7 Worker로 되돌릴 수 있습니다. 추가된 고유 인덱스와 잠금 테이블은 기존 Worker 쓰기를 방해하지 않으므로 즉시 제거하지 않습니다.
- 고유 인덱스 제거 또는 잠금 테이블 삭제는 중복 방어를 약화시키는 파괴적 조치이므로 별도 백업·승인 없이 실행하지 않습니다.

