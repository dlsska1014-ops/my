# Cloudflare Cron 설정

## 목적
정기지출을 매일 한 번 확인해서 해당 월에 아직 기록되지 않은 항목을 자동으로 저장하고, 사용자가 켠 주간·월간 리포트 스냅샷도 중복 없이 생성합니다.

## 권장 Cron
```toml
[triggers]
crons = ["10 0 * * *"]
```

UTC 00:10은 한국 시간 09:10입니다.

## 수동 테스트
관리자 로그인 상태에서:

```text
/cron/recurring/apply
```

또는 Cloudflare Secret에 `CRON_SECRET`을 설정한 뒤:

```text
/cron/recurring/apply?key=YOUR_SECRET
```

## 중복 방지
- 배포 전에 `schema_v22_6_8_operations_integrity.sql`을 적용합니다.
- 정기거래와 리포트는 `accountbook_claim_operation` DB lease를 먼저 얻은 실행만 처리합니다.
- 실행 중인 같은 작업은 HTTP 200과 `skipped_run: true`, `reason: already_running`으로 종료하며 쓰지 않습니다.
- Worker가 중단되면 기본 15분 뒤 lease가 만료되어 다시 실행할 수 있습니다.
- 거래 source는 `recurring_auto`이고 원문 식별자는 `recurring:{규칙ID}:{YYYY-MM}`입니다.
- 정기지출 row의 `last_applied_month`와 거래 고유 인덱스가 월 1회 적용을 이중 보호합니다.
- 고유 인덱스 충돌은 실패가 아니라 `deduplicated`로 집계하고 적용월을 갱신합니다.
- 리포트는 `가계부 + 주기 + 대상 기간` 설정 키로 한 번만 생성합니다.
- 리포트는 자동 생성만 하며 카카오톡으로 임의 발송하지 않습니다. 사용자가 리포트 화면에서 복사·공유합니다.

정상 응답의 `lock_mode`는 `database`여야 합니다. `memory-fallback`이면 기능은 동작하지만 여러 Worker 인스턴스 사이의 중복 실행까지 막을 수 없으므로 마이그레이션과 Supabase 함수 노출 상태를 확인하세요.

## 선택 환경값

```text
CRON_RECURRING_LEASE_SECONDS=900
CRON_REPORT_LEASE_SECONDS=900
SETTLEMENT_LEASE_SECONDS=60
```

기본값을 먼저 사용하고 운영 처리 시간이 실제로 15분을 넘는 경우에만 Cron lease를 늘립니다. 최댓값은 3,600초입니다.

## 리포트 수동 테스트

`CRON_SECRET`을 설정한 뒤 아래 경로로 생성 결과를 확인합니다.

```text
/cron/reports/generate?key=YOUR_SECRET&force=1
```

## 재시도 확인

1. 첫 호출이 끝난 뒤 같은 정기거래 경로를 다시 호출합니다.
2. 두 번째 호출의 `applied`가 0이고 `failed`가 0인지 확인합니다.
3. 동시에 두 번 호출했을 때 한 응답은 `skipped_run: true`인지 확인합니다.
4. 잠금이 장시간 남으면 Supabase의 `accountbook_operation_locks`에서 `locked_until`과 최근 Worker 오류를 함께 확인합니다. 운영 중인 잠금 행을 임의 삭제하지 마세요.
