# 운영 설정 이름 (Cloudflare Worker `kakao-accountbook`)

V22.9.76 작성(감사 G-15). 값은 적지 않는다. 이름과 빠졌을 때의 동작만 적는다. 바꿀 때는 Cloudflare 대시보드에서 바꾸고,
바꾼 뒤에는 배포 스크립트로 새 판을 올리기 전에 다시 업로드한다(업로드 뒤 Secret 을 바꾸면 승격이 거절된다, 감사 G-4).

## 필수 (없으면 `/ready` 503)

| 이름 | 쓰는 곳 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 모든 DB 요청 |
| `ADMIN_SESSION_SECRET` | 관리자 로그인 세션 서명 |
| `USER_SESSION_SECRET` | 사용자 로그인 세션 서명 |
| `ADMIN_API_TOKEN` | 관리자 API Bearer. **`/cron/*` 도 이 Bearer 로 통과한다** |
| `MY_IMPORT_TOKEN_SECRET` | 웹 가져오기 토큰 서명 |

목록의 정본은 `src/modules/runtime/config-readiness.js` 의 `REQUIRED_RUNTIME_CONFIG` 다.

## 카카오 스킬 호출자 인증

| 이름 | 동작 |
|---|---|
| `KAKAO_SKILL_SECRET` | OpenBuilder 가 보내는 `x-api-key`(또는 `x-kakao-skill-secret`, `Bearer`) 와 비교. 없으면 인증 꺼짐 |
| `KAKAO_SKILL_AUTH_REQUIRED` | `1` 이면 Secret 이 없을 때 `/ready` 503 이고, V22.9.76 부터 `/skill` 도 403 으로 막는다 |
| `KAKAO_SKILL_AUTH_MODE` | `observe` 면 틀린 헤더도 세기만 하고 통과(헤더를 맞추는 동안의 비상용). 켠 채 두지 않는다. 현재 값은 `/ready` 의 `skill_caller_auth.mode` |

## 카카오 로그인 (웹)

`KAKAO_LOGIN_ENABLED`, `KAKAO_REST_API_KEY`, `KAKAO_REDIRECT_URI`, `KAKAO_CLIENT_SECRET`, `KAKAO_CLIENT_SECRET_REQUIRED`.
상태는 관리자 운영 진단 화면(`src/modules/admin/ops-diagnostics-pages.js`)에 보인다.

## 예약 작업 (cron)

- 일정(Triggers)은 저장소가 아니라 Cloudflare 대시보드에 있다. 정기 항목 자동 기록과 월간 리포트 생성이 이 일정으로 돈다.
- 수동 실행 경로 `POST /cron/recurring/apply`, `POST /cron/reports/generate` 는 `CRON_SECRET`(`x-cron-secret` 또는 `Bearer`) 이나 `ADMIN_API_TOKEN` Bearer 로 통과한다.
- 임대 시간: `CRON_RECURRING_LEASE_SECONDS`, `CRON_REPORT_LEASE_SECONDS`(기본 900초).

## 관제

`OPS_MONITOR`(관제 Worker 서비스 연결), `OPS_MONITOR_TOKEN`(공유 Bearer), `OPS_MONITOR_PUBLIC_ORIGIN`(관제 화면 주소).
둘 중 하나라도 없으면 앱은 표본을 보내지 않고 그대로 동작한다. 관제 쪽 설정은 `monitoring/README.md`.

## 광고

`ADS_MODE` 는 정확히 `live` 일 때만 광고 코드를 넣고 그 밖에는 `review`. `ADS_SLOT_CONTENT` 는 숫자 8~12자리만 쓴다(`src/modules/public/site-config.js`).

## 주소

`PUBLIC_BASE_URL`, `CANONICAL_BASE_URL`, `CANONICAL_REDIRECT`, `APP_BASE_URL`, `SERVICE_BASE_URL`, `SUPPORT_EMAIL`·`PUBLIC_SUPPORT_EMAIL`.

## 조정용 (없으면 코드 기본값)

요청 제한 `SKILL_RATE_LIMIT`·`SKILL_RATE_WINDOW_MS`·`SKILL_IP_GUARD_LIMIT`·`TRAFFIC_GUARD_LIMIT`·`TRAFFIC_GUARD_WINDOW_MS`·`AUTH_RATE_LIMIT`·`AUTH_ACCOUNT_RATE_LIMIT`,
카카오 `KAKAO_BULK_LIMIT`·`KAKAO_RESPONSE_BUDGET_MS`·`KAKAO_RETRY_DEDUP_SECONDS`·`KAKAO_REPEAT_GUARD_SECONDS`·`DUPLICATE_GUARD_SECONDS`·`KAKAO_DEFAULT_HOUSEHOLD_ID`,
DB `SUPABASE_READ_ATTEMPT_MS`·`SUPABASE_WRITE_TIMEOUT_MS`, 가져오기 `MY_IMPORT_LIMIT`·`MY_IMPORT_MAX_BYTES`, 자산 `PAYMENT_ASSET_LEASE_SECONDS`,
NLU 기록 `NLU_*`. 전체 목록은 `grep -rhoE "env[.?]+[A-Z][A-Z0-9_]+" src/modules | sort -u` 로 본다.
