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

## `/ready` 가 점검하는 것 (V22.9.76 기준)

정본은 코드다: `src/modules/runtime/config-readiness.js` 의 `READINESS_CORE_RPCS`(핵심 RPC 16개),
`READINESS_ALTERNATIVE_RPC_GROUPS`(둘 중 하나만 있으면 되는 자산 RPC), `READINESS_REQUIRED_TABLES`(필수 표 13개),
`READINESS_OPTIONAL_TABLES`(대체 경로가 있는 `accountbook_categories`). 이 문서에 목록을 옮겨 적지 않는다(V22.9.44 감사 G-14:
옛 목록은 ‘핵심 4개’와 없는 표 이름을 적고 있었다).

코드가 부르는 RPC 의 이름·인자는 `RPC_SIGNATURES_INFERRED.sql` 에 있지만 **추정**이다.
V22.9.44 감사 G-13 이 짚은 3개(`accountbook_mutate_payment_assets_v2280`·`record_nlu_metric`·`record_nlu_failure_sample`)는
2026-10-23 운영 DB 에서 읽기만 해서 받은 정의를 `RPC_DEFINITIONS_PROD_2026_10_23.sql` 에 두었다(V22.9.78). 이 파일도 **실행 금지**다.
운영 함수를 바꾸면 새 마이그레이션 파일을 따로 만들고 이 사본을 다시 받는다. 나머지 함수 본문은 아직 저장소에 없으니
운영 DB 에서 아래 `pg_dump --schema-only` 결과를 받아 정본으로 삼는다.

## 코드가 REST 로 직접 읽고 쓰는 표 (2026-10-21 grep)

`transactions`, `households`, `household_members`, `users`, `accountbook_settings`, `accountbook_budgets`, `accountbook_recurring`,
`accountbook_categories`, `accountbook_user_identities`, `accountbook_user_security`, `accountbook_admin_security`,
`accountbook_meme_cards`, `nlu_failure_samples`, `nlu_intent_metrics_hourly`. 감사·잠금·로그인 시도 표
(`accountbook_transaction_audit`, `accountbook_operation_locks`, `accountbook_auth_attempts`)는 RPC 를 거쳐 쓰고 `/ready` 가 존재를 확인한다.
다시 셀 때: `grep -rhoE '/rest/v1/[a-z_0-9]+' src/modules | sort -u`.

정확한 컬럼·제약·RLS 는 위 `pg_dump` 결과를 정본으로 삼으세요.
