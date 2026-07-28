# migrations/ — Supabase 스키마·RPC 참조 (P0-1)

이 디렉터리는 **운영 배포 전 안정화 지침서(P0-1)** 의 요구사항인
"코드가 의존하는 Supabase RPC/테이블을 문서로 확보한다"를 위한 **참조 자료**입니다.

## ⚠️ 매우 중요 — 이 SQL을 그대로 실행하지 마세요

`RPC_SIGNATURES_INFERRED.sql` 은 `src/index.js` 의 **호출 지점(call-site)에서
역설계(reverse-engineer)** 한 것입니다. 즉:

- 함수 **이름과 인자 이름**은 코드가 실제로 보내는 값이라 신뢰할 수 있습니다.
- 그러나 **인자 타입, 반환 타입, 함수 본문(로직), RLS, 트랜잭션 처리**는
  코드에서 100% 복원할 수 없습니다. SQL 파일의 타입은 **추정치**이며
  `-- INFERRED` 로 표시되어 있습니다.
- 이 추정 DDL을 운영 DB에 `CREATE OR REPLACE FUNCTION` 하면 **기존 함수 로직을
  덮어써서 데이터 정합성·보안(RLS 우회 등)을 깨뜨릴 수 있습니다.**

## 정본(authoritative) DDL 확보 방법

실제 운영 스키마의 정본은 **살아있는 Supabase DB에서 직접 추출**해야 합니다.

```sh
# 1) 스키마 전체(함수 본문 포함) 덤프 — 데이터는 제외
pg_dump \
  --schema-only \
  --no-owner --no-privileges \
  --schema=public \
  "$SUPABASE_DB_URL" > migrations/0001_baseline_schema.sql

# 2) 함수만 확인하고 싶을 때 (psql)
\df+ public.accountbook_*
```

> Supabase 대시보드 → Database → Functions 에서도 각 함수의 정의를 볼 수 있습니다.
> `SUPABASE_DB_URL` 은 Project Settings → Database → Connection string (URI) 입니다.

정본 덤프를 `0001_baseline_schema.sql` 로 커밋하면, 이후 스키마 변경은
번호가 매겨진 마이그레이션(`0002_*.sql` …)으로 관리하면 됩니다.

## 코드가 의존하는 RPC 목록 (19개)

`/ready` 헬스체크(P0-2)가 아래 중 **핵심 4개**의 존재를 점검합니다:

- `accountbook_set_local_identity_v227`
- `accountbook_create_local_user_v227`
- `accountbook_update_transaction_v227`
- `accountbook_delete_transaction_v227`

전체 목록과 인자는 `RPC_SIGNATURES_INFERRED.sql` 참조.

## 코드가 의존하는 주요 테이블

REST(PostgREST)로 직접 접근하는 테이블(대표):

- `transactions`, `households`, `household_members`
- `accountbook_user_identities`, `accountbook_user_security`, `accountbook_admin_security`
- `accountbook_transaction_audit`, `accountbook_settings`
- `accountbook_payment_assets`, `accountbook_recurring_rules`
- `accountbook_ops_events`, `accountbook_nlu_*`

정확한 컬럼·제약·RLS 는 위 `pg_dump` 결과를 정본으로 삼으세요.
