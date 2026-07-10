# Cloudflare Cron 설정

## 목적
정기지출을 매일 한 번 확인해서 해당 월에 아직 기록되지 않은 항목을 자동으로 저장합니다.

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
- 거래 source는 `recurring_auto`
- 정기지출 row의 `last_applied_month`로 월 1회 적용
- 같은 날짜/금액/분류/내용/결제수단의 recurring_auto 기록이 있으면 추가 저장하지 않습니다.
